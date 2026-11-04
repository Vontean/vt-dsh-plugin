/**
 * Host 半侧：把「立即发送」翻译成 Agent 层的原子操作。
 *
 * 为什么必须有 Host 半边：浏览器侧只能通过 Remote 命名空间调用内置动词，
 * 而「把一条已经在 inbox 里的消息提前到下一次 step」需要同时做三件事——
 * 定位并移出该消息、中断当前回合、重新投递并锁存唤醒。这三步必须原子完成，
 * 中间不能让别的 RPC 插进来，否则会重复投递或丢消息。
 *
 * 语义（与 @deepseek-ai/dsh-agent-loop 的 ReactLoopAgent 对齐）：
 *   · 排队 followup → inbox["next-turn"]；插入 steer → inbox["next-step"]；
 *   · step 边界由 preStep 统一 claim，工具执行期间没有边界；
 *   · 想让插入消息立刻被读到，唯一手段是结束当前 step：cancel 当前回合，
 *     再 followup 同一条消息。此时 abort 已置位，send() 会把消息转投
 *     next-turn 并锁存一次唤醒，回合收尾后立即开新回合、在第 1 步读它。
 *
 * 安全边界：
 *   · 路由只接受 host:port 形状的会话与条目 id，不接受任意路径或品牌类型；
 *   · 每个请求都过 `connection.requestRejection`，与 /api 网关同一套判定；
 *   · 不读文件、不写文件、不发起外部请求。
 */

/** 插件标识（与 package.json 的 name 一致）。 */
export const name = 'dsh-vt-steer-now';

/** webServer 是硬依赖；agents 在请求时再取，缺失时返回可读错误而不是崩溃。 */
export const inject = ['webServer'];

/** 路由前缀，客户端拼 `vt-steer-now/api/<method>`。 */
const ROUTE_PREFIX = '/vt-steer-now/api';

/** 请求体上限：本路由只接两个短字符串。 */
const MAX_BODY_BYTES = 16 * 1024;

/** 带 HTTP 语义的错误，便于路由层给出稳定状态码。 */
class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.apiCode = code;
  }
}

function writeJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

/** 有界读取 JSON 请求体。 */
async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new ApiError('body-too-large', '请求体超过上限。');
    chunks.push(chunk);
  }
  if (total === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed !== null && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new ApiError('bad-json', '请求体不是合法 JSON。');
  }
}

/**
 * 在 inbox 的两个待处理列表里定位一条消息。
 * @param inbox - Agent 的 inbox 投影。
 * @param itemId - 消息 id。
 * @returns 命中的消息与所在列表；不在队列里时返回 undefined（已被 claim）。
 */
function locate(inbox, itemId) {
  const inStep = inbox.nextStep.find((message) => message.id === itemId);
  if (inStep !== undefined) return { message: inStep, placement: 'steering' };
  const inTurn = inbox.nextTurn.find((message) => message.id === itemId);
  if (inTurn !== undefined) return { message: inTurn, placement: 'queued' };
  return undefined;
}

/**
 * 把一条待生效的插入消息提到「下一个边界立刻读到」。
 * @param agents - Host 的 Agent 服务。
 * @param input - 会话与队列条目身份。
 * @returns 投递结果；已失效的条目返回 claimed 而不是抛错。
 */
function preempt(agents, input) {
  const { sessionId, itemId } = input;
  if (typeof sessionId !== 'string' || sessionId === '') throw new ApiError('bad-request', 'sessionId 必填。');
  if (typeof itemId !== 'string' || itemId === '') throw new ApiError('bad-request', 'itemId 必填。');

  const agent = agents.get(sessionId);
  if (agent === undefined) return { ok: false, reason: 'offline' };

  const found = locate(agent.inbox, itemId);
  if (found === undefined) return { ok: false, reason: 'claimed' };

  // 先移出：随后 cancel 会保留其余待处理消息，不会把它们一起丢掉。
  if (!agent.inbox.remove(itemId)) return { ok: false, reason: 'claimed' };

  const running = agent.status === 'running';
  if (running) agent.cancel({ kind: 'user' }, { keepInbox: true });

  // 关键一步：running 时 abort 已置位，send() 走 wakingAfterAbort 分支，
  // 把消息转投 next-turn 并锁存唤醒；空闲时则直接开启新回合。
  agent.followup(found.message);

  return { ok: true, interrupted: running, placement: found.placement };
}

/**
 * 路由入口：只接受 POST，读操作也走 POST，避免被浏览器预取。
 * @param req - Node 请求。
 * @param res - Node 响应。
 * @param api - 方法表。
 * @param admitted - 连接鉴权判定。
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
    writeJson(res, 200, await handler(await readJsonBody(req)));
  } catch (error) {
    writeJson(res, error?.apiCode === 'bad-request' ? 400 : 500, {
      ok: false,
      error: {
        code: error?.apiCode ?? 'internal',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

/**
 * @param ctx Host 插件上下文。
 */
export function apply(ctx) {
  const api = {
    /** 立即投递一条仍在队列里的消息；消息已被 claim 时返回 claimed。 */
    preempt(input) {
      const agents = ctx.get('agents');
      if (agents === undefined || agents === null) throw new ApiError('unavailable', '当前 profile 没有 Agent 服务。');
      return preempt(agents, input);
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
    'vt-steer-now: preempt route',
  );
}
