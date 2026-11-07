# 侧边栏与输入区插件 · 交互契约核查

核查对象：`vt-sidebar-sort`、`vt-quote-bar`、`vt-mine-models`、`vt-web-chat`

---

## 一、核查口径

### 核查对象版本

| 项 | 值 | 说明 |
|---|---|---|
| 插件运行时版本 | 4 个插件均为当前 `enabled/active` | 所以本报告讨论的是**行为是否悄悄退化**，不是「装不上」 |
| 开发时对标的 DSH | 0.2.1-rc.5 | 各插件 `engines.dsh` 写的是 `>=0.2.1-rc.5 <0.3.0` |
| 当前 DSH | **0.2.2-rc.1** | `/tmp/dsh-full/dsh-*/package.json` 中互相依赖的版本声明均为 `0.2.2-rc.1` |
| 桌面壳协议 | `protocolVersion: 1` | 桌面壳 `lib/preload-app.cjs` 导出 |

`engines.dsh` 的判定用 semver `includePrerelease: true`（`dsh-app-boot/lib/index.js` 的 `satisfies()`），
因此 `>=0.2.1-rc.5 <0.3.0` 会接受 `0.2.2-rc.1`——这不是阻塞项，四个插件都能加载起来。

### 方法

1. 读每个插件的 `README.md` / `DESIGN.md`，确认它替用户解决什么问题、交互目的还成不成立。
2. 读 `client.js` / `index.js`，把「插件假设 DSH 一定成立的东西」逐条列出来：
   插槽 id、`data-*` 锚点、CSS Module 类名、宿主 `ctx` 服务、HTTP 路由、语言包 key、CSS 变量。
3. 逐条到 `/tmp/dsh-full`（从 `app.asar` 抽出的 330 个 `@deepseek-ai` 包）里 grep 取证。
   桌面壳相关的结论另取自 asar 内的 `lib/preload-app.cjs` 与 `lib/main.js`。
4. **只记录，不改任何插件源码。**

取证范围有一个必须交代的边界：`@deepseek-ai/dsh-client-ui-primitives` 在本版**没有独立包目录**
（asar 内不存在该路径），它被合并进前端产物 `dsh-web-frontend/dist`。因此凡是落在
`MenuSurface` / `Input` / `MenuGroup` / `Tooltip` 内部结构上的假设，只能用「调用方写法对照 +
前端产物」间接验证，不能像其他项那样直接给出 `包名/文件:行` 的契约定义。这类项统一标为
「脆弱」，并在证据栏写明是间接证据。

### 判定分级

| 判定 | 含义 | 对用户意味着什么 |
|---|---|---|
| **正常** | 锚点/契约在当前版本存在，语义未变 | 今天行为和当初设计一致 |
| **语义变化** | 锚点还在，但含义、取值或数据形状变了 | 功能不会突然坏，但可能已经悄悄做了另一件事，或与新的官方机制并行 |
| **已失效** | 锚点/契约在当前版本不存在 | 相关功能确定不工作（会静默降级或直接消失） |
| **脆弱** | 今天可用，但依赖未承诺的内部细节 | 下一次小版本就可能断，而且断了通常不报错 |

> 全文的「行号」均指 `/tmp/dsh-full` 中对应包 `lib/client.js`（或 `lib/index.js`、`lib/types/*.js`）的行号，
> 用 `grep -n` 可原样复查。

---

## 二、vt-sidebar-sort · 侧边栏排序

### 交互目的

让用户把「新会话」下面那一列入口（网页对话 / 插件 / 自动化任务 …）拖成自己习惯的顺序，
并且能把暂时用不到的项拖进「更多」里收起来，需要时再拖回来。

### 依赖契约清单

| # | 契约 | 插件里的原文 | DSH 侧现状 | 判定 |
|---|---|---|---|---|
| 1 | 插槽 `sidebar.panellist.actions` | `ctx.slots.register({ name: 'sidebar.panellist.actions', id: 'vt-sidebar-sort', order: -1 }, MoreSection)` | `dsh-client-ui-sidebar/lib/client.js:753-757`，`kind: "list"`、`scope: "root"` | 正常 |
| 2 | 该插槽向子组件传 `entries` / `onOpen` / `onDismiss` | `props.entries`、`props.onOpen?.()`、`props.onDismiss?.()` | `dsh-client-ui-sidebar/lib/client.js:279-284`（`renderSlot("sidebar.panellist.actions", { entries, onOpen, onPinnedChange, onDismiss })`） | 正常 |
| 3 | 列表容器 `nav[class*="_panelList"]` | `NAV_SELECTOR = 'nav[class*="_panelList"]'` | `dsh-client-ui-sidebar/lib/client.js:151`（`panelList`）、`:510-511`（`<nav className={panelList}>`） | 正常 |
| 4 | 行按钮 `button[class*="_panelRow"]` | `ROW_SELECTOR = 'button[class*="_panelRow"]'` | `dsh-client-ui-sidebar/lib/client.js:152`、`:212-214`（`<button className={panelRow}>`） | 正常 |
| 5 | 「更多」= 唯一带 `aria-haspopup="menu"` 的面板行 | `MORE_SELECTOR = 'button[aria-haspopup="menu"][class*="_panelRow"]'` | `dsh-client-ui-sidebar/lib/client.js:258-260` | 正常 |
| 6 | 行图标容器 `span[class*="_panelGlyph"]` | `row.querySelector('span[class*="_panelGlyph"]')` | `dsh-client-ui-sidebar/lib/client.js:149`、`:225-227` | 正常 |
| 7 | `PanelRow` 的 React props 里有 `id` / `label` / `renderSlot` | fiber 向上 16 层找 `typeof props.id === 'string' && typeof props.label === 'string' && typeof props.renderSlot === 'function'` | `dsh-client-ui-sidebar/lib/client.js:206-212`（签名恰为 `{ id, label, wide, usePanelInfo, selectPanel, trackEntryClick, renderSlot }`） | 正常 |
| 8 | 「更多」按钮外层只有一层容器（用于把它永远排到末尾） | `anchor.parentElement === nav` | 间接：`dsh-client-ui-sidebar/lib/client.js:245-251` 给 `Menu` 传 `className: moreAnchor`；`Menu` 实现（`dsh-web-frontend/dist`）返回 `<span className={de(root, className)}>{anchor}…</span>`，故 `more.parentElement` 是那个 span，其父是 nav | 正常（依赖 primitives 内部） |
| 9 | 拖拽插入线视觉 | `.vt-sort-before::before` 的 55deg/125deg + 2px 渐变 | `dsh-client-ui-workspace/lib/client.js:1955`（`.JoiKIa_sessionRow.JoiKIa_dropBefore:before` 同一套渐变与 5px/7px 尺寸） | 正常 |
| 10 | CSS 变量 | `--dsw-alias-state-business-primary`、`--dsw-alias-interactive-bg-hover`、`--dsw-radius-md`、`--dsw-alias-label-primary`、`--dsw-focus-ring-width`、`--dsw-focus-ring-color`、`--ds-ease-in-out` | `dsh-client-ui-theme/lib/client.js:1464`（radius）、`:1470`（business-primary / interactive-bg-hover / label-primary）、`:1473`（focus-ring-width）、`:1482`（elevation） | 正常 |
| 11 | 「更多」是否出现取决于 actions 是否非空 | 注释：「占用项一旦存在，侧边栏就会显示『更多』按钮（hasEntryActions）」 | `dsh-client-ui-sidebar/lib/client.js:296`、`:518`；且 `dsh-client-ui-entry-customization/lib/client.js:195-200` 常驻注册，所以这个条件实际**永远**为真 | 语义变化（见 S1） |

