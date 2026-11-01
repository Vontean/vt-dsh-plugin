/**
 * dsh-vt-quote-bar — Host half.
 *
 * 为什么需要 Host 半侧：浏览器侧拿不到 API Key，也不应该拿到；这里读取
 * provider 目录、解析凭证、请求 DeepSeek/OpenCode，并只把脱敏后的余额或
 * 百分比通过同源路由交给侧边栏组件。
 *
 * 安全边界：
 *   · Key 只在 Host 内使用，响应体里不出现 Key、请求头或上游原始内容；
 *   · 上游地址是代码里的固定 HTTPS 常量，请求体不接受任意 URL；
 *   · 每个请求都过 `ctx.connection.requestRejection`，与 /api 同一套判定；
 *   · 响应体有大小上限，避免异常上游把内存交给调用方。
 */

import { randomUUID } from 'node:crypto';
import {
  normalizeAccountBalance,
  normalizeDeepSeekBalance,
  normalizeOpenCodeUsage,
} from './lib/normalize.js';

/** 插件标识（与 package.json 的 name 一致）。 */
export const name = 'dsh-vt-quote-bar';

/** webServer 提供路由；llm 提供 provider 目录。两者都是硬依赖。 */
export const inject = ['webServer', 'llm'];

/** 客户端拼 `vt-quote-bar/api/<method>`。 */
const ROUTE_PREFIX = '/vt-quote-bar/api';

/** 请求体上限：客户端只发 provider / fresh / locale 三个字段。 */
const MAX_BODY_BYTES = 64 * 1024;

/** 上游响应上限：余额和三个百分比都远小于这个值。 */
const MAX_UPSTREAM_BYTES = 64 * 1024;

/** 单次上游请求超时。 */
const REQUEST_TIMEOUT_MS = 10_000;

/** Host 缓存时间；手动刷新可绕过。 */
const CACHE_TTL_MS = 60_000;

/** 客户端轮询间隔；也通过 providers 响应下发，避免两边写死不同值。 */
const REFRESH_INTERVAL_MS = 60_000;

/** 上游要求客户端标识自己，不要用通用 HTTP 库 UA。 */
const USER_AGENT = 'dsh-vt-quote-bar/1.0.0';

/** DeepSeek 官方余额接口。 */
const DEEPSEEK_BALANCE_URL = 'https://api.deepseek.com/user/balance';

/** OpenCode Go 官方 usage 接口。 */
const OPENCODE_USAGE_URL = 'https://opencode.ai/zen/go/v1/usage';

/**
 * 支持的 provider。顺序就是切换器里的顺序。
 * 账号与 API Key 都走「余额」；opencode-go 走三个额度窗口。
 */
const SUPPORTED_PROVIDERS = [
  {
    id: 'deepseek-account',
    kind: 'balance',
    defaultLabel: 'DeepSeek Account',
  },
  {
    id: 'deepseek-official',
    kind: 'balance',
    defaultLabel: 'DeepSeek',
    credentialRef: 'DEEPSEEK_API_KEY',
  },
  {
    id: 'opencode-go',
    kind: 'windows',
    defaultLabel: 'opencode-go',
    credentialRef: 'OPENCODE_GO_API_KEY',
  },
];

/** 上游要求 x-opencode-session；没有配置时进程内复用一个稳定 UUID。 */
const FALLBACK_OPEN_CODE_SESSION = randomUUID();

