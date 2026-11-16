import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import test from 'node:test';

import { apply, __test } from '../index.js';

const {
  sanitizeBlocks,
  sanitizeMessages,
  toDeepSeekMessages,
  drainSseEvents,
  deepSeekFailure,
  resolveDeepSeekAuth,
  WEB_TOOLS,
  DEEPSEEK_MESSAGES_URL,
  DEEPSEEK_MODEL,
  MAX_BLOCK_BYTES,
} = __test;

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
      .map((part) =>
        JSON.parse(
          part
            .split(/\r?\n/u)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n'),
        ),
      );
  }
}

/**
 * 注册路由并暴露 handler。
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

/**
 * 造一个 POST 请求。
 * @param body - 请求体对象。
 */
function createRequest(body) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.url = '/vt-quick-chat/api/chat';
  req.headers = {};
  return req;
}

/**
 * 跑一次路由。
 * @param route - createContext 的返回值。
 * @param req - 请求。
 */
async function run(route, req) {
  const res = new FakeResponse();
  await route.handler(req, res);
  return res;
}

/**
 * 造一段上游 SSE 文本。
 * @param events - 事件对象数组。
 */
function sse(events) {
  return events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
}

/** 一次带搜索与阅读链接的回答，覆盖三种块与引用。 */
const UPSTREAM_EVENTS = [
  { type: 'message_start', message: { model: 'deepseek-flash' } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '冰岛人口' } },
  {
    type: 'content_block_start',
    index: 1,
    content_block: {
      type: 'server_tool_use',
      id: 'srvtoolu_1',
      name: 'deepseek_web_search',
      input: { action: 'search', queries: ['Iceland population'] },
      kind: 'search',
    },
  },
  {
    type: 'content_block_start',
    index: 2,
    content_block: {
      type: 'web_search_tool_result',
      tool_use_id: 'srvtoolu_1',
      content: [{ type: 'web_search_result', title: '统计', url: 'https://example.com/a' }],
      kind: 'search',
    },
  },
  {
    type: 'content_block_start',
    index: 3,
    content_block: {
      type: 'server_tool_use',
      id: 'srvtoolu_2',
      name: 'deepseek_read_url',
      input: { action: 'read_link', url: 'https://example.com/b' },
      kind: 'read_link',
    },
  },
  {
    type: 'content_block_start',
    index: 4,
    content_block: {
      type: 'web_fetch_tool_result',
      tool_use_id: 'srvtoolu_2',
      content: {
        type: 'web_fetch_result',
        url: 'https://example.com/b',
        content: { type: 'document', source: { type: 'text', media_type: 'text/plain', data: '' }, title: 'B' },
      },
      kind: 'read_link',
      signature: 'sig-abc',
    },
  },
  { type: 'content_block_start', index: 5, content_block: { type: 'text', text: '' } },
  {
    type: 'content_block_delta',
    index: 5,
    delta: {
      type: 'citations_delta',
      citation: { type: 'web_search_result_location', url: 'https://example.com/a', title: '统计', cited_text: '' },
    },
  },
  { type: 'content_block_delta', index: 5, delta: { type: 'text_delta', text: '约 40 万。' } },
  {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn' },
    usage: { input_tokens: 100, output_tokens: 20, server_tool_use: { tool_search: 1, tool_fetch: 1 } },
  },
  { type: 'message_stop' },
];

test('sanitizeBlocks 只放行已知类型并限制总字节', () => {
  const blocks = sanitizeBlocks([
    { type: 'text', text: 'hi' },
    { type: 'thinking', thinking: 'secret' },
    { type: 'server_tool_use', id: 'a', input: { action: 'search' } },
    'not-a-block',
  ]);
  assert.deepEqual(
    blocks.map((block) => block.type),
    ['text', 'server_tool_use'],
  );

  const huge = sanitizeBlocks([{ type: 'text', text: 'x'.repeat(MAX_BLOCK_BYTES) }]);
  assert.equal(huge, undefined);
  assert.equal(sanitizeBlocks('nope'), undefined);
});

