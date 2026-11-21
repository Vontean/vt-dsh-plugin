/**
 * `/webchat` 的接口与代理测试：静态托管、保留设置、凭据选择、转发目标。
 * 用最小 req/res 替身调用真实处理器，不启动 HTTP 服务。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import test from 'node:test';

const settingsPath = path.join(os.tmpdir(), `vt-web-chat-test-${process.pid}.json`);
process.env.VT_WEB_CHAT_SETTINGS = settingsPath;

const { createHandler } = await import('../src/route.js');
const { resolveAuth } = await import('../src/auth.js');
const { normalizeSettings } = await import('../src/settings.js');
const { injectBootstrap } = await import('../src/maintenance.js');

/** 请求替身。 */
function request(method, url, { headers = {}, body } = {}) {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  stream.method = method;
  stream.url = url;
  stream.headers = headers;
  return stream;
}

/**
 * 响应替身：真的 Writable，代理的流式回灌走的就是它。
 * 只补齐 handler 会碰到的 ServerResponse 字段。
 */
function response() {
  const chunks = [];
  const res = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  res.statusCode = 0;
  res.headers = {};
  res.headersSent = false;
  res.writeHead = (status, headers = {}) => {
    res.statusCode = status;
    res.headers = { ...headers };
    res.headersSent = true;
    return res;
  };
  res.body = () => Buffer.concat(chunks).toString('utf8');
  return res;
}

/** 调一次处理器。 */
async function call(ctx, req) {
  const res = response();
  await createHandler(ctx)(req, res);
  return res;
}

test.after(async () => {
  await fs.rm(settingsPath, { force: true });
});

test('入口页注入启动闸门并改标题', async () => {
  const res = await call({ get: () => undefined }, request('GET', '/webchat/'));
  assert.equal(res.statusCode, 200);
  const html = res.body();
  assert.ok(html.includes('<title>DeepSeek Chat</title>'), '标题被改写');
  assert.ok(html.includes('chat-demo:api-key'), '占位密钥在启动前写入');
  assert.ok(html.includes('x-vtwc-cap'), '面板请求会带上能力令牌');
  assert.ok(!/<script defer src=/u.test(html), '入口脚本被摘下，改由闸门挂回');
  assert.ok(html.includes('/retention') === false, '不暴露内部路径');
});

test('/webchat 重定向到带斜杠的面板地址', async () => {
  const res = await call({ get: () => undefined }, request('GET', '/webchat'));
  assert.equal(res.statusCode, 301);
  assert.equal(res.headers.location, '/webchat/');
});

test('静态资源按 MIME 下发', async () => {
  const index = await fs.readFile(path.join(import.meta.dirname, '../webview/dist/index.html'), 'utf8');
  const entry = /src="([^"]+\.js)"/u.exec(index)[1];
  const res = await call({ get: () => undefined }, request('GET', `/webchat/${entry}`));
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /javascript/u);
  assert.ok(res.body().length > 0);
});

test('越界路径被拒绝', async () => {
  const res = await call({ get: () => undefined }, request('GET', '/webchat/%2e%2e%2f%2e%2e%2fpackage.json'));
  assert.equal(res.statusCode, 403);
});

test('不存在的产物给 404，非 GET 给 405', async () => {
  assert.equal((await call({ get: () => undefined }, request('GET', '/webchat/nope.js'))).statusCode, 404);
  assert.equal((await call({ get: () => undefined }, request('POST', '/webchat/'))).statusCode, 405);
});

test('保留设置默认 30 天，可改并回落非法值', async () => {
  const ctx = { get: () => undefined };
  const initial = await call(ctx, request('GET', '/webchat/api/settings'));
  assert.deepEqual(JSON.parse(initial.body()), { retentionDays: 30 });

  const saved = await call(ctx, request('POST', '/webchat/api/settings', { body: { retentionDays: 60 } }));
  assert.deepEqual(JSON.parse(saved.body()), { retentionDays: 60 });
  assert.deepEqual(JSON.parse(await fs.readFile(settingsPath, 'utf8')), { retentionDays: 60 });

  const invalid = await call(ctx, request('POST', '/webchat/api/settings', { body: { retentionDays: 7 } }));
  assert.deepEqual(JSON.parse(invalid.body()), { retentionDays: 30 }, '非法档位回落到默认值');

  const never = await call(ctx, request('POST', '/webchat/api/settings', { body: { retentionDays: 0 } }));
  assert.deepEqual(JSON.parse(never.body()), { retentionDays: 0 });
  assert.deepEqual(normalizeSettings({ retentionDays: 90 }), { retentionDays: 90 });
});

test('来源不可信时设置与代理都拒绝', async () => {
  const ctx = {
    get(name) {
      if (name === 'connection') return { requestRejection: () => 403 };
      return undefined;
    },
  };
  assert.equal((await call(ctx, request('GET', '/webchat/api/settings'))).statusCode, 403);
  assert.equal(
    (await call(ctx, request('POST', '/webchat/anthropic/v1/messages', { body: {} }))).statusCode,
    403,
  );
});

