/**
 * dsh-vt-quick-chat — Host half.
 *
 * 这个插件解决的问题：agent 正在跑任务时，用户常遇到一个不懂的词，但不想打断
 * 主对话、也不想为一句解释新建 Session。Client 半边弹出一个临时小窗，Host 半边
 * 把这段临时对话翻译成一次模型调用，并以 SSE 流式回给浏览器。
 *
 * 两条通道，按顺序降级：
 *   1. `deepseek`：直连 DeepSeek 全家桶 Messages API，模型 `deepseek-flash`。
 *      凭证优先用 DeepSeek 账号授权（`deepseekAccount.resolveToken`），其次用
 *      `DEEPSEEK_API_KEY`。开启「联网」时声明 `deepseek_web_search` 与
 *      `deepseek_read_url` 两个服务端工具，行为与 DeepSeek 网页端一致：搜索、
 *      打开网页、阅读链接都在服务端完成，客户端不执行任何工具。
 *   2. `default`：DeepSeek 凭证不可用时，退回 DSH 默认模型走 `ctx.llm.stream()`，
 *      此时没有联网能力，小窗照常可用。
 *
 * 为什么必须有 Host 半边：模型调用要经过凭证、取消语义与请求整形，这些只能在
 * Host 进程里完成。浏览器侧只拿同源路由的流式文本，看不到 token 或 API Key。
 *
 * 关键边界（与 README / DESIGN 一致）：
 *   · 不传 `sessionId`、不经过 agent loop、不注册任何工具 → 不创建 Session、
 *     不写 session log、不进入侧栏；
 *   · 只接受白名单字段（messages / selection / web），不接受任意 provider、
 *     model、URL、文件路径或工具名；
 *   · 每个请求都过 `connection.requestRejection`，与 DSH `/api` 同一套鉴权；
 *   · 请求体有上限，消息条数、单条长度、服务端工具块大小都截断。
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

/** 插件标识（与 package.json 的 name 一致）。 */
export const name = 'dsh-vt-quick-chat';

/** webServer 是硬依赖；llm / deepseekAccount / credentials 在请求时软取。 */
export const inject = ['webServer'];

/** 路由前缀，客户端拼 `/vt-quick-chat/api/chat`。 */
const ROUTE_PREFIX = '/vt-quick-chat/api';

/** 请求体上限：要容纳多轮的服务端工具块，所以比纯文本时代宽。 */
const MAX_BODY_BYTES = 512 * 1024;

/** 历史消息条数上限（不含 system 与 selection）。 */
const MAX_MESSAGES = 40;

/** 单条消息的字符上限。 */
const MAX_MESSAGE_CHARS = 16_000;

/** 选中文本（context chip）的字符上限。 */
const MAX_SELECTION_CHARS = 8_000;

/** 单次回答的输出上限。 */
const MAX_OUTPUT_TOKENS = 2_048;

/**
 * 单条 assistant 消息里服务端工具块的字节上限。
 * 阅读链接的网页正文加密在 `signature` 里，会随轮次增长，所以要单独设限。
 */
const MAX_BLOCK_BYTES = 96 * 1024;

/** 模型请求的用途标记；辅助调用，不进入普通对话链路。 */
const PURPOSE = 'quick-chat';

/** DeepSeek 官方 API 根地址；账号 token 的目标校验也用它。 */
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

/** Messages 协议端点，与 DSH 自己的 DeepSeek adapter 一致。 */
const DEEPSEEK_MESSAGES_URL = `${DEEPSEEK_BASE_URL}/anthropic/v1/messages`;

/** 联网工具只在这个模型上可用（官方要求）。 */
const DEEPSEEK_MODEL = 'deepseek-flash';

/** API Key 兜底时读取的凭证名。 */
const DEEPSEEK_API_KEY_REF = 'DEEPSEEK_API_KEY';

/** 账号授权 token 的请求头；由 `dsh-llm-deepseek-account` 定义。 */
const ACCOUNT_TOKEN_HEADER = 'x-dsh-auth-token';

/** Anthropic Messages 协议要求的版本头。 */
const ANTHROPIC_VERSION = '2023-06-01';

/** Files API：与 Messages 同一 root（/anthropic/v1）。 */
const DEEPSEEK_FILES_URL = `${DEEPSEEK_BASE_URL}/anthropic/v1/files`;

/** 引用 file_id 时必须带的 beta 头。 */
const FILES_BETA = 'files-api-2025-04-14';

/** 单次上传上限：官方文档文档类 100 MiB，这里收紧到 30 MiB。 */
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

/** 一条消息最多引用的文件数。 */
const MAX_FILES_PER_MESSAGE = 6;

/** 允许上传的扩展名 → 解析用途。 */
const UPLOAD_PURPOSES = new Map([
  ['pdf', 'text_recognition'],
  ['doc', 'text_recognition'],
  ['docx', 'text_recognition'],
  ['ppt', 'text_recognition'],
  ['pptx', 'text_recognition'],
  ['png', 'user_data'],
  ['jpg', 'user_data'],
  ['jpeg', 'user_data'],
  ['gif', 'user_data'],
  ['webp', 'user_data'],
  ['txt', 'user_data'],
  ['md', 'user_data'],
  ['csv', 'user_data'],
  ['json', 'user_data'],
  ['ts', 'user_data'],
  ['tsx', 'user_data'],
  ['js', 'user_data'],
  ['jsx', 'user_data'],
  ['py', 'user_data'],
  ['go', 'user_data'],
  ['rs', 'user_data'],
  ['yaml', 'user_data'],
  ['yml', 'user_data'],
  ['xlsx', 'user_data'],
  ['xls', 'user_data'],
]);

