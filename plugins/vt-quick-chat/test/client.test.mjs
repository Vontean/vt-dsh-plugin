import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';

/**
 * client.js 是给 DSH 客户端装载器的经典脚本：顶层只有一次
 * `window.__ModuleLoader__.load({...})`。这里用一个最小的 window 与 React stub
 * 取出 factory，再调用它返回的 `__test`。
 */
function loadClient(reactImpl) {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  const storage = new Map();
  let selectionText = '';
  let loaded;

  const context = {
    window: {
      __ModuleLoader__: {
        load: (module) => {
          loaded = module;
        },
      },
      localStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
      },
      setTimeout,
      clearTimeout,
      getSelection: () => ({
        rangeCount: 1,
        toString: () => selectionText,
        anchorNode: null,
      }),
    },
    document: {
      getElementById: () => null,
      createElement: () => ({ id: '', textContent: '', style: {}, remove() {}, setAttribute() {} }),
      head: { appendChild() {} },
      body: { appendChild() {} },
      activeElement: null,
      querySelectorAll: () => [],
      addEventListener() {},
      removeEventListener() {},
    },
    console,
    setTimeout,
    clearTimeout,
    AbortController,
    TextDecoder,
    TextEncoder,
    crypto: globalThis.crypto,
    fetch: async () => {
      throw new Error('fetch not configured');
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);

  const ReactStub = {
    createElement: () => null,
    Component: class {},
  };
  const module = loaded.factory((specifier) => {
    if (specifier === 'react') return reactImpl ?? ReactStub;
    return {};
  });

  return {
    internals: module.__test,
    module,
    context,
    storage,
    setSelection: (value) => {
      selectionText = value;
    },
  };
}

const { sanitizeHistory, createSseParser, tokenizeMarkdown, errorText, titleFrom } = loadClient().internals;

/** VM 里创建的对象有另一套原型；比较前先归一化成当前 realm 的纯数据。 */
const plain = (value) => JSON.parse(JSON.stringify(value));
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 造一个可流式读取的 response body。
 * @param chunks - 依次返回的文本片段。
 */
function bodyFrom(chunks) {
  let index = 0;
  return {
    getReader() {
      return {
        async read() {
          if (index >= chunks.length) return { done: true, value: undefined };
          const value = new TextEncoder().encode(chunks[index]);
          index += 1;
          return { done: false, value };
        },
      };
    },
  };
}

/**
 * 造一个「先给一段、然后挂住直到取消」的 body，用于测试停止。
 * @param signal - 请求的 AbortSignal。
 */
function hangingBody(signal) {
  let sent = false;
  return {
    getReader() {
      return {
        read() {
          if (!sent) {
            sent = true;
            return Promise.resolve({
              done: false,
              value: new TextEncoder().encode('data: {"type":"delta","text":"半句"}\n\n'),
            });
          }
          return new Promise((resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
              { once: true },
            );
          });
        },
      };
    },
  };
}

test('createSseParser 处理跨 chunk 的半帧、多帧与 CRLF', () => {
  const frames = [];
  const parser = createSseParser((frame) => frames.push(frame));
  parser.push('data: {"type":"delta","text":"你');
  parser.push('好"}\n\ndata: {"type":"delta","text":"世界"}\r\n\r\n');
  parser.push('data: {"type":"done"}');
  parser.flush();
  assert.deepEqual(plain(frames), [
    { type: 'delta', text: '你好' },
    { type: 'delta', text: '世界' },
    { type: 'done' },
  ]);
});

test('createSseParser 忽略坏帧并继续解析后续帧', () => {
  const frames = [];
  const parser = createSseParser((frame) => frames.push(frame));
  parser.push('data: {bad json}\n\ndata: {"type":"done"}\n\n');
  assert.deepEqual(plain(frames), [{ type: 'done' }]);
});

test('createSseParser 忽略没有 data 行的注释帧', () => {
  const frames = [];
  const parser = createSseParser((frame) => frames.push(frame));
  parser.push(': keep-alive\n\ndata: {"type":"done"}\n\n');
  assert.deepEqual(plain(frames), [{ type: 'done' }]);
});

