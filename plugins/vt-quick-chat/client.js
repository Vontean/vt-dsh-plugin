/**
 * dsh-vt-quick-chat — client half.
 *
 * ── 它解决什么问题 ───────────────────────────────────────────────────────────
 * agent 正在跑任务时，用户看到一个不懂的词，不想打断主对话，也不想为一句解释
 * 新建 Session。本插件把 `shell.overlay` 当成一块临时画布：按快捷键弹出一个
 * 非模态小窗，借用当前选中的一小段文字，走 Host 的 `ctx.llm.stream()` 得到
 * 流式解释。关掉小窗，主任务原样继续。
 *
 * ── 为什么不用 Session ───────────────────────────────────────────────────────
 * 这里没有 `ctx.sessions`、没有 agent loop、没有工具：只有一次模型调用。
 * 小窗自己的紧凑/展开、草稿、历史都只属于这个浮层，不进入布局 store，
 * 也不进入侧栏或 session log。
 *
 * ── 失败必须留在浮层里 ───────────────────────────────────────────────────────
 * DSH 的 `shell.overlay` 没有自动错误边界；一个逃逸的渲染错误会把整个界面
 * 卸掉。这里用 class error boundary 把异常收成一张可重试的小卡片，
 * 流式与网络错误则显示在对话流末尾。
 */
