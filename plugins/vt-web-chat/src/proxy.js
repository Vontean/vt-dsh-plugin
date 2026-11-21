/**
 * 把浏览器发到插件路由的请求转给 DeepSeek，并注入宿主凭据。
 *
 * 边界：浏览器只认识 `/webchat/<path>`，永远拿不到 token；
 * 上游地址由宿主拼回 `https://api.deepseek.com/<path>`。
 */
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DEEPSEEK_BASE_URL, resolveAuth } from './auth.js';

/** 不向上游转发的逐跳头。 */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  'cookie',
]);

/**
 * 把 Headers 之外的请求头收敛成可转发的普通对象。
 * @param req - Node 请求。
 * @returns 小写键名的新对象。
 */
function forwardableHeaders(req) {
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (HOP_BY_HOP.has(name) || value === undefined) continue;
    headers[name] = Array.isArray(value) ? value.join(', ') : value;
  }
  return headers;
}

/**
 * 转发一次请求。
 * @param ctx - Host 插件上下文。
 * @param req - Node 请求。
 * @param res - Node 响应。
 * @param options - `{ baseURL, pathname, search }`；pathname 含 `/webchat` 前缀。
 * @returns 无返回；响应已写回。
 */
export async function proxyRequest(ctx, req, res, { baseURL = DEEPSEEK_BASE_URL, pathname, search = '' }) {
  const auth = await resolveAuth(ctx, baseURL);
  if (auth === undefined) {
    writeJson(res, 401, {
      type: 'error',
      error: {
        type: 'authentication_error',
        message:
          '当前 DSH 没有可用的 DeepSeek 凭据：请先登录 DeepSeek 账户，或在「设置 → 模型」里配置 DeepSeek API Key。',
      },
    });
    return;
  }

  const upstreamPath = pathname.slice('/webchat'.length) || '/';
  const target = `${baseURL.replace(/\/+$/u, '')}${upstreamPath}${search}`;
  const method = (req.method ?? 'GET').toUpperCase();

  // 聊天的 SSE 会持续很久；客户端离开面板时必须一起取消，否则请求会挂在上游。
  const controller = new AbortController();
  const onClose = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on('close', onClose);

  const headers = {
    'anthropic-version': '2023-06-01',
    'anthropic-beta': typeof req.headers['anthropic-beta'] === 'string' ? req.headers['anthropic-beta'] : 'files-api-2025-04-14',
    ...forwardableHeaders(req),
    ...auth.headers,
  };
  if (headers.accept === undefined) headers.accept = 'text/event-stream';
  // SSE 必须逐块到达浏览器；请求上游压缩会让整段响应被攒起来，还容易和头部转发脱节。
  headers['accept-encoding'] = 'identity';

  const init = { method, headers, signal: controller.signal };
  if (method !== 'GET' && method !== 'HEAD') {
    // 文件上传是 multipart，可能是几十 MB：直接流式转发，不读进内存。
    init.body = Readable.toWeb(req);
    init.duplex = 'half';
  }

  let upstream;
  try {
    upstream = await fetch(target, init);
  } catch (error) {
    if (controller.signal.aborted) return;
    writeJson(res, 502, {
      type: 'error',
      error: { type: 'api_error', message: `无法连接 DeepSeek：${error instanceof Error ? error.message : String(error)}` },
    });
    return;
  }

  const responseHeaders = {
    'cache-control': 'no-store',
    'x-accel-buffering': 'no',
  };
  const contentType = upstream.headers.get('content-type');
  if (contentType !== null) responseHeaders['content-type'] = contentType;
  // 万一上游无视 identity 仍然压缩，编码头必须一起转发，否则浏览器拿到的是二进制。
  const encoding = upstream.headers.get('content-encoding');
  if (encoding !== null) responseHeaders['content-encoding'] = encoding;
  res.writeHead(upstream.status, responseHeaders);

  if (upstream.body === null || method === 'HEAD') {
    res.end();
    return;
  }
  try {
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch {
    // 客户端中途关闭：上游已被 abort，这里只需收掉响应。
    if (!res.writableEnded) res.destroy();
  }
}

/**
 * 写一个 JSON 响应。
 * @param res - Node 响应。
 * @param status - HTTP 状态码。
 * @param value - 可序列化对象。
 */
export function writeJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}