test('tokenizeMarkdown 识别段落、标题、列表、引用与围栏代码', () => {
  const blocks = tokenizeMarkdown(
    ['## 结论', '', 'MCP 是 **协议**。', '', '- 一', '- 二', '', '1. 甲', '2. 乙', '', '> 引用', '', '```js', 'const a = 1;', '```'].join('\n'),
  );
  assert.deepEqual(
    plain(blocks.map((block) => block.type)),
    ['heading', 'paragraph', 'list', 'list', 'quote', 'code'],
  );
  assert.equal(blocks[0].level, 2);
  assert.equal(blocks[2].ordered, false);
  assert.deepEqual(plain(blocks[2].items), ['一', '二']);
  assert.equal(blocks[3].ordered, true);
  assert.deepEqual(plain(blocks[3].items), ['甲', '乙']);
  assert.equal(blocks[5].language, 'js');
  assert.equal(blocks[5].text, 'const a = 1;');
});

test('tokenizeMarkdown 对未闭合代码块也保持稳定', () => {
  const blocks = tokenizeMarkdown('```\n未闭合');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'code');
  assert.equal(blocks[0].text, '未闭合');
});

test('sanitizeHistory 过滤坏条目、截断消息并限制 30 条', () => {
  const input = [
    { id: 'a', messages: [{ role: 'user', content: 'hi' }, { role: 'system', content: 'x' }] },
    { id: '', messages: [{ role: 'user', content: 'x' }] },
    { id: 'b', messages: [] },
    { id: 'c', messages: [{ role: 'assistant', content: '   ' }] },
    ...Array.from({ length: 35 }, (_, index) => ({
      id: `h${index}`,
      messages: [{ role: 'user', content: `q${index}` }],
    })),
  ];
  const result = sanitizeHistory(input, '未命名');
  assert.equal(result.length, 30);
  assert.equal(result[0].id, 'a');
  assert.equal(result[0].messages.length, 1);
  assert.equal(result[0].title, 'hi');
  // 超限时丢最旧的：最后一条仍在，尾部条目被切掉。
  assert.equal(result[result.length - 1].id, 'h28');
});

test('titleFrom 压缩空白并截断', () => {
  assert.equal(titleFrom([{ role: 'user', content: '  a\n\n b  ' }], 'fallback'), 'a b');
  assert.equal(titleFrom([], 'fallback'), 'fallback');
  assert.equal(titleFrom([{ role: 'user', content: 'x'.repeat(80) }], 'fallback').length, 60);
});

test('errorText 按机器码映射，未知码回落通用文案', () => {
  const t = (key) => key;
  assert.equal(errorText('NO_MODEL', t), 'error.noModel');
  assert.equal(errorText('AUTH', t), 'error.credential');
  assert.equal(errorText('HTTP_429', t), 'error.rate');
  assert.equal(errorText('CONTEXT_WINDOW_EXCEEDED', t), 'error.tooLong');
  assert.equal(errorText('SOMETHING_ELSE', t), 'error.generic');
});

test('controller 发送、流式收尾并写入本地历史', async () => {
  const { internals, context, storage, setSelection } = loadClient();
  setSelection('MCP 是 Model Context Protocol');
  const calls = [];
  context.fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      body: bodyFrom([
        'data: {"type":"start","model":"test-model"}\n\n',
        'data: {"type":"delta","text":"MCP"}\n\n',
        'data: {"type":"delta","text":" 是协议"}\n\n',
        'data: {"type":"done"}\n\n',
      ]),
    };
  };

  const controller = internals.createController({ t: (key) => key });
  controller.open();
  assert.equal(controller.snapshot().selection, 'MCP 是 Model Context Protocol');
  controller.setDraft('什么是 MCP？');
  controller.send();
  await tick(60);

  const state = controller.snapshot();
  assert.equal(state.streaming, false);
  assert.equal(state.error, null);
  assert.equal(state.model, 'test-model');
  assert.deepEqual(
    plain(state.messages.map((message) => message.content)),
    ['什么是 MCP？', 'MCP 是协议'],
  );
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].title, '什么是 MCP？');

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.selection, 'MCP 是 Model Context Protocol');
  assert.equal(body.messages.length, 1);
  assert.equal(body.messages[0].role, 'user');
  assert.ok(storage.has('dsh-vt-quick-chat:history:v1'));
  controller.dispose();
});