/** 图片扩展名：引用时用 image 块，其余用 document 块。 */
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

/**
 * 联网工具声明。
 * `deepseek_web_search` 负责搜索（含打开网页），`deepseek_read_url` 负责阅读
 * 用户消息里的链接。是否真的调用由模型判断，不能用 tool_choice 强制。
 */
const WEB_TOOLS = [
  { type: 'deepseek_web_search', name: 'deepseek_web_search' },
  { type: 'deepseek_read_url', name: 'deepseek_read_url' },
];

/** 回传时允许出现的服务端块类型；其余一律丢弃。 */
const ALLOWED_BLOCK_TYPES = new Set([
  'text',
  'server_tool_use',
  'web_search_tool_result',
  'web_fetch_tool_result',
]);

/**
 * 系统提示：只解释概念，不行动。
 * 这段话是产品语义的一部分，改它要同步 README 的「它做了什么」。
 */
const SYSTEM_PROMPT = [
  '你是 DSH 的「快捷提问」助手，只在临时小窗里解释概念。',
  '',
  '规则：',
  '- 只回答问题；不执行任务、不调用工具、不读写文件、不假装查看工作区或会话。',
  '- 默认用简体中文回答；用户用其他语言提问时跟随用户语言。',
  '- 回答尽量短：先给一句结论，再给必要解释或一个例子；不要客套与重复。',
  '- 不确定时直接说明不确定，不要编造事实、链接、API 或代码行为。',
  '- 可以用 Markdown：短段落、列表、行内代码、代码块。',
  '- 用户提供了「选中的文字」时，把它当作要解释的对象。',
].join('\n');

/** 设置文件：只存用户在设置页里改的那几项。 */
const SETTINGS_DIR = path.join(homedir(), '.dsh', 'vt-quick-chat');
/**
 * 设置文件路径。按需解析，这样测试可以用环境变量把落点指到临时目录。
 * @returns 绝对路径。
 */
function settingsFile() {
  return process.env.VT_QUICK_CHAT_SETTINGS ?? path.join(SETTINGS_DIR, 'settings.json');
}
/** Provider 取值：'follow' = 跟随 DSH 默认。 */
const PROVIDER_FOLLOW = 'follow';
/** 内置提示词在设置页里的「恢复默认」占位。 */
const DEFAULT_SETTINGS = Object.freeze({
  systemPrompt: '',
  provider: PROVIDER_FOLLOW,
  webByDefault: false,
  deepThinkByDefault: false,
});

/**
 * 把任意输入收敛成合法设置。
 * @param value - 任意 JSON 值。
 * @returns 干净的设置对象。
 */
function sanitizeSettings(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_SETTINGS };
  return {
    systemPrompt: typeof value.systemPrompt === 'string' ? value.systemPrompt.slice(0, 8000) : '',
    provider: typeof value.provider === 'string' && value.provider.length > 0 ? value.provider.slice(0, 200) : PROVIDER_FOLLOW,
    webByDefault: value.webByDefault === true,
    deepThinkByDefault: value.deepThinkByDefault === true,
  };
}

/**
 * 读取设置；文件不存在或损坏时返回默认值。
 * @returns 设置对象。
 */
