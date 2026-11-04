/**
 * dsh-vt-steer-now — client half.
 *
 * ── 它解决什么问题 ───────────────────────────────────────────────────────────
 * 「插入消息」（steer）只在 step 边界被 `preStep` claim。一个 step 里可能正在
 * 跑一个很慢的工具，也可能在长时间推理，于是这条消息要等当前 step 结束后模型
 * 才看得到。本插件在「回合运行中 + 有插入消息待生效」时，在那条待生效气泡的
 * 操作行里放一个「立即发送」，点击后由 Host 原子地中断当前回合并把消息重新
 * 投递到下一个回合的第 1 步。
 *
 * ── 状态从哪来（0.2.x）────────────────────────────────────────────────────────
 * `conversation.snapshot.queue` 只包含 `next-turn`；插入消息在 Host 的 `inbox`
 * 会话投影里（`{ "next-turn": [], "next-step": [] }`），只有槽位里的
 * `useProjection("inbox")` 能读到。因此这里注册一个渲染 null 的 dock 条目作为
 * 桥：它把 `next-step` 的消息 id 与 `running` 写进镜像，DOM 层据此画按钮。
 * 空组件不产生 DOM 节点，不影响输入框布局。
 *
 * ── 为什么按钮是 DOM 浮层而不是槽位 ──────────────────────────────────────────
 * 待生效的插入气泡由 ChatView 直接渲染（`pendingSteering.map(...)`），没有逐条
 * 槽位；唯一能包住它的槽位是 `conversation.chat.flow`（single），替换它等于重写
 * 整个聊天流。所以用 body 下的常驻浮层 + 气泡矩形定位：不动 React 树。
 */