test('controller 停止时保留已生成文本', async () => {
  const { internals, context } = loadClient();
  context.fetch = async (_url, init) => ({ ok: true, body: hangingBody(init.signal) });
  const controller = internals.createController({ t: (key) => key });
  controller.open();
  controller.setDraft('解释一下');
  controller.send();
  await tick(10);
  controller.stop();
  await tick(10);

  const state = controller.snapshot();
  assert.equal(state.streaming, false);
  assert.equal(state.stopped, true);
  assert.equal(state.messages.at(-1).role, 'assistant');
  assert.equal(state.messages.at(-1).content, '半句');
  controller.dispose();
});

test('controller 重试会替换上一条回答', async () => {
  const { internals, context } = loadClient();
  let round = 0;
  context.fetch = async () => {
    round += 1;
    return {
      ok: true,
      body: bodyFrom([
        `data: {"type":"delta","text":"第${round}次"}\n\n`,
        'data: {"type":"done"}\n\n',
      ]),
    };
  };
  const controller = internals.createController({ t: (key) => key });
  controller.open();
  controller.setDraft('同一个问题');
  controller.send();
  await tick(60);
  controller.retry();
  await tick(60);

  const state = controller.snapshot();
  assert.equal(state.messages.length, 2);
  assert.equal(state.messages[0].content, '同一个问题');
  assert.equal(state.messages[1].content, '第2次');
  assert.equal(state.history.length, 1);
  controller.dispose();
});

test('controller 错误帧保留部分回答并给出机器码', async () => {
  const { internals, context } = loadClient();
  context.fetch = async () => ({
    ok: true,
    body: bodyFrom([
      'data: {"type":"delta","text":"部分"}\n\n',
      'data: {"type":"error","code":"RATE_LIMIT","message":"slow down"}\n\n',
    ]),
  });
  const controller = internals.createController({ t: (key) => key });
  controller.open();
  controller.setDraft('q');
  controller.send();
  await tick(60);

  const state = controller.snapshot();
  assert.equal(state.streaming, false);
  assert.equal(state.error.code, 'RATE_LIMIT');
  assert.equal(state.messages.at(-1).content, '部分');
  controller.dispose();
});

test('controller 处理 HTTP 错误并保留用户问题', async () => {
  const { internals, context } = loadClient();
  context.fetch = async () => ({
    ok: false,
    status: 503,
    json: async () => ({ error: { code: 'NO_MODEL', message: 'no model' } }),
  });
  const controller = internals.createController({ t: (key) => key });
  controller.open();
  controller.setDraft('q');
  controller.send();
  await tick(20);

  const state = controller.snapshot();
  assert.equal(state.streaming, false);
  assert.equal(state.error.code, 'NO_MODEL');
  assert.equal(state.messages.length, 1);
  controller.dispose();
});

test('controller 关闭丢弃草稿、保留历史，并能恢复历史', async () => {
  const { internals, context } = loadClient();
  context.fetch = async () => ({
    ok: true,
    body: bodyFrom(['data: {"type":"delta","text":"答"}\n\n', 'data: {"type":"done"}\n\n']),
  });
  const controller = internals.createController({ t: (key) => key });
  controller.open();
  controller.setDraft('问题');
  controller.send();
  await tick(60);
  controller.setDraft('未发送草稿');
  controller.close();

  let state = controller.snapshot();
  assert.equal(state.open, false);
  assert.equal(state.draft, '');
  assert.equal(state.messages.length, 0);
  assert.equal(state.history.length, 1);

  const id = state.history[0].id;
  controller.open();
  controller.openHistory();
  controller.restoreHistory(id);
  state = controller.snapshot();
  assert.equal(state.historyOpen, false);
  assert.equal(state.mode, 'expanded');
  assert.deepEqual(
    plain(state.messages.map((message) => message.content)),
    ['问题', '答'],
  );

  controller.newChat();
  assert.equal(controller.snapshot().messages.length, 0);
  controller.dispose();
});

