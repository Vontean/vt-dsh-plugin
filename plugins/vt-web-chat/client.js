/**
 * dsh-vt-web-chat — client half.
 *
 * One sidebar entry (the same `sidebar.panellist` + `main` mechanism the Plugins
 * and Scheduled tasks rows use) and one full main-area page hosting
 * `chat.deepseek.com`.
 *
 * Why a webview and not an iframe: the site answers with
 * `content-security-policy: frame-ancestors 'none'`, so no page may frame it.
 * The desktop shell exposes `globalThis.dshDesktop.browser` — the same guest
 * lease bridge its built-in sidebar browser uses. The main process rejects every
 * webview that does not carry an approved lease, so the only legal sequence is
 * acquire → create an element named by the lease with its partition → load.
 *
 * Failure containment is a hard rule here. DSH has no error boundary around a
 * slot entry, and an escaping error in the `main` slot unmounts the whole
 * application UI. Every guest call is attached-checked and wrapped, and a
 * rendering boundary keeps a crash inside this panel. A dead guest becomes a
 * retry card, never a blank window.
 *
 * Leaving the panel releases the guest, so the page remembers the last
 * conversation URL and reopens there instead of starting a new chat each time.
 */
/** Package identity: one source for the module id and every log/storage prefix. */
const PLUGIN_ID = 'dsh-vt-web-chat';
/** Must equal `version` in package.json; printed once in the mount trace below. */
const VERSION = '1.0.0';

// Mount trace: one line naming the loaded build (DevTools → verbose level).
console.debug(`[${PLUGIN_ID}] v${VERSION}`);

