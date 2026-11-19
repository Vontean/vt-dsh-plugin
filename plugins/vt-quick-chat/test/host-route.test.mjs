import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import test from 'node:test';

import { apply } from '../index.js';

/** 跨 realm 比较前归一化成纯数据。 */
const plain = (value) => JSON.parse(JSON.stringify(value));

/**
 * 捕获 apply 注册的 webServer 路由。
 * @param services - 按服务名返回的 fake 服务。
 */
function createContext(services) {
  let handler;
  const disposers = [];
  const ctx = {
    effect(fn) {
      const dispose = fn();
      if (typeof dispose === 'function') disposers.push(dispose);
      return dispose;
    },
    webServer: {
      register(entry) {
        handler = entry.handler;
        return () => {
          handler = undefined;
        };
      },
    },
    get(name) {
      return services[name];
    },
  };
  apply(ctx);
  return {
    handler: (req, res) => handler(req, res),
    dispose() {
      for (const dispose of disposers.reverse()) dispose();
    },
  };
}

/** 收集响应的最小 Node 响应。 */
class FakeResponse extends Writable {
  constructor() {
    super();
    this.chunks = [];
    this.status = 0;
    this.headers = {};
  }

  writeHead(status, headers) {
    this.status = status;
    this.headers = headers ?? {};
    return this;
  }

  flushHeaders() {}

  _write(chunk, _encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }

  get text() {
    return Buffer.concat(this.chunks).toString('utf8');
  }

  get frames() {
    return this.text
      .split(/\n\n/u)
      .filter((part) => part.trim().length > 0)
      .map((part) => {
        const data = part
          .split(/\r?\n/u)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        return JSON.parse(data);
      });
  }
}

/**
 * 造一个 POST 请求。
 * @param body - 请求体对象或原始字符串。
 * @param path - 请求路径。
 */
function createRequest(body, path = '/vt-quick-chat/api/chat', method = 'POST') {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  const req = Readable.from([Buffer.from(payload)]);
  req.method = method;
  req.url = path;
  req.headers = {};
  return req;
}

/**
 * 跑一次路由并等响应结束。
 * @param route - createContext 的返回值。
 * @param req - 请求。
 */
async function run(route, req) {
  const res = new FakeResponse();
  await route.handler(req, res);
  return res;
}

const fakeLlm = {
  listProviders: () => [{ id: 'test-provider' }],
  listModels: async () => [{ id: 'test-model' }],
  async *stream(options) {
    this.lastOptions = options;
    yield { type: 'text-delta', text: 'MCP ' };
    yield { type: 'text-delta', text: '是协议。' };
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 4 } };
    yield { type: 'finish', reason: { kind: 'stop' } };
  },
};

const defaultModel = {
  currentSelection: () => ({ provider: 'test-provider', model: 'test-model' }),
};

test('POST /chat 返回 start / delta / done，并且不传 sessionId 与 tools', async () => {
  const route = createContext({ llm: fakeLlm, agentDefaultModel: defaultModel });
  const res = await run(
    route,
    createRequest({ messages: [{ role: 'user', content: '什么是 MCP？' }], selection: 'MCP' }),
  );

  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/event-stream/u);
  assert.deepEqual(
    res.frames.map((frame) => frame.type),
    ['start', 'delta', 'delta', 'done'],
  );
  assert.equal(res.frames[0].model, 'test-model');
  assert.equal(res.frames[1].text + res.frames[2].text, 'MCP 是协议。');
  assert.deepEqual(res.frames[3].usage, { inputTokens: 10, outputTokens: 4 });

  const options = fakeLlm.lastOptions;
  assert.equal(options.sessionId, undefined);
  assert.equal(options.tools, undefined);
  assert.equal(options.purpose, 'quick-chat');
  assert.equal(options.maxTokens, 2048);
  assert.match(options.system, /不调用工具/u);
  assert.equal(options.messages.length, 2);
  assert.equal(options.messages[0].role, 'user');
  assert.match(options.messages[0].content[0].text, /^> MCP$/mu);
  assert.equal(options.messages[1].content[0].text, '什么是 MCP？');
  route.dispose();
});