// ── React SSR 冒烟：真实渲染浮层，抓 hook 顺序与组件接线 ──────────────────

const requireFromTest = createRequire(import.meta.url);
const ReactImpl = requireFromTest('../../../node_modules/.pnpm/react@18.3.1/node_modules/react');
const { renderToString } = requireFromTest(
  '../../../node_modules/.pnpm/react-dom@18.3.1_react@18.3.1/node_modules/react-dom/server.js',
);

const SSR_LABELS = {
  title: '快捷提问',
  badge: '临时',
  inputAria: '快捷提问输入',
  placeholder: '问点什么…',
  placeholderExpanded: '继续追问…',
  hint: 'Enter 发送',
  user: '你',
  assistant: '助手',
  send: '发送',
  stop: '停止',
  retry: '重试',
  copy: '复制',
  copied: '已复制',
  close: '关闭',
  minimize: '收起',
  expand: '展开',
  newChat: '新话题',
  history: '历史',
  quote: '引用当前选中的文字',
  quoteChip: '引用选中文字',
  removeQuote: '移除引用',
  thinking: '正在回答…',
  stopped: '已停止',
  truncated: '达到上限',
  retryHint: '重新生成',
  panelLabel: '快捷提问',
  web: '联网',
  webOn: '联网已开',
  attach: '添加附件',
  deepThink: '深度思考',
  deepThinkOn: '深度思考已开',
  uploading: '上传中…',
  fileFailed: '上传失败',
  removeFile: '移除附件',
  deepThinking: '正在深度思考…',
  webHint: '开启后可用搜索与阅读链接',
  toolSearch: '正在搜索',
  toolOpen: '正在打开网页',
  toolFind: '正在页内查找',
  toolRead: '正在读取链接',
  toolUsage: '本次：搜索 {search} 次 · 抓取 {fetch} 次',
  citations: '来源',
  emptyLabels: { title: '临时提问，不会进入侧栏', body: '选中一段文字', hint: '只做解释' },
  historyLabels: {
    title: '本地历史',
    empty: '还没有历史',
    clear: '清空',
    confirmClear: '再点一次清空',
    remove: '删除这条',
  },
};

const SSR_BASE = {
  open: true,
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
  history: [],
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
};

/**
 * 用 SSR 渲染浮层。
 * @param overrides - 覆盖默认状态。
 */
function renderPanel(overrides) {
  const state = { ...SSR_BASE, ...overrides };
  const { internals } = loadClient(ReactImpl);
  const controller = new Proxy(
    { subscribe: () => () => {}, snapshot: () => state },
    {
      get(target, property) {
        if (property in target) return target[property];
        return () => {};
      },
    },
  );
  const originalError = console.error;
  // AutoTextarea 的 useLayoutEffect 在 SSR 下会打一条无害警告；测试里静音。
  console.error = () => {};
  try {
    return renderToString(
      ReactImpl.createElement(internals.QuickChatPanel, {
        controller,
        labels: SSR_LABELS,
        formatTime: () => '刚刚',
      }),
    );
  } finally {
    console.error = originalError;
  }
}

test('SSR：关闭态不渲染', () => {
  assert.equal(renderPanel({ open: false }), '');
});

test('SSR：紧凑态渲染多行输入框与发送按钮', () => {
  const html = renderPanel({ draft: '什么是 MCP？' });
  assert.match(html, /vqc-panel--compact/u);
  assert.match(html, /placeholder="问点什么…"/u);
  assert.match(html, /aria-label="快捷提问输入"/u);
  // 输入超过一行要能自己长高，所以紧凑态也是 textarea，不是单行 input。
  assert.match(html, /<textarea class="vqc-input" rows="1"/u);
  assert.match(html, /什么是 MCP？<\/textarea>/u);
  assert.match(html, /aria-label="发送"/u);
});