async function readSettings() {
  try {
    const raw = await readFile(settingsFile(), 'utf8');
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * 写入设置；用「临时文件 + rename」避免写一半留下坏文件。
 * @param value - 任意设置对象。
 * @returns 落盘后的设置。
 */
async function writeSettings(value) {
  const settings = sanitizeSettings(value);
  await mkdir(path.dirname(settingsFile()), { recursive: true });
  const temp = path.join(path.dirname(settingsFile()), 'settings.' + process.pid + '.' + Date.now() + '.tmp');
  await writeFile(temp, JSON.stringify(settings, null, 2), 'utf8');
  await rename(temp, settingsFile());
  return settings;
}

/**
 * 实际生效的系统提示词：用户改过就用用户的，否则用内置的。
 * @param settings - 设置对象。
 * @param web - 是否开启联网。
 * @returns 完整提示词。
 */
function effectiveSystemPrompt(settings, web) {
  const custom = typeof settings?.systemPrompt === 'string' ? settings.systemPrompt.trim() : '';
  const base = custom.length > 0 ? custom : SYSTEM_PROMPT;
  return web ? base + WEB_PROMPT_SUFFIX : base;
}

/**
 * 设置页下拉用的 provider / model 清单。
 * @param ctx - Host 上下文。
 * @returns `{ providers }`。
 */
async function listProviderChoices(ctx) {
  const llm = ctx.get('llm');
  if (llm === undefined || llm === null || typeof llm.listProviders !== 'function') return { providers: [] };
  const providers = [];
  for (const provider of llm.listProviders() ?? []) {
    const id = provider?.id;
    if (typeof id !== 'string' || id.length === 0) continue;
    let models = [];
    try {
      const list = typeof llm.listModels === 'function' ? await llm.listModels(id) : [];
      models = (Array.isArray(list) ? list : [])
        .map((model) => ({ id: String(model?.id ?? ''), name: String(model?.name ?? model?.id ?? '') }))
        .filter((model) => model.id.length > 0);
    } catch {
      models = [];
    }
    providers.push({ id, name: typeof provider?.name === 'string' ? provider.name : id, models });
  }
  return { providers };
}

/**
 * 把设置里的 provider 值解析成 `{ provider, model }`。
 * 取值形如 `provider::model`；只写 provider 时模型留空，由调用方挑第一个。
 * @param value - 设置值。
 * @returns 指定目标；'follow' 或无法解析时返回 undefined。
 */
function parseProviderChoice(value) {
  if (typeof value !== 'string' || value.length === 0 || value === PROVIDER_FOLLOW) return undefined;
  const [provider, model = ''] = value.split('::');
  if (provider.length === 0) return undefined;
  return model.length > 0 ? { provider, model } : { provider };
}

/** 联网开启时追加的说明：允许引用来源。 */
const WEB_PROMPT_SUFFIX = [
  '',
  '本轮已开启联网：可以使用联网搜索与阅读链接的结果。',
  '引用来源时用 Markdown 链接标注，并保留来源标题。',
].join('\n');

/** 带 HTTP 语义的错误，便于路由层给出稳定状态码。 */
class ApiError extends Error {
  /**
   * @param code - 机器可读错误码，客户端按它映射文案。
   * @param message - 面向开发者的可读信息。
   * @param status - HTTP 状态码；流已开始后不再使用。
   */
  constructor(code, message, status = 400) {
    super(message);
    this.apiCode = code;
    this.status = status;
  }
}

/**
 * 发送 JSON 响应。
 * @param res - Node 响应。
 * @param status - HTTP 状态码。
 * @param body - 可序列化对象。
 */
function writeJson(res, status, body) {
  if (res.writableEnded || res.destroyed) return;
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

/**
 * 有界读取 JSON 请求体。
 * @param req - Node 请求。
 * @returns 解析后的对象；空体返回空对象。
 */
async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new ApiError('body-too-large', '请求体超过上限。', 413);
    chunks.push(chunk);
  }
  if (total === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw new ApiError('bad-json', '请求体不是合法 JSON。', 400);
  }
}

/**
 * 校验并复制服务端工具块。
 *
 * 这些块由上一轮响应原样回传，模型靠它们与 `signature` 恢复已读网页。
 * 只放行已知类型，并限制总字节数；未知类型直接丢弃，避免把客户端塞进来的
 * 任意结构转发给上游。
 * @param value - 客户端传来的 blocks。
 * @returns 归一化后的块数组；没有可用块时返回 undefined。
 */
function sanitizeBlocks(value) {
  if (!Array.isArray(value)) return undefined;
  const blocks = [];
  let bytes = 0;
  for (const raw of value) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue;
    if (typeof raw.type !== 'string' || !ALLOWED_BLOCK_TYPES.has(raw.type)) continue;
    let encoded;
    try {
      encoded = JSON.stringify(raw);
    } catch {
      continue;
    }
    bytes += encoded.length;
    if (bytes > MAX_BLOCK_BYTES) break;
    blocks.push(JSON.parse(encoded));
  }
  return blocks.length === 0 ? undefined : blocks;
}

/**
 * 归一化一条消息：只保留 user / assistant 两种角色与文本，assistant 可带块。
 * @param value - 客户端传来的消息。
 * @param index - 消息序号，用于错误定位。
 * @returns 归一化后的消息。
 */
function sanitizeMessage(value, index) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError('bad-message', `第 ${index + 1} 条消息不是对象。`, 400);
  }
  const role = value.role;
  if (role !== 'user' && role !== 'assistant') {
    throw new ApiError('bad-message', `第 ${index + 1} 条消息的角色不合法。`, 400);
  }
  if (typeof value.content !== 'string') {
    throw new ApiError('bad-message', `第 ${index + 1} 条消息缺少文本。`, 400);
  }
  const text = value.content.trim();
  if (text.length === 0) {
    throw new ApiError('bad-message', `第 ${index + 1} 条消息是空的。`, 400);
  }
  const message = { role, content: text.slice(0, MAX_MESSAGE_CHARS) };
  if (role === 'assistant') {
    // assistant 回传的是服务端块；user 不接受块，只接受文件引用。
    const blocks = sanitizeBlocks(value.blocks);
    if (blocks !== undefined) message.blocks = blocks;
  } else {
    const files = sanitizeFiles(value.files);
    if (files !== undefined) message.files = files;
  }
  return message;
}

/**
 * 校验文件引用。
 * @param value - 客户端传来的 files。
 * @returns 归一化后的文件数组；没有可用项时返回 undefined。
 */
function sanitizeFiles(value) {
  if (!Array.isArray(value)) return undefined;
  const files = [];
  for (const raw of value) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const id = raw.id;
    if (typeof id !== 'string' || !/^file-api-[A-Za-z0-9_-]{6,}$/u.test(id)) continue;
    const kind = raw.kind === 'image' ? 'image' : 'document';
    const name = typeof raw.name === 'string' ? raw.name.slice(0, 120) : '';
    files.push({ id, kind, name });
    if (files.length >= MAX_FILES_PER_MESSAGE) break;
  }
  return files.length === 0 ? undefined : files;
}

/**
 * 把文件引用转成 Messages 内容块。
 * @param files - 归一化后的文件数组。
 * @returns content block 数组。
 */
function toFileBlocks(files) {
  return files.map((file) =>
    file.kind === 'image'
      ? { type: 'image', source: { type: 'file', file_id: file.id } }
      : { type: 'document', source: { type: 'file', file_id: file.id } },
  );
}

/**
 * 校验并截断消息列表。
 * 只保留末尾 MAX_MESSAGES 条，避免把整个历史无限传上来。
 * @param value - 客户端传来的 messages 字段。
 * @returns 归一化后的消息数组。
 */