### 发现

| 编号 | 插件 | 失效时的用户可见现象 | 依赖的锚点原文 | DSH 侧证据（包名 文件:行） | 判定 | 建议加固方向 |
|---|---|---|---|---|---|---|
| S1 | vt-sidebar-sort | 今天无差异。将来 DSH 给出「取消固定 / 收进更多」的官方入口后，同一行会同时受「插件自己记的隐藏列表」和「DSH 自己记的 unpinned 列表」两套状态控制，可能出现「已经从列表消失，但插件仍以为它在」或「两边都以为对方会收」的矛盾 | 插件自建 `state.hidden` + `.vt-sort-filed{display:none!important}`；而官方在 `sidebar.panellist.actions` 的 owner props 里已经下发 `onPinnedChange(id, pinned)`，语义为「Show (true) or unpin (false) a panel launcher」 | `dsh-client-ui-sidebar/lib/client.js:17-32`（`createPanelPins` / `setPinned`）、`:294`（`unpinned`）、`:510-519`（`panels.filter(({id}) => id === "plugins" \|\| !unpinned.includes(id))`）、`:279-284`（下发 `onPinnedChange`）；`dsh-cordis-client-runner/lib/client.js:6302`（`SidebarPanelActionsOwnerProps` 文档） | 语义变化 | 把「收进更多」改为调用官方的 `onPinnedChange(id, false)`，只在官方未提供时才退回自建隐藏列表 |
| S2 | vt-sidebar-sort | 插件启用时正常。但 `nav` 是 React 按 `key=id` 渲染的子树，插件用 `nav.append(...)` 手工换序；React 下次重排（插件启停、语言切换、面板增减）会先回到 slot 顺序再被纠正，用户可能看到一次顺序闪动；极端情况下 React 的 `removeChild/insertBefore` 与手工移动打架，控制台抛 `NotFoundError` | `nav.append(...desired.map((id) => byId.get(id))...)` | `dsh-client-ui-sidebar/lib/client.js:510-519`（`panels.filter(...).map(...)` 每行 `key=id`）、`:690-705`（`syncPanels`：插槽与语言变化都会重建 `panels`）；插件 `client.js:441-453` 直接改 DOM 顺序 | 脆弱 | 优先改成在插槽层表达顺序（例如由插件注册同名 panel 代理），DOM 换序仅作兜底，并给 React 交点加错误捕获 |
| S3 | vt-sidebar-sort | 行身份读的是 React 内部键 `__reactFiber$…`。若 React 大版本或 DSH 把面板行改成别处渲染，所有行会退化成键 `label:<aria-label>`；表现为：切换界面语言后已排好的顺序丢失，需要重新拖一次（不报错） | `const FIBER_PREFIX = '__reactFiber$'` + `fiberOf()` + 向上 16 层读 `memoizedProps` | 间接：`dsh-client-ui-sidebar/lib/client.js:206-212`（`PanelRow` props 形状仍匹配）；`__reactFiber$` 是 React 内部实现，非 DSH 契约 | 脆弱 | 给行增加一个稳定身份来源（例如由插件在 `sidebar.panellist` 注册时自带 id 映射），fiber 只作最后兜底 |
| S4 | vt-sidebar-sort | 若类名后缀被改，拖动完全失效（行不 draggable、无插入线），但插件仍显示已加载 | `NAV_SELECTOR` / `ROW_SELECTOR` / `MORE_SELECTOR` / `_panelGlyph` | `dsh-client-ui-sidebar/lib/client.js:149-152`（四个类名齐全） | 正常 | 保持后缀匹配；可加一次「找不到行」的可见提示，避免静默 |
| S5 | vt-sidebar-sort | 若插槽不再下发 `entries/onOpen/onDismiss`，「更多」里的收起项会变成无文字、点了没反应的按钮 | `props.entries` / `props.onOpen?.(id)` / `props.onDismiss?.()` | `dsh-client-ui-sidebar/lib/client.js:279-284` | 正常 | 已用可选链，失败时降级为不可点，可接受；建议在其中至少一条缺失时隐藏自建行 |
| S6 | vt-sidebar-sort | 若官方会话行的插入线样式改了，插件的拖拽指示会与原生不一致（视觉上「两套拖拽」） | `.vt-sort-before::before` 渐变 | `dsh-client-ui-workspace/lib/client.js:1955` | 正常 | 纯视觉，风险低；把渐变抽成变量以便跟随官方 |
| S7 | vt-sidebar-sort | 「更多」不再固定在底部，而是被换序的行挤到上方 | `if (anchor !== null && anchor.parentElement === nav && nav.lastElementChild !== anchor) nav.appendChild(anchor)` | 间接：`dsh-client-ui-sidebar/lib/client.js:245-251` + `Menu` 前端产物实现（`<span className={de(root, className)}>` 包住 anchor） | 正常 | 现在成立，但依赖 `Menu` 只包一层；建议改为「按 DOM 顺序在 nav 末尾插入一个占位」而不是依赖层数 |
| S8 | vt-sidebar-sort | 若将来官方取消 `entry-customization` 对 actions 的常驻注册，「更多」按钮会只在用户真的收起过某项后才出现（插件本身能处理，但用户会发现菜单时有时无） | 注释：「只在真的有收起项时占用『更多』菜单：否则会让这个菜单凭空出现、而且是空的」 | `dsh-client-ui-entry-customization/lib/client.js:195-200`（常驻）、`dsh-client-ui-sidebar/lib/client.js:296`（`hasEntryActions`） | 语义变化 | 现状比插件假设的宽松（官方条目常驻），无需改动；但注释里的前提已不成立，应更新说明 |