test('SSR：展开态渲染消息、引用 chip 与 Markdown 代码块', () => {
  const html = renderPanel({
    mode: 'expanded',
    selection: 'MCP 是 Model Context Protocol',
    messages: [
      { role: 'user', content: '什么是 MCP？' },
      { role: 'assistant', content: 'MCP 是协议。\n\n```js\nconst a = 1;\n```' },
    ],
  });
  assert.match(html, /vqc-panel--expanded/u);
  // 选中文字与附件同一个 chip 行，样式和结构都复用附件那套。
  assert.match(html, /vqc-files/u);
  assert.match(html, /vqc-fileChip vqc-fileChip--quote/u);
  // 引用 chip 的图标用 DSH 的「上下文注入」，不再自绘 T。
  assert.doesNotMatch(html, /M3\.5 4\.5h9/u);
  assert.match(html, /aria-label="移除引用"/u);
  assert.match(html, /vqc-prose/u);
  assert.match(html, /vqc-code/u);
  // 用户消息：右对齐气泡，不再有「你 / 助手」标记。
  assert.match(html, /vqc-msg vqc-msg--user/u);
  assert.match(html, /vqc-bubble/u);
  assert.match(html, /vqc-msg vqc-msg--assistant/u);
  assert.doesNotMatch(html, /vqc-role/u);
  assert.doesNotMatch(html, />你</u);
  assert.doesNotMatch(html, />助手</u);
  assert.match(html, /aria-label="历史"/u);
  assert.match(html, /aria-label="收起"/u);
  assert.match(html, /aria-label="关闭"/u);
});

test('SSR：紧凑态渲染附件、深度思考与联网三个控件', () => {
  const html = renderPanel({ draft: 'x' });
  assert.match(html, /aria-label="添加附件"/u);
  assert.match(html, /aria-label="深度思考"/u);
  assert.match(html, /aria-label="联网"/u);
  assert.match(html, /vqc-pill/u);
  assert.doesNotMatch(html, /vqc-pill--on/u);
});

test('SSR：深度思考开启时胶囊进入选中态', () => {
  const html = renderPanel({ deepThink: true, web: true });
  assert.match(html, /aria-label="深度思考已开"/u);
  assert.match(html, /aria-label="联网已开"/u);
  assert.match(html, /aria-pressed="true"/u);
});

test('SSR：附件 chip 显示上传中与失败两种状态', () => {
  const html = renderPanel({
    files: [
      { key: 'a', name: '需求.pdf', status: 'uploading' },
      { key: 'b', name: '截图.png', status: 'error', reason: 'file.tooLarge' },
    ],
  });
  assert.match(html, /vqc-files/u);
  assert.match(html, /需求\.pdf · 上传中…/u);
  assert.match(html, /vqc-fileChip--error/u);
});

test('SSR：展开态渲染联网开关，默认关闭', () => {
  const off = renderPanel({ mode: 'expanded' });
  assert.match(off, /aria-label="联网"/u);
  assert.doesNotMatch(off, /aria-label="联网已开"/u);

  const on = renderPanel({ mode: 'expanded', web: true });
  assert.match(on, /aria-label="联网已开"/u);
});

test('SSR：工具活动与引用来源都渲染出来', () => {
  const html = renderPanel({
    mode: 'expanded',
    streaming: true,
    streamText: '冰岛人口约 40 万。',
    tools: [{ action: 'search', queries: ['Iceland population'], url: '' }],
    citations: [{ url: 'https://example.com/a', title: '统计' }],
  });
  assert.match(html, /vqc-tools/u);
  assert.match(html, /正在搜索/u);
  assert.match(html, /vqc-citations/u);
  assert.match(html, /来源/u);
  assert.match(html, /href="https:\/\/example\.com\/a"/u);
});

test('SSR：历史回答保留引用来源', () => {
  const html = renderPanel({
    mode: 'expanded',
    messages: [
      { role: 'user', content: '冰岛人口？' },
      {
        role: 'assistant',
        content: '约 40 万。',
        citations: [{ url: 'https://example.com/b', title: '来源 B' }],
      },
    ],
  });
  assert.match(html, /来源 B/u);
  assert.match(html, /href="https:\/\/example\.com\/b"/u);
});