test('模型失败帧保留稳定错误码', async () => {
  const failing = {
    listProviders: () => [{ id: 'test-provider' }],
    listModels: async () => [{ id: 'test-model' }],
    async *stream() {
      yield { type: 'text-delta', text: '部分' };
      yield { type: 'finish', reason: { kind: 'error', failure: { code: 'RATE_LIMIT', message: 'slow down' } } };
    },
  };
  const route = createContext({ llm: failing, agentDefaultModel: defaultModel });
  const res = await run(route, createRequest({ messages: [{ role: 'user', content: 'q' }] }));
  const frames = res.frames;
  assert.deepEqual(
    frames.map((frame) => frame.type),
    ['start', 'delta', 'error'],
  );
  assert.equal(frames[2].code, 'RATE_LIMIT');
  route.dispose();
});

test('没有可用模型时在流内返回 NO_MODEL 错误帧', async () => {
  const empty = {
    listProviders: () => [],
    listModels: async () => [],
    async *stream() {},
  };
  const route = createContext({ llm: empty, agentDefaultModel: undefined });
  const res = await run(route, createRequest({ messages: [{ role: 'user', content: 'q' }] }));
  // 兜底通道也要先开流再报错：客户端只处理一种响应形态。
  assert.equal(res.status, 200);
  assert.equal(res.frames.at(-1).type, 'error');
  assert.equal(res.frames.at(-1).code, 'NO_MODEL');
  route.dispose();
});

test('没有 llm 服务时在流内返回 NO_LLM 错误帧', async () => {
  const route = createContext({ llm: undefined, agentDefaultModel: undefined });
  const res = await run(route, createRequest({ messages: [{ role: 'user', content: 'q' }] }));
  assert.equal(res.status, 200);
  assert.equal(res.frames.at(-1).type, 'error');
  assert.equal(res.frames.at(-1).code, 'NO_LLM');
  route.dispose();
});

test('非法请求体、非法消息、错误方法、错误路径都被拒绝', async () => {
  const route = createContext({ llm: fakeLlm, agentDefaultModel: defaultModel });

  const badJson = await run(route, createRequest('{oops'));
  assert.equal(badJson.status, 400);
  assert.equal(JSON.parse(badJson.text).error.code, 'bad-json');

  const badRole = await run(
    route,
    createRequest({ messages: [{ role: 'system', content: 'x' }] }),
  );
  assert.equal(badRole.status, 400);
  assert.equal(JSON.parse(badRole.text).error.code, 'bad-message');

  const wrongMethod = await run(route, createRequest({}, '/vt-quick-chat/api/chat', 'GET'));
  assert.equal(wrongMethod.status, 405);

  const wrongPath = await run(route, createRequest({}, '/vt-quick-chat/api/nope'));
  assert.equal(wrongPath.status, 404);
  route.dispose();
});

test('连接鉴权拒绝时返回 403', async () => {
  const route = createContext({
    llm: fakeLlm,
    agentDefaultModel: defaultModel,
    connection: { requestRejection: () => 'cross-origin' },
  });
  const res = await run(route, createRequest({ messages: [{ role: 'user', content: 'q' }] }));
  assert.equal(res.status, 403);
  assert.equal(JSON.parse(res.text).error.code, 'forbidden');
  route.dispose();
});

test('客户端断开时把 abort 传给 llm.stream', async () => {
  let aborted = false;
  const hanging = {
    listProviders: () => [{ id: 'test-provider' }],
    listModels: async () => [{ id: 'test-model' }],
    async *stream(options) {
      yield { type: 'text-delta', text: 'a' };
      await new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          'abort',
          () => {
            aborted = true;
            reject(new Error('aborted'));
          },
          { once: true },
        );
      });
    },
  };
  const route = createContext({ llm: hanging, agentDefaultModel: defaultModel });
  const req = createRequest({ messages: [{ role: 'user', content: 'q' }] });
  const res = new FakeResponse();
  const pending = route.handler(req, res);
  // 等 start 帧写出来，确认流已经开始。
  await new Promise((resolve) => setTimeout(resolve, 20));
  res.destroy();
  await pending;
  assert.equal(aborted, true);
  route.dispose();
});

