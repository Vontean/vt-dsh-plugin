/**
 * dsh-mcx-prompt-preset — client half.
 *
 * ── 它解决什么问题 ───────────────────────────────────────────────────────────
 * MineCodex 在 Codex 输入框旁放了一个提示词按钮。本插件把同样的能力接进 DSH：
 *   1. 在输入框工具行的「+」与审查模式之间注入一个 28×28 的圆形按钮；
 *   2. 点击后在上方弹出可搜索的提示词浮层，选中即把正文填进当前草稿；
 *   3. 在侧边栏注册「提示词库」整页，用来浏览、搜索与增删改同一批提示词。
 *
 * ── 为什么按钮是 DOM 注入而不是槽位 ──────────────────────────────────────────
 * DSH 只提供 `conversation.input.left`（位于审查模式之后）。要落在「+ 右侧、
 * 审查模式左侧」，只能在 `.tools` 行里自己插一个节点。因此这里注册一个渲染
 * 隐形锚点的槽位条目，再以锚点为起点把按钮插到 `.modes`（审查模式容器）之前：
 * 锚点由 React 渲染，位置永远正确；按钮被重渲染冲掉时观察者会按锚点补回。
 *
 * ── 样式从哪来 ───────────────────────────────────────────────────────────────
 * 尺寸、圆角、hover 与配色全部照抄 `.add`（+ 按钮）的规则：28×28、radius 999px、
 * `--dsw-specific-selector` 底色、`--dsw-alias-interactive-bg-hover-solid` 悬停；
 * 图标沿用 DSH 的 16 视图框 + 1.25 描边口径，只有图形取自 MCX 的书本轮廓。
 */