---

## 三、vt-quote-bar · 模型额度

### 交互目的

在侧边栏账号行上方放一条额度读数：默认是一行 44px 的「额度环 + 提供商名」，
点开是完整面板（DeepSeek 余额，或 OpenCode Go 的 5 小时 / 本周 / 本月三条进度）。
用户不用切页面就能知道「还能用多少」。

### 依赖契约清单

| # | 契约 | 插件里的原文 | DSH 侧现状 | 判定 |
|---|---|---|---|---|
| 1 | 插槽 `sidebar.footer.action`，props 带 `wide` | `ctx.slots.register({ name: 'sidebar.footer.action', id: 'vt-quote-bar', order: 10, inject: () => ({ t, locale: ctx.locale }) }, QuotaBarShell)`；组件读 `props.wide` | `dsh-client-ui-sidebar/lib/client.js:765-768`（`kind:"list"`, `scope:"root"`）、`:560-561`（`renderSlot("sidebar.footer.action", { wide })`） | 正常 |
| 2 | `data-slot="sidebar.footer.action"` 作为 CSS 锚点 | `div:has(> [data-slot="sidebar.footer.action"] .vtq-root)` | `dsh-client-ui-renderer/lib/client.js:1112-1124`（每个 outlet 渲染 `<div data-slot={slotKey} style={{display:"contents"}}>`） | 正常 |
| 3 | 宿主路由 `ctx.webServer.register({ kind:'prefix', path, handler })` | `ctx.webServer.register({ kind:'prefix', path: ROUTE_PREFIX, handler })` | `dsh-host-webserver/lib/index.js:370-377`（`register(route)`，`kind === "exact"` 与 prefix 两表，重复注册抛错）；`:579-586`（最长前缀优先） | 正常 |
| 4 | `inject = ['webServer','llm']` | 模块级 `inject` | 两个服务名仍存在（`dsh-host-webserver`、`dsh-llm`） | 正常 |
| 5 | `ctx.llm.listProviders()` / `listConfigurableProviders()` | `for (const provider of ctx.llm.listProviders())` | `dsh-llm/lib/index.js:1908-1909`（`listProviders()` 返回 `{...provider}`）、`:1783-1791`（`listConfigurableProviders` 仍在 Remote 装饰） | 正常 |
| 6 | 可配置 provider 的 `settingsNs` / `settingsPath` 字段 | `entry.settingsNs`、`getPath(value, entry.settingsPath)` | `dsh-llm-deepseek-account/lib/index.js:133-134`；官方同样写法见 `dsh-api-session-controller/lib/types/catalog.js:95-96` | 正常 |
| 7 | `ctx.get('settings').describe()` → 数组，含 `ns` / `value` | `descriptors.find((d) => String(d.ns) === ns)?.value` | `dsh-settings/lib/index.js:509-511`（`this.describe().find((row) => row.ns === ns)`，并有 `descriptor.revision`） | 正常 |
| 8 | `ctx.get('credentials').describe(ref)` → `{configured}`；`.resolve(ref)` → `{value}` | `info?.configured === true`、`resolved.value` | `dsh-credentials-local/lib/index.js:480`（`resolve`）、`:498-537`（`describe` 返回 `{configured:…}`）；官方同用法见 `dsh-web-deepseek-api/lib/index.js:25,62` | 正常 |
| 9 | `ctx.get('deepseekAccount').getState()` → `{status}`，`getBalance(client)` → `{status:'ready', value, bonusWallets}` | `state?.status !== 'credential-stored'`、`balance.status !== 'ready'`、`balance.bonusWallets` | `dsh-deepseek-account/lib/index.js:35-40`（服务名 `"deepseekAccount"`）、`dsh-api-account-controller/lib/types/index.js:93-95,103-104`（`getState()` / `getBalance(client)`）；`credential-stored` 与 `bonusWallets` 见 `dsh-api-account-controller/lib/typert.host.js:22,48` | 正常 |
| 10 | 余额请求的客户端身份 `{version, locale, timezoneOffsetSeconds}` | `const metadata = { version: '0.2.1', locale, timezoneOffsetSeconds }` | 官方同结构见 `dsh-client-ui-settings-account/lib/client.js:2847`，但 `version` 取自构建期注入的 `DSH_CLIENT_VERSION`，且为空就抛错（`:2839-2841`） | **语义变化**（见 Q8） |
| 11 | `ctx.get('agentDefaultModel')?.currentSelection?.()` → `{provider, model}` | `selection?.provider` | `dsh-agent-default-model/lib/index.js:27`（服务名）、`:38-46`（`currentSelection()` 返回 `{provider, model, reasoningEffort?}`） | 正常 |
| 12 | `ctx.get('connection').requestRejection(req)` | `connection.requestRejection(req) === undefined` | `dsh-client-connection/lib/index.js:737`；同用法见 `dsh-host-open-in-app/lib/index.js:1265` | 正常 |
| 13 | `ctx.locale.register(ns, 'zh', dict)` 三参数形式 + `bind` | `ctx.locale.register(NS, 'zh', DICT.zh)`、`ctx.locale.bind(NS)` | `dsh-client-locale/lib/client.js:1675`（`register(ns, localeOrDicts, dict)`）、`:1702`（`bind`） | 正常 |
| 14 | `locale.getSnapshot()` / `locale.subscribe()` | `locale?.getSnapshot?.()`、`locale.subscribe(...)` | `dsh-client-locale/lib/client.js:1538`、`:1548` | 正常 |
| 15 | CSS 变量 | `--dsw-alias-label-primary/-secondary/-tertiary`、`--dsw-alias-border-l3`、`--dsw-alias-interactive-bg-hover`、`--dsw-alias-brand-primary`、`--dsw-radius-md` | `dsh-client-ui-theme/lib/client.js:1464,1470` | 正常 |
| 16 | 宿主路径前缀必须与客户端 base 拼得上 | 客户端 `API_PREFIX = 'vt-quote-bar/api/'`，宿主 `ROUTE_PREFIX = '/vt-quote-bar/api'` | 同源相对路径 + 最长前缀匹配（`dsh-host-webserver/lib/index.js:579-586`） | 正常 |

