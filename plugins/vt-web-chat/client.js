/**
 * Browser half of dsh-vt-web-chat.
 *
 * 面板里就是官方开源 chat-demo 的界面本身：插件把自己的 `/webchat/` 路由托管给同源
 * `iframe`，请求由 Host 用 DSH 的 DeepSeek 凭据代发。这里只负责三件事：
 * 侧栏入口、整页面板、设置页里的会话保留策略。
 *
 * 为什么不再用桌面壳的 webview 租约：本插件的页面由自己托管，
 * 不受站点 `frame-ancestors` 限制，Web 端与桌面端可以用同一条路径。
 */
window.__ModuleLoader__.load({
  id: 'dsh-vt-web-chat',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const PLUGIN_ID = 'dsh-vt-web-chat';
    const VERSION = '2.0.0';
    const NS = PLUGIN_ID;
    /** 侧栏行与主面板共用的 id。 */
    const PANEL_ID = 'vt-web-chat';
    /** 与宿主路由一致的接口前缀。 */
    const ROUTE_PREFIX = '/webchat';
    /** 保留天数档位；0 表示永不清理。 */
    const RETENTION_CHOICES = [30, 60, 90, 0];

    const DICT = {
      zh: {
        'meta.title': '网页对话',
        'meta.description': '用官方 DeepSeek 网页界面聊天，请求走 DeepSeek API 与你的 DSH 账号。',
        'entry': '网页对话',
        'panel.title': '网页对话',
        'panel.hint': '滚动、复制、上传都在面板内完成；对话保存在本机，不会写入 DSH 会话。',
        'settings.nav': '网页对话',
        'settings.title': '会话保留',
        'settings.description': '超过所选天数没有继续聊的会话，会在下次打开面板时自动删除。',
        'settings.days30': '30 天',
        'settings.days60': '60 天',
        'settings.days90': '90 天',
        'settings.never': '永不',
        'settings.saving': '保存中…',
        'settings.saved': '已保存',
        'settings.failed': '保存失败，请重试',
        'settings.loadFailed': '读取设置失败，暂按 30 天处理',
        'settings.currentDays': '当前：闲置超过 {n} 天的会话会被删除。',
        'settings.currentNever': '当前：永不自动删除。',
        'settings.crashed': '设置区块加载失败，请重新打开设置页。',
      },
      en: {
        'meta.title': 'Web Chat',
        'meta.description': 'Chat on the official DeepSeek web UI, billed through the DeepSeek API with your DSH account.',
        'entry': 'Web Chat',
        'panel.title': 'Web Chat',
        'panel.hint': 'Scrolling, copying and uploads stay inside the panel; chats are stored locally and never written to a DSH session.',
        'settings.nav': 'Web Chat',
        'settings.title': 'Chat retention',
        'settings.description': 'Chats untouched for longer than the chosen period are deleted the next time the panel opens.',
        'settings.days30': '30 days',
        'settings.days60': '60 days',
        'settings.days90': '90 days',
        'settings.never': 'Never',
        'settings.saving': 'Saving…',
        'settings.saved': 'Saved',
        'settings.failed': 'Save failed, please retry',
        'settings.loadFailed': 'Could not read settings; assuming 30 days',
        'settings.currentDays': 'Current: chats idle for more than {n} days are deleted.',
        'settings.currentNever': 'Current: never delete automatically.',
        'settings.crashed': 'This section failed to render; reopen Settings to try again.',
      },
    };

    /**
     * 面板地址。桌面壳的静态页面通过 `__DSH_TRANSPORT__` 拿到 Host 的 HTTP origin，
     * 浏览器页面直接用当前 origin；两者都没有时退回根路径。
     *
     * 带上 `lang`：面板是独立文档，拿不到宿主的 i18n；首次进入时由注入脚本
     * 把它写进前端自己的 locale 存储，之后用户在前端里改过就以前端为准。
     * @param locale - 宿主当前语言。
     * @returns 面板 URL。
     */
    function panelUrl(locale) {
      try {
        const transport = window.__DSH_TRANSPORT__;
        const base =
          typeof transport?.streamBaseUrl === 'string' && transport.streamBaseUrl.length > 0
            ? transport.streamBaseUrl.replace(/\/+$/u, '')
            : window.location.protocol === 'file:'
              ? ''
              : window.location.origin;
        return `${base}${ROUTE_PREFIX}/?lang=${encodeURIComponent(locale)}`;
      } catch {
        return `${ROUTE_PREFIX}/?lang=${encodeURIComponent(locale)}`;
      }
    }

    /**
     * 把宿主语言收敛成前端认识的两个值。
     * @param ctx - Client 插件上下文。
     * @returns `'zh-CN'` 或 `'en-US'`（上游 Locale 的合法值）。
     */
    function hostLocale(ctx) {
      try {
        const active = ctx.locale.getSnapshot?.()?.active;
        if (typeof active === 'string' && active.length > 0) {
          return active.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
        }
      } catch {
        // 快照不可用：退回文档语言。
      }
      const lang = typeof document?.documentElement?.lang === 'string' ? document.documentElement.lang : '';
      return lang.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
    }

    /**
     * 量出 DSH 顶部占位（侧栏收起后的悬浮岛）的高度。
     *
     * DSH 在主面板左上角盖了一个 `shell.leading` 座位；框架会给出
     * `--dsh-frame-leading-clearance`，但 iframe 拿不到宿主的 CSS 变量，
     * 所以这里直接量座位元素的实际底边，再把数字发给面板。
     * @returns 需要让出的顶部高度，没有座位时为 0。
     */
    function measureSeatInset(host) {
      try {
        const seat = document.querySelector('[class*="leadingSeat"]');
        if (seat !== null) {
          const rect = seat.getBoundingClientRect();
          if (rect.width > 0 || rect.height > 0) return Math.ceil(rect.bottom + 8);
        }
        // 兜底：座位元素找不到（例如上游改了类名），但框架声明了 leading clearance，
        // 说明座位仍然挂在主面板上方，用一个保守高度让开。
        const probe = host ?? document.querySelector('[class*="mainPanel"]') ?? document.body;
        const clearance = getComputedStyle(probe).getPropertyValue('--dsh-frame-leading-clearance');
        if (Number.parseFloat(clearance) > 0) return 48;
      } catch {
        // 量不到就让开 0：宁可重叠，也不要凭空留一条空白。
      }
      return 0;
    }

    /**
     * 读设置。
     * @returns `{ retentionDays }`；失败时抛出。
     */
    async function fetchSettings() {
      const response = await fetch(`${ROUTE_PREFIX}/api/settings`, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`settings ${response.status}`);
      return response.json();
    }

    /**
     * 写设置。
     * @param retentionDays - 保留天数，0 表示永不。
     * @returns 落盘后的设置。
     */
    async function saveSettings(retentionDays) {
      const response = await fetch(`${ROUTE_PREFIX}/api/settings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ retentionDays }),
      });
      if (!response.ok) throw new Error(`settings ${response.status}`);
      return response.json();
    }

    /** 面板本体：一个占满主内容区的同源 iframe。 */
    function Panel(props) {
      const frameRef = React.useRef(null);
      const inset = props.inset ?? 0;

      // 座位高度用 postMessage 传进去：面板是独立文档，读不到宿主的布局状态。
      const pushSeat = React.useCallback(() => {
        const win = frameRef.current === null ? null : frameRef.current.contentWindow;
        if (win === null) return;
        try {
          win.postMessage({ type: 'vt-webchat:seat', inset }, '*');
        } catch {
          // 面板还没准备好：等 onLoad 再发一次。
        }
      }, [inset]);

      React.useEffect(pushSeat, [pushSeat]);

      return h(
        'div',
        {
          // 容器留在宿主文档里，用来读取继承下来的框架变量（座位是否挂载）。
          ref: props.hostRef,
          style: {
            height: '100%',
            minHeight: 320,
            display: 'flex',
            background: 'var(--dsw-alias-bg-layer-1, #fff)',
          },
        },
        h('iframe', {
          ref: frameRef,
          onLoad: pushSeat,
          src: panelUrl(props.locale ?? 'zh-CN'),
          title: 'DeepSeek',
          allow: 'clipboard-write; microphone',
          style: { width: '100%', height: '100%', border: 'none', display: 'block', background: 'transparent' },
        }),
      );
    }

    /** 侧栏图标：与 icon.svg 同形，用 currentColor 跟随侧栏配色。 */
    function Glyph(props) {
      const size = typeof props?.size === 'number' ? props.size : 16;
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          'aria-hidden': true,
          style: { display: 'block' },
        },
        h('path', {
          d: 'M20.25 11.5c0 4.28-3.7 7.75-8.25 7.75-.53 0-1.05-.05-1.55-.14l-4.1 1.9c-.6.28-1.26-.22-1.18-.87l.5-3.93C4.4 14.9 3.75 13.27 3.75 11.5c0-4.28 3.7-7.75 8.25-7.75s8.25 3.47 8.25 7.75Z',
          strokeWidth: 1.3,
          strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
        }),
      );
    }

    /**
     * 设置区块：四个保留档位，点一下即保存。
     *
     * 文案一律走字符串字典：语言服务对函数值不保证透传，
     * 之前的 `t(key)(...)` 在宿主里拿到空串后整块区域会被 React 卸载。
     */
    function RetentionSettings(props) {
      const t = (key) => {
        try {
          if (typeof props?.t === 'function') {
            const value = props.t(key);
            if (typeof value === 'string' && value.length > 0 && value !== key) return value;
          }
        } catch {
          // 语言服务不可用：退回内置字典，不让设置区跟着崩。
        }
        return DICT.en[key] ?? key;
      };
      const [days, setDays] = React.useState(30);
      const [state, setState] = React.useState('idle');

      React.useEffect(() => {
        let alive = true;
        fetchSettings()
          .then((value) => {
            if (!alive) return;
            if (typeof value?.retentionDays === 'number') setDays(value.retentionDays);
          })
          .catch(() => {
            if (alive) setState('load-failed');
          });
        return () => {
          alive = false;
        };
      }, []);

      const choose = (value) => {
        if (state === 'saving') return;
        const previous = days;
        setDays(value);
        setState('saving');
        saveSettings(value)
          .then((saved) => {
            setDays(Number(saved?.retentionDays ?? value));
            setState('saved');
          })
          .catch(() => {
            setDays(previous);
            setState('failed');
          });
      };

      const status =
        state === 'saving'
          ? t('settings.saving')
          : state === 'saved'
            ? t('settings.saved')
            : state === 'failed'
              ? t('settings.failed')
              : state === 'load-failed'
                ? t('settings.loadFailed')
                : '';

      return h(
        'section',
        { style: { display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0 8px' } },
        h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
          h('h3', { style: { margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--dsw-alias-label-primary, #0f1115)' } }, t('settings.title')),
          h(
            'p',
            { style: { margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--dsw-alias-label-secondary, #61656e)' } },
            t('settings.description'),
          ),
        ),
        h(
          'div',
          { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
          RETENTION_CHOICES.map((value) =>
            h(
              'button',
              {
                key: value,
                type: 'button',
                onClick: () => choose(value),
                'aria-pressed': days === value,
                style: {
                  minWidth: 64,
                  padding: '6px 14px',
                  borderRadius: 999,
                  font: 'inherit',
                  fontSize: 13,
                  cursor: state === 'saving' ? 'progress' : 'pointer',
                  border:
                    days === value
                      ? '1px solid var(--dsw-alias-brand-primary, #0f1115)'
                      : '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.12))',
                  // 选中态用宿主自己的配对：品牌色做底、反色做字。
                  // 暗色下 brand-primary 是近白，反色是深灰；亮色下正好相反。
                  background:
                    days === value ? 'var(--dsw-alias-brand-primary, #0f1115)' : 'transparent',
                  color:
                    days === value
                      ? 'var(--dsw-alias-label-primary-inverted, #fff)'
                      : 'var(--dsw-alias-label-primary, #0f1115)',
                },
              },
              value === 0 ? t('settings.never') : t(`settings.days${value}`),
            ),
          ),
        ),
        h(
          'p',
          { style: { margin: 0, fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #8b8f98)' } },
          status.length > 0
            ? status
            : days === 0
              ? t('settings.currentNever')
              : t('settings.currentDays').replace('{n}', String(days)),
        ),
      );
    }

    /** 设置区块的最小错误边界：DSH 没有为设置区提供边界，一个渲染错误会整页空白。 */
    class SettingsBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { failed: false };
      }

      static getDerivedStateFromError() {
        return { failed: true };
      }

      componentDidCatch(error) {
        console.error(`${PLUGIN_ID}: settings section failed`, error);
      }

      render() {
        if (this.state.failed) {
          return h(
            'p',
            { style: { margin: 0, fontSize: 13, color: 'var(--dsw-alias-label-secondary, #61656e)' } },
            this.props.fallback,
          );
        }
        return this.props.children;
      }
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          const offZh = ctx.locale.register(NS, 'zh', DICT.zh);
          const offEn = ctx.locale.register(NS, 'en', DICT.en);
          return () => {
            offZh();
            offEn();
          };
        }, `${PLUGIN_ID}: locale`);

        const bound = ctx.locale.bind(NS);
        const t = (key, ...rest) => {
          const raw = bound(key);
          const value = raw === key || raw === undefined || raw === null ? DICT.en[key] : raw;
          return typeof value === 'function' ? value(...rest) : value;
        };

        // 宿主语言变化时重挂 iframe，让面板文案与新语言一致；
        // 同时盯着顶部的悬浮岛，把需要让出的高度实时传进面板。
        function PanelShell() {
          const [locale, setLocale] = React.useState(() => hostLocale(ctx));
          const hostRef = React.useRef(null);
          const [inset, setInset] = React.useState(() => measureSeatInset(null));

          React.useEffect(() => ctx.locale.subscribe(() => setLocale(hostLocale(ctx))), []);

          React.useEffect(() => {
            let timer;
            const schedule = () => {
              if (timer !== undefined) return;
              timer = setTimeout(() => {
                timer = undefined;
                setInset(measureSeatInset(hostRef.current));
              }, 120);
            };
            // 侧栏开合会换掉框架的子节点，座位随之出现或消失。
            const observer = new MutationObserver(schedule);
            observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
            const resizer = new ResizeObserver(schedule);
            resizer.observe(document.documentElement);
            window.addEventListener('resize', schedule);
            const onMessage = (event) => {
              if (event.data?.type === 'vt-webchat:hello') setInset(measureSeatInset(hostRef.current));
            };
            window.addEventListener('message', onMessage);
            return () => {
              if (timer !== undefined) clearTimeout(timer);
              observer.disconnect();
              resizer.disconnect();
              window.removeEventListener('resize', schedule);
              window.removeEventListener('message', onMessage);
            };
          }, []);

          return h(Panel, { locale, inset, hostRef });
        }

        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: PANEL_ID }, PanelShell),
        );

        // order -10 让入口贴着「新会话」；与 1.x 的位置保持一致，升级后用户不会找不到。
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: PANEL_ID, order: -10, label: () => t('entry') },
            Glyph,
          ),
        );

        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'web-chat-settings',
              order: 26,
              label: () => t('settings.nav'),
              inject: () => ({ t }),
            },
            (props) => h(SettingsBoundary, { fallback: t('settings.crashed') }, h(RetentionSettings, props)),
          ),
        );

        console.info(`[${PLUGIN_ID}] ${VERSION} ready`);
      },
    };
  },
});