function sanitizeMessages(value) {
  if (!Array.isArray(value)) throw new ApiError('bad-messages', 'messages 必须是数组。', 400);
  const messages = value.map(sanitizeMessage);
  if (messages.length === 0) throw new ApiError('bad-messages', '至少需要一条消息。', 400);
  // 末尾一定是用户刚发的问题；截断时保留最近的一轮上下文。
  return messages.slice(-MAX_MESSAGES);
}

/**
 * 校验选中文本。
 * @param value - 客户端传来的 selection。
 * @returns 截断后的文本；没有选择时返回空串。
 */
function sanitizeSelection(value) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_SELECTION_CHARS);
}

/**
 * 把内部消息转成 `GenerateOptions.messages` 的请求形态（兜底通道用）。
 *
 * 这里使用请求级纯对象：只带 role 与 text block，不伪造 id / source。
 * system 走 `GenerateOptions.system`，不混进消息列表。
 * @param messages - 归一化后的对话。
 * @returns 请求消息数组。
 */
function toRequestMessages(messages) {
  return messages.map((message) => ({
    role: message.role,
    content: [{ type: 'text', text: message.content }],
  }));
}

/**
 * 把内部消息转成 DeepSeek Messages 的请求形态。
 *
 * assistant 消息若带服务端块，必须原样回传，模型才能恢复已读网页；
 * 否则退回纯文本，保证降级轮次也能继续对话。
 * @param messages - 归一化后的对话。
 * @returns Messages 请求数组。
 */
function toDeepSeekMessages(messages) {
  return messages.map((message) => {
    if (message.role === 'assistant' && Array.isArray(message.blocks) && message.blocks.length > 0) {
      return { role: 'assistant', content: message.blocks };
    }
    if (message.role === 'user' && Array.isArray(message.files) && message.files.length > 0) {
      // 文件块必须在文本之前，模型先拿到文档再读问题。
      return { role: 'user', content: [...toFileBlocks(message.files), { type: 'text', text: message.content }] };
    }
    return { role: message.role, content: message.content };
  });
}

/**
 * 把选中文本包装成一条可见的上下文说明。
 * 单独作为第一条 user 消息，便于模型区分「要解释的对象」与「问题」。
 * @param selection - 选中文本。
 * @returns 上下文文本；为空时返回空串。
 */
function selectionBlock(selection) {
  if (selection.length === 0) return '';
  const quoted = selection
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  return ['用户在界面上选中了这段文字，请以它为解释对象：', '', quoted].join('\n');
}

/**
 * 把 SSE 帧写进响应。
 * @param res - Node 响应。
 * @param payload - 一帧 JSON。
 */
function writeSse(res, payload) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * 从 provider 列表里挑第一个真正有模型的 route。
 * @param llm - LLM 服务。
 * @returns 可用的 provider/model；没有时抛 NO_MODEL。
 */
async function firstAvailableTarget(llm) {
  const providers = typeof llm.listProviders === 'function' ? llm.listProviders() : [];
  for (const provider of providers) {
    const id = provider?.id;
    if (typeof id !== 'string' || id.length === 0) continue;
    let models;
    try {
      models = await llm.listModels(id);
    } catch {
      continue;
    }
    const first = Array.isArray(models) ? models[0] : undefined;
    if (first !== undefined && typeof first.id === 'string' && first.id.length > 0) {
      return { provider: id, model: first.id };
    }
  }
  throw new ApiError('NO_MODEL', '当前没有可用模型，请先在设置里选择模型。', 503);
}

/**
 * 解析兜底通道使用的 provider / model。
 *
 * 顺序：DSH 默认模型 → 第一个有模型的 provider。默认模型若指向已卸载的
 * provider，则继续向下找，而不是把一个注定失败的请求发出去。
 * @param ctx - Host 插件上下文。
 * @param llm - LLM 服务。
 * @returns `{ provider, model }`。
 */
async function resolveTarget(ctx, llm) {
  const providers = typeof llm.listProviders === 'function' ? llm.listProviders() : [];
  const known = new Set(providers.map((provider) => provider?.id).filter((id) => typeof id === 'string'));
  const defaultModel = ctx.get('agentDefaultModel');
  const selection = defaultModel?.currentSelection?.();
  if (
    selection !== undefined &&
    selection !== null &&
    typeof selection.provider === 'string' &&
    typeof selection.model === 'string' &&
    selection.provider.length > 0 &&
    selection.model.length > 0 &&
    (known.size === 0 || known.has(selection.provider))
  ) {
    return { provider: selection.provider, model: selection.model };
  }
  return firstAvailableTarget(llm);
}

/**
 * 解析 DeepSeek 凭证。
 *
 * 顺序：账号授权 → API Key。账号授权不需要用户另存密钥，退出登录后自动落到
 * API Key；两者都没有时返回 undefined，由调用方降级到默认模型通道。
 * @param ctx - Host 插件上下文。
 * @returns `{ via, headers }`；不可用时返回 undefined。
 */
async function resolveDeepSeekAuth(ctx) {
  const account = ctx.get('deepseekAccount');
  if (account !== undefined && account !== null && typeof account.resolveToken === 'function') {
    try {
      // resolveToken 会校验目标地址；传根地址即可覆盖 Messages 端点。
      const token = await account.resolveToken(DEEPSEEK_BASE_URL);
      if (typeof token === 'string' && token.length > 0) {
        return { via: 'account', headers: { [ACCOUNT_TOKEN_HEADER]: token } };
      }
    } catch {
      // 未登录或地址不被允许：继续尝试 API Key。
    }
  }
  const credentials = ctx.get('credentials');
  if (credentials !== undefined && credentials !== null && typeof credentials.resolve === 'function') {
    try {
      const hit = await credentials.resolve(DEEPSEEK_API_KEY_REF);
      const value = hit?.value;
      if (typeof value === 'string' && value.length > 0) {
        return { via: 'api-key', headers: { 'x-api-key': value } };
      }
    } catch {
      // 凭证服务不可用：交给调用方降级。
    }
  }
  return undefined;
}