### 发现

| 编号 | 插件 | 失效时的用户可见现象 | 依赖的锚点原文 | DSH 侧证据（包名 文件:行） | 判定 | 建议加固方向 |
|---|---|---|---|---|---|---|
| Q1 | vt-quote-bar | 额度行消失或不再换行到账号行上方（被挤在同一行里） | `renderSlot("sidebar.footer.action", { wide })` + `flex: 0 0 100%` + `div:has(> .vtq-root){flex-wrap:wrap}` | `dsh-client-ui-sidebar/lib/client.js:560-561`（footerActions 仍是 `display:flex` 容器）、`:116`（`.footerActions{display:flex}`） | 正常 | 无 |
| Q2 | vt-quote-bar | 面板打不开（`data-slot` 找不到，`fetch` 也 404） | `[data-slot="sidebar.footer.action"]`、`vt-quote-bar/api/providers` | `dsh-client-ui-renderer/lib/client.js:1112-1124` | 正常 | 无 |
| Q3 | vt-quote-bar | 额度永远显示「暂时不可用」，重试无效 | `ctx.webServer.register({ kind:'prefix', path:'/vt-quote-bar/api', handler })` | `dsh-host-webserver/lib/index.js:370-377` | 正常 | 无 |
| Q4 | vt-quote-bar | 切换器里只剩 DeepSeek 账号（读不到 opencode-go 配置） | `ctx.llm.listConfigurableProviders()`、`entry.settingsNs`、`entry.settingsPath` | `dsh-llm/lib/index.js:1908-1909`；`dsh-api-session-controller/lib/types/catalog.js:95-96` | 正常 | 无 |
| Q5 | vt-quote-bar | 已配好的 API Key 被判成「未配置」，额度行显示「未配置 API Key」 | `credentials.describe(ref)?.configured` | `dsh-credentials-local/lib/index.js:498-537` | 正常 | 无 |
| Q6 | vt-quote-bar | DeepSeek 账号余额一直「读取失败」或「未登录」 | `account.getState()`、`account.getBalance(metadata)`、`balance.status === 'ready'` | `dsh-deepseek-account/lib/index.js:35-40`；`dsh-api-account-controller/lib/types/index.js:93-104` | 正常 | 无 |
| Q7 | vt-quote-bar | 面板里默认选中的不是用户当前在用的提供商，而是列表第一项 | `ctx.get('agentDefaultModel')?.currentSelection?.()` | `dsh-agent-default-model/lib/index.js:38-46` | 正常 | 无 |
| Q8 | vt-quote-bar | 今天只是「上报给服务端的客户端版本是 0.2.1」。若平台侧按客户端版本做能力/兼容判定，用户会看到与真实版本不符的行为（例如某接口被判为旧客户端而不返回新字段），且排查时很容易误判 | `const metadata = { version: '0.2.1', locale, timezoneOffsetSeconds }` | `dsh-client-ui-settings-account/lib/client.js:2839-2841`（版本必须非空，否则抛错）、`:2843-2847`（官方从构建注入的 `DSH_CLIENT_VERSION` 取 `version`）；当前 DSH 为 `0.2.2-rc.1` | 语义变化 | 改为读取宿主提供的客户端版本（例如 `ctx.get('clientVersion')` 一类服务，或在拿不到时省略该字段），不要在插件里写死版本号 |
| Q9 | vt-quote-bar | 本机插件路由被拒（403），面板一直报「暂时不可用」 | `connection.requestRejection(req) === undefined` | `dsh-client-connection/lib/index.js:737` | 正常 | 无 |
| Q10 | vt-quote-bar | 面板文案不再跟随界面语言切换（停留在打开时的语言） | `ctx.locale.register(NS, 'zh', DICT.zh)` / `bind(NS)` / `subscribe()` | `dsh-client-locale/lib/client.js:1675,1702,1538,1548` | 正常 | 无 |
| Q11 | vt-quote-bar | 圆环/额度条颜色错乱或不可见 | `--dsw-alias-border-l3`、`--dsw-alias-label-tertiary`、`--dsw-alias-interactive-bg-hover` | `dsh-client-ui-theme/lib/client.js:1470` | 正常 | 无 |

---

## 四、vt-mine-models · 模型选择器（MineCodex 风格）

### 交互目的