test('SSR：空态使用独立文案，不复用标题', () => {
  const html = renderPanel({ mode: 'expanded' });
  assert.match(html, /vqc-empty/u);
  assert.match(html, /临时提问，不会进入侧栏/u);
  assert.match(html, /选中一段文字/u);
});

test('SSR：错误态渲染错误卡片与重试', () => {
  const html = renderPanel({
    mode: 'expanded',
    error: { code: 'NO_MODEL', message: 'no model' },
    messages: [{ role: 'user', content: 'q' }],
  });
  assert.match(html, /vqc-error/u);
  assert.match(html, /重试/u);
});

test('SSR：流式态渲染光标与思考文案', () => {
  const emptyStream = renderPanel({ mode: 'expanded', streaming: true });
  assert.match(emptyStream, /正在回答…/u);
  const partial = renderPanel({ mode: 'expanded', streaming: true, streamText: '半句' });
  assert.match(partial, /vqc-caret/u);
  assert.match(partial, /半句/u);
});

test('SSR：历史态渲染条目与二次确认文案', () => {
  const html = renderPanel({
    mode: 'expanded',
    historyOpen: true,
    confirmClear: true,
    history: [
      { id: 'a', title: '什么是 MCP？', createdAt: 1, updatedAt: 2, messages: [{ role: 'user', content: 'q' }] },
    ],
  });
  assert.match(html, /本地历史/u);
  assert.match(html, /什么是 MCP？/u);
  assert.match(html, /再点一次清空/u);
  assert.match(html, /删除这条/u);
  // 单行结构：标题 + 时间/删除共用同一个槽；不再有「N 条消息」和存储位置说明。
  assert.match(html, /vqc-historyTitle/u);
  assert.match(html, /vqc-historySlot/u);
  assert.match(html, /vqc-historyRemove/u);
  assert.doesNotMatch(html, /条消息/u);
  assert.doesNotMatch(html, /只保存在本机浏览器/u);
});


test('apply 在快捷键注册失败时仍加载浮层并保留调试入口', () => {
  const { module, context } = loadClient();
  const registered = [];
  const ctx = {
    effect(fn) {
      const dispose = fn();
      return typeof dispose === 'function' ? dispose : () => {};
    },
    locale: {
      register: () => () => {},
      bind: () => (key) => key,
      subscribe: () => () => {},
    },
    shortcuts: {
      register() {
        throw new Error('Conflicting shortcut defaults');
      },
    },
    inject(_services, callback) {
      callback({
        slots: {
          inject(_name, factory) {
            return factory();
          },
          register(definition) {
            registered.push(definition.id);
            return () => {};
          },
        },
      });
    },
  };

  const originalError = console.error;
  console.error = () => {};
  try {
    assert.doesNotThrow(() => module.apply(ctx));
  } finally {
    console.error = originalError;
  }
  // 浮层与设置页是两个独立槽位。
  assert.deepEqual(registered, ['quick-chat-settings', 'quick-chat']);
  assert.equal(typeof context.window.__vtQuickChat?.state, 'function');
});

test('trimForRequest 保留最近消息并守住请求预算', () => {
  const { trimForRequest } = loadClient().internals;
  const many = Array.from({ length: 45 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `m${index}`,
  }));
  const trimmed = trimForRequest(many);
  assert.equal(trimmed.length, 40);
  assert.equal(trimmed[0].content, 'm5');
  assert.equal(trimmed.at(-1).content, 'm44');

  const huge = Array.from({ length: 40 }, () => ({
    role: 'user',
    content: 'x'.repeat(15_000),
  }));
  huge.push({ role: 'user', content: 'last' });
  const budget = trimForRequest(huge);
  assert.equal(budget.at(-1).content, 'last');
  assert.ok(JSON.stringify(budget).length <= 200_000);
});

// ── 凭证结论的三态：不知道时不得断言「没有凭证」 ──────────────────────────

