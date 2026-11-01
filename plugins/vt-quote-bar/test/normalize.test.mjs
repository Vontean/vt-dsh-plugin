import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAccountBalance,
  normalizeDeepSeekBalance,
  normalizeOpenCodeUsage,
} from '../lib/normalize.js';

test('DeepSeek balance prefers CNY and includes granted/topped-up detail', () => {
  const value = normalizeDeepSeekBalance({
    is_available: true,
    balance_infos: [
      { currency: 'USD', total_balance: '3.00', granted_balance: '1.00', topped_up_balance: '2.00' },
      { currency: 'CNY', total_balance: '110.00', granted_balance: '10.00', topped_up_balance: '100.00' },
    ],
  });
  assert.equal(value.kind, 'balance');
  assert.equal(value.currency, 'CNY');
  assert.equal(value.amount, '110.00');
  assert.equal(value.available, true);
  assert.deepEqual(value.detail, { granted: '10.00', toppedUp: '100.00' });
});

test('DeepSeek balance reports unavailable and tolerates missing fields', () => {
  const unavailable = normalizeDeepSeekBalance({ is_available: false, balance_infos: [] });
  assert.equal(unavailable.available, false);
  assert.equal(unavailable.amount, null);

  const empty = normalizeDeepSeekBalance({});
  assert.equal(empty.currency, 'CNY');
  assert.equal(empty.amount, null);
  assert.equal(empty.available, true);
});

test('DeepSeek balance keeps a raw string when the amount is not numeric', () => {
  const value = normalizeDeepSeekBalance({
    balance_infos: [{ currency: 'CNY', total_balance: '待结算' }],
  });
  assert.equal(value.amount, '待结算');
});

test('account balance merges recharge and bonus wallets of the same currency', () => {
  const value = normalizeAccountBalance(
    [{ currency: 'CNY', balance: '10.00' }],
    [{ currency: 'CNY', balance: '2.50' }],
  );
  assert.equal(value.amount, '12.50');
  assert.equal(value.currency, 'CNY');
  assert.deepEqual(value.detail, { toppedUp: '10.00', granted: '2.50' });
});

test('account balance falls back to USD and handles an empty wallet list', () => {
  const usd = normalizeAccountBalance([{ currency: 'USD', balance: '4.20' }], []);
  assert.equal(usd.currency, 'USD');
  assert.equal(usd.amount, '4.20');

  const empty = normalizeAccountBalance([], []);
  assert.equal(empty.amount, '0.00');
  assert.equal(empty.available, true);
});

test('OpenCode usage reads the current merged shape', () => {
  const value = normalizeOpenCodeUsage({
    usage: {
      rolling: { status: 'ok', percent: 52, resetsAt: '2026-09-23T00:34:52.704Z' },
      weekly: { status: 'ok', percent: 20, resetsAt: '2026-09-28T00:00:00.000Z' },
      monthly: { status: 'ok', percent: 61, resetsAt: '2026-09-25T14:30:41.000Z' },
    },
  });
  assert.equal(value.kind, 'windows');
  assert.deepEqual(
    value.windows.map((window) => [window.key, window.remainingPercent]),
    [
      ['rolling', 48],
      ['weekly', 80],
      ['monthly', 39],
    ],
  );
  assert.equal(value.windows[0].resetsAt, '2026-09-23T00:34:52.704Z');
});

test('OpenCode usage handles a rate-limited window, a missing window and clamped percent', () => {
  const value = normalizeOpenCodeUsage({
    usage: {
      rolling: { status: 'rate-limited', percent: 100, resetsAt: '2026-09-23T00:34:52.704Z' },
      monthly: { status: 'ok', percent: 140, resetsAt: '2026-09-25T14:30:41.000Z' },
    },
  });
  assert.equal(value.windows[0].remainingPercent, 0);
  assert.equal(value.windows[1].remainingPercent, null);
  assert.equal(value.windows[1].status, 'unknown');
  assert.equal(value.windows[2].remainingPercent, 0);
});

test('OpenCode usage reads the legacy windows[] shape and derives resetsAt', () => {
  const value = normalizeOpenCodeUsage({
    windows: [
      { name: 'rolling', status: 'ok', usagePercent: 25, resetInSec: 3600 },
      { name: 'weekly', status: 'ok', used: 3, limit: 12 },
      { name: 'monthly', status: 'ok', usagePercent: 0 },
    ],
  });
  assert.equal(value.windows[0].remainingPercent, 75);
  assert.equal(value.windows[0].usedPercent, 25);
  assert.ok(value.windows[0].resetsAt);
  assert.equal(value.windows[1].remainingPercent, 75);
  assert.equal(value.windows[2].remainingPercent, 100);
});

test('OpenCode usage treats unlimited as full and rejects an unknown payload', () => {
  const unlimited = normalizeOpenCodeUsage({
    usage: { rolling: { status: 'unlimited' }, weekly: { status: 'ok', percent: 10 }, monthly: { status: 'ok', percent: 20 } },
  });
  assert.equal(unlimited.windows[0].remainingPercent, 100);

  assert.equal(normalizeOpenCodeUsage(null), null);
  assert.equal(normalizeOpenCodeUsage({ plan: 'go' }), null);
  assert.equal(normalizeOpenCodeUsage({ windows: 'nope' }), null);
});