/**
 * 把上游错误翻译成客户端可路由的错误帧。
 * @param status - HTTP 状态码。
 * @param body - 上游响应体文本。
 * @returns `{ code, message }`。
 */
function deepSeekFailure(status, body) {
  let detail = '';
  try {
    const parsed = JSON.parse(body);
    const error = parsed?.error;
    detail = typeof error?.message === 'string' ? error.message : typeof error === 'string' ? error : '';
  } catch {
    detail = body.slice(0, 300);
  }
  if (status === 401 || status === 403) {
    return { code: 'AUTH', message: 'DeepSeek 未登录或凭证失效，请重新登录 DeepSeek 账号。' };
  }
  if (status === 429) {
    return { code: 'QUOTA', message: 'DeepSeek 额度或频率受限，请稍后再试。' };
  }
  if (detail.includes('Content Exists Risk')) {
    return { code: 'CONTENT_RISK', message: '这个问题被内容安全策略拒绝了。' };
  }
  return {
    code: `HTTP_${status}`,
    message: detail.length > 0 ? `DeepSeek 返回 ${status}：${detail}` : `DeepSeek 返回 ${status}。`,
  };
}

/**
 * 把上游 SSE 文本切成 `data:` 载荷。
 * @param chunk - 已解码的一段文本。
 * @param buffer - 跨块的剩余文本（会被修改）。
 * @returns 本轮完整的 JSON 载荷数组。
 */
function drainSseEvents(chunk, buffer) {
  const combined = buffer + chunk;
  const events = [];
  let cursor = 0;
  for (;;) {
    const boundary = combined.indexOf('\n\n', cursor);
    if (boundary < 0) break;
    const raw = combined.slice(cursor, boundary);
    cursor = boundary + 2;
    const payload = raw
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('');
    if (payload.length === 0 || payload === '[DONE]') continue;
    try {
      events.push(JSON.parse(payload));
    } catch {
      // 半截或注释行：忽略，等下一块补齐。
    }
  }
  return { events, rest: combined.slice(cursor) };
}

/**
 * 直连 DeepSeek Messages API，把事件翻译成小窗自己的帧。
 *
 * 服务端工具块（搜索、阅读链接）由上游一次性下发，这里负责：
 *   · 把正文增量转成 `delta`；
 *   · 把工具调用转成 `tool`，让界面显示「正在搜索 / 正在读网页」；
 *   · 把引用转成 `citation`；
 *   · 收尾时把 assistant 的完整 content 原样回传客户端，供下一轮携带。
 * @param options - `{ auth, messages, web, signal, emit }`。
 * @returns `{ usage, stopReason }`。
 */
async function streamDeepSeek(options) {
  const { auth, messages, web, deepThink, hasFiles, signal, emit } = options;
  const body = {
    model: DEEPSEEK_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: typeof prompt === 'string' && prompt.length > 0 ? prompt : web ? SYSTEM_PROMPT + WEB_PROMPT_SUFFIX : SYSTEM_PROMPT,
    messages,
    stream: true,
  };
  if (web) body.tools = WEB_TOOLS;
  // 开启思考后，deepseek_web_search 会升级成「深度思考搜索」。
  if (deepThink) body.thinking = { type: 'enabled' };

  let response;
  try {
    response = await fetch(DEEPSEEK_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': ANTHROPIC_VERSION,
        accept: 'text/event-stream',
        // 引用 file_id 时官方要求带 beta 头。
        ...(hasFiles ? { 'anthropic-beta': FILES_BETA } : {}),
        ...auth.headers,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted === true) throw new ApiError('aborted', '请求已取消。', 499);
    throw new ApiError('NETWORK', `无法连接 DeepSeek：${error instanceof Error ? error.message : String(error)}`, 502);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const failure = deepSeekFailure(response.status, text);
    throw new ApiError(failure.code, failure.message, response.status);
  }
  if (response.body === null) throw new ApiError('NETWORK', 'DeepSeek 没有返回响应体。', 502);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  /** index → 已组装的 content block。 */
  const blocks = new Map();
  let usage;
  let stopReason;

  const handle = (event) => {
    switch (event.type) {
      case 'message_start':
        if (typeof event.message?.model === 'string') emit({ type: 'model', model: event.message.model });
        break;
      case 'content_block_start': {
        const index = event.index;
        const block = event.content_block;
        if (index === undefined || block === null || typeof block !== 'object') break;
        blocks.set(index, JSON.parse(JSON.stringify(block)));
        if (block.type === 'thinking') {
          // 思考过程不进正文，也不回传；只告诉界面「正在深度思考」。
          emit({ type: 'thinking' });
        }
        if (block.type === 'server_tool_use') {
          emit({
            type: 'tool',
            action: typeof block.input?.action === 'string' ? block.input.action : 'search',
            queries: Array.isArray(block.input?.queries) ? block.input.queries.slice(0, 6) : [],
            url: typeof block.input?.url === 'string' ? block.input.url : '',
          });
        }
        break;
      }
      case 'content_block_delta': {
        const block = blocks.get(event.index);
        const delta = event.delta;
        if (block === undefined || delta === null || typeof delta !== 'object') break;
        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          block.text = (typeof block.text === 'string' ? block.text : '') + delta.text;
          emit({ type: 'delta', text: delta.text });
        } else if (delta.type === 'citations_delta' && delta.citation !== null && typeof delta.citation === 'object') {
          const citation = delta.citation;
          block.citations = Array.isArray(block.citations) ? [...block.citations, citation] : [citation];
          emit({
            type: 'citation',
            url: typeof citation.url === 'string' ? citation.url : '',
            title: typeof citation.title === 'string' ? citation.title : '',
          });
        } else if (delta.type === 'signature_delta' && typeof delta.signature === 'string') {
          block.signature = (typeof block.signature === 'string' ? block.signature : '') + delta.signature;
        }
        break;
      }
      case 'message_delta':
        if (event.delta?.stop_reason !== undefined) stopReason = event.delta.stop_reason;
        if (event.usage !== undefined) usage = event.usage;
        break;
      case 'error': {
        const message = typeof event.error?.message === 'string' ? event.error.message : 'DeepSeek 生成失败。';
        throw new ApiError('UPSTREAM', message, 502);
      }
      default:
        break;
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const drained = drainSseEvents(decoder.decode(value, { stream: true }), buffer);
      buffer = drained.rest;
      for (const event of drained.events) handle(event);
    }
    const tail = drainSseEvents(decoder.decode(), buffer);
    for (const event of tail.events) handle(event);
  } finally {
    reader.releaseLock?.();
  }

  const ordered = [...blocks.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, block]) => block)
    // thinking 块带 signature 但不需要回传，省掉能减小历史体积。
    .filter((block) => block.type !== 'thinking');
  return { blocks: ordered, usage, stopReason };
}

