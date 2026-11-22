/**
 * Browser half of dsh-vt-web-chat.
 *
 * 面板里就是官方开源 chat-demo 的界面本身：插件把自己的 `/webchat/` 路由托管给同源
 * `iframe`，请求由 Host 用 DSH 的 DeepSeek 凭据代发。这里负责三件事：
 * 侧栏入口、整页面板、设置页里的会话保留策略。
 *
 * 2.1 起多了一层「Chat 模式」：选中网页对话面板时，侧栏的品牌名、会话浏览区和底部动作
 * 换成 Chat 自己的内容（历史、返回 Harness），离开面板时恢复宿主侧栏。接管只发生在
 * 子座位（brand.name / workspaces / footer.action）上，宿主骨架与「新会话」按钮都保留。
 *
 * 为什么用模式切换而不是把面板做成独立窗口：历史与新建对话都在同一个 iframe 里，
 * 侧栏只是它的导航面；两者由同一份状态驱动，用户不会看到两套互相不同步的列表。
 */
window.__ModuleLoader__.load({
  id: 'dsh-vt-web-chat',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const PLUGIN_ID = 'dsh-vt-web-chat';
    const VERSION = '2.1.0';
    const NS = PLUGIN_ID;
    /** 侧栏行与主面板共用的 id。 */
    const PANEL_ID = 'vt-web-chat';
    /** 与宿主路由一致的接口前缀。 */
    const ROUTE_PREFIX = '/webchat';
    /** 保留天数档位；0 表示永不清理。 */
    const RETENTION_CHOICES = [30, 60, 90, 0];
    /** 面板与宿主之间的消息来源标记。 */
    const HOST_SOURCE = 'vt-webchat-host';
    const SHELL_SOURCE = 'vt-webchat-shell';
    /** 离开 Chat 模式时给侧栏留出的淡出时间，需与 CSS 里的退场动画一致。 */
    const LEAVE_MS = 150;
    /** 返回 Harness 时选中的主面板 key。 */
    const CONVERSATION_PANEL = 'conversation';
    /**
     * 官方字标在 24px 高度下「deepseek」部分的像素宽度。
     * 字标 SVG 的 viewBox 从 x=26 开始，HARNESS 徽标从 x=129.348 开始，
     * 所以裁到 129.348 - 26 = 103.348px 时只剩下文字本身，徽标由我们自己画。
     */
    const WORDMARK_WIDTH = 103.35;

    /**
     * 官方品牌字标与鲸鱼标。取不到时品牌名退回纯文字、品牌标不接管，
     * 不能因为一个可选依赖让整个侧栏起不来。
     */
    let primitives = null;
    try {
      primitives = require('@deepseek-ai/dsh-client-ui-primitives');
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] shared UI primitives unavailable`, error);
    }

    const DICT = {
      zh: {
        'meta.title': '网页对话',
        'meta.description': '用官方 DeepSeek 网页界面聊天，请求走 DeepSeek API 与你的 DSH 账号。',
        'entry': '网页对话',
        'panel.title': '网页对话',
        'panel.hint': '滚动、复制、上传都在面板内完成；对话保存在本机，不会写入 DSH 会话。',
        'back': '返回 Harness',
        'back.hint': '退出 Chat 模式，回到 DSH 会话',
        'history.label': '对话历史',
        'history.today': '今天',
        'history.yesterday': '昨天',
        'history.week': '7 天内',
        'history.month': '30 天内',
        'history.empty': '还没有对话',
        'history.emptyHint': '点上方「新会话」开始第一个对话。',
        'history.error': '会话列表读取失败',
        'history.retry': '重试',
        'history.untitled': '新对话',
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
        'back': 'Back to Harness',
        'back.hint': 'Leave Chat mode and return to your DSH session',
        'history.label': 'Chat history',
        'history.today': 'Today',
        'history.yesterday': 'Yesterday',
        'history.week': 'Previous 7 days',
        'history.month': 'Previous 30 days',
        'history.empty': 'No chats yet',
        'history.emptyHint': 'Start one with New Session above.',
        'history.error': 'Could not read the chat list',
        'history.retry': 'Retry',
        'history.untitled': 'New chat',
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

    // ---------------------------------------------------------------------
    // 小状态仓库：React 用 useSyncExternalStore 订阅，侧栏与面板共用同一份快照。
    // ---------------------------------------------------------------------

    /**
     * 建一个只放对象快照的订阅仓库。
     * @param initial - 初始快照。
     * @returns `{ get, set, subscribe }`。
     */
    function createStore(initial) {
      let value = initial;
      const listeners = new Set();
      return {
        get: () => value,
        set: (next) => {
          if (Object.is(next, value)) return;
          value = next;
          for (const listener of Array.from(listeners)) {
            try {
              listener();
            } catch (error) {
              console.error(`[${PLUGIN_ID}] store listener failed`, error);
            }
          }
        },
        subscribe: (listener) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
      };
    }

    /**
     * 订阅仓库；宿主 React 一定带 useSyncExternalStore，缺失时退回 useState。
     * @param store - createStore 的返回值。
     * @returns 当前快照。
     */
    function useStore(store) {
      if (typeof React.useSyncExternalStore === 'function') {
        return React.useSyncExternalStore(store.subscribe, store.get, store.get);
      }
      const [value, setValue] = React.useState(store.get);
      React.useEffect(() => store.subscribe(() => setValue(store.get())), [store]);
      return value;
    }

    /** Chat 模式：active 接管侧栏，leaving 播放退场。 */
    const surface = createStore({ active: false, leaving: false });
    let leaveTimer = null;

    /** 进入 Chat 模式；如果正在退场则取消退场。 */
    function enterSurface() {
      if (leaveTimer !== null) {
        clearTimeout(leaveTimer);
        leaveTimer = null;
      }
      const current = surface.get();
      if (current.active && !current.leaving) return;
      surface.set({ active: true, leaving: false });
    }

    /** 离开 Chat 模式：先淡出，再让宿主侧栏回来。 */
    function leaveSurface() {
      const current = surface.get();
      if (!current.active || current.leaving) return;
      surface.set({ active: true, leaving: true });
      leaveTimer = setTimeout(() => {
        leaveTimer = null;
        surface.set({ active: false, leaving: false });
      }, LEAVE_MS);
    }

    /** 立即恢复 Harness 侧栏，不走淡出。用于「返回 Harness」这种要求跟手的路径。 */
    function exitSurfaceNow() {
      if (leaveTimer !== null) {
        clearTimeout(leaveTimer);
        leaveTimer = null;
      }
      if (!surface.get().active) return;
      surface.set({ active: false, leaving: false });
    }

    /**
     * 返回 Harness 后，指针通常还停在原来的坐标上；新出现的额度环/DS Bot 返回
     * 与返回行位置、hover 底色完全一样，轻微移动就会点亮，看起来像状态没释放。
     * 这里短暂压掉这两行的 hover 底色，直到指针离开底栏或超时，再恢复正常。
     */
    let returnHoverTimer = null;
    let returnHoverCleanup = null;
    let returnHoverToken = 0;

    function clearReturnedHover() {
      returnHoverToken += 1;
      document.documentElement.removeAttribute('data-vtwc-returning');
      if (returnHoverTimer !== null) {
        clearTimeout(returnHoverTimer);
        returnHoverTimer = null;
      }
      if (returnHoverCleanup !== null) {
        returnHoverCleanup();
        returnHoverCleanup = null;
      }
    }

    function suppressReturnedHover() {
      clearReturnedHover();
      const token = returnHoverToken;
      document.documentElement.setAttribute('data-vtwc-returning', 'true');
      const finish = () => clearReturnedHover();
      returnHoverTimer = setTimeout(finish, 1200);
      // 底栏要等侧栏提交后才存在；下一帧再挂 pointerleave。
      window.requestAnimationFrame(() => {
        if (token !== returnHoverToken) return;
        const footer = document.querySelector('[class*="footerActions"]');
        if (footer === null) return;
        footer.addEventListener('pointerleave', finish, { once: true });
        footer.addEventListener('pointerdown', finish, { once: true });
        returnHoverCleanup = () => {
          footer.removeEventListener('pointerleave', finish);
          footer.removeEventListener('pointerdown', finish);
        };
      });
    }

    /** 面板同步过来的会话历史。 */
    const chatData = createStore({ ready: false, sessions: [], activeId: null, error: false });

    // ---------------------------------------------------------------------
    // 面板桥：父页面只认 iframe 的 contentWindow，子页面只认 window.parent。
    // ---------------------------------------------------------------------

    const panelLink = {
      target: null,
      ready: false,
      queue: [],
      /** 记下当前面板窗口；换窗口时清掉旧的 ready 与待发命令。 */
      attach(target) {
        if (this.target === target) return;
        this.target = target ?? null;
        this.ready = false;
        this.queue = [];
      },
      detach(target) {
        if (target !== undefined && this.target !== target) return;
        this.target = null;
        this.ready = false;
        this.queue = [];
      },
      /** 发给面板；还没挂上时先排队，就绪后重放。 */
      post(message) {
        if (this.target === null) {
          if (this.queue.length < 24) this.queue.push(message);
          return;
        }
        try {
          this.target.postMessage({ source: SHELL_SOURCE, ...message }, '*');
        } catch (error) {
          console.warn(`[${PLUGIN_ID}] panel frame unavailable`, error);
        }
      },
      markReady() {
        if (this.ready) return;
        this.ready = true;
        const pending = this.queue;
        this.queue = [];
        for (const message of pending) this.post(message);
      },
    };

    /** 侧栏里点一条历史：交给面板切换会话。模块级引用，供 memo 行复用。 */
    function openChat(id) {
      panelLink.post({ type: 'open-session', id });
    }

    /**
     * 把面板发来的同步消息收敛成可渲染的会话摘要。
     * @param data - 面板消息。
     * @returns 新快照；字段不合法时返回 null，保留旧列表。
     */
    function readSync(data) {
      const current = chatData.get();
      let sessions = current.sessions;
      if (Array.isArray(data.sessions)) {
        sessions = [];
        for (const item of data.sessions) {
          if (item === null || typeof item !== 'object' || typeof item.id !== 'string') continue;
          sessions.push({
            id: item.id,
            title: typeof item.title === 'string' ? item.title : '',
            createdAt: Number(item.createdAt) || 0,
            updatedAt: Number(item.updatedAt) || 0,
          });
        }
      }
      // 增量消息可能只带 activeId：其余字段沿用上一份快照。
      const activeId =
        typeof data.activeId === 'string'
          ? data.activeId
          : data.activeId === null
            ? null
            : current.activeId;
      const ready = typeof data.ready === 'boolean' ? data.ready : current.ready;
      const error = typeof data.error === 'boolean' ? data.error : current.error;
      if (
        sessions === current.sessions &&
        activeId === current.activeId &&
        ready === current.ready &&
        error === current.error
      ) {
        return null;
      }
      return { ready, sessions, activeId, error };
    }

    /**
     * 处理面板发来的消息。
     * @param data - postMessage 的 data。
     */
    function handleHostMessage(data) {
      if (data === null || typeof data !== 'object' || data.source !== HOST_SOURCE) return;
      if (data.type === 'ready') {
        panelLink.markReady();
        panelLink.post({ type: 'request-sync' });
        return;
      }
      if (data.type === 'sync') {
        const next = readSync(data);
        if (next === null) return;
        chatData.set(next);
        if (next.ready) panelLink.markReady();
      }
    }

    const DAY_MS = 86_400_000;

    /**
     * 当天零点的时间戳。
     * @param value - 毫秒时间戳。
     * @returns 当天 00:00 的时间戳。
     */
    function startOfDay(value) {
      const date = new Date(value);
      date.setHours(0, 0, 0, 0);
      return date.getTime();
    }

    /**
     * 会话历史按月分组的键。
     * @param value - 毫秒时间戳。
     * @returns `YYYY-MM`；时间无效时为空串。
     */
    function monthKey(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    /**
     * 按 chat-demo 的同一规则分组：今天 / 昨天 / 7 天内 / 30 天内 / 月份。
     * @param sessions - 会话摘要，已按更新时间倒序。
     * @param now - 当前时间。
     * @param t - 翻译函数。
     * @returns 分组数组。
     */
    function groupSessions(sessions, now, t) {
      const groups = [];
      for (const session of sessions) {
        const diff = Math.floor((now - startOfDay(session.updatedAt)) / DAY_MS);
        let key = null;
        let label = '';
        if (diff <= 0) {
          key = 'today';
          label = t('history.today');
        } else if (diff <= 1) {
          key = 'yesterday';
          label = t('history.yesterday');
        } else if (diff < 7) {
          key = 'week';
          label = t('history.week');
        } else if (diff < 30) {
          key = 'month';
          label = t('history.month');
        } else {
          key = `m:${monthKey(session.updatedAt)}`;
          label = monthKey(session.updatedAt);
        }
        const last = groups.at(-1);
        if (last !== undefined && last.key === key) last.sessions.push(session);
        else groups.push({ key, label, sessions: [session] });
      }
      return groups;
    }

    /** 每分钟刷新一次「今天/昨天」边界；窗口重新可见时也刷新。 */
    function useClock() {
      const [now, setNow] = React.useState(() => Date.now());
      React.useEffect(() => {
        const tick = () => setNow(Date.now());
        const timer = setInterval(tick, 60_000);
        const onVisible = () => {
          if (document.visibilityState === 'visible') tick();
        };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', tick);
        return () => {
          clearInterval(timer);
          document.removeEventListener('visibilitychange', onVisible);
          window.removeEventListener('focus', tick);
        };
      }, []);
      return now;
    }

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
          'data-vtwc-glyph': 'true',
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
     * 返回箭头：DSH 官方 onboarding-back.svg 的路径与描边。
     * 路径按 16px 图标网格缩放（不是铺满 24px 占位槽）；
     * non-scaling-stroke 让 1.18823 的描边粗细不随缩放变细。
     */
    function BackIcon() {
      return h(
        'svg',
        {
          viewBox: '0 0 20.2792 16.825',
          width: 16,
          height: 16,
          preserveAspectRatio: 'xMidYMid meet',
          fill: 'none',
          'aria-hidden': true,
          style: { display: 'block' },
        },
        h('path', {
          d: 'M1.01986 8.58958H20.2792M8.54303 0.407656L0.825554 8.58958L8.54303 16.4077',
          stroke: 'currentColor',
          strokeWidth: 1.18823,
          vectorEffect: 'non-scaling-stroke',
        }),
      );
    }

    /**
     * 面板本体：一个占满主内容区的同源 iframe。
     * @param props - locale、inset、hostRef、frameRef。
     * @returns 面板容器。
     */
    function Panel(props) {
      const frameRef = props.frameRef;
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
      }, [frameRef, inset]);

      React.useEffect(pushSeat, [pushSeat]);

      const onLoad = () => {
        panelLink.attach(frameRef.current === null ? null : frameRef.current.contentWindow);
        panelLink.post({ type: 'request-sync' });
        pushSeat();
      };

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
          onLoad,
          src: panelUrl(props.locale ?? 'zh-CN'),
          title: 'DeepSeek',
          allow: 'clipboard-write; microphone',
          style: { width: '100%', height: '100%', border: 'none', display: 'block', background: 'transparent' },
        }),
      );
    }

    /**
     * 主面板外壳：挂载即进入 Chat 模式，卸载即退出；
     * 同时负责把 iframe 的窗口登记给侧栏桥，并转发面板消息。
     * @returns 面板。
     */
    function PanelShell(props) {
      const ctx = props.ctx;
      const frameRef = React.useRef(null);
      const hostRef = React.useRef(null);
      const [locale, setLocale] = React.useState(() => hostLocale(ctx));
      const [inset, setInset] = React.useState(() => measureSeatInset(null));

      React.useEffect(() => ctx.locale.subscribe(() => setLocale(hostLocale(ctx))), [ctx]);

      // 主面板只在被选中时挂载：挂载/卸载就是 Chat 模式的开关。
      React.useEffect(() => {
        enterSurface();
        return () => leaveSurface();
      }, []);

      React.useEffect(() => {
        const frame = frameRef.current;
        const win = frame === null ? null : frame.contentWindow;
        panelLink.attach(win);

        const onMessage = (event) => {
          const current = frameRef.current;
          if (current === null || event.source !== current.contentWindow) return;
          handleHostMessage(event.data);
        };
        window.addEventListener('message', onMessage);

        // 面板脚本可能在监听装好之前就完成了首帧：几次请求同步兜住这个窗口。
        const request = () => panelLink.post({ type: 'request-sync' });
        const timers = [0, 300, 1200, 3000].map((delay) => setTimeout(request, delay));

        return () => {
          for (const timer of timers) clearTimeout(timer);
          window.removeEventListener('message', onMessage);
          panelLink.detach(win);
        };
      }, []);

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

      return h(Panel, { locale, inset, hostRef, frameRef });
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

    /** Chat 模式的样式。用宿主 token，深浅色和字体大小自动跟随。 */
    const CHAT_CSS = `
/* Chat 模式下，全局面板行让位给 Chat 自己的动线。
   座位 API 只能追加，不能删掉别的插件已经注册的行，所以这里按稳定的业务标识
   精确隐藏：全局面板行、DS Bot 的返回按钮、额度条。离开 Chat 模式后属性移除，
   这些行原样恢复；账号/设置行保持可用。 */
html[data-vtwc-surface='chat'] [class*="panelList"] { display: none; }
html[data-vtwc-surface='chat'] .bt-return { display: none !important; }
html[data-vtwc-surface='chat'] [data-plugin='dsh-vt-quote-bar'] { display: none !important; }
/* 返回后短暂压掉底栏两行的 hover 底色，避免看起来像返回按钮的状态滞留。 */
html[data-vtwc-returning='true'] .vtq-collapsed:hover { background-color: transparent !important; }
html[data-vtwc-returning='true'] .bt-return:hover { background-color: var(--bt-return-fill, transparent) !important; }
.vtwc-brand {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  height: 24px;
  cursor: default;
  animation: vtwc-brand-in 200ms cubic-bezier(.2, .8, .2, 1);
}
.vtwc-brand[data-vtwc-leaving='true'] { animation: vtwc-brand-out 150ms ease forwards; }
.vtwc-brand-wordmark { display: inline-flex; flex: none; width: 103.35px; height: 24px; overflow: hidden; }
.vtwc-brand-wordmark > svg { display: block; flex: none; }
.vtwc-brand-fallback {
  font-size: 18px;
  font-weight: 600;
  line-height: 24px;
  letter-spacing: .04em;
  color: var(--dsw-alias-label-primary);
}
.vtwc-brand-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 52px;
  height: 14px;
  border-radius: 2px;
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-specific-sidebar-fill);
  font-family: var(--ds-font-family-code);
  font-size: 10px;
  font-weight: 500;
  line-height: 14px;
  letter-spacing: .08em;
}
.vtwc-region {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  padding-top: 6px;
  animation: vtwc-in 200ms cubic-bezier(.2, .8, .2, 1);
}
.vtwc-region[data-vtwc-leaving='true'] { animation: vtwc-out 150ms ease forwards; }
.vtwc-list {
  flex: 1;
  min-height: 0;
  margin: 0 -2px;
  padding: 0 2px 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-color: var(--dsh-scrollbar-thumb) transparent;
}
.vtwc-group { margin-top: 16px; }
.vtwc-group:first-child { margin-top: 0; }
.vtwc-group-label {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 2px 10px;
  background: var(--dsw-specific-sidebar-fill);
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  user-select: none;
}
.vtwc-row {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  width: 100%;
  height: 40px;
  padding: 9px 6px 9px 10px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  text-align: left;
  cursor: pointer;
}
.vtwc-row:hover { background: var(--dsw-specific-sidebar-nav-item-hover); }
.vtwc-row-active,
.vtwc-row-active:hover {
  background: var(--dsw-specific-sidebar-nav-item-active-accent);
  color: var(--dsw-alias-brand-primary-invert);
}
.vtwc-row:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: -2px; }
.vtwc-row-title { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; line-height: 18px; }
.vtwc-skeleton { display: flex; flex-direction: column; gap: 14px; padding: 14px 10px 0; }
.vtwc-skeleton-row {
  height: 12px;
  border-radius: 6px;
  background: var(--dsw-alias-interactive-bg-hover);
  animation: vtwc-pulse 1.4s ease-in-out infinite;
}
.vtwc-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 32px 16px;
  text-align: center;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 20px;
}
.vtwc-empty-title { color: var(--dsw-alias-label-secondary); font-size: 13px; font-weight: 500; }
.vtwc-retry {
  margin-top: 4px;
  padding: 4px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.vtwc-retry:hover { background: var(--dsw-alias-interactive-bg-hover); }
/* 与侧栏账号行同一套排版：44px 行高、6px 内边距、24px 图标槽、8px 间距、
   14px 字号、label-primary 文本色；只去掉账号行的圆形底。 */
.vtwc-back {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  width: calc(100% - 4px);
  height: 44px;
  margin: 0 2px 2px;
  padding: 6px;
  border: 0;
  border-radius: var(--dsw-radius-md);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  text-align: left;
  cursor: pointer;
  animation: vtwc-in 200ms cubic-bezier(.2, .8, .2, 1);
}
.vtwc-back[data-vtwc-leaving='true'] { animation: vtwc-out 150ms ease forwards; }
.vtwc-back:hover { background: var(--dsw-alias-interactive-bg-hover); }
.vtwc-back:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: -2px; }
.vtwc-back-rail { width: 36px; height: 36px; margin: 0; padding: 0; justify-content: center; gap: 0; }
.vtwc-back-icon { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 24px; height: 24px; }
.vtwc-back-label { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.vtwc-rail {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin-top: 2px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.vtwc-rail:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
@keyframes vtwc-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes vtwc-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(4px); } }
@keyframes vtwc-brand-in { from { opacity: 0; transform: translateX(-4px); } to { opacity: 1; transform: none; } }
@keyframes vtwc-brand-out { to { opacity: 0; } }
@keyframes vtwc-pulse { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .vtwc-region,
  .vtwc-brand,
  .vtwc-back,
  .vtwc-skeleton-row { animation: none !important; }
}
`;

    return {
      inject: ['slots', 'locale', 'layout'],
      apply(ctx) {
        ctx.effect(() => {
          const offZh = ctx.locale.register(NS, 'zh', DICT.zh);
          const offEn = ctx.locale.register(NS, 'en', DICT.en);
          return () => {
            offZh();
            offEn();
          };
        }, `${PLUGIN_ID}: locale`);

        ctx.effect(() => {
          const style = document.createElement('style');
          style.dataset.plugin = PLUGIN_ID;
          style.dataset.pluginCss = `${PLUGIN_ID}/chat-mode`;
          style.textContent = CHAT_CSS;
          document.head.appendChild(style);
          return () => style.remove();
        }, `${PLUGIN_ID}: chat mode styles`);

        ctx.effect(() => {
          const root = document.documentElement;
          const sync = () => {
            if (surface.get().active) root.setAttribute('data-vtwc-surface', 'chat');
            else root.removeAttribute('data-vtwc-surface');
          };
          const off = surface.subscribe(sync);
          sync();
          return () => {
            off();
            root.removeAttribute('data-vtwc-surface');
          };
        }, `${PLUGIN_ID}: chat surface`);

        // 一次捕获监听处理两件事：
        //   1) 点「网页对话」入口时，先切侧栏，不等主面板挂载完成；
        //   2) 收起侧栏后，宿主 frame 左上角的浮动「新建会话」在 Chat 模式下改走新建对话。
        ctx.effect(() => {
          const onClick = (event) => {
            const target = event.target;
            if (target === null || typeof target.closest !== 'function') return;

            if (surface.get().active) {
              if (target.closest('[data-shell-leading]') === null) return;
              const button = target.closest('button');
              if (button === null || button.hasAttribute('data-sidebar-opener')) return;
              event.preventDefault();
              event.stopPropagation();
              panelLink.post({ type: 'new-chat' });
              return;
            }

            // 入口行：按钮里带本插件图标的才算，避免误伤其它面板行。
            const button = target.closest('button');
            if (button === null || button.querySelector('[data-vtwc-glyph]') === null) return;
            enterSurface();
          };
          document.addEventListener('click', onClick, true);
          return () => document.removeEventListener('click', onClick, true);
        }, `${PLUGIN_ID}: mode entry and leading new session`);

        ctx.effect(
          () => () => clearReturnedHover(),
          `${PLUGIN_ID}: returned-hover cleanup`,
        );

        const bound = ctx.locale.bind(NS);
        const t = (key, ...rest) => {
          const raw = bound(key);
          const value = raw === key || raw === undefined || raw === null ? DICT.en[key] : raw;
          return typeof value === 'function' ? value(...rest) : value;
        };

        /**
         * 抢在现有注册之前接管一个 single 座位。
         * priority 越小越优先；每次都取当前最低值再减一，避免与另一个插件撞车抛错。
         * @param name - 座位名。
         * @returns 可用的 priority。
         */
        const freePriority = (name) => {
          try {
            const entries = ctx.slots.entries(name) ?? [];
            const values = entries.map((entry) => {
              const value = entry?.options?.priority;
              return typeof value === 'number' ? value : 0;
            });
            return (values.length > 0 ? Math.min(...values) : 0) - 1;
          } catch {
            return -50;
          }
        };

        /**
         * 在 Chat 模式期间向一个座位注册；离开后注销，让宿主内容回来。
         * @param name - 座位名。
         * @param options - 注册选项（每次激活时求值，方便带 locale 文案）。
         * @param Component - 组件。
         * @param label - effect 标签。
         */
        const keepActive = (name, options, Component, label) => {
          ctx.effect(
            () =>
              ctx.slots.inject(name, () => {
                let dispose = null;
                const sync = () => {
                  const active = surface.get().active;
                  if (active && dispose === null) {
                    try {
                      dispose = ctx.slots.register({ name, ...options() }, Component);
                    } catch (error) {
                      console.error(`[${PLUGIN_ID}] ${label}`, error);
                      dispose = null;
                    }
                  } else if (!active && dispose !== null) {
                    dispose();
                    dispose = null;
                  }
                };
                const off = surface.subscribe(sync);
                sync();
                return () => {
                  off();
                  if (dispose !== null) {
                    dispose();
                    dispose = null;
                  }
                };
              }),
            label,
          );
        };

        // -- 品牌名：Chat 模式把 HARNESS 徽标换成 chat，字标沿用官方那份 ----------

        function ChatBrandName() {
          const state = useStore(surface);
          const stop = (event) => {
            event.preventDefault();
            event.stopPropagation();
          };
          const wordmark =
            primitives !== null && primitives.BrandWordmark != null
              ? h(primitives.BrandWordmark, { includeMark: false })
              : h('span', { className: 'vtwc-brand-fallback' }, 'deepseek');
          return h(
            'span',
            {
              className: 'vtwc-brand',
              'data-vtwc-leaving': state.leaving ? 'true' : 'false',
              // 品牌行本身就是宿主的「新建会话」按钮；Chat 模式下点它不应该建 DSH 会话。
              onClickCapture: stop,
            },
            h('span', { className: 'vtwc-brand-wordmark' }, wordmark),
            h('span', { className: 'vtwc-brand-badge', 'aria-hidden': true }, 'CHAT'),
          );
        }

        // -- 品牌标：只拦 logo 行的点击，收起态里同一个座位还嵌在展开按钮里 --------

        function ChatBrandMark(props) {
          const size = typeof props?.size === 'number' ? props.size : 24;
          const stop = (event) => {
            const current = event.currentTarget;
            // 收起态的这个座位在「展开侧栏」按钮内部，点了必须让它正常工作。
            if (current !== null && typeof current.closest === 'function' && current.closest('[class*="toggle"]') !== null) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
          };
          return h(
            'span',
            { style: { display: 'inline-flex' }, onClickCapture: stop },
            h(primitives.FishLogo, { size }),
          );
        }

        // -- 历史：按 chat-demo 的分组与行高渲染，点击让 iframe 切换会话 ----------

        /** 单条历史行：memo 化，切换选中时只重渲染跨过选中态的两行。 */
        const ChatRow = React.memo(function ChatRow(props) {
          return h(
            'button',
            {
              type: 'button',
              className: `vtwc-row${props.active ? ' vtwc-row-active' : ''}`,
              title: props.title || props.untitled,
              onClick: () => openChat(props.id),
            },
            h('span', { className: 'vtwc-row-title' }, props.title || props.untitled),
          );
        });

        function ChatHistory(props) {
          const state = useStore(surface);
          const data = useStore(chatData);
          const now = useClock();
          const wide = props?.wide !== false;
          const untitled = t('history.untitled');
          const groups = React.useMemo(
            () => groupSessions(data.sessions, now, t),
            [data.sessions, now],
          );

          if (!wide) {
            return h(
              'button',
              {
                type: 'button',
                className: 'vtwc-rail',
                title: t('entry'),
                'aria-label': t('entry'),
                onClick: () => {
                  if (typeof props?.expandSidebar === 'function') props.expandSidebar();
                },
              },
              h(Glyph, { size: 18 }),
            );
          }

          let content;
          if (data.error) {
            content = h(
              'div',
              { className: 'vtwc-empty' },
              h('span', { className: 'vtwc-empty-title' }, t('history.error')),
              h(
                'button',
                { type: 'button', className: 'vtwc-retry', onClick: () => panelLink.post({ type: 'retry' }) },
                t('history.retry'),
              ),
            );
          } else if (!data.ready && data.sessions.length === 0) {
            content = h(
              'div',
              { className: 'vtwc-skeleton', 'aria-hidden': true },
              h('div', { className: 'vtwc-skeleton-row', style: { width: '72%' } }),
              h('div', { className: 'vtwc-skeleton-row', style: { width: '88%' } }),
              h('div', { className: 'vtwc-skeleton-row', style: { width: '60%' } }),
            );
          } else if (data.sessions.length === 0) {
            content = h(
              'div',
              { className: 'vtwc-empty' },
              h('span', { className: 'vtwc-empty-title' }, t('history.empty')),
              h('span', null, t('history.emptyHint')),
            );
          } else {
            content = groups.map((group) =>
              h(
                'section',
                { key: group.key, className: 'vtwc-group' },
                h('div', { className: 'vtwc-group-label' }, group.label),
                group.sessions.map((session) =>
                  h(ChatRow, {
                    key: session.id,
                    id: session.id,
                    title: session.title,
                    active: session.id === data.activeId,
                    untitled,
                  }),
                ),
              ),
            );
          }

          return h(
            'div',
            { className: 'vtwc-region', 'data-vtwc-leaving': state.leaving ? 'true' : 'false' },
            h('nav', { className: 'vtwc-list', 'aria-label': t('history.label') }, content),
          );
        }

        // -- 底部：返回 Harness -------------------------------------------------

        function BackToHarness(props) {
          const state = useStore(surface);
          const wide = props?.wide !== false;
          const back = () => {
            // 先恢复侧栏并让它完成一帧绘制，再挂载会话面板：
            // 会话面板的挂载较重，放在同一帧会把侧栏恢复一起拖慢。
            // 同时短暂屏蔽底部动作区，避免指针没动却点亮刚出现的额度环。
            suppressReturnedHover();
            exitSurfaceNow();
            window.requestAnimationFrame(() => {
              window.requestAnimationFrame(() => {
                if (surface.get().active) return;
                try {
                  ctx.layout.selectPanel(CONVERSATION_PANEL);
                } catch (error) {
                  console.error(`[${PLUGIN_ID}] could not return to the conversation`, error);
                }
              });
            });
          };
          return h(
            'button',
            {
              type: 'button',
              className: `vtwc-back${wide ? '' : ' vtwc-back-rail'}`,
              'data-vtwc-back': 'true',
              'data-vtwc-leaving': state.leaving ? 'true' : 'false',
              'aria-label': t('back'),
              title: t('back.hint'),
              onClick: back,
            },
            h('span', { className: 'vtwc-back-icon' }, h(BackIcon)),
            wide ? h('span', { className: 'vtwc-back-label' }, t('back')) : null,
          );
        }

        // -- 「新会话」：保留宿主的按钮与样式，Chat 模式下把点击改成新建对话 ------

        function NewSessionLayer(props) {
          const intercept = React.useCallback((event) => {
            if (!surface.get().active) return;
            event.preventDefault();
            event.stopPropagation();
            panelLink.post({ type: 'new-chat' });
          }, []);
          return h('span', { style: { display: 'contents' }, onClickCapture: intercept }, props?.children ?? null);
        }

        // -- 注册：品牌、浏览区、底部动作在模式期间接管；入口在模式外显示 ----------

        keepActive(
          'sidebar.brand.name',
          () => ({ priority: freePriority('sidebar.brand.name'), locale: NS }),
          ChatBrandName,
          `${PLUGIN_ID}: chat brand`,
        );

        if (primitives !== null && primitives.FishLogo != null) {
          keepActive(
            'sidebar.brand.mark',
            () => ({ priority: freePriority('sidebar.brand.mark'), locale: NS }),
            ChatBrandMark,
            `${PLUGIN_ID}: chat brand mark`,
          );
        }

        keepActive(
          'sidebar.workspaces',
          () => ({ priority: freePriority('sidebar.workspaces'), locale: NS }),
          ChatHistory,
          `${PLUGIN_ID}: chat history`,
        );

        keepActive(
          'sidebar.footer.action',
          () => ({ id: 'vt-web-chat-back', order: -10, locale: NS }),
          BackToHarness,
          `${PLUGIN_ID}: back to harness`,
        );

        // 入口行始终注册：Chat 模式下由上面的 panelList 样式整体隐藏，
        // 这样退出时不必重新注册，宿主的面板列表也不会因为注销而抖动。
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: PANEL_ID, order: -10, label: () => t('entry') },
            Glyph,
          ),
        );

        // HOC 只负责拦截点击；按钮本身、图标、尺寸全部保持宿主原样。
        ctx.effect(
          () =>
            ctx.slots.inject('sidebar.session.action', () =>
              ctx.slots.register(
                { name: 'sidebar.session.action', id: 'vt-web-chat-new-session', order: 10, priority: -10 },
                NewSessionLayer,
              ),
            ),
          `${PLUGIN_ID}: new session click`,
        );

        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, (props) => h(PanelShell, { ...props, ctx })));

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
