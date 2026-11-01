/**
 * Host 半侧：为「设置 → AGENTS.md 指令」页面提供读写全局指令文件的 HTTP 路由。
 *
 * 为什么需要 Host 半侧：浏览器侧的插件不能直接读写宿主文件系统。DSH 的
 * Remote 命名空间由内置包生成，第三方纯 JS 插件不参与代码生成，因此这里用
 * `ctx.webServer` 注册自己的同源路由，客户端用相对 URL fetch，和
 * dsh-better-sidebar 等已有插件是同一套做法。
 *
 * 安全边界：
 *   · 路由只认两个固定目标文件，请求体里不接受任意路径，因此没有目录穿越面；
 *   · 每个请求都过 `ctx.connection.requestRejection(req)`，与 /api 网关同一套
 *     Host/Origin 与浏览器鉴权判定；
 *   · 写入先落临时文件再 rename，避免进程中断留下半个文件。
 */

import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';

/** 插件标识（与 package.json 的 name 一致）。 */
export const name = 'dsh-vt-system-prompt';

/** 在服务就绪后再挂载：webServer 是硬依赖，connection 缺失时按本地可信处理。 */
export const inject = ['webServer'];

/** 路由前缀，客户端拼 `vt-system-prompt/api/<method>`。 */
const ROUTE_PREFIX = '/vt-system-prompt/api';

/** 单个指令文件的大小上限，超过即拒绝读取/保存，避免把巨量文本塞进浏览器。 */
const MAX_FILE_BYTES = 1024 * 1024;

/** 请求体上限：内容本身有上限，再留一点 JSON 转义与信封余量。 */
const MAX_BODY_BYTES = MAX_FILE_BYTES * 2 + 64 * 1024;

/**
 * 两个用户全局指令根，和 `@deepseek-ai/dsh-agent-instructions` 的加载顺序一致：
 * 先 `$DSH_HOME/AGENTS.md`，再 `$DSH_AGENTS_HOME/AGENTS.md`。
 * 环境变量缺失时回落到默认 home 目录。
 */
const TARGETS = [
  { id: 'harness', env: 'DSH_HOME', dir: '.dsh', file: 'AGENTS.md' },
  { id: 'shared', env: 'DSH_AGENTS_HOME', dir: '.agents', file: 'AGENTS.md' },
];

/** 收窄到允许编辑的目标；未知 id 直接判为请求错误。 */
function resolveTarget(id) {
  const spec = TARGETS.find((candidate) => candidate.id === id);
  if (spec === undefined) return undefined;
  const configured = process.env[spec.env]?.trim();
  const root = configured !== undefined && configured !== '' ? configured : path.join(homedir(), spec.dir);
  return { id: spec.id, path: path.join(root, spec.file) };
}

/** 展示用的路径：home 前缀折叠成 `~`，与宿主其他地方一致。 */
function displayPath(absolute) {
  const home = homedir();
  if (absolute === home) return '~';
  if (absolute.startsWith(`${home}${path.sep}`)) return `~${absolute.slice(home.length)}`;
  return absolute;
}

/** 文件当前状态；不存在不算错误，交给客户端决定显示空编辑器还是新建。 */
async function readFileState(target) {
  let info;
  try {
    info = await stat(target.path);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        id: target.id,
        path: target.path,
        displayPath: displayPath(target.path),
        exists: false,
        content: '',
        mtimeMs: null,
        sizeBytes: 0,
        maxBytes: MAX_FILE_BYTES,
      };
    }
    throw error;
  }

  if (!info.isFile()) {
    throw apiError('not-a-file', `目标不是普通文件：${displayPath(target.path)}`);
  }
  if (info.size > MAX_FILE_BYTES) {
    throw apiError(
      'too-large',
      `文件有 ${info.size} 字节，超过 ${MAX_FILE_BYTES} 字节上限，请改用编辑器直接修改。`,
    );
  }

  return {
    id: target.id,
    path: target.path,
    displayPath: displayPath(target.path),
    exists: true,
    content: await readFile(target.path, 'utf8'),
    mtimeMs: info.mtimeMs,
    sizeBytes: info.size,
    maxBytes: MAX_FILE_BYTES,
  };
}

/**
 * 保存内容。
 *
 * `expectedMtimeMs` 是客户端载入时看到的版本号：不匹配说明文件在别处被改过
 * （例如另一个会话里 agent 写了它），此时拒绝写入并回报当前版本，避免静默覆盖。
 * 传 null 表示「我看到的文件不存在」，因此文件此刻已存在同样算冲突。
 */
