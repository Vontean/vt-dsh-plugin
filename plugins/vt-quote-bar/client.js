/**
 * dsh-vt-quote-bar — Client half.
 *
 * 一个侧边栏 footer 组件：provider 切换 + DeepSeek 余额或 OpenCode Go 的三条
 * 额度条。数据全部来自 Host 的同源路由，Client 不接触 API Key。
 *
 * 放置：`sidebar.footer.action` 在账号/设置行上方。宿主 CSS 是单行 flex，
 * 现有 Cordis 行占满一行；这里用 `flex: 0 0 100%` + 局部 `flex-wrap` 让额度
 * 区域换到下一行，因此顺序是「Cordis 行 → 额度区域 → 账号行」。
 */
window.__ModuleLoader__.load({
  id: 'dsh-vt-quote-bar',
  factory(require) {
    'use strict';

    const reactModule = require('react');
    const React =
      reactModule !== null && typeof reactModule.createElement === 'function'
        ? reactModule
        : reactModule.default;
    const h = React.createElement;

    /** 插件标识（与 package.json 的 name、cordis.patch.yml 的 name 一致）。 */
    const PLUGIN_ID = 'dsh-vt-quote-bar';
    /** 与 package.json 的 version 同值；只用于标注 DOM，便于确认加载的是哪一版。 */
    const VERSION = '1.0.1';

    /** Locale namespace owned by this plugin. */
    const NS = 'vtQuoteBar';
    /** Browser-only UI preference; Host never stores the selected provider. */
    const STORAGE_KEY = 'dsh-vt-quote-bar:provider';
    /** Relative route base; same-origin fetch carries the browser session. */
    const API_PREFIX = 'vt-quote-bar/api/';

    const DICT = {
      zh: {
        'provider.label': '选择模型提供商',
        'provider.deepseek-account': 'DeepSeek 账号',
        'provider.deepseek-official': 'DeepSeek',
        'provider.opencode-go': 'opencode-go',
        balance: '余额',
        'window.rolling': '5 小时',
        'window.weekly': '本周',
        'window.monthly': '本月',
        remaining: '剩余 {percent}%',
        unlimited: '不限',
        loading: '读取中…',
        refresh: '刷新额度',
        missingKey: '未配置 API Key',
        missingKeyHint: '在 设置 → 模型 中配置',
        signedOut: '未登录',
        noSubscription: '未订阅 Go',
        noSubscriptionHint: '在 OpenCode 控制台订阅 Go 后重试',
        auth: '密钥无效',
        authHint: '在 设置 → 模型 中检查 Key',
        network: '网络不可用',
        timeout: '请求超时',
        badResponse: '额度数据异常',
        upstream: '额度读取失败',
        rateLimited: '请求过于频繁',
        unsupported: '该提供商暂不支持额度查询',
        unknown: '暂时不可用',
        retry: '重试',
        resetAt: '重置于 {time}',
        updatedAt: '更新于 {time}',
        toppedUp: '充值',
        granted: '赠金',
        insufficient: '余额不足',
        expand: '展开额度',
        collapse: '收起额度',
        panel: '模型额度',
        ringLowest: '最低剩余 {percent}%（{window}）',
        ringBalance: '余额 {amount}',
        ringEmpty: '暂无额度数据',
      },
      en: {
        'provider.label': 'Choose a model provider',
        'provider.deepseek-account': 'DeepSeek Account',
        'provider.deepseek-official': 'DeepSeek',
        'provider.opencode-go': 'opencode-go',
        balance: 'Balance',
        'window.rolling': '5 hours',
        'window.weekly': 'This week',
        'window.monthly': 'This month',
        remaining: '{percent}% left',
        unlimited: 'Unlimited',
        loading: 'Loading…',
        refresh: 'Refresh quota',
        missingKey: 'No API key',
        missingKeyHint: 'Set it in Settings → Models',
        signedOut: 'Signed out',
        noSubscription: 'No Go subscription',
        noSubscriptionHint: 'Subscribe to Go in the OpenCode console, then retry',
        auth: 'Invalid key',
        authHint: 'Check the key in Settings → Models',
        network: 'Network unavailable',
        timeout: 'Request timed out',
        badResponse: 'Unexpected quota data',
        upstream: 'Could not read quota',
        rateLimited: 'Too many requests',
        unsupported: 'This provider has no quota endpoint',
        unknown: 'Temporarily unavailable',
        retry: 'Retry',
        resetAt: 'Resets {time}',
        updatedAt: 'Updated {time}',
        toppedUp: 'Topped up',
        granted: 'Granted',
        insufficient: 'Insufficient balance',
        expand: 'Expand quota',
        collapse: 'Collapse quota',
        panel: 'Model quota',
        ringLowest: '{percent}% left ({window})',
        ringBalance: 'Balance {amount}',
        ringEmpty: 'No quota data',
      },
    };

    /** 上游错误码 → 文案 key；只映射稳定码，不直接显示上游原文。 */
    const ERROR_KEYS = {
      'no-key': 'missingKey',
      'signed-out': 'signedOut',
      'no-subscription': 'noSubscription',
      auth: 'auth',
      'rate-limited': 'rateLimited',
      network: 'network',
      timeout: 'timeout',
      'bad-response': 'badResponse',
      upstream: 'upstream',
      unsupported: 'unsupported',
      'bad-provider': 'unknown',
    };

    /** 三条额度窗口的固定顺序。 */
    const WINDOW_ORDER = ['rolling', 'weekly', 'monthly'];

    /** 组件局部样式；挂在组件内，卸载即移除。 */
    const STYLE_TEXT = `
.vtq-root{width:100%;box-sizing:border-box;flex:0 0 100%;min-width:0;padding:0}
div:has(> .vtq-root),div:has(> [data-slot="sidebar.footer.action"] .vtq-root){flex-wrap:wrap}
.vtq-stage{overflow:hidden;transition:height .26s cubic-bezier(.2,0,0,1)}
.vtq-stage-inner{animation:vtq-content-in .2s ease}
.vtq-collapsed{box-sizing:border-box;width:100%;height:44px;display:flex;align-items:center;gap:8px;padding:6px;border:0;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;cursor:pointer;text-align:left;user-select:none}
.vtq-collapsed:hover{background:var(--dsw-alias-interactive-bg-hover)}
.vtq-collapsed:focus-visible{outline:2px solid var(--dsw-alias-label-primary);outline-offset:-2px}
.vtq-collapsed-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vtq-ring{position:relative;width:24px;height:24px;flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-primary)}
.vtq-ring svg{position:absolute;inset:0;width:24px;height:24px;transform:rotate(-90deg)}
.vtq-ring circle{transition:stroke-dashoffset .3s ease}
.vtq-ring-text{position:relative;font-size:8px;line-height:1;font-weight:500;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.vtq-ring-text[data-compact="true"]{font-size:8px}
.vtq-ring-text[data-symbol="true"]{font-size:9px;font-weight:500}
.vtq-expanded{box-sizing:border-box;display:flex;flex-direction:column;gap:2px;padding:4px 6px 8px}
.vtq-head{display:flex;align-items:center;gap:8px;min-width:0;height:28px}
.vtq-close{width:24px;height:24px;flex:none;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.vtq-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.vtq-close:focus-visible{outline:2px solid var(--dsw-alias-label-primary);outline-offset:1px}
.vtq-head-label{flex:1;min-width:0;font-size:12px;line-height:20px;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vtq-select-wrap{position:relative;display:flex;align-items:center;flex:1;min-width:0}
.vtq-select{box-sizing:border-box;appearance:none;-webkit-appearance:none;width:100%;min-width:0;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;font-weight:500;line-height:20px;padding:2px 24px 2px 8px;cursor:pointer;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;border-radius:6px}
.vtq-select:hover{background:var(--dsw-alias-interactive-bg-hover)}
.vtq-select:focus-visible{outline:2px solid var(--dsw-alias-label-primary);outline-offset:1px}
.vtq-chevron{position:absolute;right:8px;pointer-events:none;color:var(--dsw-alias-label-tertiary);flex:none}
.vtq-refresh{width:20px;height:20px;flex:none;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.vtq-refresh:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.vtq-refresh:focus-visible{outline:2px solid var(--dsw-alias-label-primary);outline-offset:1px}
.vtq-refresh[data-spinning="true"] svg{animation:vtq-spin .8s linear infinite}
.vtq-balance{display:flex;align-items:baseline;justify-content:space-between;gap:8px;min-width:0;padding:2px 0}
.vtq-balance-label{font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);white-space:nowrap}
.vtq-balance-value{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vtq-windows{display:flex;flex-direction:column;gap:2px}
.vtq-window{display:flex;align-items:center;gap:6px;min-width:0;line-height:16px}
.vtq-window-label{width:38px;flex:none;font-size:11px;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vtq-track{position:relative;flex:1;min-width:24px;height:4px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);overflow:hidden}
.vtq-fill{height:100%;border-radius:999px;background:var(--dsw-alias-label-tertiary);transition:width .2s ease}
.vtq-window-value{width:52px;flex:none;text-align:right;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vtq-note{font-size:11px;line-height:18px;color:var(--dsw-alias-label-tertiary);padding:1px 0}
.vtq-error{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;padding:1px 0}
.vtq-error-text{font-size:11px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.vtq-hint{font-size:10px;line-height:16px;color:var(--dsw-alias-label-tertiary);flex-basis:100%}
.vtq-retry{border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;line-height:18px;padding:0 2px;cursor:pointer;border-radius:4px;text-decoration:underline;text-underline-offset:2px}
.vtq-retry:hover{color:var(--dsw-alias-brand-primary)}
.vtq-retry:focus-visible{outline:2px solid var(--dsw-alias-label-primary);outline-offset:1px}
@keyframes vtq-spin{to{transform:rotate(360deg)}}
@keyframes vtq-content-in{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.vtq-stage{transition:none}.vtq-stage-inner{animation:none}.vtq-fill{transition:none}.vtq-ring circle{transition:none}.vtq-refresh[data-spinning="true"] svg{animation:none}}
`.trim();

    /** Set by `apply`; components fall back to it when injection is absent. */
    let translate = (key) => key;

    /**
     * 让组件跟随宿主语言切换重新渲染。
     * @param {object | undefined} locale Client locale service.
     * @returns {number} revision，仅用于触发渲染。
     */
    function useLocaleRevision(locale) {
      const [revision, setRevision] = React.useState(0);
      React.useEffect(() => {
        if (locale === undefined || locale === null || typeof locale.subscribe !== 'function') {
          return undefined;
        }
        return locale.subscribe(() => setRevision((value) => value + 1));
      }, [locale]);
      return revision;
    }

    /**
     * 插值：`剩余 {percent}%`。
     * @param {string} text 文案。
     * @param {Record<string, unknown> | undefined} vars 变量。
     * @returns {string}
     */
    function interpolate(text, vars) {
      if (vars === undefined || vars === null) return text;
      return text.replace(/\{(\w+)\}/g, (match, name) => {
        const value = vars[name];
        return value === undefined || value === null ? match : String(value);
      });
    }

    /**
     * 生成稳定的本地化时间；解析失败返回 null。
     * @param {string | null | undefined} iso ISO 时间。
     * @param {object | undefined} locale Client locale service.
     * @returns {string | null}
     */
    function formatReset(iso, locale) {
      if (typeof iso !== 'string' || iso === '') return null;
      const timestamp = Date.parse(iso);
      if (!Number.isFinite(timestamp)) return null;
      let tag = 'zh-CN';
      try {
        const snapshot = locale !== null && typeof locale?.getSnapshot === 'function' ? locale.getSnapshot() : null;
        const candidate = snapshot?.language ?? snapshot?.locale ?? snapshot?.active;
        if (typeof candidate === 'string' && candidate !== '') tag = candidate;
        else if (typeof navigator !== 'undefined' && navigator.language) tag = navigator.language;
      } catch {
        /* 保留默认 tag。 */
      }
      try {
        return new Intl.DateTimeFormat(tag, {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(timestamp));
      } catch {
        return null;
      }
    }

    /**
     * 金额展示：能解析成数字就带货币符号并保留两位小数，否则原样显示。
     * @param {unknown} amount 金额。
     * @param {'CNY' | 'USD' | string | undefined} currency 币种。
     * @returns {string}
     */
    function formatMoney(amount, currency) {
      if (amount === null || amount === undefined || amount === '') return '—';
      const prefix = currency === 'USD' ? '$' : '¥';
      const numeric = Number(amount);
      if (Number.isFinite(numeric)) return `${prefix}${numeric.toFixed(2)}`;
      return String(amount);
    }

    /**
     * 读取错误码对应的本地化文案。
     * @param {unknown} error 错误。
     * @param {(key: string) => string} t 翻译函数。
     * @returns {string}
     */
    function errorText(error, t) {
      const code = error !== null && typeof error === 'object' ? error.code : undefined;
      const key = typeof code === 'string' ? ERROR_KEYS[code] : undefined;
      return t(key ?? 'unknown');
    }

    /**
     * 可选的错误补充说明。
     * @param {unknown} error 错误。
     * @param {(key: string) => string} t 翻译函数。
     * @returns {string | null}
     */
    function errorHint(error, t) {
      const code = error !== null && typeof error === 'object' ? error.code : undefined;
      if (code === 'no-key') return t('missingKeyHint');
      if (code === 'auth') return t('authHint');
      if (code === 'no-subscription') return t('noSubscriptionHint');
      return null;
    }

    /**
     * provider 显示名：已知 ID 走本地化，未知回退 Host 的 displayName。
     * @param {{id: string, displayName?: string}} provider provider 行。
     * @param {(key: string) => string} t 翻译函数。
     * @returns {string}
     */
    function providerLabel(provider, t) {
      const key = `provider.${provider.id}`;
      const localized = t(key);
      return localized === key ? provider.displayName || provider.id : localized;
    }

    /**
     * 把当前额度压成默认态圆环需要的最小信息。
     *
     * 三窗口取「剩余最小」的那个；余额态没有百分比，圆环里显示货币符号，
     * 金额放在 title/aria 与展开态里，避免用完整金额撑破 28px 图标。
     *
     * @param {object | null} quota 当前额度。
     * @param {unknown} error 当前错误。
     * @param {(key: string, vars?: object) => string} t 翻译函数。
     * @returns {{mode: string, value: number | null, text: string, label: string, symbol?: boolean}}
     */
    function buildRing(quota, error, t) {
      let ring;

      if (quota === null) {
        ring =
          error !== null
            ? { mode: 'error', value: null, text: '!', label: errorText(error, t) }
            : { mode: 'loading', value: null, text: '…', label: t('loading') };
        return ring;
      }

      if (quota.kind === 'balance') {
        const currency = quota.currency === 'USD' ? 'USD' : 'CNY';
        const amount = formatMoney(quota.amount, currency);
        ring = {
          mode: 'balance',
          value: null,
          text: currency === 'USD' ? '$' : '¥',
          symbol: true,
          label: t('ringBalance', { amount }),
        };
      } else {
        const windows = Array.isArray(quota.windows)
          ? quota.windows.filter(
              (entry) => typeof entry.remainingPercent === 'number' && Number.isFinite(entry.remainingPercent),
            )
          : [];
        if (windows.length === 0) {
          ring = { mode: 'error', value: null, text: '—', label: t('ringEmpty') };
        } else {
          let lowest = windows[0];
          for (const entry of windows) {
            if (entry.remainingPercent < lowest.remainingPercent) lowest = entry;
          }
          const percent = Math.round(lowest.remainingPercent);
          ring = {
            mode: 'windows',
            value: lowest.remainingPercent,
            text: String(percent),
            label: t('ringLowest', { percent, window: t(`window.${lowest.key}`) }),
          };
        }
      }

      if (error !== null) {
        ring.label = errorText(error, t);
      }
      return ring;
    }

    /** localStorage 读取；隐私模式失败时返回 null。 */
    function readStoredProvider() {
      try {
        return window.localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    }

    /** localStorage 写入；失败时静默。 */
    function writeStoredProvider(id) {
      try {
        window.localStorage.setItem(STORAGE_KEY, id);
      } catch {
        /* 不阻塞额度显示。 */
      }
    }

    /**
     * 发一个插件 API 请求。
     * @param {'providers' | 'quota'} method 方法名。
     * @param {object} payload 请求体。
     * @param {AbortSignal} signal 取消信号。
     * @returns {Promise<object>}
     */
    async function callApi(method, payload, signal) {
      const response = await fetch(`${API_PREFIX}${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
        credentials: 'same-origin',
        signal,
      });
      let data;
      try {
        data = await response.json();
      } catch {
        const error = new Error(`HTTP ${response.status}`);
        error.code = 'bad-response';
        throw error;
      }
      if (!response.ok || data?.ok !== true) {
        const error = new Error(data?.error?.message ?? `HTTP ${response.status}`);
        error.code = data?.error?.code ?? 'unknown';
        throw error;
      }
      return data.value;
    }

    /** 刷新图标（Lucide RefreshCw 轮廓，内联以保持零依赖）。 */
    function RefreshIcon() {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: 14,
          height: 14,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('path', { d: 'M13.7 6.4A5.9 5.9 0 1 0 14 9.2' }),
        h('path', { d: 'M13.7 2.6v3.8H9.9' }),
      );
    }

    /** 选择器右侧的 chevron。 */
    function ChevronIcon() {
      return h(
        'svg',
        {
          className: 'vtq-chevron',
          viewBox: '0 0 12 12',
          width: 10,
          height: 10,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('path', { d: 'M2.5 4.5 6 8l3.5-3.5' }),
      );
    }

    /** 收起图标（替换原来的 provider 状态圆点）。 */
    function CloseIcon() {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: 14,
          height: 14,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          'aria-hidden': true,
        },
        h('path', { d: 'M4 4l8 8M12 4l-8 8' }),
      );
    }

    /**
     * 默认态的 24px 单圈额度环；与 24px 原生账号头像同外径，轨道 2px。
     * 颜色跟随会话 context 占用：轨道 border-l3，进度 label-tertiary，不做红绿状态。
     * @param {object} props
     * @param {object} props.ring buildRing 的结果。
     */
    function QuotaRing(props) {
      const ring = props.ring;
      const radius = 11;
      const circumference = 2 * Math.PI * radius;
      const progress =
        ring.mode === 'windows' && typeof ring.value === 'number'
          ? Math.max(0, Math.min(100, ring.value))
          : null;
      const offset = progress === null ? circumference : circumference * (1 - progress / 100);
      const compact = String(ring.text).length >= 3;

      return h(
        'span',
        { className: 'vtq-ring', 'aria-hidden': true, title: ring.label },
        h(
          'svg',
          { viewBox: '0 0 24 24', width: 24, height: 24, 'aria-hidden': true },
          h('circle', {
            cx: 12,
            cy: 12,
            r: radius,
            fill: 'none',
            stroke: 'var(--dsw-alias-border-l3)',
            strokeWidth: 2,
          }),
          progress === null
            ? null
            : h('circle', {
                cx: 12,
                cy: 12,
                r: radius,
                fill: 'none',
                stroke: 'var(--dsw-alias-label-tertiary)',
                strokeWidth: 2,
                strokeLinecap: 'round',
                strokeDasharray: circumference,
                strokeDashoffset: offset,
              }),
        ),
        h(
          'span',
          {
            className: 'vtq-ring-text',
            'data-compact': compact ? 'true' : 'false',
            'data-symbol': ring.symbol === true ? 'true' : 'false',
          },
          ring.text,
        ),
      );
    }

    /**
     * 渲染加载态。
     * @param {(key: string) => string} t 翻译函数。
     */
    function renderLoading(t) {
      return h('div', { className: 'vtq-note', role: 'status' }, t('loading'));
    }

    /**
     * 渲染错误态。
     * @param {unknown} error 错误。
     * @param {(key: string) => string} t 翻译函数。
     * @param {() => void} onRetry 重试回调。
     */
    function renderError(error, t, onRetry) {
      const hint = errorHint(error, t);
      return h(
        'div',
        { className: 'vtq-error', role: 'status' },
        h('span', { className: 'vtq-error-text' }, errorText(error, t)),
        hint === null ? null : h('span', { className: 'vtq-hint' }, hint),
        h('button', { type: 'button', className: 'vtq-retry', onClick: onRetry }, t('retry')),
      );
    }

    /**
     * 余额行：左标签主色，右金额次色。
     * @param {{amount: string | null, currency: string, detail?: object, available?: boolean}} quota 余额数据。
     * @param {(key: string) => string} t 翻译函数。
     */
    function renderBalance(quota, t) {
      const detail = quota.detail !== null && typeof quota.detail === 'object' ? quota.detail : {};
      const parts = [];
      if (detail.toppedUp !== undefined && detail.toppedUp !== null) {
        parts.push(`${t('toppedUp')} ${formatMoney(detail.toppedUp, quota.currency)}`);
      }
      if (detail.granted !== undefined && detail.granted !== null) {
        parts.push(`${t('granted')} ${formatMoney(detail.granted, quota.currency)}`);
      }
      if (quota.available === false) parts.push(t('insufficient'));
      return h(
        'div',
        { className: 'vtq-balance', title: parts.length > 0 ? parts.join(' · ') : undefined },
        h('span', { className: 'vtq-balance-label' }, t('balance')),
        h('span', { className: 'vtq-balance-value' }, formatMoney(quota.amount, quota.currency)),
      );
    }

    /**
     * 单条额度窗口。
     * @param {object} window 窗口数据。
     * @param {(key: string, vars?: object) => string} t 翻译函数。
     * @param {object | undefined} locale Client locale service.
     */
    function renderWindow(window, t, locale) {
      const label = t(`window.${window.key}`);
      const remaining =
        typeof window.remainingPercent === 'number' && Number.isFinite(window.remainingPercent)
          ? window.remainingPercent
          : null;
      const unlimited = window.status === 'unlimited';
      const valueText =
        remaining === null ? '—' : unlimited ? t('unlimited') : t('remaining', { percent: Math.round(remaining) });
      const reset = formatReset(window.resetsAt, locale);
      const title = reset === null ? undefined : t('resetAt', { time: reset });
      const fill = remaining === null ? 0 : Math.max(0, Math.min(100, remaining));

      return h(
        'div',
        { className: 'vtq-window', key: window.key, title },
        h('span', { className: 'vtq-window-label' }, label),
        h(
          'div',
          {
            className: 'vtq-track',
            role: 'progressbar',
            'aria-label': label,
            'aria-valuemin': 0,
            'aria-valuemax': 100,
            'aria-valuenow': remaining === null ? undefined : Math.round(fill),
            'aria-valuetext': valueText,
          },
          h('div', {
            className: 'vtq-fill',
            style: { width: `${fill}%` },
          }),
        ),
        h('span', { className: 'vtq-window-value' }, valueText),
      );
    }

    /**
     * 三条额度窗口。
     * @param {{windows?: object[]}} quota 额度数据。
     * @param {(key: string, vars?: object) => string} t 翻译函数。
     * @param {object | undefined} locale Client locale service.
     */
    function renderWindows(quota, t, locale) {
      const byKey = new Map(
        (Array.isArray(quota.windows) ? quota.windows : []).map((window) => [window.key, window]),
      );
      return h(
        'div',
        { className: 'vtq-windows' },
        WINDOW_ORDER.map((key) =>
          renderWindow(
            byKey.get(key) ?? {
              key,
              remainingPercent: null,
              usedPercent: null,
              status: 'unknown',
              resetsAt: null,
            },
            t,
            locale,
          ),
        ),
      );
    }

    /**
     * 侧边栏额度组件。
     * @param {{wide?: boolean, t?: (key: string, vars?: object) => string, locale?: object}} props 槽位 props。
     */
    function QuotaBar(props) {
      const wide = props.wide !== false;
      const t = typeof props.t === 'function' ? props.t : translate;
      const locale = props.locale;
      useLocaleRevision(locale);

      const [providers, setProviders] = React.useState(null);
      const [providerId, setProviderId] = React.useState(null);
      const [quota, setQuota] = React.useState(null);
      const [error, setError] = React.useState(null);
      const [loading, setLoading] = React.useState(false);
      const [refreshing, setRefreshing] = React.useState(false);
      const [providersNonce, setProvidersNonce] = React.useState(0);
      const [expanded, setExpanded] = React.useState(false);
      const [stageHeight, setStageHeight] = React.useState(null);
      const controllerRef = React.useRef(null);
      const seqRef = React.useRef(0);
      const providerIdRef = React.useRef(null);
      providerIdRef.current = providerId;
      const stageInnerRef = React.useRef(null);
      const collapsedRef = React.useRef(null);
      const closeRef = React.useRef(null);
      const firstRenderRef = React.useRef(true);

      const loadQuota = React.useCallback(async (id, fresh) => {
        if (typeof id !== 'string' || id === '') return;
        const seq = ++seqRef.current;
        const previous = controllerRef.current;
        if (previous !== null && previous !== undefined) previous.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        setLoading(true);
        if (fresh === true) setRefreshing(true);
        try {
          const language =
            typeof navigator !== 'undefined' && typeof navigator.language === 'string'
              ? navigator.language.toLowerCase().startsWith('en')
                ? 'en'
                : 'zh'
              : 'zh';
          const value = await callApi(
            'quota',
            { provider: id, fresh: fresh === true, locale: language },
            controller.signal,
          );
          if (seq !== seqRef.current || controller.signal.aborted) return;
          setQuota(value);
          setError(null);
        } catch (caught) {
          if (seq !== seqRef.current || controller.signal.aborted) return;
          setError(caught);
        } finally {
          if (seq === seqRef.current) {
            setLoading(false);
            setRefreshing(false);
          }
        }
      }, []);

      // provider 列表始终读取：默认态也需要 provider name 和圆环数字。
      React.useEffect(() => {
        if (!wide) return undefined;
        let cancelled = false;
        const controller = new AbortController();
        setLoading(true);
        setError(null);
        callApi('providers', {}, controller.signal)
          .then((value) => {
            if (cancelled) return;
            const list = Array.isArray(value?.providers) ? value.providers : [];
            setProviders({ ...value, providers: list });
            const stored = readStoredProvider();
            const fallback = value?.defaultProviderId;
            const next = list.some((provider) => provider.id === stored)
              ? stored
              : typeof fallback === 'string' && list.some((provider) => provider.id === fallback)
                ? fallback
                : list[0]?.id ?? null;
            setProviderId(next);
            if (next !== null) writeStoredProvider(next);
            if (list.length === 0) setLoading(false);
          })
          .catch((caught) => {
            if (cancelled) return;
            setError(caught);
            setLoading(false);
          });
        return () => {
          cancelled = true;
          controller.abort();
        };
      }, [wide, providersNonce]);

      const refreshMs = Math.max(15000, Number(providers?.refreshIntervalMs) || 60000);

      // provider 变化时立即读一次，并在可见时每 60 秒刷新。
      React.useEffect(() => {
        if (!wide || providerId === null) return undefined;
        setQuota(null);
        setError(null);
        loadQuota(providerId, false);

        const isVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';
        const timer = window.setInterval(() => {
          if (isVisible()) loadQuota(providerIdRef.current, false);
        }, refreshMs);
        const onVisibility = () => {
          if (isVisible()) loadQuota(providerIdRef.current, false);
        };
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
          window.clearInterval(timer);
          document.removeEventListener('visibilitychange', onVisibility);
          if (controllerRef.current !== null && controllerRef.current !== undefined) {
            controllerRef.current.abort();
          }
        };
      }, [wide, providerId, refreshMs, loadQuota]);

      // 默认态 44px，展开态按内容高度；数据变化时 ResizeObserver 跟随。
      React.useLayoutEffect(() => {
        const element = stageInnerRef.current;
        if (element === null) return undefined;
        const measure = () => {
          const next = element.getBoundingClientRect().height;
          if (next > 0) setStageHeight(next);
        };
        measure();
        let observer;
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(measure);
          observer.observe(element);
        }
        return () => {
          if (observer !== undefined) observer.disconnect();
        };
      }, [expanded, wide]);

      // 侧边栏收起再展开时回到默认态，避免上次展开的布局留在隐藏状态里。
      React.useEffect(() => {
        if (!wide && expanded) setExpanded(false);
      }, [wide, expanded]);

      // 展开时焦点给 close，收起时焦点回到默认行；首次挂载不抢焦点。
      React.useEffect(() => {
        if (firstRenderRef.current) {
          firstRenderRef.current = false;
          return;
        }
        if (expanded) closeRef.current?.focus();
        else collapsedRef.current?.focus();
      }, [expanded]);

      // Esc 收起。
      React.useEffect(() => {
        if (!expanded) return undefined;
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setExpanded(false);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
      }, [expanded]);

      if (!wide) return null;

      const list = Array.isArray(providers?.providers) ? providers.providers : [];
      if (providers !== null && list.length === 0) return null;

      const selected = list.find((provider) => provider.id === providerId) ?? null;
      const selectedLabel = selected === null ? t('panel') : providerLabel(selected, t);
      const ring = buildRing(quota, error, t);
      const onRefresh = () => {
        if (providerIdRef.current !== null) loadQuota(providerIdRef.current, true);
        else setProvidersNonce((value) => value + 1);
      };
      const onChange = (event) => {
        const next = event.target.value;
        if (typeof next === 'string' && next !== '') {
          writeStoredProvider(next);
          setProviderId(next);
        }
      };

      let body;
      if (providers === null) {
        body =
          error === null ? renderLoading(t) : renderError(error, t, () => setProvidersNonce((value) => value + 1));
      } else if (error !== null && quota === null) {
        body = renderError(error, t, onRefresh);
      } else if (quota === null) {
        body = renderLoading(t);
      } else if (quota.kind === 'balance') {
        body = renderBalance(quota, t);
      } else {
        body = renderWindows(quota, t, locale);
      }

      const collapsedRow = h(
        'button',
        {
          ref: collapsedRef,
          type: 'button',
          className: 'vtq-collapsed',
          onClick: () => setExpanded(true),
          'aria-expanded': expanded,
          'aria-controls': 'vtq-panel',
          'aria-label': `${selectedLabel} · ${ring.label} · ${t('expand')}`,
          title: t('expand'),
        },
        h(QuotaRing, { ring }),
        h('span', { className: 'vtq-collapsed-name' }, selectedLabel),
      );

      const expandedPanel = h(
        'div',
        { className: 'vtq-expanded', id: 'vtq-panel', role: 'region', 'aria-label': t('panel') },
        h(
          'div',
          { className: 'vtq-head' },
          h(
            'button',
            {
              ref: closeRef,
              type: 'button',
              className: 'vtq-close',
              onClick: () => setExpanded(false),
              title: t('collapse'),
              'aria-label': t('collapse'),
            },
            h(CloseIcon),
          ),
          list.length > 0
            ? h(
                'span',
                { className: 'vtq-select-wrap' },
                h(
                  'select',
                  {
                    className: 'vtq-select',
                    value: providerId ?? '',
                    onChange,
                    'aria-label': t('provider.label'),
                    title: selected === null ? undefined : providerLabel(selected, t),
                  },
                  list.map((provider) =>
                    h('option', { key: provider.id, value: provider.id }, providerLabel(provider, t)),
                  ),
                ),
                h(ChevronIcon),
              )
            : h('span', { className: 'vtq-head-label' }, t('panel')),
          h(
            'button',
            {
              type: 'button',
              className: 'vtq-refresh',
              onClick: onRefresh,
              title: t('refresh'),
              'aria-label': t('refresh'),
              'data-spinning': refreshing || (loading && quota === null) ? 'true' : 'false',
            },
            h(RefreshIcon),
          ),
        ),
        body,
      );

      return h(
        'div',
        { className: 'vtq-root', 'data-plugin': PLUGIN_ID, 'data-plugin-version': VERSION },
        h('style', null, STYLE_TEXT),
        h(
          'div',
          {
            className: 'vtq-stage',
            style: stageHeight === null ? undefined : { height: `${stageHeight}px` },
          },
          h(
            'div',
            {
              ref: stageInnerRef,
              className: 'vtq-stage-inner',
              key: expanded ? 'expanded' : 'collapsed',
            },
            expanded ? expandedPanel : collapsedRow,
          ),
        ),
      );
    }

    /** 渲染异常时把额度区域降级为 null，避免整个 footer 槽位被清空。 */
    class QuotaBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { failed: false };
      }

      static getDerivedStateFromError() {
        return { failed: true };
      }

      componentDidCatch(error) {
        try {
          console.error(`${PLUGIN_ID}: render failed`, error);
        } catch {
          /* console unavailable */
        }
      }

      render() {
        return this.state.failed ? null : this.props.children;
      }
    }

    /** 槽位入口：边界包住真正组件。 */
    function QuotaBarShell(props) {
      return h(QuotaBoundary, null, h(QuotaBar, props));
    }

    /** Client services this plugin reads; the loader waits for the slot registry. */
    const inject = ['slots', 'locale'];

    /**
     * 注册额度组件。
     * @param {object} ctx Client plugin context.
     */
    function apply(ctx) {
      try {
        ctx.effect(() => {
          const offZh = ctx.locale.register(NS, 'zh', DICT.zh);
          const offEn = ctx.locale.register(NS, 'en', DICT.en);
          return () => {
            offZh();
            offEn();
          };
        }, `${PLUGIN_ID}: locale dictionaries`);

        const bound = ctx.locale.bind(NS);
        const fallback = (key) => DICT.en[key] ?? key;
        const t = (key, vars) => {
          const raw = bound(key);
          const text = raw === key || raw === undefined || raw === null ? fallback(key) : raw;
          return typeof text === 'string' ? interpolate(text, vars) : text;
        };
        translate = t;

        ctx.slots.inject('sidebar.footer.action', () =>
          ctx.slots.register(
            {
              name: 'sidebar.footer.action',
              id: 'vt-quote-bar',
              order: 10,
              inject: () => ({ t, locale: ctx.locale }),
            },
            QuotaBarShell,
          ),
        );
      } catch (error) {
        try {
          console.error(`${PLUGIN_ID}: registration failed`, error);
        } catch {
          /* console unavailable */
        }
      }
    }

    return { apply, inject };
  },
});
