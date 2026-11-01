import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../index.js';

const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});

/**
 * Build a fake Host context, run apply(), and expose the captured route handler.
 * @param {{connection?: object, credentials?: object, account?: object, settings?: object}} overrides
 */
function createHarness(overrides = {}) {
  const services = new Map();
  const configurable = [
    {
      provider: 'deepseek-official',
      displayName: 'DeepSeek',
      settingsNs: 'llm-deepseek',
      settingsPath: [],
    },
    {
      provider: 'opencode-go',
      displayName: 'opencode-go',
      settingsNs: 'llm-pi-ai',
      settingsPath: ['providers', 'opencode-go'],
    },
  ];
  const settings =
    overrides.settings ??
    {
      describe: () => [
        { ns: 'llm-deepseek', value: { apiKeyEnv: 'DEEPSEEK_API_KEY' } },
        {
          ns: 'llm-pi-ai',
          value: {
            providers: {
              'opencode-go': {
                apiKeyEnv: 'OPENCODE_GO_API_KEY',
                headers: { 'x-opencode-session': 'test-session' },
              },
            },
          },
        },
      ],
    };
  const credentials =
    overrides.credentials ??
    {
      describe: async () => ({ configured: true }),
      resolve: async (ref) => ({ value: `${ref}-value` }),
    };
  const account =
    overrides.account ??
    {
      getState: async () => ({ status: 'credential-stored' }),
      getBalance: async () => ({
        status: 'ready',
        value: [{ currency: 'CNY', balance: '10.00' }],
        bonusWallets: [{ currency: 'CNY', balance: '2.00' }],
      }),
    };

  if (overrides.connection !== undefined) services.set('connection', overrides.connection);
  services.set('credentials', credentials);
  services.set('settings', settings);
  services.set('deepseekAccount', account);
  services.set('agentDefaultModel', { currentSelection: () => ({ provider: 'opencode-go' }) });

  let route = null;
  const ctx = {
    effect(callback) {
      const dispose = callback();
      return () => {
        if (typeof dispose === 'function') dispose();
      };
    },
    get(name) {
      return services.get(name);
    },
    llm: {
      listProviders: () => [
        { id: 'deepseek-account', name: 'DeepSeek Account' },
        { id: 'deepseek-official', name: 'DeepSeek' },
        { id: 'opencode-go', name: 'opencode-go' },
      ],
      listConfigurableProviders: () => configurable,
    },
    webServer: {
      register(value) {
        route = value;
        return () => {};
      },
    },
  };

  apply(ctx);

  /**
   * @param {string} method
   * @param {object} [body]
   */
  async function call(method, body) {
    const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
    const req = {
      method: 'POST',
      url: `/vt-quote-bar/api/${method}`,
      headers: {},
      async *[Symbol.asyncIterator]() {
        for (const chunk of chunks) yield chunk;
      },
    };
    const res = {
      status: 0,
      headers: {},
      body: '',
      writeHead(status, headers) {
        this.status = status;
        this.headers = headers ?? {};
      },
      end(value) {
        this.body = value ?? '';
      },
    };
    await route.handler(req, res);
    return {
      status: res.status,
      headers: res.headers,
      body: res.body === '' ? null : JSON.parse(res.body),
    };
  }

  return { call, ctx };
}

/** Return a stub fetch that records calls. */
function stubFetch(handler) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
  globalThis.fetch = impl;
  return calls;
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('providers lists the three supported providers and picks the current model provider', async () => {
  const harness = createHarness();
  const result = await harness.call('providers');
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.deepEqual(
    result.body.value.providers.map((provider) => provider.id),
    ['deepseek-account', 'deepseek-official', 'opencode-go'],
  );
  assert.equal(result.body.value.defaultProviderId, 'opencode-go');
  assert.equal(result.body.value.refreshIntervalMs, 60000);
});

test('DeepSeek API key quota uses the fixed balance endpoint', async () => {
  const calls = stubFetch(() =>
    jsonResponse({
      is_available: true,
      balance_infos: [
        { currency: 'CNY', total_balance: '9.50', granted_balance: '1.50', topped_up_balance: '8.00' },
      ],
    }),
  );
  const harness = createHarness();
  const result = await harness.call('quota', { provider: 'deepseek-official' });
  assert.equal(result.status, 200);
  assert.equal(result.body.value.kind, 'balance');
  assert.equal(result.body.value.amount, '9.50');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.deepseek.com/user/balance');
  assert.equal(calls[0].init.headers.authorization, 'Bearer DEEPSEEK_API_KEY-value');
});