test('旧宿主不返回 deepseek 字段时，客户端判定为未知而不是缺失', () => {
  const { deepseekCacheOf } = loadClient().internals;
  assert.deepEqual(plain(deepseekCacheOf({ settings: {} })), { deepseekKnown: false, deepseekConnected: false });
  assert.deepEqual(plain(deepseekCacheOf({ deepseek: { connected: true, via: 'account' } })), { deepseekKnown: true, deepseekConnected: true });
  assert.deepEqual(plain(deepseekCacheOf({ deepseek: { connected: false, via: '', reason: 'missing' } })), { deepseekKnown: true, deepseekConnected: false });
});

test('设置页视图：宿主没给结论时保持沉默，给了结论才说话', () => {
  const { deepseekViewOf } = loadClient().internals;
  assert.equal(plain(deepseekViewOf({})).known, false);
  const previous = { known: true, connected: true, via: 'api-key', reason: 'api-key' };
  // 保存时旧宿主不回字段，不能把已经确认的结论抹成「缺失」
  assert.deepEqual(plain(deepseekViewOf({}, previous)), plain(previous));
  assert.deepEqual(plain(deepseekViewOf({ deepseek: { connected: true, via: 'api-key', reason: 'api-key' } })), {
    known: true,
    connected: true,
    via: 'api-key',
    reason: 'api-key',
  });
});

test('未知凭证时保留联网与深度思考入口，明确缺失时才收起', () => {
  const client = loadClient();
  const { canUseWebTools, setSettingsCache } = client.internals;
  setSettingsCache({ provider: 'follow', deepseekKnown: false, deepseekConnected: false });
  assert.equal(canUseWebTools(), true);
  setSettingsCache({ provider: 'follow', deepseekKnown: true, deepseekConnected: true });
  assert.equal(canUseWebTools(), true);
  setSettingsCache({ provider: 'follow', deepseekKnown: true, deepseekConnected: false });
  assert.equal(canUseWebTools(), false);
  setSettingsCache({ provider: 'opencode-go::deepseek-v4.1-flash', deepseekKnown: true, deepseekConnected: true });
  assert.equal(canUseWebTools(), false);
});

// ── 键位：桌面端不能用 macOS 的死键组合 ──────────────────────────────────

/** macOS 上 Option+这些字母会产生死键，`event.key` 变成 "Dead"。 */
const DEAD_KEY_LETTERS = ['KeyE', 'KeyI', 'KeyN', 'KeyU'];

/** 只抓 shortcuts.register 的空壳 ctx。 */
function captureShortcut() {
  const { module } = loadClient();
  let captured = null;
  const ctx = {
    effect(fn) {
      const dispose = fn();
      return typeof dispose === 'function' ? dispose : () => {};
    },
    locale: { register: () => () => {}, bind: () => (key) => key, subscribe: () => () => {} },
    shortcuts: {
      register(command) {
        captured = command;
        return () => {};
      },
    },
    inject(_services, callback) {
      callback({
        slots: { inject: (_name, factory) => factory(), register: () => () => {} },
      });
    },
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    module.apply(ctx);
  } finally {
    console.error = originalError;
  }
  return captured;
}

test('桌面快捷键不使用会被 macOS 吞掉的 Option+死键字母', () => {
  const command = captureShortcut();
  assert.equal(command.id, 'quickChat.toggle');
  for (const profile of ['desktop:macos', 'desktop:windows', 'desktop:linux']) {
    const binding = command.defaults[profile];
    assert.ok(binding, `${profile} 必须声明默认键位`);
    const usesAlt = binding.modifiers.includes('alt');
    assert.equal(usesAlt, false, `${profile} 不能用 alt：macOS 桌面端会把它当死键放行`);
    // 死键只在 Option 参与时才出现；单独 ⇧⌘N 是正常按键。
    if (usesAlt) assert.equal(DEAD_KEY_LETTERS.includes(binding.code), false);
  }
});