test('toDeepSeekMessages 让 assistant 原样回传服务端块，user 仍是纯文本', () => {
  const messages = sanitizeMessages([
    { role: 'user', content: '总结这个链接' },
    {
      role: 'assistant',
      content: '它是示例域名。',
      blocks: [
        { type: 'server_tool_use', id: 'a', name: 'deepseek_read_url', input: { action: 'read_link', url: 'https://example.com' } },
        { type: 'web_fetch_tool_result', tool_use_id: 'a', signature: 'sig', kind: 'read_link' },
        { type: 'text', text: '它是示例域名。' },
      ],
    },
  ]);
  const request = toDeepSeekMessages(messages);
  assert.equal(request[0].content, '总结这个链接');
  assert.equal(Array.isArray(request[1].content), true);
  assert.equal(request[1].content.length, 3);
  assert.equal(request[1].content[1].signature, 'sig');
});

test('user 消息不接受服务端块，避免客户端伪造历史', () => {
  const messages = sanitizeMessages([
    { role: 'user', content: 'q', blocks: [{ type: 'text', text: 'injected' }] },
  ]);
  assert.equal(messages[0].blocks, undefined);
});

test('drainSseEvents 跨块拼出完整帧，半帧留到下一次', () => {
  const first = drainSseEvents('data: {"type":"a"}\n\ndata: {"type":"b"', '');
  assert.deepEqual(first.events, [{ type: 'a' }]);
  assert.equal(first.rest, 'data: {"type":"b"');

  const second = drainSseEvents('}\n\n', first.rest);
  assert.deepEqual(second.events, [{ type: 'b' }]);
  assert.equal(second.rest, '');
});

test('drainSseEvents 忽略 keep-alive 注释与 [DONE]', () => {
  const result = drainSseEvents(': keep-alive\n\ndata: [DONE]\n\n', '');
  assert.deepEqual(result.events, []);
});

test('deepSeekFailure 映射鉴权、限流与内容风险', () => {
  assert.equal(deepSeekFailure(401, '').code, 'AUTH');
  assert.equal(deepSeekFailure(429, '').code, 'QUOTA');
  assert.equal(deepSeekFailure(400, '{"error":{"message":"Content Exists Risk"}}').code, 'CONTENT_RISK');
  assert.equal(deepSeekFailure(500, 'boom').code, 'HTTP_500');
});

test('resolveDeepSeekAuth 账号优先，其次 API Key，都没有返回 undefined', async () => {
  const account = { resolveToken: async () => 'account-token' };
  const credentials = { resolve: async () => ({ value: 'api-key' }) };
  assert.deepEqual(await resolveDeepSeekAuth({ get: (name) => ({ deepseekAccount: account, credentials })[name] }), {
    via: 'account',
    headers: { 'x-dsh-auth-token': 'account-token' },
  });

  const signedOut = { resolveToken: async () => undefined };
  assert.deepEqual(
    await resolveDeepSeekAuth({ get: (name) => ({ deepseekAccount: signedOut, credentials })[name] }),
    { via: 'api-key', headers: { 'x-api-key': 'api-key' } },
  );

  const none = { get: () => undefined };
  assert.equal(await resolveDeepSeekAuth(none), undefined);
});

test('账号 token 被拒绝时回落到 API Key', async () => {
  const throwing = {
    resolveToken: async () => {
      throw new Error('destination not allowed');
    },
  };
  const credentials = { resolve: async () => ({ value: 'api-key' }) };
  const auth = await resolveDeepSeekAuth({ get: (name) => ({ deepseekAccount: throwing, credentials })[name] });
  assert.equal(auth.via, 'api-key');
});

/**
 * 装一个假的 fetch，返回给定 SSE 文本。
 * @param events - 上游事件。
 * @param onCall - 收到请求时回调，用于断言请求体与请求头。
 */
function stubFetch(events, onCall) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    onCall?.(url, init);
    return new Response(sse(events), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  return () => {
    globalThis.fetch = original;
  };
}