把输入框里的模型选择换成两段式：点一下先出现「当前模型 + 思考强度滑条」，
点模型名再展开带厂商图标的模型列表。数据仍走 DSH 自己的模型目录，和 `/model` 同源。
它的关键手段是**抢占官方 `ModelSelect` 的座位**，而不是在官方控件上打补丁。

### 依赖契约清单

| # | 契约 | 插件里的原文 | DSH 侧现状 | 判定 |
|---|---|---|---|---|
| 1 | 插槽 `conversation.input.model` 是 `single` 且「动态条目优先」 | `scope.slots.register({ name:'conversation.input.model', priority: -1, locale: NS, inject: (sessionId) => … }, MineModelSelect)` | `dsh-cordis-client-runner/lib/client.js:3818-3826`（`kind:"single"`、`scope:"session"`、`ownerProps` 仅 `locked`、`replaceRisk:"shadows-shipped-ui"`）；规则见 `:5315-5320`（「动态注册的条目优先级低于内置条目，因此它成为赢家」） | 正常 |
| 2 | `priority: -1` 能生效并与官方 `0` 比较 | 注册选项 `priority: -1` | `dsh-cordis-client-runner/lib/client.js:432-436`：非 chain 槽位会把 `options.priority` **直接覆盖**为 `env.allocatePriority()`；`:771`（`() => --this.nextPriority`）、`:549`（`nextPriority = 0`）。官方注册未传 priority（`dsh-client-ui-model-selection/lib/client.js:2064-2085`） | **语义变化**（见 M2） |
| 3 | `modelDirectories.directoryFor(sessionId)` → `{store, load, select}` | `const directory = models.directoryFor(sessionId)` | `dsh-client-ui-model-selection/lib/client.js:1028-1047`（`directoryFor` 返回共享 `ModelDirectory`）；官方注入写法 `:2073-2083` 与插件逐字一致 | 正常 |
| 4 | store 快照字段 `groups` / `current` / `pending` / `status` / `error` / `failures` | `state.groups`、`state.current`、`state.pending`、`state.status`、`state.error`、`state.failures.map(...)` | `dsh-client-ui-model-selection/lib/client.js:961-980`（`{current, retainedEffort, routable, groups, failures, status, pending, error}`）、`:967-971`（loading 分支同字段） | 正常 |
| 5 | `model.reasoning.efforts[]`（`id`/`name`）与 `reasoning.defaultEffort` | `reasoning.efforts.map(...)`、`reasoning.defaultEffort` | `dsh-client-ui-model-selection/lib/client.js:952-953`（`reasoning?.efforts.find((level) => level.id === effort)`）、`:1201`、`:1223-1227` | 正常 |
| 6 | `sessions.subagentAddress(sessionId) === undefined` 判定可用 | `const available = sessions.subagentAddress(sessionId) === undefined;` | `dsh-client-ui-model-selection/lib/client.js:2074`（与插件逐字相同） | 正常 |
| 7 | `inject = ['slots','locale','modelDirectories','sessions','remote','remote.session']` + `ctx.inject(...)` 嵌套 | 同上 | 六个服务名均存在；`ctx.inject` 用法与官方一致（`dsh-client-ui-model-selection/lib/client.js:2062`） | 正常 |
| 8 | `primitives.rankByName(models, query)` | `primitives.rankByName(group.models, showSearch ? query.trim() : '')` | `dsh-client-ui-model-selection/lib/client.js:1207`（同签名、同用法） | 正常 |
| 9 | `primitives.observeStickyMenuGroups(viewport)` | `primitives.observeStickyMenuGroups(viewport)` | `dsh-client-ui-model-selection/lib/client.js:1282` | 正常 |
| 10 | `primitives.MenuSurface` / `Input` / `MenuGroup` | `h(primitives.MenuSurface, { ref, id, className:'vtmm_menu', style, role, 'aria-label', onBlur, onMouseDown }, …)` | `dsh-client-ui-model-selection/lib/client.js:1522`（MenuSurface）、`:1573`（Input）、`:1632`（MenuGroup） | 正常 |
| 11 | 菜单材质层是「第一个子 div」 | `.vtmm_menu > div:first-child{background:…!important;backdrop-filter:none!important}` | 间接：官方只写 `MenuSurface` 的 `className`（`dsh-client-ui-model-selection/lib/client.js:1522-1526`），不针对内部子层；primitives 未独立发布，无法取得该层定义 | 脆弱（见 M9） |
| 12 | composer 窄容器变量 | `display: var(--dsh-composer-model-text-display, block)`、`var(--dsh-composer-model-icon-display, none)` | `dsh-client-ui-conversation/lib/client.js:21701` 区域写入 `--dsh-composer-model-text-display:none` / `--dsh-composer-model-icon-display:block`；契约文档 `dsh-cordis-client-runner/lib/client.js:3822` | 正常 |
| 13 | 子槽位 `conversation.input.model.label` | `typeof renderSlot === 'function' ? renderSlot('conversation.input.model.label', …) : …` | `dsh-client-ui-renderer/lib/client.js:754`（`renderSlot` 只在 `entry.children !== undefined` 时注入）；官方注册声明了该 children（`dsh-client-ui-model-selection/lib/client.js:2064-2072`），插件未声明 | 语义变化/已知限制（见 M8） |
| 14 | `ctx.locale.register(NS, { zh, en })` 两参数形式 | `ctx.effect(() => ctx.locale.register(NS, { zh, en }), …)` | `dsh-client-locale/lib/client.js:1675`；官方同形式见 `dsh-client-ui-chat/lib/client.js:15332` | 正常 |
| 15 | CSS 变量 | `--dsw-specific-selector`、`--dsw-alias-label-primary-inverted`、`--dsw-elevation-soft`、`--dsw-elevation-prominent`、`--dsw-focus-ring-color`、`--dsw-alias-border-l2` 等 | `dsh-client-ui-theme/lib/client.js:1470,1482` | 正常 |

### 发现

