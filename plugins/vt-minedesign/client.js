/**
 * dsh-vt-minedesign — web half.
 *
 * Why this file exists: the host half gets an editor address out of an MCP tool
 * result, and the generic browser tab DSH can open for any URL is not a place a
 * user can work — it is a web page in a panel, with no product chrome and no
 * relationship to the plugin. This half registers a real right-Sidebar tab type
 * instead: a MineDesign entry on the panel's guide page, a body with its own top
 * bar, and a tab that follows whichever document the agent opened.
 *
 * The seam to the host is one read-only JSON route (`/vt-minedesign/sessions`),
 * polled while this plugin lives. No RPC framework, no shared module, no copy of
 * the host's state: the browser asks, the host answers.
 *
 * The editor itself is MineDesign's own local web app, framed here. It sends no
 * `X-Frame-Options` and no `frame-ancestors`, so framing is allowed by design;
 * if a future MineDesign adds one, the iframe load timeout degrades to the
 * "open in browser" action instead of a blank panel.
 */

window.__ModuleLoader__.load({
  id: 'dsh-vt-minedesign',
  factory(require) {
    'use strict';

    const React = require('react');

    const PLUGIN_ID = 'dsh-vt-minedesign';
    const VERSION = '1.0.1';

    /** Tab kind the registry routes `openTab('minedesign')` to. */
    const KIND = 'minedesign';

    /** Locale namespace, matching the other plugins in this repository. */
    const NS = 'vtMinedesign';

    /** Host route that reports open editor sessions. */
    const ROUTE = '/vt-minedesign/sessions';

    /** Poll cadence while a session is visible, and while the page is hidden. */
    const POLL_MS = 3000;
    const POLL_HIDDEN_MS = 15000;

    /** How long an iframe may stay unpainted before the panel offers a fallback. */
    const LOAD_TIMEOUT_MS = 6000;

    /** Guide capsule position: after the app's own entries, before "more tools". */
    const GUIDE_ORDER = 40;

    const DICT = {
      zh: {
        'guide.description': '打开本机 MineDesign 编辑器',
        'empty.title': '还没有在 MineDesign 里打开的作品',
        'empty.body': '让模型写一份设计稿并调用 minedesign_open_document，这个面板会自动显示它。',
        'state.offline': '没有连上 MineDesign 的本地 MCP',
        'state.offlineBody': '先运行 npx @vontean/minedesign plugin install，再重启 DSH。',
        'state.noRoute': '面板数据通道不可用',
        'state.noRouteBody': '本次运行没有注册宿主路由（无头模式或旧版本）。编辑器地址仍可从工具结果里取。',
        'state.loading': '正在加载编辑器…',
        'state.failed': '编辑器没能加载出来',
        'state.failedBody': '地址可能已过期（DSH 重启会换端口）。让模型重新调用 minedesign_open_document。',
        'action.reload': '刷新',
        'action.browser': '在浏览器打开',
        'action.retry': '重新打开',
        'action.open': 'MineDesign',
      },
      en: {
        'guide.description': 'Open the local MineDesign editor',
        'empty.title': 'No MineDesign work is open yet',
        'empty.body': 'Ask the agent to write a design and call minedesign_open_document; this panel follows it.',
        'state.offline': 'MineDesign MCP is not connected',
        'state.offlineBody': 'Run npx @vontean/minedesign plugin install, then restart DSH.',
        'state.noRoute': 'The panel data channel is unavailable',
        'state.noRouteBody': 'This run registered no host route. The editor address is still in the tool result.',
        'state.loading': 'Loading the editor…',
        'state.failed': 'The editor did not load',
        'state.failedBody': 'The address may be stale (a restart changes the port). Ask the agent to reopen the document.',
        'action.reload': 'Reload',
        'action.browser': 'Open in browser',
        'action.retry': 'Reopen',
        'action.open': 'MineDesign',
      },
    };

    /*
     * MineDesign's official mark (24×24), inlined so it follows `currentColor`:
     * the outer codex-outline ring plus the Lucide brush, exactly as shipped in
     * the MineDesign brand sources. See THIRD_PARTY_NOTICES.md.
     */
    const ICON_RING = 'M9.3316 2.03768C11.1644 1.54688 13.0268 2.04668 14.356 3.20174C16.0859 2.86512 17.9511 3.36418 19.2935 4.70663C20.6356 6.04882 21.1326 7.91288 20.7964 9.64217C21.9527 10.9716 22.4534 12.8349 21.9625 14.6685C21.4711 16.5025 20.1051 17.8657 18.439 18.439C17.8658 20.1047 16.503 21.47 14.6695 21.9615C12.8356 22.4528 10.9727 21.9519 9.64312 20.7955C7.91371 21.1319 6.04993 20.635 4.70757 19.2926C3.36558 17.9505 2.86659 16.0866 3.20269 14.357C2.04693 13.0273 1.54757 11.1638 2.03863 9.33065C2.52997 7.49759 3.89436 6.13282 5.56011 5.55917C6.13382 3.8935 7.49837 2.52891 9.3316 2.03768ZM13.2623 4.63534C12.3606 3.80149 11.067 3.4361 9.79742 3.77596C8.52745 4.11626 7.58924 5.0796 7.22515 6.25253C7.08145 6.71575 6.71753 7.07928 6.25445 7.22323C5.08133 7.58702 4.11844 8.52622 3.77789 9.79647C3.43759 11.0667 3.80148 12.3606 4.63531 13.2623C4.96467 13.6184 5.09776 14.1154 4.99078 14.5885C4.71939 15.7864 5.05109 17.0891 5.98101 18.0191C6.91085 18.949 8.21345 19.2801 9.41168 19.0084L9.58941 18.9791C9.94695 18.9432 10.3065 19.0397 10.5982 19.2496L10.7378 19.3639L10.9117 19.5142C11.8015 20.2407 13.0127 20.5413 14.2037 20.2223C15.4733 19.8818 16.4111 18.9191 16.775 17.7457C16.9189 17.2824 17.2832 16.9186 17.7466 16.775L17.9634 16.6998C19.0376 16.2923 19.9051 15.3936 20.2242 14.2027C20.5641 12.9328 20.1989 11.6385 19.3648 10.7369C19.0353 10.3806 18.9021 9.88399 19.0093 9.41073L19.0533 9.18514C19.2372 8.0514 18.8917 6.85176 18.0201 5.98006C17.0901 5.05003 15.7865 4.71826 14.5884 4.98983C14.1153 5.09712 13.6186 4.96467 13.2623 4.63534Z';
    const ICON_BRUSH = 'm9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08Z';
    const ICON_BRISTLE = 'M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z';

    /**
     * MineDesign's mark as a React component, so the guide capsule and the
     * toolbar follow the theme through `currentColor`.
     *
     * @param {{ size?: number, style?: object }} props - glyph size and style.
     * @returns {any} SVG element.
     */
    function MineDesignIcon({ size = 16, style }) {
      return React.createElement(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          'aria-hidden': 'true',
          focusable: 'false',
          style: { flex: 'none', display: 'block', ...style },
        },
        React.createElement('path', { d: ICON_RING, fill: 'currentColor', fillRule: 'evenodd', clipRule: 'evenodd' }),
        React.createElement(
          'g',
          { transform: 'translate(6.24 6.24) scale(.48)', fill: 'currentColor' },
          React.createElement('path', { d: ICON_BRUSH }),
          React.createElement('path', { d: ICON_BRISTLE }),
        ),
      );
    }

    /* ------------------------------------------------------------------ */
    /* MCP Apps host shim                                                  */
    /* ------------------------------------------------------------------ */

    /*
     * MineDesign's app is an MCP App: embedded, it runs
     * `app = new App(...); await app.connect()` and then talks to its host over
     * postMessage instead of the HTTP API (`dist/app.js` decides on
     * `window.parent !== window`). DSH is not an MCP Apps host, so without this
     * shim the shell waits on `ui/initialize` forever ("Connecting to the
     * document"). The shim answers the handshake and forwards `tools/call` to
     * the host route, which translates it onto the companion's HTTP face.
     */

    /** Protocol revision the shipped shell negotiates. */
    const APP_PROTOCOL = '2026-01-26';

    /**
     * Ask the host to run one bridged tool.
     * @param {string} tool - MCP tool name the shell used.
     * @param {object} args - its arguments.
     * @returns {Promise<any>} tool result.
     */
    async function callBridge(tool, args) {
      const response = await fetch(ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ tool, args: args ?? {} }),
      });
      const payload = await response.json();
      if (payload === null || typeof payload !== 'object' || payload.ok !== true) {
        throw new Error(typeof payload?.reason === 'string' ? payload.reason : `bridge HTTP ${response.status}`);
      }
      return payload.result;
    }

    /**
     * Build the JSON-RPC reply for one App request.
     * @param {string} method - JSON-RPC method.
     * @param {any} params - request params.
     * @returns {Promise<{ result?: any, error?: { code: number, message: string } }>} outcome.
     */
    async function answerApp(method, params, sessionId) {
      if (method === 'ui/initialize') {
        const dark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
        return {
          result: {
            protocolVersion: APP_PROTOCOL,
            hostInfo: { name: 'DeepSeek Harness', version: VERSION },
            // We deliberately advertise nothing: no sampling, no elicitation,
            // no task support. The shell only needs tools/call.
            hostCapabilities: {},
            hostContext: {
              theme: dark ? 'dark' : 'light',
              displayMode: 'inline',
              locale: typeof navigator === 'object' && typeof navigator.language === 'string' ? navigator.language : 'zh-CN',
            },
          },
        };
      }
      if (method === 'tools/call') {
        const name = typeof params?.name === 'string' ? params.name : '';
        try {
          return { result: await callBridge(name, params?.arguments) };
        } catch (error) {
          return { error: { code: -32000, message: error instanceof Error ? error.message : String(error) } };
        }
      }
      if (method === 'ui/message') {
        // The app's "Send to chat": MineDesign flushes annotations, then hands
        // the text to the host. The host submits it as a user prompt, which is
        // the same path the composer uses.
        const blocks = Array.isArray(params?.content) ? params.content : [];
        const text = blocks
          .filter((block) => block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
          .map((block) => block.text)
          .join('\n')
          .trim();
        if (text === '' || typeof sessionId !== 'string' || sessionId === '') {
          return { error: { code: -32000, message: 'nothing to send' } };
        }
        try {
          const response = await fetch(ROUTE, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ action: 'message', sessionId, text }),
          });
          const payload = await response.json();
          if (payload === null || typeof payload !== 'object' || payload.ok !== true) {
            throw new Error(typeof payload?.reason === 'string' ? payload.reason : `HTTP ${response.status}`);
          }
          return { result: {} };
        } catch (error) {
          return { error: { code: -32000, message: error instanceof Error ? error.message : String(error) } };
        }
      }
      if (method === 'ui/open-link' || method === 'ui/download-file') {
        // Acknowledged with an empty result; the shell opens links itself.
        return { result: {} };
      }
      return { error: { code: -32601, message: `dsh-vt-minedesign: unsupported host method ${method}` } };
    }

    /* ------------------------------------------------------------------ */
    /* session store                                                       */
    /* ------------------------------------------------------------------ */

    /**
     * One polled view of the host's session list, shared by the tab body, the
     * tab title and the auto-open watcher.
     *
     * Failure is a state, not an exception: the panel must be able to say
     * "channel unavailable" instead of unmounting.
     *
     * @returns {{ get: () => any, subscribe: (listener: () => void) => () => void, refresh: () => Promise<void> }} store.
     */
    function createStore() {
      let state = { status: 'loading', data: null, error: null };
      const listeners = new Set();
      let inflight = null;

      const publish = (next) => {
        state = { ...state, ...next };
        for (const listener of [...listeners]) {
          try {
            listener();
          } catch {
            /* a broken listener must not stop the others */
          }
        }
      };

      const refresh = () => {
        if (inflight !== null) return inflight;
        inflight = Promise.resolve()
          .then(() => fetch(ROUTE, { headers: { accept: 'application/json' }, credentials: 'same-origin' }))
          .then(async (response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (data === null || typeof data !== 'object' || data.ok !== true) {
              throw new Error(typeof data?.reason === 'string' ? data.reason : 'bad payload');
            }
            publish({ status: 'ready', data, error: null });
          })
          .catch((error) => {
            publish({ status: 'error', error: error instanceof Error ? error.message : String(error) });
          })
          .finally(() => {
            inflight = null;
          });
        return inflight;
      };

      return {
        get: () => state,
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        refresh,
      };
    }

    /**
     * Read the store with React state, subscribing for the component's lifetime.
     * @param {any} store - polled store.
     * @returns {any} current state.
     */
    function useStore(store) {
      const [snapshot, setSnapshot] = React.useState(store.get);
      React.useEffect(() => {
        setSnapshot(store.get());
        return store.subscribe(() => setSnapshot(store.get()));
      }, [store]);
      return snapshot;
    }

    /* ------------------------------------------------------------------ */
    /* styles                                                              */
    /* ------------------------------------------------------------------ */

    /*
     * Only documented theme tokens are used, so the panel follows light/dark
     * without a parallel palette. Values are alias tokens; no raw hex here.
     */
    const S = {
      root: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: 'var(--dsw-alias-bg-base, #ffffff)',
        color: 'var(--dsw-alias-label-primary, #141414)',
      },
      button: {
        flex: 'none',
        appearance: 'none',
        border: '1px solid transparent',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary, #666)',
        fontSize: 12,
        lineHeight: '20px',
        padding: '2px 8px',
        borderRadius: 6,
        cursor: 'pointer',
      },
      frame: { flex: 1, minHeight: 0, width: '100%', border: 0, background: '#ffffff', colorScheme: 'light' },
      center: {
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: 24,
        textAlign: 'center',
      },
      centerTitle: { fontSize: 13, color: 'var(--dsw-alias-label-primary, #141414)' },
      centerBody: { fontSize: 12, lineHeight: 1.6, maxWidth: 280, color: 'var(--dsw-alias-label-tertiary, #8a8a8a)' },
      iconMuted: { color: 'var(--dsw-alias-label-tertiary, #8a8a8a)' },
    };

    /* ------------------------------------------------------------------ */
    /* components                                                          */
    /* ------------------------------------------------------------------ */

    /**
     * Tab body: top bar plus the framed editor.
     *
     * @param {{ useTabInfo?: () => any }} props - framework-injected readers.
     * @returns {any} element tree.
     */
    function PanelBody(props) {
      const store = props.store;
      const state = useStore(store);
      const frameRef = React.useRef(null);
      const [painted, setPainted] = React.useState(false);
      const [timedOut, setTimedOut] = React.useState(false);
      // Bumped to force a reload of the framed app after a failure.
      const [nonce, setNonce] = React.useState(0);

      const data = state.status === 'ready' ? state.data : null;
      const editors = Array.isArray(data?.editors) ? data.editors : [];
      // The host's companion serves the real application (MineDesign's own top
      // bar, document switcher, zoom, undo/redo, Properties/Tweaks/Comments).
      // Without it, the editor page is still usable — just thinner.
      const appUrl = typeof data?.appUrl === 'string' && data.appUrl !== '' ? data.appUrl : null;
      const activeUrl = data?.active ?? editors.at?.(-1)?.editorUrl ?? null;
      const frameUrl = appUrl ?? activeUrl;
      const current = editors.find((editor) => editor.editorUrl === activeUrl) ?? null;

      // Reset the paint watchdog whenever the framed address changes.
      React.useEffect(() => {
        setPainted(false);
        setTimedOut(false);
        if (frameUrl === null) return undefined;
        const timer = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
        return () => clearTimeout(timer);
      }, [frameUrl, nonce]);

      // Answer the App's handshake and tool calls while it is framed.
      React.useEffect(() => {
        if (frameUrl === null) return undefined;
        let appOrigin;
        try {
          appOrigin = new URL(frameUrl).origin;
        } catch {
          return undefined;
        }
        const onMessage = (event) => {
          if (frameRef.current === null || event.source !== frameRef.current.contentWindow) return;
          if (event.origin !== appOrigin) return;
          const message = event.data;
          if (message === null || typeof message !== 'object' || message.jsonrpc !== '2.0') return;
          // Notifications carry no id and need no answer.
          if (message.id === undefined || message.id === null) return;
          void answerApp(String(message.method ?? ''), message.params, props.sessionId).then((outcome) => {
            const target = frameRef.current?.contentWindow;
            if (!target) return;
            const reply = { jsonrpc: '2.0', id: message.id };
            target.postMessage(
              outcome.error === undefined
                ? { ...reply, result: outcome.result ?? {} }
                : { ...reply, error: outcome.error },
              appOrigin,
            );
          });
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
      }, [frameUrl, props.sessionId]);

      const t = props.t;
      const openInBrowser = React.useCallback(() => {
        if (frameUrl === null) return;
        try {
          window.open(frameUrl, '_blank', 'noopener,noreferrer');
        } catch {
          /* a blocked popup is not worth a message of its own */
        }
      }, [frameUrl]);

      // ── body ───────────────────────────────────────────────────────────
      // No chrome of our own: the application inside brings its own top bar, and
      // a second one above it read as a duplicate of MineDesign.
      let body;
      if (state.status === 'error') {
        body = centerBlock(
          t('state.noRoute'),
          `${t('state.noRouteBody')}（${state.error ?? ''}）`,
          React.createElement(MineDesignIcon, { size: 28, style: S.iconMuted }),
        );
      } else if (data !== null && data.mcpConnected === false && editors.length === 0) {
        body = centerBlock(t('state.offline'), t('state.offlineBody'), React.createElement(MineDesignIcon, { size: 28, style: S.iconMuted }));
      } else if (state.status === 'loading') {
        body = centerBlock(t('state.loading'), '', null);
      } else if (frameUrl === null) {
        body = centerBlock(t('empty.title'), t('empty.body'), React.createElement(MineDesignIcon, { size: 28, style: S.iconMuted }));
      } else if (timedOut && !painted) {
        body = centerBlock(
          t('state.failed'),
          t('state.failedBody'),
          React.createElement(MineDesignIcon, { size: 28, style: S.iconMuted }),
          React.createElement(
            'div',
            { style: { display: 'flex', gap: 8 } },
            React.createElement('button', { type: 'button', style: S.button, onClick: () => setNonce(nonce + 1) }, t('action.retry')),
            React.createElement('button', { type: 'button', style: S.button, onClick: openInBrowser }, t('action.browser')),
          ),
        );
      } else {
        body = React.createElement('iframe', {
          // Re-key on the active document too: the app shell bakes its document
          // list into the page it was served with, so a newly opened document is
          // only visible after it reloads.
          key: `${frameUrl}#${activeUrl ?? ''}#${nonce}`,
          ref: frameRef,
          src: frameUrl,
          title: current?.title ?? 'MineDesign',
          style: S.frame,
          allow: 'clipboard-read; clipboard-write; fullscreen',
          referrerPolicy: 'no-referrer',
          onLoad: () => setPainted(true),
        });
      }

      return React.createElement('div', { style: S.root }, body);
    }

    /**
     * Centered state block used by every non-numeric panel state.
     * @param {string} title - headline.
     * @param {string} detail - explanation.
     * @param {any} glyph - leading glyph.
     * @param {any} [actions] - optional action row.
     * @returns {any} element.
     */
    function centerBlock(title, detail, glyph, actions) {
      return React.createElement(
        'div',
        { style: S.center },
        glyph,
        React.createElement('div', { style: S.centerTitle }, title),
        detail === '' ? null : React.createElement('div', { style: S.centerBody }, detail),
        actions ?? null,
      );
    }

    /**
     * Tab chip: the open document's title, falling back to the product name.
     * @param {{ useTabInfo?: () => any, store: any }} props - framework readers.
     * @returns {any} element.
     */
    function PanelTitle(props) {
      const state = useStore(props.store);
      const editors = Array.isArray(state.data?.editors) ? state.data.editors : [];
      const current = editors.find((editor) => editor.editorUrl === state.data?.active) ?? null;
      return React.createElement('span', null, current?.title || 'MineDesign');
    }

    /**
     * Conversation-header shortcut, so the panel is one click away even when the
     * right column is collapsed.
     * @param {{ open: () => void, t: (key: string) => string }} props - injected actions.
     * @returns {any} element.
     */
    function HeaderButton(props) {
      const state = useStore(props.store);
      // `entryButton: false` hides the shortcut; the guide capsule still opens it.
      if (state.data?.options?.entryButton === false) return null;
      return React.createElement(
        'button',
        {
          type: 'button',
          title: props.t('action.open'),
          'aria-label': props.t('action.open'),
          onClick: props.open,
          style: { ...S.button, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px' },
        },
        // Icon-only: the header utilities row is compact, and the tooltip carries the name.
        React.createElement(MineDesignIcon, { size: 16 }),
      );
    }

    /* ------------------------------------------------------------------ */
    /* plugin                                                              */
    /* ------------------------------------------------------------------ */

    /**
     * Services this half needs. `sidebarRight` and `sidebarRightTabs` are
     * provided by the right-Sidebar package with `ctx.reflect.provide`, so they
     * resolve whenever that package is loaded.
     */
    const inject = ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs'];

    /**
     * @param {any} ctx - client Cordis context.
     */
    function apply(ctx) {
      const store = createStore();

      // Dictionaries are a nicety: a locale failure must not take the panel down.
      let offZh = () => {};
      let offEn = () => {};
      try {
        offZh = ctx.locale.register(NS, 'zh', DICT.zh);
        offEn = ctx.locale.register(NS, 'en', DICT.en);
      } catch {
        /* keep the English fallbacks below */
      }
      // The dictionaries live exactly as long as this plugin does.
      ctx.effect(() => () => {
        offZh();
        offEn();
      }, `${PLUGIN_ID}: locale dictionaries`);

      const bound = typeof ctx.locale?.bind === 'function' ? ctx.locale.bind(NS) : null;
      const t = (key) => {
        const value = typeof bound === 'function' ? bound(key) : key;
        return typeof value === 'string' && value !== key ? value : DICT.en[key] ?? key;
      };

      const openPanel = () => {
        try {
          // Throws when no Session surface is mounted; that is a normal state,
          // not an error the panel should surface.
          ctx.sidebarRight.openTab(KIND);
        } catch {
          /* no session */
        }
      };

      // 1. The tab type, including its guide capsule.
      ctx.effect(
        () =>
          ctx.sidebarRightTabs.register({
            id: PLUGIN_ID,
            kind: KIND,
            priority: 'extension',
            title: () => 'MineDesign',
            guide: [
              {
                // 引导项的身份是 `kind:id`（见 dsh-client-ui-sidebar-right 的 guideEntryId）。
                // 缺 id 时同一 tab 类型的所有引导项会塌成同一个 pin 身份，加第二条就会互相干扰。
                id: KIND,
                order: GUIDE_ORDER,
                title: () => 'MineDesign',
                description: () => t('guide.description'),
                icon: MineDesignIcon,
              },
            ],
          }),
        `${PLUGIN_ID}: sidebar tab type`,
      );

      // 2. The body and its chip title.
      ctx.slots.inject('sidebar.right.pane.tab', () =>
        ctx.slots.register(
          {
            name: 'sidebar.right.pane.tab',
            key: PLUGIN_ID,
            // The slot hands the body's session id to this factory first; it is
            // what `ui/message` ("Send to chat") must address.
            inject: (sessionId) => ({ store, t, sessionId }),
          },
          PanelBody,
        ),
      );
      ctx.slots.inject('sidebar.right.pane.tab.title', () =>
        ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: PLUGIN_ID, inject: () => ({ store }) }, PanelTitle),
      );

      // 3. Poll the host, and follow a newly opened document automatically.
      ctx.effect(() => {
        let timer = null;
        let stopped = false;
        let lastActive = undefined;

        const tick = () => {
          if (stopped) return;
          store.refresh().then(() => {
            if (stopped) return;
            const data = store.get().data;
            const active = typeof data?.active === 'string' ? data.active : null;
            if (active === null) return;
            // The first observation is a baseline: a page reload must not pop
            // the panel open for a document that was already there.
            const isNew = lastActive !== undefined && active !== lastActive;
            lastActive = active;
            if (isNew && data?.options?.autoOpen !== false) openPanel();
          });

          const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
          timer = setTimeout(tick, hidden ? POLL_HIDDEN_MS : POLL_MS);
        };

        tick();
        return () => {
          stopped = true;
          if (timer !== null) clearTimeout(timer);
        };
      }, `${PLUGIN_ID}: session poller`);

      // 4. A header shortcut when that seat exists.
      ctx.slots.inject('conversation.session.header.utilities', () =>
        ctx.slots.register(
          {
            name: 'conversation.session.header.utilities',
            id: PLUGIN_ID,
            order: 60,
            inject: () => ({ open: openPanel, t, store }),
          },
          HeaderButton,
        ),
      );

      return VERSION;
    }

    return { apply, inject };
  },
});
