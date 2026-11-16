/**
 * dsh-vt-quick-chat — Host half.
 *
 * 这个插件解决的问题：agent 正在跑任务时，用户常遇到一个不懂的词，但不想打断
 * 主对话、也不想为一句解释新建 Session。Client 半边弹出一个临时小窗，Host 半边
 * 只做一件事：把这段临时对话翻译成一次 `ctx.llm.stream()` 调用，并以 SSE 流式
 * 回给浏览器。
 *
 * 为什么必须有 Host 半边：模型调用要经过 DSH 的 provider 路由、凭证与取消语义，
 * 这些只能在 Host 进程里完成。浏览器侧只拿同源路由的流式文本，看不到 API Key。
 *
 * 关键边界（与 README / DESIGN 一致）：
 *   · 不传 `sessionId`、不经过 agent loop、不注册任何工具 → 不创建 Session、
 *     不写 session log、不进入侧栏、不调用工具；
 *   · 只接受白名单字段（messages / selection），不接受任意 provider、model、
 *     URL、文件路径或工具名；
 *   · 每个请求都过 `connection.requestRejection`，与 DSH `/api` 同一套鉴权；
 *   · 请求体有上限，消息条数与单条长度都截断，避免一次临时提问变成大请求。
 */

/** 插件标识（与 package.json 的 name 一致）。 */
export const name = 'dsh-vt-quick-chat';

/** webServer 是硬依赖；llm 在请求时软取，缺失时返回可读错误而不是崩溃。 */
export const inject = ['webServer'];

/** 路由前缀，客户端拼 `/vt-quick-chat/api/chat`。 */
const ROUTE_PREFIX = '/vt-quick-chat/api';

/** 请求体上限：临时提问不需要大附件。 */
const MAX_BODY_BYTES = 256 * 1024;

/** 历史消息条数上限（不含 system 与 selection）。 */
const MAX_MESSAGES = 40;

/** 单条消息的字符上限。 */
const MAX_MESSAGE_CHARS = 16_000;

/** 选中文本（context chip）的字符上限。 */
const MAX_SELECTION_CHARS = 8_000;

/** 单次回答的输出上限。 */
const MAX_OUTPUT_TOKENS = 2_048;

/** 模型请求的用途标记；辅助调用，不进入普通对话链路。 */
const PURPOSE = 'quick-chat';

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
 * 归一化一条消息：只保留 user / assistant 两种角色与纯文本。
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
  return { role, content: text.slice(0, MAX_MESSAGE_CHARS) };
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
 * 把内部消息转成 `GenerateOptions.messages` 的请求形态。
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
 * 解析本次请求使用的 provider / model。
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

  const llm = ctx.get('llm');
  if (llm === undefined || llm === null || typeof llm.stream !== 'function') {
    writeJson(res, 503, {
      ok: false,
      error: { code: 'NO_LLM', message: '当前 profile 没有可用的模型服务。' },
    });
    return;
  }

  let target;
  try {
    target = await resolveTarget(ctx, llm);
  } catch (error) {
    writeJson(res, error instanceof ApiError ? error.status : 503, {
      ok: false,
      error: { code: error?.apiCode ?? 'NO_MODEL', message: error instanceof Error ? error.message : String(error) },
    });
    return;
  }

  // 客户端关闭小窗或点「停止」时，响应会被关闭；把取消透传给 adapter。
  // 监听 res 而不是 req：req 的 close 在请求体读完时就会触发，会立刻误取消。
  const controller = new AbortController();
  const onClose = () => controller.abort();
  res.on('close', onClose);

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.flushHeaders?.();
  writeSse(res, { type: 'start', provider: target.provider, model: target.model });

  const requestMessages = toRequestMessages(messages);
  const context = selectionBlock(selection);
  if (context.length > 0) {
    requestMessages.unshift({ role: 'user', content: [{ type: 'text', text: context }] });
  }

  let usage;
  let finished = false;
  try {
    const stream = llm.stream({
      provider: target.provider,
      model: target.model,
      system: SYSTEM_PROMPT,
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
  } catch (error) {
    writeSse(res, {
      type: 'error',
      code: typeof error?.code === 'string' ? error.code : 'STREAM_FAILED',
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    res.off('close', onClose);
    if (!res.writableEnded && !res.destroyed) res.end();
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
  MAX_BODY_BYTES,
  MAX_MESSAGES,
  MAX_MESSAGE_CHARS,
  MAX_SELECTION_CHARS,
  ApiError,
  sanitizeMessages,
  sanitizeSelection,
  selectionBlock,
  toRequestMessages,
  failureFrame,
  resolveTarget,
  firstAvailableTarget,
};