test('Web 端不声明默认键位，避免与 session.new 抢键', () => {
  const command = captureShortcut();
  for (const profile of ['web:macos', 'web:windows', 'web:linux']) {
    assert.equal(command.defaults[profile], undefined);
  }
});

// ── /quick-chat 命令带来的开窗：开窗但把问题填进草稿，不自动发送 ──────────

test('openWith 打开小窗并把命令后面的文字放进草稿', () => {
  const controller = loadClient().internals.createController({ t: (key) => key });
  try {
    controller.openWith('  什么是 MCP  ');
    const state = controller.snapshot();
    assert.equal(state.open, true);
    assert.equal(state.mode, 'compact');
    assert.equal(state.draft, '什么是 MCP');
    assert.equal(state.streaming, false);
  } finally {
    controller.dispose();
  }
});

test('openWith 没带问题时不塞空草稿', () => {
  const controller = loadClient().internals.createController({ t: (key) => key });
  try {
    controller.openWith('   ');
    assert.equal(controller.snapshot().open, true);
    assert.equal(controller.snapshot().draft, '');
  } finally {
    controller.dispose();
  }
});

test('应用宿主事件后不会自己发请求', () => {
  const controller = loadClient().internals.createController({ t: (key) => key });
  try {
    controller.openWith('什么是 MCP');
    // 草稿进框、没有消息、没有流式状态——发送仍然要用户按下
    assert.deepEqual(plain(controller.snapshot().messages), []);
    assert.equal(controller.snapshot().streamText, '');
  } finally {
    controller.dispose();
  }
});

// ── 单行胶囊：真实渲染下类名是否挂上 ────────────────────────────────────

test('SSR：紧凑态只有一行输入时，窗口挂上胶囊类', () => {
  const html = renderPanel({ draft: '' });
  const cls = html.match(/class="(vqc-panel[^"]*)"/u)?.[1] ?? '';
  assert.match(cls, /vqc-panel--compact/u);
  assert.match(cls, /vqc-panel--single/u, `实得：${cls}`);
});

test('SSR：有消息、有附件、有引用、有错误时都不是胶囊', () => {
  for (const override of [
    { messages: [{ id: '1', role: 'user', content: 'hi', at: 0 }] },
    { files: [{ key: 'k', name: 'a.pdf', status: 'ready' }] },
    { selection: '一段引用' },
    { error: { code: 'AUTH', message: 'x' } },
    { streaming: true },
    { mode: 'expanded' },
  ]) {
    const html = renderPanel(override);
    const cls = html.match(/class="(vqc-panel[^"]*)"/u)?.[1] ?? '';
    assert.equal(/vqc-panel--single/u.test(cls), false, `不该是胶囊：${JSON.stringify(override)} → ${cls}`);
  }
});

// ── DSH 的 corner-shape：全圆角必须显式 round ────────────────────────────

test('所有 999px / 50% 圆角都显式声明 corner-shape:round', () => {
  // DSH 用通配选择器把 corner-shape 设成 superellipse(1.5)，
  // 不写 round 的话 999px 会被画成圆角方块，而不是圆/胶囊。
  const css = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  const rules = [...css.matchAll(/([^\n{}]+)\{([^{}\n]*)\}/gu)];
  assert.ok(rules.length > 50, '没读到样式表');
  const offenders = [];
  for (const rule of rules) {
    const body = rule[2];
    if (!/border-radius:\s*(999px|50%)/u.test(body)) continue;
    if (!/corner-shape:\s*round/u.test(body)) offenders.push(rule[1].trim().slice(0, 60));
  }
  assert.deepEqual(offenders, [], `这些规则缺 corner-shape:round：${offenders.join(' | ')}`);
});

test('强调色不用 brand-primary（它是文字色，浅色主题下会变黑）', () => {
  // --dsw-alias-brand-primary 映射到 label-primary，用它会渲染成正文黑；
  // DSH 的品牌蓝是 --dsw-alias-state-business-primary（deepseek-400/500）。
  const css = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.equal(css.includes('--dsw-alias-brand-primary'), false);
  assert.ok(css.includes('--dsw-alias-state-business-primary'));
});