test('能力令牌 + 回环 + 同源可以穿过站点栅栏', async () => {
  const index = await call({ get: () => undefined }, request('GET', '/webchat/'));
  const cap = /var CAP = "([^"]+)"/u.exec(index.body())?.[1];
  assert.ok(cap !== undefined, '入口页下发能力令牌');

  const fence = {
    get(name) {
      if (name === 'connection') return { requestRejection: () => 403 };
      return undefined;
    },
  };

  const withCap = request('GET', '/webchat/api/settings', {
    headers: { 'x-vtwc-cap': cap, host: '127.0.0.1:8799', origin: 'http://127.0.0.1:8799' },
  });
  withCap.socket = { remoteAddress: '127.0.0.1' };
  assert.equal((await call(fence, withCap)).statusCode, 200);

  const wrongCap = request('GET', '/webchat/api/settings', {
    headers: { 'x-vtwc-cap': 'not-the-cap', host: '127.0.0.1:8799' },
  });
  wrongCap.socket = { remoteAddress: '127.0.0.1' };
  assert.equal((await call(fence, wrongCap)).statusCode, 403);

  const nonLoopback = request('GET', '/webchat/api/settings', {
    headers: { 'x-vtwc-cap': cap, host: '10.0.0.2:8799', origin: 'http://10.0.0.2:8799' },
  });
  nonLoopback.socket = { remoteAddress: '10.0.0.9' };
  assert.equal((await call(fence, nonLoopback)).statusCode, 403, '非回环来源不认令牌');
});

test('栅栏通过但无浏览器会话（桌面壳）时放行', async () => {
  // requestRejection = 401 表示 Host/Origin 已通过、只是没有浏览器 Cookie：
  // 桌面壳渲染进程走 IPC，不会带上 Cookie，这类请求必须放行。
  const ctx = {
    get(name) {
      if (name === 'connection') return { requestRejection: () => 401 };
      return undefined;
    },
  };
  const res = await call(ctx, request('GET', '/webchat/api/settings'));
  assert.equal(res.statusCode, 200);
});

test('桌面壳的 dsh-app 来源直接放行', async () => {
  const ctx = {
    get(name) {
      if (name === 'connection') return { requestRejection: () => 403 };
      return undefined;
    },
  };
  const res = await call(ctx, request('GET', '/webchat/api/settings', { headers: { origin: 'dsh-app://renderer' } }));
  assert.equal(res.statusCode, 200);
});

test('凭据顺序：账号优先，其次 API Key', async () => {
  const accountCtx = {
    get(name) {
      if (name === 'deepseekAccount') return { resolveToken: async () => 'account-token' };
      if (name === 'credentials') return { resolve: async () => ({ value: 'api-key' }) };
      return undefined;
    },
  };
  const viaAccount = await resolveAuth(accountCtx);
  assert.equal(viaAccount.via, 'account');
  assert.equal(viaAccount.headers['x-dsh-auth-token'], 'account-token');

  const keyCtx = {
    get(name) {
      if (name === 'deepseekAccount') return { resolveToken: async () => { throw new Error('signed out'); } };
      if (name === 'credentials') return { resolve: async () => ({ value: 'sk-test' }) };
      return undefined;
    },
  };
  const viaKey = await resolveAuth(keyCtx);
  assert.equal(viaKey.via, 'api-key');
  assert.equal(viaKey.headers['x-api-key'], 'sk-test');

  const empty = await resolveAuth({ get: () => undefined });
  assert.equal(empty, undefined);
});

test('没有凭据时代理返回 401 而不是打到上游', async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error('should not reach upstream');
  };
  try {
    const res = await call({ get: () => undefined }, request('POST', '/webchat/anthropic/v1/messages', { body: {} }));
    assert.equal(res.statusCode, 401);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = original;
  }
});

test('代理把请求拼到 api.deepseek.com 并注入凭据', async () => {
  const original = globalThis.fetch;
  const seen = {};
  globalThis.fetch = async (url, init) => {
    seen.url = String(url);
    seen.headers = init.headers;
    seen.method = init.method;
    return new Response('event: message_stop\ndata: {}\n\n', {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  };
  const ctx = {
    get(name) {
      if (name === 'deepseekAccount') return { resolveToken: async () => 'account-token' };
      return undefined;
    },
  };
  try {
    const res = await call(
      ctx,
      request('POST', '/webchat/anthropic/v1/messages', { headers: { 'content-type': 'application/json' }, body: { model: 'x' } }),
    );
    assert.equal(seen.url, 'https://api.deepseek.com/anthropic/v1/messages');
    assert.equal(seen.method, 'POST');
    assert.equal(seen.headers['x-dsh-auth-token'], 'account-token');
    assert.equal(seen.headers['anthropic-version'], '2023-06-01');
    assert.equal(res.statusCode, 200);
    assert.match(res.body(), /message_stop/u);
  } finally {
    globalThis.fetch = original;
  }
});

test('闸门在拿不到入口脚本时也能注入且不阻塞', () => {
  const result = injectBootstrap('<html><body><div id="root"></div></body></html>', 'cap-123');
  assert.equal(result.gated, false);
  assert.ok(result.html.includes('retention'));
});