window.__ModuleLoader__.load({
  id: 'dsh-vt-steer-now',
  factory(require) {
    'use strict';

    const React = require('react');

    /** 插件标识（与 package.json 的 name 一致）。 */
    const PLUGIN_ID = 'dsh-vt-steer-now';
    /** 与 package.json 的 version 保持一致。 */
    const VERSION = '1.0.2';
    /** 文案命名空间。 */
    const NS = 'vt-steer-now';
    /** Host 路由前缀，与 index.js 的 ROUTE_PREFIX 必须一致。 */
    const API_PREFIX = '/vt-steer-now/api';
    /** 待生效插入气泡的标记（由 ChatView 的 UserStyleBubble 输出）。 */
    const BUBBLE_SELECTOR = '[data-pending-steering]';
    /** 浮层重新定位的合并窗口：流式输出期间 DOM 变化很密。 */
    const RECONCILE_DELAY_MS = 120;

    const zh = {
      'action.now': '立即发送',
      'action.busy': '中断中…',
      'action.failed': '立即发送失败',
      'action.hint': '当前回合还没读到这条插入消息。点击中断当前步骤，让它立刻被读到。',
    };

    const en = {
      'action.now': 'Send now',
      'action.busy': 'Interrupting…',
      'action.failed': 'Send now failed',
      'action.hint': 'The turn has not read this steering message yet. Click to interrupt the current step so it is read immediately.',
    };

    /** 当前会话的待生效状态镜像：会话切换与队列变化都会重写它。 */
    function createMirror() {
      let state = { sessionId: undefined, steering: [], running: false };
      const listeners = new Set();
      return {
        get: () => state,
        /**
         * @param next - 新状态；与旧值等价时不通知，避免每帧重排。
         */
        set(next) {
          const same =
            next.sessionId === state.sessionId &&
            next.running === state.running &&
            next.steering.length === state.steering.length &&
            next.steering.every((id, index) => id === state.steering[index]);
          if (same) return;
          state = next;
          for (const listener of listeners) listener();
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
    }

    /**
     * 创建气泡下方的浮层与动作按钮。
     * @param options - 文案函数与状态镜像。
     */
    function createOverlay({ t, mirror }) {
      const root = document.createElement('div');
      root.setAttribute('data-vt-steer-now', '');
      root.style.cssText = [
        'position:fixed',
        'left:0',
        'top:0',
        'width:0',
        'height:0',
        'z-index:2147483000',
        'pointer-events:none',
      ].join(';');

      /** 与气泡按顺序一一对应的按钮池。 */
      const buttons = [];
      /** 合并后的定位任务。 */
      let timer = 0;

      function buttonAt(index) {
        while (buttons.length <= index) {
          const button = document.createElement('button');
          button.type = 'button';
          button.setAttribute('data-vt-steer-now-action', '');
          button.style.cssText = [
            'position:absolute',
            'left:0',
            'top:0',
            'display:none',
            'align-items:center',
            'gap:4px',
            'pointer-events:auto',
            'background:transparent',
            'border:0',
            'padding:2px 0',
            'margin:0',
            'font:inherit',
            'font-size:var(--dsh-content-font-size-secondary,13px)',
            'font-weight:400',
            'line-height:24px',
            'color:var(--dsw-alias-label-tertiary,#81858c)',
            'cursor:pointer',
            'white-space:nowrap',
          ].join(';');
          button.addEventListener('mouseenter', () => {
            button.style.color = 'var(--dsw-alias-label-secondary,#61666b)';
          });
          button.addEventListener('mouseleave', () => {
            button.style.color = 'var(--dsw-alias-label-tertiary,#81858c)';
          });
          button.addEventListener('click', () => {
            void submit(index, button);
          });
          root.appendChild(button);
          buttons.push(button);
        }
        return buttons[index];
      }

      /**
       * 请求 Host 把这条消息提前到下一个边界。
       * @param index - 气泡序号，与 state.steering 对齐。
       * @param button - 触发按钮。
       */
      async function submit(index, button) {
        const state = mirror.get();
        const itemId = state.steering[index];
        if (itemId === undefined || state.sessionId === undefined) return;
        button.dataset.busy = '1';
        button.disabled = true;
        button.textContent = t('action.busy');
        try {
          const response = await fetch(`${API_PREFIX}/preempt`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: state.sessionId, itemId }),
          });
          const payload = await response.json().catch(() => undefined);
          if (payload?.ok !== true) {
            // claimed 表示消息已被正常 claim：队列一变，按钮自己就消失了。
            if (payload?.reason === 'claimed') return;
            button.textContent = t('action.failed');
          }
        } catch {
          button.textContent = t('action.failed');
        } finally {
          delete button.dataset.busy;
          button.disabled = false;
        }
      }

      /** 把每条可见的待生效气泡与按钮对齐；不满足条件时全部隐藏。 */
      function reconcile() {
        const state = mirror.get();
        const bubbles = Array.from(document.querySelectorAll(BUBBLE_SELECTOR));
        const wanted =
          state.sessionId !== undefined && state.running && state.steering.length > 0
            ? Math.min(bubbles.length, state.steering.length)
            : 0;

        // 上界必须是 wanted（按钮池在循环内按需创建），否则池为空时一个也建不出来。
        for (let index = 0; index < wanted; index += 1) {
          const button = buttonAt(index);
          // data-pending-steering 标在整行容器上：子元素依次是气泡本体和操作行
          // （时间 + 复制等图标）。操作行是这一行的最后一个子元素。
          const row = bubbles[index];
          const children = row.children;
          const bubble = children.length > 0 ? children[0] : row;
          const actions = children.length > 1 ? children[children.length - 1] : null;
          const bubbleRect = bubble.getBoundingClientRect();
          const visible = bubbleRect.height > 0 && bubbleRect.bottom > 0 && bubbleRect.top < window.innerHeight;
          if (!visible) {
            button.style.display = 'none';
            continue;
          }
          if (button.dataset.busy !== '1') {
            button.textContent = t('action.now');
            button.title = t('action.hint');
          }
          button.style.display = 'inline-flex';

          // 放在时间左侧，读起来像操作行里的第一个动作，也不会压住时间与图标。
          // 操作行缺失时退回气泡右下角。
          const actionsRect = actions?.getBoundingClientRect();
          const anchor = actionsRect !== undefined && actionsRect.height > 0 ? actionsRect : undefined;
          const left = anchor === undefined
            ? bubbleRect.right - button.offsetWidth
            : anchor.left - button.offsetWidth - 8;
          const top = anchor === undefined
            ? bubbleRect.bottom + 6
            : anchor.top + (anchor.height - button.offsetHeight) / 2;
          button.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
        }

        // 多出来的按钮（气泡消失或回合结束后）一律收起。
        for (let index = wanted; index < buttons.length; index += 1) {
          buttons[index].style.display = 'none';
        }
      }

      /** 合并高频 DOM 变化，避免流式输出时每帧定位。 */
      function schedule() {
        if (timer !== 0) return;
        timer = window.setTimeout(() => {
          timer = 0;
          reconcile();
        }, RECONCILE_DELAY_MS);
      }

      /** 挂载浮层并监听所有会影响位置或可见性的变化。 */
      function mount() {
        document.body.appendChild(root);
        const observer = new MutationObserver(schedule);
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['data-pending-steering'],
        });
        window.addEventListener('scroll', schedule, true);
        window.addEventListener('resize', schedule, true);
        reconcile();
        return () => {
          observer.disconnect();
          window.removeEventListener('scroll', schedule, true);
          window.removeEventListener('resize', schedule, true);
          if (timer !== 0) window.clearTimeout(timer);
          timer = 0;
          root.remove();
          buttons.length = 0;
        };
      }

      /** 语言切换后按新字典重画文案。 */
      function refreshLabels() {
        for (const button of buttons) if (button.dataset.busy !== '1') button.textContent = t('action.now');
        reconcile();
      }

      return { mount, reconcile, schedule, refreshLabels };
    }

    /** 客户端依赖：槽位与语言字典。 */
    const inject = ['slots', 'locale'];

    /**
     * @param ctx Client 插件上下文。
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), `${PLUGIN_ID}: dictionaries`);

      const t = ctx.locale.bind(NS);
      const mirror = createMirror();
      const overlay = createOverlay({ t, mirror });

      /**
       * dock 桥：渲染 null，只负责把 `inbox` 投影里的插入消息同步到镜像。
       * @param props - 槽位注入的 sessionId，以及标准钩子 useSession / useProjection。
       */
      function SteerNowBridge({ sessionId, useSession, useProjection }) {
        const inbox = useProjection('inbox');
        const running = useSession((snapshot) => snapshot.running);
        const steps = Array.isArray(inbox?.['next-step']) ? inbox['next-step'] : [];
        // next-step 里也可能有非用户来源的上下文注入，只把用户插入消息算进来。
        const steering = steps
          .filter((message) => message?.source?.kind === 'user')
          .map((message) => message.id);

        React.useEffect(() => {
          mirror.set({ sessionId, steering, running: running === true });
          overlay.schedule();
        }, [sessionId, inbox, running]);

        return null;
      }

      ctx.effect(() => {
        const disposeOverlay = overlay.mount();
        const disposeMirror = mirror.subscribe(() => overlay.reconcile());
        const disposeLocale = ctx.locale.subscribe(() => overlay.refreshLabels());
        return () => {
          disposeLocale();
          disposeMirror();
          disposeOverlay();
        };
      }, `${PLUGIN_ID}: overlay`);

      ctx.inject(['slots'], (scope) => {
        scope.slots.inject('conversation.input.dock', () =>
          scope.slots.register(
            {
              name: 'conversation.input.dock',
              id: 'steer-now',
              order: 900,
              locale: NS,
              inject: (sessionId) => ({ sessionId }),
            },
            SteerNowBridge,
          ),
        );
      });

      ctx.effect(() => {
        const marker = { version: VERSION, plugin: PLUGIN_ID };
        window.__vtSteerNow = marker;
        return () => {
          if (window.__vtSteerNow === marker) delete window.__vtSteerNow;
        };
      }, `${PLUGIN_ID}: marker`);
    }

    return { apply, inject };
  },
});
