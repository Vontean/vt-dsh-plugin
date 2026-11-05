/**
 * dsh-vt-sidebar-sort — client half.
 *
 * Drag the global panel rows under "New Session" into your own order, and drop
 * one on the built-in "More" row to file it into the More menu. Filed rows come
 * back by dragging them out of that menu onto the list again.
 *
 * Why the DOM instead of the slot registry: `sidebar.panellist` is a list Slot
 * ordered by each registrant's `order` option, and the Client Service exposes
 * `register`/`inject` only — nothing can re-order another plugin's entry. The
 * sidebar rebuilds that order from the slot on every change, so the person's
 * order is kept here and re-applied after each render; it is the source of
 * truth, not the DOM.
 *
 * Why the native drag model: the session list already sorts with HTML5
 * drag-and-drop and paints its insert caret with a `::before`/`::after` rule on
 * the row (`dropBefore`/`dropAfter` in ui-workspace). This plugin copies that
 * caret verbatim — same 12px box, same 5px chevron, same
 * `--dsw-alias-state-business-primary` line — so dragging a panel row looks
 * exactly like dragging a session. The floating copy is Chromium's own drag
 * image; the plugin never draws a second one.
 */
window.__ModuleLoader__.load({
  // 模块 id 必须与包名一致；装载器把多个 client.js 拼进同一个脚本，所以顶层只能有
  // 这一个 load() 调用，其余常量一律放进 factory 的作用域，避免重名 SyntaxError。
  id: 'dsh-vt-sidebar-sort',
  factory(require) {
    'use strict';

    /** Package identity: one source for the module id and every log/storage prefix. */
    const PLUGIN_ID = 'dsh-vt-sidebar-sort';
    /** Must equal `version` in package.json. */
    const VERSION = '1.0.0';

    // Mount trace: one line naming the loaded build (DevTools → verbose level).
    console.debug(`[${PLUGIN_ID}] v${VERSION}`);

    const reactModule = require('react');
    const React =
      reactModule !== null && typeof reactModule.createElement === 'function'
        ? reactModule
        : reactModule.default;

    /** Saved order + filed rows; one versioned envelope. */
    const STORAGE_KEY = `${PLUGIN_ID}:layout`;
    /** Private drag type: our dragover only claims drags that carry it. */
    const DRAG_TYPE = 'application/x-dsh-vt-sidebar-sort';

    /**
     * DOM anchors. The sidebar's CSS-module class names carry a per-build hash
     * (`kB3qhq_panelRow`), so they are matched by their stable suffix instead:
     * the same rule the other vt-* plugins use for host markup.
     */
    const NAV_SELECTOR = 'nav[class*="_panelList"]';
    const ROW_SELECTOR = 'button[class*="_panelRow"]';
    /** `PanelMoreMenu` is the only row that opens a menu — that is its identity. */
    const MORE_SELECTOR = 'button[aria-haspopup="menu"][class*="_panelRow"]';

    /** Live engine handle, so menu rows can ask for a repaint after a state change. */
    let engineRef = null;

    //#region state

    /**
     * The person's layout. Ids that are absent from `order` keep their slot
     * order, so a plugin installed later lands at the end instead of nowhere.
     */
    const state = { order: [], hidden: [] };

    /** Labels last seen in the DOM, so a filed row can still be named. */
    const labels = new Map();

    /** Menu subscribers; the engine never renders, it only notifies. */
    const listeners = new Set();

    function isIdList(value) {
      return Array.isArray(value) && value.every((item) => typeof item === 'string');
    }

    /** Read the saved layout once at install; a broken value falls back to slot order. */
    function readState() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === null) return;
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object') return;
        if (isIdList(parsed.order)) state.order = parsed.order.slice();
        if (isIdList(parsed.hidden)) state.hidden = parsed.hidden.slice();
      } catch (error) {
        /* private mode or a corrupt value: the shipped order still works */
      }
    }

    function persist() {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ version: 1, order: state.order, hidden: state.hidden }),
        );
      } catch (error) {
        /* storage unavailable: the session keeps its order until reload */
      }
    }

    /** Announce a layout change: persistence first, then the open More menu. */
    function emit() {
      persist();
      for (const listener of listeners) {
        try {
          listener();
        } catch (error) {
          /* a broken subscriber must not stop the others */
        }
      }
      if (engineRef !== null) engineRef.schedule();
    }

    //#endregion
    //#region row identity

    const FIBER_PREFIX = '__reactFiber$';

    /** React stores the fiber of a host node under one random-suffixed own key. */
    function fiberOf(node) {
      const keys = Object.getOwnPropertyNames(node);
      for (const key of keys) {
        if (key.startsWith(FIBER_PREFIX)) return node[key];
      }
      return undefined;
    }

    /**
     * The panel id behind a row. The row renders no id of its own, so the id is
     * read from the `PanelRow` fiber props (`id`, `label`, `renderSlot`) a few
     * frames above the button; `getAttribute('aria-label')` is the fallback for
     * a React version that hides its internals. The answer is cached on the node:
     * React keys rows by id, so a reused node still means the same panel.
     * @param button - one panel row button.
     * @returns the stable key used by the saved layout.
     */
    function panelIdentity(button) {
      const cached = button.dataset.vtRowId;
      if (cached !== undefined) return cached;

      let id;
      let fiber = fiberOf(button);
      for (let depth = 0; fiber !== undefined && fiber !== null && depth < 16; depth += 1) {
        const props = fiber.memoizedProps;
        if (
          props !== null &&
          typeof props === 'object' &&
          typeof props.id === 'string' &&
          typeof props.label === 'string' &&
          typeof props.renderSlot === 'function'
        ) {
          id = props.id;
          labels.set(id, props.label);
          break;
        }
        fiber = fiber.return;
      }

      if (id === undefined) {
        // 标签兜底：React 内部结构变化时排序仍可用，只是切换语言后需要重新拖一次。
        const label = button.getAttribute('aria-label') ?? '';
        id = `label:${label}`;
        if (label !== '') labels.set(id, label);
      }

      button.dataset.vtRowId = id;
      return id;
    }

    //#endregion
    //#region glyphs

    /** Panel glyphs keyed by id, refreshed by the engine after each layout pass. */
    const glyphs = new Map();

    /**
     * Icons in the shipped menu use a 16-unit grid with stroke 1 (rendered at
     * 14px). A panel glyph drawn on a 24-unit grid therefore needs stroke 1.5 to
     * look equally heavy in that menu; explicit heavy strokes (dots, accents)
     * keep their own weight.
     * @param svg - a detached panel glyph.
     * @returns the same node with normalized stroke weights.
     */
    function normalizeGlyph(svg) {
      const viewBox = svg.getAttribute('viewBox');
      if (viewBox === null) return svg;
      const parts = viewBox.trim().split(/[\s,]+/);
      const size = Number(parts[2]);
      if (!Number.isFinite(size) || size <= 0 || size === 16) return svg;
      const unit = size / 16;
      // 根节点自己也可能带 stroke，querySelectorAll 不含自身，所以先放进候选。
      for (const node of [svg, ...svg.querySelectorAll('[stroke]')]) {
        if (node.getAttribute('stroke') === 'none') continue;
        const own = node.getAttribute('stroke-width');
        const width = own === null ? 1 : Number.parseFloat(own);
        if (own !== null && Number.isFinite(width) && width > 1.6) continue;
        node.setAttribute('stroke-width', String(unit));
      }
      return svg;
    }

    /** Refresh the cached glyph of every rendered row. */
    function cacheGlyphs(rows) {
      for (const row of rows) {
        const id = row.dataset.vtRowId;
        if (id === undefined) continue;
        const span = row.querySelector('span[class*="_panelGlyph"]');
        const svg = span === null ? null : span.querySelector('svg');
        if (svg === null) continue;
        const html = svg.outerHTML;
        const cached = glyphs.get(id);
        if (cached !== undefined && cached.html === html) continue;
        glyphs.set(id, { html, node: normalizeGlyph(svg.cloneNode(true)) });
      }
    }

    /** A fresh copy of the panel's glyph, or null before the row has rendered. */
    function panelGlyph(id) {
      const cached = glyphs.get(id);
      return cached === undefined ? null : cached.node.cloneNode(true);
    }

    //#endregion
    //#region styles

    /**
     * One stylesheet, marked with `data-plugin-css` like the shipped modules, so
     * the loader can reclaim it and `dispose` removes exactly this tag.
     * The caret block is copied from ui-workspace's session row rule; the More
     * state is additive and uses the same accent token.
     */
    const CSS = `
/* 插入位置：与原生会话列表同一套「小箭头 + 2px 蓝线」。 */
button.vt-sort-before,
button.vt-sort-after {
  position: relative;
}
button.vt-sort-before::before,
button.vt-sort-after::after {
  content: '';
  position: absolute;
  left: 0;
  right: 4px;
  height: 12px;
  z-index: 1;
  pointer-events: none;
  background:
    linear-gradient(55deg, transparent calc(50% - 1px), var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)) 0 0 / 5px 7px no-repeat,
    linear-gradient(125deg, transparent calc(50% - 1px), var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)) 0 5px / 5px 7px no-repeat,
    linear-gradient(var(--dsw-alias-state-business-primary) 0 0) 4px 5px / calc(100% - 4px) 2px no-repeat;
}
button.vt-sort-before::before { top: -7px; }
button.vt-sort-after::after { bottom: -7px; }

/* 被拖起的行：悬浮影像由浏览器绘制，本体压暗，避免看起来有两份。 */
[data-vt-sort-dragging] button.vt-sort-source { opacity: 0.45; }

/* 收进「更多」的行。侧边栏自己的 display:flex 会压过 UA 的 [hidden]，必须 !important。 */
button.vt-sort-filed { display: none !important; }

/* 「更多」作为投放目标：底色 + 内描边 + 主色文字，导轨文字提示随后。 */
button.vt-sort-more-over {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-state-business-primary);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-state-business-primary);
  transition: background-color 120ms var(--ds-ease-in-out), box-shadow 120ms var(--ds-ease-in-out), color 120ms var(--ds-ease-in-out);
}
@supports (background: color-mix(in srgb, red 10%, transparent)) {
  button.vt-sort-more-over {
    background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent);
  }
}
/* 投放完成：一次 480ms 的收束，确认「已收进更多」。 */
@keyframes vt-sort-accept {
  0% {
    background: var(--dsw-alias-interactive-bg-hover);
    box-shadow: inset 0 0 0 1px var(--dsw-alias-state-business-primary);
  }
  100% {
    background: transparent;
    box-shadow: inset 0 0 0 1px transparent;
  }
}
button.vt-sort-more-accept { animation: vt-sort-accept 480ms var(--ds-ease-in-out); }

/* 「更多」菜单里已收起的行，就是普通菜单行。 */
.vt-sort-menu-row {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 34px;
  margin: 0;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--dsw-radius-md);
  background: none;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  text-align: left;
  cursor: grab;
}
.vt-sort-menu-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.vt-sort-menu-row:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -2px;
}
.vt-sort-menu-icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
}
.vt-sort-menu-icon > svg { display: block; width: 14px; height: 14px; }
.vt-sort-menu-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) {
  button.vt-sort-more-over { transition: none; }
  button.vt-sort-more-accept { animation: none; }
}
`;

    /** Install the stylesheet; the returned disposer removes exactly this tag. */
    function mountStyle() {
      const tag = document.createElement('style');
      tag.dataset.plugin = PLUGIN_ID;
      tag.dataset.pluginCss = `${PLUGIN_ID}/nav-sort.css`;
      tag.textContent = CSS;
      document.head.appendChild(tag);
      return () => {
        tag.remove();
      };
    }

    //#endregion
    //#region engine

    function inRect(rect, x, y, slack) {
      return (
        x >= rect.left - slack &&
        x <= rect.right + slack &&
        y >= rect.top - slack &&
        y <= rect.bottom + slack
      );
    }

    function sameOrder(left, right) {
      return left.length === right.length && left.every((id, index) => id === right[index]);
    }

    /**
     * The DOM side of the feature: keep row order, hide filed rows, and own the
     * native drag gesture. It never renders anything and never touches React
     * state; the More menu is a separate component reading the same store.
     */
    function createEngine() {
      /** Current `<nav class="..._panelList">`, re-resolved on every pass. */
      let nav = null;
      let observer = null;
      let frame = 0;
      let drag = null;
      let acceptTimer = 0;
      let disposeStyle = null;

      /** The open More menu's dismiss callback, if the menu is mounted. */
      const menu = { dismiss: null };

      /** Coalesce DOM work into one animation frame; observers can be chatty. */
      function schedule() {
        if (frame !== 0) return;
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          try {
            apply();
          } catch (error) {
            console.error(`${PLUGIN_ID}: layout pass failed`, error);
          }
        });
      }

      /** Direct panel-row children only; the More button is nested in its anchor. */
      function rows() {
        return nav === null ? [] : Array.from(nav.querySelectorAll(`:scope > ${ROW_SELECTOR}`));
      }

      function moreButton() {
        // 唯一带 aria-haspopup 的面板行就是「更多」；不限定外层结构，菜单包装层变了也命中。
        return nav === null ? null : nav.querySelector(MORE_SELECTOR);
      }

      /** Every row id in current DOM order, filed rows included. */
      function allIds() {
        return rows().map((row) => panelIdentity(row));
      }

      /** Saved order first, then ids the saved layout has never seen. */
      function sortBySaved(ids) {
        const rank = new Map();
        state.order.forEach((id, index) => rank.set(id, index));
        const known = ids.filter((id) => rank.has(id)).sort((a, b) => rank.get(a) - rank.get(b));
        const fresh = ids.filter((id) => !rank.has(id));
        return known.concat(fresh);
      }

      function apply() {
        const nextNav = document.querySelector(NAV_SELECTOR);
        if (nextNav === null) {
          nav = null;
          return;
        }
        nav = nextNav;

        const nodes = rows();
        if (nodes.length === 0) return;

        const ids = nodes.map((row) => panelIdentity(row));
        cacheGlyphs(nodes);

        for (let index = 0; index < nodes.length; index += 1) {
          // 原生 dragstart 只对可拖元素触发：行本身必须先变成 draggable，
          // 否则鼠标怎么拖都不会有 drag 事件（点击不受影响，浏览器有拖动阈值）。
          if (nodes[index].draggable !== true) nodes[index].draggable = true;
          // 收起的行用类隐藏（display 由本插件的 !important 规则接管，读屏同样跳过）。
          nodes[index].classList.toggle('vt-sort-filed', state.hidden.includes(ids[index]));
        }

        const desired = sortBySaved(ids);
        if (!sameOrder(ids, desired)) {
          const byId = new Map();
          ids.forEach((id, index) => byId.set(id, nodes[index]));
          nav.append(...desired.map((id) => byId.get(id)).filter((node) => node !== undefined));
        }

        // 「更多」永远收尾，即使 React 之后插入新行也一样。
        const more = moreButton();
        const anchor = more === null ? null : more.parentElement;
        if (anchor !== null && anchor.parentElement === nav && nav.lastElementChild !== anchor) {
          nav.appendChild(anchor);
        }
      }

      function clearMarkers() {
        for (const node of document.querySelectorAll('.vt-sort-before, .vt-sort-after')) {
          node.classList.remove('vt-sort-before', 'vt-sort-after');
        }
        if (drag !== null) drag.marker = null;
      }

      function setMoreOver(more, on) {
        if (more === null) return;
        if (more.classList.contains('vt-sort-more-over') === on) return;
        more.classList.toggle('vt-sort-more-over', on);
      }

      function setMarker(marker) {
        if (drag !== null && drag.marker !== null && marker !== null) {
          const same = drag.marker.row === marker.row && drag.marker.side === marker.side;
          if (same) return;
        }
        clearMarkers();
        if (marker === null) return;
        marker.row.classList.add(marker.side === 'before' ? 'vt-sort-before' : 'vt-sort-after');
        if (drag !== null) drag.marker = marker;
      }

      /** Resolve the drop target strictly from geometry, so an open menu overlay cannot hide it. */
      function track(x, y) {
        if (nav === null || drag === null) return;

        const more = moreButton();
        if (more !== null && inRect(more.getBoundingClientRect(), x, y, 4)) {
          setMarker(null);
          setMoreOver(more, true);
          drag.mode = 'more';
          return;
        }
        setMoreOver(more, false);

        const bounds = nav.getBoundingClientRect();
        if (!inRect(bounds, x, y, 10)) {
          setMarker(null);
          drag.mode = null;
          return;
        }

        const candidates = rows().filter((row) => row !== drag.node && !row.classList.contains('vt-sort-filed'));
        let marker = null;
        for (const row of candidates) {
          const rect = row.getBoundingClientRect();
          if (y < rect.top + rect.height / 2) {
            marker = { row, side: 'before' };
            break;
          }
        }
        if (marker === null) {
          const last = candidates[candidates.length - 1];
          if (last !== undefined) marker = { row: last, side: 'after' };
          else if (more !== null) marker = { row: more, side: 'before' };
        }

        setMarker(marker);
        drag.mode = marker === null ? null : 'list';
      }

      function onDragStart(event) {
        const target = event.target;
        if (!(target instanceof Element) || nav === null) return;

        const menuRow = target.closest('[data-vt-menu-row]');
        let id = null;
        let from = null;
        let node = null;

        if (menuRow !== null) {
          id = menuRow.getAttribute('data-vt-menu-row');
          from = 'menu';
          node = menuRow;
        } else {
          const button = target.closest(ROW_SELECTOR);
          // 只接管本列表内的行：会话行、工作区行和「更多」自己都不碰。
          if (button === null || button.parentElement !== nav) return;
          if (button.getAttribute('aria-haspopup') === 'menu') return;
          id = panelIdentity(button);
          from = 'nav';
          node = button;
        }

        if (id === null || id === '') return;

        drag = { id, from, node, mode: null, marker: null };
        if (node !== null) node.classList.add('vt-sort-source');
        nav.setAttribute('data-vt-sort-dragging', '');
        try {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData(DRAG_TYPE, id);
        } catch (error) {
          /* drag data unavailable: the gesture still works inside this window */
        }
      }

      function finish() {
        if (drag !== null && drag.node !== null) drag.node.classList.remove('vt-sort-source');
        clearMarkers();
        setMoreOver(moreButton(), false);
        if (nav !== null) nav.removeAttribute('data-vt-sort-dragging');
        drag = null;
        schedule();
      }

      /** Confirm a file-into-More drop on the target itself. */
      function pulseMore() {
        const more = moreButton();
        if (more === null) return;
        more.classList.remove('vt-sort-more-accept');
        void more.offsetWidth;
        more.classList.add('vt-sort-more-accept');
        window.clearTimeout(acceptTimer);
        acceptTimer = window.setTimeout(() => {
          more.classList.remove('vt-sort-more-accept');
        }, 520);
      }

      function fileIntoMore(active) {
        const ids = allIds();
        if (!state.hidden.includes(active.id)) state.hidden = state.hidden.concat(active.id);
        state.order = state.order.filter((id) => ids.includes(id));
        for (const id of ids) if (!state.order.includes(id)) state.order.push(id);
        emit();
        pulseMore();
      }

      function placeAt(active, marker) {
        const more = moreButton();
        const anchorId = marker.row === more ? null : panelIdentity(marker.row);
        const ids = allIds();
        const without = ids.filter((id) => id !== active.id);
        let index = anchorId === null ? without.length : without.indexOf(anchorId);
        if (index === -1) index = without.length;
        if (anchorId !== null && marker.side === 'after') index += 1;
        without.splice(index, 0, active.id);

        state.order = without;
        if (active.from === 'menu') state.hidden = state.hidden.filter((id) => id !== active.id);
        emit();
        if (active.from === 'menu') menu.dismiss?.();
      }

      function onDragOver(event) {
        if (drag === null) return;
        // 必须 preventDefault，浏览器才允许 drop；同时锁定为移动手势。
        event.preventDefault();
        try {
          event.dataTransfer.dropEffect = 'move';
        } catch (error) {
          /* older engines: the default effect is fine */
        }
        track(event.clientX, event.clientY);
      }

      function onDrop(event) {
        if (drag === null) return;
        event.preventDefault();
        event.stopPropagation();
        const active = drag;
        if (active.mode === 'more') fileIntoMore(active);
        else if (active.mode === 'list' && active.marker !== null) placeAt(active, active.marker);
        finish();
      }

      function onDragEnd() {
        if (drag === null) return;
        finish();
      }

      function install() {
        readState();
        disposeStyle = mountStyle();
        document.addEventListener('dragstart', onDragStart, true);
        document.addEventListener('dragover', onDragOver, true);
        document.addEventListener('drop', onDrop, true);
        document.addEventListener('dragend', onDragEnd, true);
        // 侧边栏每次模板变化（插件启停、语言切换、面板切换）都会重建行，
        // 所以观察整棵 body：命中成本由 rAF 合并，一次只跑一趟。
        document.documentElement.dataset.vtSidebarSort = VERSION;
        observer = new MutationObserver(schedule);
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        schedule();
      }

      function dispose() {
        document.removeEventListener('dragstart', onDragStart, true);
        document.removeEventListener('dragover', onDragOver, true);
        document.removeEventListener('drop', onDrop, true);
        document.removeEventListener('dragend', onDragEnd, true);
        if (observer !== null) observer.disconnect();
        observer = null;
        if (frame !== 0) {
          window.cancelAnimationFrame(frame);
          frame = 0;
        }
        window.clearTimeout(acceptTimer);
        finish();
        menu.dismiss = null;
        if (disposeStyle !== null) disposeStyle();
        disposeStyle = null;

        // 卸载即还原：取消隐藏、摘掉本插件加的类与缓存。
        for (const node of document.querySelectorAll(
          '[data-vt-row-id], .vt-sort-source, .vt-sort-more-over, .vt-sort-more-accept, .vt-sort-before, .vt-sort-after, .vt-sort-filed',
        )) {
          node.removeAttribute('data-vt-row-id');
          node.removeAttribute('draggable');
          node.classList.remove(
            'vt-sort-source',
            'vt-sort-more-over',
            'vt-sort-more-accept',
            'vt-sort-before',
            'vt-sort-after',
            'vt-sort-filed',
          );
        }
        nav = null;
        delete document.documentElement.dataset.vtSidebarSort;
      }

      return { install, dispose, schedule, menu };
    }

    //#endregion
    //#region More menu

    /** The filed ids, as a fresh array for the open menu. */
    function readFiled() {
      return state.hidden.slice();
    }

    /** Repaint the open menu when a drop files or restores a row. */
    function useFiled() {
      const [filed, setFiled] = React.useState(readFiled);
      React.useEffect(() => {
        const listener = () => setFiled(readFiled());
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }, []);
      return filed;
    }

    /**
     * The filed panels as ordinary More menu rows: click opens one, and dragging
     * the row back onto the list restores it. Nothing is wrapped around them —
     * the menu keeps its own surface, placement and dismissal.
     */
    function MoreSection(props) {
      const filed = useFiled();
      const dismiss = props.onDismiss;
      /** 每个菜单行的图标槽，挂载后把对应面板的字形搬进来。 */
      const rowNodes = React.useRef(new Map());

      React.useEffect(() => {
        let frame = 0;
        let tries = 0;
        const paint = () => {
          frame = 0;
          let missing = false;
          for (const [id, node] of rowNodes.current) {
            const glyph = panelGlyph(id);
            if (glyph === null) {
              missing = true;
              continue;
            }
            node.replaceChildren(glyph);
          }
          // 行还没渲染完（例如面板刚出现）时下一帧再试，不做无上限轮询。
          if (missing && tries < 6) {
            tries += 1;
            frame = window.requestAnimationFrame(paint);
          }
        };
        paint();
        return () => {
          if (frame !== 0) window.cancelAnimationFrame(frame);
        };
      });

      // 引擎在拖回侧边栏后要关掉这个菜单；菜单自己拥有 dismiss，所以在这里交出去。
      React.useEffect(() => {
        const engine = engineRef;
        if (engine === null) return undefined;
        engine.menu.dismiss = typeof dismiss === 'function' ? dismiss : null;
        return () => {
          if (engine.menu.dismiss === dismiss) engine.menu.dismiss = null;
        };
      }, [dismiss]);

      // The owner hands every panel's label over; use it before the DOM pass has run.
      if (Array.isArray(props.entries)) {
        for (const entry of props.entries) {
          if (entry !== null && typeof entry === 'object' && typeof entry.id === 'string' && typeof entry.label === 'string') {
            labels.set(entry.id, entry.label);
          }
        }
      }

      const rows = filed.filter((id) => labels.has(id));
      if (rows.length === 0) return null;

      const children = [];
      for (const id of rows) {
        children.push(
          React.createElement(
            'button',
            {
              key: id,
              type: 'button',
              role: 'menuitem',
              className: 'vt-sort-menu-row',
              draggable: true,
              'data-vt-menu-row': id,
              onClick: () => {
                props.onDismiss?.();
                props.onOpen?.(id);
              },
            },
            React.createElement('span', {
              className: 'vt-sort-menu-icon',
              'aria-hidden': 'true',
              ref: (node) => {
                if (node === null) rowNodes.current.delete(id);
                else rowNodes.current.set(id, node);
              },
            }),
            React.createElement('span', { className: 'vt-sort-menu-label' }, labels.get(id)),
          ),
        );
      }

      return React.createElement(React.Fragment, null, ...children);
    }

    //#endregion
    //#region plugin

    /** Client services this plugin reads; the loader waits for the slot registry. */
    const inject = ['slots'];

    /**
     * Register the drag engine and the More-menu section.
     * @param ctx - client plugin context.
     */
    function apply(ctx) {
      try {
        ctx.effect(() => {
          const engine = createEngine();
          engineRef = engine;
          engine.menu.dismiss = null;
          engine.install();
          return () => {
            engine.dispose();
            if (engineRef === engine) engineRef = null;
          };
        }, 'vt-sidebar-sort: drag engine');

        // 只在真的有收起项时占用「更多」菜单：否则会让这个菜单凭空出现、而且是空的。
        // 占用项一旦存在，侧边栏就会显示「更多」按钮（hasEntryActions），所以收起/放回都要重新同步。
        ctx.effect(() => {
          let disposeSection = null;
          const sync = () => {
            const needed = state.hidden.length > 0;
            if (needed && disposeSection === null) {
              // order -1：收起项排在 entry-customization 的「浏览插件 / 创建插件」之前。
              disposeSection = ctx.slots.inject('sidebar.panellist.actions', () =>
                ctx.slots.register(
                  {
                    name: 'sidebar.panellist.actions',
                    id: 'vt-sidebar-sort',
                    order: -1,
                  },
                  MoreSection,
                ),
              );
            } else if (!needed && disposeSection !== null) {
              disposeSection();
              disposeSection = null;
            }
          };
          listeners.add(sync);
          sync();
          return () => {
            listeners.delete(sync);
            if (disposeSection !== null) disposeSection();
          };
        }, 'vt-sidebar-sort: More menu section');
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
