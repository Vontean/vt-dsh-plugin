/**
 * 纯函数：把上游余额/额度响应归一化成 Client 能直接渲染的形状。
 *
 * 这些函数不读环境、不发请求，方便在开发期用 node --test 固定住两种
 * OpenCode 响应格式和 DeepSeek 的金额字段。
 */

/** OpenCode Go 的三个额度窗口，顺序就是侧边栏里的显示顺序。 */
const WINDOW_DESCRIPTORS = [
  {
    key: 'rolling',
    aliases: ['rolling', '5h', '5-hour', 'five-hour', '5hour'],
  },
  {
    key: 'weekly',
    aliases: ['weekly', 'week', '7d'],
  },
  {
    key: 'monthly',
    aliases: ['monthly', 'month', '30d'],
  },
];

/**
 * 宽容地读一个金额/百分比。
 * @param {unknown} value 上游值，可能是 number 或带逗号/货币符号的 string。
 * @returns {number | null} 有限数字，或 null。
 */
function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[,\s¥$€£]/g, '');
  if (cleaned === '') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 金额统一保留两位小数；读不出数字时保留原始字符串，避免显示 0.00 误导。
 * @param {unknown} value 上游金额。
 * @returns {string | null} 展示用金额。
 */
function formatAmount(value) {
  const parsed = toNumber(value);
  if (parsed !== null) return parsed.toFixed(2);
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return null;
}

/**
 * DeepSeek API Key 的 /user/balance 响应。
 * @param {unknown} payload 上游 JSON。
 * @returns {{kind: 'balance', currency: 'CNY' | 'USD', amount: string | null, available: boolean, detail: object}}
 */
export function normalizeDeepSeekBalance(payload) {
  const source = payload !== null && typeof payload === 'object' ? payload : {};
  const infos = Array.isArray(source.balance_infos)
    ? source.balance_infos.filter((entry) => entry !== null && typeof entry === 'object')
    : [];
  // 用户在中国区通常只有 CNY；有 CNY 时优先它，避免 USD 赠金把主余额换掉。
  const info = infos.find((entry) => String(entry.currency).toUpperCase() === 'CNY') ?? infos[0] ?? null;
  const currency = String(info?.currency).toUpperCase() === 'USD' ? 'USD' : 'CNY';
  const detail = {};
  if (info?.granted_balance !== undefined && info?.granted_balance !== null) {
    detail.granted = formatAmount(info.granted_balance);
  }
  if (info?.topped_up_balance !== undefined && info?.topped_up_balance !== null) {
    detail.toppedUp = formatAmount(info.topped_up_balance);
  }
  return {
    kind: 'balance',
    currency,
    amount: formatAmount(info?.total_balance),
    available: source.is_available !== false,
    detail,
  };
}

/**
 * DeepSeek 账号的 getBalance 结果（充值钱包 + 赠金钱包）。
 * @param {unknown} wallets 充值钱包数组。
 * @param {unknown} bonusWallets 赠金钱包数组。
 * @returns {{kind: 'balance', currency: 'CNY' | 'USD', amount: string | null, available: boolean, detail: object}}
 */
export function normalizeAccountBalance(wallets, bonusWallets) {
  const recharge = Array.isArray(wallets)
    ? wallets.filter((entry) => entry !== null && typeof entry === 'object')
    : [];
  const bonus = Array.isArray(bonusWallets)
    ? bonusWallets.filter((entry) => entry !== null && typeof entry === 'object')
    : [];
  /** @type {Map<string, {currency: 'CNY' | 'USD', total: number, known: boolean, raw: string | null, toppedUp: number, granted: number}>} */
  const byCurrency = new Map();

  /** @param {object[]} list @param {'recharge' | 'bonus'} bucket */
  const add = (list, bucket) => {
    for (const wallet of list) {
      const currency = String(wallet.currency).toUpperCase() === 'USD' ? 'USD' : 'CNY';
      const entry = byCurrency.get(currency) ?? {
        currency,
        total: 0,
        known: true,
        raw: null,
        toppedUp: 0,
        granted: 0,
      };
      const amount = toNumber(wallet.balance);
      if (amount === null) {
        entry.known = false;
        if (entry.raw === null && typeof wallet.balance === 'string' && wallet.balance.trim() !== '') {
          entry.raw = wallet.balance.trim();
        }
      } else {
        entry.total += amount;
        if (bucket === 'recharge') entry.toppedUp += amount;
        else entry.granted += amount;
      }
      byCurrency.set(currency, entry);
    }
  };

  add(recharge, 'recharge');
  add(bonus, 'bonus');

  const entry = byCurrency.get('CNY') ?? [...byCurrency.values()][0] ?? null;
  if (entry === null) {
    return { kind: 'balance', currency: 'CNY', amount: '0.00', available: true, detail: {} };
  }

  const detail = {};
  if (entry.toppedUp > 0) detail.toppedUp = entry.toppedUp.toFixed(2);
  if (entry.granted > 0) detail.granted = entry.granted.toFixed(2);

  return {
    kind: 'balance',
    currency: entry.currency,
    amount: entry.known ? entry.total.toFixed(2) : entry.raw,
    available: true,
    detail,
  };
}