window.__ModuleLoader__.load({
  id: 'dsh-vt-quick-chat',
  factory(require) {
    'use strict';

    /** 插件标识（与 package.json 的 name 一致）。 */
    const PLUGIN_ID = 'dsh-vt-quick-chat';
    /** 与 package.json 的 version 保持一致。 */
    const VERSION = '1.3.1';
    /** 文案命名空间。 */
    const NS = 'vtQuickChat';
    /** Host 路由前缀，与 index.js 的 ROUTE_PREFIX 必须一致。 */
    const API_PREFIX = '/vt-quick-chat/api';

    /**
     * 设置缓存：小窗打开时用它决定联网/深度思考的初始状态。
     * 由设置页写入，插件加载时从 Host 拉一次。
     */
    let settingsCache = { systemPrompt: '', provider: 'follow', webByDefault: false, deepThinkByDefault: false, deepseekKnown: false, deepseekConnected: false };

    /**
     * 当前通道是否支持联网与深度思考。
     * 只有「跟随 DSH 默认」且 DeepSeek 凭证可用时才有这两个能力。
     * @returns 是否支持。
     */
    function canUseWebTools() {
      // 只在宿主明确说「凭证不可用」时才收掉能力；不知道就保留入口，
      // 由宿主在请求时决定走哪条通道——猜错会让用户白丢两个按钮。
      if (settingsCache.provider !== 'follow') return false;
      if (settingsCache.deepseekKnown !== true) return true;
      return settingsCache.deepseekConnected === true;
    }

    /**
     * 把宿主的凭证结论翻译成缓存字段。
     *
     * 旧宿主不会返回 `deepseek`，此时结论「未知」而不是「没有」——设置页据此
     * 保持沉默，避免让用户去补一份其实已经存在的凭证。
     * @param value - `/settings` 的返回体。
     * @returns 要合并进缓存的字段。
     */
    function deepseekCacheOf(value) {
      const status = value?.deepseek;
      if (status === null || typeof status !== 'object' || typeof status.connected !== 'boolean') {
        return { deepseekKnown: false, deepseekConnected: false };
      }
      return { deepseekKnown: true, deepseekConnected: status.connected === true };
    }

    /**
     * 宿主路由的绝对地址：按页面自身目录解析，兼容 dsh-app:// 与反向代理前缀。
     * @param route - 相对路由，如 `settings`。
     * @returns 绝对 URL。
     */
    function routeUrl(route) {
      const raw =
        typeof document !== 'undefined' && typeof document.baseURI === 'string' && document.baseURI !== ''
          ? document.baseURI
          : 'http://dsh.internal/';
      let base;
      try {
        base = new URL(raw);
      } catch {
        base = new URL('http://dsh.internal/');
      }
      base.search = '';
      base.hash = '';
      if (!base.pathname.endsWith('/')) base.pathname = base.pathname.slice(0, base.pathname.lastIndexOf('/') + 1);
      return new URL(`${API_PREFIX}/${route}`, base).toString();
    }

    /**
     * 读设置页数据：设置本身 + 可选 provider 清单 + 内置提示词。
     * @returns `{ settings, providers, defaultPrompt }`。
     */
    /**
     * 解析 Host 的 JSON 信封。
     * 宿主端没更新时（旧代码没有 /settings 路由）会回 405 空响应，这里要给出
     * 「重启 DSH」这种能直接照做的提示，而不是 JSON 解析栈。
     * @param response - fetch 响应。
     * @returns 信封里的 value。
     */
    async function readEnvelope(response) {
      const text = await response.text();
      let envelope = null;
      if (text.length > 0) {
        try {
          envelope = JSON.parse(text);
        } catch {
          envelope = null;
        }
      }
      if (envelope === null) {
        const error = new Error(`HTTP ${response.status}`);
        error.code = response.status === 405 || response.status === 404 ? 'host-stale' : 'bad-response';
        throw error;
      }
      if (envelope.ok !== true) {
        const error = new Error(envelope.error?.message ?? `HTTP ${response.status}`);
        error.code = envelope.error?.code ?? 'rejected';
        throw error;
      }
      return envelope.value;
    }

    async function fetchSettings() {
      const response = await fetch(routeUrl('settings'), { credentials: 'same-origin' });
      const value = await readEnvelope(response);
      settingsCache = { ...value.settings, ...deepseekCacheOf(value) };
      return value;
    }

    /**
     * 保存设置；成功后刷新缓存。
     * @param next - 完整设置对象。
     * @returns `{ settings, providers, defaultPrompt }`。
     */
    async function saveSettings(next) {
      const response = await fetch(routeUrl('settings'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      });
      const value = await readEnvelope(response);
      settingsCache = { ...value.settings, ...deepseekCacheOf(value) };
      return value;
    }
    /** 本地历史存储键。 */
    const STORAGE_KEY = `${PLUGIN_ID}:history:v1`;
    /** 历史最多保留的对话数；超出时从最旧的一条开始删除。 */
    const MAX_HISTORY = 30;
    /** 单条历史对话最多保留的消息数。 */
    const MAX_HISTORY_MESSAGES = 40;
    /** 历史序列化后的总字符上限，避免把 localStorage 撑爆。 */
    const MAX_HISTORY_CHARS = 1_500_000;
    /** 与 Host 对齐的消息长度上限。 */
    const MAX_MESSAGE_CHARS = 16_000;
    /** 客户端请求预算，低于 Host 的 256 KiB 上限。 */
    const MAX_REQUEST_CHARS = 200_000;
    /** 与 Host 对齐的选中文本上限。 */
    const MAX_SELECTION_CHARS = 8_000;
    /** 单个附件上限，与 Host 的 MAX_UPLOAD_BYTES 一致。 */
    const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
    /** 允许上传的扩展名，与 Host 的 UPLOAD_PURPOSES 对齐。 */
    const UPLOAD_EXTENSIONS = new Set([
      'pdf', 'doc', 'docx', 'ppt', 'pptx',
      'png', 'jpg', 'jpeg', 'gif', 'webp',
      'txt', 'md', 'csv', 'json', 'ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'yaml', 'yml', 'xlsx', 'xls',
    ]);
    /** 流式文本的合并窗口：约 30fps，避免每个 token 触发一次 React 渲染。 */
    const STREAM_FLUSH_MS = 33;
    /** 「复制成功」与「确认清空」的提示窗口。 */
    const FEEDBACK_MS = 1_500;
    const CONFIRM_MS = 3_000;

    const reactModule = require('react');
    const React =
      reactModule !== null && typeof reactModule.createElement === 'function'
        ? reactModule
        : reactModule.default;
    const h = React.createElement;

    /**
     * DSH 的图标组件是 `@deepseek-ai/dsh-client-ui-primitives` 的具名导出，
     * 例如 `IconCloseOutlineRegular`。模块缺失时退化为空占位，保证界面仍可用。
     */
    let primitives = {};
    try {
      primitives = require('@deepseek-ai/dsh-client-ui-primitives') ?? {};
    } catch {
      primitives = {};
    }

    /**
     * 渲染一个 DSH 图标。
     * @param props - name 为 primitives 的导出名；size/className 透传给图标组件。
     */
    function DshIcon({ name, size = 16, className }) {
      const Component = primitives[name];
      if (typeof Component !== 'function') {
        return h('span', {
          className,
          'aria-hidden': 'true',
          style: { display: 'inline-block', width: size, height: size },
        });
      }
      return h(Component, { size, className });
    }

    const zh = {
      'panel.label': '快捷提问',
      'input.aria': '快捷提问输入',
      'input.placeholder': '问点什么…',
      'input.placeholderExpanded': '继续追问…',
      'empty.title': '随手问，不打断当前任务',
      'empty.body': '一个临时小窗：随手追问、解释概念、看一段资料。可以带上附件，也可以打开联网查最新资料。',
      'empty.hint': '不创建会话、不进侧栏；关掉小窗，主任务原样继续。',
      'action.send': '发送',
      'action.stop': '停止',
      'action.retry': '重试',
      'action.copy': '复制',
      'action.copied': '已复制',
      'action.close': '关闭',
      'action.minimize': '收起',
      'action.expand': '展开',
      'action.newChat': '新话题',
      'action.history': '历史',
      'action.clearHistory': '清空',
      'action.confirmClear': '确认清空？',
      'action.removeHistory': '删除这条',
      'action.removeQuote': '移除引用',
      'action.retryHint': '重新生成上一条回答',
      'context.chip': '引用选中文字',
      'action.attach': '添加附件',
      'action.removeAttachment': '移除附件',
      'action.attachHint': '支持 PDF、Word、PPT、图片与文本，单个不超过 30 MiB',
      'action.deepThink': '深度思考',
      'action.deepThinkOn': '深度思考已开',
      'action.deepThinkHint': '先推理再回答；更慢，也更贵',
      'file.uploading': '上传中…',
      'file.failed': '上传失败',
      'file.tooLarge': '超过 30 MiB',
      'file.unsupported': '不支持这个类型',
      'thinking.deep': '深度求索中',
      'action.web': '联网',
      'action.webOn': '联网已开',
      'action.webHint': '开启后可用搜索与阅读链接；搜索 5 元/千次、抓取 5 元/千次',
      'tool.search': '正在搜索',
      'tool.open': '正在打开网页',
      'tool.find': '正在页内查找',
      'tool.read': '正在读取链接',
      'tool.usage': '搜索 {search} 次 · 抓取 {fetch} 次',
      'citations.title': '来源',
      'error.contentRisk': '这个问题被内容安全策略拒绝了。',
      'web.unavailable': '当前没有可用的 DeepSeek 凭证，本次回答没有联网。',
      'stream.thinking': '正在回答…',
      'stream.stopped': '已停止',
      'stream.truncated': '回答达到长度上限',
      'history.title': '本地历史',
      'history.empty': '还没有历史。发送第一条问题后，它会出现在这里。',
      'history.untitled': '未命名提问',
      'history.justNow': '刚刚',
      'history.minutesAgo': '{count} 分钟前',
      'history.hoursAgo': '{count} 小时前',
      'history.daysAgo': '{count} 天前',
      'error.crash': '快捷提问渲染失败，主界面不受影响。',
      'error.generic': '请求失败，请重试。',
      'error.noModel': '当前没有可用模型，请先在设置里选择模型。',
      'error.credential': '当前模型未登录或凭证缺失，请先在设置里完成登录。',
      'error.rate': '请求太频繁，请稍后再试。',
      'error.tooLong': '对话太长，请新开一个临时话题。',
      'error.quota': '模型额度不足，请检查账户余额。',
      'error.network': '网络中断，请检查连接后重试。',
      'shortcut.label': '快捷提问',
      'settings.nav': '快捷提问',
      'settings.title': '快捷提问',
      'settings.subtitle': '这里的内容只影响「快捷提问」小窗，不影响主会话。',
      'settings.promptLabel': '系统提示词',
      'settings.promptHint': '留空则使用内置提示词。',
      'settings.promptReset': '恢复默认',
      'settings.promptDefault': '内置提示词（只读参考）',
      'settings.providerLabel': '模型',
      'settings.providerHint': '指定后小窗固定用这个模型，不再尝试 DeepSeek 直连。',
      'settings.providerFollow': 'DeepSeek 直连（支持联网与深度思考）',
      'settings.deepseekReady': '已用 {via} 连上 DeepSeek，联网与深度思考可用。',
      'settings.deepseekMissing': '没拿到 DeepSeek 凭证：会退回 DSH 默认模型，且没有联网能力。',
      'settings.viaAccount': 'DeepSeek 账号授权',
      'settings.viaApiKey': 'API Key',
      'settings.triggerLabel': '触发方式',
      'settings.triggerHint': '随时按这个组合打开小窗，关掉它不影响正在跑的任务；组合可在「设置 → 通用设置 → 键盘快捷键」里改。',
      'settings.triggerMissing': '键位没有注册成功：先用右侧按钮打开，或重启 DSH 后再试。',
      'settings.triggerCmd': '也可以在输入框里用 /quick-chat 打开，后面的文字会直接填进小窗。',
      'settings.openNow': '立即打开',
      'settings.noWebTools': '当前通道不支持联网与深度思考，输入区会隐藏这两个开关。',
      'settings.webDefault': '默认开启联网',
      'settings.webDefaultHint': '每次打开小窗时联网开关的初始状态。',
      'settings.deepThinkDefault': '默认开启深度思考',
      'settings.deepThinkDefaultHint': '每次打开小窗时深度思考开关的初始状态。',
      'settings.save': '保存',
      'settings.saving': '保存中…',
      'settings.saved': '已保存',
      'settings.saveFailed': '保存失败',
      'settings.loadFailed': '读取设置失败',
      'settings.hostStale': '宿主端还没更新：请完全退出并重新打开 DSH，再回到这里。',
      'settings.loading': '正在读取…',
      'settings.settingsTitle': '设置',
    };

    const en = {
      'panel.label': 'Quick chat',
      'input.aria': 'Quick chat input',
      'input.placeholder': 'Ask something…',
      'input.placeholderExpanded': 'Ask a follow-up…',
      'empty.title': 'Ask anything, without interrupting the task',
      'empty.body': 'A temporary window for follow-up questions, explanations, or a quick read. Bring files, or turn on Web for fresh sources.',
      'empty.hint': 'No session, no sidebar entry; close it and the main task continues.',
      'action.send': 'Send',
      'action.stop': 'Stop',
      'action.retry': 'Retry',
      'action.copy': 'Copy',
      'action.copied': 'Copied',
      'action.close': 'Close',
      'action.minimize': 'Minimize',
      'action.expand': 'Expand',
      'action.newChat': 'New topic',
      'action.history': 'History',
      'action.clearHistory': 'Clear',
      'action.confirmClear': 'Clear?',
      'action.removeHistory': 'Delete this item',
      'action.removeQuote': 'Remove quote',
      'action.retryHint': 'Regenerate the previous answer',
      'context.chip': 'Quoted selection',
      'action.attach': 'Add attachment',
      'action.removeAttachment': 'Remove attachment',
      'action.attachHint': 'PDF, Word, PPT, images and text, up to 30 MiB each',
      'action.deepThink': 'DeepThink',
      'action.deepThinkOn': 'DeepThink on',
      'action.deepThinkHint': 'Reason first, then answer; slower and costlier',
      'file.uploading': 'Uploading…',
      'file.failed': 'Upload failed',
      'file.tooLarge': 'Over 30 MiB',
      'file.unsupported': 'Unsupported type',
      'thinking.deep': 'Thinking',
      'action.web': 'Web',
      'action.webOn': 'Web on',
      'action.webHint': 'Turns on search and link reading; search ¥5/1k, fetch ¥5/1k',
      'tool.search': 'Searching',
      'tool.open': 'Opening page',
      'tool.find': 'Finding in page',
      'tool.read': 'Reading link',
      'tool.usage': '{search} searches · {fetch} fetches',
      'citations.title': 'Sources',
      'error.contentRisk': 'This question was rejected by the content safety policy.',
      'web.unavailable': 'No DeepSeek credential is available, so this answer did not use the web.',
      'stream.thinking': 'Answering…',
      'stream.stopped': 'Stopped',
      'stream.truncated': 'The answer hit its length limit',
      'history.title': 'Local history',
      'history.empty': 'No history yet. Your first question will appear here.',
      'history.untitled': 'Untitled question',
      'history.justNow': 'just now',
      'history.minutesAgo': '{count} min ago',
      'history.hoursAgo': '{count} h ago',
      'history.daysAgo': '{count} d ago',
      'error.crash': 'Quick chat failed to render. The main UI is unaffected.',
      'error.generic': 'The request failed. Please retry.',
      'error.noModel': 'No model is available. Choose one in Settings first.',
      'error.credential': 'The current model is not signed in or is missing credentials.',
      'error.rate': 'Too many requests. Try again in a moment.',
      'error.tooLong': 'This conversation is too long. Start a new temporary topic.',
      'error.quota': 'The model quota is exhausted. Check your balance.',
      'error.network': 'The network dropped. Check the connection and retry.',
      'shortcut.label': 'Quick chat',
      'settings.nav': 'Quick chat',
      'settings.title': 'Quick chat',
      'settings.subtitle': 'These settings only affect the quick-chat window, not the main session.',
      'settings.promptLabel': 'System prompt',
      'settings.promptHint': 'Leave empty to use the built-in prompt.',
      'settings.promptReset': 'Restore default',
      'settings.promptDefault': 'Built-in prompt (read-only)',
      'settings.providerLabel': 'Model',
      'settings.providerHint': 'When set, the window always uses this model instead of the DeepSeek channel.',
      'settings.providerFollow': 'DeepSeek direct (web + deep thinking)',
      'settings.deepseekReady': 'Connected to DeepSeek via {via}; web and deep thinking are available.',
      'settings.deepseekMissing': 'No DeepSeek credentials: falls back to the DSH default model without web.',
      'settings.viaAccount': 'account sign-in',
      'settings.viaApiKey': 'API key',
      'settings.triggerLabel': 'Trigger',
      'settings.triggerHint': 'Opens the window any time; closing it leaves the running task alone. Rebind it under Settings → General → Keyboard shortcuts.',
      'settings.triggerMissing': 'The key binding did not register: use the button on the right, or restart DSH and try again.',
      'settings.triggerCmd': 'You can also type /quick-chat in the composer; text after it lands in the window.',
      'settings.openNow': 'Open now',
      'settings.noWebTools': 'This channel has no web or deep thinking; both toggles are hidden in the composer.',
      'settings.webDefault': 'Web on by default',
      'settings.webDefaultHint': 'Initial state of the Web switch when the window opens.',
      'settings.deepThinkDefault': 'Deep thinking on by default',
      'settings.deepThinkDefaultHint': 'Initial state of the deep-thinking switch when the window opens.',
      'settings.save': 'Save',
      'settings.saving': 'Saving…',
      'settings.saved': 'Saved',
      'settings.saveFailed': 'Could not save',
      'settings.loadFailed': 'Could not load settings',
      'settings.hostStale': 'The host half has not been updated yet: quit and reopen DSH, then come back.',
      'settings.loading': 'Loading…',
      'settings.settingsTitle': 'Settings',
    };

    // ── 纯函数（可测试，不依赖 React / DOM） ────────────────────────────────

    /**
     * 生成本地唯一 id。
     * @returns 字符串 id。
     */
    function uid() {
      try {
        return globalThis.crypto.randomUUID();
      } catch {
        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      }
    }

    /**
     * 把消息压成一行标题。
     * @param messages - 对话消息。
     * @param fallback - 没有用户消息时的标题。
     * @returns 最长 60 字符的标题。
     */
    function titleFrom(messages, fallback) {
      const first = Array.isArray(messages) ? messages.find((message) => message?.role === 'user') : undefined;
      const text = typeof first?.content === 'string' ? first.content.replace(/\s+/gu, ' ').trim() : '';
      if (text.length === 0) return fallback;
      return text.length > 60 ? `${text.slice(0, 59)}…` : text;
    }

    /**
     * 按请求预算裁剪历史：保留最近 40 条，再从最旧开始丢弃，始终保留最后一条。
     * @param messages - 完整对话。
     * @returns 可安全发送的消息数组。
     */
    function trimForRequest(messages) {
      const list = messages.slice(-40).map((message) => {
        const out = { role: message.role, content: String(message.content).slice(0, MAX_MESSAGE_CHARS) };
        // 服务端工具块必须随 assistant 消息回传，否则上一轮读过的网页会丢失。
        if (message.role === 'assistant' && Array.isArray(message.blocks) && message.blocks.length > 0) {
          out.blocks = message.blocks;
        }
        if (message.role === 'user' && Array.isArray(message.files) && message.files.length > 0) {
          out.files = message.files;
        }
        return out;
      });
      while (list.length > 1 && JSON.stringify(list).length > MAX_REQUEST_CHARS) list.shift();
      return list;
    }

    /**
     * 校验从 localStorage 读出的历史。
     * @param value - 任意 JSON 值。
     * @param fallbackTitle - 无标题条目的兜底标题。
     * @returns 干净的对话数组，最多 MAX_HISTORY 条。
     */
    function sanitizeHistory(value, fallbackTitle = '') {
      if (!Array.isArray(value)) return [];
      const out = [];
      for (const item of value) {
        if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
        if (typeof item.id !== 'string' || item.id.length === 0 || !Array.isArray(item.messages)) continue;
        const messages = [];
        for (const message of item.messages) {
          if (message === null || typeof message !== 'object') continue;
          if (message.role !== 'user' && message.role !== 'assistant') continue;
          if (typeof message.content !== 'string' || message.content.trim().length === 0) continue;
          const kept = { role: message.role, content: message.content.slice(0, MAX_MESSAGE_CHARS) };
          // 历史里的服务端块要一起恢复，否则继续追问时读过的网页会丢。
          if (message.role === 'assistant' && Array.isArray(message.blocks) && message.blocks.length > 0) {
            kept.blocks = message.blocks;
          }
          if (message.role === 'assistant' && Array.isArray(message.citations) && message.citations.length > 0) {
            kept.citations = message.citations;
          }
          messages.push(kept);
        }
        if (messages.length === 0) continue;
        out.push({
          id: item.id,
          title: typeof item.title === 'string' && item.title.length > 0 ? item.title.slice(0, 120) : titleFrom(messages, fallbackTitle),
          createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
          updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now(),
          messages: messages.slice(-MAX_HISTORY_MESSAGES),
        });
      }
      return out.slice(0, MAX_HISTORY);
    }

    /**
     * 增量解析 SSE。
     * @param onFrame - 收到一帧 JSON 时调用。
     * @returns `{ push, flush }`。
     */
    function createSseParser(onFrame) {
      let buffer = '';
      /**
       * 分发一段完整帧。
       * @param raw - 不含结尾空行的帧文本。
       */
      const dispatch = (raw) => {
        const data = raw
          .split(/\r?\n/u)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data.length === 0) return;
        try {
          const frame = JSON.parse(data);
          if (frame !== null && typeof frame === 'object' && !Array.isArray(frame)) onFrame(frame);
        } catch {
          // 单帧坏了不影响后续帧；下一帧仍会继续解析。
        }
      };
      return {
        /**
         * 喂入一段文本。
         * @param chunk - 解码后的文本片段。
         */
        push(chunk) {
          buffer += chunk;
          let match = /\r?\n\r?\n/u.exec(buffer);
          while (match !== null) {
            dispatch(buffer.slice(0, match.index));
            buffer = buffer.slice(match.index + match[0].length);
            match = /\r?\n\r?\n/u.exec(buffer);
          }
        },
        /** 流结束时把残留的最后一帧也处理掉。 */
        flush() {
          if (buffer.trim().length > 0) dispatch(buffer);
          buffer = '';
        },
      };
    }

    /**
     * 把 Markdown 拆成块。只支持解释类回答常用的子集：
     * 段落、标题、无序/有序列表、引用、围栏代码块。
     * 表格等复杂结构按段落显示，避免引入第三方解析器。
     * @param source - Markdown 文本。
     * @returns 块数组。
     */
    function tokenizeMarkdown(source) {
      const lines = String(source).replace(/\r\n?/gu, '\n').split('\n');
      const blocks = [];
      const isFence = (line) => /^\s*```/u.test(line);
      const isHeading = (line) => /^\s*#{1,4}\s+/u.test(line);
      const isQuote = (line) => /^\s*>\s?/u.test(line);
      const isBullet = (line) => /^\s*[-*+]\s+/u.test(line);
      const isOrdered = (line) => /^\s*\d+[.)]\s+/u.test(line);
      const isBlockStart = (line) =>
        isFence(line) || isHeading(line) || isQuote(line) || isBullet(line) || isOrdered(line);

      let index = 0;
      while (index < lines.length) {
        const line = lines[index];
        if (/^\s*$/u.test(line)) {
          index += 1;
          continue;
        }

        const fence = /^\s*```([\w+#-]*)\s*$/u.exec(line);
        if (fence !== null) {
          const language = fence[1] ?? '';
          const body = [];
          index += 1;
          while (index < lines.length && !/^\s*```\s*$/u.test(lines[index])) {
            body.push(lines[index]);
            index += 1;
          }
          if (index < lines.length) index += 1;
          blocks.push({ type: 'code', language, text: body.join('\n') });
          continue;
        }

        const heading = /^\s*(#{1,4})\s+(.*)$/u.exec(line);
        if (heading !== null) {
          blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
          index += 1;
          continue;
        }

        if (isQuote(line)) {
          const body = [];
          while (index < lines.length && isQuote(lines[index])) {
            body.push(lines[index].replace(/^\s*>\s?/u, ''));
            index += 1;
          }
          blocks.push({ type: 'quote', text: body.join('\n') });
          continue;
        }

        const bullet = isBullet(line);
        const ordered = !bullet && isOrdered(line);
        if (bullet || ordered) {
          const pattern = bullet ? /^\s*[-*+]\s+(.*)$/u : /^\s*\d+[.)]\s+(.*)$/u;
          const items = [];
          while (index < lines.length) {
            const match = pattern.exec(lines[index]);
            if (match === null) break;
            items.push(match[1]);
            index += 1;
          }
          blocks.push({ type: 'list', ordered, items });
          continue;
        }

        const paragraph = [];
        while (index < lines.length && !/^\s*$/u.test(lines[index]) && !isBlockStart(lines[index])) {
          paragraph.push(lines[index]);
          index += 1;
        }
        if (paragraph.length === 0) {
          // 理论上不会发生；防止异常输入让循环原地打转。
          index += 1;
          continue;
        }
        blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
      }
      return blocks;
    }

    /**
     * 行内 Markdown：**粗体**、`行内代码`、[文字](https 链接)。
     * @param text - 一段文本。
     * @param keyBase - React key 前缀。
     * @returns React 节点数组。
     */
    function renderInline(text, keyBase) {
      const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/gu;
      const nodes = [];
      let cursor = 0;
      let match;
      let key = 0;
      while ((match = pattern.exec(text)) !== null) {
        if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
        const token = match[0];
        if (token.startsWith('**')) {
          nodes.push(h('strong', { key: `${keyBase}-b${key}` }, token.slice(2, -2)));
        } else if (token.startsWith('`')) {
          nodes.push(h('code', { key: `${keyBase}-c${key}` }, token.slice(1, -1)));
        } else {
          const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/u.exec(token);
          if (link === null) {
            nodes.push(token);
          } else {
            nodes.push(
              h(
                'a',
                { key: `${keyBase}-a${key}`, href: link[2], target: '_blank', rel: 'noreferrer noopener' },
                link[1],
              ),
            );
          }
        }
        cursor = match.index + token.length;
        key += 1;
      }
      if (cursor < text.length) nodes.push(text.slice(cursor));
      return nodes;
    }

    /**
     * 渲染 Markdown 为 React 节点。
     * @param source - Markdown 文本。
     * @returns React 节点数组。
     */
    function renderMarkdown(source) {
      return tokenizeMarkdown(source).map((block, index) => {
        const key = `b${index}`;
        if (block.type === 'code') {
          return h(
            'pre',
            { key, className: 'vqc-code' },
            h('code', { 'data-language': block.language || undefined }, block.text),
          );
        }
        if (block.type === 'heading') {
          return h(`h${Math.min(block.level + 2, 6)}`, { key, className: 'vqc-heading' }, renderInline(block.text, key));
        }
        if (block.type === 'quote') {
          return h('blockquote', { key }, renderInline(block.text, key));
        }
        if (block.type === 'list') {
          const items = block.items.map((item, itemIndex) =>
            h('li', { key: `${key}-i${itemIndex}` }, renderInline(item, `${key}-i${itemIndex}`)),
          );
          return block.ordered
            ? h('ol', { key, className: 'vqc-list' }, items)
            : h('ul', { key, className: 'vqc-list' }, items);
        }
        return h('p', { key, className: 'vqc-paragraph' }, renderInline(block.text, key));
      });
    }

    /**
     * 把错误码映射成用户能读懂的文案。
     * @param code - Host 返回的机器可读错误码。
     * @param t - 文案函数。
     * @returns 本地化文案。
     */
    function errorText(code, t) {
      switch (code) {
        case 'NO_MODEL':
        case 'NO_LLM':
          return t('error.noModel');
        case 'MISSING_CREDENTIAL':
        case 'INVALID_CREDENTIAL':
        case 'AUTH':
        case 'HTTP_401':
        case 'HTTP_403':
          return t('error.credential');
        case 'RATE_LIMIT':
        case 'HTTP_429':
          return t('error.rate');
        case 'CONTEXT_WINDOW_EXCEEDED':
          return t('error.tooLong');
        case 'QUOTA':
        case 'ACCOUNT_QUOTA':
          return t('error.quota');
        case 'NETWORK':
        case 'STREAM_FAILED':
          return t('error.network');
        default:
          return t('error.generic');
      }
    }

    // ── 本地历史 ────────────────────────────────────────────────────────────

    /**
     * 读取本地历史；损坏或不可用时返回空数组。
     * @param fallbackTitle - 无标题条目的兜底标题。
     * @returns 历史数组。
     */
    function readHistory(fallbackTitle) {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === null) return [];
        return sanitizeHistory(JSON.parse(raw), fallbackTitle);
      } catch {
        return [];
      }
    }

    /**
     * 写入本地历史；配额或隐私模式失败时静默降级。
     * @param history - 历史数组。
     */
    function writeHistory(history) {
      let list = history
        .slice(0, MAX_HISTORY)
        .map((entry) => ({ ...entry, messages: entry.messages.slice(-MAX_HISTORY_MESSAGES) }));
      try {
        // 超限时从最旧的一条开始丢弃，保证写入成功；历史是可选增强，不能影响主流程。
        while (list.length > 0 && JSON.stringify(list).length > MAX_HISTORY_CHARS) list = list.slice(0, -1);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      } catch {
        // 配额或隐私模式失败：静默降级。
      }
    }

    // ── 控制器：浮层自己的状态机 ────────────────────────────────────────────

    /**
     * 创建浮层控制器。状态只属于这个浮层，不进入 DSH 的 session / layout store。
     * @param options - 文案函数。
     */
    function createController({ t }) {
      let state = {
        open: false,
        mode: 'compact',
        draft: '',
        selection: '',
        messages: [],
        streamText: '',
        streaming: false,
        stopped: false,
        truncated: false,
        error: null,
        historyOpen: false,
        history: readHistory(t('history.untitled')),
        copiedId: null,
        confirmClear: false,
        model: undefined,
        /** 本次回答走的通道：deepseek 直连，或 default 默认模型兜底。 */
        via: undefined,
        /** 是否开启联网工具；每次打开小窗重置为关闭。 */
        web: false,
        /** 是否开启深度思考；同样每次打开重置。 */
        deepThink: false,
        /** 已选附件：{ key, name, status, id?, kind?, reason? }。 */
        files: [],
        /** 上游是否已进入思考阶段。 */
        thinking: false,
        /** 本轮已发生的服务端工具调用，用于显示「正在搜索 / 正在读取链接」。 */
        tools: [],
        /** 本轮回答引用到的来源。 */
        citations: [],
        /** 本轮工具计费次数，回答结束后显示一次。 */
        toolUsage: null,
      };

      const listeners = new Set();
      let abort = null;
      let currentId = null;
      let createdAt = 0;
      let streamTimer = 0;
      let pendingText = '';
      let copyTimer = 0;
      let confirmTimer = 0;
      /** 最近一次浮层外的非空选区；按键可能折叠选区，用它兜底。 */
      let lastSelection = '';
      let lastSelectionAt = 0;
      /** 本轮上游返回的 assistant 服务端块，收尾时挂到消息上。 */
      let pendingBlocks = null;
      /** 选区记忆的有效窗口。 */
      const SELECTION_MEMORY_MS = 5_000;

      /**
       * 订阅状态变化。
       * @param listener - 变化时调用。
       * @returns 取消订阅。
       */
      function subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }

      /** @returns 当前状态快照。 */
      function snapshot() {
        return state;
      }

      /** 通知所有订阅者。 */
      function emit() {
        for (const listener of listeners) listener();
      }

      /**
       * 合并一次状态变更并通知。
       * @param patch - 要覆盖的字段。
       */
      function set(patch) {
        state = { ...state, ...patch };
        emit();
      }

      /** 把缓冲区里的流式文本合并进状态。 */
      function flushStream() {
        if (streamTimer !== 0) {
          window.clearTimeout(streamTimer);
          streamTimer = 0;
        }
        if (pendingText.length === 0) return;
        const chunk = pendingText;
        pendingText = '';
        set({ streamText: state.streamText + chunk });
      }

      /**
       * 追加一段流式文本；按 30fps 合并，避免每个 token 重渲染。
       * @param text - 增量文本。
       */
      function appendStream(text) {
        if (typeof text !== 'string' || text.length === 0) return;
        pendingText += text;
        if (streamTimer !== 0) return;
        streamTimer = window.setTimeout(() => {
          streamTimer = 0;
          flushStream();
        }, STREAM_FLUSH_MS);
      }

      /**
       * 把当前临时对话写进本地历史。
       * @param messages - 已经定稿的消息。
       */
      function persist(messages) {
        if (!Array.isArray(messages) || messages.length === 0) return;
        if (currentId === null) {
          currentId = uid();
          createdAt = Date.now();
        }
        const entry = {
          id: currentId,
          title: titleFrom(messages, t('history.untitled')),
          createdAt,
          updatedAt: Date.now(),
          messages,
        };
        const history = [entry, ...state.history.filter((item) => item.id !== currentId)].slice(0, MAX_HISTORY);
        writeHistory(history);
        set({ history });
      }

      /**
       * 结束一次流式回答：保留已生成文本，清空流式态。
       * @param options - stopped/truncated 标记。
       */
      function finishStream(options = {}) {
        if (!state.streaming) return;
        flushStream();
        const text = state.streamText;
        // 服务端块与引用要跟着这条回答一起落盘，下一轮才能原样回传。
        const assistant =
          text.trim().length > 0
            ? {
                role: 'assistant',
                content: text,
                ...(pendingBlocks === null ? {} : { blocks: pendingBlocks }),
                ...(state.citations.length === 0 ? {} : { citations: state.citations }),
              }
            : undefined;
        const messages = assistant === undefined ? state.messages : [...state.messages, assistant];
        pendingBlocks = null;
        set({
          messages,
          streamText: '',
          streaming: false,
          thinking: false,
          stopped: options.stopped === true,
          truncated: options.truncated === true,
        });
        persist(messages);
      }

      /**
       * 发起一次模型请求并消费 SSE。
       * @param messages - 含最新用户问题的完整对话。
       */
      async function run(messages) {
        abort = new AbortController();
        const { signal } = abort;
        try {
          const response = await fetch(`${API_PREFIX}/chat`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              messages: trimForRequest(messages),
              selection: state.selection,
              web: state.web === true,
              deepThink: state.deepThink === true,
            }),
            signal,
          });
          if (!response.ok) {
            const payload = await response.json().catch(() => undefined);
            const error = new Error(payload?.error?.message ?? `HTTP ${response.status}`);
            error.code = payload?.error?.code ?? `HTTP_${response.status}`;
            throw error;
          }
          if (response.body === null) {
            const error = new Error('response body missing');
            error.code = 'NETWORK';
            throw error;
          }
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          const parser = createSseParser((frame) => {
            switch (frame.type) {
              case 'start':
                set({
                  model: typeof frame.model === 'string' ? frame.model : undefined,
                  via: typeof frame.via === 'string' ? frame.via : undefined,
                });
                break;
              case 'model':
                set({ model: typeof frame.model === 'string' ? frame.model : undefined });
                break;
              case 'delta':
                appendStream(frame.text);
                break;
              case 'thinking':
                set({ thinking: true });
                break;
              case 'tool':
                set({
                  tools: [
                    ...state.tools,
                    {
                      action: typeof frame.action === 'string' ? frame.action : 'search',
                      queries: Array.isArray(frame.queries) ? frame.queries : [],
                      url: typeof frame.url === 'string' ? frame.url : '',
                    },
                  ],
                });
                break;
              case 'citation':
                if (typeof frame.url === 'string' && frame.url.length > 0) {
                  const seen = state.citations.some((item) => item.url === frame.url);
                  if (!seen) {
                    set({
                      citations: [
                        ...state.citations,
                        { url: frame.url, title: typeof frame.title === 'string' ? frame.title : '' },
                      ],
                    });
                  }
                }
                break;
              case 'blocks':
                if (Array.isArray(frame.blocks) && frame.blocks.length > 0) pendingBlocks = frame.blocks;
                break;
              case 'done':
                set({
                  toolUsage:
                    frame.tools === undefined || frame.tools === null
                      ? null
                      : {
                          search: Number(frame.tools.search) || 0,
                          fetch: Number(frame.tools.fetch) || 0,
                        },
                });
                finishStream({ truncated: frame.truncated === true });
                break;
              case 'aborted':
                finishStream({ stopped: true });
                break;
              case 'error':
                finishStream();
                set({ error: { code: frame.code ?? 'UNKNOWN', message: frame.message ?? '' } });
                break;
              default:
                break;
            }
          });
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            parser.push(decoder.decode(value, { stream: true }));
          }
          parser.push(decoder.decode());
          parser.flush();
          // 适配器契约保证有 finish；这里兜底没有收到 done 的异常流。
          if (state.streaming) finishStream();
        } catch (error) {
          if (signal.aborted) {
            finishStream({ stopped: true });
            return;
          }
          finishStream();
          set({
            error: {
              code: typeof error?.code === 'string' ? error.code : 'NETWORK',
              message: error instanceof Error ? error.message : String(error),
            },
          });
        } finally {
          abort = null;
        }
      }

      /**
       * 发送一条问题。
       * @param raw - 指定文本；缺省使用草稿。
       */
      function send(raw) {
        const text = String(raw ?? state.draft).trim().slice(0, MAX_MESSAGE_CHARS);
        if (text.length === 0 || state.streaming) return;
        if (currentId === null) {
          currentId = uid();
          createdAt = Date.now();
        }
        const ready = state.files.filter((file) => file.status === 'ready');
        const userMessage = {
          role: 'user',
          content: text,
          ...(ready.length === 0
            ? {}
            : { files: ready.map((file) => ({ id: file.id, kind: file.kind, name: file.name })) }),
        };
        const messages = [...state.messages, userMessage];
        pendingBlocks = null;
        set({
          messages,
          draft: '',
          mode: 'expanded',
          error: null,
          streamText: '',
          streaming: true,
          stopped: false,
          truncated: false,
          historyOpen: false,
          confirmClear: false,
          tools: [],
          citations: [],
          toolUsage: null,
          files: [],
          thinking: false,
        });
        void run(messages);
      }

      /** 停止当前回答；已生成的部分保留。 */
      function stop() {
        if (!state.streaming) return;
        const current = abort;
        abort = null;
        current?.abort();
        finishStream({ stopped: true });
      }

      /** 重试上一条问题。 */
      function retry() {
        if (state.streaming) return;
        let index = -1;
        for (let cursor = state.messages.length - 1; cursor >= 0; cursor -= 1) {
          if (state.messages[cursor].role === 'user') {
            index = cursor;
            break;
          }
        }
        if (index < 0) return;
        const text = state.messages[index].content;
        const prefix = state.messages.slice(0, index);
        const messages = [...prefix, { role: 'user', content: text }];
        if (currentId === null) {
          currentId = uid();
          createdAt = Date.now();
        }
        set({
          messages,
          error: null,
          streamText: '',
          streaming: true,
          stopped: false,
          truncated: false,
          tools: [],
          citations: [],
          toolUsage: null,
          thinking: false,
        });
        pendingBlocks = null;
        void run(messages);
      }

      /**
       * 读取当前选中文本；选中内容落在浮层内部时忽略。
       * @returns 截断后的文本。
       */
      function currentSelectionText() {
        const selection = window.getSelection();
        if (selection === null || selection.rangeCount === 0) return '';
        const text = selection.toString().trim();
        if (text.length === 0) return '';
        const anchor = selection.anchorNode;
        const element = anchor?.nodeType === 1 ? anchor : anchor?.parentElement;
        const inside = element?.closest?.('[data-vt-quick-chat]');
        if (inside !== null && inside !== undefined) return '';
        return text.slice(0, MAX_SELECTION_CHARS);
      }

      /**
       * 记住浮层外的非空选区。用户按下快捷键时浏览器可能先折叠选区，
       * 所以不能只在打开瞬间读取。
       */
      function rememberSelection() {
        const text = currentSelectionText();
        if (text.length === 0) return;
        lastSelection = text;
        lastSelectionAt = Date.now();
      }

      /**
       * 读取打开浮层时要引用的文字：优先当前选区，其次用 5 秒内的选区记忆。
       * @returns 截断后的文本。
       */
      function readSelection() {
        const current = currentSelectionText();
        if (current.length > 0) {
          lastSelection = current;
          lastSelectionAt = Date.now();
          return current;
        }
        if (lastSelection.length > 0 && Date.now() - lastSelectionAt <= SELECTION_MEMORY_MS) return lastSelection;
        return '';
      }

      /**
       * 从宿主命令打开：先开窗，再把命令后面那段文字放进输入框。
       * 不自动发送——发不发仍然由用户决定。
       * @param prompt - 命令后跟的文字；为空时等同 open()。
       */
      function openWith(prompt) {
        open();
        const text = typeof prompt === 'string' ? prompt.trim() : '';
        if (text.length > 0) set({ draft: text.slice(0, MAX_MESSAGE_CHARS) });
      }

      /** 打开浮层：默认紧凑态，并带上当前选中文字。 */
      function open() {
        if (state.open) return;
        set({
          open: true,
          mode: 'compact',
          selection: readSelection(),
          historyOpen: false,
          confirmClear: false,
          // 联网与深度思考回到设置页里的默认值：不让上一轮的计费状态静默延续。
          // 当前通道没有这两个能力时直接关掉，界面上也不会出现这两个开关。
          web: canUseWebTools() && settingsCache.webByDefault === true,
          deepThink: canUseWebTools() && settingsCache.deepThinkByDefault === true,
          files: [],
          thinking: false,
          tools: [],
          citations: [],
          toolUsage: null,
        });
      }

      /** 关闭浮层：丢弃草稿与选中引用，把已发送内容留在本地历史。 */
      function close() {
        const current = abort;
        abort = null;
        current?.abort();
        if (state.streaming) finishStream({ stopped: true });
        if (state.messages.length > 0) persist(state.messages);
        currentId = null;
        createdAt = 0;
        if (copyTimer !== 0) {
          window.clearTimeout(copyTimer);
          copyTimer = 0;
        }
        if (confirmTimer !== 0) {
          window.clearTimeout(confirmTimer);
          confirmTimer = 0;
        }
        set({
          open: false,
          mode: 'compact',
          draft: '',
          selection: '',
          messages: [],
          streamText: '',
          streaming: false,
          stopped: false,
          truncated: false,
          error: null,
          historyOpen: false,
          copiedId: null,
          confirmClear: false,
          model: undefined,
          via: undefined,
          web: false,
          deepThink: false,
          files: [],
          thinking: false,
          tools: [],
          citations: [],
          toolUsage: null,
        });
      }

      /** 快捷键：打开 / 关闭。 */
      function toggle() {
        if (state.open) close();
        else open();
      }

      /** 切换联网工具；下一次发送生效。 */
      function toggleWeb() {
        set({ web: !state.web });
      }

      /** 切换深度思考；下一次发送生效。 */
      function toggleDeepThink() {
        set({ deepThink: !state.deepThink });
      }

      /**
       * 上传一个附件；失败时保留一条错误 chip，用户可移除。
       * @param file - File 对象。
       * @param key - 本地临时 id。
       */
      async function uploadFile(file, key) {
        try {
          const response = await fetch(`${API_PREFIX}/upload`, {
            method: 'POST',
            headers: {
              'content-type': 'application/octet-stream',
              'x-filename': encodeURIComponent(file.name),
            },
            body: file,
          });
          const payload = await response.json().catch(() => undefined);
          if (!response.ok || payload?.ok !== true) {
            throw new Error(payload?.error?.code ?? `HTTP_${response.status}`);
          }
          set({
            files: state.files.map((item) =>
              item.key === key
                ? { ...item, status: 'ready', id: payload.file.id, kind: payload.file.kind }
                : item,
            ),
          });
        } catch (error) {
          const reason = typeof error?.message === 'string' ? error.message : 'upload-failed';
          set({
            files: state.files.map((item) => (item.key === key ? { ...item, status: 'error', reason } : item)),
          });
        }
      }

      /**
       * 接收用户选中的文件：先占位，再逐个上传。
       * @param list - FileList 或数组。
       */
      function addFiles(list) {
        const incoming = Array.from(list ?? []);
        for (const file of incoming) {
          const key = uid();
          const dot = file.name.lastIndexOf('.');
          const extension = dot < 0 ? '' : file.name.slice(dot + 1).toLowerCase();
          const tooLarge = file.size > MAX_UPLOAD_BYTES;
          const unsupported = !UPLOAD_EXTENSIONS.has(extension);
          const entry = {
            key,
            name: file.name,
            status: tooLarge || unsupported ? 'error' : 'uploading',
            ...(tooLarge ? { reason: 'file.tooLarge' } : unsupported ? { reason: 'file.unsupported' } : {}),
          };
          set({ files: [...state.files, entry] });
          if (entry.status === 'uploading') void uploadFile(file, key);
        }
      }

      /**
       * 移除一个附件。
       * @param key - 临时 id。
       */
      function removeFile(key) {
        set({ files: state.files.filter((file) => file.key !== key) });
      }

      /** 收到紧凑态，保留消息与草稿。 */
      function minimize() {
        set({ mode: 'compact', historyOpen: false, confirmClear: false });
      }

      /** 展开完整对话。 */
      function expand() {
        set({ mode: 'expanded' });
      }

      /**
       * 更新草稿。
       * @param value - 输入框内容。
       */
      function setDraft(value) {
        set({ draft: String(value) });
      }

      /** 移除选中引用。 */
      function clearSelection() {
        set({ selection: '' });
      }

      /** 开一个全新话题；当前对话先留在历史里。 */
      function newChat() {
        const current = abort;
        abort = null;
        current?.abort();
        if (state.streaming) finishStream({ stopped: true });
        if (state.messages.length > 0) persist(state.messages);
        currentId = null;
        createdAt = 0;
        set({
          messages: [],
          streamText: '',
          streaming: false,
          stopped: false,
          truncated: false,
          error: null,
          draft: '',
          selection: '',
          historyOpen: false,
          confirmClear: false,
          model: undefined,
          via: undefined,
          files: [],
          thinking: false,
          tools: [],
          citations: [],
          toolUsage: null,
        });
      }

      /** 打开本地历史。 */
      function openHistory() {
        set({ historyOpen: true, mode: 'expanded', confirmClear: false });
      }

      /** 关闭本地历史。 */
      function closeHistory() {
        set({ historyOpen: false, confirmClear: false });
      }

      /** 切换本地历史。 */
      function toggleHistory() {
        if (state.historyOpen) closeHistory();
        else openHistory();
      }

      /**
       * 恢复一条历史对话。
       * @param id - 历史条目 id。
       */
      function restoreHistory(id) {
        const entry = state.history.find((item) => item.id === id);
        if (entry === undefined) return;
        const current = abort;
        abort = null;
        current?.abort();
        if (state.streaming) finishStream({ stopped: true });
        currentId = entry.id;
        createdAt = entry.createdAt;
        set({
          messages: entry.messages.map((message) => ({ ...message })),
          streamText: '',
          streaming: false,
          stopped: false,
          truncated: false,
          error: null,
          historyOpen: false,
          confirmClear: false,
          mode: 'expanded',
          tools: [],
          citations: [],
          toolUsage: null,
        });
      }

      /**
       * 删除一条历史。
       * @param id - 历史条目 id。
       */
      function removeHistory(id) {
        const history = state.history.filter((item) => item.id !== id);
        writeHistory(history);
        if (currentId === id) currentId = null;
        set({ history });
      }

      /** 清空历史：第一次点击进入确认态，第二次才真的清空。 */
      function clearHistory() {
        if (!state.confirmClear) {
          set({ confirmClear: true });
          if (confirmTimer !== 0) window.clearTimeout(confirmTimer);
          confirmTimer = window.setTimeout(() => {
            confirmTimer = 0;
            if (state.confirmClear) set({ confirmClear: false });
          }, CONFIRM_MS);
          return;
        }
        if (confirmTimer !== 0) {
          window.clearTimeout(confirmTimer);
          confirmTimer = 0;
        }
        writeHistory([]);
        currentId = null;
        set({ history: [], confirmClear: false });
      }

      /**
       * 复制一段文本。
       * @param text - 要复制的文本。
       * @param id - 消息 id，用于显示「已复制」。
       */
      async function copy(text, id) {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          try {
            const area = document.createElement('textarea');
            area.value = text;
            area.setAttribute('readonly', '');
            area.style.cssText = 'position:fixed;left:-9999px;top:0';
            document.body.appendChild(area);
            area.select();
            document.execCommand('copy');
            area.remove();
          } catch {
            return;
          }
        }
        set({ copiedId: id });
        if (copyTimer !== 0) window.clearTimeout(copyTimer);
        copyTimer = window.setTimeout(() => {
          copyTimer = 0;
          set({ copiedId: null });
        }, FEEDBACK_MS);
      }

      if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('selectionchange', rememberSelection);
      }

      /** 释放所有定时器与请求。 */
      function dispose() {
        const current = abort;
        abort = null;
        current?.abort();
        if (streamTimer !== 0) window.clearTimeout(streamTimer);
        if (copyTimer !== 0) window.clearTimeout(copyTimer);
        if (confirmTimer !== 0) window.clearTimeout(confirmTimer);
        streamTimer = 0;
        copyTimer = 0;
        confirmTimer = 0;
        if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
          document.removeEventListener('selectionchange', rememberSelection);
        }
        listeners.clear();
      }

      return {
        subscribe,
        snapshot,
        open,
        openWith,
        close,
        toggle,
        minimize,
        expand,
        send,
        stop,
        retry,
        setDraft,
        clearSelection,
        toggleWeb,
        toggleDeepThink,
        addFiles,
        removeFile,
        newChat,
        openHistory,
        closeHistory,
        toggleHistory,
        restoreHistory,
        removeHistory,
        clearHistory,
        copy,
        dispose,
      };
    }

    // ── 样式：只用 DSH token，跟随浅色/深色与用户字号 ──────────────────────

    const STYLE_ID = `${PLUGIN_ID}:styles`;
    const CSS = `
/* 浮在整个 frame 之上，包括设置弹窗这类模态：小窗的用途就是在任务/设置进行中
   也能随时看，而且设置页里的「立即打开」必须真的出现在最前面。
   根层整体 click-through，只有卡片自己接指针事件。 */
.vqc-root{position:absolute;inset:0;pointer-events:none;z-index:2000}
.vqc-panel{position:absolute;right:24px;bottom:96px;display:flex;flex-direction:column;box-sizing:border-box;width:min(420px,calc(100vw - 32px));background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary,#0f1115);border:0;border-radius:var(--vqc-radius,24px);--vqc-radius:24px;box-shadow:var(--dsw-elevation-prominent,0 0 0 .5px #0000001a,0 3px 8px #0000000a);--dsw-elevation-stroke-color:var(--dsw-alias-border-l2,#0000001a);pointer-events:auto;overflow:hidden;font-size:var(--dsh-content-font-size,14px);line-height:1.55;animation:vqc-rise 160ms ease-out}
.vqc-panel--compact{min-height:48px;max-height:240px}
.vqc-panel--expanded{height:min(520px,calc(100dvh - 120px))}
@keyframes vqc-rise{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.vqc-panel{animation:none}.vqc-caret{animation:none}}
.vqc-convbar{display:flex;align-items:center;gap:8px;flex:none;height:44px;padding:0 12px 0 16px;border-bottom:.5px solid var(--dsw-alias-border-l1,#0000000a)}
.vqc-convTitle{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--dsh-content-font-size-secondary,13px);font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary,#0f1115)}
.vqc-convActions{display:flex;align-items:center;gap:2px;flex:none;margin-left:auto}
.vqc-iconbtn{display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;padding:0;border:0;border-radius:var(--dsw-radius-sm,8px);background:transparent;color:var(--dsw-alias-label-tertiary,#81858c);cursor:pointer}
.vqc-iconbtn:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f);color:var(--dsw-alias-label-primary,#0f1115)}
.vqc-iconbtn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4176e6);outline-offset:1px}
.vqc-iconbtn:disabled{opacity:.4;cursor:default}
.vqc-iconbtn--active{color:var(--dsw-alias-state-business-primary,#4176e6)}
.vqc-compact{display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px;box-sizing:border-box;min-height:48px;padding:10px}
/* 只有一行、没有其它内容时，整个窗口收成一枚胶囊：圆角取高度的一半，
   与外层的 panel 圆角（28）同一量级，切到展开态时不会跳档。 */
/* 单行胶囊的圆角 = 行高 48 的一半 = 24，与常态窗口同一个值：
   展开/收起时只有高度变化，圆角不动，切换不跳档。 */
.vqc-panel--single{border-radius:999px;corner-shape:round}
.vqc-brand{flex:none;color:var(--dsw-alias-label-tertiary,#81858c)}
.vqc-input{flex:1;min-width:0;box-sizing:border-box;margin:0;min-height:28px;padding:3px 0;border:0;outline:0;background:transparent;color:inherit;font:inherit;line-height:22px;resize:none;overflow-y:auto;scrollbar-width:thin}
.vqc-input[data-overflow="true"]{-webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 18px),transparent);mask-image:linear-gradient(to bottom,#000 calc(100% - 18px),transparent)}
.vqc-input::placeholder{color:var(--dsw-alias-label-tertiary,#81858c)}
.vqc-add{display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;padding:0;border:0;border-radius:999px;corner-shape:round;background:transparent;color:var(--dsw-alias-label-tertiary,#81858c);cursor:pointer}
.vqc-add:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f);color:var(--dsw-alias-label-primary,#0f1115)}
.vqc-add svg{width:16px;height:16px}
.vqc-add svg *{stroke-width:1.5}
.vqc-add:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4176e6);outline-offset:1px}
.vqc-pill{display:inline-flex;align-items:center;justify-content:center;flex:none;box-sizing:border-box;width:34px;height:28px;padding:0;border:.5px solid var(--dsw-alias-border-l1,#0000000a);border-radius:999px;corner-shape:round;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-tertiary,#81858c);cursor:pointer}
.vqc-pill:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f);color:var(--dsw-alias-label-primary,#0f1115)}
.vqc-pill:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4176e6);outline-offset:1px}
.vqc-pill--on{border-color:#4176e633;background:#4176e614;color:var(--dsw-alias-state-business-primary,#4176e6)}
.vqc-pill--on:hover{background:#4176e620;color:var(--dsw-alias-state-business-primary,#4176e6)}
.vqc-files{display:flex;flex-wrap:nowrap;gap:6px;order:-2;flex:1 1 100%;padding:0 0 6px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 20px),transparent)}
.vqc-files::-webkit-scrollbar{height:0}
.vqc-win .vqc-files:hover{scrollbar-width:thin;scrollbar-color:var(--dsw-alias-scrollbar-bg-l1,#0000001a) transparent}
.vqc-win .vqc-files:hover::-webkit-scrollbar{height:3px}
.vqc-win .vqc-files:hover::-webkit-scrollbar-thumb{background:var(--dsw-alias-scrollbar-bg-l1,#0000001a);border-radius:2px}
.vqc-fileChip{display:inline-flex;align-items:center;gap:6px;max-width:200px;padding:3px 4px 3px 8px;border:.5px solid var(--dsw-alias-border-l1,#0000000a);border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-secondary,#61666b);font-size:12px;line-height:18px}
.vqc-fileChip--error{border-color:#d92d2055;color:var(--dsw-alias-state-error-primary,#d92d20)}
.vqc-fileChip--quote{max-width:280px}
.vqc-fileName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vqc-fileChip .vqc-iconbtn{width:20px;height:20px}
.vqc-send{display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;padding:0;border:0;border-radius:999px;corner-shape:round;background:var(--dsw-alias-button-info-fill,#4d6bfe);color:#fff;cursor:pointer;transition:background-color .1s}
.vqc-send:hover:not(:disabled){background:var(--dsw-alias-button-info-hover,#3f5af0)}
.vqc-send:disabled{opacity:.4;cursor:default}
.vqc-send--stop{background:var(--dsw-alias-button-ghost-active-fill,#ebeef2);color:var(--dsw-alias-label-primary,#0f1115);transform:none}
.vqc-send--stop:hover:not(:disabled){background:var(--dsw-alias-button-ghost-active-hover,#e9ecf2)}
.vqc-body{flex:1;min-height:0;overflow-y:auto;padding:12px 16px;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-scrollbar-bg-l1,#0000001a) transparent}
.vqc-body::-webkit-scrollbar{width:8px;height:8px}
.vqc-body::-webkit-scrollbar-thumb{background:var(--dsw-alias-scrollbar-bg-l1,#0000001a);border-radius:999px;corner-shape:round}
.vqc-body::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-scrollbar-hover-l1,#00000026)}
.vqc-msg{display:flex;flex-direction:column;gap:4px;margin-bottom:16px}
.vqc-msg--user{align-items:flex-end}
.vqc-msg--user .vqc-msgActions{align-self:flex-end}
.vqc-msg:last-child{margin-bottom:0}
/* 用户气泡：右对齐，最大宽度取 DSH 的 min(内容宽×0.702, 82%)，左侧因此永远留白；
   底色用「业务蓝 8% 叠在 bg-layer 上」复现 DSH 实测的 #EFF3FF，深色主题会自动跟着变。 */
.vqc-bubble{box-sizing:border-box;max-width:min(calc(var(--dsh-chat-content-width,748px) * .702),82%);padding:10px 14px;border-radius:var(--dsw-radius-md,12px);background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#4176e6) 8%,var(--dsw-alias-bg-layer-2,#fff));color:var(--dsw-alias-label-primary,#0f1115);line-height:22px;white-space:pre-wrap;overflow-wrap:anywhere}
.vqc-prose{overflow-wrap:anywhere}
.vqc-prose .vqc-paragraph{margin:0 0 8px}
.vqc-prose .vqc-paragraph:last-child{margin-bottom:0}
.vqc-prose .vqc-heading{margin:12px 0 6px;font-weight:600;line-height:1.45}
.vqc-prose h3.vqc-heading{font-size:15px;line-height:22px}
.vqc-prose h4.vqc-heading{font-size:14px;line-height:20px}
.vqc-prose h5.vqc-heading,.vqc-prose h6.vqc-heading{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary,#61666b)}
.vqc-prose .vqc-heading:first-child{margin-top:0}
.vqc-prose .vqc-list{margin:0 0 8px;padding-left:20px}
.vqc-prose .vqc-list:last-child{margin-bottom:0}
.vqc-prose .vqc-list li{margin:2px 0}
.vqc-prose .vqc-list li>p{margin:0}
.vqc-prose blockquote p{margin:0}
.vqc-prose .vqc-code{margin:0 0 8px;padding:8px 10px;overflow:auto;border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-markdown-code-block,#f9fafb);font:var(--dsw-font-markdown-code-block,11px/19px ui-monospace,monospace)}
.vqc-prose .vqc-code code{padding:0;background:transparent;font:inherit;white-space:pre}
.vqc-prose code{padding:1px 4px;border-radius:var(--dsw-radius-xs,4px);background:var(--dsw-alias-markdown-inline-code,#f2f3f5);font:var(--dsw-font-markdown-code-block,11px/19px ui-monospace,monospace)}
.vqc-prose a{color:var(--dsw-alias-link,#4176e6);text-decoration:none}
.vqc-prose a:hover{text-decoration:underline}
.vqc-prose blockquote{margin:0 0 8px;padding-left:10px;border-left:2px solid var(--dsw-alias-border-l2,#0000001a);color:var(--dsw-alias-label-secondary,#61666b)}
.vqc-caret{display:inline-block;width:2px;height:1em;margin-left:2px;vertical-align:-2px;background:var(--dsw-alias-label-tertiary,#81858c);animation:vqc-blink 1s steps(2) infinite}
@keyframes vqc-blink{50%{opacity:0}}
.vqc-thinking{color:var(--dsw-alias-label-tertiary,#81858c)}
.vqc-thinking--deep{display:inline-flex;align-items:center;gap:6px;color:var(--dsw-alias-state-business-primary,#4176e6)}
.vqc-msgActions{display:flex;align-items:center;gap:4px;margin-top:2px;opacity:0;transition:opacity 120ms ease-out}
.vqc-msg:hover .vqc-msgActions,.vqc-msg:focus-within .vqc-msgActions{opacity:1}
@media (hover:none){.vqc-msgActions{opacity:1}}
.vqc-inlineAction{display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border:0;border-radius:var(--dsw-radius-xs,4px);background:transparent;color:var(--dsw-alias-label-tertiary,#81858c);font:inherit;font-size:12px;line-height:18px;cursor:pointer}
.vqc-inlineAction:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f);color:var(--dsw-alias-label-primary,#0f1115)}
.vqc-note{margin-top:4px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#81858c)}
.vqc-tools{display:flex;flex-wrap:wrap;gap:4px;margin:2px 0 4px}
.vqc-toolChip{display:inline-flex;align-items:center;gap:4px;max-width:100%;padding:2px 8px;border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-bg-layer-1,#fff);border:.5px solid var(--dsw-alias-border-l1,#0000000a);color:var(--dsw-alias-label-secondary,#61666b);font-size:11px;line-height:16px}
.vqc-toolDetail{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;color:var(--dsw-alias-label-tertiary,#81858c)}
.vqc-citations{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:8px;padding-top:8px;border-top:.5px solid var(--dsw-alias-border-l1,#0000000a)}
.vqc-citationsTitle{flex:none;margin-right:2px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#81858c)}
.vqc-citation{display:inline-flex;align-items:center;gap:4px;max-width:100%;padding:3px 8px;border:.5px solid var(--dsw-alias-border-l1,#0000000a);border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-secondary,#61666b);font-size:12px;line-height:18px;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vqc-citation:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f);color:var(--dsw-alias-label-primary,#0f1115)}
.vqc-citation svg{flex:none}
.vqc-error{display:flex;align-items:flex-start;gap:8px;margin-top:12px;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l1,#0000000a);border-radius:var(--dsw-radius-md,12px);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-secondary,#61666b);font-size:13px;line-height:20px}
.vqc-errorIcon{flex:none;margin-top:2px;color:var(--dsw-alias-state-error-primary,#d92d20)}
.vqc-errorBody{flex:1;min-width:0}
.vqc-errorActions{display:flex;gap:6px;margin-top:6px}
.vqc-textbtn{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border:.5px solid var(--dsw-alias-border-l1,#0000000a);border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary,#0f1115);font:inherit;font-size:12px;line-height:18px;cursor:pointer}
.vqc-textbtn:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f)}
.vqc-linkbtn{padding:0;border:0;background:transparent;color:var(--dsw-alias-state-business-primary,#4176e6);font:inherit;font-size:12px;line-height:18px;cursor:pointer}
.vqc-linkbtn:hover{color:var(--dsw-alias-button-info-hover,#3f5af0);text-decoration:underline}
.vqc-empty{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:16px 4px}
.vqc-emptyIcon{color:var(--dsw-alias-state-business-primary,#4176e6)}
.vqc-emptyTitle{font-size:13px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary,#0f1115)}
.vqc-emptyBody{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#61666b)}
.vqc-emptyHint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#81858c)}
.vqc-history{display:flex;flex-direction:column;gap:2px}
.vqc-historyHead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 -8px 4px;padding:0 8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#81858c)}
.vqc-historyHeadTitle{font-size:12px;line-height:18px}
.vqc-historyItem{display:flex;align-items:center;gap:8px;box-sizing:border-box;width:100%;padding:6px 8px;border-radius:var(--dsw-radius-sm,8px)}
.vqc-historyItem:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f)}
.vqc-historyMain{flex:1;min-width:0;padding:0;border:0;background:transparent;text-align:left;font:inherit;cursor:pointer}
.vqc-historyTitle{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#0f1115)}
.vqc-historySlot{display:flex;align-items:center;justify-content:flex-end;flex:none;width:52px;height:20px}
.vqc-historyTime{font-size:12px;line-height:20px;color:var(--dsw-alias-label-tertiary,#81858c);white-space:nowrap}
.vqc-historyRemove{display:none;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:var(--dsw-radius-xs,4px);background:transparent;color:var(--dsw-alias-label-tertiary,#81858c);cursor:pointer}
.vqc-historyItem:hover .vqc-historyTime{display:none}
.vqc-historyItem:hover .vqc-historyRemove{display:inline-flex}

/* 设置页：宿主 Settings 里的一个 section，沿用内容列宽 760 与 --dsw-* token。 */
.vqcs-page{display:flex;flex-direction:column;gap:14px;width:100%;max-width:760px;box-sizing:border-box}
.vqcs-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.vqcs-headText{display:flex;flex-direction:column;gap:6px;min-width:0}
.vqcs-title{margin:0;color:var(--dsw-alias-label-primary,#0f1115);font-size:16px;font-weight:600;line-height:24px}
.vqcs-subtitle{margin:0;color:var(--dsw-alias-label-tertiary,#81858c);font-size:13px;line-height:20px}
.vqcs-card{box-sizing:border-box;display:flex;flex-direction:column;gap:8px;padding:14px 16px;border:1px solid var(--dsw-alias-border-l2,#0000001a);border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-alias-bg-layer-3,#fff)}
.vqcs-cardHead{display:flex;align-items:center;justify-content:space-between;gap:12px}
.vqcs-label{color:var(--dsw-alias-label-primary,#0f1115);font-size:13px;font-weight:600;line-height:20px}
.vqcs-hint{color:var(--dsw-alias-label-tertiary,#81858c);font-size:12px;line-height:18px}
.vqcs-hint--warn{color:var(--dsw-alias-state-warn-primary,#f79009)}
.vqcs-editor{box-sizing:border-box;width:100%;height:clamp(200px,30vh,420px);min-height:140px;max-height:70vh;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2,#0000001a);border-radius:var(--dsw-radius-md,12px);background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary,#0f1115);font-family:var(--dsw-font-markdown-code-block,ui-monospace,monospace);font-size:12.5px;line-height:1.7;resize:vertical;overflow:auto;outline:none}
.vqcs-editor:focus-visible{border-color:var(--dsw-alias-state-business-primary,#4176e6)}
.vqcs-editor::placeholder{color:var(--dsw-alias-label-tertiary,#81858c)}
.vqcs-select{box-sizing:border-box;width:100%;padding:6px 34px 6px 10px;border:1px solid var(--dsw-alias-border-l2,#0000001a);border-radius:var(--dsw-radius-md,12px);background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary,#0f1115);font:inherit;font-size:13px;line-height:20px;outline:none;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='%2381858c' stroke-width='1'%3E%3Cpath d='M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center}
.vqcs-select:focus-visible{border-color:var(--dsw-alias-state-business-primary,#4176e6)}
.vqcs-row{display:flex;align-items:center;justify-content:space-between;gap:16px;cursor:pointer}
.vqcs-row--plain{cursor:default}
.vqcs-rowText{display:flex;flex-direction:column;gap:2px;min-width:0}
.vqcs-switch{position:relative;flex:none;width:36px;height:20px;padding:0;border:0;border-radius:999px;corner-shape:round;background:var(--dsw-alias-border-l2,#0000001a);cursor:pointer;transition:background .12s}
.vqcs-switch--on{background:var(--dsw-alias-state-business-primary,#4176e6)}
.vqcs-switch:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4176e6);outline-offset:2px}
.vqcs-knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;corner-shape:round;background:#fff;box-shadow:0 1px 2px #0000002e;transition:transform .12s}
.vqcs-switch--on .vqcs-knob{transform:translateX(16px)}
@media (prefers-reduced-motion:reduce){.vqcs-switch,.vqcs-knob{transition:none}}
.vqcs-divider{height:1px;background:var(--dsw-alias-border-l1,#0000000a)}
.vqcs-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:20px}
.vqcs-status{font-size:12px;line-height:18px;color:var(--dsw-alias-state-success-primary,#12b76a)}
.vqcs-status--error{color:var(--dsw-alias-state-error-primary,#d92d20)}
.vqcs-loading{padding:24px 4px;color:var(--dsw-alias-label-tertiary,#81858c);font-size:13px;line-height:20px}
.vqcs-btn{appearance:none;font:inherit;font-size:13px;line-height:20px;padding:5px 14px;border-radius:var(--dsw-radius-sm,8px);border:1px solid var(--dsw-alias-border-l2,#0000001a);background:transparent;color:var(--dsw-alias-label-secondary,#61666b);cursor:pointer}
.vqcs-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#2631480f);color:var(--dsw-alias-label-primary,#0f1115)}
.vqcs-btn:disabled{opacity:.45;cursor:default}
.vqcs-btnPrimary{border-color:transparent;background:var(--dsw-alias-label-primary,#0f1115);color:var(--dsw-alias-bg-layer-3,#fff)}
.vqcs-btnPrimary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,#33363b);color:var(--dsw-alias-bg-layer-3,#fff)}
.vqcs-link{appearance:none;padding:0;border:0;background:none;color:var(--dsw-alias-state-business-primary,#4176e6);font:inherit;font-size:12px;line-height:18px;cursor:pointer}
.vqcs-link:disabled{opacity:.45;cursor:default}
.vqcs-link:hover:not(:disabled){text-decoration:underline}
/* 键位：照抄 DSH 快捷键速查里的 .keys/.key——不加边框与底色，
   tertiary 色 + 3px 键间距；带底色那种只用于 tooltip。 */
.vqcs-keys{display:inline-flex;flex:none;align-items:center;gap:3px;width:fit-content;color:var(--dsw-alias-label-tertiary,#81858c);font-size:12px;line-height:16px;white-space:nowrap}
.vqcs-keycap{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;font:inherit}
.vqc-historyRemove:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f);color:var(--dsw-alias-label-primary,#0f1115)}
.vqc-historyEmpty{padding:16px 4px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#81858c)}
.vqc-composer{display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px;flex:none;padding:10px;border-top:.5px solid var(--dsw-alias-border-l2,#0000001a)}
.vqc-composerInput{min-height:28px;max-height:120px;padding:3px 0}
.vqc-rowActions{display:flex;align-items:center;gap:8px;flex:none;margin-left:auto}
/* 输入折行后改纵向：文本独占上面整行，按钮全部沉到最底下那行。 */
.vqc-stacked{flex-wrap:wrap;row-gap:6px}
.vqc-stacked .vqc-input{order:-1;flex:1 1 100%}
.vqc-crash{position:absolute;right:24px;bottom:96px;display:flex;align-items:center;gap:10px;max-width:420px;padding:12px 14px;border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-alias-bg-layer-2,#fff);box-shadow:var(--dsw-elevation-prominent,0 0 0 .5px #0000001a,0 3px 8px #0000000a);color:var(--dsw-alias-label-secondary,#61666b);font-size:13px;line-height:20px;pointer-events:auto}
.vqc-srOnly{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
`;

    /** 安装样式；已存在时复用，卸载时只移除自己创建的节点。 */
    function installStyles() {
      if (document.getElementById(STYLE_ID) !== null) return () => {};
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
      return () => {
        style.remove();
      };
    }

    // ── React 组件 ──────────────────────────────────────────────────────────

    /**
     * 图标按钮。
     * @param props - label/icon/size/onClick/disabled/active。
     */
    function IconButton({ label, icon, glyph, size = 16, onClick, disabled = false, active = false, className }) {
      return h(
        'button',
        {
          type: 'button',
          className: `${className ?? 'vqc-iconbtn'}${active ? ' vqc-iconbtn--active' : ''}`,
          'aria-label': label,
          title: label,
          onClick,
          disabled,
        },
        glyph ? h(glyph, { size }) : h(DshIcon, { name: icon, size }),
      );
    }

    /**
     * 引用 chip 的图标：Lucide 的 type（衬线 T）。24 viewBox + 描边 2，
     * 渲染到 14px 时描边约 1.2px，比 DSH 的 1px 略重，但 T 的笔画本来就细，
     * 在这个尺寸下反而更清楚。
     */
    function TypeGlyph({ size = 14 }) {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        h('polyline', { points: '4 7 4 4 20 4 20 7' }),
        h('line', { x1: 9, y1: 20, x2: 15, y2: 20 }),
        h('line', { x1: 12, y1: 4, x2: 12, y2: 20 }),
      );
    }

    /**
     * 关闭图标：DSH 的 X 是平头描边，和同一行的圆形图标放一起偏硬，
     * 这里自绘成圆头、并把墨迹收到比圆形略小（对角线在大脑里会被放大）。
     */
    function CloseGlyph({ size = 15 }) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1,
          strokeLinecap: 'round',
          'aria-hidden': 'true',
        },
        h('path', { d: 'M3 3l10 10' }),
        h('path', { d: 'M13 3L3 13' }),
      );
    }

    /**
     * 对话状态行：标题 + 展开/收起、历史、新话题、关闭。
     * 紧凑态有对话时压在输入行上方，展开态就是它的 header——两处同一块，不重复实现。
     * @param props - title/expanded/historyOpen/labels/各按钮回调。
     */
    function ConversationBar({ title, expanded, historyOpen, labels, onToggleMode, onHistory, onNewChat, onClose }) {
      return h(
        'div',
        { className: 'vqc-convbar' },
        h('span', { className: 'vqc-convTitle', title: title }, title),
        h(
          'div',
          { className: 'vqc-convActions' },
          h(IconButton, { label: labels.newChat, icon: 'IconNewChatOutlineRegular', size: 15, onClick: onNewChat }),
          h(IconButton, {
            label: labels.history,
            icon: 'IconClockOutlineRegular',
            active: historyOpen,
            onClick: onHistory,
          }),
          // 展开/收起只用同一支雪佛龙翻转方向，不再用「四角」那套全屏语言。
          h(IconButton, {
            label: expanded ? labels.minimize : labels.expand,
            icon: expanded ? 'IconChevronDownOutlineRegular' : 'IconChevronUpOutlineRegular',
            // 雪佛龙的墨迹只有 9×4.6，按 16px 画会显得比邻居小一圈，单独放大一档。
            size: 19,
            onClick: onToggleMode,
          }),
          // 同样外框下 X 比圆形更「满」，保持 16 才和其它按钮同重量。
          h(IconButton, { label: labels.close, glyph: CloseGlyph, size: 15, onClick: onClose }),
        ),
      );
    }

    /**
     * 自动增高的多行输入框。
     * @param props - value/onChange/onKeyDown/placeholder/ariaLabel/className/inputRef。
     */
    function AutoTextarea({ value, onChange, onKeyDown, placeholder, ariaLabel, className, inputRef, onMultilineChange }) {
      const localRef = React.useRef(null);
      const assignRef = (node) => {
        localRef.current = node;
        if (inputRef !== undefined) inputRef.current = node;
      };
      React.useLayoutEffect(() => {
        const node = localRef.current;
        if (node === null) return;
        node.style.height = 'auto';
        const full = node.scrollHeight;
        const style = window.getComputedStyle(node);
        const line = Number.parseFloat(style.lineHeight) || 22;
        const pad = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
        // 最高 4 行半：再长就在框内滚动，并给底部加渐隐。
        const max = Math.round(line * 4.5 + pad);
        node.style.height = `${Math.min(full, max)}px`;
        node.dataset.overflow = full > max + 1 ? 'true' : 'false';
        // 一行的高度 = 行高 + 上下内边距；超过它就是多行，输入区要改成上下结构。
        if (onMultilineChange !== undefined) onMultilineChange(full > line + pad + 1);
      }, [value]);
      return h('textarea', {
        ref: assignRef,
        className: `vqc-input ${className ?? ''}`.trim(),
        rows: 1,
        value,
        placeholder,
        'aria-label': ariaLabel,
        onChange: (event) => onChange(event.target.value),
        onKeyDown,
      });
    }

    /** 由 apply 注入的文案函数；error boundary 无法通过 props 拿到上下文。 */
    let tRef = (key) => key;

    /**
     * 错误边界：浮层内部崩溃不冒泡到 shell.overlay。
     */
    class OverlayBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { failed: false };
        this.reset = this.reset.bind(this);
      }

      static getDerivedStateFromError() {
        return { failed: true };
      }

      componentDidCatch(error) {
        console.error(`[${PLUGIN_ID}] overlay crashed`, error);
      }

      reset() {
        this.setState({ failed: false });
      }

      render() {
        if (this.state.failed) {
          return h(
            'div',
            { className: 'vqc-crash', role: 'alert' },
            h(DshIcon, { name: 'IconWarningOutlineRegular', size: 16 }),
            h('span', { className: 'vqc-errorBody' }, tRef('error.crash')),
            h('button', { type: 'button', className: 'vqc-linkbtn', onClick: this.reset }, tRef('action.retry')),
          );
        }
        return this.props.children;
      }
    }

    /**
     * 发送箭头：与 DSH 输入区同一条路径（16×16，fill 继承 currentColor）。
     */
    function SendArrow() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': 'true' },
        h('path', {
          d: 'M8.3125 0.980183C8.66767 1.0531 8.97902 1.20418 9.2627 1.43233C9.48724 1.61297 9.73029 1.85793 9.97949 2.10714L14.707 6.83468L13.293 8.24874L9 3.95577V15.0417H7V3.95577L2.70703 8.24874L1.29297 6.83468L6.02051 2.10714C6.26971 1.85793 6.51277 1.61297 6.7373 1.43233C6.97662 1.23986 7.28445 1.04402 7.6875 0.980183C7.8973 0.947006 8.1031 0.95516 8.3125 0.980183Z',
          fill: 'currentColor',
        }),
      );
    }

    /**
     * 停止方块：与 DSH 输入区一致（16×16 里 10×10、圆角 3）。
     */
    function StopSquare() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': 'true' },
        h('rect', { x: 3, y: 3, width: 10, height: 10, rx: 3, fill: 'currentColor' }),
      );
    }

    /**
     * DeepSeek 鲸鱼标记：与 vt-mine-models 插件里的模型图标同一份路径，
     * 24 viewBox、实心填充，用品牌蓝。
     */
    function DeepSeekMark({ size = 20 }) {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'currentColor',
          'aria-hidden': 'true',
        },
        h('path', { d: 'M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z' }),
      );
    }

    /**
     * 深度思考图标：DeepSeek 网页端的原子形——两个交叉椭圆加中心点。
     * DSH 图标库没有这个形状，所以直接描；16×16、1.5 描边与其他图标对齐。
     */
    function AtomIcon({ size = 15 }) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1,
          'aria-hidden': 'true',
        },
        h('ellipse', { cx: 8, cy: 8, rx: 6.2, ry: 2.9, transform: 'rotate(45 8 8)' }),
        h('ellipse', { cx: 8, cy: 8, rx: 6.2, ry: 2.9, transform: 'rotate(-45 8 8)' }),
        h('circle', { cx: 8, cy: 8, r: 1.1, fill: 'currentColor', stroke: 'none' }),
      );
    }

    /**
     * 联网图标直接用 DSH 的 globe：形状与网页端一致，描边也自动跟随图标体系。
     */
    function WebGlyph({ size = 16 }) {
      return h(DshIcon, { name: 'IconGlobeOutlineRegular', size });
    }

    /**
     * 胶囊开关：深度思考、联网这类「开/关」状态用。
     * 只有图标，开启时用品牌色底；`aria-pressed` 让读屏能听出状态。
     * @param props - label/glyph/glyphSize/active/onClick；`glyph` 是图标组件。
     *   `glyphSize` 按各图标的墨迹大小单独调，好让同一行的图标视觉重量一致。
     */
    function PillButton({ label, glyph, glyphSize = 16, active = false, onClick }) {
      return h(
        'button',
        {
          type: 'button',
          className: `vqc-pill${active ? ' vqc-pill--on' : ''}`,
          'aria-label': label,
          'aria-pressed': active ? 'true' : 'false',
          title: label,
          onClick,
        },
        h(glyph, { size: glyphSize }),
      );
    }

    /**
     * 附件 chip 行：紧凑态与展开态共用。
     */
    function ChipRow({ quote, files, labels, onRemoveQuote, onRemoveFile }) {
      const hasQuote = typeof quote === 'string' && quote.length > 0;
      const hasFiles = Array.isArray(files) && files.length > 0;
      if (!hasQuote && !hasFiles) return null;
      return h(
        'div',
        { className: 'vqc-files' },
        hasQuote
          ? h(SelectionChip, {
              text: quote,
              label: labels.quoteChip,
              removeLabel: labels.removeQuote,
              onRemove: onRemoveQuote,
            })
          : null,
        hasFiles ? files.map((file) => {
          const failed = file.status === 'error';
          const text =
            file.status === 'uploading'
              ? `${file.name} · ${labels.uploading}`
              : failed
                ? `${file.name} · ${labels[file.reason] ?? labels.fileFailed}`
                : file.name;
          return h(
            'span',
            {
              key: file.key,
              className: `vqc-fileChip${failed ? ' vqc-fileChip--error' : ''}`,
              title: file.name,
            },
            h(DshIcon, { name: 'IconPaperclipOutlineRegular', size: 14 }),
            h('span', { className: 'vqc-fileName' }, text),
            h(
              'button',
              {
                type: 'button',
                className: 'vqc-iconbtn',
                'aria-label': labels.removeFile,
                title: labels.removeFile,
                onClick: () => onRemoveFile(file.key),
              },
              h(DshIcon, { name: 'IconCloseOutlineRegular', size: 12 }),
            ),
          );
        }) : null,
      );
    }

    /**
     * 选中文本 chip。
     * @param props - text/onRemove/label/removeLabel。
     */
    function SelectionChip({ text, onRemove, label, removeLabel }) {
      return h(
        'span',
        { className: 'vqc-fileChip vqc-fileChip--quote', title: text },
        h(TypeGlyph, { size: 14 }),
        h('span', { className: 'vqc-fileName' }, text.length > 0 ? text : label),
        h(
          'button',
          {
            type: 'button',
            className: 'vqc-iconbtn',
            'aria-label': removeLabel,
            title: removeLabel,
            onClick: onRemove,
          },
          h(DshIcon, { name: 'IconCloseOutlineRegular', size: 12 }),
        ),
      );
    }

    /**
     * 一条消息。
     * @param props - message/index/copied/onCopy/labels。
     */
    function MessageRow({ message, index, copied, onCopy, labels }) {
      const isUser = message.role === 'user';
      const id = `m${index}`;
      return h(
        'div',
        { className: `vqc-msg${isUser ? ' vqc-msg--user' : ' vqc-msg--assistant'}` },
        isUser
          ? h('div', { className: 'vqc-bubble' }, message.content)
          : h('div', { className: 'vqc-prose' }, renderMarkdown(message.content)),
        isUser
          ? null
          : h(
              'div',
              { className: 'vqc-msgActions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'vqc-inlineAction',
                  onClick: () => onCopy(message.content, id),
                  'aria-label': copied ? labels.copied : labels.copy,
                },
                h(DshIcon, { name: copied ? 'IconCheckOutlineRegular' : 'IconCopyOutlineRegular', size: 14 }),
                copied ? labels.copied : labels.copy,
              ),
            ),
        isUser || !Array.isArray(message.citations) || message.citations.length === 0
          ? null
          : h(CitationList, { citations: message.citations, labels }),
      );
    }

    /**
     * 本轮发生的服务端工具调用，回答过程中提示「正在搜索 / 正在读取链接」。
     * @param props - tools/labels。
     */
    function ToolActivity({ tools, labels }) {
      const labelFor = (action) => {
        switch (action) {
          case 'open_page':
            return labels.toolOpen;
          case 'find_in_page':
            return labels.toolFind;
          case 'read_link':
            return labels.toolRead;
          default:
            return labels.toolSearch;
        }
      };
      return h(
        'div',
        { className: 'vqc-tools' },
        tools.map((tool, index) => {
          const detail =
            tool.queries.length > 0 ? tool.queries.slice(0, 2).join(' / ') : tool.url.length > 0 ? tool.url : '';
          return h(
            'span',
            { key: `tool${index}`, className: 'vqc-toolChip', title: detail },
            h(DshIcon, {
              name: tool.action === 'read_link' ? 'IconLinkOutlineRegular' : 'IconGlobeOutlineRegular',
              size: 12,
            }),
            labelFor(tool.action),
            detail.length > 0 ? h('span', { className: 'vqc-toolDetail' }, detail) : null,
          );
        }),
      );
    }

    /**
     * 引用来源列表：模型给出 citations 时才出现。
     * @param props - citations/labels。
     */
    function CitationList({ citations, labels }) {
      return h(
        'div',
        { className: 'vqc-citations' },
        h('div', { className: 'vqc-citationsTitle' }, labels.citations),
        ...citations.map((citation, index) =>
          h(
            'a',
            {
              key: `cite${index}`,
              className: 'vqc-citation',
              href: citation.url,
              target: '_blank',
              rel: 'noreferrer noopener',
              title: citation.url,
            },
            h(DshIcon, { name: 'IconLinkOutlineRegular', size: 16 }),
            h('span', null, citation.title.length > 0 ? citation.title : citation.url),
          ),
        ),
      );
    }

    /**
     * 空态。
     * @param props - labels。
     */
    function EmptyState({ labels }) {
      return h(
        'div',
        { className: 'vqc-empty' },
        h(DeepSeekMark, { size: 24, className: 'vqc-emptyIcon' }),
        h('div', { className: 'vqc-emptyTitle' }, labels.title),
        h('div', { className: 'vqc-emptyBody' }, labels.body),
        h('div', { className: 'vqc-emptyHint' }, labels.hint),
      );
    }

    /**
     * 错误卡片。
     * @param props - error/onRetry/canRetry/labels。
     */
    function ErrorCard({ error, onRetry, canRetry, labels }) {
      return h(
        'div',
        { className: 'vqc-error', role: 'alert' },
        h(DshIcon, { name: 'IconWarningOutlineRegular', size: 16, className: 'vqc-errorIcon' }),
        h(
          'div',
          { className: 'vqc-errorBody' },
          h('div', null, errorText(error.code, tRef)),
          canRetry
            ? h(
                'div',
                { className: 'vqc-errorActions' },
                h(
                  'button',
                  { type: 'button', className: 'vqc-linkbtn', title: labels.retryHint, onClick: onRetry },
                  labels.retry,
                ),
              )
            : null,
        ),
      );
    }

    /**
     * 本地历史。
     * @param props - history/confirmClear/onRestore/onRemove/onClear/labels/formatTime。
     */
    function HistoryView({ history, confirmClear, onRestore, onRemove, onClear, labels, formatTime }) {
      return h(
        'div',
        { className: 'vqc-history' },
        h(
          'div',
          { className: 'vqc-historyHead' },
          h('span', { className: 'vqc-historyHeadTitle' }, labels.title),
          history.length > 0
            ? h(
                'button',
                { type: 'button', className: 'vqc-textbtn', onClick: onClear },
                h(DshIcon, { name: 'IconTrashOutlineRegular', size: 14 }),
                h('span', null, confirmClear ? labels.confirmClear : labels.clear),
              )
            : null,
        ),
        history.length === 0
          ? h('div', { className: 'vqc-historyEmpty' }, labels.empty)
          : history.map((entry) =>
              h(
                'div',
                { key: entry.id, className: 'vqc-historyItem', role: 'group' },
                h(
                  'button',
                  { type: 'button', className: 'vqc-historyMain', onClick: () => onRestore(entry.id) },
                  h('span', { className: 'vqc-historyTitle' }, entry.title),
                ),
                // 时间和删除共用一个固定宽度的槽：hover 时只换内容，标题宽度不跳。
                h(
                  'span',
                  { className: 'vqc-historySlot' },
                  h('span', { className: 'vqc-historyTime' }, formatTime(entry.updatedAt)),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'vqc-historyRemove',
                      'aria-label': labels.remove,
                      title: labels.remove,
                      onClick: () => onRemove(entry.id),
                    },
                    h(DshIcon, { name: 'IconTrashOutlineRegular', size: 14 }),
                  ),
                ),
              ),
            ),
      );
    }

    /**
     * 浮层主体。
     * @param props - controller/labels/formatTime。
     */
    function QuickChatPanel({ controller, labels, formatTime }) {
      const state = React.useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
      const inputRef = React.useRef(null);
      /** 输入是否已经折行：是就切成「文本在上、按钮在下」的纵向结构。 */
      const [stacked, setStacked] = React.useState(false);
      const fileInputRef = React.useRef(null);
      const bodyRef = React.useRef(null);
      const wasOpen = React.useRef(false);
      const previousFocus = React.useRef(null);
      const atBottom = React.useRef(true);

      React.useEffect(() => {
        if (state.open && !wasOpen.current) {
          wasOpen.current = true;
          previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          inputRef.current?.focus();
        } else if (!state.open && wasOpen.current) {
          wasOpen.current = false;
          const previous = previousFocus.current;
          previousFocus.current = null;
          if (previous !== null && previous.isConnected && typeof previous.focus === 'function') previous.focus();
        }
      }, [state.open]);

      React.useEffect(() => {
        if (state.open && state.mode === 'expanded') inputRef.current?.focus();
      }, [state.open, state.mode]);

      React.useEffect(() => {
        const node = bodyRef.current;
        if (node === null) return;
        if (atBottom.current) node.scrollTop = node.scrollHeight;
      }, [state.messages, state.streamText, state.error, state.historyOpen]);

      /** 打开系统文件选择器；真正的上传在 controller.addFiles 里。 */
      const pickFiles = () => fileInputRef.current?.click();

      /**
       * 记录用户是否停在底部，避免用户向上翻看时被拉回。
       */
      const onScroll = () => {
        const node = bodyRef.current;
        if (node === null) return;
        atBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
      };

      /**
       * 键盘：Esc 关闭；Enter 发送；Shift+Enter 换行；输入法组合中不发送。
       * @param event - React 键盘事件。
       */
      const onKeyDown = (event) => {
        // 输入法组合中不抢键：Esc 先交给输入法取消候选，Enter 先上屏。
        if (event.nativeEvent.isComposing === true) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          controller.close();
          return;
        }
        const target = event.target;
        const isTextInput =
          target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement;
        if (isTextInput && event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          controller.send();
        }
      };

      if (!state.open) return null;

      // 联网与深度思考只挂在 DeepSeek 直连通道上：选了具体模型（或没有凭证）就没这两个能力，
      // 与其让用户点了没效果，不如把两个开关直接收起来。
      const webToolsAvailable = canUseWebTools();
      const expanded = state.mode === 'expanded';
      // 单行胶囊：紧凑态、只有这一行输入，没有消息、附件、引用、错误与流式。
      // 加这些任何一样，窗口都会变高，胶囊就不成立了。
      const singleRow =
        !expanded &&
        state.messages.length === 0 &&
        state.files.length === 0 &&
        state.selection.length === 0 &&
        state.error === null &&
        !state.streaming &&
        !stacked;
      const canSend = state.draft.trim().length > 0 && !state.streaming;
      const canRetry = state.messages.some((message) => message.role === 'user');
      const showStreaming = state.streaming || state.streamText.length > 0;

      // 标题取第一条用户消息，与本地历史里存的标题同源，所以两处永远一致。
      const conversationTitle = state.messages.length > 0 ? titleFrom(state.messages, '') : '';
      const hasConversation = conversationTitle.length > 0 || state.streaming;

      // 紧凑态只有「有对话」时才多这一行；展开态始终有，它就是 header。
      const convBar =
        expanded || hasConversation
          ? h(ConversationBar, {
              title: conversationTitle,
              expanded,
              historyOpen: state.historyOpen,
              labels,
              onToggleMode: expanded ? controller.minimize : controller.expand,
              onHistory: controller.toggleHistory,
              onNewChat: controller.newChat,
              onClose: controller.close,
            })
          : null;

      const messages = [];
      state.messages.forEach((message, index) => {
        messages.push(
          h(MessageRow, {
            key: `m${index}`,
            message,
            index,
            copied: state.copiedId === `m${index}`,
            onCopy: controller.copy,
            labels,
          }),
        );
      });

      if (showStreaming) {
        messages.push(
          h(
            'div',
            { key: 'stream', className: 'vqc-msg vqc-msg--assistant' },
            state.tools.length > 0 ? h(ToolActivity, { tools: state.tools, labels }) : null,
            state.streamText.length === 0
              ? h(
                  'div',
                  { className: `vqc-thinking${state.thinking ? ' vqc-thinking--deep' : ''}` },
                  state.thinking ? h(AtomIcon, { size: 14 }) : null,
                  state.thinking ? labels.deepThinking : labels.thinking,
                )
              : h(
                  'div',
                  { className: 'vqc-prose' },
                  renderMarkdown(state.streamText),
                  h('span', { className: 'vqc-caret', 'aria-hidden': 'true' }),
                ),
            state.citations.length > 0 ? h(CitationList, { citations: state.citations, labels }) : null,
          ),
        );
      }

      if (state.toolUsage !== null && !showStreaming) {
        messages.push(
          h(
            'div',
            { key: 'toolUsage', className: 'vqc-note' },
            labels.toolUsage
              .replace('{search}', String(state.toolUsage.search))
              .replace('{fetch}', String(state.toolUsage.fetch)),
          ),
        );
      }

      if (state.web && state.via === 'default' && state.messages.length > 0) {
        messages.push(h('div', { key: 'webFallback', className: 'vqc-note' }, labels.webUnavailable));
      }

      if (!showStreaming && state.messages.length === 0) {
        messages.push(h(EmptyState, { key: 'empty', labels: labels.emptyLabels }));
      }

      if (state.error !== null) {
        messages.push(
          h(ErrorCard, {
            key: 'error',
            error: state.error,
            onRetry: controller.retry,
            canRetry,
            labels,
          }),
        );
      } else if (state.stopped) {
        messages.push(h('div', { key: 'stopped', className: 'vqc-note' }, labels.stopped));
      } else if (state.truncated) {
        messages.push(h('div', { key: 'truncated', className: 'vqc-note' }, labels.truncated));
      }

      const body = expanded
        ? h(
            'div',
            { className: 'vqc-body', ref: bodyRef, onScroll },
            state.historyOpen
              ? h(HistoryView, {
                  history: state.history,
                  confirmClear: state.confirmClear,
                  onRestore: controller.restoreHistory,
                  onRemove: controller.removeHistory,
                  onClear: controller.clearHistory,
                  labels: labels.historyLabels,
                  formatTime,
                })
              : messages,
          )
        : null;

      // 选中文字与附件共用一行 chip，位置固定在输入行上方（两态一致）。
      const chips = h(ChipRow, {
        quote: state.historyOpen ? '' : state.selection,
        files: state.files,
        labels,
        onRemoveQuote: controller.clearSelection,
        onRemoveFile: controller.removeFile,
      });

      const composer = expanded
        ? h(
            'div',
            { className: `vqc-composer${stacked ? ' vqc-stacked' : ''}` },
            chips,
            h(IconButton, {
              label: labels.attach,
              icon: 'IconPlusOutlineRegular',
              size: 16,
              className: 'vqc-add',
              onClick: pickFiles,
            }),
            h(AutoTextarea, {
              value: state.draft,
              onChange: controller.setDraft,
              onKeyDown,
              placeholder: labels.placeholderExpanded,
              ariaLabel: labels.inputAria,
              className: 'vqc-composerInput',
              inputRef,
              onMultilineChange: setStacked,
            }),
            h(
              'div',
              { className: 'vqc-rowActions' },
              webToolsAvailable
                ? h(PillButton, {
                    label: state.deepThink ? labels.deepThinkOn : labels.deepThink,
                    glyph: AtomIcon,
                    glyphSize: 15,
                    active: state.deepThink,
                    onClick: controller.toggleDeepThink,
                  })
                : null,
              webToolsAvailable
                ? h(PillButton, {
                    label: state.web ? labels.webOn : labels.web,
                    glyph: WebGlyph,
                    active: state.web,
                    onClick: controller.toggleWeb,
                  })
                : null,
              state.streaming
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'vqc-send vqc-send--stop',
                      'aria-label': labels.stop,
                      title: labels.stop,
                      onClick: controller.stop,
                    },
                    h(StopSquare),
                  )
                : h(
                    'button',
                    {
                      type: 'button',
                      className: 'vqc-send',
                      'aria-label': labels.send,
                      title: labels.send,
                      disabled: !canSend,
                      onClick: () => controller.send(),
                    },
                    h(SendArrow),
                  ),
            ),
          )
        : null;

      const compact = expanded
        ? null
        : h(
            'div',
            { className: `vqc-compact${stacked ? ' vqc-stacked' : ''}` },
            chips,
            h(IconButton, {
              label: labels.attach,
              icon: 'IconPlusOutlineRegular',
              size: 16,
              className: 'vqc-add',
              onClick: pickFiles,
            }),
            h(AutoTextarea, {
              value: state.draft,
              onChange: controller.setDraft,
              onKeyDown,
              placeholder: labels.placeholder,
              ariaLabel: labels.inputAria,
              inputRef,
              onMultilineChange: setStacked,
            }),
            h(
              'div',
              { className: 'vqc-rowActions' },
              webToolsAvailable
                ? h(PillButton, {
                    label: state.deepThink ? labels.deepThinkOn : labels.deepThink,
                    glyph: AtomIcon,
                    glyphSize: 15,
                    active: state.deepThink,
                    onClick: controller.toggleDeepThink,
                  })
                : null,
              webToolsAvailable
                ? h(PillButton, {
                    label: state.web ? labels.webOn : labels.web,
                    glyph: WebGlyph,
                    active: state.web,
                    onClick: controller.toggleWeb,
                  })
                : null,
              state.streaming
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'vqc-send vqc-send--stop',
                      'aria-label': labels.stop,
                      title: labels.stop,
                      onClick: controller.stop,
                    },
                    h(StopSquare),
                  )
                : h(
                    'button',
                    {
                      type: 'button',
                      className: 'vqc-send',
                      'aria-label': labels.send,
                      title: labels.send,
                      disabled: !canSend,
                      onClick: () => controller.send(),
                    },
                    h(SendArrow),
                  ),
            ),
          );

      return h(
        'div',
        {
          className: `vqc-root${typeof navigator !== 'undefined' && /Win/i.test(navigator.userAgent) ? ' vqc-win' : ''}`,
          'data-vt-quick-chat': '',
        },
        h('input', {
          ref: fileInputRef,
          type: 'file',
          multiple: true,
          className: 'vqc-srOnly',
          tabIndex: -1,
          'aria-hidden': 'true',
          onChange: (event) => {
            controller.addFiles(event.target.files);
            event.target.value = '';
          },
        }),
        h(
          'section',
          {
            className: `vqc-panel ${expanded ? 'vqc-panel--expanded' : 'vqc-panel--compact'}${singleRow ? ' vqc-panel--single' : ''}`,
            role: 'dialog',
            'aria-modal': 'false',
            'aria-label': labels.panelLabel,
            onKeyDown,
          },
          convBar,
          body,
          composer,
          compact,
        ),
        h(
          'div',
          { className: 'vqc-srOnly', role: 'status', 'aria-live': 'polite' },
          state.streaming ? labels.thinking : state.error !== null ? errorText(state.error.code, tRef) : '',
        ),
      );
    }

    // ── 插件入口 ────────────────────────────────────────────────────────────

    /** 客户端依赖：槽位、语言、快捷键。 */
    const inject = ['slots', 'locale', 'shortcuts'];

    /**
     * @param ctx Client 插件上下文。
     */
    function apply(ctx) {
      try {
        return applyUnsafe(ctx);
      } catch (error) {
        // 激活失败时留下可定位的日志；loader 只会把 fiber 标成 failed。
        console.error(`[${PLUGIN_ID}] client activation failed`, error);
        throw error;
      }
    }

    /**
     * 开关：设置页里的两个默认值用它，而不是 Checkbox。
     * @param props - checked/onChange/label。
     */
    function Switch({ checked, onChange, label }) {
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': checked === true ? 'true' : 'false',
          'aria-label': label,
          className: `vqcs-switch${checked === true ? ' vqcs-switch--on' : ''}`,
          onClick: () => onChange(!(checked === true)),
        },
        h('span', { className: 'vqcs-knob' }),
      );
    }

    /**
     * 快捷键注册结果。注册失败时 DSH 只会静默不触发，所以把结果留在这里，
     * 让设置页能说明「键位没生效」，而不是让用户反复按键。
     */
    let shortcutState = { ok: false, keys: [], error: '' };

    /** 设置页里「立即打开」的入口；由激活流程注入。 */
    let openNow = null;

    /**
     * 是否是非 Windows 的桌面平台（macOS/Linux 用 ⌘ 符号显示更自然）。
     * 只用来给键位加一个可读标签，不影响真实绑定。
     * @returns 是否按 macOS 的习惯显示。
     */
    function isMacLike() {
      if (typeof navigator === 'undefined') return true;
      return !/Win/i.test(navigator.userAgent);
    }

    /**
     * 把宿主的凭证结论翻译成设置页要展示的三态视图。
     * @param value - `/settings` 的返回体；保存时也传同形状对象。
     * @param prev - 上一次的视图，用于旧宿主不返回字段时保持已有结论。
     * @returns `{ known, connected, via, reason }`。
     */
    function deepseekViewOf(value, prev) {
      const status = value?.deepseek;
      if (status === null || typeof status !== 'object' || typeof status.connected !== 'boolean') {
        return prev && prev.known === true ? prev : { known: false, connected: false, via: '', reason: '' };
      }
      return {
        known: true,
        connected: status.connected === true,
        via: typeof status.via === 'string' ? status.via : '',
        reason: typeof status.reason === 'string' ? status.reason : '',
      };
    }

    /**
     * 「设置 → 快捷提问」页面。
     * 只做四件事：改系统提示词、选模型、设定联网/深度思考的默认开关。
     * 数据走 Host 的 /vt-quick-chat/api/settings，客户端不直接碰文件。
     * @param props - t 与 locale（由槽位注入）。
     */
    function QuickChatSettings({ t, locale }) {
      const [revision, setRevision] = React.useState(0);
      React.useEffect(() => (typeof locale?.subscribe === 'function' ? locale.subscribe(() => setRevision((n) => n + 1)) : undefined), [locale]);
      const tr = (key) => (typeof t === 'function' ? t(key) : key);

      const [state, setState] = React.useState({ status: 'loading', error: '', providers: [], defaultPrompt: '', settings: null, deepseek: deepseekViewOf(undefined) });
      const [draft, setDraft] = React.useState(null);
      const [saving, setSaving] = React.useState(false);
      const [notice, setNotice] = React.useState(null);

      React.useEffect(() => {
        let alive = true;
        fetchSettings()
          .then((value) => {
            if (!alive) return;
            setState({ status: 'ready', error: '', providers: value.providers ?? [], defaultPrompt: value.defaultPrompt ?? '', settings: value.settings, deepseek: deepseekViewOf(value) });
            setDraft(value.settings);
          })
          .catch((error) => {
            if (!alive) return;
            const stale = error?.code === 'host-stale';
            setState((prev) => ({
              ...prev,
              status: 'error',
              stale,
              error: error instanceof Error ? error.message : String(error),
            }));
          });
        return () => {
          alive = false;
        };
      }, []);

      const save = async () => {
        if (draft === null || saving) return;
        setSaving(true);
        setNotice(null);
        try {
          const value = await saveSettings(draft);
          setState((prev) => ({ ...prev, providers: value.providers ?? prev.providers, defaultPrompt: value.defaultPrompt ?? prev.defaultPrompt, settings: value.settings, deepseek: deepseekViewOf(value, prev.deepseek) }));
          setDraft(value.settings);
          setNotice({ tone: 'ok', text: tr('settings.saved') });
        } catch (error) {
          const stale = error?.code === 'host-stale';
          setNotice({ tone: 'error', text: stale ? tr('settings.hostStale') : `${tr('settings.saveFailed')}：${error instanceof Error ? error.message : String(error)}` });
        } finally {
          setSaving(false);
        }
      };

      if (state.status === 'loading') return h('div', { className: 'vqcs-page' }, h('div', { className: 'vqcs-loading' }, tr('settings.loading')));
      if (state.status === 'error') {
        return h(
          'div',
          { className: 'vqcs-page' },
          h(
            'div',
            { className: 'vqcs-loading' },
            state.stale === true
              ? tr('settings.hostStale')
              : `${tr('settings.loadFailed')}：${state.error}`,
          ),
        );
      }
      if (draft === null) return null;

      const patch = (next) => setDraft({ ...draft, ...next });
      const providerValue = typeof draft.provider === 'string' ? draft.provider : 'follow';
      const options = [{ value: 'follow', label: tr('settings.providerFollow') }];
      for (const provider of state.providers) {
        if (!provider.models || provider.models.length === 0) {
          options.push({ value: `${provider.id}::`, label: provider.name });
          continue;
        }
        for (const model of provider.models) {
          options.push({ value: `${provider.id}::${model.id}`, label: `${provider.name} · ${model.name}` });
        }
      }

      return h(
        'div',
        { className: 'vqcs-page' },
        h(
          'div',
          { className: 'vqcs-head' },
          h('div', { className: 'vqcs-headText' }, h('h2', { className: 'vqcs-title' }, tr('settings.title')), h('p', { className: 'vqcs-subtitle' }, tr('settings.subtitle'))),
        ),

        // 系统提示词
        h(
          'section',
          { className: 'vqcs-card' },
          h(
            'div',
            { className: 'vqcs-cardHead' },
            h('div', { className: 'vqcs-label' }, tr('settings.promptLabel')),
            h('button', {
              type: 'button',
              className: 'vqcs-link',
              onClick: () => patch({ systemPrompt: '' }),
              disabled: draft.systemPrompt.length === 0,
            }, tr('settings.promptReset')),
          ),
          h('textarea', {
            className: 'vqcs-editor',
            value: draft.systemPrompt,
            spellCheck: false,
            placeholder: state.defaultPrompt,
            'aria-label': tr('settings.promptLabel'),
            onChange: (event) => patch({ systemPrompt: event.target.value }),
          }),
          h('div', { className: 'vqcs-hint' }, tr('settings.promptHint')),
        ),

        // 模型
        h(
          'section',
          { className: 'vqcs-card' },
          h('div', { className: 'vqcs-label' }, tr('settings.providerLabel')),
          h('select', {
            className: 'vqcs-select',
            value: providerValue,
            'aria-label': tr('settings.providerLabel'),
            onChange: (event) => patch({ provider: event.target.value }),
          }, options.map((option) => h('option', { key: option.value, value: option.value }, option.label))),
          state.deepseek.known !== true
            ? null
            : h(
                'div',
                { className: `vqcs-hint${state.deepseek.connected ? '' : ' vqcs-hint--warn'}` },
                state.deepseek.connected
                  ? tr('settings.deepseekReady').replace('{via}', state.deepseek.via === 'api-key' ? tr('settings.viaApiKey') : tr('settings.viaAccount'))
                  : tr('settings.deepseekMissing'),
              ),
          h('div', { className: 'vqcs-hint' }, tr('settings.providerHint')),
        ),

        // 默认开关：只有直连通道才有联网与深度思考，其它模型下这两项没有意义
        providerValue !== 'follow'
          ? h('section', { className: 'vqcs-card' }, h('div', { className: 'vqcs-hint' }, tr('settings.noWebTools')))
          : h(
          'section',
          { className: 'vqcs-card' },
          h(
            'div',
            { className: 'vqcs-row' },
            h('span', { className: 'vqcs-rowText' }, h('span', { className: 'vqcs-label' }, tr('settings.webDefault')), h('span', { className: 'vqcs-hint' }, tr('settings.webDefaultHint'))),
            h(Switch, { checked: draft.webByDefault === true, label: tr('settings.webDefault'), onChange: (value) => patch({ webByDefault: value }) }),
          ),
          h('div', { className: 'vqcs-divider' }),
          h(
            'div',
            { className: 'vqcs-row' },
            h('span', { className: 'vqcs-rowText' }, h('span', { className: 'vqcs-label' }, tr('settings.deepThinkDefault')), h('span', { className: 'vqcs-hint' }, tr('settings.deepThinkDefaultHint'))),
            h(Switch, { checked: draft.deepThinkByDefault === true, label: tr('settings.deepThinkDefault'), onChange: (value) => patch({ deepThinkByDefault: value }) }),
          ),
        ),

        // 触发方式：键位可能被系统或其它插件占掉，所以给一行确定性和一个手动入口
        h(
          'section',
          { className: 'vqcs-card' },
          h('div', { className: 'vqcs-label' }, tr('settings.triggerLabel')),
          h(
            'div',
            { className: 'vqcs-row vqcs-row--plain' },
            h(
              'span',
              { className: 'vqcs-rowText' },
              shortcutState.ok
                ? h(
                    'span',
                    { className: 'vqcs-keys' },
                    shortcutState.keys.map((key, index) => h('kbd', { className: 'vqcs-keycap', key: index }, key)),
                  )
                : h('span', { className: 'vqcs-hint vqcs-hint--warn' }, tr('settings.triggerMissing')),
              h('span', { className: 'vqcs-hint' }, tr('settings.triggerHint')),
              h('span', { className: 'vqcs-hint' }, tr('settings.triggerCmd')),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'vqcs-link',
                onClick: () => {
                  if (typeof openNow === 'function') openNow();
                },
              },
              tr('settings.openNow'),
            ),
          ),
        ),

        h(
          'div',
          { className: 'vqcs-foot' },
          notice === null ? h('span', { className: 'vqcs-hint' }, '') : h('span', { className: `vqcs-status${notice.tone === 'error' ? ' vqcs-status--error' : ''}` }, notice.text),
          h('button', { type: 'button', className: 'vqcs-btn vqcs-btnPrimary', onClick: save, disabled: saving }, saving ? tr('settings.saving') : tr('settings.save')),
        ),
      );
    }

    /**
     * 实际的激活流程。
     * @param ctx Client 插件上下文。
     */
    function applyUnsafe(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), `${PLUGIN_ID}: dictionaries`);

      const t = ctx.locale.bind(NS);
      tRef = t;
      const controller = createController({ t });

      const buildLabels = () => ({
        inputAria: t('input.aria'),
        placeholder: t('input.placeholder'),
        placeholderExpanded: t('input.placeholderExpanded'),
        send: t('action.send'),
        stop: t('action.stop'),
        retry: t('action.retry'),
        copy: t('action.copy'),
        copied: t('action.copied'),
        close: t('action.close'),
        minimize: t('action.minimize'),
        expand: t('action.expand'),
        newChat: t('action.newChat'),
        history: t('action.history'),
        quoteChip: t('context.chip'),
        removeQuote: t('action.removeQuote'),
        thinking: t('stream.thinking'),
        stopped: t('stream.stopped'),
        truncated: t('stream.truncated'),
        retryHint: t('action.retryHint'),
        panelLabel: t('panel.label'),
        web: t('action.web'),
        webOn: t('action.webOn'),
        webHint: t('action.webHint'),
        attach: t('action.attach'),
        attachHint: t('action.attachHint'),
        deepThink: t('action.deepThink'),
        deepThinkOn: t('action.deepThinkOn'),
        deepThinkHint: t('action.deepThinkHint'),
        uploading: t('file.uploading'),
        fileFailed: t('file.failed'),
        removeFile: t('action.removeAttachment'),
        deepThinking: t('thinking.deep'),
        webUnavailable: t('web.unavailable'),
        toolSearch: t('tool.search'),
        toolOpen: t('tool.open'),
        toolFind: t('tool.find'),
        toolRead: t('tool.read'),
        toolUsage: t('tool.usage'),
        citations: t('citations.title'),
        emptyLabels: {
          title: t('empty.title'),
          body: t('empty.body'),
          hint: t('empty.hint'),
        },
        historyLabels: {
          title: t('history.title'),
          empty: t('history.empty'),
          clear: t('action.clearHistory'),
          confirmClear: t('action.confirmClear'),
          remove: t('action.removeHistory'),
        },
      });

      /**
       * 语言切换后重渲染，让浮层文案跟随宿主 locale。
       * @returns 当前语言版本号；值本身不读取。
       */
      const useLocaleRevision = () => {
        const [revision, setRevision] = React.useState(0);
        React.useEffect(
          () => ctx.locale.subscribe(() => setRevision((value) => value + 1)),
          [],
        );
        return revision;
      };

      /**
       * 相对时间：历史条目只显示最近一分钟/小时/天，避免小窗里出现长日期。
       * @param timestamp - 毫秒时间戳。
       * @returns 本地化短文本。
       */
      const formatTime = (timestamp) => {
        const delta = Math.max(0, Date.now() - timestamp);
        if (delta < 60_000) return t('history.justNow');
        if (delta < 3_600_000) return t('history.minutesAgo').replace('{count}', String(Math.floor(delta / 60_000)));
        if (delta < 86_400_000) return t('history.hoursAgo').replace('{count}', String(Math.floor(delta / 3_600_000)));
        return t('history.daysAgo').replace('{count}', String(Math.floor(delta / 86_400_000)));
      };

      const disposeStyles = installStyles();

      /**
       * 边界内的浮层内容：locale 订阅与标签构造也在边界内，
       * 这样它们抛错时只会退化成错误卡片，不会冒泡到 shell.overlay。
       */
      function QuickChatContent() {
        useLocaleRevision();
        const labels = buildLabels();
        return h(QuickChatPanel, { controller, labels, formatTime });
      }

      // 设置页的「立即打开」：键位失效时用户仍然进得去。
      openNow = () => controller.toggle();

      // 斜杠命令 `/quick-chat` 在宿主执行，通过事件流通知这里开窗。
      // EventSource 自己会重连；宿主重启期间断掉也不影响快捷键。
      ctx.effect(
        () => {
          if (typeof EventSource !== 'function') return () => {};
          let source;
          try {
            source = new EventSource(routeUrl('events'), { withCredentials: true });
          } catch {
            return () => {};
          }
          const onMessage = (event) => {
            let frame;
            try {
              frame = JSON.parse(event.data);
            } catch {
              return;
            }
            if (frame?.type !== 'open') return;
            controller.openWith(typeof frame.prompt === 'string' ? frame.prompt : '');
          };
          source.addEventListener('message', onMessage);
          return () => {
            source.removeEventListener('message', onMessage);
            source.close();
          };
        },
        `${PLUGIN_ID}: host events`,
      );

      // 启动时拉一次设置，之后由设置页维护缓存；失败就按默认值走，不影响小窗。
      void fetchSettings().catch(() => {});

      // 浮层挂到根级 list 槽位：它覆盖整个 frame，但不替换任何主界面。
      ctx.inject(['slots'], (scope) => {
        // 设置页：只影响小窗，所以不进主界面的其它槽位。
        scope.slots.inject('settings.section', () =>
          scope.slots.register(
            {
              name: 'settings.section',
              id: 'quick-chat-settings',
              order: 24,
              label: () => t('settings.nav'),
              inject: () => ({ t, locale: ctx.locale }),
            },
            QuickChatSettings,
          ),
        );

        scope.slots.inject('shell.overlay', () =>
          scope.slots.register(
            {
              name: 'shell.overlay',
              id: 'quick-chat',
              order: 100,
              locale: NS,
            },
            function QuickChatOverlay() {
              return h(OverlayBoundary, null, h(QuickChatContent));
            },
          ),
        );
      });

      // 快捷键：只注册桌面键位 Mod+Shift+N（⌘⇧N / Ctrl+Shift+N）。
      //
      // 为什么不是 Mod+N：那是 `session.new`。为什么不是 Mod+Alt+N：见下。
      //
      // 为什么不是 Mod+Alt+N：macOS 上 Option+N 是波浪号的死键，按下时
      // `event.key` 为 "Dead"。DSH 的键盘适配层只在 Web(macOS) 上为
      // Mod+Alt+N 开了例外（`commandDeadKey`），桌面端会因 `composing`
      // 判定直接放行，按键被静默吞掉——写成 Mod+Alt+N 等于没有快捷键。
      // 同理避免 Mod+Alt 配 E/I/U/N 这些死键字母。
      //
      // Web 不提供默认键：`session.new` 在 Web(macOS) 已占用 Mod+Alt+N，
      // Mod+Shift+N 又是浏览器「无痕窗口」的保留键。缺少 `web:*` 默认值时
      // DSH 视为未绑定，不报错，Web 端就是没有入口。
      ctx.effect(
        () => {
          try {
            const disposer = ctx.shortcuts.register({
              id: 'quickChat.toggle',
              label: () => t('shortcut.label'),
              aliases: ['quick chat', 'explain concept', '快捷提问'],
              defaults: {
                'desktop:macos': { code: 'KeyN', modifiers: ['primary', 'shift'] },
                'desktop:windows': { code: 'KeyN', modifiers: ['primary', 'shift'] },
                'desktop:linux': { code: 'KeyN', modifiers: ['primary', 'shift'] },
              },
              regions: ['page', 'editable'],
              modals: [],
              resolve: () => ({ status: 'handled', run: () => controller.toggle() }),
            });
            shortcutState = { ok: true, keys: isMacLike() ? ['⌘', '⇧', 'N'] : ['Ctrl', '+', 'Shift', '+', 'N'], error: '' };
            return disposer;
          } catch (error) {
            // 与第三方插件的键位冲突不应让整个插件（乃至 Web boot）失败；
            // 记下原因，设置页会显示「键位没生效」。
            shortcutState = { ok: false, label: '', error: error instanceof Error ? error.message : String(error) };
            console.error(`[${PLUGIN_ID}] shortcut registration failed`, error);
            return () => {};
          }
        },
        `${PLUGIN_ID}: toggle shortcut`,
      );

      ctx.effect(
        () => () => {
          disposeStyles();
          controller.dispose();
        },
        `${PLUGIN_ID}: dispose`,
      );

      // 调试/自动化入口：只暴露浮层自身的开关与只读状态，不涉及模型凭证。
      ctx.effect(() => {
        const marker = {
          version: VERSION,
          plugin: PLUGIN_ID,
          open: controller.open,
          close: controller.close,
          toggle: controller.toggle,
          send: controller.send,
          stop: controller.stop,
          newChat: controller.newChat,
          openHistory: controller.openHistory,
          state: controller.snapshot,
        };
        window.__vtQuickChat = marker;
        return () => {
          if (window.__vtQuickChat === marker) delete window.__vtQuickChat;
        };
      }, `${PLUGIN_ID}: marker`);
    }

    return {
      apply,
      inject,
      /** 测试出口：纯函数，不参与运行时行为。 */
      __test: {
        sanitizeHistory,
        createSseParser,
        tokenizeMarkdown,
        errorText,
        titleFrom,
        trimForRequest,
        createController,
        QuickChatPanel,
        deepseekCacheOf,
        deepseekViewOf,
        canUseWebTools,
        settingsCacheRef: () => settingsCache,
        setSettingsCache: (next) => {
          settingsCache = { ...settingsCache, ...next };
        },
      },
    };
  },
});