/** 带稳定错误码的 API 错误。 */
class ApiError extends Error {
  /**
   * @param {string} code 稳定错误码。
   * @param {string} message 面向用户的中文说明。
   * @param {number} [status] HTTP 状态；预期内的 provider 错误用 200。
   */
  constructor(code, message, status = 200) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * 读取一个嵌套字段。
 * @param {unknown} value 根对象。
 * @param {readonly string[] | undefined} path 路径。
 * @returns {unknown}
 */
function getPath(value, path) {
  let current = value;
  for (const segment of Array.isArray(path) ? path : []) {
    if (current === null || typeof current !== 'object') return undefined;
    current = current[segment];
  }
  return current;
}

/**
 * 读取 provider 目录。
 * @param {import('@deepseek-ai/cordis').Context} ctx Host 上下文。
 * @returns {{active: Map<string, {id: string, name?: string}>, configurable: Map<string, object>}}
 */
function providerDirectory(ctx) {
  const active = new Map();
  try {
    for (const provider of ctx.llm.listProviders()) active.set(provider.id, provider);
  } catch {
    /* 目录读取失败时当作没有活动路由。 */
  }
  const configurable = new Map();
  try {
    for (const provider of ctx.llm.listConfigurableProviders()) configurable.set(provider.provider, provider);
  } catch {
    /* 同上。 */
  }
  return { active, configurable };
}

/**
 * 读取某个 settings 命名空间的当前值。
 * @param {import('@deepseek-ai/cordis').Context} ctx Host 上下文。
 * @param {string | undefined} ns 命名空间。
 * @returns {unknown}
 */
function readSettingsValue(ctx, ns) {
  const settings = ctx.get('settings');
  if (!settings || typeof settings.describe !== 'function' || typeof ns !== 'string' || ns === '') return undefined;
  try {
    const descriptors = settings.describe();
    if (!Array.isArray(descriptors)) return undefined;
    return descriptors.find((descriptor) => String(descriptor.ns) === ns)?.value;
  } catch {
    return undefined;
  }
}

/**
 * 从 settings 中读出某个 provider 的 profile（apiKeyEnv / headers / baseURL）。
 * @param {import('@deepseek-ai/cordis').Context} ctx Host 上下文。
 * @param {Map<string, object>} configurable provider 目录。
 * @param {string} providerId provider 路由名。
 * @returns {{apiKeyEnv?: string, headers?: Record<string, unknown>, baseURL?: string}}
 */
function providerProfile(ctx, configurable, providerId) {
  const entry = configurable.get(providerId);
  if (!entry) return {};
  const value = readSettingsValue(ctx, entry.settingsNs);
  let profile = getPath(value, entry.settingsPath);
  if (profile === null || typeof profile !== 'object') {
    // 少数版本的目录不带 settingsPath；回退到 llm-pi-ai 的 providers 字典。
    if (value !== null && typeof value === 'object' && value.providers !== null && typeof value.providers === 'object') {
      profile = value.providers[providerId];
    }
  }
  const normalized = profile !== null && typeof profile === 'object' ? profile : {};
  return {
    apiKeyEnv:
      typeof normalized.apiKeyEnv === 'string' && normalized.apiKeyEnv.trim() !== ''
        ? normalized.apiKeyEnv.trim()
        : undefined,
    headers:
      normalized.headers !== null && typeof normalized.headers === 'object' ? normalized.headers : undefined,
    baseURL: typeof normalized.baseURL === 'string' ? normalized.baseURL : undefined,
  };
}

/**
 * 判断一个凭证引用是否已配置，不读取值。
 * @param {import('@deepseek-ai/cordis').Context} ctx Host 上下文。
 * @param {string | undefined} ref 凭证引用。
 * @returns {Promise<boolean>}
 */
async function isCredentialConfigured(ctx, ref) {
  if (typeof ref !== 'string' || ref === '') return false;
  const credentials = ctx.get('credentials');
  if (credentials && typeof credentials.describe === 'function') {
    try {
      const info = await credentials.describe(ref);
      return info?.configured === true;
    } catch {
      /* 交给环境变量回退。 */
    }
  }
  return typeof process.env[ref] === 'string' && process.env[ref].trim() !== '';
}

/**
 * 解析凭证值；只在 Host 内部使用。
 * @param {import('@deepseek-ai/cordis').Context} ctx Host 上下文。
 * @param {string | undefined} ref 凭证引用。
 * @returns {Promise<string | undefined>}
 */
async function resolveCredential(ctx, ref) {
  if (typeof ref !== 'string' || ref === '') return undefined;
  const credentials = ctx.get('credentials');
  if (credentials && typeof credentials.resolve === 'function') {
    try {
      const resolved = await credentials.resolve(ref);
      if (resolved && typeof resolved.value === 'string' && resolved.value !== '') return resolved.value;
    } catch {
      /* 交给环境变量回退。 */
    }
  }
  const env = process.env[ref];
  return typeof env === 'string' && env.trim() !== '' ? env.trim() : undefined;
}

/**
 * 读取指定大小的上游文本。
 * @param {Response} response fetch 响应。
 * @param {number} limit 字节上限。
 * @returns {Promise<string>}
 */
async function readLimitedText(response, limit) {
  const body = response.body;
  if (body === null || body === undefined) return '';
  const reader = body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        try {
          await reader.cancel();
        } catch {
          /* 已取消。 */
        }
        throw new ApiError('bad-response', '上游响应过大');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* 已释放。 */
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * 发起一次上游请求并解析 JSON。
 * @param {string} url 固定 HTTPS 地址。
 * @param {RequestInit} init fetch 参数。
 * @returns {Promise<{response: Response, json: unknown}>}
 */
async function fetchJson(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, redirect: 'error' });
    const text = await readLimitedText(response, MAX_UPSTREAM_BYTES);
    let json = null;
    if (text.trim() !== '') {
      // 故意容忍非 JSON：DeepSeek 的 401 是纯文本，必须先看状态码再判断响应体。
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return { response, json };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === 'AbortError') throw new ApiError('timeout', '请求超时');
    throw new ApiError('network', '网络不可用');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 查 DeepSeek API Key 的余额。
 * @param {string} key API Key。
 * @returns {Promise<object>}
 */
async function fetchDeepSeekBalance(key) {
  const { response, json } = await fetchJson(DEEPSEEK_BALANCE_URL, {
    headers: {
      authorization: `Bearer ${key}`,
      accept: 'application/json',
      'user-agent': USER_AGENT,
    },
  });
  if (response.status === 401 || response.status === 403) throw new ApiError('auth', '密钥无效');
  if (response.status === 429) throw new ApiError('rate-limited', '请求过于频繁');
  if (!response.ok) throw new ApiError('upstream', `余额接口返回 ${response.status}`);
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    throw new ApiError('bad-response', '余额响应为空');
  }
  return normalizeDeepSeekBalance(json);
}

