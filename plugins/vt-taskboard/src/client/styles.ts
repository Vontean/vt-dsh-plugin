/**
 * 看板样式：一张全局样式表，类名统一 dsh-atb- 前缀。
 *
 * 视觉体系见 DESIGN.md「柔和纸张」：暖白纸面、白色卡片、发丝级描边、
 * 克制的状态色，靠层级与留白表达重点，而不是靠边框和阴影堆叠。
 * 所有颜色、圆角、阴影、字号都走 --vtb-* 令牌，深浅色只覆盖令牌值。
 *
 * @module dsh-vt-taskboard/client/styles
 */

/** 样式表文本。 */
export const STYLES = `
/* ── 令牌层 ─────────────────────────────────────────────────────────────
   作用域挂在面板根、弹窗遮罩、灯箱与传送门里的斜杠浮层上：前者覆盖看板与
   内联弹窗，后两者渲染在 body 下，需要各自持有一份令牌。 */
.dsh-atb-panel-root,
.dsh-atb-modal-backdrop,
.dsh-atb-alert-backdrop,
.dsh-atb-lightbox-backdrop,
.dsh-atb-slash-popup {
  --vtb-font: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI",
    "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
  --vtb-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

  /* 表面 / 文字 / 描边 / 强调色一律映射宿主令牌：看板是从 DSH 侧边栏进入的功能，
     必须跟随 DSH 的主题设置，而不是自带一套皮肤。 */
  --vtb-bg: transparent;
  --vtb-surface: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base, #ffffff));
  --vtb-surface-2: color-mix(in srgb, var(--vtb-ink) 4%, transparent);
  --vtb-column: color-mix(in srgb, var(--vtb-ink) 3%, var(--dsw-alias-bg-base, #ffffff));
  --vtb-overlay: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-3, #ffffff));
  --vtb-ink: var(--dsw-alias-label-primary, #1f2328);
  --vtb-ink-2: var(--dsw-alias-label-secondary, #5f5e59);
  --vtb-ink-3: var(--dsw-alias-label-tertiary, #9a9995);
  --vtb-line: var(--dsw-alias-border-l1, rgba(55, 53, 47, 0.10));
  --vtb-line-strong: var(--dsw-alias-border-l2, rgba(55, 53, 47, 0.20));
  --vtb-hover: var(--dsw-alias-interactive-bg-hover, rgba(55, 53, 47, 0.06));
  --vtb-active: var(--dsw-alias-interactive-bg-active, rgba(55, 53, 47, 0.10));
  --vtb-accent: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary, #2383e2));
  --vtb-accent-ink: var(--vtb-accent);
  --vtb-accent-soft: color-mix(in srgb, var(--vtb-accent) 12%, transparent);
  --vtb-primary-fill: var(--dsw-alias-button-primary-fill, var(--dsw-alias-label-primary, #1f2328));
  --vtb-primary-ink: var(--dsw-alias-label-primary-foreground, #ffffff);

  /* 语义色（紧急度 / 状态）属于协议，自持实色；软底与宿主底色混合，
     深浅主题只改这五个实色，不再维护第二套表面色。 */
  --vtb-red: #d44c47;
  --vtb-orange: #d9730d;
  --vtb-green: #0f7b6c;
  --vtb-purple: #8e4ec6;
  --vtb-yellow: #cb912f;
  --vtb-red-soft: color-mix(in srgb, var(--vtb-red) 12%, transparent);
  --vtb-orange-soft: color-mix(in srgb, var(--vtb-orange) 12%, transparent);
  --vtb-green-soft: color-mix(in srgb, var(--vtb-green) 12%, transparent);
  --vtb-purple-soft: color-mix(in srgb, var(--vtb-purple) 12%, transparent);
  --vtb-yellow-soft: color-mix(in srgb, var(--vtb-yellow) 14%, transparent);

  --vtb-radius-sm: 6px;
  --vtb-radius: 8px;
  --vtb-radius-lg: 12px;
  --vtb-radius-xl: 14px;
  --vtb-shadow-1: 0 1px 2px rgba(0, 0, 0, 0.04);
  --vtb-shadow-2: 0 3px 10px rgba(0, 0, 0, 0.07), 0 1px 2px rgba(0, 0, 0, 0.05);
  --vtb-shadow-3: var(--dsw-shadow-lv3, 0 18px 50px rgba(0, 0, 0, 0.18));
  --vtb-ring: 0 0 0 3px color-mix(in srgb, var(--vtb-accent) 28%, transparent);
  --vtb-ease: cubic-bezier(0.2, 0.7, 0.3, 1);
  --vtb-dur: 120ms;
}

/* 深色只覆盖语义实色与阴影深度；表面、文字、描边交给宿主的深色令牌。 */
body[data-ds-dark-theme] .dsh-atb-panel-root,
body[data-ds-dark-theme] .dsh-atb-modal-backdrop,
body[data-ds-dark-theme] .dsh-atb-alert-backdrop,
body[data-ds-dark-theme] .dsh-atb-lightbox-backdrop,
body[data-ds-dark-theme] .dsh-atb-slash-popup {
  --vtb-red: #e0736e;
  --vtb-orange: #e08a3c;
  --vtb-green: #4dab9a;
  --vtb-purple: #9a78cf;
  --vtb-yellow: #d9a94a;
  --vtb-shadow-1: 0 1px 2px rgba(0, 0, 0, 0.30);
  --vtb-shadow-2: 0 3px 10px rgba(0, 0, 0, 0.36);
}

@media (prefers-color-scheme: dark) {
  body:not([data-ds-light-theme]) .dsh-atb-panel-root,
  body:not([data-ds-light-theme]) .dsh-atb-modal-backdrop,
  body:not([data-ds-light-theme]) .dsh-atb-alert-backdrop,
  body:not([data-ds-light-theme]) .dsh-atb-slash-popup {
    --vtb-red: #e0736e;
    --vtb-orange: #e08a3c;
    --vtb-green: #4dab9a;
    --vtb-purple: #9a78cf;
    --vtb-yellow: #d9a94a;
    --vtb-shadow-1: 0 1px 2px rgba(0, 0, 0, 0.30);
    --vtb-shadow-2: 0 3px 10px rgba(0, 0, 0, 0.36);
    color-scheme: dark;
  }
}

/* ── 面板与侧栏图标 ─────────────────────────────────────────────────── */
.dsh-atb-panel-root {
  display: flex; flex-direction: column; height: 100%; overflow: hidden;
  background: var(--vtb-bg); color: var(--vtb-ink);
  font-family: var(--vtb-font); color-scheme: light;
}
body[data-ds-dark-theme] .dsh-atb-panel-root { color-scheme: dark; }

.dsh-atb-pglyph { display: inline-flex; align-items: center; }
.dsh-atb-picon { position: relative; display: inline-flex; }
button[class*="panelRow"]:has(.dsh-atb-pglyph) { position: relative; }
.dsh-atb-pstats {
  position: absolute; right: 9px; top: 50%; transform: translateY(-50%);
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; line-height: 1; color: var(--vtb-ink-3);
  font-variant-numeric: tabular-nums; white-space: nowrap; cursor: help;
}
.dsh-atb-psep { opacity: .45; }
.dsh-atb-pstats [data-stat="todo"] { color: var(--vtb-accent); }
.dsh-atb-pstats [data-stat="in_progress"] { color: var(--vtb-orange); }
.dsh-atb-pstats [data-stat="in_review"] { color: var(--vtb-purple); }
.dsh-atb-pbadge {
  position: absolute; top: -5px; right: -8px;
  min-width: 13px; height: 13px; padding: 0 3px;
  border-radius: 7px; background: var(--vtb-accent); color: #fff;
  font-size: 9px; line-height: 13px; text-align: center;
  font-variant-numeric: tabular-nums; pointer-events: none;
}

/* ── 看板外壳 ───────────────────────────────────────────────────────── */
.dsh-atb-board {
  display: flex; flex-direction: column; height: 100%; min-height: 0;
  padding: 14px 14px 16px; gap: 10px; box-sizing: border-box;
}
.dsh-atb-panel-root[data-dsh-atb-windows] > .dsh-atb-board {
  padding-top: max(14px, calc(env(titlebar-area-y, 0px) + env(titlebar-area-height, 36px) + 8px - var(--dsh-atb-viewport-top, 0px)));
}
.dsh-atb-toolbar { display: flex; flex-direction: column; gap: 8px; }
.dsh-atb-toolbar-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; row-gap: 8px; min-width: 0; }
body[data-dsh-sidebar-collapsed] .dsh-atb-panel-root .dsh-atb-toolbar { padding-right: 62px; }
.dsh-atb-title { font-size: 15px; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
.dsh-atb-count {
  font-size: 12px; color: var(--vtb-ink-3); font-variant-numeric: tabular-nums;
  padding: 0 2px; white-space: nowrap;
}
.dsh-atb-spacer { flex: 1 1 auto; }

/* ── 原生控件：按钮、输入、下拉、筛选片 ─────────────────────────────── */
.dsh-atb-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  font: inherit; font-family: var(--vtb-font); font-size: 12.5px; font-weight: 500;
  height: 28px; padding: 0 10px; border-radius: var(--vtb-radius-sm); cursor: pointer;
  border: 1px solid transparent; background: transparent; color: var(--vtb-ink-2);
  white-space: nowrap;
  transition: background var(--vtb-dur) var(--vtb-ease), color var(--vtb-dur) var(--vtb-ease),
    border-color var(--vtb-dur) var(--vtb-ease), box-shadow var(--vtb-dur) var(--vtb-ease);
}
.dsh-atb-btn:hover:not(:disabled) { background: var(--vtb-hover); color: var(--vtb-ink); }
.dsh-atb-btn:active:not(:disabled) { background: var(--vtb-active); }
.dsh-atb-btn:disabled { opacity: .45; cursor: default; }
.dsh-atb-btn[data-primary="true"] {
  background: var(--vtb-ink); border-color: transparent; color: var(--vtb-surface);
  box-shadow: var(--vtb-shadow-1);
}
.dsh-atb-btn[data-primary="true"]:hover:not(:disabled) { background: var(--vtb-ink); filter: brightness(1.12); }
.dsh-atb-btn[data-danger="true"] { color: var(--vtb-red); }
.dsh-atb-btn[data-danger="true"]:hover:not(:disabled) { background: var(--vtb-red-soft); color: var(--vtb-red); }
.dsh-atb-btn[data-armed="true"] { background: var(--vtb-red); color: #fff; }
body[data-ds-dark-theme] .dsh-atb-btn[data-primary="true"] { background: var(--vtb-ink); color: #1c1c1b; }
.dsh-atb-btn svg { flex: none; }

.dsh-atb-select, .dsh-atb-input {
  font: inherit; font-family: var(--vtb-font); font-size: 12.5px;
  min-height: 28px; padding: 0 8px; border-radius: var(--vtb-radius-sm);
  border: 1px solid var(--vtb-line); background: var(--vtb-surface); color: var(--vtb-ink);
  box-sizing: border-box;
  transition: border-color var(--vtb-dur) var(--vtb-ease), box-shadow var(--vtb-dur) var(--vtb-ease);
}
/* 工具栏里的下拉固定高度，弹窗里的跟着内边距走 */
.dsh-atb-toolbar .dsh-atb-select, .dsh-atb-toolbar .dsh-atb-input { height: 28px; }
.dsh-atb-search { height: 28px; }
.dsh-atb-select:hover, .dsh-atb-input:hover { border-color: var(--vtb-line-strong); }
.dsh-atb-select:focus-visible, .dsh-atb-input:focus-visible {
  outline: none; border-color: var(--vtb-accent); box-shadow: var(--vtb-ring);
}
.dsh-atb-select option {
  background: var(--vtb-surface); color: var(--vtb-ink);
}
/* 搜索框：图标前缀 + 与下拉同高 */
.dsh-atb-searchbox { position: relative; display: inline-flex; align-items: center; }
.dsh-atb-searchbox > svg {
  position: absolute; left: 8px; color: var(--vtb-ink-3); pointer-events: none;
}
.dsh-atb-search { width: 168px; padding-left: 27px; }
.dsh-atb-search::placeholder { color: var(--vtb-ink-3); }
.dsh-atb-toolbar-divider { width: 1px; height: 18px; background: var(--vtb-line); flex: none; margin: 0 2px; }
@media (max-width: 1180px) {
  .dsh-atb-search { width: 136px; }
}
/* 任务表单里的原生下拉：与其它控件同一档高度与描边 */
.dsh-atb-urgency-select, .dsh-atb-permission-select {
  width: 100%; box-sizing: border-box;
}

.dsh-atb-chip {
  display: inline-flex; align-items: center; gap: 5px;
  font: inherit; font-family: var(--vtb-font); font-size: 12px; font-weight: 500;
  height: 26px; padding: 0 9px; border-radius: 999px; corner-shape: round; cursor: pointer;
  border: 1px solid var(--vtb-line); background: var(--vtb-surface); color: var(--vtb-ink-2);
  white-space: nowrap;
  transition: background var(--vtb-dur) var(--vtb-ease), border-color var(--vtb-dur) var(--vtb-ease),
    color var(--vtb-dur) var(--vtb-ease);
}
.dsh-atb-chip:hover { border-color: var(--vtb-line-strong); color: var(--vtb-ink); }
.dsh-atb-chip[data-on="true"] { font-weight: 600; }
.dsh-atb-chip[data-urgency="urgent"][data-on="true"] { background: var(--vtb-red-soft); border-color: color-mix(in srgb, var(--vtb-red) 35%, transparent); color: var(--vtb-red); }
.dsh-atb-chip[data-urgency="normal"][data-on="true"] { background: var(--vtb-hover); border-color: var(--vtb-line-strong); color: var(--vtb-ink); }
.dsh-atb-chip[data-urgency="relaxed"][data-on="true"] { background: transparent; border-color: var(--vtb-line-strong); color: var(--vtb-ink-2); }
.dsh-atb-chip[data-kind="needs-human-filter"][data-on="true"] { background: var(--vtb-yellow-soft); border-color: transparent; color: var(--vtb-yellow); }
.dsh-atb-chip:focus-visible, .dsh-atb-btn:focus-visible, .dsh-atb-colfoldbtn:focus-visible,
.dsh-atb-quickbtn:focus-visible, .dsh-atb-movebtn:focus-visible, .dsh-atb-cron-preset:focus-visible,
.dsh-atb-mode-opt:focus-visible, .dsh-atb-perm-opt:focus-visible, .dsh-atb-newmenu-opt:focus-visible,
.dsh-atb-slash-item:focus-visible, .dsh-atb-chip2:focus-visible, .dsh-atb-queuechip:focus-visible {
  outline: 2px solid var(--vtb-accent); outline-offset: 2px;
}

.dsh-atb-dot { width: 7px; height: 7px; border-radius: 50%; corner-shape: round; display: inline-block; flex: none; }
.dsh-atb-dot[data-urgency="urgent"] { background: var(--vtb-red); }
.dsh-atb-dot[data-urgency="normal"] { background: var(--vtb-ink-3); }
.dsh-atb-dot[data-urgency="relaxed"] { background: transparent; box-shadow: inset 0 0 0 1.5px var(--vtb-ink-3); }
.dsh-atb-dot[data-status="backlog"] { background: var(--vtb-ink-3); }
.dsh-atb-dot[data-status="todo"] { background: var(--vtb-accent); }
.dsh-atb-dot[data-status="in_progress"] { background: var(--vtb-orange); }
.dsh-atb-dot[data-status="in_review"] { background: var(--vtb-purple); }
.dsh-atb-dot[data-status="done"] { background: var(--vtb-green); }
.dsh-atb-dot[data-status="canceled"], .dsh-atb-dot[data-status="archived"] { background: var(--vtb-ink-3); }
.dsh-atb-dot[data-status="trashed"] { background: var(--vtb-red); }

/* ── 下拉菜单（新建 / 导出 / 更多）──────────────────────────────────── */
.dsh-atb-newmenu, .dsh-atb-dropdown { position: relative; display: inline-flex; }
.dsh-atb-newmenu-backdrop { position: fixed; inset: 0; z-index: 40; }
.dsh-atb-newmenu-list {
  position: absolute; top: calc(100% + 6px); left: 0; z-index: 41; min-width: 190px;
  display: flex; flex-direction: column; padding: 5px; border-radius: var(--vtb-radius-lg);
  background: var(--vtb-surface); color: var(--vtb-ink);
  border: 1px solid var(--vtb-line); box-shadow: var(--vtb-shadow-2);
  animation: dsh-atb-pop var(--vtb-dur) var(--vtb-ease);
}
.dsh-atb-newmenu[data-align="end"] .dsh-atb-newmenu-list { left: auto; right: 0; }
.dsh-atb-newmenu-opt {
  display: flex; align-items: center; gap: 8px;
  border: none; background: none; text-align: left; cursor: pointer;
  padding: 6px 8px; font: inherit; font-family: var(--vtb-font); font-size: 12.5px; font-weight: 450;
  color: var(--vtb-ink); border-radius: var(--vtb-radius-sm); white-space: nowrap;
  transition: background var(--vtb-dur) var(--vtb-ease);
}
.dsh-atb-newmenu-opt:hover { background: var(--vtb-hover); }
.dsh-atb-newmenu-opt svg { flex: none; color: var(--vtb-ink-3); }
.dsh-atb-newmenu-sep { height: 1px; margin: 4px 6px; background: var(--vtb-line); }
.dsh-atb-newmenu-catgroup { display: flex; flex-direction: column; }
.dsh-atb-newmenu-cat {
  padding: 7px 8px 3px; font-size: 10.5px; font-weight: 600; letter-spacing: .04em;
  color: var(--vtb-ink-3); white-space: nowrap;
}
.dsh-atb-btn-menu {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; padding: 0; border-radius: var(--vtb-radius-sm);
  border: 1px solid transparent; background: transparent; color: var(--vtb-ink-2); cursor: pointer;
  transition: background var(--vtb-dur) var(--vtb-ease), color var(--vtb-dur) var(--vtb-ease);
}
.dsh-atb-btn-menu:hover { background: var(--vtb-hover); color: var(--vtb-ink); }

/* ── 列 ─────────────────────────────────────────────────────────────── */
/* 列是有底色的分栏卡片，但底色只比页面深一点点；卡片仍是唯一的白表面。 */
.dsh-atb-columns { display: flex; gap: 10px; flex: 1; min-height: 0; overflow-x: auto; padding-bottom: 2px; }
.dsh-atb-column {
  display: flex; flex-direction: column; flex: 1 1 0; min-width: 182px; min-height: 0; box-sizing: border-box;
  background: var(--vtb-column); border-radius: var(--vtb-radius-lg);
  padding: 8px 8px 10px; gap: 8px;
  transition: flex-basis .15s ease, min-width .15s ease, max-width .15s ease;
}
.dsh-atb-column[data-collapsed="true"] {
  flex: 0 0 44px; min-width: 44px; max-width: 44px; padding: 8px 4px;
  cursor: pointer; align-items: center; user-select: none;
}
.dsh-atb-column[data-collapsed="true"]:hover { background: color-mix(in srgb, var(--vtb-ink) 6%, var(--dsw-alias-bg-base, #ffffff)); }
.dsh-atb-column[data-dragover] {
  outline: 2px dashed var(--vtb-accent); outline-offset: -4px;
}
.dsh-atb-colhead {
  display: flex; align-items: center; gap: 7px;
  font-size: 12.5px; font-weight: 600; letter-spacing: .01em; color: var(--vtb-ink-2);
  padding: 2px 6px;
}
.dsh-atb-colcount {
  font-size: 11.5px; font-weight: 500; color: var(--vtb-ink-3);
  font-variant-numeric: tabular-nums;
}
.dsh-atb-colfoldbtn {
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; border: none; cursor: pointer;
  color: var(--vtb-ink-3); padding: 2px; border-radius: var(--vtb-radius-sm);
  margin-left: auto; line-height: 1;
  transition: background var(--vtb-dur) var(--vtb-ease), color var(--vtb-dur) var(--vtb-ease);
}
.dsh-atb-colfoldbtn:hover { color: var(--vtb-ink); background: var(--vtb-hover); }
.dsh-atb-colhead .dsh-atb-btn { margin-left: auto; height: 24px; padding: 0 8px; font-size: 11.5px; }
.dsh-atb-colhead .dsh-atb-btn + .dsh-atb-btn { margin-left: 0; }
.dsh-atb-colhead .dsh-atb-selectall { flex: none; margin: 0 2px 0 6px; cursor: pointer; }
.dsh-atb-queuechip {
  margin-left: auto; padding: 1px 7px; border: none; border-radius: 999px; corner-shape: round;
  font: inherit; font-family: var(--vtb-font); font-size: 11px; line-height: 16px; cursor: pointer;
  background: var(--vtb-hover); color: var(--vtb-ink-3); font-variant-numeric: tabular-nums;
}
.dsh-atb-queuechip[data-bad="true"] { background: var(--vtb-orange-soft); color: var(--vtb-orange); }
.dsh-atb-queuechip:hover { color: var(--vtb-ink); }
.dsh-atb-col-collapsed-bar {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  width: 100%; height: 100%; padding-top: 2px;
}
.dsh-atb-col-collapsed-title { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.dsh-atb-col-collapsed-text {
  writing-mode: vertical-rl; letter-spacing: 2px; font-size: 12px; font-weight: 600;
  color: var(--vtb-ink-3);
}

.dsh-atb-cards {
  display: flex; flex-direction: column; gap: 8px; overflow-y: auto; min-height: 0; flex: 1;
  padding: 0 2px 2px;
}
.dsh-atb-ws-group { display: flex; flex-direction: column; gap: 7px; }
.dsh-atb-ws-group + .dsh-atb-ws-group { margin-top: 7px; padding-top: 7px; border-top: 1px solid var(--vtb-line); }
/* 项目分组头吸顶：底色必须不透明，卡片滑过时不透字 */
.dsh-atb-ws-group-head {
  border: none; width: 100%; box-sizing: border-box; font-family: var(--vtb-font);
  text-align: left; cursor: pointer;
  display: flex; align-items: center; gap: 5px; padding: 4px 5px; border-radius: var(--vtb-radius-sm);
  font-size: 11.5px; font-weight: 600; color: var(--vtb-ink-3);
  position: sticky; top: 0; z-index: 2;
  background: var(--vtb-column);
  user-select: none;
}
.dsh-atb-ws-group-head:hover { color: var(--vtb-ink-2); }
.dsh-atb-ws-group-icon { display: inline-flex; align-items: center; justify-content: center; opacity: .75; line-height: 1; }
.dsh-atb-ws-group-head:focus-visible { outline: 2px solid var(--vtb-accent); outline-offset: -2px; }
.dsh-atb-ws-group-chevron { flex-shrink: 0; transition: transform var(--vtb-dur) var(--vtb-ease); }
.dsh-atb-ws-group-head[aria-expanded="true"] .dsh-atb-ws-group-chevron { transform: rotate(90deg); }
.dsh-atb-ws-group-cards[hidden] { display: none; }
.dsh-atb-ws-group-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-atb-ws-group-count {
  font-size: 10px; font-weight: 500; padding: 1px 5px; border-radius: 999px; corner-shape: round;
  background: var(--vtb-hover); color: var(--vtb-ink-3); font-variant-numeric: tabular-nums;
}
.dsh-atb-ws-group-cards { display: flex; flex-direction: column; gap: 8px; }

/* ── 卡片 ───────────────────────────────────────────────────────────── */
.dsh-atb-card {
  position: relative; border-radius: var(--vtb-radius); padding: 9px 11px; cursor: pointer;
  background: var(--vtb-surface); color: var(--vtb-ink);
  border: 1px solid var(--vtb-line);
  font-size: 13px; text-align: left; width: 100%; box-sizing: border-box;
  transition: border-color var(--vtb-dur) var(--vtb-ease), box-shadow var(--vtb-dur) var(--vtb-ease),
    transform var(--vtb-dur) var(--vtb-ease);
}
.dsh-atb-card:hover {
  border-color: var(--vtb-line-strong); box-shadow: var(--vtb-shadow-1); transform: translateY(-1px);
}
.dsh-atb-card:active { transform: translateY(0); }
.dsh-atb-card[draggable="true"] { cursor: grab; }
.dsh-atb-card[data-dragging] { opacity: .45; }
.dsh-atb-card-title { font-weight: 500; line-height: 1.45; word-break: break-word; }
.dsh-atb-card small { display: block; margin-top: 3px; font-size: 11px; color: var(--vtb-ink-3); }
.dsh-atb-card-meta {
  display: flex; align-items: center; gap: 6px; margin-top: 6px;
  font-size: 11px; color: var(--vtb-ink-3); flex-wrap: wrap;
}
.dsh-atb-badge {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 10.5px; font-weight: 500; padding: 1px 6px; border-radius: 5px;
  background: var(--vtb-hover); color: var(--vtb-ink-2);
}
.dsh-atb-badge[data-kind="blocked"] { background: var(--vtb-red-soft); color: var(--vtb-red); }
.dsh-atb-badge[data-kind="scheduled"] { background: var(--vtb-accent-soft); color: var(--vtb-accent-ink); }
.dsh-atb-badge[data-kind="trashed"] { background: var(--vtb-red-soft); color: var(--vtb-red); text-decoration: line-through; }
.dsh-atb-badge[data-kind="done"] { background: var(--vtb-green-soft); color: var(--vtb-green); }
.dsh-atb-badge[data-kind="running"] { background: var(--vtb-orange-soft); color: var(--vtb-orange); }
.dsh-atb-badge[data-kind="succeeded"] { background: var(--vtb-green-soft); color: var(--vtb-green); }
.dsh-atb-badge[data-kind="failed"], .dsh-atb-badge[data-kind="cancelled"] { background: var(--vtb-red-soft); color: var(--vtb-red); }
.dsh-atb-badge[data-kind="stale"] { background: var(--vtb-yellow-soft); color: var(--vtb-yellow); }
.dsh-atb-badge[data-kind="urgent"] { background: var(--vtb-red-soft); color: var(--vtb-red); }
.dsh-atb-badge[data-kind="checklist"] { color: var(--vtb-ink-2); }
.dsh-atb-badge[data-urgency="urgent"] { background: var(--vtb-red-soft); color: var(--vtb-red); }
.dsh-atb-badge[data-urgency="normal"] { background: var(--vtb-hover); color: var(--vtb-ink-2); }
.dsh-atb-badge[data-urgency="relaxed"] { background: var(--vtb-hover); color: var(--vtb-ink-3); }
.dsh-atb-badge[data-kind="session"] {
  background: var(--vtb-purple-soft); color: var(--vtb-purple);
  cursor: pointer; max-width: 160px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  transition: filter var(--vtb-dur) var(--vtb-ease);
}
.dsh-atb-badge[data-kind="session"]:hover { filter: brightness(0.96); }
.dsh-atb-badge[data-kind="needs-human"] {
  white-space: normal; overflow-wrap: anywhere;
  background: var(--vtb-yellow-soft); color: var(--vtb-yellow); font-weight: 600;
}
.dsh-atb-card-session {
  font: inherit; font-family: var(--vtb-font); font-size: 10.5px; line-height: 1;
  padding: 2px 6px; border-radius: 5px; border: 1px solid var(--vtb-line);
  background: var(--vtb-surface); color: var(--vtb-ink-3);
  cursor: pointer; display: inline-flex; align-items: center; gap: 3px;
  transition: border-color var(--vtb-dur) var(--vtb-ease), color var(--vtb-dur) var(--vtb-ease);
}
.dsh-atb-card-session:hover { border-color: var(--vtb-line-strong); color: var(--vtb-ink); }

.dsh-atb-quick { display: flex; gap: 6px; margin-top: 8px; }
.dsh-atb-quickbtn {
  flex: 1; white-space: nowrap; font: inherit; font-family: var(--vtb-font); font-size: 11.5px; font-weight: 500;
  padding: 4px 8px; border-radius: var(--vtb-radius-sm); cursor: pointer;
  /* 动作按钮走描边，软底填充只留给 label：两者一眼能分开。描边用墨色半透明，不用纯黑。 */
  border: 1px solid color-mix(in srgb, var(--vtb-ink) 22%, transparent);
  background: transparent; color: var(--vtb-ink);
  transition: background var(--vtb-dur) var(--vtb-ease), border-color var(--vtb-dur) var(--vtb-ease),
    color var(--vtb-dur) var(--vtb-ease);
}
.dsh-atb-quickbtn:hover {
  border-color: color-mix(in srgb, var(--vtb-ink) 45%, transparent);
  background: var(--vtb-hover); color: var(--vtb-ink);
}
.dsh-atb-quick-reject { display: flex; gap: 6px; margin-top: 8px; align-items: stretch; }
.dsh-atb-quick-note { flex: 1; min-width: 0; font-size: 11.5px; padding: 3px 8px; }

.dsh-atb-selrow { display: flex; align-items: flex-start; gap: 6px; }
.dsh-atb-selrow .dsh-atb-card, .dsh-atb-selrow > div { flex: 1; min-width: 0; }
.dsh-atb-selbox { flex: none; margin: 5px 0 0 0; cursor: pointer; accent-color: var(--vtb-accent); }

.dsh-atb-error {
  font-size: 12px; color: var(--vtb-red); padding: 6px 10px;
  border-radius: var(--vtb-radius); background: var(--vtb-red-soft); border: 1px solid transparent;
}
.dsh-atb-empty { font-size: 12px; color: var(--vtb-ink-3); padding: 12px 6px; }
.dsh-atb-done-foldbar {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; padding: 10px; margin-top: 4px; border-radius: var(--vtb-radius);
  background: transparent; border: 1px dashed var(--vtb-line-strong); text-align: center;
}
.dsh-atb-done-foldtip { font-size: 11px; color: var(--vtb-ink-3); }
.dsh-atb-done-foldbtn { font-size: 11.5px; padding: 2px 10px; }

/* ── 详情面板 ───────────────────────────────────────────────────────── */
.dsh-atb-detailpanel {
  display: flex; flex-direction: column; flex: none;
  max-height: 56%; min-height: 180px; overflow: hidden;
  border: 1px solid var(--vtb-line); border-radius: var(--vtb-radius-xl);
  background: var(--vtb-surface); padding: 12px 14px;
  box-shadow: var(--vtb-shadow-2);
}
.dsh-atb-detailpanel .dsh-atb-detail { flex: 1; min-height: 0; }
.dsh-atb-detail {
  display: flex; flex-direction: column; gap: 13px; overflow-y: auto; min-height: 0; flex: 1;
  padding: 2px; position: relative;
}

.dsh-atb-detail-head { display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap; }
.dsh-atb-detail-titlewrap { flex: 1 1 240px; min-width: 0; display: flex; flex-direction: column; gap: 7px; }
.dsh-atb-detail-titlebar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dsh-atb-detail-titlebar h3 {
  margin: 0; font-size: 15.5px; font-weight: 600; line-height: 1.35;
  letter-spacing: -0.01em; word-break: break-word;
}
.dsh-atb-detail-close {
  flex: none; width: 28px; height: 28px; border-radius: var(--vtb-radius-sm); border: none; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; color: var(--vtb-ink-3); font-size: 13px; line-height: 1;
  transition: background var(--vtb-dur) var(--vtb-ease), color var(--vtb-dur) var(--vtb-ease);
}
.dsh-atb-detail-close:hover { background: var(--vtb-hover); color: var(--vtb-ink); }
.dsh-atb-detail-topbtns { display: flex; align-items: center; gap: 6px; flex: none; max-width: 100%; flex-wrap: wrap; }
.dsh-atb-detail-edit, .dsh-atb-detail-session {
  font: inherit; font-family: var(--vtb-font); font-size: 12px; font-weight: 500;
  height: 28px; padding: 0 10px; border-radius: var(--vtb-radius-sm); cursor: pointer;
  display: inline-flex; align-items: center; gap: 5px;
  border: 1px solid var(--vtb-line); background: var(--vtb-surface); color: var(--vtb-ink-2);
  transition: background var(--vtb-dur) var(--vtb-ease), border-color var(--vtb-dur) var(--vtb-ease),
    color var(--vtb-dur) var(--vtb-ease);
}
.dsh-atb-detail-edit:hover, .dsh-atb-detail-session:hover {
  border-color: var(--vtb-line-strong); color: var(--vtb-ink); background: var(--vtb-surface-2);
}

.dsh-atb-statuspill {
  flex: none; font-size: 11px; font-weight: 600; padding: 2px 9px; border-radius: 999px; corner-shape: round;
  letter-spacing: .01em;
}
.dsh-atb-statuspill[data-status="backlog"] { background: var(--vtb-hover); color: var(--vtb-ink-2); }
.dsh-atb-statuspill[data-status="todo"] { background: var(--vtb-accent-soft); color: var(--vtb-accent-ink); }
.dsh-atb-statuspill[data-status="in_progress"] { background: var(--vtb-orange-soft); color: var(--vtb-orange); }
.dsh-atb-statuspill[data-status="in_review"] { background: var(--vtb-purple-soft); color: var(--vtb-purple); }
.dsh-atb-statuspill[data-status="done"] { background: var(--vtb-green-soft); color: var(--vtb-green); }
.dsh-atb-statuspill[data-status="canceled"],
.dsh-atb-statuspill[data-status="archived"] { background: var(--vtb-hover); color: var(--vtb-ink-3); }

.dsh-atb-detail-chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dsh-atb-chip2 {
  display: inline-flex; align-items: center; gap: 4px; font-size: 11px; line-height: 1;
  padding: 4px 8px; border-radius: var(--vtb-radius-sm);
  background: var(--vtb-surface-2); color: var(--vtb-ink-2);
}
button.dsh-atb-chip2.dsh-atb-chip-btn {
  font: inherit; font-family: var(--vtb-font); border: 1px solid transparent; cursor: pointer;
  transition: background var(--vtb-dur) var(--vtb-ease), color var(--vtb-dur) var(--vtb-ease);
}
button.dsh-atb-chip2.dsh-atb-chip-btn:hover { background: var(--vtb-hover); color: var(--vtb-ink); }
.dsh-atb-chip2-icon { display: inline-flex; align-items: center; opacity: .9; }
.dsh-atb-chip2[data-tone="urgent"] { background: var(--vtb-red-soft); color: var(--vtb-red); }
.dsh-atb-chip2[data-tone="normal"] { background: var(--vtb-hover); color: var(--vtb-ink-2); }
.dsh-atb-chip2[data-tone="relaxed"] { background: var(--vtb-hover); color: var(--vtb-ink-3); }
.dsh-atb-detail-sub { font-size: 11.5px; color: var(--vtb-ink-3); }

.dsh-atb-detail-id {
  margin-left: 8px; padding: 1px 6px; border: 1px solid var(--vtb-line); border-radius: 5px;
  background: transparent; color: var(--vtb-ink-3); font-family: var(--vtb-mono);
  font-size: 11px; line-height: 1.5; cursor: copy;
  transition: border-color var(--vtb-dur) var(--vtb-ease), color var(--vtb-dur) var(--vtb-ease);
}
.dsh-atb-detail-id:hover { border-color: var(--vtb-line-strong); color: var(--vtb-ink); }
.dsh-atb-detail-id[data-state="copied"] { border-color: var(--vtb-green); color: var(--vtb-green); }
.dsh-atb-detail-id[data-state="failed"] { border-color: var(--vtb-red); color: var(--vtb-red); }

.dsh-atb-fieldcard {
  border: 1px solid var(--vtb-line); border-radius: var(--vtb-radius-lg);
  padding: 10px 12px; display: flex; flex-direction: column; gap: 6px;
  background: var(--vtb-surface-2);
}
.dsh-atb-fieldcard-label {
  font-size: 10.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase;
  color: var(--vtb-ink-3);
}
.dsh-atb-fieldcard[data-kind="prompt"] .dsh-atb-fieldcard-label { color: var(--vtb-purple); }
.dsh-atb-promptbox {
  font-family: var(--vtb-mono); font-size: 12px; line-height: 1.55;
  white-space: pre-wrap; word-break: break-word;
  background: var(--vtb-surface); border-radius: var(--vtb-radius);
  padding: 9px 10px; border: 1px solid var(--vtb-line);
}
.dsh-atb-desc { white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.6; }

.dsh-atb-detail-actions { display: flex; flex-direction: column; gap: 8px; }
.dsh-atb-detail-run {
  font: inherit; font-family: var(--vtb-font); font-size: 12.5px; font-weight: 600;
  height: 30px; padding: 0 12px; border-radius: var(--vtb-radius-sm); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border: 1px solid transparent; background: var(--vtb-ink); color: var(--vtb-surface);
  transition: filter var(--vtb-dur) var(--vtb-ease);
}
.dsh-atb-detail-run:hover { filter: brightness(1.12); }
.dsh-atb-detail-run[data-danger="true"] { background: var(--vtb-red); color: #fff; }
body[data-ds-dark-theme] .dsh-atb-detail-run { color: #1c1c1b; }
.dsh-atb-movebtns { display: flex; gap: 6px; flex-wrap: wrap; }
.dsh-atb-movebtn {
  font: inherit; font-family: var(--vtb-font); font-size: 12px; font-weight: 500;
  height: 28px; padding: 0 11px; border-radius: 999px; corner-shape: round; cursor: pointer;
  border: 1px solid var(--vtb-line); background: var(--vtb-surface); color: var(--vtb-ink-2);
  transition: background var(--vtb-dur) var(--vtb-ease), border-color var(--vtb-dur) var(--vtb-ease),
    color var(--vtb-dur) var(--vtb-ease);
}
.dsh-atb-movebtn:hover { border-color: var(--vtb-line-strong); color: var(--vtb-ink); }
.dsh-atb-movebtn[data-to="done"] { color: var(--vtb-green); border-color: transparent; background: var(--vtb-green-soft); }
.dsh-atb-movebtn[data-to="done"]:hover { filter: brightness(0.97); }
.dsh-atb-movebtn[data-to="canceled"],
.dsh-atb-movebtn[data-to="archived"] { color: var(--vtb-ink-3); }
.dsh-atb-movebtn[data-to="blocked"] { color: var(--vtb-red); border-color: transparent; background: var(--vtb-red-soft); }
.dsh-atb-movebtn[data-to="blocked"]:hover { filter: brightness(0.97); }
.dsh-atb-movebtn[data-to="needs-human-active"] {
  border-color: transparent; background: var(--vtb-yellow-soft); color: var(--vtb-yellow); font-weight: 600;
}
.dsh-atb-confirm { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dsh-atb-confirm-label { font-size: 11.5px; color: var(--vtb-ink-3); }

.dsh-atb-section { font-size: 13px; display: flex; flex-direction: column; gap: 8px; }
.dsh-atb-section h4 {
  margin: 0; font-size: 10.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
  color: var(--vtb-ink-3); display: flex; align-items: center; gap: 6px;
}
.dsh-atb-count2 {
  font-size: 10px; font-weight: 600; padding: 0 6px; border-radius: 999px; corner-shape: round; line-height: 16px;
  background: var(--vtb-hover); color: var(--vtb-ink-3); font-variant-numeric: tabular-nums;
}
.dsh-atb-empty2 { font-size: 12px; color: var(--vtb-ink-3); padding: 8px 0; }

/* 评论 */
.dsh-atb-commentlist { display: flex; flex-direction: column; gap: 9px; }
.dsh-atb-bubble { display: flex; gap: 8px; }
.dsh-atb-bubble-avatar {
  flex: none; width: 26px; height: 26px; border-radius: var(--vtb-radius);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; background: var(--vtb-hover); color: var(--vtb-ink-2);
}
.dsh-atb-bubble[data-from="agent"] .dsh-atb-bubble-avatar { background: var(--vtb-purple-soft); color: var(--vtb-purple); }
.dsh-atb-bubble[data-from="system"] .dsh-atb-bubble-avatar { background: var(--vtb-hover); color: var(--vtb-ink-3); }
.dsh-atb-bubble-main {
  flex: 1; min-width: 0; border-radius: var(--vtb-radius-lg); padding: 7px 11px;
  background: var(--vtb-surface-2); border: 1px solid transparent;
}
.dsh-atb-bubble[data-from="agent"] .dsh-atb-bubble-main { background: var(--vtb-purple-soft); }
.dsh-atb-bubble-meta { display: flex; align-items: baseline; gap: 8px; margin-bottom: 3px; }
.dsh-atb-bubble-meta b { font-size: 11.5px; font-weight: 600; color: var(--vtb-ink); }
.dsh-atb-bubble[data-from="agent"] .dsh-atb-bubble-meta b { color: var(--vtb-purple); }
.dsh-atb-comment-agent {
  border: none; background: none; padding: 0; font: inherit; cursor: pointer; text-align: left;
  font-size: 11.5px; font-weight: 600; color: var(--vtb-purple);
}
.dsh-atb-comment-agent:hover { text-decoration: underline; }
.dsh-atb-bubble-meta span { font-size: 10.5px; color: var(--vtb-ink-3); }
.dsh-atb-bubble-body { font-size: 12.5px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }

.dsh-atb-markdown-body { white-space: pre-wrap; word-break: break-word; }
.dsh-atb-detail-img-wrap {
  display: inline-flex; flex-direction: column; gap: 4px; max-width: min(100%, 520px);
  margin: 6px 8px 6px 0; vertical-align: top;
}
.dsh-atb-detail-img {
  display: block; max-width: 100%; max-height: 320px; object-fit: contain;
  border-radius: var(--vtb-radius); cursor: zoom-in;
  border: 1px solid var(--vtb-line); background: var(--vtb-surface-2);
}
.dsh-atb-detail-img-caption { font-size: 10.5px; color: var(--vtb-ink-3); overflow-wrap: anywhere; }
.dsh-atb-lightbox-backdrop {
  position: fixed; inset: 0; z-index: 120; display: grid; place-items: center; padding: 28px;
  background: rgba(12, 12, 11, .78); backdrop-filter: blur(4px);
  animation: dsh-atb-fade .14s ease;
}
.dsh-atb-lightbox-content { position: relative; max-width: 96vw; max-height: 92vh; }
.dsh-atb-lightbox-img { display: block; max-width: 96vw; max-height: 92vh; object-fit: contain; border-radius: var(--vtb-radius-lg); }
.dsh-atb-lightbox-close {
  position: absolute; top: -14px; right: -14px; width: 30px; height: 30px; border-radius: 999px; corner-shape: round; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid rgba(255, 255, 255, .38); background: rgba(20, 20, 20, .9); color: #fff;
}

.dsh-atb-composer { display: flex; gap: 8px; align-items: flex-end; margin-top: 2px; }
.dsh-atb-composer-input {
  flex: 1; font: inherit; font-family: var(--vtb-font); font-size: 12.5px; line-height: 1.55;
  padding: 8px 10px; border-radius: var(--vtb-radius); min-height: 40px;
  border: 1px solid var(--vtb-line); background: var(--vtb-surface); color: var(--vtb-ink);
  resize: vertical; box-sizing: border-box;
  transition: border-color var(--vtb-dur) var(--vtb-ease), box-shadow var(--vtb-dur) var(--vtb-ease);
}
.dsh-atb-composer-input:focus { outline: none; border-color: var(--vtb-accent); box-shadow: var(--vtb-ring); }
.dsh-atb-composer-send {
  flex: none; font: inherit; font-family: var(--vtb-font); font-size: 12.5px; font-weight: 600;
  height: 34px; padding: 0 14px; border-radius: var(--vtb-radius); cursor: pointer;
  border: 1px solid transparent; background: var(--vtb-ink); color: var(--vtb-surface);
}
.dsh-atb-composer-send:hover:not(:disabled) { filter: brightness(1.12); }
.dsh-atb-composer-send:disabled { opacity: .4; cursor: default; }
body[data-ds-dark-theme] .dsh-atb-composer-send { color: #1c1c1b; }
.dsh-atb-composer-deliver {
  background: var(--vtb-surface); color: var(--vtb-accent-ink);
  border-color: var(--vtb-line); white-space: nowrap;
}
.dsh-atb-composer-deliver:hover:not(:disabled) { border-color: var(--vtb-accent); }
.dsh-atb-comment-pending {
  font-size: 11px; padding: 0 6px; border-radius: 999px; corner-shape: round; opacity: .75;
  border: 1px dashed var(--vtb-line-strong); color: var(--vtb-ink-3);
}
.dsh-atb-comment-delivered {
  font: inherit; font-family: var(--vtb-font); font-size: 11px; padding: 0 6px;
  border-radius: 999px;
  corner-shape: round; cursor: pointer; border: 1px solid transparent;
  background: var(--vtb-accent-soft); color: var(--vtb-accent-ink);
}
span.dsh-atb-comment-delivered { cursor: default; }
.dsh-atb-image-actions { display: flex; align-items: center; gap: 8px; padding: 5px 1px 0; }
.dsh-atb-image-add {
  flex: none; font: inherit; font-family: var(--vtb-font); font-size: 11.5px; font-weight: 500;
  line-height: 1.4; padding: 4px 8px; border-radius: var(--vtb-radius-sm); cursor: pointer;
  border: 1px solid var(--vtb-line); background: var(--vtb-surface); color: var(--vtb-ink-2);
}
.dsh-atb-image-add:hover:not(:disabled) { border-color: var(--vtb-line-strong); color: var(--vtb-ink); }
.dsh-atb-image-add:disabled { opacity: .45; cursor: default; }
.dsh-atb-image-hint { font-size: 10.5px; color: var(--vtb-ink-3); }

.dsh-atb-section-toggle {
  border: none; background: none; padding: 0; font: inherit; cursor: pointer; text-align: left;
  display: inline-flex; align-items: baseline; gap: 6px; color: inherit;
}
.dsh-atb-section-toggle:hover { opacity: .8; }
.dsh-atb-toggle-caret { display: inline-block; width: 1em; font-size: 10px; }
.dsh-atb-execlist { display: flex; flex-direction: column; gap: 5px; }
.dsh-atb-exec-row {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px;
  padding: 6px 10px; border-radius: var(--vtb-radius);
  background: var(--vtb-surface-2); border: 1px solid transparent;
}
.dsh-atb-exec-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; corner-shape: round; background: var(--vtb-ink-3); }
.dsh-atb-exec-dot[data-outcome="succeeded"] { background: var(--vtb-green); box-shadow: 0 0 0 3px var(--vtb-green-soft); }
.dsh-atb-exec-dot[data-outcome="failed"] { background: var(--vtb-red); box-shadow: 0 0 0 3px var(--vtb-red-soft); }
.dsh-atb-exec-dot[data-outcome="running"] { background: var(--vtb-orange); box-shadow: 0 0 0 3px var(--vtb-orange-soft); animation: dsh-atb-pulse 1.6s ease-in-out infinite; }
@keyframes dsh-atb-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
.dsh-atb-exec-trigger { font-size: 11px; color: var(--vtb-ink-3); }
.dsh-atb-exec-outcome { font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 5px; }
.dsh-atb-exec-outcome[data-outcome="succeeded"] { background: var(--vtb-green-soft); color: var(--vtb-green); }
.dsh-atb-exec-outcome[data-outcome="failed"] { background: var(--vtb-red-soft); color: var(--vtb-red); }
.dsh-atb-exec-outcome[data-outcome="running"] { background: var(--vtb-orange-soft); color: var(--vtb-orange); }
.dsh-atb-exec-outcome[data-outcome="cancelled"] { background: var(--vtb-hover); color: var(--vtb-ink-3); }
.dsh-atb-exec-time { font-size: 11px; color: var(--vtb-ink-3); font-variant-numeric: tabular-nums; }
.dsh-atb-exec-session {
  font: inherit; font-family: var(--vtb-font); font-size: 11px; color: var(--vtb-ink-3);
  background: none; border: none; padding: 0; cursor: pointer;
}
.dsh-atb-exec-session:hover { color: var(--vtb-accent-ink); text-decoration: underline dotted; }
.dsh-atb-exec-error { flex-basis: 100%; font-size: 11px; color: var(--vtb-red); word-break: break-all; }

.dsh-atb-dangerzone {
  display: flex; align-items: center; gap: 8px; margin-top: auto; padding-top: 10px;
  border-top: 1px solid var(--vtb-line);
}

/* ── 弹窗 ───────────────────────────────────────────────────────────── */
.dsh-atb-modal-backdrop {
  position: fixed; inset: 0; z-index: 80;
  background: rgba(15, 15, 14, .42); backdrop-filter: blur(3px);
  display: flex; align-items: center; justify-content: center;
  animation: dsh-atb-fade .14s ease;
}
@keyframes dsh-atb-fade { from { opacity: 0; } }
.dsh-atb-modal {
  width: min(560px, calc(100vw - 48px)); max-height: calc(100vh - 80px);
  display: flex; flex-direction: column; overflow: hidden; border-radius: var(--vtb-radius-xl);
  background: var(--vtb-surface); color: var(--vtb-ink);
  border: 1px solid var(--vtb-line);
  box-shadow: var(--vtb-shadow-3);
  animation: dsh-atb-pop .16s var(--vtb-ease);
}
.dsh-atb-taskform-modal { width: 1060px; min-width: 1060px; max-height: calc(100vh - 50px); }
@keyframes dsh-atb-pop { from { opacity: 0; transform: translateY(8px) scale(.985); } }
.dsh-atb-modal-head {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px 12px; border-bottom: 1px solid var(--vtb-line);
}
.dsh-atb-modal-headicon {
  flex: none; width: 30px; height: 30px; border-radius: var(--vtb-radius);
  display: flex; align-items: center; justify-content: center;
  background: var(--vtb-surface-2); color: var(--vtb-ink-2);
}
.dsh-atb-modal-headtext { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dsh-atb-modal-headtext h3 { margin: 0; font-size: 15px; font-weight: 600; line-height: 1.3; letter-spacing: -0.01em; }
.dsh-atb-modal-headtext p { margin: 0; font-size: 11.5px; color: var(--vtb-ink-3); }
.dsh-atb-modal-close {
  flex: none; width: 28px; height: 28px; border-radius: var(--vtb-radius-sm); border: none; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; color: var(--vtb-ink-3); font-size: 13px; line-height: 1;
  transition: background var(--vtb-dur) var(--vtb-ease), color var(--vtb-dur) var(--vtb-ease);
}
.dsh-atb-modal-close:hover { background: var(--vtb-hover); color: var(--vtb-ink); }

.dsh-atb-modal-body {
  padding: 14px 16px; overflow-y: auto;
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px 12px;
}
.dsh-atb-taskform-body {
  padding: 16px 18px; display: grid;
  grid-template-columns: 1.05fr 1.15fr; gap: 20px;
}
.dsh-atb-form-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.dsh-atb-form-left { border-right: 1px solid var(--vtb-line); padding-right: 20px; }
.dsh-atb-form-right { display: flex; flex-direction: column; gap: 14px; }
.dsh-atb-form-right .dsh-atb-field { flex: 1; display: flex; flex-direction: column; }
.dsh-atb-form-right .dsh-atb-prompt-wrap { flex: 1; display: flex; flex-direction: column; }
.dsh-atb-form-right .dsh-atb-prompt-inner { flex: 1; display: flex; flex-direction: column; }
.dsh-atb-form-right .dsh-atb-prompt-input { flex: 1; min-height: 130px; resize: vertical; }
.dsh-atb-form-subgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

@media (max-width: 768px) {
  .dsh-atb-taskform-modal { width: calc(100vw - 20px); min-width: 0; }
  .dsh-atb-taskform-body { grid-template-columns: 1fr; gap: 14px; padding: 12px 14px; }
  .dsh-atb-form-left { border-right: none; padding-right: 0; }
  .dsh-atb-form-right .dsh-atb-prompt-input { min-height: 90px; }
}
@media (min-width: 769px) and (max-width: 1099px) {
  .dsh-atb-taskform-modal { width: calc(100vw - 40px); min-width: 0; }
}

/* 表单字段 */
.dsh-atb-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.dsh-atb-field[data-span="full"] { grid-column: 1 / -1; }
.dsh-atb-field-label {
  display: flex; align-items: center; gap: 3px;
  font-size: 11.5px; font-weight: 600; color: var(--vtb-ink-2);
}
.dsh-atb-req { color: var(--vtb-red); font-style: normal; }
.dsh-atb-modal-body input:not([type="checkbox"]):not([type="radio"]),
.dsh-atb-modal-body textarea,
.dsh-atb-modal-body select {
  font: inherit; font-family: var(--vtb-font); font-size: 13px; padding: 7px 10px;
  border-radius: var(--vtb-radius); width: 100%; box-sizing: border-box;
  border: 1px solid var(--vtb-line); background: var(--vtb-surface); color: var(--vtb-ink);
  transition: border-color var(--vtb-dur) var(--vtb-ease), box-shadow var(--vtb-dur) var(--vtb-ease);
}
.dsh-atb-modal-body textarea { min-height: 64px; resize: vertical; line-height: 1.55; }
.dsh-atb-modal-body input:hover, .dsh-atb-modal-body textarea:hover, .dsh-atb-modal-body select:hover {
  border-color: var(--vtb-line-strong);
}
.dsh-atb-modal-body input:focus, .dsh-atb-modal-body textarea:focus, .dsh-atb-modal-body select:focus {
  outline: none; border-color: var(--vtb-accent); box-shadow: var(--vtb-ring);
}
.dsh-atb-modal-body input[type="checkbox"], .dsh-atb-modal-body input[type="radio"] {
  accent-color: var(--vtb-accent);
}
.dsh-atb-modal-body .dsh-atb-input-bad { border-color: var(--vtb-red); }
.dsh-atb-modal-body .dsh-atb-input-bad:focus { box-shadow: 0 0 0 3px var(--vtb-red-soft); }

/* 选项组 */
.dsh-atb-mode-picker { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.dsh-atb-mode-picker[data-exec="true"] { grid-template-columns: repeat(3, 1fr); }
.dsh-atb-mode-picker[data-exec="true"] .dsh-atb-mode-opt { padding: 8px; }
.dsh-atb-mode-picker[data-exec="true"] .dsh-atb-mode-name { font-size: 12px; }
.dsh-atb-mode-picker[data-exec="true"] .dsh-atb-mode-hint { font-size: 10px; }
.dsh-atb-mode-opt {
  display: flex; flex-direction: column; align-items: flex-start; text-align: left; gap: 3px;
  padding: 9px 10px; border-radius: var(--vtb-radius); cursor: pointer;
  border: 1px solid var(--vtb-line); background: var(--vtb-surface); color: var(--vtb-ink);
  transition: border-color var(--vtb-dur) var(--vtb-ease), background var(--vtb-dur) var(--vtb-ease);
}
.dsh-atb-mode-name { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; }
.dsh-atb-mode-hint { font-size: 10.5px; color: var(--vtb-ink-3); line-height: 1.4; }
.dsh-atb-mode-opt:hover { border-color: var(--vtb-line-strong); }
.dsh-atb-mode-opt[data-on="true"] { border-color: var(--vtb-accent); background: var(--vtb-accent-soft); }
.dsh-atb-mode-picker[data-disabled="true"] .dsh-atb-mode-opt { cursor: not-allowed; opacity: .55; }

.dsh-atb-cron-presets { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dsh-atb-cron-preset {
  font: inherit; font-family: var(--vtb-font); font-size: 11px; font-weight: 500;
  height: 24px; padding: 0 9px; border-radius: 999px; corner-shape: round; cursor: pointer;
  border: 1px solid var(--vtb-line); background: var(--vtb-surface); color: var(--vtb-ink-2);
}
.dsh-atb-cron-preset:hover { border-color: var(--vtb-line-strong); color: var(--vtb-ink); }
.dsh-atb-cron-preset[data-on="true"] { border-color: transparent; background: var(--vtb-accent-soft); color: var(--vtb-accent-ink); font-weight: 600; }
.dsh-atb-cron-next { margin-left: auto; font-size: 11px; color: var(--vtb-ink-3); }

.dsh-atb-modal-foot {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; border-top: 1px solid var(--vtb-line);
  background: var(--vtb-surface-2);
}
.dsh-atb-modal-hint { flex: 1; min-width: 0; font-size: 11.5px; color: var(--vtb-ink-3); }
.dsh-atb-modal-hint[data-tone="bad"] { color: var(--vtb-red); }
.dsh-atb-modal-footbtns { display: flex; gap: 8px; }

.dsh-atb-secondary { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.dsh-atb-link { color: var(--vtb-accent-ink); cursor: pointer; text-decoration: none; }
.dsh-atb-link:hover { text-decoration: underline; }

/* 提示弹窗 */
.dsh-atb-alert-backdrop {
  position: fixed; inset: 0; z-index: 90;
  background: rgba(15, 15, 14, .42); backdrop-filter: blur(3px);
  display: flex; align-items: center; justify-content: center;
  animation: dsh-atb-fade .12s ease;
}
.dsh-atb-alert {
  min-width: 280px; max-width: 400px; padding: 22px 24px; border-radius: var(--vtb-radius-xl);
  background: var(--vtb-surface); color: var(--vtb-ink);
  border: 1px solid var(--vtb-line); box-shadow: var(--vtb-shadow-3);
  display: flex; flex-direction: column; align-items: center; gap: 14px;
  animation: dsh-atb-pop .14s var(--vtb-ease);
}
.dsh-atb-alert-icon { display: flex; color: var(--vtb-yellow); }
.dsh-atb-alert-msg {
  font-size: 13.5px; line-height: 1.6; text-align: center;
  word-break: break-word; white-space: pre-wrap; color: var(--vtb-ink);
}
.dsh-atb-alert .dsh-atb-btn { padding: 0 28px; height: 30px; font-size: 13px; }

/* 隔离与 Git 块 */
.dsh-atb-isolation-note { display: block; margin-top: 6px; font-size: 11px; color: var(--vtb-ink-3); }
.dsh-atb-iso-none { font-size: 12.5px; color: var(--vtb-ink-2); }
.dsh-atb-iso-repo[data-multi="true"] { padding: 6px 0 2px; border-top: 1px solid var(--vtb-line); }
.dsh-atb-iso-repo[data-multi="true"]:first-of-type { border-top: none; padding-top: 0; }
.dsh-atb-iso-repohead { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-bottom: 6px; align-items: baseline; }
.dsh-atb-iso-repohead code { font-family: var(--vtb-mono); font-size: 11.5px; font-weight: 600; color: var(--vtb-accent-ink); }
.dsh-atb-iso-facts { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-bottom: 8px; }
.dsh-atb-iso-fact { font-size: 11.5px; color: var(--vtb-ink-2); }
.dsh-atb-iso-fact b { font-weight: 600; color: var(--vtb-accent-ink); }
.dsh-atb-iso-commits { display: flex; flex-direction: column; gap: 3px; margin-bottom: 8px; }
.dsh-atb-iso-commit { display: flex; gap: 8px; font-size: 11.5px; align-items: baseline; flex-direction: column; }
.dsh-atb-iso-commit code { font-family: var(--vtb-mono); font-size: 10.5px; color: var(--vtb-accent-ink); flex-shrink: 0; }
.dsh-atb-iso-commit span { word-break: break-all; color: var(--vtb-ink-2); }
.dsh-atb-iso-more { font-size: 11px; color: var(--vtb-ink-3); }
.dsh-atb-iso-nocommit { font-size: 11.5px; color: var(--vtb-ink-3); margin-bottom: 8px; }
.dsh-atb-iso-dirty {
  display: flex; flex-direction: column; gap: 6px;
  font-size: 11.5px; color: var(--vtb-orange);
  background: var(--vtb-orange-soft); border: 1px solid transparent;
  border-radius: var(--vtb-radius); padding: 7px 10px; margin-bottom: 8px;
}
.dsh-atb-iso-dirty-toggle { border: none; background: none; cursor: pointer; padding: 0; text-align: left; color: inherit; font: inherit; font-family: var(--vtb-font); font-size: 11.5px; }
.dsh-atb-iso-dirty-files { display: flex; flex-direction: column; gap: 2px; }
.dsh-atb-iso-dirty-file {
  border: none; background: none; cursor: pointer; text-align: left; padding: 1px 2px;
  font: inherit; font-family: var(--vtb-font); font-size: 11px; color: var(--vtb-ink-2);
  border-radius: 4px; word-break: break-all;
}
.dsh-atb-iso-dirty-file:hover { background: var(--vtb-hover); color: var(--vtb-accent-ink); }
.dsh-atb-iso-dirty-file code { font-family: var(--vtb-mono); font-size: 10px; margin-right: 6px; }
.dsh-atb-iso-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dsh-atb-iso-hint { font-size: 11px; color: var(--vtb-ink-3); }
.dsh-atb-iso-commit-btn {
  display: flex; gap: 8px; font: inherit; font-family: var(--vtb-font); font-size: 11.5px;
  align-items: baseline; text-align: left; border: none; background: none;
  padding: 2px 4px; margin: 0 -4px; border-radius: var(--vtb-radius-sm); cursor: pointer;
  color: inherit; width: fit-content; max-width: 100%;
}
.dsh-atb-iso-commit-btn:hover { background: var(--vtb-hover); }
.dsh-atb-iso-commit-btn code { font-family: var(--vtb-mono); font-size: 10.5px; color: var(--vtb-accent-ink); flex-shrink: 0; }
.dsh-atb-iso-commit-btn span { word-break: break-all; color: var(--vtb-ink-2); }
.dsh-atb-iso-commit[data-open="true"] > .dsh-atb-iso-commit-btn code { font-weight: 700; }

.dsh-atb-diffview { margin-top: 6px; border-radius: var(--vtb-radius); overflow: hidden; border: 1px solid var(--vtb-line); }
.dsh-atb-diffview-head { display: flex; align-items: center; gap: 10px; padding: 6px 10px; background: var(--vtb-surface-2); }
.dsh-atb-diffview-title { font-family: var(--vtb-mono); font-size: 10.5px; color: var(--vtb-accent-ink); word-break: break-all; }
.dsh-atb-diffview-hint { font-size: 10.5px; color: var(--vtb-ink-3); }
.dsh-atb-diffview-error { padding: 8px 10px; font-size: 11.5px; color: var(--vtb-red); }
.dsh-atb-diffview-pre {
  margin: 0; padding: 9px 10px; max-height: 340px; overflow: auto;
  font-family: var(--vtb-mono); font-size: 10.5px; line-height: 1.55;
  white-space: pre; color: var(--vtb-ink-2); background: var(--vtb-surface);
}

/* 诊断 */
.dsh-atb-diag { max-width: 520px; width: min(520px, 92vw); }
.dsh-atb-diag-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
.dsh-atb-diag-item {
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  padding: 10px 6px; border-radius: var(--vtb-radius-lg);
  border: 1px solid var(--vtb-line); background: var(--vtb-surface-2);
}
.dsh-atb-diag-item b { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
.dsh-atb-diag-item span { font-size: 10.5px; color: var(--vtb-ink-3); }
.dsh-atb-diag-item[data-bad="true"] b { color: var(--vtb-red); }
.dsh-atb-diag-sec h4 { margin: 0 0 8px; font-size: 12.5px; font-weight: 600; }
.dsh-atb-diag-orphans { display: flex; flex-direction: column; gap: 6px; }
.dsh-atb-diag-orphan {
  display: flex; align-items: center; gap: 10px; justify-content: space-between;
  padding: 7px 10px; border-radius: var(--vtb-radius);
  border: 1px solid var(--vtb-line);
}
.dsh-atb-diag-orphan-path { font-size: 11.5px; font-family: var(--vtb-mono); word-break: break-all; }
.dsh-atb-dependency-gates { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; }
.dsh-atb-dependency-gates label { display: flex; align-items: flex-start; gap: 6px; min-width: 0; font-size: 12px; }
.dsh-atb-dependency-gates input { flex: none; }
.dsh-atb-dependency-gates span { min-width: 0; overflow-wrap: anywhere; }

/* 验收清单 */
.dsh-atb-cke { display: flex; flex-direction: column; gap: 6px; }
.dsh-atb-cke-row { display: flex; align-items: center; gap: 8px; }
.dsh-atb-cke-box { flex-shrink: 0; width: 15px; height: 15px; cursor: pointer; accent-color: var(--vtb-accent); }
.dsh-atb-cke-text {
  flex: 1; min-width: 0; font: inherit; font-family: var(--vtb-font); font-size: 12.5px;
  padding: 6px 9px; border-radius: var(--vtb-radius-sm);
  border: 1px solid var(--vtb-line); background: var(--vtb-surface); color: var(--vtb-ink);
}
.dsh-atb-cke-del {
  flex-shrink: 0; border: none; background: none; cursor: pointer; padding: 4px;
  color: var(--vtb-ink-3); display: inline-flex; border-radius: var(--vtb-radius-sm);
}
.dsh-atb-cke-del:hover { color: var(--vtb-red); background: var(--vtb-red-soft); }
.dsh-atb-cke-add {
  align-self: flex-start; border: 1px dashed var(--vtb-line-strong);
  background: none; color: var(--vtb-ink-2); cursor: pointer;
  font: inherit; font-family: var(--vtb-font); font-size: 11.5px;
  padding: 5px 12px; border-radius: var(--vtb-radius);
}
.dsh-atb-cke-add:hover { color: var(--vtb-accent-ink); border-color: var(--vtb-accent); }
.dsh-atb-cke-hint { font-size: 10.5px; color: var(--vtb-ink-3); }

.dsh-atb-cl-progress { margin-left: 8px; font-size: 11px; font-weight: 400; color: var(--vtb-ink-3); }
.dsh-atb-cl-progress[data-tone="bad"] { color: var(--vtb-red); font-weight: 600; }
.dsh-atb-cl-items { display: flex; flex-direction: column; gap: 5px; }
.dsh-atb-cl-item {
  display: flex; align-items: baseline; gap: 9px; padding: 7px 10px; border-radius: var(--vtb-radius);
  border: 1px solid var(--vtb-line); background: var(--vtb-surface); cursor: pointer;
}
.dsh-atb-cl-item:hover { border-color: var(--vtb-line-strong); }
.dsh-atb-cl-item input { flex-shrink: 0; transform: translateY(1px); cursor: pointer; accent-color: var(--vtb-accent); }
.dsh-atb-cl-item[data-checked="true"] .dsh-atb-cl-text { text-decoration: line-through; color: var(--vtb-ink-3); }
.dsh-atb-cl-item[data-alert="true"] { border-color: transparent; background: var(--vtb-red-soft); }
.dsh-atb-cl-text { flex: 1; min-width: 0; font-size: 12.5px; word-break: break-word; }
.dsh-atb-cl-meta {
  flex-shrink: 0; font-size: 10.5px; color: var(--vtb-ink-3);
  display: flex; flex-direction: column; gap: 2px; align-items: flex-end;
}
.dsh-atb-cl-note { max-width: 280px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--vtb-ink-2); }

/* 执行报告 */
.dsh-atb-rpt-summary { font-size: 12.5px; line-height: 1.65; white-space: pre-wrap; word-break: break-word; margin-bottom: 8px; }
.dsh-atb-rpt-sec { margin-bottom: 8px; }
.dsh-atb-rpt-label { font-size: 11px; color: var(--vtb-ink-3); margin-bottom: 4px; }
.dsh-atb-rpt-list { margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.6; word-break: break-all; }
.dsh-atb-rpt-risk {
  font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-word;
  color: var(--vtb-orange); background: var(--vtb-orange-soft);
  border: 1px solid transparent; border-radius: var(--vtb-radius); padding: 7px 10px;
}
.dsh-atb-rpt-filelist, .dsh-atb-rpt-checklist {
  list-style: none; padding: 0; margin: 4px 0;
  display: flex; flex-direction: column; gap: 4px;
}
.dsh-atb-rpt-fileitem {
  display: flex; align-items: center; justify-content: space-between;
  padding: 3px 8px; border-radius: var(--vtb-radius-sm);
  background: var(--vtb-surface-2); font-size: 12px; font-family: var(--vtb-mono);
}
.dsh-atb-file-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; user-select: text; min-width: 0; }
.dsh-atb-file-copybtn {
  font: inherit; font-family: var(--vtb-font); font-size: 10.5px;
  padding: 1px 6px; border-radius: 4px; border: 1px solid var(--vtb-line);
  background: transparent; cursor: pointer; color: var(--vtb-ink-3); flex-shrink: 0; margin-left: 8px;
}
.dsh-atb-file-copybtn:hover { background: var(--vtb-hover); color: var(--vtb-ink); }
.dsh-atb-rpt-checkitem { display: flex; align-items: flex-start; gap: 6px; font-size: 12.5px; line-height: 1.45; }
.dsh-atb-check-icon { color: var(--vtb-green); display: inline-flex; }
.dsh-atb-deliv-missing-box {
  padding: 12px; border-radius: var(--vtb-radius);
  background: var(--vtb-yellow-soft); border: 1px dashed transparent;
  color: var(--vtb-ink-2); font-size: 12.5px;
}

/* 交付概览 */
.dsh-atb-card-deliverable {
  margin-top: 7px; padding: 7px 9px; border-radius: var(--vtb-radius-sm);
  background: var(--vtb-surface-2); border: 1px solid transparent;
  font-size: 11.5px; display: flex; flex-direction: column; gap: 4px;
}
.dsh-atb-card-deliv-row {
  display: flex; align-items: center; gap: 5px; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsh-atb-card-deliv-tag { font-weight: 600; color: var(--vtb-ink-3); flex-shrink: 0; display: inline-flex; align-items: center; gap: 4px; }
.dsh-atb-card-deliv-val { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-atb-deliv-warn { color: var(--vtb-red); font-weight: 500; }
.dsh-atb-deliv-muted { color: var(--vtb-ink-3); }
.dsh-atb-card-deliv-summary {
  font-size: 11px; color: var(--vtb-ink-3); line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; margin-top: 2px;
}
.dsh-atb-reviewdesk { border-color: var(--vtb-accent) !important; box-shadow: 0 0 0 1px var(--vtb-accent-soft); }
.dsh-atb-deliv-summary-box { background: var(--vtb-surface-2); padding: 8px 10px; border-radius: var(--vtb-radius-sm); margin-bottom: 8px; }
.dsh-atb-human-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.dsh-atb-fieldcard[data-kind="human-wait"] label { display: grid; gap: 5px; }
.dsh-atb-fieldcard[data-kind="human-wait"] input { width: 100%; box-sizing: border-box; }
.dsh-atb-fieldcard[data-kind="report-history"] summary { cursor: pointer; font-size: 11.5px; color: var(--vtb-ink-3); }
/* 人工等待原因：卡片内独立一行，弱化底色，不与标题争位置 */
.dsh-atb-card-human {
  display: flex; align-items: flex-start; gap: 5px; margin-top: 6px;
  padding: 4px 7px; border-radius: var(--vtb-radius-sm);
  background: var(--vtb-yellow-soft); color: var(--vtb-yellow);
  font-size: 11px; line-height: 1.4;
}
.dsh-atb-card-human span {
  min-width: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; word-break: break-word;
}
.dsh-atb-card-human svg { flex: none; margin-top: 1px; }

.dsh-atb-card[data-needs-human="true"] {
  border-color: color-mix(in srgb, var(--vtb-yellow) 45%, transparent);
}

/* ── 设置 ───────────────────────────────────────────────────────────── */
.dsh-atb-set { max-width: 860px; width: min(860px, 96vw); height: min(780px, 90vh); max-height: 90vh; }
.dsh-atb-settings-layout { display: flex; flex: 1; min-height: 0; overflow: hidden; }
.dsh-atb-settings-nav {
  flex: 0 0 142px; padding: 14px 10px; border-right: 1px solid var(--vtb-line);
  display: flex; flex-direction: column; gap: 2px; background: var(--vtb-surface-2);
}
.dsh-atb-settings-nav button {
  border: 0; border-radius: var(--vtb-radius-sm); padding: 7px 10px;
  color: var(--vtb-ink-2); background: transparent; font: inherit; font-family: var(--vtb-font);
  font-size: 12.5px; font-weight: 500; text-align: left; cursor: pointer;
  transition: background var(--vtb-dur) var(--vtb-ease), color var(--vtb-dur) var(--vtb-ease);
}
.dsh-atb-settings-nav button:hover { background: var(--vtb-hover); color: var(--vtb-ink); }
.dsh-atb-settings-nav button[aria-selected="true"] { background: var(--vtb-active); color: var(--vtb-ink); font-weight: 600; }
.dsh-atb-settings-nav button:focus-visible { outline: 2px solid var(--vtb-accent); outline-offset: 2px; }
.dsh-atb-settings-content { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.dsh-atb-settings-content > [hidden] { display: none !important; }
.dsh-atb-settings-content > .dsh-atb-modal-body {
  flex: 1; min-height: 0; max-height: none;
  display: flex; flex-direction: column; gap: 16px;
}
.dsh-atb-set .dsh-atb-field-inline {
  display: grid; grid-template-columns: min(128px, 35%) minmax(0, 1fr);
  align-items: center; gap: 12px;
}
.dsh-atb-settings-content > .dsh-atb-modal-body > .dsh-atb-diag-sec {
  padding-bottom: 18px; border-bottom: 1px solid var(--vtb-line);
}
@media (max-width: 600px) {
  .dsh-atb-settings-nav { flex-basis: 96px; padding: 12px 6px; }
  .dsh-atb-settings-nav button { padding: 7px 6px; font-size: 12px; }
  .dsh-atb-settings-content .dsh-atb-modal-foot { flex-wrap: wrap; gap: 8px; }
}
.dsh-atb-set .dsh-atb-mode-picker { margin-top: 8px; }
.dsh-atb-set .dsh-atb-isolation-note { margin-top: 10px; }
.dsh-atb-set .dsh-atb-perm-picker { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 6px; }
.dsh-atb-set .dsh-atb-perm-opt {
  display: flex; flex-direction: column; align-items: flex-start; text-align: left; gap: 3px;
  padding: 9px 10px; border-radius: var(--vtb-radius); cursor: pointer; text-align: left;
  border: 1px solid var(--vtb-line); background: var(--vtb-surface); color: var(--vtb-ink);
  transition: border-color var(--vtb-dur) var(--vtb-ease), background var(--vtb-dur) var(--vtb-ease);
}
.dsh-atb-set .dsh-atb-perm-name { display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; }
.dsh-atb-set .dsh-atb-perm-hint { font-size: 10.5px; color: var(--vtb-ink-3); line-height: 1.4; }
.dsh-atb-set .dsh-atb-perm-opt:hover { border-color: var(--vtb-line-strong); }
.dsh-atb-set .dsh-atb-perm-opt[data-on="true"] { border-color: var(--vtb-accent); background: var(--vtb-accent-soft); }
.dsh-atb-permission-select, .dsh-atb-urgency-select { max-width: 100%; }
.dsh-atb-settings-numbers { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 10px; }
.dsh-atb-settings-numbers label { display: grid; gap: 5px; font-size: 12px; color: var(--vtb-ink-2); }
.dsh-atb-settings-numbers input { width: 100%; }
.dsh-atb-storage-path { width: 100%; margin-top: 10px; font-family: var(--vtb-mono); }
.dsh-atb-storage-meta { display: grid; gap: 4px; margin-top: 8px; color: var(--vtb-ink-3); font-size: 12px; overflow-wrap: anywhere; }
.dsh-atb-storage-error { color: var(--vtb-red); }
.dsh-atb-storage-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 10px; }
.dsh-atb-storage-notice { display: grid; gap: 4px; margin-top: 8px; font-size: 12px; }
.dsh-atb-storage-notice-ok { color: var(--vtb-green); padding: 5px 8px; border-radius: var(--vtb-radius-sm); background: var(--vtb-green-soft); }
.dsh-atb-storage-notice-warn { color: var(--vtb-yellow); padding: 5px 8px; border-radius: var(--vtb-radius-sm); background: var(--vtb-yellow-soft); word-break: break-word; }

/* ── 模板管理 / 导入 / 队列 / 外部同步 ─────────────────────────────── */
.dsh-atb-tplm { max-width: 640px; width: min(640px, 92vw); }
.dsh-atb-tplm .dsh-atb-modal-body,
.dsh-atb-set .dsh-atb-modal-body,
.dsh-atb-diag .dsh-atb-modal-body,
.dsh-atb-imp .dsh-atb-modal-body {
  display: flex; flex-direction: column; gap: 12px;
}
.dsh-atb-tplm-list { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.dsh-atb-tplm-catgroup { display: flex; flex-direction: column; gap: 8px; }
.dsh-atb-tplm-cathead { font-size: 10.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--vtb-ink-3); padding-left: 2px; }
.dsh-atb-tplm-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 8px 12px; border-radius: var(--vtb-radius);
  border: 1px solid var(--vtb-line); background: var(--vtb-surface);
}
.dsh-atb-tplm-name {
  flex: 0 0 150px; width: 150px; max-width: 150px; font: inherit; font-family: var(--vtb-font);
  font-size: 12.5px; padding: 5px 8px; border-radius: var(--vtb-radius-sm);
  border: 1px solid var(--vtb-line); background: var(--vtb-surface); color: var(--vtb-ink);
  box-sizing: border-box;
}
.dsh-atb-tplm-catwrap { position: relative; flex: 0 0 110px; width: 110px; max-width: 110px; }
.dsh-atb-tplm-category {
  width: 100%; max-width: 100%; font: inherit; font-family: var(--vtb-font); font-size: 11.5px;
  padding: 5px 8px; border-radius: var(--vtb-radius-sm);
  border: 1px solid var(--vtb-line); background: var(--vtb-surface); color: var(--vtb-ink);
  box-sizing: border-box;
}
.dsh-atb-tplm-catpop {
  position: absolute; top: calc(100% + 3px); left: 0; z-index: 6; min-width: 140px; max-height: 180px;
  overflow-y: auto; display: flex; flex-direction: column; padding: 4px;
  border-radius: var(--vtb-radius); background: var(--vtb-surface); color: var(--vtb-ink);
  border: 1px solid var(--vtb-line); box-shadow: var(--vtb-shadow-2);
}
.dsh-atb-tplm-catopt {
  border: none; background: none; text-align: left; cursor: pointer; padding: 5px 8px;
  font: inherit; font-family: var(--vtb-font); font-size: 11.5px; color: var(--vtb-ink);
  border-radius: var(--vtb-radius-sm); white-space: nowrap;
}
.dsh-atb-tplm-catopt:hover { background: var(--vtb-hover); }
.dsh-atb-tplm-catpop-up { top: auto; bottom: calc(100% + 3px); }
.dsh-atb-tplm-catstatic {
  flex: 0 0 110px; max-width: 110px; font-size: 11px; color: var(--vtb-ink-3);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.dsh-atb-tplm-meta { flex: 1; min-width: 0; font-size: 11px; color: var(--vtb-ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dsh-atb-tplm-btns { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

.dsh-atb-imp { max-width: 600px; width: min(600px, 92vw); }
.dsh-atb-imp-picker { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.dsh-atb-imp-picker input[type="file"] { font-size: 12px; }
.dsh-atb-imp-filename { font-size: 11.5px; color: var(--vtb-accent-ink); word-break: break-all; }
.dsh-atb-imp-note { font-size: 11px; color: var(--vtb-ink-3); margin-bottom: 10px; line-height: 1.5; }
.dsh-atb-imp-error { font-size: 12px; color: var(--vtb-red); margin-bottom: 8px; }
.dsh-atb-imp-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
.dsh-atb-imp-stat {
  display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 10px 6px;
  border-radius: var(--vtb-radius-lg); border: 1px solid var(--vtb-line); background: var(--vtb-surface-2);
}
.dsh-atb-imp-stat b { font-size: 17px; font-weight: 600; font-variant-numeric: tabular-nums; }
.dsh-atb-imp-stat span { font-size: 10.5px; color: var(--vtb-ink-3); }
.dsh-atb-imp-stat[data-tone="ok"] b { color: var(--vtb-green); }
.dsh-atb-imp-stat[data-tone="warn"] b { color: var(--vtb-yellow); }
.dsh-atb-imp-stat[data-tone="bad"] b { color: var(--vtb-red); }
.dsh-atb-imp-sec h4 { margin: 0 0 6px; font-size: 12px; font-weight: 600; }
.dsh-atb-imp-sec { margin-bottom: 10px; }
.dsh-atb-imp-list { display: flex; flex-direction: column; gap: 4px; max-height: 160px; overflow-y: auto; }
.dsh-atb-imp-row {
  display: flex; align-items: center; gap: 10px; justify-content: space-between;
  padding: 6px 9px; border-radius: var(--vtb-radius-sm); border: 1px solid var(--vtb-line);
}
.dsh-atb-imp-row[data-tone="bad"] { border-color: var(--vtb-red-soft); background: var(--vtb-red-soft); }
.dsh-atb-imp-row-title { font-size: 12px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-atb-imp-row-status { font-size: 10.5px; color: var(--vtb-ink-3); flex-shrink: 0; }
.dsh-atb-imp-result { font-size: 12px; color: var(--vtb-green); margin-top: 10px; }

.dsh-atb-queuepanel { width: 480px; max-width: 92vw; }
.dsh-atb-queuepanel-actions { display: flex; align-items: center; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
.dsh-atb-queuepanel-actions .dsh-atb-btn[data-armed="true"] { background: var(--vtb-red); color: #fff; border-color: transparent; }

.dsh-atb-external { display: flex; flex-direction: column; gap: 4px; }
.dsh-atb-external label { display: flex; flex-direction: column; gap: 6px; margin: 9px 0; min-width: 0; font-size: 12px; color: var(--vtb-ink-2); }
.dsh-atb-external input, .dsh-atb-external select {
  box-sizing: border-box; width: 100%; padding: 7px 10px; border-radius: var(--vtb-radius);
  border: 1px solid var(--vtb-line); background: var(--vtb-surface); color: var(--vtb-ink);
  font: inherit; font-family: var(--vtb-font);
}
.dsh-atb-external input:focus, .dsh-atb-external select:focus { outline: none; border-color: var(--vtb-accent); box-shadow: var(--vtb-ring); }
.dsh-atb-external button {
  padding: 6px 10px; border: 1px solid var(--vtb-line); border-radius: var(--vtb-radius-sm);
  background: var(--vtb-surface); color: var(--vtb-ink-2); font: inherit; font-family: var(--vtb-font);
  font-size: 12px; cursor: pointer;
}
.dsh-atb-external button:hover:not(:disabled) { border-color: var(--vtb-line-strong); color: var(--vtb-ink); }
.dsh-atb-external button:disabled { opacity: .5; cursor: default; }
.dsh-atb-external fieldset > div > label { flex: 1; }
.dsh-atb-external-mapping { display: flex; gap: 8px; margin: 12px 0; align-items: flex-end; }
.dsh-atb-external-options { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 9px 0; font-size: 12px; }
.dsh-atb-external .dsh-atb-external-options > label { flex: 0 0 auto; margin: 0; white-space: nowrap; }
.dsh-atb-external-scope-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; overflow-wrap: anywhere; font-size: 12px; }
.dsh-atb-external .dsh-atb-external-mapping > label { flex: 1; margin: 0; }
.dsh-atb-mapping-mode { display: inline-flex; gap: 4px; }
.dsh-atb-external .dsh-atb-external-remove {
  flex: 0 0 36px; width: 36px; height: 36px; box-sizing: border-box; padding: 0;
  display: inline-flex; align-items: center; justify-content: center; align-self: flex-end;
  color: var(--vtb-ink-3);
}
.dsh-atb-external .dsh-atb-external-remove:hover:not(:disabled) { color: var(--vtb-red); border-color: transparent; background: var(--vtb-red-soft); }
.dsh-atb-external-mapping input, .dsh-atb-external-mapping select { height: 36px; }
@media (max-width: 600px) {
  .dsh-atb-external-mapping { flex-wrap: wrap; }
  .dsh-atb-external .dsh-atb-external-mapping > .dsh-atb-external-scope { flex: 0 0 100%; }
}

/* ── 提示词与斜杠补全 ───────────────────────────────────────────────── */
.dsh-atb-prompt-wrap {
  display: flex; flex-direction: column; gap: 6px; position: relative; width: 100%;
  border-radius: var(--vtb-radius); transition: border-color var(--vtb-dur) var(--vtb-ease);
}
.dsh-atb-prompt-wrap[data-drag-over="true"] { outline: 2px dashed var(--vtb-accent); background: var(--vtb-accent-soft); }
.dsh-atb-prompt-inner { position: relative; width: 100%; }
.dsh-atb-prompt-input {
  width: 100%; box-sizing: border-box; font: inherit; font-family: var(--vtb-font);
  font-size: 13px; line-height: 1.55; padding: 8px 10px; border-radius: var(--vtb-radius);
  resize: vertical; min-height: 68px;
  border: 1px solid var(--vtb-line); background: var(--vtb-surface); color: var(--vtb-ink);
  transition: border-color var(--vtb-dur) var(--vtb-ease), box-shadow var(--vtb-dur) var(--vtb-ease);
}
.dsh-atb-prompt-input:focus { outline: none; border-color: var(--vtb-accent); box-shadow: var(--vtb-ring); }
.dsh-atb-prompt-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.dsh-atb-prompt-tip { font-size: 11px; color: var(--vtb-ink-3); }
.dsh-atb-prompt-tip code { font-family: var(--vtb-mono); font-size: 10.5px; padding: 1px 4px; border-radius: 4px; background: var(--vtb-hover); }

.dsh-atb-slash-popup {
  display: flex; flex-direction: column; overflow: hidden; border-radius: var(--vtb-radius-lg);
  background: var(--vtb-surface); color: var(--vtb-ink);
  border: 1px solid var(--vtb-line); box-shadow: var(--vtb-shadow-2);
  font-family: var(--vtb-font);
}
.dsh-atb-slash-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 10px; border-bottom: 1px solid var(--vtb-line); background: var(--vtb-surface-2);
}
.dsh-atb-slash-title { font-size: 11px; font-weight: 600; color: var(--vtb-ink-2); }
.dsh-atb-slash-hint { font-size: 10px; color: var(--vtb-ink-3); }
.dsh-atb-slash-list { overflow-y: auto; max-height: 200px; display: flex; flex-direction: column; padding: 4px; }
.dsh-atb-slash-item {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: var(--vtb-radius-sm);
  cursor: pointer; font-size: 12px; transition: background var(--vtb-dur) var(--vtb-ease);
}
.dsh-atb-slash-item[data-active="true"], .dsh-atb-slash-item:hover { background: var(--vtb-hover); }
.dsh-atb-slash-badge { font-size: 10px; font-weight: 600; padding: 1px 5px; border-radius: 4px; flex-shrink: 0; }
.dsh-atb-slash-badge[data-kind="command"] { background: var(--vtb-orange-soft); color: var(--vtb-orange); }
.dsh-atb-slash-badge[data-kind="skill"] { background: var(--vtb-purple-soft); color: var(--vtb-purple); }
.dsh-atb-slash-name { font-weight: 600; font-family: var(--vtb-mono); font-size: 12.5px; }
.dsh-atb-slash-param { font-size: 11px; color: var(--vtb-ink-3); font-family: var(--vtb-mono); }
.dsh-atb-slash-desc {
  font-size: 11px; color: var(--vtb-ink-3); margin-left: auto;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 45%;
}

/* 兜底：工具类 */
.dsh-atb-muted { color: var(--vtb-ink-3); }
.dsh-atb-danger { color: var(--vtb-red); }
`

/** 样式元素 id（测试与调试的稳定钩子）。 */
const STYLE_ID = 'dsh-vt-taskboard-styles'

/**
 * 样式归属标记：web shell 会把没有归属的 <style> 认给「下一个物化」的插件模块，
 * 而客户端 HMR 按该属性删除重建。预先打标，避免兄弟模块的 HMR 误删我们的样式表。
 */
const PLUGIN_ID = 'dsh-vt-taskboard'

/** 单张样式表的身份，与 shell 自己的 data-plugin-css 对齐。 */
const CSS_TAG = 'dsh-vt-taskboard/styles'

/**
 * 保证样式表在 <head> 中：不存在则创建，被移除则重新挂载，并始终带上归属标记。
 * 幂等性基于 DOM 而非模块级标志位——标志位看不到元素被删除。
 */
export function injectStyles(): void {
  if (typeof document === 'undefined') return
  let style = document.getElementById(STYLE_ID)
  if (style === null) {
    style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = STYLES
    document.head.append(style)
  }
  style.dataset.plugin = PLUGIN_ID
  style.dataset.pluginCss = CSS_TAG
}
