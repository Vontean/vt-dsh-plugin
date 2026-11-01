/**
 * dsh-vt-mine-models — Client half.
 *
 * ── What this plugin does ────────────────────────────────────────────────────
 * It takes over the composer's model seat (`conversation.input.model`, a
 * `single` slot declared by `@deepseek-ai/dsh-client-ui-conversation`) and
 * reproduces MineCodex's two-stage model picker on top of DSH's own data:
 *
 *   click the chip → effort panel (current model + reasoning-effort slider)
 *   click the model row → provider-grouped model list (search, check, icons)
 *   Escape / back   → list collapses back into the effort panel
 *
 * ── Why a slot replacement instead of DOM patching ──────────────────────────
 * DSH's slot registry lets a later registration shadow a `single` slot by
 * priority ("lowest renders"). ui-model-selection registers its ModelSelect at
 * priority 0; this plugin registers at -1, so it owns the seat outright. That
 * buys full control over the two-stage motion and lets every row carry a
 * provider icon. The data layer is untouched: the same per-session
 * `modelDirectories` directory, the same `load()` / `select()` verbs, the same
 * pending projection, so a switch made here is what `/model` sees next.
 *
 * The model list itself keeps DSH's current design (provider groups, sticky
 * headers, search above four models, check mark, pending spinner) — only the
 * root panel is new. Fast / service-tier has no DSH equivalent and is not
 * reproduced.
 *
 * ── Motion ──────────────────────────────────────────────────────────────────
 * Learned from MineCodex (`features/model-slider/src/frontend/install.mjs`):
 *   · container height   320ms  cubic-bezier(.19, 1, .22, 1)
 *   · pane content       200ms  cubic-bezier(.23, 1, .32, 1)  + 10px rise
 *                        open delay 40ms, close delay 0
 *   · whole menu         150ms  fade-in only (DSH's macOS menu backing layer is
 *                        an opaque rect behind the surface, so fading *out*
 *                        would flash it; DSH menus close instantly and so does
 *                        this one)
 *   · reduced motion     every transition collapses to 0ms
 *
 * ── Visual system ───────────────────────────────────────────────────────────
 * Colors, surfaces, radii and shadows are DSH tokens (`--dsw-*`) only; the
 * menu surface is the shared `MenuSurface` primitive so the material, blur and
 * macOS backing behave exactly like every other menu. Brand marks are the
 * MineCodex provider set (MIT), inlined here because a client bundle only
 * resolves modules from the platform table.
 */