test('settings 路由：GET 返回设置与默认提示词，POST 落盘并可读回', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'vtqc-settings-'));
  process.env.VT_QUICK_CHAT_SETTINGS = path.join(dir, 'settings.json');
  try {
    const app = createContext({ connection: undefined, llm: undefined });

    const getRes = new FakeResponse();
    await app.handler(createRequest({}, '/vt-quick-chat/api/settings', 'GET'), getRes);
    assert.equal(getRes.status, 200);
    const read = JSON.parse(getRes.text);
    assert.equal(read.ok, true);
    assert.equal(read.value.settings.provider, 'follow');
    assert.equal(read.value.settings.webByDefault, false);
    assert.ok(read.value.defaultPrompt.length > 0);
    assert.deepEqual(read.value.providers, []);

    const postRes = new FakeResponse();
    await app.handler(
      createRequest(
        { systemPrompt: '只说重点', provider: 'deepseek::deepseek-flash', webByDefault: true, deepThinkByDefault: true },
        '/vt-quick-chat/api/settings',
        'POST',
      ),
      postRes,
    );
    assert.equal(postRes.status, 200);
    const saved = JSON.parse(postRes.text);
    assert.equal(saved.value.settings.systemPrompt, '只说重点');
    assert.equal(saved.value.settings.provider, 'deepseek::deepseek-flash');
    assert.equal(saved.value.settings.webByDefault, true);

    const again = new FakeResponse();
    await app.handler(createRequest({}, '/vt-quick-chat/api/settings', 'GET'), again);
    assert.equal(JSON.parse(again.text).value.settings.deepThinkByDefault, true);
    app.dispose();
  } finally {
    delete process.env.VT_QUICK_CHAT_SETTINGS;
    await rm(dir, { recursive: true, force: true });
  }
});

// ── /quick-chat 命令与事件流 ────────────────────────────────────────────

/** 造一个只记录注册的 commands 服务。 */
function commandRecorder() {
  const registered = [];
  return {
    registered,
    register(definition) {
      registered.push(definition);
      return () => {};
    },
  };
}

test('/quick-chat 命令：名字、说明、输入提示都合契约', () => {
  const commands = commandRecorder();
  const route = createContext({ commands });
  try {
    assert.equal(commands.registered.length, 1);
    const command = commands.registered[0];
    assert.equal(command.name, 'quick-chat');
    assert.match(command.name, /^[a-z][a-z0-9_-]*$/u);
    assert.ok(command.description.trim().length > 0);
    assert.ok(command.input.hint.trim().length > 0);
    assert.equal(typeof command.handler, 'function');
  } finally {
    route.dispose();
  }
});

test('/quick-chat 命令把后面的文字当草稿推给客户端，并回报成功', async () => {
  const commands = commandRecorder();
  const route = createContext({ commands });
  const stream = new FakeResponse();
  const events = new FakeResponse();
  try {
    await route.handler(createRequest('', '/vt-quick-chat/api/events', 'GET'), events);
    assert.equal(events.status, 200);
    assert.match(events.headers['content-type'], /text\/event-stream/u);
    assert.match(events.text, /: quick-chat events/u);

    const result = commands.registered[0].handler({ rawInput: '  什么是 MCP  ' });
    assert.deepEqual(plain(result), { kind: 'success', text: '已打开快捷提问' });
    assert.match(events.text, /"type":"open"/u);
    assert.match(events.text, /"prompt":"什么是 MCP"/u);
  } finally {
    events.end();
    stream.destroy();
    route.dispose();
  }
});

test('没有 commands 服务时不注册命令，也不影响路由', async () => {
  const route = createContext({});
  try {
    const res = await run(route, createRequest({ messages: [{ role: 'user', content: 'hi' }] }));
    assert.equal(res.status, 200);
  } finally {
    route.dispose();
  }
});

test('事件流只接受 GET，且与非授权连接隔离', async () => {
  const commands = commandRecorder();
  const route = createContext({ commands });
  try {
    const wrongMethod = new FakeResponse();
    await route.handler(createRequest('', '/vt-quick-chat/api/events', 'POST'), wrongMethod);
    assert.equal(wrongMethod.status, 405);

    const denied = createContext({
      commands: commandRecorder(),
      connection: { requestRejection: () => ({ status: 403 }) },
    });
    try {
      const res = new FakeResponse();
      await denied.handler(createRequest('', '/vt-quick-chat/api/events', 'GET'), res);
      assert.equal(res.status, 403);
    } finally {
      denied.dispose();
    }
  } finally {
    route.dispose();
  }
});