/**
 * 大小写不敏感地读取一个 header 配置值。
 * @param {Record<string, unknown> | undefined} headers provider 配置头。
 * @param {string} name header 名。
 * @returns {string | undefined}
 */
function headerValue(headers, name) {
  if (headers === null || typeof headers !== 'object') return undefined;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== target) continue;
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return undefined;
}

/**
 * 查 OpenCode Go 的三个额度窗口。
 * @param {string} key API Key。
 * @param {{headers?: Record<string, unknown>}} profile provider 配置。
 * @returns {Promise<object>}
 */
async function fetchOpenCodeUsage(key, profile) {
  const session = headerValue(profile?.headers, 'x-opencode-session') ?? FALLBACK_OPEN_CODE_SESSION;
  const { response, json } = await fetchJson(OPENCODE_USAGE_URL, {
    headers: {
      authorization: `Bearer ${key}`,
      accept: 'application/json',
      'user-agent': USER_AGENT,
      'x-opencode-session': session,
    },
  });
  if (response.status === 401) throw new ApiError('auth', '密钥无效');
  if (response.status === 403) throw new ApiError('no-subscription', '未订阅 Go');
  if (response.status === 404) throw new ApiError('unsupported', '额度接口不可用');
  if (response.status === 429) throw new ApiError('rate-limited', '请求过于频繁');
  if (!response.ok) throw new ApiError('upstream', `额度接口返回 ${response.status}`);
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    throw new ApiError('bad-response', '额度响应为空');
  }
  const normalized = normalizeOpenCodeUsage(json);
  if (normalized === null) throw new ApiError('bad-response', '额度数据异常');
  return normalized;
}

/**
 * 通过 Host 的账号服务读取 DeepSeek 账号余额。
 * @param {import('@deepseek-ai/cordis').Context} ctx Host 上下文。
 * @param {string | undefined} locale 请求语言。
 * @returns {Promise<object>}
 */
async function fetchAccountBalance(ctx, locale) {
  const account = ctx.get('deepseekAccount');
  if (!account) throw new ApiError('unsupported', '账号服务不可用');

  let state;
  try {
    state = await account.getState();
  } catch {
    throw new ApiError('upstream', '账号状态读取失败');
  }
  if (state?.status !== 'credential-stored') throw new ApiError('signed-out', '未登录');

  const metadata = {
    version: '0.2.1',
    locale: locale === 'en' ? 'en' : 'zh',
    timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
  };
  let balance;
  try {
    balance = await account.getBalance(metadata);
  } catch {
    throw new ApiError('upstream', '余额读取失败');
  }
  if (!balance || balance.status !== 'ready') throw new ApiError('upstream', '余额读取失败');
  return normalizeAccountBalance(balance.value, balance.bonusWallets);
}

/**
 * 列出当前可显示的 provider，并给出默认选择。
 * @param {import('@deepseek-ai/cordis').Context} ctx Host 上下文。
 * @returns {Promise<object>}
 */
async function buildProviders(ctx) {
  const directory = providerDirectory(ctx);
  const rows = [];

  for (const definition of SUPPORTED_PROVIDERS) {
    const active = directory.active.get(definition.id);
    const configurable = directory.configurable.get(definition.id);
    const account = definition.id === 'deepseek-account' ? ctx.get('deepseekAccount') : undefined;
    if (!active && !configurable && !account) continue;

    let configured = false;
    let status = 'unavailable';

    if (definition.id === 'deepseek-account') {
      if (account) {
        try {
          const state = await account.getState();
          configured = state?.status === 'credential-stored';
          status = configured ? 'ready' : 'signed-out';
        } catch {
          status = 'unavailable';
        }
      }
    } else {
      const profile = providerProfile(ctx, directory.configurable, definition.id);
      configured = await isCredentialConfigured(ctx, profile.apiKeyEnv ?? definition.credentialRef);
      status = configured ? 'ready' : 'missing-key';
    }

    rows.push({
      id: definition.id,
      displayName: configurable?.displayName || active?.name || definition.defaultLabel,
      kind: definition.kind,
      configured,
      status,
    });
  }

  let defaultProviderId = rows[0]?.id ?? null;
  try {
    const selection = ctx.get('agentDefaultModel')?.currentSelection?.();
    if (selection?.provider && rows.some((row) => row.id === selection.provider)) {
      defaultProviderId = selection.provider;
    }
  } catch {
    /* 默认模型服务不可用时用第一个。 */
  }

  return {
    providers: rows,
    defaultProviderId,
    refreshIntervalMs: REFRESH_INTERVAL_MS,
  };
}