window.__ModuleLoader__.load({
  id: 'dsh-vt-mine-models',
  factory(require) {
    'use strict';

    /** 插件标识（与 package.json name、cordis.patch.yml name 一致）。 */
    const PLUGIN_ID = 'dsh-vt-mine-models';
    /** 与 package.json version 同值，仅用于诊断标记。 */
    const VERSION = '1.0.0';
    /** 本插件拥有的 locale 命名空间。 */
    const NS = 'vtMineModels';
    /** 菜单宽度规则照 DSH 原生 ModelSelect：内容自适应，夹在 240–420 之间。 */
    const MENU_WIDTH_DEFAULT = 264;
    const MENU_WIDTH_MIN = 240;
    const MENU_WIDTH_MAX = 420;
    /** 行内固定占位：左右 padding 14 + 图标 16 + 两个 gap 8 + 勾选位 14。 */
    const ROW_CHROME = 60;
    /** 视口安全边距。 */
    const MENU_MARGIN = 12;
    /** 面板底边与触发按钮的间距（原生菜单是 8px）。 */
    const MENU_GAP = 8;

    // ── styles ────────────────────────────────────────────────────────────────
    // Every class is namespaced `vtmm_` so a DSH build can never collide with it.
    // Values marked "native" are copied from ui-model-selection's ModelSelect
    // CSS module (same tokens, same geometry) so the list still looks native.
    const CSS = `
.vtmm_root{min-width:0;position:relative}
.vtmm_trigger{border-radius:var(--dsw-radius-sm);min-width:0;max-width:min(360px,45cqw);height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;outline:none;align-items:center;gap:4px;padding:0 4px 0 8px;font-size:13px;font-weight:400;line-height:20px;display:flex}
.vtmm_trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.vtmm_trigger:focus-visible:not([data-selection-focus]){box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}
.vtmm_trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.vtmm_triggerIcon{display:var(--dsh-composer-model-icon-display,none);flex:none;color:currentColor}
.vtmm_triggerLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden;display:var(--dsh-composer-model-text-display,block)}
.vtmm_triggerEffort{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-caption);flex-shrink:1000;overflow:hidden;display:var(--dsh-composer-model-text-display,block)}
.vtmm_chevron{color:var(--dsw-alias-label-caption);flex:none;transition:transform .12s}
.vtmm_chevronOpen{transform:rotate(180deg)}

/* ── menu shell ─────────────────────────────────────────────────────────── */
.vtmm_menu > div:first-child{background:var(--dsw-alias-bg-layer-1) !important;backdrop-filter:none !important}
.vtmm_menu{z-index:1100;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);width:240px;max-width:min(420px,100vw - 32px);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border:0;flex-direction:column;padding:6px;display:flex;position:fixed;overflow:hidden;animation:vtmm_menu_in 150ms cubic-bezier(.23,1,.32,1) both}
.vtmm_shell{position:relative;min-height:0;overflow:hidden;transition:height 320ms cubic-bezier(.19,1,.22,1)}
.vtmm_menu:not([data-ready]) .vtmm_shell{transition:none}

/* ── effort stage ───────────────────────────────────────────────────────── */

.vtmm_effort{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;padding:10px 8px 8px;transition:opacity 140ms linear}
.vtmm_effort[data-hidden]{opacity:0;pointer-events:none}
.vtmm_effortValue{min-height:18px;text-align:center;color:var(--dsw-alias-state-business-primary);font-size:13px;font-weight:500;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:color 160ms ease}
.vtmm_modelRow{display:flex;align-items:center;justify-content:center;gap:4px;min-height:20px;margin:2px 0 0;padding:0 6px;border:0;border-radius:var(--dsw-radius-sm);background:0 0;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:18px;cursor:pointer;outline:none;text-align:center}
.vtmm_modelRow:hover .vtmm_modelRowChevron{transform:translateX(2px)}
.vtmm_modelRow:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}
.vtmm_modelRowName{min-width:0;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}
.vtmm_modelRowChevron{display:block;flex:none;color:var(--dsw-alias-menu-icon);transition:transform 200ms cubic-bezier(.23,1,.32,1)}

/* 滑轨几何照抄 MineCodex：rail 38 / track 16（top 12）/ thumb 26（top 7）/ tick 6。
   两端按 thumbRadius 修正，让拇指和端点刻度收进轨道，不越过胶囊端头。 */
.vtmm_rail{position:relative;height:30px;margin:10px 2px 2px;cursor:pointer;touch-action:none;outline:none}
.vtmm_track{position:absolute;left:0;right:0;top:6px;height:18px;border-radius:999px;corner-shape:round;background:var(--dsw-specific-selector)}
.vtmm_fill{position:absolute;top:0;bottom:0;left:0;border-radius:inherit;corner-shape:round;background:var(--dsw-alias-state-business-primary);transition:width 180ms cubic-bezier(.23,1,.32,1),background-color 160ms ease}
.vtmm_tick{position:absolute;top:15px;width:4px;height:4px;border-radius:999px;corner-shape:round;transform:translate(-50%,-50%);background:var(--dsw-alias-label-caption);opacity:.55;transition:opacity 160ms ease;pointer-events:none}
.vtmm_tick[data-passed]{background:var(--dsw-alias-label-primary-inverted);opacity:.9}
.vtmm_thumb{box-sizing:border-box;position:absolute;top:3px;width:24px;height:24px;border-radius:999px;corner-shape:round;transform:translateX(-50%);background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l2);box-shadow:var(--dsw-elevation-soft);transition:left 180ms cubic-bezier(.23,1,.32,1),box-shadow 160ms ease;pointer-events:none}
.vtmm_rail:focus-visible .vtmm_thumb{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary)),var(--dsw-elevation-soft)}
.vtmm_rail[data-dragging] .vtmm_fill,.vtmm_rail[data-dragging] .vtmm_thumb{transition:none}
.vtmm_railHint{height:16px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;margin-top:2px}

/* ── model stage ───────────────────────────────────────────────────────── */
.vtmm_list{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;min-height:0;animation:vtmm_pane_in 200ms cubic-bezier(.23,1,.32,1) 40ms both}
.vtmm_list[data-leaving]{animation:none;opacity:0;transform:translateY(10px);transition:opacity 200ms cubic-bezier(.23,1,.32,1),transform 200ms cubic-bezier(.23,1,.32,1)}
.vtmm_listHead{flex:none;display:flex;align-items:center;gap:2px;margin:0 0 3px}
.vtmm_back{corner-shape:round;flex:none;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:50%;background:0 0;color:var(--dsw-alias-label-secondary);cursor:pointer;outline:none}
.vtmm_back:hover,.vtmm_back:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.vtmm_searchRow{flex:1;min-width:0;position:relative}
.vtmm_searchRow .vtmm_search{border-radius:var(--dsw-radius-md);background:0 0;border:0 solid #0000;height:auto;padding:5px 7px;display:flex}
.vtmm_searchRow .vtmm_searchWithQuery{padding-right:34px}
.vtmm_searchRow .vtmm_search:focus-within{border-color:#0000}
.vtmm_searchRow .vtmm_search input{padding:0;font-size:12px;line-height:normal}
.vtmm_searchRow .vtmm_search input::placeholder{color:var(--dsw-alias-label-caption)}
.vtmm_searchClear{corner-shape:round;width:24px;height:24px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:50%;justify-content:center;align-items:center;padding:0;display:inline-flex;position:absolute;top:50%;right:4px;transform:translateY(-50%)}
.vtmm_searchClear:hover,.vtmm_searchClear:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.vtmm_status,.vtmm_empty{color:var(--dsw-alias-label-tertiary);padding:8px;font-size:12px;line-height:18px}
.vtmm_error,.vtmm_warning{border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:3px;padding:6px 7px;font-size:11px;line-height:16px;display:flex}
.vtmm_warning{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-state-warn-label)}
.vtmm_retry{color:inherit;font:inherit;cursor:pointer;background:0 0;border:none;flex:none;padding:0;font-weight:600}
.vtmm_groups{min-height:0;overflow-y:auto;overscroll-behavior:contain}
.vtmm_option{box-sizing:border-box;border-radius:var(--dsw-radius-md);width:auto;min-width:100%;min-height:34px;color:inherit;text-align:left;cursor:pointer;background:0 0;border:none;outline:none;align-items:center;gap:8px;padding:5px 7px;display:flex}
.vtmm_option:hover:not(:disabled),.vtmm_option:focus-visible,.vtmm_option[data-active]:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.vtmm_option:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.vtmm_brand{display:block;flex:none;color:var(--dsw-alias-label-secondary)}
.vtmm_optionCopy{flex-direction:column;flex:1;min-width:0;display:flex}
.vtmm_modelName{color:inherit;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:400;line-height:18px;overflow:hidden}
.vtmm_check{color:var(--dsw-alias-label-primary);flex:0 0 14px;place-items:center;display:grid}
.vtmm_check svg{width:14px;height:14px}

/* ── motion ────────────────────────────────────────────────────────────── */
@keyframes vtmm_menu_in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes vtmm_pane_in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){
  .vtmm_menu{animation:none}
  .vtmm_shell{transition:none}
  .vtmm_list{animation:none}
  .vtmm_list[data-leaving]{transition:none}
  .vtmm_fill,.vtmm_thumb,.vtmm_tick,.vtmm_effortValue,.vtmm_effort,.vtmm_chevron,.vtmm_modelRowChevron{transition:none}
}
`;

    const styleId = `${PLUGIN_ID}/client.css`;
    if (typeof document !== 'undefined' && document.querySelector(`style[data-plugin-css="${styleId}"]`) === null) {
      const tag = document.createElement('style');
      tag.dataset.plugin = PLUGIN_ID;
      tag.dataset.pluginCss = styleId;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    const React = require('react');
    const ReactDOM = require('react-dom');
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives');
    const h = React.createElement;
    const useEffect = React.useEffect;
    const useLayoutEffect = React.useLayoutEffect;
    const useMemo = React.useMemo;
    const useRef = React.useRef;
    const useState = React.useState;
    const useSyncExternalStore = React.useSyncExternalStore;

    /** MineCodex provider marks (MIT, see THIRD_PARTY_NOTICES.md). */
    const ICONS = {"anthropic":{"viewBox":"0 0 24 24","inner":"<path d=\"M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-7.258 0h3.767L16.906 20h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.522zm4.132 9.959L8.453 7.687 6.205 13.48H10.7z\"></path>"},"deepseek":{"viewBox":"0 0 24 24","inner":"<path d=\"M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z\" fill=\"#4D6BFE\"></path>"},"gemini":{"viewBox":"0 0 24 24","inner":"<path d=\"M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z\" fill=\"#3186FF\"></path><path d=\"M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z\" fill=\"url(#lobe-icons-gemini-fill-0)\"></path><path d=\"M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z\" fill=\"url(#lobe-icons-gemini-fill-1)\"></path><path d=\"M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z\" fill=\"url(#lobe-icons-gemini-fill-2)\"></path><defs><linearGradient gradientUnits=\"userSpaceOnUse\" id=\"lobe-icons-gemini-fill-0\" x1=\"7\" x2=\"11\" y1=\"15.5\" y2=\"12\"><stop stop-color=\"#08B962\"></stop><stop offset=\"1\" stop-color=\"#08B962\" stop-opacity=\"0\"></stop></linearGradient><linearGradient gradientUnits=\"userSpaceOnUse\" id=\"lobe-icons-gemini-fill-1\" x1=\"8\" x2=\"11.5\" y1=\"5.5\" y2=\"11\"><stop stop-color=\"#F94543\"></stop><stop offset=\"1\" stop-color=\"#F94543\" stop-opacity=\"0\"></stop></linearGradient><linearGradient gradientUnits=\"userSpaceOnUse\" id=\"lobe-icons-gemini-fill-2\" x1=\"3.5\" x2=\"17.5\" y1=\"13.5\" y2=\"12\"><stop stop-color=\"#FABC12\"></stop><stop offset=\".46\" stop-color=\"#FABC12\" stop-opacity=\"0\"></stop></linearGradient></defs>"},"grok":{"viewBox":"0 0 24 24","inner":"<path d=\"M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815\"></path>"},"hunyuan":{"viewBox":"0 0 24 24","inner":"<circle cx=\"12\" cy=\"12\" fill=\"#0055E9\" r=\"12\"></circle><path d=\"M12 0c.518 0 1.028.033 1.528.096A6.188 6.188 0 0112.12 12.28l-.12.001c-2.99 0-5.242 2.179-5.554 5.11-.223 2.086.353 4.412 2.242 6.146C3.672 22.1 0 17.479 0 12 0 5.373 5.373 0 12 0z\" fill=\"#A8DFF5\"></path><path d=\"M5.286 5a2.438 2.438 0 01.682 3.38c-3.962 5.966-3.215 10.743 2.648 15.136C3.636 22.056 0 17.452 0 12c0-1.787.39-3.482 1.09-5.006.253-.435.525-.872.817-1.311A2.438 2.438 0 015.286 5z\" fill=\"#0055E9\"></path><path d=\"M12.98.04c.272.021.543.053.81.093.583.106 1.117.254 1.538.44 6.638 2.927 8.07 10.052 1.748 15.642a4.125 4.125 0 01-5.822-.358c-1.51-1.706-1.3-4.184.357-5.822.858-.848 3.108-1.223 4.045-2.441 1.257-1.634 2.122-6.009-2.523-7.506L12.98.039z\" fill=\"#00BCFF\"></path><path d=\"M13.528.096A6.187 6.187 0 0112 12.281a5.75 5.75 0 00-1.71.255c.147-.905.595-1.784 1.321-2.501.858-.848 3.108-1.223 4.045-2.441 1.27-1.651 2.14-6.104-2.676-7.554.184.014.367.033.548.056z\" fill=\"#ECECEE\"></path>"},"kimi":{"viewBox":"0 0 24 24","inner":"<path d=\"M19.738 5.776c.163-.209.306-.4.457-.585.07-.087.064-.153-.004-.244-.655-.861-.717-1.817-.34-2.787.283-.73.909-1.072 1.674-1.145.477-.045.945.004 1.379.236.57.305.902.77 1.01 1.412.086.512.07 1.012-.075 1.508-.257.878-.888 1.333-1.753 1.448-.718.096-1.446.108-2.17.157-.056.004-.113 0-.178 0z\" fill=\"#027AFF\"></path><path d=\"M17.962 1.844h-4.326l-3.425 7.81H5.369V1.878H1.5V22h3.87v-8.477h6.824a3.025 3.025 0 002.743-1.75V22h3.87v-8.477a3.87 3.87 0 00-3.588-3.86v-.01h-2.125a3.94 3.94 0 002.323-2.12l2.545-5.689z\"></path>"},"minimax":{"viewBox":"0 0 24 24","inner":"<defs><linearGradient id=\"lobe-icons-minimax-fill\" x1=\"0%\" x2=\"100.182%\" y1=\"50.057%\" y2=\"50.057%\"><stop offset=\"0%\" stop-color=\"#E2167E\"></stop><stop offset=\"100%\" stop-color=\"#FE603C\"></stop></linearGradient></defs><path d=\"M16.278 2c1.156 0 2.093.927 2.093 2.07v12.501a.74.74 0 00.744.709.74.74 0 00.743-.709V9.099a2.06 2.06 0 012.071-2.049A2.06 2.06 0 0124 9.1v6.561a.649.649 0 01-.652.645.649.649 0 01-.653-.645V9.1a.762.762 0 00-.766-.758.762.762 0 00-.766.758v7.472a2.037 2.037 0 01-2.048 2.026 2.037 2.037 0 01-2.048-2.026v-12.5a.785.785 0 00-.788-.753.785.785 0 00-.789.752l-.001 15.904A2.037 2.037 0 0113.441 22a2.037 2.037 0 01-2.048-2.026V18.04c0-.356.292-.645.652-.645.36 0 .652.289.652.645v1.934c0 .263.142.506.372.638.23.131.514.131.744 0a.734.734 0 00.372-.638V4.07c0-1.143.937-2.07 2.093-2.07zm-5.674 0c1.156 0 2.093.927 2.093 2.07v11.523a.648.648 0 01-.652.645.648.648 0 01-.652-.645V4.07a.785.785 0 00-.789-.78.785.785 0 00-.789.78v14.013a2.06 2.06 0 01-2.07 2.048 2.06 2.06 0 01-2.071-2.048V9.1a.762.762 0 00-.766-.758.762.762 0 00-.766.758v3.8a2.06 2.06 0 01-2.071 2.049A2.06 2.06 0 010 12.9v-1.378c0-.357.292-.646.652-.646.36 0 .653.29.653.646V12.9c0 .418.343.757.766.757s.766-.339.766-.757V9.099a2.06 2.06 0 012.07-2.048 2.06 2.06 0 012.071 2.048v8.984c0 .419.343.758.767.758.423 0 .766-.339.766-.758V4.07c0-1.143.937-2.07 2.093-2.07z\" fill=\"url(#lobe-icons-minimax-fill)\" fill-rule=\"nonzero\"></path>"},"muse":{"viewBox":"0 0 24 24","inner":"<path d=\"M6.897 4h-.024l-.031 2.615h.022c1.715 0 3.046 1.357 5.94 6.246l.175.297.012.02 1.62-2.438-.012-.019a48.763 48.763 0 00-1.098-1.716 28.01 28.01 0 00-1.175-1.629C10.413 4.932 8.812 4 6.896 4z\" fill=\"url(#lobe-icons-meta-0-_R_0_)\"></path><path d=\"M6.873 4C4.95 4.01 3.247 5.258 2.02 7.17a4.352 4.352 0 00-.01.017l2.254 1.231.011-.017c.718-1.083 1.61-1.774 2.568-1.785h.021L6.896 4h-.023z\" fill=\"url(#lobe-icons-meta-1-_R_0_)\"></path><path d=\"M2.019 7.17l-.011.017C1.2 8.447.598 9.995.274 11.664l-.005.022 2.534.6.004-.022c.27-1.467.786-2.828 1.456-3.845l.011-.017L2.02 7.17z\" fill=\"url(#lobe-icons-meta-2-_R_0_)\"></path><path d=\"M2.807 12.264l-2.533-.6-.005.022c-.177.918-.267 1.851-.269 2.786v.023l2.598.233v-.023a12.591 12.591 0 01.21-2.44z\" fill=\"url(#lobe-icons-meta-3-_R_0_)\"></path><path d=\"M2.677 15.537a5.462 5.462 0 01-.079-.813v-.022L0 14.468v.024a8.89 8.89 0 00.146 1.652l2.535-.585a4.106 4.106 0 01-.004-.022z\" fill=\"url(#lobe-icons-meta-4-_R_0_)\"></path><path d=\"M3.27 16.89c-.284-.31-.484-.756-.589-1.328l-.004-.021-2.535.585.004.021c.192 1.01.568 1.85 1.106 2.487l.014.017 2.018-1.745a2.106 2.106 0 01-.015-.016z\" fill=\"url(#lobe-icons-meta-5-_R_0_)\"></path><path d=\"M10.78 9.654c-1.528 2.35-2.454 3.825-2.454 3.825-2.035 3.2-2.739 3.917-3.871 3.917a1.545 1.545 0 01-1.186-.508l-2.017 1.744.014.017C2.01 19.518 3.058 20 4.356 20c1.963 0 3.374-.928 5.884-5.33l1.766-3.13a41.283 41.283 0 00-1.227-1.886z\" fill=\"#0082FB\"></path><path d=\"M13.502 5.946l-.016.016c-.4.43-.786.908-1.16 1.416.378.483.768 1.024 1.175 1.63.48-.743.928-1.345 1.367-1.807l.016-.016-1.382-1.24z\" fill=\"url(#lobe-icons-meta-6-_R_0_)\"></path><path d=\"M20.918 5.713C19.853 4.633 18.583 4 17.225 4c-1.432 0-2.637.787-3.723 1.944l-.016.016 1.382 1.24.016-.017c.715-.747 1.408-1.12 2.176-1.12.826 0 1.6.39 2.27 1.075l.015.016 1.589-1.425-.016-.016z\" fill=\"#0082FB\"></path><path d=\"M23.998 14.125c-.06-3.467-1.27-6.566-3.064-8.396l-.016-.016-1.588 1.424.015.016c1.35 1.392 2.277 3.98 2.361 6.971v.023h2.292v-.022z\" fill=\"url(#lobe-icons-meta-7-_R_0_)\"></path><path d=\"M23.998 14.15v-.023h-2.292v.022c.004.14.006.282.006.424 0 .815-.121 1.474-.368 1.95l-.011.022 1.708 1.782.013-.02c.62-.96.946-2.293.946-3.91 0-.083 0-.165-.002-.247z\" fill=\"url(#lobe-icons-meta-8-_R_0_)\"></path><path d=\"M21.344 16.52l-.011.02c-.214.402-.519.67-.917.787l.778 2.462a3.493 3.493 0 00.438-.182 3.558 3.558 0 001.366-1.218l.044-.065.012-.02-1.71-1.784z\" fill=\"url(#lobe-icons-meta-9-_R_0_)\"></path><path d=\"M19.92 17.393c-.262 0-.492-.039-.718-.14l-.798 2.522c.449.153.927.222 1.46.222.492 0 .943-.073 1.352-.215l-.78-2.462c-.167.05-.341.075-.517.073z\" fill=\"url(#lobe-icons-meta-10-_R_0_)\"></path><path d=\"M18.323 16.534l-.014-.017-1.836 1.914.016.017c.637.682 1.246 1.105 1.937 1.337l.797-2.52c-.291-.125-.573-.353-.9-.731z\" fill=\"url(#lobe-icons-meta-11-_R_0_)\"></path><path d=\"M18.309 16.515c-.55-.642-1.232-1.712-2.303-3.44l-1.396-2.336-.011-.02-1.62 2.438.012.02.989 1.668c.959 1.61 1.74 2.774 2.493 3.585l.016.016 1.834-1.914a2.353 2.353 0 01-.014-.017z\" fill=\"url(#lobe-icons-meta-12-_R_0_)\"></path><defs><linearGradient id=\"lobe-icons-meta-0-_R_0_\" x1=\"75.897%\" x2=\"26.312%\" y1=\"89.199%\" y2=\"12.194%\"><stop offset=\".06%\" stop-color=\"#0867DF\"></stop><stop offset=\"45.39%\" stop-color=\"#0668E1\"></stop><stop offset=\"85.91%\" stop-color=\"#0064E0\"></stop></linearGradient><linearGradient id=\"lobe-icons-meta-1-_R_0_\" x1=\"21.67%\" x2=\"97.068%\" y1=\"75.874%\" y2=\"23.985%\"><stop offset=\"13.23%\" stop-color=\"#0064DF\"></stop><stop offset=\"99.88%\" stop-color=\"#0064E0\"></stop></linearGradient><linearGradient id=\"lobe-icons-meta-2-_R_0_\" x1=\"38.263%\" x2=\"60.895%\" y1=\"89.127%\" y2=\"16.131%\"><stop offset=\"1.47%\" stop-color=\"#0072EC\"></stop><stop offset=\"68.81%\" stop-color=\"#0064DF\"></stop></linearGradient><linearGradient id=\"lobe-icons-meta-3-_R_0_\" x1=\"47.032%\" x2=\"52.15%\" y1=\"90.19%\" y2=\"15.745%\"><stop offset=\"7.31%\" stop-color=\"#007CF6\"></stop><stop offset=\"99.43%\" stop-color=\"#0072EC\"></stop></linearGradient><linearGradient id=\"lobe-icons-meta-4-_R_0_\" x1=\"52.155%\" x2=\"47.591%\" y1=\"58.301%\" y2=\"37.004%\"><stop offset=\"7.31%\" stop-color=\"#007FF9\"></stop><stop offset=\"100%\" stop-color=\"#007CF6\"></stop></linearGradient><linearGradient id=\"lobe-icons-meta-5-_R_0_\" x1=\"37.689%\" x2=\"61.961%\" y1=\"12.502%\" y2=\"63.624%\"><stop offset=\"7.31%\" stop-color=\"#007FF9\"></stop><stop offset=\"100%\" stop-color=\"#0082FB\"></stop></linearGradient><linearGradient id=\"lobe-icons-meta-6-_R_0_\" x1=\"34.808%\" x2=\"62.313%\" y1=\"68.859%\" y2=\"23.174%\"><stop offset=\"27.99%\" stop-color=\"#007FF8\"></stop><stop offset=\"91.41%\" stop-color=\"#0082FB\"></stop></linearGradient><linearGradient id=\"lobe-icons-meta-7-_R_0_\" x1=\"43.762%\" x2=\"57.602%\" y1=\"6.235%\" y2=\"98.514%\"><stop offset=\"0%\" stop-color=\"#0082FB\"></stop><stop offset=\"99.95%\" stop-color=\"#0081FA\"></stop></linearGradient><linearGradient id=\"lobe-icons-meta-8-_R_0_\" x1=\"60.055%\" x2=\"39.88%\" y1=\"4.661%\" y2=\"69.077%\"><stop offset=\"6.19%\" stop-color=\"#0081FA\"></stop><stop offset=\"100%\" stop-color=\"#0080F9\"></stop></linearGradient><linearGradient id=\"lobe-icons-meta-9-_R_0_\" x1=\"30.282%\" x2=\"61.081%\" y1=\"59.32%\" y2=\"33.244%\"><stop offset=\"0%\" stop-color=\"#027AF3\"></stop><stop offset=\"100%\" stop-color=\"#0080F9\"></stop></linearGradient><linearGradient id=\"lobe-icons-meta-10-_R_0_\" x1=\"20.433%\" x2=\"82.112%\" y1=\"50.001%\" y2=\"50.001%\"><stop offset=\"0%\" stop-color=\"#0377EF\"></stop><stop offset=\"99.94%\" stop-color=\"#0279F1\"></stop></linearGradient><linearGradient id=\"lobe-icons-meta-11-_R_0_\" x1=\"40.303%\" x2=\"72.394%\" y1=\"35.298%\" y2=\"57.811%\"><stop offset=\".19%\" stop-color=\"#0471E9\"></stop><stop offset=\"100%\" stop-color=\"#0377EF\"></stop></linearGradient><linearGradient id=\"lobe-icons-meta-12-_R_0_\" x1=\"32.254%\" x2=\"68.003%\" y1=\"19.719%\" y2=\"84.908%\"><stop offset=\"27.65%\" stop-color=\"#0867DF\"></stop><stop offset=\"100%\" stop-color=\"#0471E9\"></stop></linearGradient></defs>"},"openai":{"viewBox":"0 0 24 24","inner":"<path d=\"M21.55 10.004a5.416 5.416 0 00-.478-4.501c-1.217-2.09-3.662-3.166-6.05-2.66A5.59 5.59 0 0010.831 1C8.39.995 6.224 2.546 5.473 4.838A5.553 5.553 0 001.76 7.496a5.487 5.487 0 00.691 6.5 5.416 5.416 0 00.477 4.502c1.217 2.09 3.662 3.165 6.05 2.66A5.586 5.586 0 0013.168 23c2.443.006 4.61-1.546 5.361-3.84a5.553 5.553 0 003.715-2.66 5.488 5.488 0 00-.693-6.497v.001zm-8.381 11.558a4.199 4.199 0 01-2.675-.954c.034-.018.093-.05.132-.074l4.44-2.53a.71.71 0 00.364-.623v-6.176l1.877 1.069c.02.01.033.029.036.05v5.115c-.003 2.274-1.87 4.118-4.174 4.123zM4.192 17.78a4.059 4.059 0 01-.498-2.763c.032.02.09.055.131.078l4.44 2.53c.225.13.504.13.73 0l5.42-3.088v2.138a.068.068 0 01-.027.057L9.9 19.288c-1.999 1.136-4.552.46-5.707-1.51h-.001zM3.023 8.216A4.15 4.15 0 015.198 6.41l-.002.151v5.06a.711.711 0 00.364.624l5.42 3.087-1.876 1.07a.067.067 0 01-.063.005l-4.489-2.559c-1.995-1.14-2.679-3.658-1.53-5.63h.001zm15.417 3.54l-5.42-3.088L14.896 7.6a.067.067 0 01.063-.006l4.489 2.557c1.998 1.14 2.683 3.662 1.529 5.633a4.163 4.163 0 01-2.174 1.807V12.38a.71.71 0 00-.363-.623zm1.867-2.773a6.04 6.04 0 00-.132-.078l-4.44-2.53a.731.731 0 00-.729 0l-5.42 3.088V7.325a.068.068 0 01.027-.057L14.1 4.713c2-1.137 4.555-.46 5.707 1.513.487.833.664 1.809.499 2.757h.001zm-11.741 3.81l-1.877-1.068a.065.065 0 01-.036-.051V6.559c.001-2.277 1.873-4.122 4.181-4.12.976 0 1.92.338 2.671.954-.034.018-.092.05-.131.073l-4.44 2.53a.71.71 0 00-.365.623l-.003 6.173v.002zm1.02-2.168L12 9.25l2.414 1.375v2.75L12 14.75l-2.415-1.375v-2.75z\"></path>"},"qwen":{"viewBox":"0 0 24 24","inner":"<path d=\"M12.604 1.34c.393.69.784 1.382 1.174 2.075a.18.18 0 00.157.091h5.552c.174 0 .322.11.446.327l1.454 2.57c.19.337.24.478.024.837-.26.43-.513.864-.76 1.3l-.367.658c-.106.196-.223.28-.04.512l2.652 4.637c.172.301.111.494-.043.77-.437.785-.882 1.564-1.335 2.34-.159.272-.352.375-.68.37-.777-.016-1.552-.01-2.327.016a.099.099 0 00-.081.05 575.097 575.097 0 01-2.705 4.74c-.169.293-.38.363-.725.364-.997.003-2.002.004-3.017.002a.537.537 0 01-.465-.271l-1.335-2.323a.09.09 0 00-.083-.049H4.982c-.285.03-.553-.001-.805-.092l-1.603-2.77a.543.543 0 01-.002-.54l1.207-2.12a.198.198 0 000-.197 550.951 550.951 0 01-1.875-3.272l-.79-1.395c-.16-.31-.173-.496.095-.965.465-.813.927-1.625 1.387-2.436.132-.234.304-.334.584-.335a338.3 338.3 0 012.589-.001.124.124 0 00.107-.063l2.806-4.895a.488.488 0 01.422-.246c.524-.001 1.053 0 1.583-.006L11.704 1c.341-.003.724.032.9.34zm-3.432.403a.06.06 0 00-.052.03L6.254 6.788a.157.157 0 01-.135.078H3.253c-.056 0-.07.025-.041.074l5.81 10.156c.025.042.013.062-.034.063l-2.795.015a.218.218 0 00-.2.116l-1.32 2.31c-.044.078-.021.118.068.118l5.716.008c.046 0 .08.02.104.061l1.403 2.454c.046.081.092.082.139 0l5.006-8.76.783-1.382a.055.055 0 01.096 0l1.424 2.53a.122.122 0 00.107.062l2.763-.02a.04.04 0 00.035-.02.041.041 0 000-.04l-2.9-5.086a.108.108 0 010-.113l.293-.507 1.12-1.977c.024-.041.012-.062-.035-.062H9.2c-.059 0-.073-.026-.043-.077l1.434-2.505a.107.107 0 000-.114L9.225 1.774a.06.06 0 00-.053-.031zm6.29 8.02c.046 0 .058.02.034.06l-.832 1.465-2.613 4.585a.056.056 0 01-.05.029.058.058 0 01-.05-.029L8.498 9.841c-.02-.034-.01-.052.028-.054l.216-.012 6.722-.012z\" fill=\"url(#lobe-icons-qwen-fill)\" fill-rule=\"nonzero\"></path><defs><linearGradient id=\"lobe-icons-qwen-fill\" x1=\"0%\" x2=\"100%\" y1=\"0%\" y2=\"0%\"><stop offset=\"0%\" stop-color=\"#6336E7\" stop-opacity=\".84\"></stop><stop offset=\"100%\" stop-color=\"#6F69F7\" stop-opacity=\".84\"></stop></linearGradient></defs>"},"xiaomimimo":{"viewBox":"0 0 24 24","inner":"<path d=\"M12 0C8.016 0 4.756.255 2.493 2.516.23 4.776 0 8.033 0 12.012c0 3.98.23 7.235 2.494 9.497C4.757 23.77 8.017 24 12 24c3.983 0 7.243-.23 9.506-2.491C23.77 19.247 24 15.99 24 12.012c0-3.984-.233-7.243-2.502-9.504C19.234.252 15.978 0 12 0zM4.906 7.405h5.624c1.47 0 3.007.068 3.764.827.746.746.827 2.233.83 3.676v4.54a.15.15 0 0 1-.152.147h-1.947a.15.15 0 0 1-.152-.148V11.83c-.002-.806-.048-1.634-.464-2.051-.358-.36-1.026-.441-1.72-.458H7.158a.15.15 0 0 0-.151.147v6.98a.15.15 0 0 1-.152.148H4.906a.15.15 0 0 1-.15-.148V7.554a.15.15 0 0 1 .15-.149zm12.131 0h1.949a.15.15 0 0 1 .15.15v8.892a.15.15 0 0 1-.15.148h-1.949a.15.15 0 0 1-.151-.148V7.554a.15.15 0 0 1 .151-.149zM8.92 10.948h2.046c.083 0 .15.066.15.147v5.352a.15.15 0 0 1-.15.148H8.92a.15.15 0 0 1-.152-.148v-5.352a.15.15 0 0 1 .152-.147Z\" fill=\"#FF6900\"/>"},"zhipu":{"viewBox":"0 0 96 96","inner":"<image href=\"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAACXBIWXMAABYlAAAWJQFJUiTwAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAOgSURBVHgB7Z3LcRpBEIYb2QcfCWGVARkIIhAZQAaQAUsE4AggAysDUAZkAI6Avfq0noaljGERjxn6MdNf1V/S6qLZ/ufRM10MDbhO06nr9ObUrp6bYFxi5bRx+nD6rH5/CAzyyGnrVJoe1swpgzvpgQU+pNZVTG9iBMDe4Fg1Agu+XBP6ghoZu3pwQgb7eUpD42MQrq+7TPJbZcAU9immQcMPpz9Oywb86/0GLYXT6wtYz+dit8FFA97B4OINDcjA4KKNa0AJBheFGcDMCxismAHMmAHMmAHMmAHMfAdPms3mTpwURbHTMZTt2mw24IPXyV6/3y+5abfbZ+1ar9clBbPZzPdkVLcBeZ6ftWk0GpUUoMlZlqVrAAbgtD0YECparZZv8EvVi3Cn0/nvGef8xWIBFIzHY1itVhAClSOgbuqZTCYlBXUjz0P6DHC9nK0d2+02xLyv14C6hQ+fqbKe4XAYMvi6DMCeX9f78O8UBEg5z+R9HM294XEpJ7j1ACj+Ny76vpuuOkqtokw5e73es95DXmBvFdW8P51On/kesoJ6qyh3u09+F1mBvUV49kNF4JRTvwGUKWfdZi95A+bzeUlB3WYveQMGg0FJQaBTzrgMwIDgMQAFT0w59RqgqMASnwHKCixxGaCtwBKVAe6MKbaUU5cBVCknwW5XnwGKCyz6DVBeYNFvgOYCi3oDIk85ZRsQSYFFrwGRFFh0GhBRgUWfAd1ut6RCyLwvx4AICyy6DIiwwKLHgEgLLDoMiLjAosOAiAss8g1IcLcrx4AECixyDUikwCLXgEQKLDINSKjAIs+AxAos8gxIrMAiywBLORkNSLTAIseARAssMgxIuMDCb0DiBZa75H1f0CkuIDCZTIACvK+h7mOjVB+drbun6BGCOspZYMHRQJXyIri5DBCzcMHnLLBQbvYOiDKAu8BCNfKOEWUAZ4GFauSdIsYAzt0u5cg7RYQB3AUW6nn/mBAGeF1Zxn1FGN6Ugmmvdh52j7PAgqOBmxAjwOu+IKre53Mx6zPu9wmJfX8AM3Z3NDNmADNmADNmADNmADNogP+BtvEwZgAvKzTgEwwufqMBSzC4+IU7YdzPr6ufBi2vhzXgJxjUzJ02hwfs/fg126WJRGuo+RbbvsCGxqoeXCAX1MhYlcMVcgGNTDb4B/qwn6e0vJh0bauY3kUG+5Va04tKDHwOX6T4DbhO5tR2eq9+b4FxiaLSEvYnDB9w5ajnLzy3z1aOtKIfAAAAAElFTkSuQmCC\" x=\"0\" y=\"0\" width=\"96\" height=\"96\" preserveAspectRatio=\"xMidYMid meet\"/>"}};
    const FALLBACK_ICON = {"viewBox":"0 0 24 24","inner":"<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\" /><path d=\"M20 2v4\" /><path d=\"M22 4h-4\" /><circle cx=\"4\" cy=\"20\" r=\"2\" />"};

    /**
     * Brand rows in manifest order: the first keyword hit wins, exactly like
     * MineCodex's model-rules. Keywords avoid bare two-letter fragments that
     * would collide with provider ids ("hy" would match "hyphen").
     */
    const BRANDS = [
      { id: 'deepseek', keywords: ['deepseek'], icon: 'deepseek' },
      { id: 'anthropic', keywords: ['claude', 'anthropic'], icon: 'anthropic' },
      { id: 'gemini', keywords: ['gemini', 'gemma'], icon: 'gemini' },
      { id: 'grok', keywords: ['grok', 'xai'], icon: 'grok' },
      { id: 'mimo', keywords: ['mimo', 'xiaomi'], icon: 'xiaomimimo' },
      { id: 'kimi', keywords: ['kimi', 'moonshot'], icon: 'kimi' },
      { id: 'minimax', keywords: ['minimax'], icon: 'minimax' },
      { id: 'qwen', keywords: ['qwen', 'qwq'], icon: 'qwen' },
      { id: 'hunyuan', keywords: ['tencent', 'hunyuan', 'hy3', 'hy4'], icon: 'hunyuan' },
      { id: 'muse', keywords: ['muse', 'muse-spark'], icon: 'muse' },
      { id: 'zhipu', keywords: ['zhipu', 'chatglm', 'glm'], icon: 'zhipu' },
      { id: 'openai', keywords: ['openai', 'gpt', 'codex', 'o1', 'o3', 'o4'], icon: 'openai' },
    ];

    /**
     * Resolve the provider mark for one catalog entry.
     * @param {string} providerId - catalog provider id (`deepseek-official`, `opencode-go`, …).
     * @param {{id: string, name: string}} model - catalog model.
     * @returns {{viewBox: string, inner: string}} the icon markup.
     */
    function brandFor(providerId, model) {
      const haystack = `${providerId} ${model?.id ?? ''} ${model?.name ?? ''}`.toLowerCase();
      for (const brand of BRANDS) {
        if (brand.keywords.some((keyword) => haystack.includes(keyword))) {
          return ICONS[brand.icon] ?? FALLBACK_ICON;
        }
      }
      return FALLBACK_ICON;
    }

    /**
     * One monochrome brand mark. Brand art keeps its own fills when it has them;
     * single-color marks inherit `currentColor` from the wrapper.
     */
    function BrandIcon({ icon, size = 16, className }) {
      return h('svg', {
        className,
        width: size,
        height: size,
        viewBox: icon.viewBox,
        fill: 'currentColor',
        'aria-hidden': 'true',
        focusable: 'false',
        dangerouslySetInnerHTML: { __html: icon.inner },
      });
    }

    /**
     * Measure the widest model name at the list's 13px body size and turn it into
     * a menu content width, clamped to the native menu range. The two stages share
     * this width so the panel never jumps horizontally when drilling in.
     * @param {string[]} names - catalog model names.
     * @returns {number} content width in CSS pixels.
     */
    function menuContentWidth(names) {
      if (typeof document === 'undefined' || names.length === 0) return MENU_WIDTH_DEFAULT;
      const context = document.createElement('canvas').getContext('2d');
      const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
      if (context !== null) context.font = `400 13px ${family}`;
      let widest = 0;
      for (const name of names) {
        widest = Math.max(widest, context === null ? name.length * 7 : context.measureText(name).width);
      }
      return Math.round(clamp(widest + ROW_CHROME, MENU_WIDTH_MIN, MENU_WIDTH_MAX));
    }

    /** Native provider order: DeepSeek account, DeepSeek official, then catalog order. */
    function orderModelProviders(groups) {
      const rank = (id) => (id === 'deepseek-account' ? 0 : id === 'deepseek-official' ? 1 : 2);
      return [...groups].sort((left, right) => rank(left.id) - rank(right.id));
    }

    /** Clamp a number into [min, max]. */
    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Component
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * The composer model seat: two-stage panel over DSH's shared model directory.
     *
     * @param {object} props - slot owner share (`locked`), directory face
     *   (`available`, `directory`, `load`, `select`), locale seat (`t`) and the
     *   child-slot renderer (`renderSlot`).
     */
    function MineModelSelect({ locked, available, directory, load, select, t, renderSlot }) {
      const state = useSyncExternalStore(
        (listener) => directory.subscribe(listener),
        () => directory.getSnapshot(),
      );
      const [open, setOpen] = useState(false);
      const [stage, setStage] = useState('effort');
      const [listMounted, setListMounted] = useState(false);
      const [listLeaving, setListLeaving] = useState(false);
      const [query, setQuery] = useState('');
      const [highlightedIndex, setHighlightedIndex] = useState(null);
      const [selectionFocus, setSelectionFocus] = useState(false);
      const [previewIndex, setPreviewIndex] = useState(null);
      const [anchor, setAnchor] = useState(null);
      const [shellHeight, setShellHeight] = useState(0);
      const [ready, setReady] = useState(false);
      const [notice, setNotice] = useState(null);
      const lastActionRef = useRef('load');
      const sequenceRef = useRef(0);
      const rootRef = useRef(null);
      const triggerRef = useRef(null);
      const menuRef = useRef(null);
      const searchRef = useRef(null);
      const groupsRef = useRef(null);
      const effortRef = useRef(null);
      const listRef = useRef(null);
      const railRef = useRef(null);
      const itemRefs = useRef([]);
      const dragRef = useRef(null);
      const leaveTimerRef = useRef(0);
      const id = React.useId();
      const accountProviderName = t('provider.account');

      const groups = useMemo(
        () =>
          orderModelProviders(state.groups).map((group) => ({
            ...group,
            provider: {
              id: group.id,
              name: group.id === 'deepseek-account' ? accountProviderName : group.name,
            },
          })),
        [state.groups, accountProviderName],
      );
      const choices = useMemo(
        () =>
          groups.flatMap((group) =>
            group.models.map((model) => ({
              group,
              model,
              icon: brandFor(group.id, model),
              selection: {
                provider: group.id,
                model: model.id,
                ...(model.reasoning?.defaultEffort === undefined
                  ? {}
                  : { reasoningEffort: model.reasoning.defaultEffort }),
              },
            })),
          ),
        [groups],
      );
      const showSearch = choices.length > 4;
      const filteredGroups = useMemo(
        () =>
          groups
            .map((group) => ({
              ...group,
              models: primitives.rankByName(group.models, showSearch ? query.trim() : ''),
            }))
            .filter((group) => group.models.length > 0),
        [groups, query, showSearch],
      );
      const visibleModels = useMemo(
        () =>
          filteredGroups.flatMap((group) =>
            group.models.map((model) => ({ provider: group.id, model: model.id })),
          ),
        [filteredGroups],
      );
      const currentVisibleIndex = visibleModels.findIndex(
        (model) => model.provider === state.current?.provider && model.model === state.current?.model,
      );
      const activeModelIndex = Math.min(
        highlightedIndex ?? Math.max(0, currentVisibleIndex),
        visibleModels.length - 1,
      );
      const currentChoice =
        state.current === null
          ? undefined
          : choices.find(
              (choice) =>
                choice.selection.provider === state.current?.provider &&
                choice.selection.model === state.current?.model,
            );
      const reasoning = currentChoice?.model.reasoning;
      const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort;
      const effortLabel =
        currentChoice === undefined
          ? undefined
          : reasoning === undefined
            ? state.retainedEffort
            : effectiveEffort === undefined
              ? t('effort.providerDefault')
              : reasoning.efforts.find((level) => level.id === effectiveEffort)?.name ?? effectiveEffort;
      const effortChoices = useMemo(
        () =>
          reasoning === undefined
            ? []
            : [
                ...(reasoning.defaultEffort === undefined
                  ? [{ key: 'provider-default', effort: undefined, label: t('effort.providerDefault') }]
                  : []),
                ...reasoning.efforts.map((effort) => ({
                  key: `effort:${effort.id}`,
                  effort: effort.id,
                  label: effort.name,
                })),
              ],
        [reasoning, t],
      );
      const effortIndex = useMemo(() => {
        if (effortChoices.length === 0) return -1;
        const found = effortChoices.findIndex((choice) => choice.effort === effectiveEffort);
        return found >= 0 ? found : 0;
      }, [effortChoices, effectiveEffort]);
      const shownEffortIndex = clamp(previewIndex ?? effortIndex, 0, Math.max(0, effortChoices.length - 1));
      const shownEffort = effortChoices[shownEffortIndex];
      const shownEffortLabel = shownEffort?.label ?? effortLabel;
      const menuContentW = useMemo(
        () => menuContentWidth(choices.map((choice) => choice.model.name ?? '')),
        [choices],
      );
      const menuTotalW = menuContentW + 12;
      const { pending } = state;
      const busy = pending !== null;
      const waiting = currentChoice === undefined && state.status === 'loading';
      const modelLabel = waiting ? t('trigger.loading') : currentChoice?.model.name ?? t('trigger.fallback');
      const triggerLabel = effortLabel === undefined ? modelLabel : `${modelLabel} · ${effortLabel}`;
      const triggerAria = waiting
        ? t('trigger.loading')
        : currentChoice === undefined
          ? t('trigger.selectAria')
          : effortLabel === undefined
            ? t('trigger.aria', { model: modelLabel })
            : t('trigger.ariaEffort', { model: modelLabel, effort: effortLabel });

      const closeOutsideEnabled = open;
      useEffect(() => {
        if (!closeOutsideEnabled) return undefined;
        const closeOutside = (event) => {
          if (rootRef.current?.contains(event.target) === true) return;
          if (menuRef.current?.contains(event.target) === true) return;
          closeMenu();
        };
        document.addEventListener('mousedown', closeOutside);
        return () => document.removeEventListener('mousedown', closeOutside);
      });

      // Placement: the panel is bottom-anchored to the trigger and horizontally
      // centred on it (MineCodex), clamped into the viewport (DSH menu margin).
      const measureAnchor = React.useCallback(() => {
        const rect = triggerRef.current?.getBoundingClientRect();
        if (rect === undefined) return;
        setAnchor({
          left: rect.left,
          right: rect.right,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        });
      }, []);

      useLayoutEffect(() => {
        if (!open) {
          setAnchor(null);
          setReady(false);
          return undefined;
        }
        measureAnchor();
        window.addEventListener('scroll', measureAnchor, true);
        window.addEventListener('resize', measureAnchor);
        return () => {
          window.removeEventListener('scroll', measureAnchor, true);
          window.removeEventListener('resize', measureAnchor);
        };
      }, [open, measureAnchor]);

      // Measure whichever stage is mounted; the shell height follows it so the
      // 320ms height transition is a pure interpolation between two real sizes.
      useLayoutEffect(() => {
        if (!open) return undefined;
        const target = stage === 'model' ? listRef.current : effortRef.current;
        if (target === null) return undefined;
        let frame = 0;
        const measure = () => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            const element = stage === 'model' ? listRef.current : effortRef.current;
            if (element === null) return;
            const height = element.offsetHeight;
            if (height > 0) setShellHeight(height);
          });
        };
        measure();
        if (typeof ResizeObserver === 'undefined') return () => cancelAnimationFrame(frame);
        const observer = new ResizeObserver(measure);
        observer.observe(target);
        const timer = window.setTimeout(() => setReady(true), 40);
        return () => {
          cancelAnimationFrame(frame);
          observer.disconnect();
          window.clearTimeout(timer);
        };
      }, [open, stage, listMounted, query, groups.length, state.status]);

      // Sticky provider headings, same primitive the native list uses.
      useEffect(() => {
        const viewport = groupsRef.current;
        if (viewport === null) return undefined;
        return primitives.observeStickyMenuGroups(viewport);
      }, [available, open, stage, listMounted, filteredGroups]);

      // Keep a keyboard-driven highlight visible. Opening the list never scrolls:
      // MineCodex shows the list top first, so the selected row must not slide under
      // the sticky provider heading on entry.
      useLayoutEffect(() => {
        if (!open || stage !== 'model' || highlightedIndex === null) return;
        itemRefs.current[activeModelIndex]?.scrollIntoView({ block: 'nearest' });
      }, [open, stage, activeModelIndex, visibleModels, highlightedIndex]);

      useLayoutEffect(() => {
        if (!open || stage !== 'model') return;
        const viewport = groupsRef.current;
        if (viewport !== null) viewport.scrollTop = 0;
      }, [open, stage]);

      // Focus policy: the effort stage starts on the model row (Enter drills
      // in); the model stage starts in search, or on the current model.
      useLayoutEffect(() => {
        if (!open) return;
        if (stage === 'model') {
          if (showSearch) searchRef.current?.focus();
          else {
            const selected = menuRef.current?.querySelector('[role="menuitemradio"][aria-checked="true"]:not([disabled])');
            (selected ?? itemRefs.current.find((item) => item !== null && !item.disabled) ?? triggerRef.current)?.focus();
          }
          return;
        }
        // Opening always hands focus to the model row: Enter drills into the list and
        // Escape closes. Mouse users get no ring because the browser keeps :focus-visible off.
        itemRefs.current[0]?.focus();
      }, [open, stage, showSearch]);

      // Clear transient notices when the menu is reopened.
      useEffect(() => {
        if (!open) setNotice(null);
      }, [open]);

      if (!available) return null;

      const availableHeight = anchor === null ? 400 : Math.max(160, anchor.top - MENU_GAP - MENU_MARGIN - 12);
      // DSH 的菜单上限是 360px（原生 ModelSelect 的 max-height）；两个舞台共用该上限。
      const maxHeight = Math.min(360, availableHeight);
      // 与原生 ModelSelect 一致：右边缘对齐 chip，再钳进视口。
      const menuLeft = anchor === null ? -9999 : clamp(
        anchor.right - menuTotalW,
        MENU_MARGIN,
        Math.max(MENU_MARGIN, window.innerWidth - menuTotalW - MENU_MARGIN),
      );
      const menuBottom = anchor === null ? 0 : window.innerHeight - anchor.top + MENU_GAP;
      const effectiveShellHeight = Math.min(shellHeight, maxHeight);

      const loadIfNeeded = () => {
        lastActionRef.current = 'load';
        load();
      };

      const show = () => {
        setSelectionFocus(false);
        setQuery('');
        setHighlightedIndex(null);
        setNotice(null);
        setPreviewIndex(null);
        setStage('effort');
        setListMounted(false);
        setListLeaving(false);
        setShellHeight(0);
        setReady(false);
        setOpen(true);
        triggerRef.current?.focus();
        measureAnchor();
        loadIfNeeded();
      };

      function closeMenu(restoreFocus = false) {
        setOpen(false);
        setStage('effort');
        setListMounted(false);
        setListLeaving(false);
        setPreviewIndex(null);
        if (restoreFocus) queueMicrotask(() => triggerRef.current?.focus());
      }

      const closeAfterSelection = () => {
        setSelectionFocus(true);
        closeMenu(true);
      };

      const drillIntoModels = () => {
        setQuery('');
        setHighlightedIndex(null);
        setStage('model');
        setListMounted(true);
        setListLeaving(false);
      };

      const backToEffort = () => {
        setStage('effort');
        setListLeaving(true);
        window.clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = window.setTimeout(() => {
          setListMounted(false);
          setListLeaving(false);
        }, 200);
        queueMicrotask(() => itemRefs.current[0]?.focus());
      };

      const reload = () => loadIfNeeded();

      const reportFailure = (error) => {
        sequenceRef.current += 1;
        const text =
          error?.code === 'session/writer-held'
            ? t('error.sessionInUse')
            : t('error.action', { message: `${error?.code ?? 'error'}: ${error?.message ?? ''}`.trim() });
        setNotice({ text });
      };

      const submit = (selection) => {
        lastActionRef.current = 'select';
        setSelectionFocus(true);
        return select(selection).then((result) => {
          if (result === undefined) return result;
          if (result.ok) return result;
          reportFailure(result.error);
          return result;
        });
      };

      const choose = (choice) => {
        if (busy) return;
        if (state.current?.provider === choice.selection.provider && state.current?.model === choice.selection.model) {
          closeAfterSelection();
          return;
        }
        triggerRef.current?.focus();
        submit(choice.selection).then((result) => {
          if (result?.ok === true) closeAfterSelection();
        });
      };

      const commitEffort = (index) => {
        if (busy || state.current === null) return;
        const choice = effortChoices[index];
        if (choice === undefined) return;
        const nextEffort = choice.effort;
        const currentEffort = state.current.reasoningEffort ?? reasoning?.defaultEffort;
        if (nextEffort === currentEffort) return;
        submit({
          provider: state.current.provider,
          model: state.current.model,
          ...(nextEffort === undefined ? {} : { reasoningEffort: nextEffort }),
        });
      };

      const effortIndexFromX = (clientX, rect) => {
        if (effortChoices.length === 0) return -1;
        if (effortChoices.length === 1) return 0;
        const ratio = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
        return Math.round(ratio * (effortChoices.length - 1));
      };

      const onRailPointerDown = (event) => {
        if (busy || effortChoices.length === 0) return;
        const rail = railRef.current;
        if (rail === null) return;
        const rect = rail.getBoundingClientRect();
        const index = effortIndexFromX(event.clientX, rect);
        if (index < 0) return;
        event.preventDefault();
        rail.setPointerCapture?.(event.pointerId);
        dragRef.current = { rect, index, pointerId: event.pointerId, frame: 0, x: event.clientX };
        setPreviewIndex(index);
      };

      const onRailPointerMove = (event) => {
        const drag = dragRef.current;
        if (drag === null) return;
        drag.x = event.clientX;
        if (drag.frame !== 0) return;
        drag.frame = requestAnimationFrame(() => {
          const current = dragRef.current;
          if (current === null) return;
          current.frame = 0;
          const index = effortIndexFromX(current.x, current.rect);
          if (index >= 0) setPreviewIndex(index);
        });
      };

      const endRailDrag = (event, commit) => {
        const drag = dragRef.current;
        if (drag === null) return;
        if (drag.frame !== 0) cancelAnimationFrame(drag.frame);
        dragRef.current = null;
        railRef.current?.releasePointerCapture?.(event.pointerId);
        if (!commit) {
          setPreviewIndex(null);
          return;
        }
        const index = effortIndexFromX(event.clientX, drag.rect);
        setPreviewIndex(null);
        if (index >= 0) commitEffort(index);
      };

      const onRailKeyDown = (event) => {
        if (event.nativeEvent.isComposing) return;
        if (effortChoices.length === 0) return;
        const last = effortChoices.length - 1;
        const current = shownEffortIndex;
        let next = current;
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(last, current + 1);
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(0, current - 1);
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = last;
        else return;
        event.preventDefault();
        event.stopPropagation();
        if (next === current) return;
        setPreviewIndex(next);
        window.setTimeout(() => {
          setPreviewIndex(null);
          commitEffort(next);
        }, 140);
      };

      const moveFocus = (offset) => {
        const items = itemRefs.current.filter((item) => item !== null);
        if (items.length === 0) return;
        const active = items.findIndex((item) => item === document.activeElement);
        items[active === -1 ? (offset > 0 ? 0 : items.length - 1) : (active + offset + items.length) % items.length]?.focus();
      };

      const chooseHighlighted = () => {
        if (busy) return;
        const target = visibleModels[activeModelIndex];
        if (target === undefined) return;
        const choice = choices.find(
          (candidate) => candidate.selection.provider === target.provider && candidate.selection.model === target.model,
        );
        if (choice !== undefined) choose(choice);
      };

      const onRootKeyDown = (event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          if (stage === 'model') backToEffort();
          else closeMenu(true);
          return;
        }
        if (!open) return;
        if (stage === 'model' && showSearch && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
          event.preventDefault();
          if (!busy && visibleModels.length > 0) {
            setHighlightedIndex(
              (activeModelIndex + (event.key === 'ArrowDown' ? 1 : -1) + visibleModels.length) % visibleModels.length,
            );
            searchRef.current?.focus();
          }
          return;
        }
        if (stage === 'model' && showSearch && event.target instanceof HTMLInputElement && event.key === 'Enter') {
          event.preventDefault();
          chooseHighlighted();
          return;
        }
        if (event.key === 'Tab' && event.shiftKey && stage === 'effort') {
          event.preventDefault();
          closeMenu(true);
          return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          if (stage === 'effort') return;
          event.preventDefault();
          moveFocus(event.key === 'ArrowDown' ? 1 : -1);
        }
      };

      const onBlur = (event) => {
        const next = event.relatedTarget;
        // A busy round disables the row that holds focus, so the browser drops focus
        // to <body> (relatedTarget null). That is not the user leaving the panel.
        if (!(next instanceof Node)) return;
        if (rootRef.current?.contains(next) === true || menuRef.current?.contains(next) === true) return;
        if (open) closeMenu();
      };

      const renderModelLabel = (provider, model, placement, selected) =>
        h(
          'span',
          { 'data-provider-id': provider.id, 'data-model-id': model.id },
          typeof renderSlot === 'function'
            ? renderSlot('conversation.input.model.label', { provider, model, placement, selected }, { fallback: model.name })
            : model.name,
        );

      // ── effort stage ──────────────────────────────────────────────────────
      // MineCodex 的拇指半径修正：0% 时右移 12px、100% 时左移 12px，端点刻度同理。
      const RAIL_THUMB_RADIUS = 12;
      const railLeft = (progress) =>
        `calc(${progress}% + ${(RAIL_THUMB_RADIUS - (progress / 50) * RAIL_THUMB_RADIUS).toFixed(2)}px)`;
      const percent = effortChoices.length > 1 ? (shownEffortIndex / (effortChoices.length - 1)) * 100 : 100;
      const effortStage = h(
        'div',
        {
          ref: effortRef,
          className: 'vtmm_effort',
          'data-hidden': stage === 'model' ? '' : undefined,
          'data-vtmm-stage': 'effort',
        },
        effortChoices.length > 0
          ? h('div', { className: 'vtmm_effortValue' }, shownEffortLabel ?? '')
          : null,
        h(
          'button',
          {
            ref: (node) => {
              itemRefs.current[0] = node;
            },
            type: 'button',
            className: 'vtmm_modelRow',
            'aria-haspopup': 'menu',
            'aria-expanded': stage === 'model',
            'aria-label':
              effortLabel === undefined
                ? t('trigger.aria', { model: modelLabel })
                : t('trigger.ariaEffort', { model: modelLabel, effort: effortLabel }),
            disabled: busy,
            onClick: () => {
              if (stage === 'model') backToEffort();
              else drillIntoModels();
            },
          },
          h('span', { className: 'vtmm_modelRowName' }, currentChoice === undefined ? modelLabel : renderModelLabel(currentChoice.group.provider, currentChoice.model, 'menu', true)),
          h(primitives.IconChevronRightOutlineRegular, { className: 'vtmm_modelRowChevron', size: 12 }),
        ),
        effortChoices.length > 1
          ? h(
              'div',
              {
                ref: railRef,
                className: 'vtmm_rail',
                role: 'slider',
                tabIndex: 0,
                'aria-label': t('slider.aria'),
                'aria-valuemin': 0,
                'aria-valuemax': effortChoices.length - 1,
                'aria-valuenow': shownEffortIndex,
                'aria-valuetext': shownEffortLabel ?? '',
                'data-dragging': previewIndex === null ? undefined : '',
                onPointerDown: onRailPointerDown,
                onPointerMove: onRailPointerMove,
                onPointerUp: (event) => endRailDrag(event, true),
                onPointerCancel: (event) => endRailDrag(event, false),
                onKeyDown: onRailKeyDown,
              },
              h(
                'div',
                { className: 'vtmm_track' },
                h('div', { className: 'vtmm_fill', style: { width: `${percent}%` } }),
              ),
              effortChoices.map((choice, index) => {
                const tickPercent = effortChoices.length > 1 ? (index / (effortChoices.length - 1)) * 100 : 100;
                return h('span', {
                  key: choice.key,
                  className: 'vtmm_tick',
                  'data-passed': index <= shownEffortIndex ? '' : undefined,
                  style: { left: railLeft(tickPercent) },
                });
              }),
              h('div', { className: 'vtmm_thumb', style: { left: railLeft(percent) } }),
            )
          : reasoning !== undefined
            ? h('div', { className: 'vtmm_railHint' }, t('empty.efforts'))
            : null,
      );

      // ── model stage ───────────────────────────────────────────────────────
      let modelIndex = 0;
      const listStage = h(
        'div',
        {
          ref: listRef,
          className: 'vtmm_list',
          'data-leaving': listLeaving ? '' : undefined,
          'data-vtmm-stage': 'model',
          style: { maxHeight: `${Math.max(120, maxHeight)}px` },
        },
        h(
          'div',
          { className: 'vtmm_listHead' },
          h(
            'button',
            {
              type: 'button',
              className: 'vtmm_back',
              'aria-label': t('back.aria'),
              onClick: backToEffort,
            },
            h(primitives.IconChevronDownOutlineRegular, { size: 14, style: { transform: 'rotate(90deg)' } }),
          ),
          showSearch
            ? h(
                'div',
                { className: 'vtmm_searchRow' },
                h(primitives.Input, {
                  ref: searchRef,
                  className: query !== '' ? 'vtmm_search vtmm_searchWithQuery' : 'vtmm_search',
                  type: 'text',
                  role: 'searchbox',
                  'aria-label': t('search.placeholder'),
                  'aria-controls': `${id}-models`,
                  'aria-activedescendant': activeModelIndex < 0 ? undefined : `${id}-model-${activeModelIndex}`,
                  placeholder: t('search.placeholder'),
                  value: query,
                  readOnly: busy,
                  onChange: (event) => {
                    setQuery(event.target.value);
                    setHighlightedIndex(0);
                  },
                }),
                query !== ''
                  ? h(
                      'button',
                      {
                        type: 'button',
                        className: 'vtmm_searchClear',
                        'aria-label': t('search.clear'),
                        disabled: busy,
                        onClick: () => {
                          setQuery('');
                          searchRef.current?.focus();
                        },
                      },
                      h(primitives.IconCloseFillRegular, {}),
                    )
                  : null,
              )
            : h('div', { className: 'vtmm_searchRow' }),
        ),
        notice !== null
          ? h(
              'div',
              { className: 'vtmm_error', role: 'status' },
              h('span', { children: notice.text }),
              h(
                'button',
                { type: 'button', className: 'vtmm_retry', onClick: () => setNotice(null) },
                t('dismiss'),
              ),
            )
          : null,
        state.status === 'loading'
          ? h('div', { className: 'vtmm_status' }, t('status.loading'))
          : null,
        state.error !== null && lastActionRef.current === 'load'
          ? h(
              'div',
              { className: 'vtmm_error' },
              h('span', { children: t('error.action', { message: state.error }) }),
              h('button', { type: 'button', className: 'vtmm_retry', onClick: reload }, t('retry')),
            )
          : null,
        state.failures.map((failure) =>
          h(
            'div',
            { className: 'vtmm_warning', key: failure.id },
            h('span', {
              children: t('warning.groupLoad', {
                name: failure.id === 'deepseek-account' ? t('provider.account') : failure.name,
                message: failure.message,
              }),
            }),
            h('button', { type: 'button', className: 'vtmm_retry', onClick: reload }, t('retry')),
          ),
        ),
        h(
          'div',
          {
            ref: groupsRef,
            id: `${id}-models`,
            className: 'vtmm_groups scrollable',
            role: 'menu',
            'aria-label': t('menu.model'),
            hidden: filteredGroups.length === 0,
          },
          filteredGroups.map((group) =>
            h(
              primitives.MenuGroup,
              { key: group.id, label: group.provider.name },
              group.models.map((model) => {
                const index = modelIndex;
                modelIndex += 1;
                const selected = state.current?.provider === group.id && state.current?.model === model.id;
                const active = index === activeModelIndex;
                const icon = brandFor(group.id, model);
                return h(
                  'button',
                  {
                    key: model.id,
                    ref: (node) => {
                      itemRefs.current[index + 1] = node;
                    },
                    type: 'button',
                    role: 'menuitemradio',
                    'aria-checked': selected,
                    id: `${id}-model-${index}`,
                    tabIndex: showSearch ? -1 : 0,
                    onFocus: () => setHighlightedIndex(index),
                    'data-active': active ? '' : undefined,
                    title: model.name,
                    disabled: busy,
                    className: 'vtmm_option',
                    onMouseMove: busy || active
                      ? undefined
                      : () => {
                          if (showSearch) setHighlightedIndex(index);
                          else itemRefs.current[index + 1]?.focus();
                        },
                    onClick: () => {
                      choose(choices.find((choice) => choice.selection.provider === group.id && choice.selection.model === model.id));
                    },
                  },
                  h(BrandIcon, { icon, size: 16, className: 'vtmm_brand' }),
                  h(
                    'span',
                    { className: 'vtmm_optionCopy' },
                    h('span', { className: 'vtmm_modelName' }, renderModelLabel(group.provider, model, 'option', selected)),
                  ),
                  h(
                    'span',
                    { className: 'vtmm_check' },
                    pending?.provider === group.id && pending.model === model.id
                      ? h(primitives.StateDot, { state: 'ongoing' })
                      : selected
                        ? h(primitives.IconCheckOutlineRegular, {})
                        : null,
                  ),
                );
              }),
            ),
          ),
        ),
        state.status === 'ready' && filteredGroups.length === 0
          ? h(
              'div',
              { className: 'vtmm_empty', role: 'status' },
              t(choices.length === 0 ? 'empty.models' : 'search.empty'),
            )
          : null,
      );

      // ── menu ─────────────────────────────────────────────────────────────
      const menu =
        open && anchor !== null
          ? ReactDOM.createPortal(
              h(
                primitives.MenuSurface,
                {
                  ref: menuRef,
                  id: `${id}-menu`,
                  className: 'vtmm_menu',
                  'data-ready': ready ? '' : undefined,
                  'data-vt-mine-models': VERSION,
                  style: {
                    left: `${menuLeft}px`,
                    bottom: `${menuBottom}px`,
                    width: `${menuContentW}px`,
                  },
                  role: stage === 'model' ? 'menu' : 'dialog',
                  'aria-label': t('menu.aria'),
                  onBlur,
                  onMouseDown: (event) => {
                    if (event.target instanceof Element && event.target.closest('button') !== null) event.preventDefault();
                  },
                },
                h(
                  'div',
                  {
                    className: 'vtmm_shell',
                    style: { height: `${effectiveShellHeight}px` },
                  },
                  effortStage,
                  listMounted ? listStage : null,
                ),
              ),
              document.body,
            )
          : null;

      return h(
        'div',
        {
          ref: rootRef,
          className: 'vtmm_root',
          'data-vt-mine-models': VERSION,
          onKeyDown: onRootKeyDown,
          onBlur,
        },
        h(
          'button',
          {
            ref: triggerRef,
            type: 'button',
            className: 'vtmm_trigger',
            'aria-label': triggerAria,
            'aria-haspopup': 'menu',
            'aria-expanded': open,
            'aria-controls': open ? `${id}-menu` : undefined,
            title: triggerLabel,
            'aria-busy': busy,
            'data-selection-focus': selectionFocus ? '' : undefined,
            disabled: locked,
            onBlur: () => setSelectionFocus(false),
            onClick: () => {
              if (open) closeMenu(true);
              else show();
            },
          },
          h(primitives.IconDataOutlineRegular, { size: 16, className: 'vtmm_triggerIcon' }),
          h(
            'span',
            { className: 'vtmm_triggerLabel' },
            currentChoice === undefined ? modelLabel : renderModelLabel(currentChoice.group.provider, currentChoice.model, 'trigger', true),
          ),
          effortLabel !== undefined ? h('span', { className: 'vtmm_triggerEffort' }, effortLabel) : null,
          busy
            ? h(primitives.StateDot, { state: 'ongoing' })
            : h(primitives.IconChevronDownOutlineRegular, {
                className: open ? 'vtmm_chevron vtmm_chevronOpen' : 'vtmm_chevron',
              }),
        ),
        menu,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Localization
    // ─────────────────────────────────────────────────────────────────────────

    const zh = {
      'provider.account': 'DeepSeek 账号',
      'trigger.fallback': '请选择模型',
      'trigger.loading': '正在加载模型…',
      'trigger.selectAria': '请选择模型',
      'trigger.aria': '选择模型，当前 {model}',
      'trigger.ariaEffort': '选择模型，当前 {model}，推理等级 {effort}',
      'menu.aria': '模型与推理等级',
      'menu.model': '模型',
      'slider.aria': '思考强度',
      'back.aria': '返回思考强度',
      'dismiss': '知道了',
      'effort.providerDefault': 'Default',
      'status.loading': '正在刷新模型列表…',
      'error.action': '模型操作失败：{message}',
      'error.sessionInUse': '当前会话已被占用，可能是其他正在运行的 DSH 导致的（如其他 dsh web、桌面端），请退出其他正在运行的 DSH 后重试。',
      'retry': '重试',
      'warning.groupLoad': '{name} 加载失败：{message}',
      'search.placeholder': '搜索模型…',
      'search.clear': '清除搜索',
      'search.empty': '没有匹配的模型。',
      'empty.models': '暂无可用模型',
      'empty.efforts': '当前模型没有可调的思考强度',
    };
    const en = {
      'provider.account': 'DeepSeek Account',
      'trigger.fallback': 'Select model',
      'trigger.loading': 'Loading models…',
      'trigger.selectAria': 'Select model',
      'trigger.aria': 'Select model, current {model}',
      'trigger.ariaEffort': 'Select model, current {model}, reasoning effort {effort}',
      'menu.aria': 'Model and reasoning effort',
      'menu.model': 'Model',
      'slider.aria': 'Reasoning effort',
      'back.aria': 'Back to reasoning effort',
      'dismiss': 'Dismiss',
      'effort.providerDefault': 'Default',
      'status.loading': 'Refreshing model list…',
      'error.action': 'Model operation failed: {message}',
      'error.sessionInUse': 'This session is already in use, possibly by another running DSH instance (such as dsh web or the desktop app). Quit other running DSH instances and try again.',
      'retry': 'Retry',
      'warning.groupLoad': '{name} failed to load: {message}',
      'search.placeholder': 'Search models…',
      'search.clear': 'Clear search',
      'search.empty': 'No matching models.',
      'empty.models': 'No models available',
      'empty.efforts': 'This model has no adjustable reasoning effort',
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Plugin body
    // ─────────────────────────────────────────────────────────────────────────

    const inject = ['slots', 'locale', 'modelDirectories', 'sessions', 'remote', 'remote.session'];

    /**
     * Register the two-stage seat. It shadows the stock ModelSelect in the
     * `single` slot by priority (-1 renders over the default 0), which keeps
     * this plugin additive: disabling it restores the stock picker untouched.
     *
     * @param {object} ctx - client root context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), `${PLUGIN_ID}: dictionaries`);
      ctx.inject(['slots', 'modelDirectories', 'sessions', 'remote', 'remote.session'], (scope) => {
        const models = scope.modelDirectories;
        const sessions = scope.sessions;
        scope.slots.inject('conversation.input.model', () =>
          scope.slots.register(
            {
              name: 'conversation.input.model',
              priority: -1,
              locale: NS,
              inject: (sessionId) => {
                const directory = models.directoryFor(sessionId);
                const available = sessions.subagentAddress(sessionId) === undefined;
                return {
                  available,
                  directory: directory.store,
                  load: () => {
                    if (available) directory.load().catch(() => {});
                  },
                  select: (selection) => (available ? directory.select(selection) : Promise.resolve(undefined)),
                };
              },
            },
            MineModelSelect,
          ),
        );
      });
      ctx.effect(() => {
        const marker = { version: VERSION, plugin: PLUGIN_ID };
        window.__vtMineModels = marker;
        return () => {
          if (window.__vtMineModels === marker) delete window.__vtMineModels;
        };
      }, `${PLUGIN_ID}: marker`);
    }

    return { apply, inject };
  },
});
