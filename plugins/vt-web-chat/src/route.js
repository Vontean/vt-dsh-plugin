/**
 * `/webchat` 的全部 HTTP 面。
 *
 * 三类请求，边界各不相同：
 *   1. 静态资源（前端产物）—— 公开。里面没有任何用户数据，历史存在浏览器 IndexedDB。
 *   2. 设置接口 —— 需要 DSH 准入，只读写保留策略。
 *   3. 上游代理 —— 需要 DSH 准入，会花账号额度，必须由 Host 注入凭据。
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeGet } from './auth.js';
import { injectBootstrap } from './maintenance.js';
import { proxyRequest, writeJson } from './proxy.js';
import { readSettings, writeSettings } from './settings.js';

/** 插件路由前缀；前端构建时也用它作为 apiOrigin。 */
const ROUTE_PREFIX = '/webchat';

/** 前端产物目录。 */
const DIST = fileURLToPath(new URL('../webview/dist/', import.meta.url));

/** 产物里出现的扩展名；没列到的按二进制下发。 */
const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
});

/** 会被改写的入口页。 */
const INDEX_FILE = 'index.html';

/**
 * 面板能力令牌：进程级随机值，随入口页下发给面板。
 *
 * 为什么需要它：面板是 iframe，宿主是浏览器还是桌面壳、有没有浏览器 Cookie、
 * 算不算 cross-site，都会让 DSH 的请求栅栏给出不同结论。与其逐种情况放宽，
 * 不如让入口页在渲染时下发一个不可猜的令牌，面板把它带在每个请求上。
 * 静态产物本身公开，但跨源页面读不到响应正文，所以拿不到令牌。
 */
const CAPABILITY = randomUUID();

/** 令牌请求头。 */
const CAPABILITY_HEADER = 'x-vtwc-cap';

/**
 * 判断请求是否来自可信的 DSH 客户端。
 *
 * 插件路由不在 DSH 的 `/api` 信任栅栏内，必须自己问一次 Connection；
 * 桌面壳的渲染进程用 `dsh-app:` 协议，不带浏览器 Cookie，直接放行。
 * @param ctx - Host 插件上下文。
 * @param req - Node 请求。
 * @returns 是否放行。
 */
function admitted(ctx, req) {
  const origin = String(req.headers?.origin ?? '');
  if (origin.startsWith('dsh-app:')) return true;

  // 能力令牌：只认回环来源，且 Origin 必须为空或与 Host 同authority。
  if (String(req.headers?.[CAPABILITY_HEADER] ?? '') === CAPABILITY && fromLoopback(req) && sameOrigin(req)) {
    return true;
  }

  const connection = safeGet(ctx, 'connection');
  if (connection === undefined || typeof connection.requestRejection !== 'function') return true;
  try {
    const rejection = connection.requestRejection(req);
    // `requestRejection` 是两段判断：先过 Host/Origin 栅栏（不过给 403），
    // 再要求浏览器会话 Cookie（缺失给 401）。
    // 桌面壳的渲染进程走 IPC 而不走 Cookie，它的合法请求恰好是 401。
    return rejection === undefined || rejection === 401;
  } catch {
    return false;
  }
}

/**
 * 请求是否来自本机回环。
 * @param req - Node 请求。
 * @returns 是否为回环地址。
 */
function fromLoopback(req) {
  const address = req.socket?.remoteAddress ?? '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

/**
 * Origin 是否为空或与 Host 一致。
 * @param req - Node 请求。
 * @returns 是否同源。
 */
function sameOrigin(req) {
  const origin = req.headers?.origin;
  if (typeof origin !== 'string' || origin.length === 0) return true;
  try {
    return new URL(origin).host === String(req.headers?.host ?? '');
  } catch {
    return false;
  }
}

/**
 * 读取请求体并解析 JSON。
 * @param req - Node 请求。
 * @returns 解析后的对象；空体给空对象。
 */
async function readJson(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 64 * 1024) throw new Error('请求体过大');
    chunks.push(chunk);
  }
  if (total === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/**
 * 把 URL 路径解析成产物目录内的文件。
 * @param relativePath - 去掉 `/webchat` 前缀后的路径。
 * @returns 绝对路径；试图越界时 undefined。
 */
function resolveStatic(relativePath) {
  const decoded = decodeURIComponent(relativePath === '/' ? `/${INDEX_FILE}` : relativePath);
  const target = path.resolve(DIST, `.${decoded.startsWith('/') ? '' : '/'}${decoded}`);
  const root = path.resolve(DIST);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) return undefined;
  return target;
}

/**
 * 下发一个文件；入口页先注入启动闸门。
 * @param req - Node 请求。
 * @param res - Node 响应。
 * @param file - 绝对路径。
 */
