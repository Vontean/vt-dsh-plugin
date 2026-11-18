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
    const VERSION = '1.1.3';
    /** 文案命名空间。 */
    const NS = 'vtQuickChat';
    /** Host 路由前缀，与 index.js 的 ROUTE_PREFIX 必须一致。 */
    const API_PREFIX = '/vt-quick-chat/api';
    /** 本地历史存储键。 */
    const STORAGE_KEY = `${PLUGIN_ID}:history:v1`;
    /** 历史最多保留的对话数。 */
    const MAX_HISTORY = 20;
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
      'panel.title': '快捷提问',
      'panel.badge': '临时',
      'input.aria': '快捷提问输入',
      'input.placeholder': '问点什么…',
      'input.placeholderExpanded': '继续追问…',
      'composer.hint': 'Enter 发送 · Shift+Enter 换行 · Esc 关闭',
      'empty.title': '临时提问，不会进入侧栏',
      'empty.body': '选中一段看不懂的文字再按快捷键，它会被当作解释对象。关掉小窗，主任务不受影响。',
      'empty.hint': '这里只做解释：不读写工作区文件、不创建会话；需要最新资料可打开「联网」。',
      'role.user': '你',
      'role.assistant': '助手',
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
      'action.clearHistory': '清空全部',
      'action.confirmClear': '再点一次清空',
      'action.removeHistory': '删除这条',
      'action.quoteSelection': '引用当前选中的文字',
      'action.removeQuote': '移除引用',
      'action.retryHint': '重新生成上一条回答',
      'context.chip': '引用选中文字',
      'action.web': '联网',
      'action.webOn': '联网已开',
      'action.webHint': '开启后可用搜索与阅读链接；搜索 5 元/千次、抓取 5 元/千次',
      'tool.search': '正在搜索',
      'tool.open': '正在打开网页',
      'tool.find': '正在页内查找',
      'tool.read': '正在读取链接',
      'tool.usage': '本次：搜索 {search} 次 · 抓取 {fetch} 次',
      'citations.title': '来源',
      'error.contentRisk': '这个问题被内容安全策略拒绝了。',
      'web.unavailable': '当前没有可用的 DeepSeek 凭证，本次回答没有联网。',
      'stream.thinking': '正在回答…',
      'stream.stopped': '已停止',
      'stream.truncated': '回答达到长度上限',
      'history.title': '本地历史',
      'history.empty': '还没有历史。发送第一条问题后，它会出现在这里。',
      'history.localOnly': '只保存在本机浏览器',
      'history.messages': '{count} 条消息',
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
    };

    const en = {
      'panel.label': 'Quick chat',
      'panel.title': 'Quick chat',
      'panel.badge': 'Temporary',
      'input.aria': 'Quick chat input',
      'input.placeholder': 'Ask something…',
      'input.placeholderExpanded': 'Ask a follow-up…',
      'composer.hint': 'Enter to send · Shift+Enter for a new line · Esc to close',
      'empty.title': 'A temporary question, outside the sidebar',
      'empty.body': 'Select a phrase you do not understand, then press the shortcut. Close this window and the main task continues untouched.',
      'empty.hint': 'Explanations only: no file access, no new session. Turn on Web for fresh sources.',
      'role.user': 'You',
      'role.assistant': 'Assistant',
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
      'action.clearHistory': 'Clear all',
      'action.confirmClear': 'Click again to clear',
      'action.removeHistory': 'Delete this item',
      'action.quoteSelection': 'Quote the current selection',
      'action.removeQuote': 'Remove quote',
      'action.retryHint': 'Regenerate the previous answer',
      'context.chip': 'Quoted selection',
      'action.web': 'Web',
      'action.webOn': 'Web on',
      'action.webHint': 'Turns on search and link reading; search ¥5/1k, fetch ¥5/1k',
      'tool.search': 'Searching',
      'tool.open': 'Opening page',
      'tool.find': 'Finding in page',
      'tool.read': 'Reading link',
      'tool.usage': 'This turn: {search} searches · {fetch} fetches',
      'citations.title': 'Sources',
      'error.contentRisk': 'This question was rejected by the content safety policy.',
      'web.unavailable': 'No DeepSeek credential is available, so this answer did not use the web.',
      'stream.thinking': 'Answering…',
      'stream.stopped': 'Stopped',
      'stream.truncated': 'The answer hit its length limit',
      'history.title': 'Local history',
      'history.empty': 'No history yet. Your first question will appear here.',
      'history.localOnly': 'Stored only in this browser',
      'history.messages': '{count} messages',
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
        const messages = [...state.messages, { role: 'user', content: text }];
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

      /** 打开浮层：默认紧凑态，并带上当前选中文字。 */
      function open() {
        if (state.open) return;
        set({
          open: true,
          mode: 'compact',
          selection: readSelection(),
          historyOpen: false,
          confirmClear: false,
          // 联网每次重新打开都回到关闭：不让上一轮的计费状态静默延续。
          web: false,
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

      /** 重新读取当前选中文字。 */
      function captureSelection() {
        const selection = readSelection();
        set({ selection });
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
        close,
        toggle,
        minimize,
        expand,
        send,
        stop,
        retry,
        setDraft,
        captureSelection,
        clearSelection,
        toggleWeb,
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
.vqc-root{position:absolute;inset:0;pointer-events:none;z-index:0}
.vqc-panel{position:absolute;right:24px;bottom:96px;display:flex;flex-direction:column;box-sizing:border-box;width:min(560px,calc(100vw - 32px));background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary,#0f1115);border:0;border-radius:var(--dsw-radius-lg,16px);box-shadow:var(--dsw-elevation-prominent,0 0 0 .5px #0000001a,0 3px 8px #0000000a);--dsw-elevation-stroke-color:var(--dsw-alias-border-l2,#0000001a);pointer-events:auto;overflow:hidden;font-size:var(--dsh-content-font-size,14px);line-height:1.55;animation:vqc-rise 160ms ease-out}
.vqc-panel--compact{height:48px;max-height:48px}
.vqc-panel--expanded{height:min(520px,calc(100dvh - 120px))}
@keyframes vqc-rise{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.vqc-panel{animation:none}.vqc-caret{animation:none}}
.vqc-header{display:flex;align-items:center;gap:8px;flex:none;height:44px;padding:0 8px 0 12px;border-bottom:.5px solid var(--dsw-alias-border-l1,#0000000a)}
.vqc-title{display:flex;align-items:center;gap:6px;min-width:0;font-size:var(--dsh-content-font-size-secondary,13px);font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary,#0f1115)}
.vqc-titleText{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vqc-badge{flex:none;padding:0 6px;border:.5px solid var(--dsw-alias-border-l1,#0000000a);border-radius:var(--dsw-radius-xs,4px);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-tertiary,#81858c);font-size:11px;font-weight:400;line-height:16px}
.vqc-actions{display:flex;align-items:center;gap:4px;margin-left:auto}
.vqc-iconbtn{display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;padding:0;border:0;border-radius:var(--dsw-radius-sm,8px);background:transparent;color:var(--dsw-alias-label-tertiary,#81858c);cursor:pointer}
.vqc-iconbtn:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f);color:var(--dsw-alias-label-primary,#0f1115)}
.vqc-iconbtn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4176e6);outline-offset:1px}
.vqc-iconbtn:disabled{opacity:.4;cursor:default}
.vqc-iconbtn--active{color:var(--dsw-alias-state-business-primary,#4176e6)}
.vqc-compact{display:flex;align-items:center;gap:8px;box-sizing:border-box;height:48px;padding:6px 8px 6px 12px}
.vqc-brand{flex:none;color:var(--dsw-alias-label-tertiary,#81858c)}
.vqc-input{flex:1;min-width:0;margin:0;padding:0;border:0;outline:0;background:transparent;color:inherit;font:inherit;line-height:22px;resize:none}
.vqc-input::placeholder{color:var(--dsw-alias-label-tertiary,#81858c)}
.vqc-send{display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;padding:0;border:0;border-radius:999px;background:var(--dsw-alias-button-primary-fill,#0f1115);color:var(--dsw-alias-label-primary-inverted,#fff);cursor:pointer}
.vqc-send:hover{background:var(--dsw-alias-button-primary-hover,#33363b)}
.vqc-send:disabled{opacity:.35;cursor:default}
.vqc-send--stop{background:var(--dsw-alias-bg-layer-3,#353638);color:var(--dsw-alias-label-primary,#0f1115)}
.vqc-send--stop:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f)}
.vqc-chip{display:flex;align-items:center;gap:6px;flex:none;margin:8px 12px 0;padding:4px 4px 4px 8px;border:.5px solid var(--dsw-alias-border-l1,#0000000a);border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-secondary,#61666b);font-size:12px;line-height:18px}
.vqc-chipLabel{flex:none;color:var(--dsw-alias-label-tertiary,#81858c)}
.vqc-chipText{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vqc-body{flex:1;min-height:0;overflow-y:auto;padding:12px 16px;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-scrollbar-bg-l1,#0000001a) transparent}
.vqc-body::-webkit-scrollbar{width:8px;height:8px}
.vqc-body::-webkit-scrollbar-thumb{background:var(--dsw-alias-scrollbar-bg-l1,#0000001a);border-radius:999px}
.vqc-body::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-scrollbar-hover-l1,#00000026)}
.vqc-msg{display:flex;flex-direction:column;gap:4px;margin-bottom:16px}
.vqc-msg:last-child{margin-bottom:0}
.vqc-role{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#81858c)}
.vqc-userText{align-self:flex-start;max-width:100%;padding:8px 12px;border:.5px solid var(--dsw-alias-border-l1,#0000000a);border-radius:var(--dsw-radius-md,12px);background:var(--dsw-alias-bg-layer-3,#fff);white-space:pre-wrap;overflow-wrap:anywhere}
.vqc-prose{overflow-wrap:anywhere}
.vqc-prose .vqc-paragraph{margin:0 0 8px}
.vqc-prose .vqc-paragraph:last-child{margin-bottom:0}
.vqc-prose .vqc-heading{margin:12px 0 6px;font-size:var(--dsh-content-font-size,14px);font-weight:600;line-height:1.4}
.vqc-prose .vqc-heading:first-child{margin-top:0}
.vqc-prose .vqc-list{margin:0 0 8px;padding-left:20px}
.vqc-prose .vqc-list:last-child{margin-bottom:0}
.vqc-prose .vqc-list li{margin:2px 0}
.vqc-prose .vqc-code{margin:0 0 8px;padding:8px 10px;overflow:auto;border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-markdown-code-block,#f9fafb);font:var(--dsw-font-markdown-code-block,11px/19px ui-monospace,monospace)}
.vqc-prose .vqc-code code{padding:0;background:transparent;font:inherit;white-space:pre}
.vqc-prose code{padding:1px 4px;border-radius:var(--dsw-radius-xs,4px);background:var(--dsw-alias-markdown-inline-code,#f2f3f5);font:var(--dsw-font-markdown-code-block,11px/19px ui-monospace,monospace)}
.vqc-prose a{color:var(--dsw-alias-link,#4176e6);text-decoration:none}
.vqc-prose a:hover{text-decoration:underline}
.vqc-prose blockquote{margin:0 0 8px;padding-left:10px;border-left:2px solid var(--dsw-alias-border-l2,#0000001a);color:var(--dsw-alias-label-secondary,#61666b)}
.vqc-caret{display:inline-block;width:2px;height:1em;margin-left:2px;vertical-align:-2px;background:var(--dsw-alias-label-tertiary,#81858c);animation:vqc-blink 1s steps(2) infinite}
@keyframes vqc-blink{50%{opacity:0}}
.vqc-thinking{color:var(--dsw-alias-label-tertiary,#81858c)}
.vqc-msgActions{display:flex;align-items:center;gap:4px;margin-top:2px;opacity:0;transition:opacity 120ms ease-out}
.vqc-msg:hover .vqc-msgActions,.vqc-msg:focus-within .vqc-msgActions{opacity:1}
@media (hover:none){.vqc-msgActions{opacity:1}}
.vqc-inlineAction{display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border:0;border-radius:var(--dsw-radius-xs,4px);background:transparent;color:var(--dsw-alias-label-tertiary,#81858c);font:inherit;font-size:12px;line-height:18px;cursor:pointer}
.vqc-inlineAction:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f);color:var(--dsw-alias-label-primary,#0f1115)}
.vqc-note{margin-top:4px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#81858c)}
.vqc-tools{display:flex;flex-wrap:wrap;gap:4px;margin:2px 0 4px}
.vqc-toolChip{display:inline-flex;align-items:center;gap:4px;max-width:100%;padding:2px 8px;border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-bg-layer-1,#fff);border:.5px solid var(--dsw-alias-border-l1,#0000000a);color:var(--dsw-alias-label-secondary,#61666b);font-size:11px;line-height:16px}
.vqc-toolDetail{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;color:var(--dsw-alias-label-tertiary,#81858c)}
.vqc-citations{display:flex;flex-direction:column;gap:2px;margin-top:6px;padding-top:6px;border-top:.5px solid var(--dsw-alias-border-l1,#0000000a)}
.vqc-citationsTitle{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#81858c)}
.vqc-citation{font-size:12px;line-height:18px;color:var(--dsw-alias-brand-primary,#4d6bfe);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vqc-citation:hover{text-decoration:underline}
.vqc-error{display:flex;align-items:flex-start;gap:8px;margin-top:12px;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l1,#0000000a);border-radius:var(--dsw-radius-md,12px);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-secondary,#61666b);font-size:13px;line-height:20px}
.vqc-errorIcon{flex:none;margin-top:2px;color:var(--dsw-alias-state-error-primary,#d92d20)}
.vqc-errorBody{flex:1;min-width:0}
.vqc-errorActions{display:flex;gap:6px;margin-top:6px}
.vqc-textbtn{padding:3px 8px;border:.5px solid var(--dsw-alias-border-l1,#0000000a);border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary,#0f1115);font:inherit;font-size:12px;line-height:18px;cursor:pointer}
.vqc-textbtn:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f)}
.vqc-empty{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:16px 4px}
.vqc-emptyIcon{color:var(--dsw-alias-label-tertiary,#81858c)}
.vqc-emptyTitle{font-size:13px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary,#0f1115)}
.vqc-emptyBody{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#61666b)}
.vqc-emptyHint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#81858c)}
.vqc-history{display:flex;flex-direction:column;gap:2px}
.vqc-historyHead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#81858c)}
.vqc-historyItem{display:flex;align-items:center;gap:8px;width:100%;padding:8px;border:0;border-radius:var(--dsw-radius-sm,8px);background:transparent;color:inherit;text-align:left;font:inherit;cursor:pointer}
.vqc-historyItem:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f)}
.vqc-historyMain{flex:1;min-width:0;text-align:left}
.vqc-historyTitle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#0f1115)}
.vqc-historyMeta{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#81858c)}
.vqc-historyEmpty{padding:16px 4px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#81858c)}
.vqc-composer{display:flex;align-items:flex-end;gap:8px;flex:none;padding:8px 8px 8px 16px;border-top:.5px solid var(--dsw-alias-border-l1,#0000000a)}
.vqc-composerInput{min-height:22px;max-height:120px;padding:6px 0;overflow-y:auto;scrollbar-width:thin}
.vqc-hint{flex:none;padding:0 16px 8px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#81858c)}
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
    function IconButton({ label, icon, size = 16, onClick, disabled = false, active = false }) {
      return h(
        'button',
        {
          type: 'button',
          className: `vqc-iconbtn${active ? ' vqc-iconbtn--active' : ''}`,
          'aria-label': label,
          title: label,
          onClick,
          disabled,
        },
        h(DshIcon, { name: icon, size }),
      );
    }

    /**
     * 自动增高的多行输入框。
     * @param props - value/onChange/onKeyDown/placeholder/ariaLabel/className/inputRef。
     */
    function AutoTextarea({ value, onChange, onKeyDown, placeholder, ariaLabel, className, inputRef }) {
      const localRef = React.useRef(null);
      const assignRef = (node) => {
        localRef.current = node;
        if (inputRef !== undefined) inputRef.current = node;
      };
      React.useLayoutEffect(() => {
        const node = localRef.current;
        if (node === null) return;
        node.style.height = 'auto';
        node.style.height = `${Math.min(node.scrollHeight, 120)}px`;
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
            h('button', { type: 'button', className: 'vqc-textbtn', onClick: this.reset }, tRef('action.retry')),
          );
        }
        return this.props.children;
      }
    }

    /**
     * 选中文本 chip。
     * @param props - text/onRemove/label/removeLabel。
     */
    function SelectionChip({ text, onRemove, label, removeLabel }) {
      return h(
        'div',
        { className: 'vqc-chip' },
        h(DshIcon, { name: 'IconLinkOutlineRegular', size: 14 }),
        h('span', { className: 'vqc-chipLabel' }, label),
        h('span', { className: 'vqc-chipText', title: text }, text),
        h(
          'button',
          { type: 'button', className: 'vqc-iconbtn', 'aria-label': removeLabel, title: removeLabel, onClick: onRemove },
          h(DshIcon, { name: 'IconCloseOutlineRegular', size: 14 }),
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
        { className: 'vqc-msg' },
        h('div', { className: 'vqc-role' }, isUser ? labels.user : labels.assistant),
        isUser
          ? h('div', { className: 'vqc-userText' }, message.content)
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
              name: tool.action === 'read_link' ? 'IconLinkOutlineRegular' : 'IconSearchOutlineRegular',
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
            citation.title.length > 0 ? citation.title : citation.url,
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
        h(DshIcon, { name: 'IconLightOutlineRegular', size: 20, className: 'vqc-emptyIcon' }),
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
                  { type: 'button', className: 'vqc-textbtn', title: labels.retryHint, onClick: onRetry },
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
          h('span', null, `${labels.title} · ${labels.localOnly}`),
          history.length > 0
            ? h(
                'button',
                { type: 'button', className: 'vqc-textbtn', onClick: onClear },
                confirmClear ? labels.confirmClear : labels.clear,
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
                  h('div', { className: 'vqc-historyTitle' }, entry.title),
                  h(
                    'div',
                    { className: 'vqc-historyMeta' },
                    `${formatTime(entry.updatedAt)} · ${labels.messages.replace('{count}', String(entry.messages.length))}`,
                  ),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'vqc-iconbtn',
                    'aria-label': labels.remove,
                    title: labels.remove,
                    onClick: () => onRemove(entry.id),
                  },
                  h(DshIcon, { name: 'IconTrashOutlineRegular', size: 14 }),
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

      const expanded = state.mode === 'expanded';
      const canSend = state.draft.trim().length > 0 && !state.streaming;
      const canRetry = state.messages.some((message) => message.role === 'user');
      const hasAssistant = state.messages.some((message) => message.role === 'assistant');
      const showStreaming = state.streaming || state.streamText.length > 0;

      const header = expanded
        ? h(
            'header',
            { className: 'vqc-header' },
            h(
              'div',
              { className: 'vqc-title' },
              h(DshIcon, { name: 'IconLightOutlineRegular', size: 16 }),
              h('span', { className: 'vqc-titleText' }, labels.title),
              h('span', { className: 'vqc-badge', title: state.model }, labels.badge),
            ),
            h(
              'div',
              { className: 'vqc-actions' },
              h(IconButton, {
                label: state.web ? labels.webOn : labels.web,
                icon: 'IconGlobeOutlineRegular',
                active: state.web,
                onClick: controller.toggleWeb,
              }),
              h(IconButton, {
                label: labels.history,
                icon: 'IconClockOutlineRegular',
                active: state.historyOpen,
                onClick: controller.toggleHistory,
              }),
              h(IconButton, {
                label: labels.newChat,
                icon: 'IconNewChatOutlineRegular',
                onClick: controller.newChat,
              }),
              h(IconButton, {
                label: labels.minimize,
                icon: 'IconCompactOutlineRegular',
                onClick: controller.minimize,
              }),
              h(IconButton, { label: labels.close, icon: 'IconCloseOutlineRegular', onClick: controller.close }),
            ),
          )
        : null;

      const chip =
        expanded && state.selection.length > 0 && !state.historyOpen
          ? h(SelectionChip, {
              text: state.selection,
              label: labels.quoteChip,
              removeLabel: labels.removeQuote,
              onRemove: controller.clearSelection,
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
            { key: 'stream', className: 'vqc-msg' },
            h('div', { className: 'vqc-role' }, labels.assistant),
            state.tools.length > 0 ? h(ToolActivity, { tools: state.tools, labels }) : null,
            state.streamText.length === 0
              ? h('div', { className: 'vqc-thinking' }, labels.thinking)
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

      const composer = expanded
        ? h(
            'div',
            { className: 'vqc-composer' },
            h(AutoTextarea, {
              value: state.draft,
              onChange: controller.setDraft,
              onKeyDown,
              placeholder: labels.placeholderExpanded,
              ariaLabel: labels.inputAria,
              className: 'vqc-composerInput',
              inputRef,
            }),
            h(IconButton, {
              label: labels.quote,
              icon: 'IconLinkOutlineRegular',
              active: state.selection.length > 0,
              onClick: state.selection.length > 0 ? controller.clearSelection : controller.captureSelection,
            }),
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
                  h(DshIcon, { name: 'IconStopFillRegular', size: 16 }),
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
                  h(DshIcon, { name: 'IconSendOutlineRegular', size: 16 }),
                ),
          )
        : null;

      const hint = expanded ? h('div', { className: 'vqc-hint' }, labels.hint) : null;

      const compact = expanded
        ? null
        : h(
            'div',
            { className: 'vqc-compact' },
            h(DshIcon, { name: 'IconLightOutlineRegular', size: 16, className: 'vqc-brand' }),
            h('input', {
              ref: inputRef,
              className: 'vqc-input',
              value: state.draft,
              placeholder: labels.placeholder,
              'aria-label': labels.inputAria,
              onChange: (event) => controller.setDraft(event.target.value),
              onKeyDown,
            }),
            state.selection.length > 0
              ? h(IconButton, {
                  label: labels.quote,
                  icon: 'IconLinkOutlineRegular',
                  active: true,
                  onClick: controller.expand,
                })
              : null,
            hasAssistant || state.messages.length > 0
              ? h(IconButton, { label: labels.expand, icon: 'IconFullscreenOutlineRegular', onClick: controller.expand })
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
                  h(DshIcon, { name: 'IconStopFillRegular', size: 16 }),
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
                  h(DshIcon, { name: 'IconSendOutlineRegular', size: 16 }),
                ),
          );

      return h(
        'div',
        { className: 'vqc-root', 'data-vt-quick-chat': '' },
        h(
          'section',
          {
            className: `vqc-panel ${expanded ? 'vqc-panel--expanded' : 'vqc-panel--compact'}`,
            role: 'dialog',
            'aria-modal': 'false',
            'aria-label': labels.panelLabel,
            onKeyDown,
          },
          header,
          chip,
          body,
          composer,
          hint,
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
     * 实际的激活流程。
     * @param ctx Client 插件上下文。
     */
    function applyUnsafe(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), `${PLUGIN_ID}: dictionaries`);

      const t = ctx.locale.bind(NS);
      tRef = t;
      const controller = createController({ t });

      const buildLabels = () => ({
        title: t('panel.title'),
        badge: t('panel.badge'),
        inputAria: t('input.aria'),
        placeholder: t('input.placeholder'),
        placeholderExpanded: t('input.placeholderExpanded'),
        hint: t('composer.hint'),
        user: t('role.user'),
        assistant: t('role.assistant'),
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
        quote: t('action.quoteSelection'),
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
          localOnly: t('history.localOnly'),
          empty: t('history.empty'),
          clear: t('action.clearHistory'),
          confirmClear: t('action.confirmClear'),
          remove: t('action.removeHistory'),
          messages: t('history.messages'),
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

      // 浮层挂到根级 list 槽位：它覆盖整个 frame，但不替换任何主界面。
      ctx.inject(['slots'], (scope) => {
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

      // 快捷键：只注册桌面键位 Mod+Alt+N（⌘⌥N / Ctrl+Alt+N）。
      // Web 不提供默认键：DSH 的 session.new 在 Web 上已占用 Mod+Alt+N，
      // Mod+Shift+N 又是浏览器「无痕窗口」的保留键，网页收不到事件。
      // 缺少 `web:*` 默认值时 DSH 视为未绑定，不报错，Web 端就是没有入口。
      ctx.effect(
        () => {
          try {
            return ctx.shortcuts.register({
              id: 'quickChat.toggle',
              label: () => t('shortcut.label'),
              aliases: ['quick chat', 'explain concept', '快捷提问'],
              defaults: {
                'desktop:macos': { code: 'KeyN', modifiers: ['primary', 'alt'] },
                'desktop:windows': { code: 'KeyN', modifiers: ['primary', 'alt'] },
                'desktop:linux': { code: 'KeyN', modifiers: ['primary', 'alt'] },
              },
              regions: ['page', 'editable'],
              modals: [],
              resolve: () => ({ status: 'handled', run: () => controller.toggle() }),
            });
          } catch (error) {
            // 与第三方插件的键位冲突不应让整个插件（乃至 Web boot）失败。
            console.error(`[${PLUGIN_ID}] shortcut registration failed; assign another binding in Settings`, error);
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
      },
    };
  },
});