| 编号 | 插件 | 失效时的用户可见现象 | 依赖的锚点原文 | DSH 侧证据（包名 文件:行） | 判定 | 建议加固方向 |
|---|---|---|---|---|---|---|
| M1 | vt-mine-models | 若遮蔽失效，用户会在输入框看到**两个**模型选择控件，或官方原版盖住插件版；插件版面板永远打不开 | `ctx.slots.register({ name:'conversation.input.model', priority:-1, … }, MineModelSelect)` | `dsh-cordis-client-runner/lib/client.js:3818-3826`（single + `shadows-shipped-ui`）、`:5315-5320`（动态条目优先级更低 → 胜出） | 正常 | 无 |
| M2 | vt-mine-models | 今天仍然遮蔽成功（因为被分配的负数优先级一定低于内置的默认值），所以用户看不到差异。风险在于：插件里写的 `priority: -1` 其实**没有被使用**，真实优先级由加载顺序决定（-1、-2、-3…）。一旦将来有别的插件也抢这个座位，谁赢取决于加载顺序，而不是谁写得更低 | `priority: -1` | `dsh-cordis-client-runner/lib/client.js:432-436`（`priority = env.allocatePriority(); options.priority = priority;`）、`:549`、`:771` | 语义变化 | 去掉对 `priority` 数值的依赖，改成「先判断自己是否胜出（读插槽当前 occupant）再决定渲染」；或在文档里明确这条规则 |
| M3 | vt-mine-models | 模型列表永远为空 / 一直转圈；或选择后不生效 | `models.directoryFor(sessionId)` + `directory.store` + `directory.load()` + `directory.select(selection)` | `dsh-client-ui-model-selection/lib/client.js:1028-1047`、`:2073-2083` | 正常 | 无 |
| M4 | vt-mine-models | 强度滑条不出现，或档位名显示成英文 id；「当前模型没有可调强度」误报 | `model.reasoning?.efforts`、`reasoning.defaultEffort` | `dsh-client-ui-model-selection/lib/client.js:952-953,1201,1223-1227` | 正常 | 无 |
| M5 | vt-mine-models | 在 subagent 会话里也显示选择器（官方行为是不显示） | `sessions.subagentAddress(sessionId) === undefined` | `dsh-client-ui-model-selection/lib/client.js:2074` | 正常 | 无 |
| M6 | vt-mine-models | 搜索框不出现 / 搜索无排序 / 分组标题不吸顶 | `primitives.rankByName(...)`、`primitives.observeStickyMenuGroups(viewport)` | `dsh-client-ui-model-selection/lib/client.js:1207,1282` | 正常 | 无 |
| M7 | vt-mine-models | 窄窗口下 chip 不收缩成图标、文字溢出撑坏输入栏 | `display: var(--dsh-composer-model-text-display, block)` | `dsh-client-ui-conversation/lib/client.js:21701`；契约说明 `dsh-cordis-client-runner/lib/client.js:3822` | 正常 | 无 |
| M8 | vt-mine-models | 官方 `conversation.input.model.label` 上的装饰（如 1017 角标）不出现。这是接管父槽位的必然结果，README 已列为已知限制；插件对 `renderSlot` 做了函数存在性守卫，所以不会崩 | `renderSlot('conversation.input.model.label', …)` | `dsh-client-ui-renderer/lib/client.js:754`（仅当注册声明 `children` 才注入 `renderSlot`）；官方 `dsh-client-ui-model-selection/lib/client.js:2064-2072` | 语义变化（已知限制） | 若要恢复官方装饰，需改为「隐藏官方 seat + 自绘 chip」的双 DOM 方案；否则保持现状并把限制写进用户可见说明 |
| M9 | vt-mine-models | 若 primitives 改变 `MenuSurface` 的内部层次，菜单会变回半透明毛玻璃：长模型列表后面的聊天正文透出来，读不清（功能不坏，可读性坏） | `.vtmm_menu > div:first-child{background:var(--dsw-alias-bg-layer-1) !important;backdrop-filter:none !important}` | 间接：官方只设置 `className`（`dsh-client-ui-model-selection/lib/client.js:1522-1526`），不改内部子层；`@deepseek-ai/dsh-client-ui-primitives` 在 0.2.2-rc.1 **无独立包目录**，被合入 `dsh-web-frontend/dist` | 脆弱 | 改用 `MenuSurface` 的公开材质参数（若提供）；否则加一个运行时自检，检测不到材质层时退回不透明自绘容器 |
| M10 | vt-mine-models | 面板文案不跟随语言切换 | `ctx.locale.register(NS, { zh, en })` | `dsh-client-locale/lib/client.js:1675` | 正常 | 无 |

---

## 五、vt-web-chat · 网页对话

### 交互目的

在侧边栏「新会话」正下方加一行「网页对话」，点开后在主内容区整页显示 `chat.deepseek.com`，
沿用官网自己的对话历史，记住上次停留的对话。它解决的是「想在 DSH 里顺手用官网对话，
但官网禁止被 iframe 嵌套」这个硬约束。

### 依赖契约清单