/**
 * 把 LLM 的失败对象翻译成客户端可路由的错误帧。
 * @param failure - `{ code, message }`。
 * @returns 错误帧。
 */
function failureFrame(failure) {
  return {
    type: 'error',
    code: typeof failure?.code === 'string' && failure.code.length > 0 ? failure.code : 'UNKNOWN',
    message:
      typeof failure?.message === 'string' && failure.message.length > 0
        ? failure.message
        : '模型请求失败。',
  };
}

/**
 * 打开一条 SSE 响应流。
 * @param res - Node 响应。
 */
function startSse(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.flushHeaders?.();
}

/**
 * 兜底通道：走 DSH 默认模型，没有联网能力。
 * @param res - Node 响应。
 * @param ctx - Host 插件上下文。
 * @param messages - 归一化后的对话。
 * @param selection - 选中文本。
 * @param controller - 取消控制器。
 */
async function runDefaultChannel(res, ctx, messages, selection, controller, options = {}) {
  const llm = ctx.get('llm');
  if (llm === undefined || llm === null || typeof llm.stream !== 'function') {
    writeSse(res, { type: 'error', code: 'NO_LLM', message: '当前 profile 没有可用的模型服务。' });
    return;
  }

  let target;
  try {
    target = options.target ?? (await resolveTarget(ctx, llm));
  } catch (error) {
    writeSse(res, {
      type: 'error',
      code: error?.apiCode ?? 'NO_MODEL',
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  writeSse(res, { type: 'start', via: 'default', provider: target.provider, model: target.model, web: false });

  const requestMessages = toRequestMessages(messages);
  const context = selectionBlock(selection);
  if (context.length > 0) {
    requestMessages.unshift({ role: 'user', content: [{ type: 'text', text: context }] });
  }

  let usage;
  let finished = false;
  const stream = llm.stream({
    provider: target.provider,
    model: target.model,
    system: options.prompt ?? SYSTEM_PROMPT,
    messages: requestMessages,
    maxTokens: MAX_OUTPUT_TOKENS,
    purpose: PURPOSE,
    signal: controller.signal,
  });
  for await (const chunk of stream) {
    if (chunk.type === 'text-delta') {
      writeSse(res, { type: 'delta', text: chunk.text });
    } else if (chunk.type === 'usage') {
      usage = chunk.usage;
    } else if (chunk.type === 'finish') {
      finished = true;
      const reason = chunk.reason;
      if (reason?.kind === 'error') {
        writeSse(res, failureFrame(reason.failure));
      } else if (reason?.kind === 'aborted') {
        writeSse(res, { type: 'aborted' });
      } else {
        writeSse(res, {
          type: 'done',
          ...(usage === undefined ? {} : { usage }),
          ...(reason?.kind === 'max-tokens' ? { truncated: true } : {}),
        });
      }
    }
  }
  // 适配器契约保证总有 finish；这里只兜底异常适配器，避免前端永远等下去。
  if (!finished) writeSse(res, { type: 'done', ...(usage === undefined ? {} : { usage }) });
}

/**
 * 主通道：直连 DeepSeek，可选联网。
 * @param res - Node 响应。
 * @param auth - 凭证。
 * @param messages - 归一化后的对话。
 * @param selection - 选中文本。
 * @param web - 是否开启联网工具。
 * @param controller - 取消控制器。
 */
async function runDeepSeekChannel(res, auth, messages, selection, web, deepThink, controller, prompt) {
  const hasFiles = messages.some((message) => Array.isArray(message.files) && message.files.length > 0);
  writeSse(res, {
    type: 'start',
    via: auth.via,
    provider: 'deepseek',
    model: DEEPSEEK_MODEL,
    web,
    deepThink,
    files: hasFiles,
  });

  const requestMessages = toDeepSeekMessages(messages);
  const context = selectionBlock(selection);
  if (context.length > 0) requestMessages.unshift({ role: 'user', content: context });

  const result = await streamDeepSeek({
    auth,
    messages: requestMessages,
    web,
    deepThink,
    hasFiles,
    signal: controller.signal,
    emit: (frame) => writeSse(res, frame),
  });

  // 先把完整块交给客户端保存，再收尾：下一轮要靠它们恢复已读网页。
  if (result.blocks.length > 0) writeSse(res, { type: 'blocks', blocks: result.blocks });
  const tools = result.usage?.server_tool_use;
  writeSse(res, {
    type: 'done',
    ...(result.usage === undefined ? {} : { usage: result.usage }),
    ...(tools === undefined
      ? {}
      : {
          tools: {
            search: typeof tools.tool_search === 'number' ? tools.tool_search : 0,
            fetch: typeof tools.tool_fetch === 'number' ? tools.tool_fetch : 0,
          },
        }),
    ...(result.stopReason === 'max_tokens' ? { truncated: true } : {}),
  });
}


/**
 * 有界读取二进制请求体。
 * @param req - Node 请求。
 * @returns 完整字节。
 */
async function readBinaryBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_UPLOAD_BYTES) throw new ApiError('file-too-large', '文件超过 30 MiB 上限。', 413);
    chunks.push(chunk);
  }
  if (total === 0) throw new ApiError('empty-file', '没有收到文件内容。', 400);
  return Buffer.concat(chunks);
}