/**
 * OpenCode Go 的 /zen/go/v1/usage 响应。
 *
 * 现行格式：
 *   { usage: { rolling: { status, percent, resetsAt }, weekly, monthly } }
 * 早期格式：
 *   { windows: [{ name, status, usagePercent, resetsAt, resetInSec, used, limit }] }
 *
 * @param {unknown} payload 上游 JSON。
 * @returns {{kind: 'windows', windows: object[]} | null} 无法识别时返回 null。
 */
export function normalizeOpenCodeUsage(payload) {
  const source = payload !== null && typeof payload === 'object' ? payload : {};
  const usage =
    source.usage !== null && typeof source.usage === 'object' && !Array.isArray(source.usage) ? source.usage : null;
  const legacy = Array.isArray(source.windows) ? source.windows : null;
  if (usage === null && legacy === null) return null;

  return {
    kind: 'windows',
    windows: WINDOW_DESCRIPTORS.map((descriptor) => {
      const raw = usage !== null ? usage[descriptor.key] : findLegacyWindow(legacy, descriptor.aliases);
      return normalizeWindow(descriptor.key, raw);
    }),
  };
}

/**
 * 在早期 windows[] 数组里按名称找对应窗口。
 * @param {object[]} windows 上游窗口数组。
 * @param {string[]} aliases 允许的名称。
 * @returns {object | null}
 */
function findLegacyWindow(windows, aliases) {
  for (const window of windows) {
    if (window === null || typeof window !== 'object') continue;
    const name = typeof window.name === 'string' ? window.name.toLowerCase().replace(/[_\s]+/g, '-') : '';
    if (aliases.includes(name)) return window;
  }
  return null;
}

/**
 * 归一化单个窗口。缺失窗口保留为 null 百分比，让 UI 显示 “—”，而不是整块消失。
 * @param {'rolling' | 'weekly' | 'monthly'} key 窗口 key。
 * @param {unknown} raw 上游窗口对象。
 * @returns {{key: string, remainingPercent: number | null, usedPercent: number | null, status: string, resetsAt: string | null}}
 */
function normalizeWindow(key, raw) {
  if (raw === null || typeof raw !== 'object') {
    return { key, remainingPercent: null, usedPercent: null, status: 'unknown', resetsAt: null };
  }

  const status = typeof raw.status === 'string' ? raw.status.toLowerCase() : 'unknown';
  let usedPercent = toNumber(raw.percent);
  if (usedPercent === null) usedPercent = toNumber(raw.usagePercent);
  if (usedPercent === null) {
    const used = toNumber(raw.used);
    const limit = toNumber(raw.limit);
    if (used !== null && limit !== null && limit > 0) usedPercent = (used / limit) * 100;
  }
  if (usedPercent !== null) usedPercent = Math.min(100, Math.max(0, usedPercent));

  let remainingPercent = usedPercent === null ? null : 100 - usedPercent;
  if (status === 'rate-limited') remainingPercent = 0;
  if (status === 'unlimited') remainingPercent = 100;

  let resetsAt =
    typeof raw.resetsAt === 'string' ? raw.resetsAt : typeof raw.resets_at === 'string' ? raw.resets_at : null;
  const resetInSec = toNumber(raw.resetInSec);
  if (resetsAt === null && resetInSec !== null) {
    resetsAt = new Date(Date.now() + resetInSec * 1000).toISOString();
  }

  return {
    key,
    // 保留一位小数；Client 再取整。避免 99.6 被显示成 100%。
    remainingPercent: remainingPercent === null ? null : Math.round(remainingPercent * 10) / 10,
    usedPercent,
    status,
    resetsAt,
  };
}
