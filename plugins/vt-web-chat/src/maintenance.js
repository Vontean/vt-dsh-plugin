/**
 * 入口页注入：会话保留策略、默认收起侧栏、DSH 悬浮岛避让。
 *
 * 为什么清理必须发生在前端启动之前：对话列表在启动时读一次 IndexedDB，
 * 清理放晚会让用户先看到即将被删的会话，再在列表里凭空消失。
 * `chat-demo` 的产物只有一个 defer 入口脚本，所以把入口脚本摘下、清理完再挂回去，
 * 顺序就确定了，而且不需要改上游任何源码。
 */
const DB_NAME = 'chat-demo';

/**
 * 生成注入到 `index.html` 的内联脚本。
 * @param appSrc - 前端入口脚本地址；null 表示没找到入口，清理不阻塞启动。
 * @param capability - 面板能力令牌，随每个 `/webchat/` 请求回传。
 * @returns 内联脚本文本。
 */
export function bootstrapScript(appSrc, capability) {
  return `(function () {
  var APP_SRC = ${JSON.stringify(appSrc)};
  var CAP = ${JSON.stringify(typeof capability === 'string' ? capability : '')};
  var DB = ${JSON.stringify(DB_NAME)};
  var DAY = 86400000;
  var log = function (message, detail) {
    try { console.info('[webchat] ' + message, detail === undefined ? '' : detail); } catch (error) {}
  };

  // 面板的每个请求都带上能力令牌：这样宿主不必区分浏览器 Cookie、桌面壳 IPC 或
  // cross-site 判定，只要令牌对得上、来源在回环，就放行。
  if (CAP) {
    try {
      var nativeFetch = window.fetch.bind(window);
      window.fetch = function (input, init) {
        try {
          var url = typeof input === 'string' ? input : (input && input.url) || '';
          if (url.indexOf('/webchat/') === 0 || url.indexOf(window.location.origin + '/webchat/') === 0) {
            var headers = new Headers((init && init.headers) || (input && input.headers) || undefined);
            headers.set('x-vtwc-cap', CAP);
            init = Object.assign({}, init, { headers: headers });
          }
        } catch (error) {}
        return nativeFetch(input, init);
      };
    } catch (error) {}
  }

  function boot() {
    if (!APP_SRC) return;
    var script = document.createElement('script');
    script.src = APP_SRC;
    script.async = false;
    document.body.appendChild(script);
  }

  function openDatabase() {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB);
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
      request.onblocked = function () { reject(new Error('database blocked')); };
    });
  }

  function allSummaries(db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('sessionSummaries', 'readonly');
      var request = tx.objectStore('sessionSummaries').getAll();
      request.onsuccess = function () { resolve(request.result || []); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function deleteExpired(db, expired, deadFiles) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(['sessions', 'sessionSummaries', 'files'], 'readwrite');
      var summaries = tx.objectStore('sessionSummaries');
      var sessions = tx.objectStore('sessions');
      var files = tx.objectStore('files');
      expired.forEach(function (summary) {
        sessions.delete(summary.id);
        summaries.delete(summary.id);
      });
      deadFiles.forEach(function (id) { files.delete(id); });
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error); };
    });
  }

  /**
   * 删除 updatedAt 早于截止时间的会话，以及因此不再被引用的本地附件原件。
   * 判断全部在事务外算好，事务里只发同步请求，避免事务提前失活。
   */
  async function prune(days) {
    if (typeof indexedDB === 'undefined') return 0;
    // 库还不存在时不要凭空建一个空库，交给前端自己创建。
    if (typeof indexedDB.databases === 'function') {
      var databases = await indexedDB.databases();
      if (!databases.some(function (entry) { return entry && entry.name === DB; })) return 0;
    }
    var db = await openDatabase();
    try {
      if (!db.objectStoreNames.contains('sessionSummaries')) return 0;
      var cutoff = Date.now() - days * DAY;
      var summaries = await allSummaries(db);
      var expired = [];
      var alive = [];
      summaries.forEach(function (summary) {
        var stamp = typeof summary.updatedAt === 'number' ? summary.updatedAt : summary.createdAt;
        if (typeof stamp === 'number' && stamp < cutoff) expired.push(summary);
        else alive.push(summary);
      });
      if (expired.length === 0) return 0;

      var keep = new Set();
      alive.forEach(function (summary) {
        (Array.isArray(summary.fileIds) ? summary.fileIds : []).forEach(function (id) { keep.add(id); });
      });
      var deadFiles = [];
      expired.forEach(function (summary) {
        (Array.isArray(summary.fileIds) ? summary.fileIds : []).forEach(function (id) {
          if (!keep.has(id)) deadFiles.push(id);
        });
      });
      await deleteExpired(db, expired, deadFiles);
      return expired.length;
    } finally {
      try { db.close(); } catch (error) {}
    }
  }

  // 跟随宿主语言：只在用户还没在前端里选过语言时写入，之后以前端自己的设置为准。
  try {
    var lang = new URLSearchParams(window.location.search).get('lang');
    if (lang && !window.localStorage.getItem('chat-demo:locale')) {
      window.localStorage.setItem('chat-demo:locale', lang);
    }
  } catch (error) {}

  // 面板是主内容区的一块画布，默认不展开自己的侧栏：先把舞台让给对话。
  // 只强制一次（升级到本版本时），之后完全尊重用户在前端里的手动展开/收起。
  try {
    if (window.localStorage.getItem('vtwc:sider-default-applied') === null) {
      window.localStorage.setItem('chat-demo:sider-collapsed', 'true');
      window.localStorage.setItem('vtwc:sider-default-applied', '1');
    }
  } catch (error) {}

  // DSH 悬浮岛避让：宿主量出顶部被占的高度后发过来，这里只负责落成 CSS 变量。
  (function installSeatBridge() {
    var root = document.documentElement;
    function siderState() {
      var frame = document.querySelector('#root > [class*="frame-"]');
      var sider = frame === null ? null : frame.querySelector('[class*="sider-"]');
      root.setAttribute('data-vtwc-sider', sider === null ? 'collapsed' : 'open');
    }
    function apply(inset) {
      if (typeof inset !== 'number' || !isFinite(inset) || inset <= 0) {
        root.removeAttribute('data-vtwc-seat');
        root.style.removeProperty('--vtwc-seat');
      } else {
        root.setAttribute('data-vtwc-seat', '');
        root.style.setProperty('--vtwc-seat', Math.round(inset) + 'px');
      }
      siderState();
    }
    window.addEventListener('message', function (event) {
      var data = event.data;
      if (data && data.type === 'vt-webchat:seat') apply(data.inset);
    });
    siderState();
    var frame = document.querySelector('#root > [class*="frame-"]');
    if (frame !== null && typeof MutationObserver === 'function') {
      new MutationObserver(siderState).observe(frame, { childList: true });
    }
    try {
      parent.postMessage({ type: 'vt-webchat:hello' }, '*');
    } catch (error) {}
  })();

  // 网页版的设置项里有一个 API Key 输入；请求其实由宿主代发，这里给一个占位值，
  // 让前端跳过首次使用的引导，用户也不需要看到一把假密钥的来源。
  try {
    if (!window.localStorage.getItem('chat-demo:api-key')) {
      window.localStorage.setItem('chat-demo:api-key', 'managed-by-dsh');
    }
  } catch (error) {}

  var settings = fetch('/webchat/api/settings', { headers: { accept: 'application/json' } })
    .then(function (response) { return response.ok ? response.json() : null; })
    .then(function (value) {
      var days = value && typeof value.retentionDays === 'number' ? value.retentionDays : 30;
      return days > 0 ? days : 0;
    })
    .catch(function () { return 30; });

  // 清理最多等 3 秒：存储异常时宁可这次不清理，也不能让面板一直白屏。
  Promise.race([
    settings.then(function (days) { return days > 0 ? prune(days) : 0; }),
    new Promise(function (resolve) { setTimeout(function () { resolve(-1); }, 3000); }),
  ])
    .then(function (removed) {
      window.__vtWebChatRetention = { removed: removed };
      if (removed > 0) log('retention removed sessions', removed);
      else if (removed === -1) log('retention skipped: storage timeout');
    })
    .catch(function (error) {
      var message = String(error && error.message ? error.message : error);
      window.__vtWebChatRetention = { removed: -2, error: message };
      log('retention failed', message);
    })
    .then(boot);
})();`;
}