/**
 * 上传一个文件到 DeepSeek Files API，返回可被对话引用的 file_id。
 *
 * 客户端把原始字节放在请求体里，文件名走 `x-filename`（URI 编码），
 * 这样 Host 不用解析 multipart，也不会把文件写进磁盘。
 * @param req - Node 请求。
 * @param res - Node 响应。
 * @param ctx - Host 插件上下文。
 * @param admitted - 连接鉴权判定。
 */
async function handleUpload(req, res, ctx, admitted) {
  if (!admitted(req)) {
    writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: '当前连接无权访问本机插件路由。' } });
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST' });
    res.end();
    return;
  }

  let name = '';
  try {
    name = decodeURIComponent(String(req.headers['x-filename'] ?? ''));
  } catch {
    name = '';
  }
  const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  const purpose = UPLOAD_PURPOSES.get(extension);
  if (purpose === undefined) {
    writeJson(res, 415, {
      ok: false,
      error: { code: 'unsupported-file', message: `不支持的文件类型：.${extension || '未知'}` },
    });
    return;
  }

  let bytes;
  try {
    bytes = await readBinaryBody(req);
  } catch (error) {
    writeJson(res, error instanceof ApiError ? error.status : 400, {
      ok: false,
      error: { code: error?.apiCode ?? 'bad-upload', message: error instanceof Error ? error.message : String(error) },
    });
    return;
  }

  const auth = await resolveDeepSeekAuth(ctx);
  if (auth === undefined) {
    writeJson(res, 503, {
      ok: false,
      error: { code: 'NO_CREDENTIAL', message: '没有可用的 DeepSeek 凭证，无法上传文件。' },
    });
    return;
  }

  const form = new FormData();
  // 官方要求 purpose 在 file 之前。
  form.set('purpose', purpose);
  form.set('file', new Blob([bytes]), name);

  let response;
  try {
    response = await fetch(DEEPSEEK_FILES_URL, {
      method: 'POST',
      headers: {
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-beta': FILES_BETA,
        ...auth.headers,
      },
      body: form,
    });
  } catch (error) {
    writeJson(res, 502, {
      ok: false,
      error: { code: 'NETWORK', message: `无法连接 DeepSeek：${error instanceof Error ? error.message : String(error)}` },
    });
    return;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const failure = uploadFailure(response.status, text);
    writeJson(res, response.status, { ok: false, error: failure });
    return;
  }

  const payload = await response.json().catch(() => undefined);
  const id = payload?.id;
  if (typeof id !== 'string' || id.length === 0) {
    writeJson(res, 502, { ok: false, error: { code: 'FILES_API', message: 'DeepSeek 没有返回 file_id。' } });
    return;
  }

  writeJson(res, 200, {
    ok: true,
    file: { id, name: typeof payload?.filename === 'string' ? payload.filename : name, kind: IMAGE_EXTENSIONS.has(extension) ? 'image' : 'document' },
  });
}

/**
 * 上传失败码映射。
 * @param status - HTTP 状态码。
 * @param body - 响应体。
 * @returns `{ code, message }`。
 */
function uploadFailure(status, body) {
  const table = {
    400: ['file-unreadable', '文件无法解析或格式不支持（也可能设了打开密码）。'],
    408: ['upload-timeout', '上传超时，请换小一点的文件重试。'],
    413: ['file-too-large', '文件超过 DeepSeek 的大小上限。'],
    429: ['upload-busy', '同时上传的文件太多，请稍后再试。'],
    500: ['parse-failed', '解析结果不完整，请重试。'],
    503: ['service-busy', 'DeepSeek 服务繁忙，请稍后再试。'],
    504: ['parse-timeout', '解析超时，请换小一点的文件重试。'],
  };
  if (status === 401 || status === 403) {
    return { code: 'AUTH', message: 'DeepSeek 未登录或凭证失效，请重新登录。' };
  }
  const hit = table[status];
  if (hit !== undefined) return { code: hit[0], message: hit[1] };
  return { code: `HTTP_${status}`, message: body.slice(0, 200) || `DeepSeek 返回 ${status}。` };
}

/**
 * 路由入口：只接受 POST。
 * @param req - Node 请求。
 * @param res - Node 响应。
 * @param ctx - Host 插件上下文。
 * @param admitted - 连接鉴权判定。
 */