| # | 契约 | 插件里的原文 | DSH 侧现状 | 判定 |
|---|---|---|---|---|
| 1 | 侧栏入口插槽 `sidebar.panellist`，`id` 与 `main` 的 `key` 相同 | `ctx.slots.register({ name:'sidebar.panellist', id: PANEL_ID, order: -10, label: () => t('entry') }, Glyph)` | `dsh-client-ui-sidebar/lib/client.js:749-752`（`kind:"list"`）；内置同写法见 `dsh-client-ui-plugin-manager/lib/client.js:7821-7826`、`dsh-client-ui-schedule/lib/client.js:19388-19393` | 正常 |
| 2 | 主面板插槽 `main` 是 keyed，需要 `key` | `ctx.slots.register({ name:'main', key: PANEL_ID, inject: () => ({ t, locale: ctx.locale }) }, ChatPanelShell)` | `dsh-cordis-client-runner/lib/client.js:4758-4776`（`kind:"keyed"`、`registerOptions: [{name:"key", requirement:"required"}]`）；渲染处 `dsh-client-ui-layout/lib/client.js:125-128`（`renderSlot("main", {}, { entryKey: panelId ?? "conversation" })`） | 正常 |
| 3 | 入口图标组件收到 `{ size }` | `function Glyph({ size = 16 })` | `dsh-client-ui-sidebar/lib/client.js:225-231`（`renderSlot("sidebar.panellist", { size: wide ? 16 : 18, active }, { only: id })`） | 正常 |
| 4 | `label` 可以是函数 | `label: () => t('entry')` | `dsh-client-ui-sidebar/lib/client.js:690-697`（`resolveSlotLabel(options.label) ?? id`）；内置同写法 `dsh-client-ui-plugin-manager/lib/client.js:7824` | 正常 |
| 5 | 桌面壳桥 `globalThis.dshDesktop.browser` | `const bridge = globalThis.dshDesktop?.browser` | 桌面壳 `lib/preload-app.cjs`：`browser = { acquire(workspace), release(lease), onOpenRequested(lease, listener) }` | 正常 |
| 6 | `acquire(partitionKey)` 返回 `{ lease, partition }` | `const reservation = await bridge.acquire(PARTITION_KEY)` | 桌面壳 `lib/main.js`（`DesktopBrowserGuests.acquire(owner, workspace)`：只要求非空字符串身份，按身份分配进程级 partition，返回 `{lease, partition}`） | 正常 |
| 7 | `onOpenRequested(lease, cb)` 返回退订函数 | `unsubscribeOpen = bridge.onOpenRequested(reservation.lease, (url) => …)` | 桌面壳 `lib/preload-app.cjs`（返回 `() => callbacks.delete(listener)`） | 正常 |
| 8 | webview 必须 `name = lease`、`partition = reservation.partition`、`src = about:blank#<lease>` | `element.setAttribute('name', reservation.lease)`、`('partition', reservation.partition)`、`('src', \`about:blank#${reservation.lease}\`)` | 桌面壳 `lib/main.js` 的 `will-attach-webview`：从 `params.src` 取 `about:blank#` 之后的部分做 lease 查表，且要求 `params.partition === lease.partition`，否则 `preventDefault()` | 正常 |
| 9 | `dshDesktop.protocolVersion === 1` 才使用该桥 | 插件**没有**检查这一条 | 内置侧边栏浏览器检查 `carrier?.protocolVersion === 1`（`dsh-client-ui-sidebar-browser/lib/client.js:1771-1772`）；`lib/preload-app.cjs` 当前为 `protocolVersion: 1` | **脆弱**（见 W5） |
| 10 | webview 事件名 | `dom-ready`、`did-navigate`、`did-navigate-in-page`、`render-process-gone`、`destroyed` | 内置侧边栏浏览器用同一组事件（`dsh-client-ui-sidebar-browser/lib/client.js:1181-1220`） | 正常 |
| 11 | `ctx.locale.register(ns, 'zh', dict)` + `bind` | 同 vt-quote-bar | `dsh-client-locale/lib/client.js:1675,1702` | 正常 |
| 12 | CSS 变量 | `--dsw-alias-bg-base`、`--dsw-alias-bg-layer-1`、`--dsw-alias-label-primary/-secondary/-tertiary`、`--dsw-alias-border-l1/-l2`、`--dsw-alias-brand-primary`、`--dsw-radius-sm` | `dsh-client-ui-theme/lib/client.js:1464,1470` | 正常 |
| 13 | 官网自身的存储键 | `__appKit_@deepseek/chat_lastSessionValue`、`closeUnsafeEnvWarn` | **不属于 DSH 契约**，是 chat.deepseek.com 站点实现细节 | 脆弱（见 W7） |

### 发现

| 编号 | 插件 | 失效时的用户可见现象 | 依赖的锚点原文 | DSH 侧证据（包名 文件:行） | 判定 | 建议加固方向 |
|---|---|---|---|---|---|---|
| W1 | vt-web-chat | 侧栏不再出现「网页对话」一行；或点了以后主内容区不切换 | `{ name:'sidebar.panellist', id: PANEL_ID, order: -10, label: () => t('entry') }` | `dsh-client-ui-sidebar/lib/client.js:749-752,690-697`；同写法 `dsh-client-ui-plugin-manager/lib/client.js:7821-7826` | 正常 | 无 |
| W2 | vt-web-chat | 点了入口但主内容区空白（对应 key 的单元格不存在） | `{ name:'main', key: PANEL_ID }` + `selectPanel(id)` 用同一个 id | `dsh-cordis-client-runner/lib/client.js:4758-4776`（key 必填）、`dsh-client-ui-layout/lib/client.js:125-128`（按 `activePanelId` 取 key） | 正常 | 无 |
| W3 | vt-web-chat | 侧栏那一行没有图标（空白按钮） | `Glyph({ size = 16 })` | `dsh-client-ui-sidebar/lib/client.js:225-231`（传入 `size`） | 正常 | 无 |
| W4 | vt-web-chat | 面板一直停在加载态，15 秒后变「网页对话没有启动」 | `bridge.acquire(...)` → `{lease, partition}` → `webview` 四个属性 | 桌面壳 `lib/preload-app.cjs`（bridge 定义）、`lib/main.js`（`will-attach-webview` 校验 src 与 partition） | 正常 | 无 |
| W5 | vt-web-chat | 桌面壳协议升版（例如 `protocolVersion: 2` 且 `browser.acquire` 签名变化）后，内置浏览器会自己降级为不可用，而本插件仍会调用旧签名：表现为「网页对话」点开即失败、一直重试卡，控制台有 IPC 报错 | `const bridge = globalThis.dshDesktop?.browser;` | 内置对照：`dsh-client-ui-sidebar-browser/lib/client.js:1771-1772`（`carrier?.protocolVersion === 1 ? carrier.browser : void 0`）；当前 `lib/preload-app.cjs` 为 `protocolVersion: 1` | 脆弱 | 加上 `protocolVersion === 1` 的判断，不匹配时直接显示「需要更新 DSH」的说明卡 |
| W6 | vt-web-chat | 面板文案不跟随界面语言切换 | `ctx.locale.register(NS, 'zh', DICT.zh)` | `dsh-client-locale/lib/client.js:1675,1702` | 正常 | 无 |
| W7 | vt-web-chat | 官网改了自己的存储键或结构后：「进入面板自动收起官网侧栏」与「关掉使用环境异常提示」两项静默失效（页面照常可用，只是每次都要手点） | `__appKit_@deepseek/chat_lastSessionValue`、`closeUnsafeEnvWarn` | 非 DSH 侧：属 chat.deepseek.com 站点实现；DSH 侧无对应契约可查 | 脆弱 | 把这两项当作增强而非承诺：写失败时静默跳过（现已如此），并在说明里不承诺「永远自动收起」 |