async function saveFileState(input) {
  const target = resolveTarget(input.target);
  if (target === undefined) throw apiError('bad-target', '未知的指令文件目标。');
  if (typeof input.content !== 'string') throw apiError('bad-content', 'content 必须是字符串。');

  const sizeBytes = Buffer.byteLength(input.content, 'utf8');
  if (sizeBytes > MAX_FILE_BYTES) {
    throw apiError('too-large', `内容有 ${sizeBytes} 字节，超过 ${MAX_FILE_BYTES} 字节上限。`);
  }

  let currentMtimeMs = null;
  try {
    const info = await stat(target.path);
    if (!info.isFile()) throw apiError('not-a-file', `目标不是普通文件：${displayPath(target.path)}`);
    currentMtimeMs = info.mtimeMs;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const expected = input.expectedMtimeMs ?? null;
  if (expected !== currentMtimeMs) {
    throw apiError(
      'conflict',
      `${displayPath(target.path)} 已在别处被修改，请重新载入后再保存。`,
      { currentMtimeMs },
    );
  }

  const dir = path.dirname(target.path);
  await mkdir(dir, { recursive: true });
  const temp = path.join(dir, `.${path.basename(target.path)}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`);
  try {
    await writeFile(temp, input.content, 'utf8');
    await rename(temp, target.path);
  } finally {
    await unlink(temp).catch(() => {});
  }

  return readFileState(target);
}

/** 统一错误形状：客户端按 code 决定提示文案。 */
function apiError(code, message, details) {
  const error = new Error(message);
  error.apiCode = code;
  error.apiDetails = details;
  return error;
}

function writeJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function writeOk(res, value) {
  writeJson(res, 200, { ok: true, value });
}

function writeError(res, error) {
  const status = error?.apiCode === 'conflict' ? 409 : error?.apiCode === 'bad-target' || error?.apiCode === 'bad-content' ? 400 : 500;
  writeJson(res, status, {
    ok: false,
    error: {
      code: error?.apiCode ?? 'internal',
      message: error instanceof Error ? error.message : String(error),
      details: error?.apiDetails ?? null,
    },
  });
}

/** 有界读取 JSON 请求体：超限直接拒绝，不把内存交给调用方。 */
async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw apiError('body-too-large', '请求体超过上限。');
    chunks.push(chunk);
  }
  if (total === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed !== null && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw apiError('bad-json', '请求体不是合法 JSON。');
  }
}

/**
 * 路由入口。
 *
 * 只接受 POST：读操作也走 POST，避免浏览器把 URL 当资源预取，也让所有请求都
 * 走同一条鉴权与错误路径。
 */
async function handle(req, res, api, admitted) {
  if (!admitted(req)) {
    writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: '当前连接无权访问本机插件路由。' } });
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST' });
    res.end();
    return;
  }

  const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname;
  const method = pathname.startsWith(`${ROUTE_PREFIX}/`) ? pathname.slice(ROUTE_PREFIX.length + 1) : '';
  const handler = method !== '' && Object.hasOwn(api, method) ? api[method] : undefined;
  if (handler === undefined) {
    writeJson(res, 404, { ok: false, error: { code: 'not-found', message: `未知方法：${method}` } });
    return;
  }

  try {
    const body = await readJsonBody(req);
    writeOk(res, await handler(body));
  } catch (error) {
    writeError(res, error);
  }
}

/**
 * @param ctx Host 插件上下文。
 */
export function apply(ctx) {
  const api = {
    /** 读取全部全局指令文件，客户端据此决定是否显示文件切换。 */
    async read() {
      const files = [];
      for (const spec of TARGETS) {
        const target = resolveTarget(spec.id);
        const state = await readFileState(target);
        // shared 根只在文件已存在时才出现，避免凭空多出一个空页签。
        if (state.id === 'shared' && !state.exists) continue;
        files.push(state);
      }
      return { files };
    },

    /** 保存一个目标文件并回报新版本。 */
    async save(input) {
      const file = await saveFileState(input);
      return { file };
    },
  };

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: (req, res) => {
          const connection = ctx.get('connection');
          const admitted = (request) =>
            connection === undefined || connection === null
              ? true
              : connection.requestRejection(request) === undefined;
          return handle(req, res, api, admitted);
        },
      }),
    'vt-system-prompt: instruction file routes',
  );
}