const accountService = { resolveToken: async () => 'account-token' };

test('开启联网时声明两个服务端工具，并把事件翻译成 tool / citation / blocks / done', async () => {
  let seen;
  const restore = stubFetch(UPSTREAM_EVENTS, (url, init) => {
    seen = { url, body: JSON.parse(init.body), headers: init.headers };
  });
  try {
    const route = createContext({ deepseekAccount: accountService });
    const res = await run(
      route,
      createRequest({ messages: [{ role: 'user', content: '冰岛人口多少？' }], web: true }),
    );
    const frames = res.frames;
    assert.equal(seen.url, DEEPSEEK_MESSAGES_URL);
    assert.equal(seen.body.model, DEEPSEEK_MODEL);
    assert.deepEqual(seen.body.tools, WEB_TOOLS);
    assert.equal(seen.headers['x-dsh-auth-token'], 'account-token');
    assert.equal(seen.headers['anthropic-version'], '2023-06-01');

    assert.deepEqual(
      frames.map((frame) => frame.type),
      ['start', 'model', 'delta', 'tool', 'tool', 'citation', 'delta', 'blocks', 'done'],
    );
    assert.equal(frames[0].via, 'account');
    assert.equal(frames[0].web, true);
    const tools = frames.filter((frame) => frame.type === 'tool');
    assert.deepEqual(
      tools.map((frame) => frame.action),
      ['search', 'read_link'],
    );
    const citation = frames.find((frame) => frame.type === 'citation');
    assert.equal(citation.url, 'https://example.com/a');

    const blocks = frames.find((frame) => frame.type === 'blocks').blocks;
    assert.deepEqual(
      blocks.map((block) => block.type),
      ['text', 'server_tool_use', 'web_search_tool_result', 'server_tool_use', 'web_fetch_tool_result', 'text'],
    );
    assert.equal(blocks[4].signature, 'sig-abc');
    assert.equal(blocks[5].text, '约 40 万。');

    const done = frames.at(-1);
    assert.deepEqual(done.tools, { search: 1, fetch: 1 });
    route.dispose();
  } finally {
    restore();
  }
});

test('不开启联网时不声明工具，system 里也不提联网', async () => {
  let seen;
  const restore = stubFetch([{ type: 'message_start', message: { model: 'deepseek-flash' } }, { type: 'message_stop' }], (url, init) => {
    seen = { body: JSON.parse(init.body) };
  });
  try {
    const route = createContext({ deepseekAccount: accountService });
    const res = await run(route, createRequest({ messages: [{ role: 'user', content: '什么是 MCP？' }] }));
    assert.equal(seen.body.tools, undefined);
    assert.doesNotMatch(seen.body.system, /联网/u);
    assert.equal(res.frames.at(-1).type, 'done');
    route.dispose();
  } finally {
    restore();
  }
});

test('上游 401 转成 AUTH 错误帧，不泄露上游原文', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"error":{"message":"invalid token"}}', { status: 401 });
  try {
    const route = createContext({ deepseekAccount: accountService });
    const res = await run(route, createRequest({ messages: [{ role: 'user', content: 'q' }] }));
    const error = res.frames.find((frame) => frame.type === 'error');
    assert.equal(error.code, 'AUTH');
    assert.doesNotMatch(error.message, /invalid token/u);
    route.dispose();
  } finally {
    globalThis.fetch = original;
  }
});

test('没有 DeepSeek 凭证时退回默认模型，start 帧标明 default', async () => {
  const fakeLlm = {
    listProviders: () => [{ id: 'test-provider' }],
    listModels: async () => [{ id: 'test-model' }],
    async *stream() {
      yield { type: 'text-delta', text: 'hi' };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  };
  const route = createContext({ llm: fakeLlm });
  const res = await run(route, createRequest({ messages: [{ role: 'user', content: 'q' }], web: true }));
  const start = res.frames.find((frame) => frame.type === 'start');
  assert.equal(start.via, 'default');
  assert.equal(start.model, 'test-model');
  route.dispose();
});