---

## 六、小结

### 结论先说

**本轮 4 个插件、共 55 条依赖契约、36 条发现，没有一条「已失效」。**
这 4 个插件只用到 6 个插槽（`sidebar.panellist`、`sidebar.panellist.actions`、
`sidebar.footer.action`、`conversation.input.model`、`conversation.input.model.label`、`main`）、
3 个 CSS Module 类名后缀（`_panelList` / `_panelRow` / `_panelGlyph`）、
`data-slot` 锚点、以及全部用到的宿主服务与设计 token——它们在 0.2.2-rc.1 里都还在，语义也基本没变。
所以「插件在新版里失效」这一怀疑，就这 4 个插件而言**不成立**：它们今天的功能是好的。

但「没失效」不等于「稳」。下面 5 条才是真正值得排期的，按严重度从高到低：

### 最该优先处理

**1. W5 —— vt-web-chat 不校验桌面壳协议版本（脆弱，影响最重）**

内置的侧边栏浏览器在拿桥之前会先看 `protocolVersion === 1`，不匹配就不用；
本插件直接取 `dshDesktop.browser`。今天两者都是 1，所以没问题。
但这是**唯一一条会随一次桌面壳升级而整块失效、且失效时用户只看到「打不开、重试」**的项，
而且失败原因（IPC 签名变了）对用户完全不可见。
加固只需一行判断 + 一张说明卡。

**2. S2 + S3 —— vt-sidebar-sort 在 React 拥有的 DOM 上手工重排，并用 React 内部键认行（脆弱，影响面最广）**

侧边栏排序是这四个插件里「最贴近宿主内部」的一个：
它一边直接改 `nav` 的子节点顺序，一边靠 `__reactFiber$…` 往上读 `memoizedProps` 认身份。
两条路径今天都通（`PanelRow` 的 props 形状确实还是 `{id,label,…,renderSlot}`），
但都不属于 DSH 承诺的契约。
失败方式很讨厌：**不报错**——只是某次切换语言或插件启停后，用户发现排好的顺序回到了默认。

**3. S1 —— 侧边栏排序与官方新出现的 pin/unpin 机制并行（语义变化）**

0.2.2-rc.1 的 `sidebar.panellist` 已经有自己的「取消固定」概念：
`unpinned` 列表会让行直接从 `nav` 消失，而且这个能力已经通过 `onPinnedChange` 下发给
`sidebar.panellist.actions` 的组件。
目前没有任何官方界面去调用它，所以用户看不到冲突；
但插件「拖进更多 = 自己记一个 hidden 列表 + CSS 隐藏」的做法，
等于在官方机制旁边又建了一套平行状态。等 DSH 真的给出入口时，两套状态会互相打架。

**4. Q8 —— vt-quote-bar 把客户端版本号写死成 `0.2.1`（语义变化）**

官方现在从构建期注入的 `DSH_CLIENT_VERSION` 取这个值，且为空就直接抛错，
说明这个字段是「真实身份」而不是装饰。
插件写死旧版本不会立刻坏，但会让服务端看到一个不存在的客户端版本；
一旦平台按版本做能力判定，问题会以「某个字段莫名不返回」的形式出现，极难排查。

**5. M9 + M2 —— vt-mine-models 的两处隐性依赖（脆弱 / 语义变化）**

- `M2`：插件写的 `priority: -1` 其实被运行时覆盖了（`allocatePriority` 依次给 -1、-2…）。
  今天仍然遮蔽成功，是因为动态注册的负数优先级一定低于内置的默认值；
  但如果将来有第二个插件抢同一个座位，谁赢取决于**加载顺序**，而不是谁写得更低。
- `M9`：菜单「不透明材质」是靠 `.vtmm_menu > div:first-child` 覆写 primitives 的内部子层实现的。
  官方自己只设 `className`、不碰内部层次，所以这条路径没有任何契约保护；
  失效后果是「列表后面透出聊天正文、读不清」——不报错，只是变难用。

### 其余项

- **正常**：Q1–Q7、Q9–Q11、M1、M3–M8、M10、W1–W4、W6、S4–S8。
  这些锚点/服务在 0.2.2-rc.1 里都按原语义存在，可原样复查（见各表证据列）。
- **语义变化但无害**：S8（官方 `entry-customization` 常驻注册 actions，
  使「更多」按钮实际总是存在，比插件注释假设的更宽松；建议更新注释而非改代码）。
- **环境依赖，不与代码契约混谈**：W7（chat.deepseek.com 自己的 localStorage 键）、
  以及 `vt-quote-bar` 依赖的 `api.deepseek.com` / `opencode.ai` 上游接口。

### 一个方法论提醒

本轮所有「正常」都建立在**源码级 grep**上，这是必要的，但不充分：
S2/S3/M2/M9 这几条的共同特征是「代码里查得到，但语义由运行时或第三方内部决定」。
对它们，建议在结论落地前补一次运行时验证——启用插件后观察
「切换语言 → 顺序是否保持」「打开模型面板 → 菜单是否不透明」
这两个具体动作，比任何静态证据都更有说服力。