/**
 * 读取一个 provider 的额度，带 60 秒缓存和并发合并。
 * @param {import('@deepseek-ai/cordis').Context} ctx Host 上下文。
 * @param {{cache: Map<string, {at: number, value: object}>, inFlight: Map<string, Promise<object>>}} state 插件级缓存。
 * @param {string} providerId provider 路由名。
 * @param {boolean} fresh 是否绕过缓存。
 * @param {string | undefined} locale 请求语言。
 * @returns {Promise<object>}
 */
async function resolveQuota(ctx, state, providerId, fresh, locale) {
  const definition = SUPPORTED_PROVIDERS.find((entry) => entry.id === providerId);
  if (!definition) throw new ApiError('bad-provider', '未知的提供商', 400);

  if (!fresh) {
    const cached = state.cache.get(providerId);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  }

  const existing = state.inFlight.get(providerId);
  if (existing) return existing;

  const promise = (async () => {
    const directory = providerDirectory(ctx);
    let value;

    if (definition.id === 'deepseek-account') {
      value = await fetchAccountBalance(ctx, locale);
    } else {
      const profile = providerProfile(ctx, directory.configurable, definition.id);
      const key = await resolveCredential(ctx, profile.apiKeyEnv ?? definition.credentialRef);
      if (!key) throw new ApiError('no-key', '未配置 API Key');
      if (definition.id === 'deepseek-official') value = await fetchDeepSeekBalance(key);
      else value = await fetchOpenCodeUsage(key, profile);
    }

    value.provider = definition.id;
    value.fetchedAt = new Date().toISOString();
    state.cache.set(providerId, { at: Date.now(), value });
    return value;
  })().finally(() => {
    state.inFlight.delete(providerId);
  });

  state.inFlight.set(providerId, promise);
  return promise;
}

/**
 * 有界读取 JSON 请求体。
 * @param {import('node:http').IncomingMessage} req 请求。
 * @returns {Promise<Record<string, unknown>>}
 */
async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new ApiError('body-too-large', '请求体超过上限', 400);
    chunks.push(chunk);
  }
  if (total === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed !== null && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new ApiError('bad-json', '请求体不是合法 JSON', 400);
  }
}

/**
 * 写 JSON 响应。
 * @param {import('node:http').ServerResponse} res 响应。
 * @param {number} status HTTP 状态。
 * @param {unknown} payload 响应体。
 */
function writeJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * 处理一个插件 API 请求。
 * @param {import('@deepseek-ai/cordis').Context} ctx Host 上下文。
 * @param {import('node:http').IncomingMessage} req 请求。
 * @param {import('node:http').ServerResponse} res 响应。
 * @param {Record<string, (body: Record<string, unknown>) => Promise<unknown>>} api 方法表。
 */
async function handleRequest(ctx, req, res, api) {
  let admitted = true;
  try {
    const connection = ctx.get('connection');
    admitted =
      connection === undefined || connection === null
        ? true
        : connection.requestRejection(req) === undefined;
  } catch {
    admitted = false;
  }
  if (!admitted) {
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
  if (!handler) {
    writeJson(res, 404, { ok: false, error: { code: 'not-found', message: `未知方法：${method}` } });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const value = await handler(body);
    writeJson(res, 200, { ok: true, value });
  } catch (error) {
    const code = error instanceof ApiError ? error.code : 'internal';
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    writeJson(res, status, { ok: false, error: { code, message } });
  }
}

/**
 * Host 插件入口。
 * @param {import('@deepseek-ai/cordis').Context} ctx Host 上下文。
 */
export function apply(ctx) {
  const state = { cache: new Map(), inFlight: new Map() };

  const api = {
    /** 列出可用 provider 和默认选择。 */
    async providers() {
      return buildProviders(ctx);
    },
    /** 读取一个 provider 的余额/额度。 */
    async quota(body) {
      const provider = typeof body.provider === 'string' ? body.provider : '';
      const fresh = body.fresh === true;
      const locale = body.locale === 'en' ? 'en' : 'zh';
      return resolveQuota(ctx, state, provider, fresh, locale);
    },
  };

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: (req, res) => handleRequest(ctx, req, res, api),
      }),
    'vt-quote-bar: quota routes',
  );

  ctx.effect(() => {
    return () => {
      state.cache.clear();
      state.inFlight.clear();
    };
  }, 'vt-quote-bar: quota cache');
}
