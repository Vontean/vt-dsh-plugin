/**
 * Client 半侧：「设置 → AGENTS.md 指令」页面。
 *
 * 页面本身只是宿主设置面板里的一个 section，所以布局沿用宿主习惯：
 * 内容列最宽 760px、卡片 borders/radius 取 --dsw-alias-* token、文字用
 * label-primary / secondary / tertiary 三级。数据通过 Host 半侧的
 * /vt-system-prompt/api/* 路由读写，客户端只发相对地址（见 routeUrl）。
 */

/** 插件身份：模块 id、样式标签、data 属性、日志前缀都从这一处派生。 */
const PLUGIN_ID = 'dsh-vt-system-prompt';
/** 必须等于 package.json 的 version，随挂载日志一起打印。 */
const VERSION = '1.0.1';

// 挂载日志：一行说明当前加载的是哪个构建（DevTools 的 Verbose 级别可见）。
console.debug(`[${PLUGIN_ID}] v${VERSION}`);

window.__ModuleLoader__.load({
  id: PLUGIN_ID,
  factory(require) {
    const reactModule = require('react');
    const React = reactModule !== null && typeof reactModule.createElement === 'function' ? reactModule : reactModule.default;

    const NS = 'vtSystemPrompt';

    /** 界面文案。t() 从 locale 服务的当前语言取词，缺词回落英文。 */
    const DICT = {
      zh: {
        nav: '全局提示词',
        title: '全局提示词',
        subtitle: '这里的内容会作为全局指令进入每次会话。',
        save: '保存',
        cancel: '取消',
        reload: '重新载入',
        reloadConfirm: '当前有未保存的修改。重新载入会丢弃这些修改，继续吗？',
        discardConfirm: '当前文件有未保存的修改，切换文件会丢弃它们，继续吗？',
        loading: '正在读取…',
        loadFailed: '读取失败',
        saveFailed: '保存失败',
        noFiles: '没有找到可编辑的全局指令文件。',
        missing: '文件还不存在，保存后会创建它。',
        savedAt: '已保存 {time}',
        unsaved: '有未保存的修改',
        stats: '{lines} 行 · {chars} 字符',
        tabHarness: '主目录 AGENTS.md',
        tabShared: '共享 AGENTS.md',
        editorLabel: 'AGENTS.md 内容',
        shortcut: '⌘S 保存',
      },
      en: {
        nav: 'Global instructions',
        title: 'Global instructions',
        subtitle: 'This file joins every session as global instructions.',
        save: 'Save',
        cancel: 'Cancel',
        reload: 'Reload',
        reloadConfirm: 'You have unsaved changes. Reloading discards them. Continue?',
        discardConfirm: 'This file has unsaved changes. Switching files discards them. Continue?',
        loading: 'Loading…',
        loadFailed: 'Could not load',
        saveFailed: 'Could not save',
        noFiles: 'No editable global instruction file was found.',
        missing: 'This file does not exist yet; saving will create it.',
        savedAt: 'Saved {time}',
        unsaved: 'Unsaved changes',
        stats: '{lines} lines · {chars} chars',
        tabHarness: 'Primary AGENTS.md',
        tabShared: 'Shared AGENTS.md',
        editorLabel: 'AGENTS.md content',
        shortcut: '⌘S to save',
      },
    };

    const STYLE_TAG_ID = `${PLUGIN_ID}/styles`;
    const API_PREFIX = 'vt-system-prompt/api/';

    const CSS = `
.vtsp-page{display:flex;flex-direction:column;gap:14px;width:100%;max-width:760px;box-sizing:border-box}
.vtsp-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.vtsp-headText{display:flex;flex-direction:column;gap:6px;min-width:0}
.vtsp-title{margin:0;color:var(--dsw-alias-label-primary);font-size:16px;font-weight:600;line-height:24px}
.vtsp-subtitle{margin:0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
.vtsp-actions{display:flex;align-items:center;gap:8px;flex:none;padding-top:2px}
.vtsp-iconBtn{appearance:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background .12s,color .12s}
.vtsp-iconBtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.vtsp-iconBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.vtsp-iconBtn:disabled{opacity:.4;cursor:default}
.vtsp-icon{display:block}
.vtsp-btn{appearance:none;font:inherit;font-size:13px;line-height:20px;padding:5px 14px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background .12s,border-color .12s,color .12s}
.vtsp-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.vtsp-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.vtsp-btn:disabled{opacity:.45;cursor:default}
.vtsp-btnPrimary{border-color:transparent;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.vtsp-btnPrimary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-label-primary));color:var(--dsw-alias-bg-layer-3)}
.vtsp-tabs{display:flex;gap:6px;flex-wrap:wrap}
.vtsp-tab{appearance:none;font:inherit;font-size:12px;line-height:18px;padding:3px 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background .12s,border-color .12s,color .12s}
.vtsp-tab:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.vtsp-tab[aria-pressed="true"]{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary)}
.vtsp-tab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.vtsp-card{box-sizing:border-box;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);border-radius:16px;background:var(--dsw-alias-bg-layer-3);overflow:hidden;transition:border-color .12s}
.vtsp-card:focus-within{border-color:var(--dsw-alias-border-l3,var(--dsw-alias-border-l2))}
.vtsp-editor{box-sizing:border-box;width:100%;height:clamp(320px,52vh,620px);resize:vertical;border:0;outline:none;background:transparent;color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12.5px;line-height:1.7;padding:14px 16px;tab-size:2}
.vtsp-editor::placeholder{color:var(--dsw-alias-label-tertiary)}
.vtsp-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:20px}
.vtsp-status{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.vtsp-status[data-tone="ok"]{color:var(--dsw-alias-state-success-primary)}
.vtsp-status[data-tone="error"]{color:var(--dsw-alias-state-error-primary)}
.vtsp-statusRow{display:inline-flex;align-items:center;gap:6px;min-width:0}
.vtsp-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-warn-primary);flex:none}
.vtsp-hint{margin-left:auto;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);text-align:right;font-variant-numeric:tabular-nums}
.vtsp-loading{padding:28px 4px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
.vtsp-linkBtn{appearance:none;font:inherit;font-size:12px;line-height:18px;padding:0;border:0;background:none;color:var(--dsw-alias-brand-primary);cursor:pointer;text-decoration:underline}
.vtsp-linkBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:4px}
@media (prefers-reduced-motion:reduce){.vtsp-btn,.vtsp-tab,.vtsp-card,.vtsp-iconBtn{transition:none}}
`;

    /** 把样式表挂进 document.head；返回移除函数，卸载时由 ctx.effect 回收。 */
    function installStyles() {
      if (typeof document === 'undefined') return () => {};
      const existing = document.querySelector(`style[data-plugin-css="${STYLE_TAG_ID}"]`);
      if (existing !== null) return () => {};
      const tag = document.createElement('style');
      tag.dataset.plugin = PLUGIN_ID;
      tag.dataset.pluginCss = STYLE_TAG_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
      return () => tag.remove();
    }

    /**
     * 宿主路由的绝对地址。
     *
     * 必须按「页面自身的目录」解析，而不是按 origin：桌面外壳把页面放在
     * dsh-app://app/，反向代理还可能带目录前缀；直接用 '/' 开头会把请求送出前缀。
     * （与 dsh-better-sidebar 的 host-route-url 同一套规则。）
     */
    function routeUrl(route) {
      const raw =
        typeof document !== 'undefined' && typeof document.baseURI === 'string' && document.baseURI !== ''
          ? document.baseURI
          : globalThis.__DSH_TRANSPORT__?.streamBaseUrl ?? 'http://dsh.internal/';
      let base;
      try {
        base = new URL(raw);
      } catch {
        base = new URL('http://dsh.internal/');
      }
      base.search = '';
      base.hash = '';
      if (!base.pathname.endsWith('/')) base.pathname = base.pathname.slice(0, base.pathname.lastIndexOf('/') + 1);
      return new URL(`${API_PREFIX}${route}`, base).toString();
    }

    /** POST 调用 Host 接口，把 {ok:false} 信封还原成带 code 的 Error。 */
    async function callApi(method, payload) {
      const response = await fetch(routeUrl(method), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
      });
      let envelope = null;
      try {
        envelope = await response.json();
      } catch {
        envelope = null;
      }
      if (envelope === null || typeof envelope !== 'object') throw new Error(`HTTP ${response.status}`);
      if (envelope.ok === true) return envelope.value;
      const error = new Error(envelope.error?.message ?? `HTTP ${response.status}`);
      error.code = envelope.error?.code;
      error.details = envelope.error?.details;
      throw error;
    }

    function clockTime() {
      const now = new Date();
      const pad = (value) => String(value).padStart(2, '0');
      return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    }

    /** 刷新图标（Lucide refresh-cw 的同一几何）：用 currentColor 跟随控件状态色。 */
    function RefreshIcon() {
      return React.createElement(
        'svg',
        {
          className: 'vtsp-icon',
          width: 16,
          height: 16,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        React.createElement('path', { key: 'a', d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' }),
        React.createElement('path', { key: 'b', d: 'M21 3v5h-5' }),
        React.createElement('path', { key: 'c', d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' }),
        React.createElement('path', { key: 'd', d: 'M8 16H3v5' }),
      );
    }

    /** 语言切换时强制重渲染：t 在调用时读取当前语言，但 React 需要一次通知。 */
    function useLocaleRevision(locale) {
      const subscribe = React.useCallback(
        (onChange) => (locale === undefined ? () => {} : locale.subscribe(onChange)),
        [locale],
      );
      const getSnapshot = React.useCallback(
        () => (locale === undefined ? 0 : locale.getSnapshot().revision),
        [locale],
      );
      if (typeof React.useSyncExternalStore !== 'function') return 0;
      return React.useSyncExternalStore(subscribe, getSnapshot);
    }

    /**
     * @param {{ t: (key: string, params?: Record<string, string|number>) => string, locale?: any }} props
     */
    function SystemPromptSection(props) {
      const { t, locale } = props;
      useLocaleRevision(locale);

      const [files, setFiles] = React.useState([]);
      const [activeId, setActiveId] = React.useState('harness');
      const [status, setStatus] = React.useState('loading');
      const [error, setError] = React.useState(null);
      const [draft, setDraft] = React.useState('');
      const [baseline, setBaseline] = React.useState('');
      const [savedMtime, setSavedMtime] = React.useState(null);
      const [saving, setSaving] = React.useState(false);
      const [notice, setNotice] = React.useState(null);

      const activeIdRef = React.useRef('harness');
      const aliveRef = React.useRef(true);
      React.useEffect(
        () => () => {
          aliveRef.current = false;
        },
        [],
      );

      const dirty = status === 'ready' && draft !== baseline;
      const activeFile = files.find((file) => file.id === activeId) ?? files[0] ?? null;
      const dirtyRef = React.useRef(false);
      dirtyRef.current = dirty;

      const applyFile = React.useCallback((file) => {
        setActiveId(file.id);
        activeIdRef.current = file.id;
        setDraft(file.content);
        setBaseline(file.content);
        setSavedMtime(file.mtimeMs);
      }, []);

      const reload = React.useCallback(
        async (options = {}) => {
          setStatus('loading');
          setError(null);
          setNotice(null);
          try {
            const value = await callApi('read');
            if (!aliveRef.current) return;
            const nextFiles = Array.isArray(value?.files) ? value.files : [];
            const wanted = options.selectId ?? activeIdRef.current;
            const nextActive = nextFiles.find((file) => file.id === wanted) ?? nextFiles[0] ?? null;
            if (nextActive === null) {
              setFiles(nextFiles);
              setStatus('error');
              setError(t('noFiles'));
              return;
            }
            setFiles(nextFiles);
            applyFile(nextActive);
            setStatus('ready');
          } catch (cause) {
            if (!aliveRef.current) return;
            setStatus('error');
            setError(cause instanceof Error ? cause.message : String(cause));
          }
        },
        [applyFile, t],
      );

      React.useEffect(() => {
        reload();
        // 只在挂载时读一次；之后的刷新由按钮/保存结果驱动。
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      const save = React.useCallback(async () => {
        if (saving || !dirtyRef.current) return;
        setSaving(true);
        setNotice(null);
        try {
          const value = await callApi('save', {
            target: activeIdRef.current,
            content: draft,
            expectedMtimeMs: savedMtime,
          });
          const file = value.file;
          setFiles((previous) => previous.map((candidate) => (candidate.id === file.id ? file : candidate)));
          setDraft(file.content);
          setBaseline(file.content);
          setSavedMtime(file.mtimeMs);
          setNotice({ tone: 'ok', text: t('savedAt', { time: clockTime() }) });
        } catch (cause) {
          const code = cause?.code;
          setNotice({
            tone: 'error',
            text: `${t('saveFailed')}：${cause instanceof Error ? cause.message : String(cause)}`,
            conflict: code === 'conflict',
          });
        } finally {
          setSaving(false);
        }
      }, [draft, saving, savedMtime, t]);

      const cancel = React.useCallback(() => {
        setDraft(baseline);
        setNotice(null);
      }, [baseline]);

      const requestReload = React.useCallback(() => {
        if (dirtyRef.current && typeof window !== 'undefined' && !window.confirm(t('reloadConfirm'))) return;
        reload({ selectId: activeIdRef.current });
      }, [reload, t]);

      const selectFile = React.useCallback(
        (id) => {
          if (id === activeIdRef.current) return;
          const file = files.find((candidate) => candidate.id === id);
          if (file === undefined) return;
          if (dirtyRef.current && typeof window !== 'undefined' && !window.confirm(t('discardConfirm'))) return;
          applyFile(file);
          setNotice(null);
        },
        [applyFile, files, t],
      );

      const onKeyDown = React.useCallback(
        (event) => {
          if ((event.metaKey || event.ctrlKey) && (event.key === 's' || event.key === 'S')) {
            event.preventDefault();
            save();
          }
        },
        [save],
      );

      const tabs =
        files.length > 1
          ? React.createElement(
              'div',
              { className: 'vtsp-tabs', role: 'group', 'aria-label': t('title') },
              files.map((file) =>
                React.createElement(
                  'button',
                  {
                    key: file.id,
                    type: 'button',
                    className: 'vtsp-tab',
                    'aria-pressed': file.id === activeId,
                    onClick: () => selectFile(file.id),
                    title: file.displayPath,
                  },
                  file.id === 'shared' ? t('tabShared') : t('tabHarness'),
                ),
              ),
            )
          : null;

      const header = React.createElement(
        'div',
        { className: 'vtsp-head' },
        React.createElement(
          'div',
          { className: 'vtsp-headText' },
          // 路径不单独占一行，挂在标题的 tooltip 上，需要时悬停可读。
          React.createElement('h2', { className: 'vtsp-title', title: activeFile?.path ?? '' }, t('title')),
          React.createElement('p', { className: 'vtsp-subtitle' }, t('subtitle')),
        ),
        React.createElement(
          'div',
          { className: 'vtsp-actions' },
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'vtsp-iconBtn',
              onClick: requestReload,
              disabled: status === 'loading' || saving,
              title: t('reload'),
              'aria-label': t('reload'),
            },
            React.createElement(RefreshIcon, null),
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'vtsp-btn',
              onClick: cancel,
              disabled: !dirty || saving,
            },
            t('cancel'),
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'vtsp-btn vtsp-btnPrimary',
              onClick: save,
              disabled: !dirty || saving,
              title: t('shortcut'),
            },
            saving ? '…' : t('save'),
          ),
        ),
      );

      if (status === 'loading' && activeFile === null) {
        return React.createElement(
          'section',
          { className: 'vtsp-page' },
          header,
          tabs,
          React.createElement('div', { className: 'vtsp-loading' }, t('loading')),
        );
      }

      if (status === 'error') {
        return React.createElement(
          'section',
          { className: 'vtsp-page' },
          header,
          React.createElement(
            'div',
            { className: 'vtsp-status', 'data-tone': 'error', role: 'alert' },
            `${t('loadFailed')}：${error ?? ''}`,
          ),
          React.createElement(
            'div',
            null,
            React.createElement('button', { type: 'button', className: 'vtsp-linkBtn', onClick: requestReload }, t('reload')),
          ),
        );
      }

      const exists = activeFile?.exists !== false;
      const lineCount = draft.length === 0 ? 0 : draft.split('\n').length;
      const charCount = draft.length;

      const statusNode = (() => {
        if (notice !== null) {
          return React.createElement(
            'span',
            { className: 'vtsp-statusRow' },
            React.createElement('span', { className: 'vtsp-status', 'data-tone': notice.tone, role: notice.tone === 'error' ? 'alert' : 'status' }, notice.text),
            notice.conflict === true
              ? React.createElement('button', { type: 'button', className: 'vtsp-linkBtn', onClick: requestReload }, t('reload'))
              : null,
          );
        }
        if (dirty) {
          return React.createElement(
            'span',
            { className: 'vtsp-statusRow' },
            React.createElement('span', { className: 'vtsp-dot', 'aria-hidden': 'true' }),
            React.createElement('span', { className: 'vtsp-status' }, t('unsaved')),
          );
        }
        if (!exists) return React.createElement('span', { className: 'vtsp-status' }, t('missing'));
        return null;
      })();

      return React.createElement(
        'section',
        { className: 'vtsp-page' },
        header,
        tabs,
        React.createElement(
          'div',
          { className: 'vtsp-card' },
          React.createElement('textarea', {
            className: 'vtsp-editor',
            value: draft,
            spellCheck: false,
            autoCapitalize: 'off',
            autoCorrect: 'off',
            wrap: 'soft',
            'aria-label': t('editorLabel'),
            placeholder: '# AGENTS.md\n\n',
            onChange: (event) => setDraft(event.target.value),
            onKeyDown,
          }),
        ),
        React.createElement(
          'div',
          { className: 'vtsp-foot' },
          statusNode,
          React.createElement(
            'span',
            { className: 'vtsp-hint' },
            t('stats', { lines: lineCount, chars: charCount }),
          ),
        ),
      );
    }

    return {
      inject: ['slots', 'locale'],

      apply(ctx) {
        ctx.effect(() => installStyles(), 'vt-system-prompt: page styles');

        // 词典交给 locale 服务持有，页面文案随宿主语言实时切换。
        ctx.effect(() => {
          const offZh = ctx.locale.register(NS, 'zh', DICT.zh);
          const offEn = ctx.locale.register(NS, 'en', DICT.en);
          return () => {
            offZh();
            offEn();
          };
        }, 'vt-system-prompt: locale dictionaries');

        const bound = ctx.locale.bind(NS);
        const fallback = (key) => DICT.en[key] ?? key;
        const t = (key, params) => {
          const raw = bound(key);
          const template = raw === key || raw === undefined || raw === null ? fallback(key) : raw;
          if (params === undefined) return template;
          return template.replace(/\{(\w+)\}/g, (match, name) =>
            Object.hasOwn(params, name) ? String(params[name]) : match,
          );
        };

        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'system-prompt',
              order: 18,
              label: () => t('nav'),
              inject: () => ({ t, locale: ctx.locale }),
            },
            SystemPromptSection,
          ),
        );
      },
    };
  },
});