test('providers reports missing-key and signed-out states', async () => {
  const harness = createHarness({
    credentials: {
      describe: async () => ({ configured: false }),
      resolve: async () => undefined,
    },
    account: {
      getState: async () => ({ status: 'signed-out' }),
    },
  });
  const result = await harness.call('providers');
  const byId = new Map(result.body.value.providers.map((provider) => [provider.id, provider]));
  assert.equal(byId.get('deepseek-account').status, 'signed-out');
  assert.equal(byId.get('deepseek-official').status, 'missing-key');
  assert.equal(byId.get('opencode-go').status, 'missing-key');
});

test('DeepSeek account quota sums recharge and bonus wallets', async () => {
  const harness = createHarness();
  const result = await harness.call('quota', { provider: 'deepseek-account' });
  assert.equal(result.body.value.kind, 'balance');
  assert.equal(result.body.value.amount, '12.00');
  assert.deepEqual(result.body.value.detail, { toppedUp: '10.00', granted: '2.00' });
});

test('OpenCode quota normalizes three windows and sends the stored session header', async () => {
  const calls = stubFetch(() =>
    jsonResponse({
      usage: {
        rolling: { status: 'ok', percent: 40, resetsAt: '2026-11-01T05:00:00.000Z' },
        weekly: { status: 'ok', percent: 20, resetsAt: '2026-11-03T00:00:00.000Z' },
        monthly: { status: 'ok', percent: 10, resetsAt: '2026-11-21T00:00:00.000Z' },
      },
    }),
  );
  const harness = createHarness();
  const result = await harness.call('quota', { provider: 'opencode-go' });
  assert.equal(result.body.value.kind, 'windows');
  assert.deepEqual(
    result.body.value.windows.map((window) => [window.key, window.remainingPercent]),
    [
      ['rolling', 60],
      ['weekly', 80],
      ['monthly', 90],
    ],
  );
  assert.equal(calls[0].url, 'https://opencode.ai/zen/go/v1/usage');
  assert.equal(calls[0].init.headers['x-opencode-session'], 'test-session');
});

test('DeepSeek plain-text 401 maps to auth instead of a parse error', async () => {
  stubFetch(() => new Response('Authentication Fails (governor)', { status: 401 }));
  const harness = createHarness();
  const result = await harness.call('quota', { provider: 'deepseek-official' });
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.error.code, 'auth');
});

test('OpenCode 403 maps to no-subscription', async () => {
  stubFetch(() => jsonResponse({ error: { message: 'no subscription' } }, 403));
  const harness = createHarness();
  const result = await harness.call('quota', { provider: 'opencode-go' });
  assert.equal(result.body.ok, false);
  assert.equal(result.body.error.code, 'no-subscription');
});

test('missing credential reports no-key', async () => {
  const harness = createHarness({
    credentials: {
      describe: async () => ({ configured: false }),
      resolve: async () => undefined,
    },
  });
  const result = await harness.call('quota', { provider: 'opencode-go' });
  assert.equal(result.body.ok, false);
  assert.equal(result.body.error.code, 'no-key');
});

test('unknown provider is a 400 bad-provider', async () => {
  const harness = createHarness();
  const result = await harness.call('quota', { provider: 'nope' });
  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, 'bad-provider');
});

test('quota cache serves a second call and fresh bypasses it', async () => {
  let count = 0;
  stubFetch(() => {
    count += 1;
    return jsonResponse({
      usage: {
        rolling: { status: 'ok', percent: 1 },
        weekly: { status: 'ok', percent: 2 },
        monthly: { status: 'ok', percent: 3 },
      },
    });
  });
  const harness = createHarness();
  await harness.call('quota', { provider: 'opencode-go' });
  await harness.call('quota', { provider: 'opencode-go' });
  assert.equal(count, 1);
  await harness.call('quota', { provider: 'opencode-go', fresh: true });
  assert.equal(count, 2);
});

test('route rejects a disconnected request', async () => {
  const harness = createHarness({ connection: { requestRejection: () => 401 } });
  const result = await harness.call('providers');
  assert.equal(result.status, 403);
  assert.equal(result.body.error.code, 'forbidden');
});
