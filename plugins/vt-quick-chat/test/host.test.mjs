import assert from 'node:assert/strict';
import test from 'node:test';

import { __test } from '../index.js';

const {
  ApiError,
  sanitizeMessages,
  sanitizeSelection,
  selectionBlock,
  toRequestMessages,
  failureFrame,
  resolveTarget,
  firstAvailableTarget,
  SYSTEM_PROMPT,
} = __test;

test('sanitizeMessages 只保留 user / assistant 并截断到最近 40 条', () => {
  const input = Array.from({ length: 45 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `message-${index}`,
  }));
  const result = sanitizeMessages(input);
  assert.equal(result.length, 40);
  assert.equal(result[0].content, 'message-5');
  assert.equal(result.at(-1).content, 'message-44');
});

test('sanitizeMessages 拒绝非法角色、空文本与非数组', () => {
  assert.throws(() => sanitizeMessages('nope'), (error) => error instanceof ApiError && error.apiCode === 'bad-messages');
  assert.throws(
    () => sanitizeMessages([{ role: 'system', content: 'x' }]),
    (error) => error instanceof ApiError && error.apiCode === 'bad-message',
  );
  assert.throws(
    () => sanitizeMessages([{ role: 'user', content: '   ' }]),
    (error) => error instanceof ApiError && error.apiCode === 'bad-message',
  );
});

test('sanitizeMessages 截断单条超长消息', () => {
  const result = sanitizeMessages([{ role: 'user', content: 'x'.repeat(20_000) }]);
  assert.equal(result[0].content.length, 16_000);
});

test('sanitizeSelection 忽略非字符串并截断', () => {
  assert.equal(sanitizeSelection(undefined), '');
  assert.equal(sanitizeSelection('  hello  '), 'hello');
  assert.equal(sanitizeSelection('x'.repeat(9_000)).length, 8_000);
});

test('selectionBlock 用引用行包装，避免选中文本里的围栏破坏格式', () => {
  const block = selectionBlock('第一行\n```js\n第二行');
  assert.match(block, /^用户在界面上选中了这段文字/u);
  assert.match(block, /^> 第一行$/mu);
  assert.match(block, /^> ```js$/mu);
  assert.doesNotMatch(block, /^```/mu);
});

test('toRequestMessages 只产生 role + text block', () => {
  assert.deepEqual(toRequestMessages([{ role: 'user', content: 'hi' }]), [
    { role: 'user', content: [{ type: 'text', text: 'hi' }] },
  ]);
});

test('failureFrame 保留机器码，缺字段时给稳定兜底', () => {
  assert.deepEqual(failureFrame({ code: 'AUTH', message: 'bad key' }), {
    type: 'error',
    code: 'AUTH',
    message: 'bad key',
  });
  assert.deepEqual(failureFrame(undefined), { type: 'error', code: 'UNKNOWN', message: '模型请求失败。' });
});

test('SYSTEM_PROMPT 明确不执行任务、不调用工具', () => {
  assert.match(SYSTEM_PROMPT, /不调用工具/u);
  assert.match(SYSTEM_PROMPT, /不执行任务/u);
});

test('resolveTarget 优先使用仍可用的默认模型', async () => {
  const ctx = {
    get: (name) =>
      name === 'agentDefaultModel'
        ? { currentSelection: () => ({ provider: 'p2', model: 'm2' }) }
        : undefined,
  };
  const llm = {
    listProviders: () => [{ id: 'p1' }, { id: 'p2' }],
    listModels: async (provider) => [{ id: `${provider}-model` }],
  };
  assert.deepEqual(await resolveTarget(ctx, llm), { provider: 'p2', model: 'm2' });
});

test('resolveTarget 在默认 provider 已卸载时回退到第一个可用模型', async () => {
  const ctx = {
    get: () =>
      ({ currentSelection: () => ({ provider: 'gone', model: 'm' }) }),
  };
  const llm = {
    listProviders: () => [{ id: 'p1' }, { id: 'p2' }],
    listModels: async (provider) => (provider === 'p1' ? [] : [{ id: 'm2' }]),
  };
  assert.deepEqual(await resolveTarget(ctx, llm), { provider: 'p2', model: 'm2' });
});

test('firstAvailableTarget 跳过没有模型的 provider，全部为空时抛 NO_MODEL', async () => {
  const llm = {
    listProviders: () => [{ id: 'a' }, { id: 'b' }],
    listModels: async (provider) => (provider === 'a' ? [] : [{ id: 'mb' }]),
  };
  assert.deepEqual(await firstAvailableTarget(llm), { provider: 'b', model: 'mb' });

  await assert.rejects(
    firstAvailableTarget({ listProviders: () => [], listModels: async () => [] }),
    (error) => error instanceof ApiError && error.apiCode === 'NO_MODEL',
  );
});

test('resolveTarget 在默认模型缺失时仍能返回可用目标', async () => {
  const ctx = { get: () => undefined };
  const llm = {
    listProviders: () => [{ id: 'p1' }],
    listModels: async () => [{ id: 'm1' }],
  };
  assert.deepEqual(await resolveTarget(ctx, llm), { provider: 'p1', model: 'm1' });
});