async function sendStatic(req, res, file) {
  let stat;
  try {
    stat = await fs.stat(file);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
    return;
  }
  if (!stat.isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
    return;
  }

  const isIndex = path.basename(file) === INDEX_FILE;
  const ext = path.extname(file).toLowerCase();
  const etag = `W/"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;

  if (!isIndex && req.headers['if-none-match'] === etag) {
    res.writeHead(304, { etag }).end();
    return;
  }

  let body = await fs.readFile(file);
  if (isIndex) {
    const { html } = injectBootstrap(body.toString('utf8'), CAPABILITY);
    // 入口页标题面向面板里的用户，不沿用上游的「API 使用 demo」。
    body = Buffer.from(
      html.replace(/<title>.*?<\/title>/iu, '<title>DeepSeek Chat</title>'),
      'utf8',
    );
  }

  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'content-length': body.length,
    // 入口页内嵌了能力令牌，按进程变化：绝不能被缓存复用，否则刷新后令牌就对不上了。
    'cache-control': isIndex ? 'no-store' : 'no-cache',
    ...(isIndex ? {} : { etag }),
  });
  res.end(body);
}

/**
 * 自检：产物、设置、凭据三条链路各自给出结论。
 * @param ctx - Host 插件上下文。
 * @returns 自检结果。
 */
async function selfTest(ctx) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });

  try {
    const index = await fs.readFile(path.join(DIST, INDEX_FILE), 'utf8');
    const entry = /src="([^"]+\.js)"/u.exec(index)?.[1];
    add('index', entry !== undefined, entry ?? '没有入口脚本');
    if (entry !== undefined) {
      add('entry', fsSync.existsSync(path.join(DIST, entry)), entry);
    }
  } catch (error) {
    add('index', false, error instanceof Error ? error.message : String(error));
  }

  const settings = await readSettings();
  add('settings', true, `retentionDays=${settings.retentionDays}`);

  const account = safeGet(ctx, 'deepseekAccount');
  const credentials = safeGet(ctx, 'credentials');
  add('account-service', account !== undefined, account === undefined ? '未挂载' : '可用');
  add('credentials-service', credentials !== undefined, credentials === undefined ? '未挂载' : '可用');

  return { ok: checks.every((check) => check.ok), checks };
}

/**
 * 建立 `/webchat` 的请求处理器。
 * @param ctx - Host 插件上下文。
 * @returns Node 请求处理器。
 */
export function createHandler(ctx) {
  return async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const { pathname, search } = url;
    const method = (req.method ?? 'GET').toUpperCase();
    const isRead = method === 'GET' || method === 'HEAD';

    // 相对路径的资源要靠这个斜杠才能解析到 /webchat/ 下。
    if (pathname === ROUTE_PREFIX) {
      res.writeHead(301, { location: `${ROUTE_PREFIX}/${search}` }).end();
      return;
    }
    if (!pathname.startsWith(`${ROUTE_PREFIX}/`)) {
      writeJson(res, 404, { error: 'not found' });
      return;
    }

    const rest = pathname.slice(ROUTE_PREFIX.length);

    // ---- 设置：只读写保留策略 ----
    if (rest === '/api/settings') {
      if (!admitted(ctx, req)) {
        writeJson(res, 403, { error: '请求来源不受信任' });
        return;
      }
      if (isRead) {
        writeJson(res, 200, await readSettings());
        return;
      }
      if (method === 'POST') {
        try {
          const input = await readJson(req);
          writeJson(res, 200, await writeSettings(input));
        } catch (error) {
          writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }
      writeJson(res, 405, { error: 'method not allowed' });
      return;
    }

    // ---- 自检 ----
    if (rest === '/api/self-test' && isRead) {
      if (!admitted(ctx, req)) {
        writeJson(res, 403, { error: '请求来源不受信任' });
        return;
      }
      writeJson(res, 200, await selfTest(ctx));
      return;
    }

    // ---- 上游代理：三条前缀都是会花额度的路径 ----
    const proxied = rest.startsWith('/anthropic/') || rest === '/models' || rest.startsWith('/v1/tools/');
    if (proxied) {
      if (!admitted(ctx, req)) {
        writeJson(res, 403, { error: '请求来源不受信任' });
        return;
      }
      await proxyRequest(ctx, req, res, { pathname, search });
      return;
    }

    // ---- 静态产物 ----
    if (!isRead) {
      res.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    const file = resolveStatic(rest);
    if (file === undefined) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end('forbidden');
      return;
    }
    await sendStatic(req, res, file);
  };
}

export { ROUTE_PREFIX, DIST };