async function handleChat(req, res, ctx, admitted) {
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
  if (pathname !== `${ROUTE_PREFIX}/chat`) {
    writeJson(res, 404, { ok: false, error: { code: 'not-found', message: '未知方法。' } });
    return;
  }

  let input;
  try {
    input = await readJsonBody(req);
  } catch (error) {
    writeJson(res, error instanceof ApiError ? error.status : 400, {
      ok: false,
      error: { code: error?.apiCode ?? 'bad-request', message: error instanceof Error ? error.message : String(error) },
    });
    return;
  }

  let messages;
  let selection;
  try {
    messages = sanitizeMessages(input.messages);
    selection = sanitizeSelection(input.selection);
  } catch (error) {
    writeJson(res, error instanceof ApiError ? error.status : 400, {
      ok: false,
      error: { code: error?.apiCode ?? 'bad-request', message: error instanceof Error ? error.message : String(error) },
    });
    return;
  }
  const web = input.web === true;
  const deepThink = input.deepThink === true;
  // 设置页里的 Provider 与提示词；读盘失败时 readSettings 会给默认值。
  const settings = await readSettings();
  const prompt = effectiveSystemPrompt(settings, web);
  const forcedTarget = parseProviderChoice(settings.provider);

  // 客户端关闭小窗或点「停止」时，响应会被关闭；把取消透传给上游。
  // 监听 res 而不是 req：req 的 close 在请求体读完时就会触发，会立刻误取消。
  const controller = new AbortController();
  const onClose = () => controller.abort();
  res.on('close', onClose);

  startSse(res);
  try {
    if (forcedTarget !== undefined) {
      // 用户指定了 provider：直接走该模型，不再尝试 DeepSeek 直连。
      await runDefaultChannel(res, ctx, messages, selection, controller, { target: forcedTarget, prompt });
    } else {
      const auth = await resolveDeepSeekAuth(ctx);
      if (auth === undefined) {
        // 没有 DeepSeek 凭证：退回默认模型，联网诉求无法满足，由 start 帧说明。
        await runDefaultChannel(res, ctx, messages, selection, controller, { prompt });
      } else {
        await runDeepSeekChannel(res, auth, messages, selection, web, deepThink, controller, prompt);
      }
    }
  } catch (error) {
    if (controller.signal.aborted) {
      writeSse(res, { type: 'aborted' });
    } else {
      writeSse(res, {
        type: 'error',
        code: typeof error?.apiCode === 'string' ? error.apiCode : typeof error?.code === 'string' ? error.code : 'STREAM_FAILED',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  } finally {
    res.off('close', onClose);
    if (!res.writableEnded && !res.destroyed) res.end();
  }
}

/**
 * 设置页数据：读当前设置 + 可选 provider 清单；保存后回传落盘结果。
 * @param req - 请求。
 * @param res - 响应。
 * @param ctx - Host 上下文。
 * @param admitted - 连接鉴权判定。
 */
async function handleSettings(req, res, ctx, admitted) {
  if (!admitted(req)) {
    writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: '当前连接无权访问本机插件路由。' } });
    return;
  }
  if (req.method === 'GET') {
    const [settings, choices] = await Promise.all([readSettings(), listProviderChoices(ctx)]);
    writeJson(res, 200, { ok: true, value: { settings, providers: choices.providers, defaultPrompt: SYSTEM_PROMPT } });
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'GET, POST' });
    res.end();
    return;
  }
  let input;
  try {
    input = await readJsonBody(req);
  } catch (error) {
    writeJson(res, error instanceof ApiError ? error.status : 400, {
      ok: false,
      error: { code: error?.apiCode ?? 'bad-request', message: error instanceof Error ? error.message : String(error) },
    });
    return;
  }
  try {
    const settings = await writeSettings(input);
    const choices = await listProviderChoices(ctx);
    writeJson(res, 200, { ok: true, value: { settings, providers: choices.providers, defaultPrompt: SYSTEM_PROMPT } });
  } catch (error) {
    writeJson(res, 500, {
      ok: false,
      error: { code: 'save-failed', message: error instanceof Error ? error.message : String(error) },
    });
  }
}

/**
 * @param ctx - Host 插件上下文。
 */
export function apply(ctx) {
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
          const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname;
          if (pathname === `${ROUTE_PREFIX}/upload`) return handleUpload(req, res, ctx, admitted);
          if (pathname === `${ROUTE_PREFIX}/settings`) return handleSettings(req, res, ctx, admitted);
          return handleChat(req, res, ctx, admitted);
        },
      }),
    'vt-quick-chat: chat route',
  );
}

/**
 * 测试出口：纯函数不依赖 cordis，供 `test/` 直接导入验证。
 * 不参与运行时行为。
 */
export const __test = {
  SYSTEM_PROMPT,
  DEFAULT_SETTINGS,
  sanitizeSettings,
  effectiveSystemPrompt,
  parseProviderChoice,
  WEB_TOOLS,
  DEEPSEEK_MESSAGES_URL,
  DEEPSEEK_MODEL,
  MAX_BODY_BYTES,
  MAX_MESSAGES,
  MAX_MESSAGE_CHARS,
  MAX_SELECTION_CHARS,
  MAX_BLOCK_BYTES,
  ApiError,
  sanitizeMessages,
  sanitizeSelection,
  sanitizeBlocks,
  sanitizeFiles,
  toFileBlocks,
  uploadFailure,
  UPLOAD_PURPOSES,
  MAX_UPLOAD_BYTES,
  selectionBlock,
  toRequestMessages,
  toDeepSeekMessages,
  drainSseEvents,
  deepSeekFailure,
  failureFrame,
  resolveTarget,
  firstAvailableTarget,
  resolveDeepSeekAuth,
};