/**
 * 悬浮岛避让样式。
 *
 * DSH 的 `shell.leading` 座位（docs：`--dsh-frame-leading-clearance`）在侧栏收起时
 * 覆盖在主面板左上角。面板是 iframe，拿不到宿主的 CSS 变量，所以由父页量出座位底部，
 * 这里把它落成：整块应用下移同样的高度、并在顶部补出与左右两栏一致的底色。
 * 只用 `#root > [class*="frame-"]` 这一条结构选择器，不依赖上游的哈希类名。
 */
const SEAT_STYLE = `<style id="vtwc-seat">html[data-vtwc-seat] #root > [class*="frame-"]{top:calc(var(--app-viewport-top,0px) + var(--vtwc-seat,0px))!important;height:calc(var(--app-viewport-height,100dvh) - var(--vtwc-seat,0px))!important}html[data-vtwc-seat]{background:var(--dsw-alias-bg-base)}html[data-vtwc-seat][data-vtwc-sider="open"]{background:linear-gradient(to right,var(--dsw-specific-sidebar-fill) 0 261px,var(--dsw-alias-bg-base) 261px)}</style>`;

/**
 * 把启动闸门注入入口页：摘掉前端入口脚本，换成注入脚本在清理后挂回。
 * @param html - 原始 index.html 文本。
 * @returns `{ html, gated }`；`gated` 表示是否成功接管了入口脚本。
 */
export function injectBootstrap(html, capability) {
  const entry = /<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*<\/script>/iu.exec(html);
  const appSrc = entry === null ? null : entry[1];
  const stripped = entry === null ? html : html.replace(entry[0], '');
  const tag = `<script>${bootstrapScript(appSrc, capability)}</script>`;
  const withStyle = /<\/head>/iu.test(stripped) ? stripped.replace(/<\/head>/iu, `${SEAT_STYLE}</head>`) : `${SEAT_STYLE}${stripped}`;
  const injected = /<\/body>/iu.test(withStyle)
    ? withStyle.replace(/<\/body>/iu, `${tag}</body>`)
    : `${withStyle}${tag}`;
  return { html: injected, gated: appSrc !== null };
}