window.__ModuleLoader__.load({
  id: PLUGIN_ID,
  factory(require) {
    'use strict';

    const reactModule = require('react');
    const React =
      reactModule !== null && typeof reactModule.createElement === 'function'
        ? reactModule
        : reactModule.default;

    /** Locale namespace owned by this plugin. */
    const NS = 'vtWebChat';
    /** `main` cell key and `sidebar.panellist` id — the two must match. */
    const PANEL_ID = 'vt-web-chat';
    const CHAT_URL = 'https://chat.deepseek.com/';
    /**
     * Storage identity for the guest partition. The main process keeps one
     * partition per identity for the lifetime of the process, so leaving and
     * re-entering the panel keeps the page and its login.
     */
    const PARTITION_KEY = 'panel:vt-web-chat';
    /** Last visited conversation, remembered across panel switches and reloads. */
    const STORAGE_KEY = `${PLUGIN_ID}:last-url`;
    /** Paths that are not a conversation: a brand-new chat, or an auth page. */
    const AUTH_PATHS = new Set(['/sign_in', '/login', '/signup', '/auth']);
    /** A guest that never reaches `dom-ready` is reported instead of hanging. */
    const WATCHDOG_MS = 15000;

    const DICT = {
      zh: {
        entry: '网页对话',
        title: 'DeepSeek 网页对话',
        loading: '正在加载网页对话…',
        failed: '网页对话没有打开',
        timeout: '网页对话没有启动',
        crashed: '内嵌页面已退出',
        retry: '重试',
        unsupportedTitle: '需要桌面版 App',
        unsupportedBody: '网页对话依赖桌面端的内嵌浏览器。当前环境请在浏览器新标签中打开。',
        openExternal: '在浏览器打开',
        signInHint: '登录状态只在本次运行中保留；重启 DSH 后需要重新登录。',
        signInAction: '在系统浏览器登录',
      },
      en: {
        entry: 'Web Chat',
        title: 'DeepSeek Web Chat',
        loading: 'Loading Web Chat…',
        failed: 'Web Chat did not open',
        timeout: 'Web Chat did not start',
        crashed: 'The embedded page exited',
        retry: 'Retry',
        unsupportedTitle: 'Desktop app required',
        unsupportedBody:
          'Web Chat uses the desktop embedded browser. Open it in a browser tab instead.',
        openExternal: 'Open in browser',
        signInHint:
          'Your sign-in lasts only for this app run; restarting DSH requires signing in again.',
        signInAction: 'Sign in with your browser',
      },
    };

    /** Set by `apply`; components fall back to it when slot injection is absent. */
    let translate = (key) => key;
    let localeService = undefined;

    /**
     * Re-render when the active locale changes, so panel copy follows the host.
     * @param locale - Client locale service, if available.
     * @returns the current revision; the value itself is not read.
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
     * Parse a chat.deepseek.com page URL.
     * @param value - candidate URL.
     * @returns the parsed URL for the site origin, or undefined.
     */
    function parseChatUrl(value) {
      if (typeof value !== 'string' || value.length === 0 || value.length > 4096) return undefined;
      try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.hostname !== 'chat.deepseek.com') return undefined;
        if (url.username !== '' || url.password !== '') return undefined;
        return url;
      } catch {
        return undefined;
      }
    }

    /**
     * Whether a URL is deep enough to be a conversation page.
     * @param url - parsed chat URL, possibly undefined.
     * @returns true for a conversation, false for the new-chat root or an auth page.
     */
    function isConversation(url) {
      if (url === undefined) return false;
      const path = url.pathname.replace(/\/+$/u, '') || '/';
      return !AUTH_PATHS.has(path) && path !== '/';
    }

    /**
     * Whether the guest currently shows a sign-in page.
     * @param raw - current page URL reported by the guest.
     * @returns true for the known auth paths.
     */
    function isAuthUrl(raw) {
      const url = parseChatUrl(raw);
      if (url === undefined) return false;
      const path = url.pathname.replace(/\/+$/u, '') || '/';
      return AUTH_PATHS.has(path);
    }

    /**
     * Read the conversation remembered from the last visit.
     * @returns the URL to open; the site root when nothing usable is remembered.
     */
    function rememberedTarget() {
      try {
        const saved = parseChatUrl(window.localStorage.getItem(STORAGE_KEY));
        return isConversation(saved) ? saved.toString() : CHAT_URL;
      } catch {
        return CHAT_URL;
      }
    }

    /**
     * Remember where the guest currently is.
     *
     * A brand-new chat clears the memory so the next visit starts clean. An auth
     * page never overwrites it, so a login detour does not lose the conversation.
     * @param raw - current page URL reported by the guest.
     */
    function rememberTarget(raw) {
      const url = parseChatUrl(raw);
      if (url === undefined) return;
      try {
        if (isConversation(url)) window.localStorage.setItem(STORAGE_KEY, url.toString());
        else if ((url.pathname.replace(/\/+$/u, '') || '/') === '/') {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        /* storage unavailable: the panel still works, it just forgets */
      }
    }

    /**
     * Open a chat URL in the system browser. The desktop shell routes
     * `window.open` for http(s) to the OS browser and denies every other window.
     * @param url - http(s) target.
     */
    function openExternally(url) {
      try {
        window.open(url, '_blank', 'noopener');
      } catch {
        /* a blocked popup leaves the panel usable */
      }
    }

    /**
     * Whether the guest element is still in the document. Electron's webview
     * methods throw once it is detached, so this gates every guest call.
     * @param element - webview element.
     * @returns true while the element can still host a guest.
     */
    function attached(element) {
      try {
        return element.isConnected === true;
      } catch {
        return false;
      }
    }

    /**
     * Guest URL, or undefined when the element cannot report one.
     * @param element - webview element.
     * @returns the URL string, or undefined.
     */
    function readUrl(element) {
      if (!attached(element)) return undefined;
      try {
        const url = element.getURL();
        return typeof url === 'string' && url.length > 0 ? url : undefined;
      } catch {
        return undefined;
      }
    }

    /**
     * Navigate the guest without ever throwing.
     * @param element - webview element.
     * @param url - target URL.
     * @returns false when the guest is gone, so the caller can report it.
     */
    function navigate(element, url) {
      if (!attached(element)) return false;
      try {
        const pending = element.loadURL(url);
        if (pending !== undefined && pending !== null && typeof pending.catch === 'function') {
          pending.catch(() => {});
        }
        return true;
      } catch {
        return false;
      }
    }

    /**
     * Sidebar glyph: a speech bubble drawn on currentColor so the sidebar's
     * active state owns the ink. Sized for its 16/18px seat.
     * @param props - size supplied by the panel list.
     * @returns the glyph element.
     */
    function Glyph({ size = 16 }) {
      return React.createElement(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        React.createElement('path', {
          d: 'M20.25 11.5c0 4.28-3.7 7.75-8.25 7.75-.53 0-1.05-.05-1.55-.14l-4.1 1.9c-.6.28-1.26-.22-1.18-.87l.5-3.93C4.4 14.9 3.75 13.27 3.75 11.5c0-4.28 3.7-7.75 8.25-7.75s8.25 3.47 8.25 7.75Z',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinejoin: 'round',
        }),
        React.createElement('path', {
          d: 'M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
        }),
      );
    }

    const styles = {
      root: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: '0',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
      },
      host: {
        position: 'relative',
        flex: '1',
        minHeight: '0',
        display: 'flex',
      },
      guest: {
        width: '100%',
        height: '100%',
        border: '0',
        background: 'transparent',
        display: 'flex',
      },
      overlay: {
        position: 'absolute',
        inset: '0',
        zIndex: '1',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        padding: '24px',
        textAlign: 'center',
        color: 'var(--dsw-alias-label-tertiary)',
        fontSize: '12px',
        lineHeight: '18px',
        background: 'var(--dsw-alias-bg-base)',
      },
      overlayTitle: {
        color: 'var(--dsw-alias-label-primary)',
        fontSize: '13px',
        lineHeight: '20px',
      },
      actions: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      },
      button: {
        color: 'var(--dsw-alias-label-primary)',
        background: 'var(--dsw-alias-bg-layer-1)',
        border: '.5px solid var(--dsw-alias-border-l2)',
        borderRadius: 'var(--dsw-radius-sm)',
        padding: '4px 12px',
        cursor: 'pointer',
        fontSize: '12px',
        lineHeight: '18px',
      },
      linkButton: {
        border: '0',
        padding: '0',
        background: 'transparent',
        color: 'var(--dsw-alias-brand-primary)',
        cursor: 'pointer',
        fontSize: '12px',
        lineHeight: '18px',
      },
      signInBar: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flex: 'none',
        padding: '6px 12px',
        borderBottom: '.5px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: '12px',
        lineHeight: '18px',
      },
      signInText: {
        flex: '1',
        minWidth: '0',
      },
    };

    /**
     * Keeps a rendering failure inside this panel. DSH has no boundary of its
     * own around slot entries: an escaping error unmounts the root slot, which
     * is the whole application UI.
     */
    class PanelBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { failure: undefined };
      }

      static getDerivedStateFromError(error) {
        return { failure: String((error && error.message) || error) };
      }

      componentDidCatch(error) {
        try {
          console.error(`${PLUGIN_ID}: panel render failed`, error);
        } catch {
          /* console unavailable */
        }
      }

      render() {
        if (this.state.failure !== undefined) {
          const t = this.props.t;
          return React.createElement(
            'div',
            { style: styles.root },
            React.createElement(
              'div',
              { style: styles.overlay },
              React.createElement('div', { style: styles.overlayTitle }, t('failed')),
              React.createElement('div', null, this.state.failure),
              React.createElement(
                'div',
                { style: styles.actions },
                React.createElement(
                  'button',
                  {
                    type: 'button',
                    style: styles.button,
                    onClick: () => openExternally(CHAT_URL),
                  },
                  t('openExternal'),
                ),
              ),
            ),
          );
        }
        return this.props.children ?? null;
      }
    }

    /**
     * The global Web Chat panel: a guest webview filling the main column.
     *
     * The guest is created only after the lease resolves, and it is mounted with
     * `name`/`partition`/`src` already set, because the main process inspects
     * exactly that bootstrap src when it approves the attachment. The first load
     * goes to the remembered conversation; navigation events keep that memory
     * current. A dead guest (crash, destroy, failed start) turns into a retry
     * card inside the panel; cleanup releases the lease and never calls into a
     * detached element.
     * @param props - slot props; `t` and `locale` arrive through registration.
     * @returns the panel element tree.
     */
    function ChatPanel(props) {
      const t = props.t ?? translate;
      const locale = props.locale ?? localeService;
      useLocaleRevision(locale);

      const hostRef = React.useRef(null);
      const lastUrlRef = React.useRef(undefined);
      const [phase, setPhase] = React.useState('loading');
      const [failure, setFailure] = React.useState(undefined);
      const [authPage, setAuthPage] = React.useState(false);
      const [attempt, setAttempt] = React.useState(0);

      const retry = React.useCallback(() => {
        try {
          setPhase('loading');
          setFailure(undefined);
          setAuthPage(false);
          setAttempt((value) => value + 1);
        } catch {
          /* the panel is gone */
        }
      }, []);

      React.useEffect(() => {
        const host = hostRef.current;
        const bridge = globalThis.dshDesktop?.browser;
        if (host === null) return undefined;
        if (bridge === undefined) {
          try {
            setPhase('unsupported');
          } catch {
            /* the panel is gone */
          }
          return undefined;
        }

        let disposed = false;
        let unsubscribeOpen;
        let lease;
        let watchdog;
        let started = false;
        const element = document.createElement('webview');
        const initialTarget = rememberedTarget();
        let restoring = initialTarget !== CHAT_URL;

        Object.assign(element.style, styles.guest);
        element.setAttribute('allowpopups', '');

        /** Report a guest failure inside the panel; never throw. */
        const fail = (error) => {
          if (disposed) return;
          try {
            setPhase('failed');
            setFailure(String((error && error.message) || error));
          } catch {
            /* the panel is gone */
          }
        };

        /** Remember a URL reported by the guest and refresh the sign-in notice. */
        const remember = (raw) => {
          const url = parseChatUrl(raw);
          if (url === undefined) return;
          lastUrlRef.current = url.toString();
          rememberTarget(url.toString());
          try {
            setAuthPage(isAuthUrl(url.toString()));
          } catch {
            /* the panel is gone */
          }
        };

        const clearWatchdog = () => {
          if (watchdog !== undefined) {
            clearTimeout(watchdog);
            watchdog = undefined;
          }
        };

        const onDomReady = () => {
          started = true;
          clearWatchdog();
          if (!navigate(element, initialTarget)) {
            fail(new Error(t('crashed')));
            return;
          }
          remember(initialTarget);
        };

        const onStopLoading = () => {
          if (disposed) return;
          const raw = readUrl(element);
          if (raw !== undefined) remember(raw);
          restoring = false;
          try {
            setPhase('ready');
            setFailure(undefined);
          } catch {
            /* the panel is gone */
          }
        };

        const onNavigate = () => {
          if (disposed) return;
          remember(readUrl(element));
        };

        const onNavigateInPage = (event) => {
          if (disposed || event?.isMainFrame !== true) return;
          onNavigate();
        };

        const onFailLoad = (event) => {
          if (disposed || event?.isMainFrame !== true) return;
          // -3 is ERR_ABORTED: a superseded navigation, not a failure.
          if (event.errorCode === -3) return;
          if (restoring) {
            // The remembered conversation is gone or unreachable; start clean.
            restoring = false;
            if (!navigate(element, CHAT_URL)) fail(new Error(t('crashed')));
            else remember(CHAT_URL);
            return;
          }
          fail(event.errorDescription ?? event.errorCode);
        };

        /** The guest process exited or the guest was torn down underneath us. */
        const onGuestGone = () => {
          if (disposed) return;
          fail(new Error(t('crashed')));
        };

        const listeners = [
          ['dom-ready', onDomReady],
          ['did-stop-loading', onStopLoading],
          ['did-navigate', onNavigate],
          ['did-navigate-in-page', onNavigateInPage],
          ['did-fail-load', onFailLoad],
          ['render-process-gone', onGuestGone],
          ['destroyed', onGuestGone],
        ];

        try {
          for (const [type, handler] of listeners) {
            element.addEventListener(type, handler, type === 'dom-ready' ? { once: true } : undefined);
          }
        } catch (error) {
          fail(error);
        }

        const start = async () => {
          try {
            const reservation = await bridge.acquire(PARTITION_KEY);
            if (disposed) {
              try {
                Promise.resolve(bridge.release(reservation.lease)).catch(() => {});
              } catch {
                /* lease already gone */
              }
              return;
            }
            lease = reservation.lease;
            element.setAttribute('name', reservation.lease);
            element.setAttribute('partition', reservation.partition);
            element.setAttribute('src', `about:blank#${reservation.lease}`);
            try {
              unsubscribeOpen = bridge.onOpenRequested(reservation.lease, (url) => {
                if (!disposed && typeof url === 'string') navigate(element, url);
              });
            } catch {
              /* popup bridge unavailable: the guest still works */
            }
            host.append(element);
            watchdog = setTimeout(() => {
              watchdog = undefined;
              if (disposed || started) return;
              fail(new Error(t('timeout')));
            }, WATCHDOG_MS);
          } catch (error) {
            fail(error);
          }
        };
        void start();

        return () => {
          disposed = true;
          // Read before removal: React cleans up after taking the DOM away, and
          // Electron's getURL() throws on a detached webview.
          const current = readUrl(element);
          if (current !== undefined) {
            lastUrlRef.current = current;
            rememberTarget(current);
          }
          clearWatchdog();
          try {
            if (typeof unsubscribeOpen === 'function') unsubscribeOpen();
          } catch {
            /* already detached */
          }
          for (const [type, handler] of listeners) {
            try {
              element.removeEventListener(type, handler);
            } catch {
              /* already detached */
            }
          }
          try {
            element.remove();
          } catch {
            /* already detached */
          }
          const released = lease;
          lease = undefined;
          if (released !== undefined) {
            try {
              Promise.resolve(bridge.release(released)).catch(() => {});
            } catch {
              /* lease already gone */
            }
          }
        };
        // The effect is re-run only by an explicit retry.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [attempt]);

      if (phase === 'unsupported') {
        return React.createElement(
          'div',
          { style: styles.root, role: 'region', 'aria-label': t('title') },
          React.createElement(
            'div',
            { style: styles.overlay },
            React.createElement('div', { style: styles.overlayTitle }, t('unsupportedTitle')),
            React.createElement('div', null, t('unsupportedBody')),
            React.createElement(
              'div',
              { style: styles.actions },
              React.createElement(
                'button',
                { type: 'button', style: styles.button, onClick: () => openExternally(CHAT_URL) },
                t('openExternal'),
              ),
            ),
          ),
        );
      }

      return React.createElement(
        'div',
        { style: styles.root, role: 'region', 'aria-label': t('title') },
        phase === 'ready' && authPage
          ? React.createElement(
              'div',
              { style: styles.signInBar },
              React.createElement('span', { style: styles.signInText }, t('signInHint')),
              React.createElement(
                'button',
                {
                  type: 'button',
                  style: styles.linkButton,
                  onClick: () => openExternally('https://chat.deepseek.com/sign_in'),
                },
                t('signInAction'),
              ),
            )
          : null,
        React.createElement(
          'div',
          { style: styles.host, ref: hostRef },
          phase === 'failed' ? null : phase === 'ready' ? null : React.createElement(
            'div',
            { style: styles.overlay },
            React.createElement('div', null, t('loading')),
          ),
          phase === 'failed'
            ? React.createElement(
                'div',
                { style: styles.overlay },
                React.createElement('div', { style: styles.overlayTitle }, t('failed')),
                failure === undefined ? null : React.createElement('div', null, failure),
                React.createElement(
                  'div',
                  { style: styles.actions },
                  React.createElement(
                    'button',
                    { type: 'button', style: styles.button, onClick: retry },
                    t('retry'),
                  ),
                  React.createElement(
                    'button',
                    {
                      type: 'button',
                      style: styles.linkButton,
                      onClick: () => openExternally(CHAT_URL),
                    },
                    t('openExternal'),
                  ),
                ),
              )
            : null,
        ),
      );
    }

    /** The registered panel: the boundary owns every rendering failure below it. */
    function ChatPanelShell(props) {
      return React.createElement(
        PanelBoundary,
        { t: props.t ?? translate },
        React.createElement(ChatPanel, props),
      );
    }

    /** Client services this plugin reads; the loader waits for the slot registry. */
    const inject = ['slots', 'locale'];

    /**
     * Register the sidebar entry and its main panel.
     * @param ctx - client plugin context.
     */
    function apply(ctx) {
      try {
        // Copy is owned by the locale service so it follows host language changes.
        ctx.effect(() => {
          const offZh = ctx.locale.register(NS, 'zh', DICT.zh);
          const offEn = ctx.locale.register(NS, 'en', DICT.en);
          return () => {
            offZh();
            offEn();
          };
        }, 'vt-web-chat: locale dictionaries');

        const bound = ctx.locale.bind(NS);
        const fallback = (key) => DICT.en[key] ?? key;
        const t = (key) => {
          const raw = bound(key);
          return raw === key || raw === undefined || raw === null ? fallback(key) : raw;
        };
        translate = t;
        localeService = ctx.locale;

        // The same id addresses the panellist row and the main panel it selects.
        ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: PANEL_ID,
              inject: () => ({ t, locale: ctx.locale }),
            },
            ChatPanelShell,
          ),
        );

        // order -10 puts the row directly under "New Session", before Plugins (0).
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: -10,
              label: () => t('entry'),
            },
            Glyph,
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