window.__ModuleLoader__.load({
  id: 'dsh-mcx-prompt-preset',
  factory(require) {
    'use strict';

    const React = require('react');
    const h = React.createElement;
    window.__mcxppLoaded = '0.1.0';

    /** 插件标识（与 package.json 的 name 一致）。 */
    const PLUGIN_ID = 'dsh-mcx-prompt-preset';
    /** 与 package.json 的 version 保持一致。 */
    const VERSION = '0.1.0';
    /** 文案命名空间。 */
    const NS = 'mcx-prompt-preset';
    /** Host 路由前缀，与 index.js 的 ROUTE_PREFIX 必须一致。 */
    const API_PREFIX = '/mcx-prompt-preset/api';
    /** 侧边栏条目 id 与 main 面板 key，两者必须相同。 */
    const PANEL_ID = 'mcx-prompt-preset';
    /** 隐形锚点属性：React 渲染，DOM 注入据此定位。 */
    const ANCHOR = 'data-mcxpp-anchor';

    const zh = {
      entry: '提示词库',
      'quick.title': '提示词库',
      'quick.manage': '管理',
      'quick.empty': '还没有提示词',
      'quick.loading': '加载中…',
      'quick.unavailable': '未找到 MineCodex 提示词库',
      'quick.hint': '点击填入输入框',
      'section.recent': '最近使用',
      'tab.all': '全部',
      'tab.other': '其他',
      'title.quick': '打开提示词库',
      'title.panel': '提示词库',
      subtitle: '来自 MineCodex 的提示词',
      'action.new': '新建提示词',
      'action.copy': '复制',
      'action.edit': '编辑',
      'action.delete': '删除',
      'action.save': '保存',
      'action.cancel': '取消',
      'action.close': '关闭',
      'action.retry': '重试',
      'action.manageCategories': '编辑分类',
      'action.insert': '填入输入框',
      'search.placeholder': '搜索标题或正文',
      'sort.recent': '最近使用',
      'sort.created': '创建时间',
      'sort.title': '标题',
      'view.list': '列表视图',
      'view.card': '卡片视图',
      loading: '加载中…',
      'empty.all': '还没有提示词。新建一条，或在 MineCodex 里添加。',
      'empty.filtered': '没有匹配的提示词。',
      'empty.category': '这个分类下还没有提示词。',
      'unavailable.title': '还没有找到提示词库',
      'unavailable.body': '本机没有 MineCodex 的提示词数据。先在 MineCodex 中保存一条提示词，再回来重试。',
      'editor.create': '新建提示词',
      'editor.update': '编辑提示词',
      'editor.title': '标题',
      'editor.titlePlaceholder': '给这条提示词起个名字（可留空）',
      'editor.body': '正文',
      'editor.bodyPlaceholder': '输入提示词正文…',
      'editor.category': '分类',
      'editor.emoji': 'Emoji',
      'editor.emojiHint': '留空则使用分类图标',
      'editor.uncategorized': '未分类',
      'editor.titleRequired': '标题和正文至少填一项。',
      'editor.bodyRequired': '正文不能为空。',
      'categories.title': '编辑分类',
      'categories.new': '新建分类',
      'categories.name': '名称',
      'categories.icon': '图标',
      'categories.color': '颜色',
      'categories.delete': '删除分类',
      'categories.deleteHint': '删除分类后，其中的提示词变为未分类。',
      'toast.copied': '已复制到剪贴板',
      'toast.saved': '已保存',
      'toast.updated': '已更新',
      'toast.deleted': '已删除',
      'toast.inserted': '已填入输入框',
      'toast.noComposer': '当前没有可填入的输入框，已复制到剪贴板',
      'confirm.delete': '删除后不可恢复，确认删除？',
      'confirm.yes': '删除',
      'count': '{n} 条',
    };

    const en = {
      entry: 'Prompt Preset',
      'quick.title': 'Prompt library',
      'quick.manage': 'Manage',
      'quick.empty': 'No prompts yet',
      'quick.loading': 'Loading…',
      'quick.unavailable': 'MineCodex prompt library not found',
      'quick.hint': 'Click to fill the draft',
      'section.recent': 'Recently used',
      'tab.all': 'All',
      'tab.other': 'Other',
      'title.quick': 'Open the prompt library',
      'title.panel': 'Prompt Preset',
      subtitle: 'Prompts from MineCodex',
      'action.new': 'New prompt',
      'action.copy': 'Copy',
      'action.edit': 'Edit',
      'action.delete': 'Delete',
      'action.save': 'Save',
      'action.cancel': 'Cancel',
      'action.close': 'Close',
      'action.retry': 'Retry',
      'action.manageCategories': 'Edit categories',
      'action.insert': 'Fill the draft',
      'search.placeholder': 'Search title or body',
      'sort.recent': 'Recently used',
      'sort.created': 'Date created',
      'sort.title': 'Title',
      'view.list': 'List view',
      'view.card': 'Card view',
      loading: 'Loading…',
      'empty.all': 'No prompts yet. Create one here, or add them in MineCodex.',
      'empty.filtered': 'No prompt matches.',
      'empty.category': 'This category is empty.',
      'unavailable.title': 'Prompt library not found',
      'unavailable.body': 'No MineCodex prompt data on this machine. Save one prompt in MineCodex, then retry.',
      'editor.create': 'New prompt',
      'editor.update': 'Edit prompt',
      'editor.title': 'Title',
      'editor.titlePlaceholder': 'Name this prompt (optional)',
      'editor.body': 'Body',
      'editor.bodyPlaceholder': 'Write the prompt…',
      'editor.category': 'Category',
      'editor.emoji': 'Emoji',
      'editor.emojiHint': 'Empty uses the category icon',
      'editor.uncategorized': 'Uncategorized',
      'editor.titleRequired': 'Fill in a title or a body.',
      'editor.bodyRequired': 'Body cannot be empty.',
      'categories.title': 'Edit categories',
      'categories.new': 'New category',
      'categories.name': 'Name',
      'categories.icon': 'Icon',
      'categories.color': 'Color',
      'categories.delete': 'Delete category',
      'categories.deleteHint': 'Prompts in a deleted category become uncategorized.',
      'toast.copied': 'Copied to clipboard',
      'toast.saved': 'Saved',
      'toast.updated': 'Updated',
      'toast.deleted': 'Deleted',
      'toast.inserted': 'Filled the draft',
      'toast.noComposer': 'No composer to fill — copied to clipboard',
      'confirm.delete': 'This cannot be undone. Delete it?',
      'confirm.yes': 'Delete',
      'count': '{n} prompts',
    };

    // ───────────────────────────── 数据访问 ─────────────────────────────

    /**
     * 调用 Host 的一个方法。
     * @param method - 方法名，对应 index.js 的 api 键。
     * @param payload - 请求体。
     * @returns Host 返回的 value。
     */
    async function call(method, payload) {
      const response = await fetch(`${API_PREFIX}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
      });
      const body = await response.json().catch(() => undefined);
      if (body?.ok !== true) {
        const error = new Error(body?.error?.message ?? `Request failed (${response.status})`);
        error.code = body?.error?.code;
        throw error;
      }
      return body.value;
    }

    /** 分类图标只取一次。 */
    let iconsPromise = null;
    function loadIcons() {
      if (iconsPromise === null) {
        iconsPromise = call('assets')
          .then((value) => value?.icons ?? {})
          .catch(() => ({}));
      }
      return iconsPromise;
    }

    // ───────────────────────────── 图标 ─────────────────────────────

    /** DSH 口径：16 视图框、1.25 描边、圆角连接。 */
    function outlineSvg(children, size) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        children,
      );
    }

    const STROKE = { stroke: 'currentColor', strokeWidth: 1.25, strokeLinecap: 'round', strokeLinejoin: 'round' };

    /** 书本图标：轮廓取自 MCX 的 book-open，按 DSH 的 16/1.25 口径重绘。 */
    function BookGlyph({ size = 16 }) {
      return outlineSvg(
        h('g', { transform: 'scale(0.666667)', strokeWidth: 1.875, stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' },
          h('path', { d: 'M12 7v14' }),
          h('path', {
            d: 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z',
          }),
        ),
        size,
      );
    }

    /** 页面里用到的小图标。 */
    function Glyph({ name, size = 16 }) {
      const paths = {
        search: [h('circle', { key: 'c', cx: 7, cy: 7, r: 4.25, ...STROKE }), h('path', { key: 'l', d: 'M10.2 10.2l3.1 3.1', ...STROKE })],
        plus: [h('path', { key: 'p', d: 'M8 3.2v9.6M3.2 8h9.6', ...STROKE })],
        edit: [
          h('path', { key: 'p', d: 'M11.1 2.9l2 2-7.5 7.5-2.7.7.7-2.7z', ...STROKE }),
        ],
        trash: [
          h('path', { key: 'a', d: 'M2.9 4.4h10.2', ...STROKE }),
          h('path', { key: 'b', d: 'M6.3 4.4V3.1h3.4v1.3', ...STROKE }),
          h('path', { key: 'c', d: 'M4.3 4.4l.6 8.5h6.2l.6-8.5', ...STROKE }),
        ],
        copy: [
          h('rect', { key: 'a', x: 5.6, y: 2.6, width: 7.2, height: 7.2, rx: 1.6, ...STROKE }),
          h('path', { key: 'b', d: 'M10.4 12.1v.6a1.6 1.6 0 0 1-1.6 1.6H4.2a1.6 1.6 0 0 1-1.6-1.6V8.4a1.6 1.6 0 0 1 1.6-1.6', ...STROKE }),
        ],
        list: [
          h('path', { key: 'a', d: 'M5.6 4.2h8M5.6 8h8M5.6 11.8h8', ...STROKE }),
          h('path', { key: 'b', d: 'M2.6 4.2h.01M2.6 8h.01M2.6 11.8h.01', strokeWidth: 1.75, stroke: 'currentColor', strokeLinecap: 'round' }),
        ],
        card: [
          h('rect', { key: 'a', x: 2.4, y: 2.4, width: 4.8, height: 4.8, rx: 1.2, ...STROKE }),
          h('rect', { key: 'b', x: 8.8, y: 2.4, width: 4.8, height: 4.8, rx: 1.2, ...STROKE }),
          h('rect', { key: 'c', x: 2.4, y: 8.8, width: 4.8, height: 4.8, rx: 1.2, ...STROKE }),
          h('rect', { key: 'd', x: 8.8, y: 8.8, width: 4.8, height: 4.8, rx: 1.2, ...STROKE }),
        ],
        close: [h('path', { key: 'a', d: 'M4 4l8 8M12 4l-8 8', ...STROKE })],
        settings: [
          h('circle', { key: 'a', cx: 8, cy: 8, r: 2.1, ...STROKE }),
          h('path', { key: 'b', d: 'M8 2.2v1.4M8 12.4v1.4M2.2 8h1.4M12.4 8h1.4M3.9 3.9l1 1M11.1 11.1l1 1M12.1 3.9l-1 1M4.9 11.1l-1 1', ...STROKE }),
        ],
      };
      return outlineSvg(paths[name] ?? paths.plus, size);
    }

    // ───────────────────────────── 样式 ─────────────────────────────

    const CSS = `
[data-mcxpp-button]{corner-shape:round;background:var(--mcxpp-base,transparent);width:28px;height:28px;color:var(--dsw-alias-label-primary);border:none;border-radius:999px;flex:none;display:grid;place-items:center;cursor:pointer;padding:0;transition:background-color .1s}
[data-mcxpp-button]:hover:not(:disabled),[data-mcxpp-button]:focus-visible,[data-mcxpp-button][aria-expanded="true"]{background:var(--mcxpp-hover,var(--dsw-alias-interactive-bg-hover))}
[data-mcxpp-button]:disabled{opacity:.5;cursor:default}
.mcxpp-pop{position:fixed;z-index:2147482000;display:flex;flex-direction:column;width:min(420px,calc(100vw - 24px));max-height:min(460px,calc(100vh - 160px));background:var(--dsw-specific-menu);border-radius:20px;box-shadow:var(--dsw-elevation-prominent);padding:4px;overflow:hidden;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);box-sizing:border-box}
.mcxpp-pop-head{display:flex;flex:none;align-items:center;gap:8px;padding:6px 8px 4px}
.mcxpp-pop-title{font-weight:600;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mcxpp-pop-link{border:0;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;padding:2px 6px;border-radius:6px;cursor:pointer;flex:none}
.mcxpp-pop-link:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.mcxpp-tabs{display:flex;flex:none;gap:2px;padding:0 4px 4px;overflow-x:auto;scrollbar-width:none}
.mcxpp-tabs::-webkit-scrollbar{display:none}
.mcxpp-tab{border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:20px;padding:4px 8px;border-radius:8px;cursor:pointer;white-space:nowrap;flex:none}
.mcxpp-tab:hover{background:var(--dsw-alias-interactive-bg-hover)}
.mcxpp-tab[aria-selected="true"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font-weight:500}
.mcxpp-scroll{overflow-y:auto;min-height:0;flex:1;padding:0 2px 2px}
.mcxpp-sec{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;padding:8px 8px 4px;font-weight:500}
.mcxpp-row{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;color:inherit;text-align:left;padding:6px 8px;border-radius:8px;cursor:pointer;font:inherit}
.mcxpp-row:hover,.mcxpp-row:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.mcxpp-row-main{display:flex;flex-direction:column;min-width:0;flex:1;gap:1px}
.mcxpp-row-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mcxpp-row-preview{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mcxpp-mark{width:16px;height:16px;flex:none;display:grid;place-items:center;color:var(--dsw-alias-label-secondary)}
.mcxpp-mark svg{width:16px;height:16px;display:block}
.mcxpp-empty{padding:18px 8px;color:var(--dsw-alias-label-tertiary);font-size:12px;text-align:center}
.mcxpp-error{padding:10px 8px;color:var(--dsw-alias-state-error-primary);font-size:12px;text-align:center}
.mcxpp-foot{flex:none;padding:4px 8px 2px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;display:flex;align-items:center;gap:6px}
.mcxpp-page{display:flex;flex-direction:column;height:100%;min-height:0;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
.mcxpp-page-inner{width:100%;max-width:880px;margin:0 auto;padding:28px 28px 24px;display:flex;flex-direction:column;min-height:0;flex:1;gap:0;box-sizing:border-box}
.mcxpp-page-head{display:flex;align-items:flex-start;gap:16px;justify-content:space-between;flex:none}
.mcxpp-h1{font-size:20px;line-height:28px;font-weight:600;margin:0}
.mcxpp-sub{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin-top:2px}
.mcxpp-actions{display:flex;gap:8px;align-items:center;flex:none}
.mcxpp-field{display:flex;align-items:center;gap:6px;height:32px;padding:0 8px;border-radius:10px;border:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);box-sizing:border-box;background:transparent}
.mcxpp-field:focus-within{border-color:var(--dsw-alias-border-l2)}
.mcxpp-field input{border:0;outline:none;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;width:100%;padding:0}
.mcxpp-field input::placeholder{color:var(--dsw-alias-label-tertiary)}
.mcxpp-btn2{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:10px;border:0;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}
.mcxpp-btn2:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}
.mcxpp-btn2[disabled]{opacity:.5;cursor:default}
.mcxpp-btn2.primary{background:var(--dsw-alias-button-info-fill);color:#fff}
.mcxpp-btn2.primary:hover{opacity:.9}
.mcxpp-icon-btn{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.mcxpp-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.mcxpp-icon-btn[aria-pressed="true"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.mcxpp-toolbar{display:flex;align-items:center;gap:10px;padding:16px 0 10px;flex:none;flex-wrap:wrap}
.mcxpp-sort{height:32px;border-radius:10px;border:.5px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;padding:0 8px;cursor:pointer;outline:none}
.mcxpp-tabrow{display:flex;gap:4px;overflow-x:auto;padding:0 0 10px;flex:none;scrollbar-width:none}
.mcxpp-tabrow::-webkit-scrollbar{display:none}
.mcxpp-tab2{display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:20px;padding:5px 10px;border-radius:9px;cursor:pointer;white-space:nowrap;flex:none}
.mcxpp-tab2:hover{background:var(--dsw-alias-interactive-bg-hover)}
.mcxpp-tab2[aria-selected="true"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font-weight:500}
.mcxpp-tab2 svg{width:14px;height:14px}
.mcxpp-body{flex:1;min-height:0;overflow-y:auto;padding-bottom:24px}
.mcxpp-list{display:flex;flex-direction:column;gap:2px}
.mcxpp-item{display:flex;align-items:flex-start;gap:10px;padding:10px;border-radius:12px;border:0;background:transparent;text-align:left;cursor:pointer;color:inherit;font:inherit;width:100%}
.mcxpp-item:hover{background:var(--dsw-alias-interactive-bg-hover)}
.mcxpp-item-mark{width:24px;height:24px;flex:none;display:grid;place-items:center;border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);margin-top:1px}
.mcxpp-item-mark svg{width:15px;height:15px}
.mcxpp-item-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.mcxpp-item-title{font-size:13px;line-height:20px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mcxpp-item-body{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap}
.mcxpp-item-meta{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;margin-top:2px}
.mcxpp-item-actions{display:flex;gap:2px;opacity:0;transition:opacity .12s;flex:none}
.mcxpp-item:hover .mcxpp-item-actions,.mcxpp-item:focus-within .mcxpp-item-actions{opacity:1}
.mcxpp-ghost{display:grid;place-items:center;width:26px;height:26px;border-radius:8px;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.mcxpp-ghost:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.mcxpp-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
.mcxpp-card{display:flex;flex-direction:column;gap:6px;padding:12px;border-radius:14px;border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);cursor:pointer;text-align:left;color:inherit;font:inherit;min-height:112px}
.mcxpp-card:hover{border-color:var(--dsw-alias-border-l2)}
.mcxpp-card-head{display:flex;align-items:center;gap:8px}
.mcxpp-card-title{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.mcxpp-card-body{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;flex:1;white-space:pre-wrap}
.mcxpp-scrim{position:fixed;inset:0;background:rgba(12,14,18,.36);display:grid;place-items:center;z-index:2147482100;padding:24px}
.mcxpp-modal{width:min(560px,100%);max-height:100%;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);border-radius:20px;box-shadow:var(--dsw-elevation-prominent);overflow:hidden;color:var(--dsw-alias-label-primary)}
.mcxpp-modal.wide{width:min(640px,100%)}
.mcxpp-modal-head{display:flex;align-items:center;gap:10px;padding:16px 18px 10px;flex:none}
.mcxpp-modal-title{font-size:15px;line-height:22px;font-weight:600;flex:1}
.mcxpp-modal-body{padding:0 18px 4px;overflow-y:auto;display:flex;flex-direction:column;gap:12px;min-height:0}
.mcxpp-modal-foot{display:flex;justify-content:flex-end;gap:8px;padding:14px 18px 18px;flex:none}
.mcxpp-label{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);margin-bottom:4px;display:block}
.mcxpp-input,.mcxpp-textarea{width:100%;box-sizing:border-box;border-radius:10px;border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;padding:8px 10px;outline:none}
.mcxpp-input:focus,.mcxpp-textarea:focus{border-color:var(--dsw-alias-border-l2)}
.mcxpp-textarea{min-height:200px;resize:vertical;line-height:20px}
.mcxpp-hint{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;margin-top:4px}
.mcxpp-rowline{display:flex;gap:10px;align-items:flex-end}
.mcxpp-emoji{width:64px;text-align:center;font-size:18px}
.mcxpp-swatches{display:flex;gap:6px;flex-wrap:wrap}
.mcxpp-swatch{width:24px;height:24px;border-radius:999px;border:2px solid transparent;cursor:pointer;padding:0}
.mcxpp-swatch[aria-pressed="true"]{border-color:var(--dsw-alias-label-primary)}
.mcxpp-iconpick{display:grid;grid-template-columns:repeat(auto-fill,minmax(34px,1fr));gap:4px;max-height:120px;overflow-y:auto;padding:2px}
.mcxpp-iconpick button{display:grid;place-items:center;height:34px;border-radius:8px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.mcxpp-iconpick button:hover{background:var(--dsw-alias-interactive-bg-hover)}
.mcxpp-iconpick button[aria-pressed="true"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.mcxpp-iconpick svg{width:18px;height:18px}
.mcxpp-cats{display:flex;flex-direction:column;gap:6px}
.mcxpp-cat{display:flex;align-items:center;gap:8px;padding:6px;border-radius:10px}
.mcxpp-cat:hover{background:var(--dsw-alias-interactive-bg-hover)}
.mcxpp-cat-name{flex:1;min-width:0}
.mcxpp-state{padding:40px 0;text-align:center;color:var(--dsw-alias-label-tertiary)}
.mcxpp-state-title{color:var(--dsw-alias-label-primary);font-weight:600;margin-bottom:4px}
.mcxpp-toast{position:fixed;left:50%;bottom:32px;transform:translateX(-50%);background:var(--dsw-specific-menu);color:var(--dsw-alias-label-primary);border-radius:12px;box-shadow:var(--dsw-elevation-prominent);padding:8px 14px;font-size:12px;line-height:18px;z-index:2147482200;pointer-events:none}
`;

    function installStyles() {
      const style = document.createElement('style');
      style.setAttribute('data-mcxpp-style', '');
      style.textContent = CSS;
      document.head.append(style);
      return () => style.remove();
    }

    // ───────────────────────── 输入框注入 ─────────────────────────

    /** 由槽位里的桥接组件写入：填入草稿只能走官方 inputActions。 */
    const composer = {
      inputActions: null,
      draft: '',
    };

    /** 按钮与浮层的模块级句柄。 */
    const injection = {
      button: null,
      popover: null,
      data: null,
      category: 'all',
      icons: {},
      loading: false,
      error: null,
      requestSeq: 0,
      outsideHandler: null,
      reposition: null,
    };

    /**
     * 把正文追加到当前草稿。
     * @param text - 提示词正文。
     * @returns 是否成功写入。
     */
    function fillDraft(text) {
      const actions = composer.inputActions;
      if (actions === null || typeof actions.setDraft !== 'function') return false;
      const current = typeof composer.draft === 'string' ? composer.draft : '';
      const needsBreak = current !== '' && !/\s$/.test(current);
      actions.setDraft(current + (needsBreak ? '\n\n' : '') + text);
      return true;
    }

    /**
     * 生成提示词按钮。
     *
     * 几何与描边按 16 视图框直接写死（13px 图标 / 1.5 描边），与 UI Enhancer
     * 改造后的「+」一致；类名则在定位后从真实的「+」按钮复制，让任何针对
     * add 按钮的样式规则（包括 `_add$` 这类插件选择器）同样作用到这里。
     */
    function createButton() {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-mcxpp-button', '');
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-expanded', 'false');
      // 用 DOM 直接画图标：它不参与 React 树，被重渲染冲掉后仍可重插。
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '13');
      svg.setAttribute('height', '13');
      svg.setAttribute('viewBox', '0 0 16 16');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.5');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('aria-hidden', 'true');
      // book-open 轮廓取自 Lucide，按 16 视图框重算坐标（原图 24 视图框 ×2/3）。
      for (const d of [
        'M8 4.667v9.333',
        'M2 12a.667.667 0 0 1-.667-.667V2.667A.667.667 0 0 1 2 2h3.333A2.667 2.667 0 0 1 8 4.667 2.667 2.667 0 0 1 10.667 2H14a.667.667 0 0 1 .667.667v8.666A.667.667 0 0 1 14 12h-4a2 2 0 0 0-2 2 2 2 0 0 0-2-2z',
      ]) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        svg.append(path);
      }
      button.append(svg);
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => {
        if (injection.popover !== null) closePopover(true);
        else openPopover();
      });
      return button;
    }

    /**
     * 与「+」按钮对齐：读取它的计算结果，而不是复制它的类名。
     *
     * 这样两种环境都成立：
     *   · 装了 UI Enhancer：`+` 是透明底 + hover 才出底 + 13px/1.5 描边，
     *     我们照抄这套结果，并沿用它的 hover token；
     *   · 没装 Enhancer：`+` 是实心圆底 + 14px/1.25 描边，我们照抄那一套。
     *
     * 全部落在 CSS 变量上（`--mcxpp-base` / `--mcxpp-hover`），因为行内
     * `background` 会盖掉 `:hover` 规则，而自定义属性不会。
     */
    function adoptAddButtonLook() {
      const button = injection.button;
      if (button === null) return;
      const tools = document.querySelector('[class*="_tools"]');
      if (tools === null) return;
      const addButton = tools.querySelector('button');
      if (addButton === null || addButton === button) return;

      const source = getComputedStyle(addButton);
      const background = source.backgroundColor ?? '';
      const hollow = background === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(background);

      button.style.setProperty('--mcxpp-base', hollow ? 'transparent' : background);
      button.style.setProperty(
        '--mcxpp-hover',
        hollow ? 'var(--dsw-alias-interactive-bg-hover)' : 'var(--dsw-alias-interactive-bg-hover-solid)',
      );
      if (button.style.borderRadius !== source.borderRadius) button.style.borderRadius = source.borderRadius;
      const width = source.width;
      if (width !== '' && button.style.width !== width) {
        button.style.width = width;
        button.style.height = source.height;
      }

      const own = button.querySelector('svg');
      const sourceSvg = addButton.querySelector('svg');
      if (own === null || sourceSvg === null) return;
      // 取「计算值」而不是 width 属性：插件常用 CSS 改图标尺寸，属性会过期。
      const glyphBox = getComputedStyle(sourceSvg);
      const glyphWidth = glyphBox.width !== '' ? glyphBox.width : '14px';
      own.style.width = glyphWidth;
      own.style.height = glyphBox.height !== '' ? glyphBox.height : glyphWidth;
      // 描边按同一视觉重量换算：图标容器仍是 16 视图框。
      own.setAttribute('stroke-width', hollow ? '1.5' : '1.25');

    }

    /**
     * 找到工具行（`.tools`），以及「审查模式容器」（`.modes`）这个插入基准。
     *
     * 槽位会给每个条目包一层没有类名的 div，所以锚点本身不能直接用
     * `previousElementSibling`：要往上走两层才到工具行。类名带构建哈希
     * （`JZLxKW_tools`），因此只用后缀匹配作兜底，不写死具体哈希。
     */
    function locateSlot() {
      const anchor = document.querySelector(`[${ANCHOR}]`);
      if (anchor !== null) {
        const wrapper = anchor.parentElement;
        const tools = wrapper?.parentElement ?? null;
        if (tools !== null) {
          return { tools, before: wrapper.previousElementSibling, mode: 'anchor' };
        }
      }
      const tools = document.querySelector('[class*="_tools"]');
      if (tools !== null) {
        return { tools, before: tools.querySelector('[class*="_modes"]'), mode: 'class' };
      }
      return null;
    }

    /** 让按钮始终落在「+ 右侧、审查模式左侧」。 */
    function reconcileButton() {
      if (injection.button === null) injection.button = createButton();
      const button = injection.button;

      const slot = locateSlot();
      if (slot === null) return;

      const { tools, before } = slot;
      // 已经就位：按钮紧跟在同一基准之前。
      if (button.isConnected && button.nextElementSibling === before) return;
      if (before === null) {
        tools.append(button);
      } else {
        tools.insertBefore(button, before);
      }
      adoptAddButtonLook();
      applyButtonText();
    }

    /** 语言切换后重刷无障碍文案。 */
    function applyButtonText() {
      const label = translate('title.quick');
      if (injection.button !== null) {
        injection.button.setAttribute('aria-label', label);
        injection.button.setAttribute('title', label);
      }
      for (const node of document.querySelectorAll('[data-mcxpp-label]')) {
        node.textContent = translate(node.getAttribute('data-mcxpp-label'));
      }
    }

    /** 合并高频 DOM 变化，避免流式输出时每帧重插。 */
    let reconcileQueued = false;
    function scheduleReconcile() {
      if (reconcileQueued) return;
      reconcileQueued = true;
      requestAnimationFrame(() => {
        reconcileQueued = false;
        reconcileButton();
        if (injection.popover !== null) injection.reposition?.();
      });
    }

    // ───────────────────────────── 浮层 ─────────────────────────────

    /** 浮层锚点：按钮所在输入卡片的上沿。 */
    function anchorRect() {
      const button = injection.button;
      if (button === null) return null;
      const editor = document.querySelector('[contenteditable="true"]');
      let card = button.parentElement;
      while (card !== null && editor !== null && !card.contains(editor)) card = card.parentElement;
      const rect = (card ?? button).getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      return { card: rect, button: buttonRect };
    }

    function positionPopover() {
      const popover = injection.popover;
      if (popover === null) return;
      const anchor = anchorRect();
      if (anchor === null) return;
      const width = popover.offsetWidth;
      const height = popover.offsetHeight;
      const margin = 8;
      const left = Math.max(margin, Math.min(anchor.button.left, window.innerWidth - width - margin));
      const spaceAbove = anchor.card.top - margin * 2;
      const top = spaceAbove >= Math.min(height, 220)
        ? Math.max(margin, anchor.card.top - margin - height)
        : Math.min(window.innerHeight - height - margin, anchor.card.bottom + margin);
      popover.style.left = `${Math.round(left)}px`;
      popover.style.top = `${Math.round(top)}px`;
    }

    /** 分类图标：优先提示词自己的 Emoji，其次分类图标，最后默认书本。 */
    function markNode(item) {
      const mark = document.createElement('span');
      mark.className = 'mcxpp-mark';
      if (item.emoji) {
        mark.textContent = item.emoji;
        return mark;
      }
      const category = (injection.data?.categories ?? []).find((entry) => entry.id === item.categoryId);
      const svg = category === undefined ? undefined : injection.icons[category.icon];
      if (typeof svg === 'string') {
        mark.innerHTML = svg;
        return mark;
      }
      mark.textContent = '·';
      return mark;
    }

    function sectionTitle(text) {
      const node = document.createElement('div');
      node.className = 'mcxpp-sec';
      node.textContent = text;
      return node;
    }

    function promptRow(item) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'mcxpp-row';
      row.append(markNode(item));
      const main = document.createElement('span');
      main.className = 'mcxpp-row-main';
      const title = document.createElement('span');
      title.className = 'mcxpp-row-title';
      title.textContent = item.summary;
      main.append(title);
      if (item.title && item.body) {
        const preview = document.createElement('span');
        preview.className = 'mcxpp-row-preview';
        preview.textContent = item.body.replace(/\s+/g, ' ');
        main.append(preview);
      }
      row.append(main);
      row.addEventListener('click', () => {
        void usePrompt(item);
      });
      return row;
    }

    /**
     * 点击一条提示词：填入草稿后关闭，并记一次使用。
     * @param item - 提示词记录。
     */
    async function usePrompt(item) {
      const filled = fillDraft(item.body);
      closePopover(true);
      if (!filled) {
        try {
          await navigator.clipboard.writeText(item.body);
        } catch {
          /* 剪贴板不可用时静默降级 */
        }
      }
      try {
        await call('markUsed', { id: item.id, action: filled ? 'insert' : 'copy' });
      } catch {
        /* 使用计数失败不影响填入结果 */
      }
    }

    /** 按当前分类与搜索词组织出的区块。 */
    function sections() {
      const data = injection.data;
      const prompts = data?.prompts ?? [];
      const categories = data?.categories ?? [];
      const recent = prompts
        .filter((item) => item.useCount > 0)
        .sort((a, b) => (b.calledAt ?? 0) - (a.calledAt ?? 0))
        .slice(0, 3);
      const groups = [
        { id: 'recent', name: translate('section.recent'), prompts: recent },
        ...categories.map((category) => ({
          id: category.id,
          name: category.name,
          prompts: prompts.filter((item) => item.categoryId === category.id),
        })),
        {
          id: 'other',
          name: translate('tab.other'),
          prompts: prompts.filter((item) => item.categoryId === null || item.categoryId === undefined),
        },
      ];
      const visible = groups.filter(
        (group) => group.prompts.length > 0 && (injection.category === 'all' || group.id === injection.category),
      );
      return visible;
    }

    /** 重建浮层内容。 */
    function renderPopover() {
      const popover = injection.popover;
      if (popover === null) return;
      popover.replaceChildren();

      const head = document.createElement('div');
      head.className = 'mcxpp-pop-head';
      const title = document.createElement('div');
      title.className = 'mcxpp-pop-title';
      title.textContent = translate('quick.title');
      const manage = document.createElement('button');
      manage.type = 'button';
      manage.className = 'mcxpp-pop-link';
      manage.textContent = translate('quick.manage');
      manage.addEventListener('click', () => {
        closePopover(true);
        openPanel();
      });
      head.append(title, manage);
      popover.append(head);

      const tabs = document.createElement('div');
      tabs.className = 'mcxpp-tabs';
      tabs.setAttribute('role', 'tablist');
      const choices = [
        { id: 'all', name: translate('tab.all') },
        ...(injection.data?.categories ?? []).map((category) => ({ id: category.id, name: category.name })),
        { id: 'other', name: translate('tab.other') },
      ];
      for (const choice of choices) {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'mcxpp-tab';
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', String(injection.category === choice.id));
        tab.textContent = choice.name;
        tab.addEventListener('click', () => {
          injection.category = choice.id;
          renderPopover();
        });
        tabs.append(tab);
      }
      popover.append(tabs);

      const scroll = document.createElement('div');
      scroll.className = 'mcxpp-scroll';
      if (injection.loading) {
        const empty = document.createElement('div');
        empty.className = 'mcxpp-empty';
        empty.textContent = translate('quick.loading');
        scroll.append(empty);
      } else if (injection.error !== null) {
        const error = document.createElement('div');
        error.className = 'mcxpp-error';
        error.textContent = injection.error;
        scroll.append(error);
      } else {
        let rendered = 0;
        for (const group of sections()) {
          scroll.append(sectionTitle(group.name));
          for (const item of group.prompts) {
            scroll.append(promptRow(item));
            rendered += 1;
          }
        }
        if (rendered === 0) {
          const empty = document.createElement('div');
          empty.className = 'mcxpp-empty';
          empty.textContent = injection.data === null ? translate('quick.unavailable') : translate('quick.empty');
          scroll.append(empty);
        }
      }
      popover.append(scroll);

      const foot = document.createElement('div');
      foot.className = 'mcxpp-foot';
      foot.textContent = translate('quick.hint');
      popover.append(foot);

      positionPopover();
    }

    /** 拉取最新数据后重绘。 */
    async function refreshPopover() {
      injection.loading = true;
      injection.error = null;
      renderPopover();
      const seq = ++injection.requestSeq;
      try {
        const [state, icons] = await Promise.all([call('state'), loadIcons()]);
        if (seq !== injection.requestSeq || injection.popover === null) return;
        injection.data = state;
        injection.icons = icons;
      } catch (error) {
        if (seq !== injection.requestSeq) return;
        injection.error = error?.code === 'no-database' || error?.code === 'no-schema'
          ? translate('quick.unavailable')
          : (error instanceof Error ? error.message : translate('quick.unavailable'));
      } finally {
        if (seq === injection.requestSeq) {
          injection.loading = false;
          renderPopover();
        }
      }
    }

    function openPopover() {
      if (injection.popover !== null) return;
      const popover = document.createElement('div');
      popover.className = 'mcxpp-pop';
      popover.setAttribute('role', 'dialog');
      popover.setAttribute('aria-label', translate('quick.title'));
      document.body.append(popover);
      injection.popover = popover;
      injection.button?.setAttribute('aria-expanded', 'true');

      const onPointerDown = (event) => {
        if (popover.contains(event.target) || injection.button?.contains(event.target)) return;
        closePopover(false);
      };
      const onKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          closePopover(true);
          return;
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        const rows = [...popover.querySelectorAll('.mcxpp-row')];
        if (rows.length === 0) return;
        const index = rows.indexOf(document.activeElement);
        const next = event.key === 'ArrowDown'
          ? (index + 1) % rows.length
          : (index - 1 + rows.length) % rows.length;
        rows[next].focus();
        event.preventDefault();
      };
      injection.outsideHandler = { onPointerDown, onKeyDown };
      window.addEventListener('pointerdown', onPointerDown, true);
      window.addEventListener('keydown', onKeyDown, true);
      window.addEventListener('resize', scheduleReconcile, true);
      window.addEventListener('scroll', scheduleReconcile, true);
      injection.reposition = positionPopover;

      void refreshPopover();
    }

    /**
     * 关闭浮层。
     * @param restoreFocus - 是否把焦点还给按钮。
     */
    function closePopover(restoreFocus) {
      const popover = injection.popover;
      if (popover === null) return;
      const handlers = injection.outsideHandler;
      if (handlers !== null && handlers !== undefined) {
        window.removeEventListener('pointerdown', handlers.onPointerDown, true);
        window.removeEventListener('keydown', handlers.onKeyDown, true);
      }
      window.removeEventListener('resize', scheduleReconcile, true);
      window.removeEventListener('scroll', scheduleReconcile, true);
      injection.outsideHandler = null;
      injection.reposition = null;
      popover.remove();
      injection.popover = null;
      injection.button?.setAttribute('aria-expanded', 'false');
      if (restoreFocus) injection.button?.focus({ preventScroll: true });
    }

    // ─────────────────────────── 侧边栏页面 ───────────────────────────

    /** 面板打开请求：浮层的「管理」按钮通过它切到侧边栏页。 */
    let panelRequest = null;

    function openPanel() {
      panelRequest?.();
    }

    /** 分类色板：与 MCX 的 8 个颜色名一一对应。 */
    const CATEGORY_COLORS = {
      black: 'var(--dsw-alias-label-secondary)',
      blue: '#0285ff',
      green: '#04b84c',
      orange: '#fb6a22',
      pink: '#e75eaa',
      purple: '#924ff7',
      red: '#fb2c36',
      yellow: '#ffd230',
    };

    /**
     * 分类图标节点（React 版）。
     * @param props - icons 表与分类。
     */
    function CategoryMark({ icons, category, size = 16 }) {
      const svg = category === null || category === undefined ? undefined : icons?.[category.icon];
      if (typeof svg !== 'string') {
        return h('span', { className: 'mcxpp-item-mark', style: { color: 'var(--dsw-alias-label-tertiary)' } }, h(BookGlyph, { size }));
      }
      return h('span', {
        className: 'mcxpp-item-mark',
        style: category?.color ? { color: CATEGORY_COLORS[category.color] ?? undefined } : undefined,
        dangerouslySetInnerHTML: { __html: svg },
      });
    }

    /**
     * 编辑器弹窗。
     * @param props - 草稿、分类、保存与关闭回调。
     */
    function PromptEditor({ t, categories, draft, onClose, onSave }) {
      const [emoji, setEmoji] = React.useState(draft?.emoji ?? '');
      const [title, setTitle] = React.useState(draft?.title ?? '');
      const [body, setBody] = React.useState(draft?.body ?? '');
      const [categoryId, setCategoryId] = React.useState(draft?.categoryId ?? '');
      const [error, setError] = React.useState(null);
      const [busy, setBusy] = React.useState(false);

      function submit() {
        if (body.trim() === '') {
          setError(t('editor.bodyRequired'));
          return;
        }
        setBusy(true);
        onSave({
          emoji: [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(emoji)][0] ?? '',
          title,
          body,
          categoryId: categoryId === '' ? null : categoryId,
        }).catch((failure) => {
          setError(failure instanceof Error ? failure.message : String(failure));
          setBusy(false);
        });
      }

      return h(
        'div',
        { className: 'mcxpp-scrim', onPointerDown: (event) => { if (event.target === event.currentTarget) onClose(); } },
        h(
          'div',
          { className: 'mcxpp-modal', role: 'dialog', 'aria-modal': 'true' },
          h(
            'div',
            { className: 'mcxpp-modal-head' },
            h('div', { className: 'mcxpp-modal-title' }, t(draft === null ? 'editor.create' : 'editor.update')),
            h('button', { type: 'button', className: 'mcxpp-ghost', 'aria-label': t('action.close'), onClick: onClose }, h(Glyph, { name: 'close', size: 14 })),
          ),
          h(
            'div',
            { className: 'mcxpp-modal-body' },
            h(
              'div',
              { className: 'mcxpp-rowline' },
              h('div', { style: { flex: 1 } },
                h('label', { className: 'mcxpp-label' }, t('editor.title')),
                h('input', {
                  className: 'mcxpp-input',
                  value: title,
                  placeholder: t('editor.titlePlaceholder'),
                  onChange: (event) => setTitle(event.target.value),
                }),
              ),
              h('div', null,
                h('label', { className: 'mcxpp-label' }, t('editor.emoji')),
                h('input', {
                  className: 'mcxpp-input mcxpp-emoji',
                  value: emoji,
                  onChange: (event) => setEmoji(event.target.value),
                }),
              ),
            ),
            h(
              'div',
              null,
              h('label', { className: 'mcxpp-label' }, t('editor.category')),
              h(
                'select',
                { className: 'mcxpp-input', value: categoryId, onChange: (event) => setCategoryId(event.target.value) },
                h('option', { value: '' }, t('editor.uncategorized')),
                ...categories.map((category) => h('option', { key: category.id, value: category.id }, category.name)),
              ),
            ),
            h(
              'div',
              null,
              h('label', { className: 'mcxpp-label' }, t('editor.body')),
              h('textarea', {
                className: 'mcxpp-textarea',
                value: body,
                placeholder: t('editor.bodyPlaceholder'),
                onChange: (event) => setBody(event.target.value),
              }),
            ),
            error === null ? null : h('div', { className: 'mcxpp-hint', style: { color: 'var(--dsw-alias-state-error-primary)' } }, error),
          ),
          h(
            'div',
            { className: 'mcxpp-modal-foot' },
            h('button', { type: 'button', className: 'mcxpp-btn2', onClick: onClose }, t('action.cancel')),
            h('button', { type: 'button', className: 'mcxpp-btn2 primary', disabled: busy, onClick: submit }, t('action.save')),
          ),
        ),
      );
    }

    /**
     * 分类管理弹窗：新建、改名、换图标/颜色、删除。
     */
    function CategoryEditor({ t, icons, categories, onClose, onReload, notify }) {
      const [iconsReady, setIconsReady] = React.useState(icons);
      const [draft, setDraft] = React.useState({ name: '', icon: 'book', color: 'black' });
      const [error, setError] = React.useState(null);
      React.useEffect(() => {
        if (iconsReady && Object.keys(iconsReady).length > 0) return;
        loadIcons().then(setIconsReady);
      }, [iconsReady]);

      const iconNames = Object.keys(iconsReady ?? {});

      async function add() {
        if (draft.name.trim() === '') {
          setError(t('categories.name'));
          return;
        }
        try {
          await call('saveCategory', { name: draft.name.trim(), icon: draft.icon, color: draft.color });
          setDraft({ name: '', icon: 'book', color: 'black' });
          setError(null);
          await onReload();
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure));
        }
      }

      async function rename(category, name) {
        if (name.trim() === '' || name.trim() === category.name) return;
        try {
          await call('saveCategory', { id: category.id, name: name.trim(), icon: category.icon, color: category.color });
          await onReload();
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure));
        }
      }

      async function recolor(category, patch) {
        try {
          await call('saveCategory', { id: category.id, name: category.name, icon: category.icon, color: category.color, ...patch });
          await onReload();
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure));
        }
      }

      async function remove(category) {
        if (!window.confirm(t('categories.deleteHint'))) return;
        try {
          await call('deleteCategory', { id: category.id });
          await onReload();
          notify(t('toast.deleted'));
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure));
        }
      }

      return h(
        'div',
        { className: 'mcxpp-scrim', onPointerDown: (event) => { if (event.target === event.currentTarget) onClose(); } },
        h(
          'div',
          { className: 'mcxpp-modal wide', role: 'dialog', 'aria-modal': 'true' },
          h(
            'div',
            { className: 'mcxpp-modal-head' },
            h('div', { className: 'mcxpp-modal-title' }, t('categories.title')),
            h('button', { type: 'button', className: 'mcxpp-ghost', 'aria-label': t('action.close'), onClick: onClose }, h(Glyph, { name: 'close', size: 14 })),
          ),
          h(
            'div',
            { className: 'mcxpp-modal-body' },
            h(
              'div',
              { className: 'mcxpp-cats' },
              ...categories.map((category) =>
                h(
                  'div',
                  { key: category.id, className: 'mcxpp-cat' },
                  h(CategoryMark, { icons: iconsReady, category, size: 15 }),
                  h('input', {
                    className: 'mcxpp-input mcxpp-cat-name',
                    defaultValue: category.name,
                    onBlur: (event) => void rename(category, event.target.value),
                    onKeyDown: (event) => { if (event.key === 'Enter') event.target.blur(); },
                  }),
                  h(
                    'select',
                    {
                      className: 'mcxpp-sort',
                      value: category.color,
                      onChange: (event) => void recolor(category, { color: event.target.value }),
                    },
                    ...Object.keys(CATEGORY_COLORS).map((color) => h('option', { key: color, value: color }, color)),
                  ),
                  h('button', {
                    type: 'button',
                    className: 'mcxpp-ghost',
                    'aria-label': t('categories.delete'),
                    onClick: () => void remove(category),
                  }, h(Glyph, { name: 'trash', size: 14 })),
                ),
              ),
            ),
            h('div', { style: { height: 8 } }),
            h('label', { className: 'mcxpp-label' }, t('categories.new')),
            h(
              'div',
              { className: 'mcxpp-rowline' },
              h('input', {
                className: 'mcxpp-input',
                style: { flex: 1 },
                value: draft.name,
                placeholder: t('categories.name'),
                onChange: (event) => setDraft({ ...draft, name: event.target.value }),
              }),
              h(
                'select',
                {
                  className: 'mcxpp-sort',
                  value: draft.color,
                  onChange: (event) => setDraft({ ...draft, color: event.target.value }),
                },
                ...Object.keys(CATEGORY_COLORS).map((color) => h('option', { key: color, value: color }, color)),
              ),
              h('button', { type: 'button', className: 'mcxpp-btn2 primary', onClick: () => void add() }, t('categories.new')),
            ),
            h('label', { className: 'mcxpp-label', style: { marginTop: 10 } }, t('categories.icon')),
            h(
              'div',
              { className: 'mcxpp-iconpick' },
              ...iconNames.map((name) =>
                h('button', {
                  key: name,
                  type: 'button',
                  'aria-pressed': String(draft.icon === name),
                  title: name,
                  onClick: () => setDraft({ ...draft, icon: name }),
                  dangerouslySetInnerHTML: { __html: iconsReady[name] },
                }),
              ),
            ),
            error === null ? null : h('div', { className: 'mcxpp-hint', style: { color: 'var(--dsw-alias-state-error-primary)' } }, error),
          ),
          h(
            'div',
            { className: 'mcxpp-modal-foot' },
            h('button', { type: 'button', className: 'mcxpp-btn2', onClick: onClose }, t('action.close')),
          ),
        ),
      );
    }

    /**
     * 侧边栏主面板：浏览、搜索、增删改提示词与分类。
     */
    function PromptPanel({ t }) {
      const [state, setState] = React.useState(null);
      const [icons, setIcons] = React.useState({});
      const [error, setError] = React.useState(null);
      const [loading, setLoading] = React.useState(true);
      const [category, setCategory] = React.useState('all');
      const [query, setQuery] = React.useState('');
      const [sort, setSort] = React.useState('recent');
      const [view, setView] = React.useState(() => {
        try {
          return window.localStorage.getItem('mcxpp.view') === 'card' ? 'card' : 'list';
        } catch {
          return 'list';
        }
      });
      const [editor, setEditor] = React.useState(null);
      const [managing, setManaging] = React.useState(false);
      const [toast, setToast] = React.useState(null);

      const notify = React.useCallback((text) => {
        setToast(text);
      }, []);

      React.useEffect(() => {
        if (toast === null) return undefined;
        const timer = window.setTimeout(() => setToast(null), 2200);
        return () => window.clearTimeout(timer);
      }, [toast]);

      const reload = React.useCallback(async () => {
        try {
          const [next, nextIcons] = await Promise.all([call('state'), loadIcons()]);
          setState(next);
          setIcons(nextIcons);
          setError(null);
        } catch (failure) {
          setError(failure);
        } finally {
          setLoading(false);
        }
      }, []);

      React.useEffect(() => {
        void reload();
      }, [reload]);

      const prompts = state?.prompts ?? [];
      const categories = state?.categories ?? [];

      const visible = React.useMemo(() => {
        const needle = query.trim().toLowerCase();
        let rows = prompts;
        if (needle !== '') {
          rows = rows.filter(
            (item) =>
              item.title.toLowerCase().includes(needle) ||
              item.body.toLowerCase().includes(needle) ||
              item.summary.toLowerCase().includes(needle),
          );
        }
        if (category === 'other') rows = rows.filter((item) => item.categoryId === null || item.categoryId === undefined);
        else if (category !== 'all') rows = rows.filter((item) => item.categoryId === category);
        const sorted = [...rows];
        if (sort === 'title') sorted.sort((a, b) => a.summary.localeCompare(b.summary));
        else if (sort === 'created') sorted.sort((a, b) => b.createdAt - a.createdAt);
        else sorted.sort((a, b) => (b.calledAt ?? 0) - (a.calledAt ?? 0) || b.useCount - a.useCount);
        return sorted;
      }, [prompts, query, category, sort]);

      const categoryOf = React.useCallback(
        (item) => categories.find((entry) => entry.id === item.categoryId) ?? null,
        [categories],
      );

      async function saveDraft(value) {
        if (editor !== null && editor.id !== undefined) {
          await call('updatePrompt', { id: editor.id, changes: value });
          notify(t('toast.updated'));
        } else {
          await call('createPrompt', value);
          notify(t('toast.saved'));
        }
        setEditor(null);
        await reload();
      }

      async function removePrompt(item) {
        if (!window.confirm(t('confirm.delete'))) return;
        try {
          await call('deletePrompt', { id: item.id });
          notify(t('toast.deleted'));
          await reload();
        } catch (failure) {
          setError(failure);
        }
      }

      async function copyPrompt(item) {
        try {
          await navigator.clipboard.writeText(item.body);
          notify(t('toast.copied'));
          await call('markUsed', { id: item.id, action: 'copy' });
        } catch {
          notify(t('toast.copied'));
        }
      }

      if (loading) {
        return h('div', { className: 'mcxpp-page' }, h('div', { className: 'mcxpp-page-inner' },
          h('div', { className: 'mcxpp-state' }, t('loading'))));
      }

      if (error !== null) {
        const unavailable = error?.code === 'no-database' || error?.code === 'no-schema' || error?.code === 'no-sqlite';
        return h(
          'div',
          { className: 'mcxpp-page' },
          h(
            'div',
            { className: 'mcxpp-page-inner' },
            h(
              'div',
              { className: 'mcxpp-state' },
              h('div', { className: 'mcxpp-state-title' }, unavailable ? t('unavailable.title') : String(error.message ?? error)),
              h('div', null, unavailable ? t('unavailable.body') : null),
              h(
                'div',
                { style: { marginTop: 12 } },
                h('button', { type: 'button', className: 'mcxpp-btn2', onClick: () => { setLoading(true); setError(null); void reload(); } }, t('action.retry')),
              ),
            ),
          ),
        );
      }

      const tabs = [
        { id: 'all', label: t('tab.all'), icon: null },
        ...categories.map((entry) => ({ id: entry.id, label: entry.name, icon: entry })),
        { id: 'other', label: t('tab.other'), icon: null },
      ];

      return h(
        'div',
        { className: 'mcxpp-page' },
        h(
          'div',
          { className: 'mcxpp-page-inner' },
          h(
            'div',
            { className: 'mcxpp-page-head' },
            h(
              'div',
              null,
              h('h1', { className: 'mcxpp-h1' }, t('title.panel')),
              h('div', { className: 'mcxpp-sub' }, `${t('subtitle')} · ${t('count').replace('{n}', String(prompts.length))}`),
            ),
            h(
              'div',
              { className: 'mcxpp-actions' },
              h(
                'div',
                { className: 'mcxpp-field', style: { width: 200 } },
                h(Glyph, { name: 'search', size: 14 }),
                h('input', {
                  value: query,
                  placeholder: t('search.placeholder'),
                  onChange: (event) => setQuery(event.target.value),
                }),
              ),
              h('button', {
                type: 'button',
                className: 'mcxpp-icon-btn',
                'aria-label': t('action.manageCategories'),
                title: t('action.manageCategories'),
                onClick: () => setManaging(true),
              }, h(Glyph, { name: 'settings', size: 16 })),
              h('button', {
                type: 'button',
                className: 'mcxpp-btn2 primary',
                onClick: () => setEditor({}),
              }, h(Glyph, { name: 'plus', size: 14 }), t('action.new')),
            ),
          ),
          h(
            'div',
            { className: 'mcxpp-toolbar' },
            h(
              'div',
              { style: { display: 'flex', gap: 4, flex: 1, minWidth: 0 } },
              h('button', {
                type: 'button',
                className: 'mcxpp-icon-btn',
                'aria-label': t('view.list'),
                'aria-pressed': String(view === 'list'),
                title: t('view.list'),
                onClick: () => { setView('list'); try { window.localStorage.setItem('mcxpp.view', 'list'); } catch { /* 忽略 */ } },
              }, h(Glyph, { name: 'list', size: 16 })),
              h('button', {
                type: 'button',
                className: 'mcxpp-icon-btn',
                'aria-label': t('view.card'),
                'aria-pressed': String(view === 'card'),
                title: t('view.card'),
                onClick: () => { setView('card'); try { window.localStorage.setItem('mcxpp.view', 'card'); } catch { /* 忽略 */ } },
              }, h(Glyph, { name: 'card', size: 16 })),
            ),
            h(
              'select',
              { className: 'mcxpp-sort', value: sort, onChange: (event) => setSort(event.target.value) },
              h('option', { value: 'recent' }, t('sort.recent')),
              h('option', { value: 'created' }, t('sort.created')),
              h('option', { value: 'title' }, t('sort.title')),
            ),
          ),
          h(
            'div',
            { className: 'mcxpp-tabrow', role: 'tablist' },
            ...tabs.map((tab) => {
              const active = category === tab.id;
              return h(
                'button',
                {
                  key: tab.id,
                  type: 'button',
                  className: 'mcxpp-tab2',
                  role: 'tab',
                  'aria-selected': String(active),
                  onClick: () => setCategory(tab.id),
                },
                tab.icon === null ? null : h(CategoryMark, { icons, category: tab.icon, size: 14 }),
                tab.label,
              );
            }),
          ),
          h(
            'div',
            { className: 'mcxpp-body' },
            visible.length === 0
              ? h('div', { className: 'mcxpp-state' }, query.trim() !== '' ? t('empty.filtered') : category === 'all' ? t('empty.all') : t('empty.category'))
              : view === 'list'
                ? h(
                    'div',
                    { className: 'mcxpp-list' },
                    ...visible.map((item) =>
                      h(
                        'div',
                        { key: item.id, className: 'mcxpp-item' },
                        h(CategoryMark, { icons, category: categoryOf(item), size: 15 }),
                        h(
                          'div',
                          { className: 'mcxpp-item-main', onClick: () => void copyPrompt(item) },
                          h('div', { className: 'mcxpp-item-title' }, item.summary),
                          h('div', { className: 'mcxpp-item-body' }, item.body),
                          h('div', { className: 'mcxpp-item-meta' },
                            h('span', null, item.emoji || ''),
                            h('span', null, categoryOf(item)?.name ?? t('editor.uncategorized')),
                            item.useCount > 0 ? h('span', null, `×${item.useCount}`) : null),
                        ),
                        h(
                          'div',
                          { className: 'mcxpp-item-actions' },
                          h('button', {
                            type: 'button',
                            className: 'mcxpp-ghost',
                            'aria-label': t('action.copy'),
                            title: t('action.copy'),
                            onClick: () => void copyPrompt(item),
                          }, h(Glyph, { name: 'copy', size: 14 })),
                          h('button', {
                            type: 'button',
                            className: 'mcxpp-ghost',
                            'aria-label': t('action.edit'),
                            title: t('action.edit'),
                            onClick: () => setEditor(item),
                          }, h(Glyph, { name: 'edit', size: 14 })),
                          h('button', {
                            type: 'button',
                            className: 'mcxpp-ghost',
                            'aria-label': t('action.delete'),
                            title: t('action.delete'),
                            onClick: () => void removePrompt(item),
                          }, h(Glyph, { name: 'trash', size: 14 })),
                        ),
                      ),
                    ),
                  )
                : h(
                    'div',
                    { className: 'mcxpp-cards' },
                    ...visible.map((item) =>
                      h(
                        'div',
                        { key: item.id, className: 'mcxpp-card' },
                        h(
                          'div',
                          { className: 'mcxpp-card-head' },
                          h(CategoryMark, { icons, category: categoryOf(item), size: 15 }),
                          h('div', { className: 'mcxpp-card-title' }, item.summary),
                        ),
                        h('div', { className: 'mcxpp-card-body', onClick: () => void copyPrompt(item) }, item.body),
                        h(
                          'div',
                          { className: 'mcxpp-item-actions', style: { opacity: 1 } },
                          h('button', {
                            type: 'button',
                            className: 'mcxpp-ghost',
                            'aria-label': t('action.copy'),
                            title: t('action.copy'),
                            onClick: () => void copyPrompt(item),
                          }, h(Glyph, { name: 'copy', size: 14 })),
                          h('button', {
                            type: 'button',
                            className: 'mcxpp-ghost',
                            'aria-label': t('action.edit'),
                            title: t('action.edit'),
                            onClick: () => setEditor(item),
                          }, h(Glyph, { name: 'edit', size: 14 })),
                          h('button', {
                            type: 'button',
                            className: 'mcxpp-ghost',
                            'aria-label': t('action.delete'),
                            title: t('action.delete'),
                            onClick: () => void removePrompt(item),
                          }, h(Glyph, { name: 'trash', size: 14 })),
                        ),
                      ),
                    ),
                  ),
          ),
        ),
        editor === null
          ? null
          : h(PromptEditor, {
              t,
              categories,
              draft: editor.id === undefined ? null : editor,
              onClose: () => setEditor(null),
              onSave: saveDraft,
            }),
        managing
          ? h(CategoryEditor, {
              t,
              icons,
              categories,
              onClose: () => setManaging(false),
              onReload: reload,
              notify,
            })
          : null,
        toast === null ? null : h('div', { className: 'mcxpp-toast' }, toast),
      );
    }

    /** 侧边栏条目图标。 */
    function SidebarGlyph({ size = 16 }) {
      return h(BookGlyph, { size });
    }

    // ───────────────────────────── 应用 ─────────────────────────────

    /** 客户端依赖：槽位、语言字典，以及跳转侧边栏面板用的 layout 服务。 */
    const inject = ['slots', 'locale', 'layout'];

    /** 当前语言下的翻译函数；apply 时绑定。 */
    let translate = (key) => key;

    /**
     * @param ctx Client 插件上下文。
     */
    function apply(ctx) {
      try {
        const dictionaries = ctx.effect(() => {
          const offZh = ctx.locale.register(NS, 'zh', zh);
          const offEn = ctx.locale.register(NS, 'en', en);
          return () => {
            offZh();
            offEn();
          };
        }, `${PLUGIN_ID}: dictionaries`);
        void dictionaries;

        const bound = ctx.locale.bind(NS);
        translate = (key) => {
          const value = bound(key);
          return value === key || value === undefined || value === null ? (en[key] ?? key) : value;
        };
        const t = translate;

        // 语言切换：按钮文案与浮层跟着重画。
        ctx.effect(
          () =>
            ctx.locale.subscribe(() => {
              applyButtonText();
              if (injection.popover !== null) renderPopover();
            }),
          `${PLUGIN_ID}: locale listener`,
        );

        // 样式：挂一次，卸载时移除。
        ctx.effect(() => installStyles(), `${PLUGIN_ID}: styles`);

        /**
         * 槽位桥：渲染隐形锚点，同时把官方 inputActions 与实时草稿交给注入层。
         */
        function ComposerBridge(props) {
          // 保持 hook 调用位置稳定：useInput 理论上由槽位提供，缺失时退化为常量。
          const useInput = typeof props.useInput === 'function' ? props.useInput : () => '';
          const draft = useInput((snapshot) => (snapshot && snapshot.draft) || '');
          React.useEffect(() => {
            composer.inputActions = props.inputActions ?? null;
            composer.draft = typeof draft === 'string' ? draft : '';
          }, [props.inputActions, draft]);
          return h('span', { [ANCHOR]: '', 'aria-hidden': 'true', style: { display: 'none' } });
        }

        ctx.slots.inject('conversation.input.left', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.left',
              id: 'prompt-preset-anchor',
              order: 900,
              locale: NS,
            },
            ComposerBridge,
          ),
        );

        // 钩住页面跳转：浮层的「管理」按钮切到侧边栏面板。
        ctx.effect(() => {
          const onOpenPanel = () => {
            try {
              ctx.layout.selectPanel(PANEL_ID);
            } catch (failure) {
              console.warn(`${PLUGIN_ID}: could not open the panel`, failure);
            }
          };
          panelRequest = onOpenPanel;
          return () => {
            if (panelRequest === onOpenPanel) panelRequest = null;
          };
        }, `${PLUGIN_ID}: panel request`);

        // 注入按钮并跟随 DOM 变化维持位置。
        ctx.effect(() => {
          const observer = new MutationObserver(scheduleReconcile);
          observer.observe(document.body, { childList: true, subtree: true });
          window.addEventListener('resize', scheduleReconcile, true);
          reconcileButton();
          return () => {
            observer.disconnect();
            window.removeEventListener('resize', scheduleReconcile, true);
            closePopover(false);
            injection.button?.remove();
            injection.button = null;
          };
        }, `${PLUGIN_ID}: composer button`);

        // 侧边栏：条目 + 主面板。
        ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: PANEL_ID,
              inject: () => ({ t, locale: ctx.locale }),
            },
            PromptPanel,
          ),
        );

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 20,
              label: () => t('entry'),
            },
            SidebarGlyph,
          ),
        );

        ctx.effect(() => {
          const marker = { version: VERSION, plugin: PLUGIN_ID };
          window.__mcxPromptPreset = marker;
          return () => {
            if (window.__mcxPromptPreset === marker) delete window.__mcxPromptPreset;
          };
        }, `${PLUGIN_ID}: marker`);
      } catch (failure) {
        try {
          console.error(`${PLUGIN_ID}: registration failed`, failure);
        } catch {
          /* console 不可用时保持静默 */
        }
      }
    }

    return { apply, inject };
  },
});
