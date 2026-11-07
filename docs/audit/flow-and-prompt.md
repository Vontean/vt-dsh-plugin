# 消息流与提示词插件 · 交互契约核查

核查对象：`vt-steer-now`、`vt-system-prompt`、`mcx-prompt-preset`

---

## 一、核查口径

### 核查对象版本

| 项 | 值 | 说明 |
|---|---|---|
| 插件运行时状态 | 三个插件均为 `enabled/active` | 所以本报告讨论的是**行为是否悄悄退化**，不是「装不上」 |
| 插件版本 | `dsh-vt-steer-now` 1.0.2 · `dsh-vt-system-prompt` 1.0.2 · `dsh-mcx-prompt-preset` 0.1.0 | 取自各自 `package.json` |
| 开发时对标的 DSH | 0.2.1-rc.5 | 三个插件 `engines.dsh` 都写 `>=0.2.1-rc.5 <0.3.0` |
| 当前 DSH | **0.2.2-rc.1** | `/Applications/DeepSeek Harness.app/Contents/Info.plist` 与 `/tmp/dsh-full/dsh-*/package.json` 的互相依赖都写 `0.2.2-rc.1` |
| 宿主运行时 | Node **24.21.0** | `/Applications/DeepSeek Harness.app/Contents/Resources/runtime/versions.json` |
| 对照用的旧版 | 0.1.5-rc.2 | 本机另有一份全局安装（`~/.nvm/versions/node/v22.22.0/lib/node_modules/@deepseek-ai/dsh`），只在判断「某处结构是这次升级改的还是本来如此」时作旁证 |

`engines.dsh` 用 semver 且允许预发布，`0.2.2-rc.1` 落在 `>=0.2.1-rc.5 <0.3.0` 区间内，因此三个插件都能被加载——这与「运行时都是 active」一致，**装载成功不代表行为正确**。

### 方法

1. 读每个插件的 `README.md` / `DESIGN.md`，确认它替用户解决什么问题、交互目的还成不成立。
2. 读 `index.js`（宿主半侧）与 `client.js`（浏览器半侧），把「插件假设 DSH 一定成立的东西」逐条列出来：`ctx` 服务、HTTP 路由、Agent 队列/中断/重投递 API、`systemPrompt` 相关路径、settings、文件路径约定、locale key、客户端插槽与 `data-*` 锚点。
3. 逐条到 `/tmp/dsh-full`（从 `app.asar` 抽出的 330 个 `@deepseek-ai` 包）里 `grep` 取证，给出 `包名 文件:行`。
4. 对三个重点疑点做专项核对（见每节的「重点疑点」）。
5. 只读环境事实：用宿主自带的 Node 实测 `node:sqlite`；只读打开本机 MineCodex 库核对表结构。
6. **只记录，不改任何插件源码。**

取证边界要交代一处：`@deepseek-ai/dsh-client-ui-slots` 在 asar 里**没有独立包目录**。它由 `dsh-web-frontend` 的功能产物在运行时提供——`dsh-web-frontend/dist/assets/index-BgUyXZcc.js` 的模块表把 `@deepseek-ai/dsh-client-ui-slots` 映射到运行时模块（同一张表里还有 `dsh-client-store`、`dsh-client-ui-primitives`、`dsh-client-ui-dockkit`）。凡是落在插槽内核上的结论，证据栏会写 `dsh-client-ui-renderer/lib/client.js`（插槽渲染实现）与 `dsh-cordis-client-runner/lib/client.js`（插槽 API 声明）。

### 判定分级

| 判定 | 含义 | 对用户意味着什么 |
|---|---|---|
| **正常** | 锚点/契约在当前版本存在，语义未变 | 今天的行为和当初设计一致 |
| **语义变化** | 锚点还在，但含义、取值或数据形状变了 | 不会突然坏，但可能已经悄悄做了另一件事，或与新的官方机制并行 |
| **已失效** | 锚点/契约在当前版本不存在或无效果 | 相关功能确定不工作（通常静默降级，不报错） |
| **脆弱** | 今天可用，但依赖未承诺的内部细节 | 下一次小版本就可能断，而且断了通常不报错 |

> 全文行号均指 `/tmp/dsh-full` 中对应包 `lib/client.js`（或 `lib/index.js`）的行号，可用 `grep -n` 原样复查。

---

## 二、vt-steer-now · 插话立即生效

### 交互目的

「插入消息」要等当前 step 结束才被模型读到，用户就得盯着慢工具干等；这个插件在那条待生效气泡下面放一个「立即发送」，一点就中断当前步骤，让消息立刻被读到。

### 依赖契约清单

| # | 契约 | 插件里的原文 | DSH 侧现状 | 判定 |
|---|---|---|---|---|
| 1 | 宿主服务 `webServer` 是硬依赖 | `export const inject = ['webServer']` | 服务仍存在 | 正常 |
| 2 | 路由注册 `ctx.webServer.register({ kind:'prefix', path, handler })` | `path: '/vt-steer-now/api'` | `dsh-host-webserver/lib/index.js:370-386`（`kind === "exact"` 进 exact 表，其余进 prefix 表；重复注册抛错） | 正常 |
| 3 | 鉴权 `connection.requestRejection(req)` 返回 `undefined` 即放行 | `connection.requestRejection(request) === undefined` | `dsh-client-connection/lib/index.js:737-740`（`admit()` 返回 403/401 或 peer） | 正常 |
| 4 | `ctx.get('agents')` + `agents.get(sessionId)` | `const agent = agents.get(sessionId)` | 服务名 `"agents"`：`dsh-agent/lib/index.js:450`；`get(id)`：`:725` | 正常 |
| 5 | `agent.inbox.nextStep` / `nextTurn` 是**对象数组**（元素含 `id`） | `inbox.nextStep.find((message) => message.id === itemId)` | `dsh-agent-loop/lib/index.js:80-87`（getter 返回 `readState()["next-step"]`）；投影键为 kebab：`:22-23` | 正常 |
| 6 | `agent.inbox.remove(itemId)` 返回布尔 | `if (!agent.inbox.remove(itemId)) return { ok:false, reason:'claimed' }` | `dsh-agent-loop/lib/index.js:145-151`（`locate()` 找不到返回 `undefined` → `false`） | 正常 |
| 7 | `agent.status === 'running'` | `const running = agent.status === 'running'` | `dsh-agent-loop/lib/index.js:554-556`（`idle`/`maintenance` 之外都算 running） | 正常 |
| 8 | `agent.cancel({kind:'user'}, { keepInbox:true })` 只中止不清队 | 同上 | `dsh-agent-loop/lib/index.js:579-585`：`if (!options.keepInbox) this.inbox.clear()`，随后 `phase.abort.abort(cause)` | 正常 |
| 9 | abort 之后 `followup()` 会改投 `next-turn` 并锁存一次唤醒 | 注释：「running 时 abort 已置位，send() 走 wakingAfterAbort 分支」 | `dsh-agent-loop/lib/index.js:564-571`（`wakingAfterAbort`→`resolvedTarget='next-turn'`→`wakeDriver(true)`）、`:618-622`（running 阶段只锁存 `wakeRequested`） | 正常 |
| 10 | 回合收尾后有 pending 就再开一个回合，新回合第 1 步 claim `next-turn` | 注释：「回合收尾后立即开新回合、在第 1 步读它」 | `dsh-agent-loop/lib/index.js:827-831`（`if (!this.inbox.hasPending) return false;` 之后重置 abort、`step=0`、返回 `true`）、`:670`（`preStep` 调 `inbox.claim(target, turn)`） | 正常 |
| 11 | 客户端锚点 `[data-pending-steering]` | `const BUBBLE_SELECTOR = '[data-pending-steering]'` | `dsh-client-ui-chat/lib/client.js:6180`（`"data-pending-steering": pending \|\| void 0`） | 锚点存在，但**行结构变了**，见 ST1 |
| 12 | 该行的 `children[0]` 是气泡本体、最后一个子节点是操作行 | `const bubble = children[0]`；`const actions = children[children.length - 1]` | `dsh-client-ui-chat/lib/client.js:6179-6196`：待生效行把 `renderSlotChain` 换成桩 `NO_MESSAGE_SOURCE`（`:6207`、`:6231`），所以实际 DOM 子节点是「`user.content` 工厂插槽出口 → 动作行」；而插槽出口恒定是一个 `display:contents` 的 div（`dsh-client-ui-renderer/lib/client.js:1116-1124`） | **已失效**（见 ST1） |
| 13 | 桥接槽位 `conversation.input.dock`（`list` / `session`） | `scope.slots.inject('conversation.input.dock', …)` | `dsh-client-ui-conversation/lib/client.js:22816-22819`（声明）、`:20579`（`zone !== undefined && renderSlot(...)`）、`:20516`（有 session 且有 inputState 才有 zone） | 正常 |
| 14 | 槽位提供 `useProjection('inbox')`，投影键 `next-step` / `next-turn` | `const inbox = useProjection('inbox')`；`inbox?.['next-step']` | 投影定义 `key: "inbox"`、`wire.view`（`dsh-agent-loop/lib/index.js:22-64`），注册在 `:1343`；`useProjection` 是 session 作用域标准 prop（`dsh-cordis-client-runner/lib/client.js:2709` 等） | 正常 |
| 15 | 槽位提供 `useSession(s => s.running)` | `const running = useSession((snapshot) => snapshot.running)` | `SessionSnapshot.running: boolean`（`dsh-cordis-client-runner/lib/client.js:2382` 类型声明）；快照构造见 `dsh-client-ui-conversation/lib/client.js:16166` | 正常 |
| 16 | 用户插入消息可由 `message.source.kind === 'user'` 识别 | `.filter((message) => message?.source?.kind === 'user')` | 与 DSH 自己的归类判据完全一致：`dsh-api-session-controller/lib/index.js:2403` | 正常 |
| 17 | 条目级 `inject: (sessionId) => ({ sessionId })` | 同左 | `dsh-client-ui-renderer/lib/client.js:435-442`（`runInject` 的实参是 `[binding.key, actions]`） | 正常 |
| 18 | locale：`register(NS, { zh, en })` / `bind(NS)` / `subscribe(fn)` | 三个都用到了 | `dsh-client-locale/lib/client.js:1675-1697`（`register` 同时接受 `(ns, locale, dict)` 与 `(ns, { loc: dict })`）、`:1702`（`bind`）、`:1548`（`subscribe`） | 正常 |
| 19 | 主题 token | `--dsw-specific-bubble`、`--dsw-alias-label-tertiary/-secondary`、`--dsh-content-font-size-secondary` | 全部在主题包定义：`dsh-client-ui-theme/lib/client.js:1470` | 正常 |

### 重点疑点：「排队 → 中断 → 重投递」这条链路还成不成立

**结论：链条本身成立，但按钮已经不出现——所以用户侧完全失效。**

拆开看：

1. **队列条目形态没变**。`inbox` 仍只有 `next-turn` / `next-step` 两个数组，元素是完整消息对象并带 `id`；`remove(id)` 仍按 id 跨两个列表定位并删除（`dsh-agent-loop/lib/index.js:145-151`、`:162-171`）。
2. **中断语义没变**。`cancel(cause, { keepInbox: true })` 只 abort、不 `clear()`（`:579-585`）；`cause = { kind: 'user' }` 仍是合法枚举（`:495-504` 的 `abortedCancelCause` 接受 `user`/`parent`/`disposed`/`hook`）。
3. **重投递不会去重、也不会被计成重放**。
   - inbox 的「同一条消息不能重复 pending」校验只在单次插入时对两个列表做并集检查（`:184-190`）；插件先 `remove` 再 `followup`，插入时该 id 已不在任何列表里，因此不会命中。
   - 这条消息此前**从未落进会话记录**（`agent.steer` 只往 inbox 写 `agent/inbox/spliced` 事件，不写 `user/message`），所以新回合 `preStep` claim 之后只会落一条 `user/message`，不存在重复。
   - `prompt()` 里的 `hasPromptRequest(request.requestId)` 去重只作用于官方 RPC 入口（`dsh-api-session-controller/lib/index.js:833`）；插件走进程内 API，不经过它。
   - 附件不会被提前清掉：文件上传的 staged 回执是在 `user/message` 落库事件上才 retire（`dsh-client-file-upload/lib/index.js:356-359`），重投递反而让「落库」这件事延后，不会误删。
4. **唤醒与重开回合没变**。`send()` 的 `wakingAfterAbort` 分支（`:565`）把消息改投 `next-turn`，`wakeDriver(true)` 在 running 阶段锁存 `wakeRequested`（`:618-622`）；回合以 `aborted` 收尾后，`:827` 判断 `inbox.hasPending` 为真，重置 abort 与 step 并返回 `true`，`kick()` 的外层 `while (await this.turn())` 立刻开新回合，第 1 步就把这条消息 claim 进请求。

**真正断掉的是最前端的定位假设**：插件按「`[data-pending-steering]` 行的第 0 个子元素 = 气泡本体」取矩形。0.2.2 里这一行不再是「气泡 + 动作行」两段，而是「插槽出口 + 动作行」：待生效行把 `user.before` 链换成了桩函数 `NO_MESSAGE_SOURCE`（返回 `null`，不渲染 DOM），于是第 0 个**真实 DOM 子节点**是 `conversation.chat.user.content` 这个工厂插槽的出口——一个 `display:contents` 的 div，本身没有任何布局盒。它的 `getBoundingClientRect()` 恒为 `0×0`，于是 `visible = bubbleRect.height > 0` 恒为 false，`reconcile()` 每次都把按钮设成 `display:none`——按钮永不出现。插件自己也没有任何提示，这与 `DESIGN.md`「升级后若改名，按钮不再出现（功能静默失效，不会报错）」预判的失败模式一致，只是触发点从属性名变成了行结构。

### 发现

| 编号 | 插件 | 失效时的用户可见现象 | 依赖的锚点原文 | DSH 侧证据（包名 文件:行） | 判定 | 建议加固方向 |
|---|---|---|---|---|---|---|
| ST1 | vt-steer-now | **「立即发送」永远不出现**。气泡上没有多出任何按钮，点了也没反应，全程不报错；用户会以为插件没装或坏了 | `const bubble = children.length > 0 ? children[0] : row;` 然后 `const bubbleRect = bubble.getBoundingClientRect(); const visible = bubbleRect.height > 0 && …` | `dsh-client-ui-chat/lib/client.js:6157`（`UserStyleBubble` 签名）、`:6179-6196`（children 依次为 `renderSlotChain("conversation.chat.user.before")`、`renderFactorySlot("conversation.chat.user.content")`、`actions?.(prepared.text)`）、`:6204-6218`（`PendingSteeringBubble` 把 `renderSlotChain` 换成 `NO_MESSAGE_SOURCE`，故首个子节点是 `user.content` 出口）、`:6184`；插槽出口恒定渲染并带 `display:contents`：`dsh-client-ui-renderer/lib/client.js:1116-1124`（`ANCHOR_STYLE = { display:"contents" }` + `SlotOutlet` 无条件返回该 div）；对照本机 0.1.5-rc.2 的同名组件，首个子节点是包住气泡的 `userStack`，所以旧写法当时能拿到气泡矩形 | **已失效** | 改成按插槽出口取气泡：`row.querySelector('[data-slot="conversation.chat.user.content"]')`，再退回「第一个高度 > 0 的后代」；动作行仍取最后一个子元素；同时给「有待生效消息但定位不到」加一次性可见提示，避免再次静默 |
| ST2 | vt-steer-now | 同屏同时存在「本地 echo 气泡」和「服务端权威气泡」时，按钮可能挂到 echo 那一行：点下去返回 `claimed` 后按钮自己消失（看起来像「点了没反应」），或两条消息只出现一个按钮 | `const wanted = Math.min(bubbles.length, state.steering.length)`；按钮按 DOM 序号与 `state.steering` 序号一一对应 | `dsh-client-ui-chat/lib/client.js:6250-6251`：`PendingSubmissionBubble` 传 `pending: submission.placement === "steering"` 且 `echo: true`，所以**本地 echo 也带 `data-pending-steering`**；`:6180` 同一属性 | 脆弱 | 按钮改为按「队列条目 id ↔ 气泡」显式关联（例如用 `source.rpcId` 或 `requestId` 匹配），不要靠序号；选择器排除 `[data-submission-echo]` |
| ST3 | vt-steer-now | 长回合里气泡因上方内容增长而移动时，按钮可能短暂停在旧位置（最多约 120 ms，或直到下一次滚动/缩放） | `observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['data-pending-steering'] })` | 观察器选项不含 `characterData`；纯文本增量（流式输出的常见形态）不会触发回调。滚动/缩放靠 `window.addEventListener('scroll', schedule, true)` 兜底（`:246-247`）。插槽出口与气泡结构见 ST1 证据 | 脆弱 | 打开 `characterData: true`，或改用 `ResizeObserver` 观察气泡容器；定位失败时宁可不显示，也不要显示在错误位置 |
| ST4 | vt-steer-now | 今天无差异。将来 DSH 把「插队」做成通栏入口时，同一个需求会同时有官方入口与插件按钮，两套状态各算各的 | 插件自建 `POST /vt-steer-now/api/preempt`，在宿主侧直接调 `agent.inbox.remove` / `agent.cancel` / `agent.followup` | 0.2.2 已内置官方队列动作：`dsh-api-session-controller/lib/index.js:903-950`（`updateQueue` 的 `{kind:"steer"}`：把 `next-turn` 项移出再 `agent.steer`）、`:960-966`（`cancel` 固定 `{ keepInbox:true }`）；客户端已有批量入口 `dsh-client-ui-conversation/lib/client.js:16294-16305`（`steerQueue`）与队列坞 `:19625`（`QueueDock`） | 语义变化 | 官方 `steer` 只处理 `next-turn`（`next-step` 项会被 `session/steer-unavailable` 拒绝，见 `:932`），所以插件仍有独占场景；但「中断」应改为调用官方 `cancel`，少维护一条自建链路 |
| ST5 | vt-steer-now | 若 DSH 调整 `keepInbox` 语义，用户点「立即发送」会连带清空其他排队消息（用户会看到自己排的几条消息一起消失） | `agent.cancel({ kind: 'user' }, { keepInbox: true })` | `dsh-agent-loop/lib/index.js:579-585`：只有 `!options.keepInbox` 才 `inbox.clear()`；`:584` 只有 running 阶段才 abort | 正常 | 保持现状；可在路由返回里带上「本次中断是否发生」，便于前端给出准确文案 |
| ST6 | vt-steer-now | 若重投递丢附件，用户会看到消息里的图片变成裂图或纯文本 | `agent.followup(found.message)`（复用同一条消息对象与 id） | 消息对象含已 admitted 的附件内容；staged 回执的清理只发生在 `user/message` 落库事件（`dsh-client-file-upload/lib/index.js:356-359`），重投递不会提前触发 | 正常 | 保持现状；可在重投递前断言 `message.content` 非空 |
| ST7 | vt-steer-now | 若桥接槽位不再下发 `useProjection`/`useSession`，按钮的显示条件永远不满足（与 ST1 表现相同，但根因不同） | `function SteerNowBridge({ sessionId, useSession, useProjection })` | `conversation.input.dock` 声明为 `{ kind:"list", scope:"session" }`（`dsh-client-ui-conversation/lib/client.js:22816-22819`）；`useProjection` / `useSession` 是 session 作用域标准 prop（`dsh-cordis-client-runner/lib/client.js:2707-2709`、`:2382`） | 正常 | 保持现状 |

> **文档漂移（不计入发现表）**：`README.md`「支持的 DSH 版本」写着插件依赖「工具行的 `data-tool` / `data-state` 标记」，但 `client.js` 里已经不再使用这两个属性；同一段还漏掉了真正致命的「气泡行结构」依赖。建议随 ST1 的修复一起更新 README 与 `DESIGN.md` 第 6 节。

---

## 三、vt-system-prompt · 全局提示词编辑器

### 交互目的

不离开 DSH 就能查看和修改「每次会话都会带上的全局规则」（`AGENTS.md`），并且文件在别处被改过时不会静默覆盖。

### 依赖契约清单

| # | 契约 | 插件里的原文 | DSH 侧现状 | 判定 |
|---|---|---|---|---|
| 1 | 全局指令根 `$DSH_HOME/AGENTS.md`，默认 `~/.dsh/AGENTS.md` | `{ id:'harness', env:'DSH_HOME', dir:'.dsh', file:'AGENTS.md' }` | `dsh-home-paths/lib/index.js:11`（`.dsh`）、`:15`（`DSH_HOME`）、`:109`（`resolveDshHome`）；`dsh-agent-instructions/lib/index.js:161`+`:168`、`:721-745` | 正常 |
| 2 | 共享指令根 `$DSH_AGENTS_HOME/AGENTS.md`，默认 `~/.agents/AGENTS.md` | `{ id:'shared', env:'DSH_AGENTS_HOME', dir:'.agents', file:'AGENTS.md' }` | `dsh-home-paths/lib/index.js:17`（`.agents`）、`:21`（`DSH_AGENTS_HOME`）、`:124`（`resolveAgentsHome`） | 正常 |
| 3 | 加载顺序「先 `.dsh`，再 `.agents`」 | `TARGETS` 数组顺序 + 注释「与 dsh-agent-instructions 的加载顺序一致」 | `dsh-agent-instructions/lib/index.js:161`（`USER_GLOBAL_DIRECTORIES = [user-global, agents-global]`）、`:555-566`（`userGlobalRoots` 返回同一顺序）、`:730-746`（按该顺序逐个探测 `AGENTS.md`） | 正常 |
| 4 | 共享根「仅当文件已存在时才出现」 | `if (state.id === 'shared' && !state.exists) continue;` | `:741-742`：探测为 `absent`/`unavailable` 时 `continue`，即不参与加载 | 正常 |
| 5 | 单文件 1 MiB 上限 | `MAX_FILE_BYTES = 1024 * 1024` | `dsh-agent-instructions/lib/index.js:19`（`DEFAULT_MAX_SOURCE_BYTES = 1048576`）、`:774-790`（超过上限直接跳过读取，不报错） | 正常（边界相等） |
| 6 | 路径优先级只由「配置 > 环境变量 > 默认」决定，用户配置改不了这两个根 | 只读 `process.env[...]` 与 `homedir()` | `dsh-home-paths/lib/index.js:100-127`；`dsh-agent-instructions/lib/index.js:49-65`（`resolveConfig` 不转发 `dshHome`/`agentsHome`，注释写明「Undeclared row fields cannot override the process home」） | 正常 |
| 7 | 保存后在**不重启、不开新会话**的前提下生效 | `README.md`「编辑后『保存』立即写回，不重启、不开新会话」 | 写文件是即时的；对模型生效发生在下一次 `agent/pre-step` 的 `compose(...)` 重读（`dsh-agent-instructions/lib/index.js:1480-1497`），指令以 `next-step` 消息注入 | 语义变化（见 SP2） |
| 8 | 设置页插槽 `settings.section`（`list` / `root`），支持 `{ id, order, label: () => … , inject }` | `ctx.slots.register({ name:'settings.section', id:'system-prompt', order:18, label: () => t('nav'), inject: () => ({ t, locale: ctx.locale }) }, …)` | 声明：`dsh-client-ui-settings-general/lib/client.js:1547-1550`；同形内置条目：`:1587-1595`（`{ name, id:'general', order:0, label: () => t("general.nav"), locale, children }`）；列表消费：`:1434-1444` | 正常 |
| 9 | 页面文案与语言切换 | `ctx.locale.register(NS,'zh',DICT.zh)` + `locale.subscribe` + `locale.getSnapshot().revision` | `dsh-client-locale/lib/client.js:1675`（register 三参形式）、`:1548`（subscribe）、`:1538`（getSnapshot） | 正常 |
| 10 | 路由与鉴权 | `ctx.webServer.register({ kind:'prefix', path:'/vt-system-prompt/api' })` + `connection.requestRejection` | `dsh-host-webserver/lib/index.js:370-386`；`dsh-client-connection/lib/index.js:737-740` | 正常 |
| 11 | 浏览器侧基址 `document.baseURI`（回退 `__DSH_TRANSPORT__.streamBaseUrl`） | `new URL(`${API_PREFIX}${route}`, base)`，`API_PREFIX` 以 `/` 开头 | Web 界面由宿主同源提供（本机 `http://127.0.0.1:53724`），绝对路径会解析到源根 | 正常 |
| 12 | `dsh.client.inject` 声明 `dsh-client-locale` / `dsh-client-ui-slots` / `dsh-client-ui-settings` | `package.json` 的 `dsh.client.inject` | `inject` 是**模块图依赖**：目标在图里就排到前面，不在图里就静默跳过（`dsh-client-modules/lib/client.js:66-74` 解析、`:791-794` `const dependency = this.graphRows.get(packageName); if (dependency !== undefined) …`） | 正常（无害的历史声明，见 SP4） |

### 重点疑点：全局指令的来源与优先级

**结论：路径、顺序、环境变量、大小上限都还对得上；真正需要说清的是「两份文件是叠加关系」与「生效时机」。**

- DSH 读取的确实是这两个文件，且 `.dsh` 在前、`.agents` 在后（`dsh-agent-instructions/lib/index.js:161`、`:730-746`）。`$DSH_HOME` / `$DSH_AGENTS_HOME` 的变量名与默认目录名逐字一致（`dsh-home-paths/lib/index.js:11-21`）。
- 优先级不是「后者覆盖前者」，而是**两份都进、只是完全相同的正文会被去重**（`:549-553` 注释：「Both contribute the fixed USER_GLOBAL_FILE candidate and form one candidate group, so a file that matches the harness-home content renders once」）。插件 UI 用页签把两个根并排展示，容易被理解成「二选一」。
- 插件声明的 `inject` 里出现 `@deepseek-ai/dsh-client-ui-slots` 并**不是**故障源：该名字在 asar 里没有独立包目录，但它是运行时模块；即使完全解析不到，`dsh-client-modules` 也会跳过，不会让插件装载失败。
- `dsh-system-prompt` 不读取任何指令文件（在它的 `lib/index.js` 里搜不到 `AGENTS`/`instructions`），它只负责把已组装好的 section 渲染成请求。也就是说「指令从哪来」这个问题只有 `dsh-agent-instructions` 一个答案。

### 发现

| 编号 | 插件 | 失效时的用户可见现象 | 依赖的锚点原文 | DSH 侧证据（包名 文件:行） | 判定 | 建议加固方向 |
|---|---|---|---|---|---|---|
| SP1 | vt-system-prompt | 用户把规则写进 `~/.agents/AGENTS.md`、以为它「覆盖」了 `~/.dsh/AGENTS.md`，实际两份同时生效：旧规则和新规则一起进了提示词，模型行为与预期不符，而且排查时看不到「两份都在用」 | 页面用文件页签在两个根之间切换：`files.map((file) => 页签)`；`README`「可在两个用户全局指令根之间切换」 | `dsh-agent-instructions/lib/index.js:549-553`（两个根同属一个 candidate group，内容相同才去重）、`:721-745`（两个根都会 `addFile`）、`:1345-1356`（按 group 做 trimmed-content 去重后全部纳入） | 语义变化 | 页签旁加一句「两个文件同时生效，不是二选一」；或在两个文件都存在时给一条状态提示，列出实际注入的指令文件 |
| SP2 | vt-system-prompt | 保存后立刻发新消息，模型可能还没按新规则回答（要等当前回合走到下一个 step 边界）；用户会怀疑「保存没生效」 | `README.md`「编辑后『保存』立即写回，不重启、不开新会话」 | 写盘即时，但注入发生在下一次 `agent/pre-step`：`dsh-agent-instructions/lib/index.js:1480-1497`；流式输出中的回合要等 step 结束才会有边界 | 语义变化 | 文案从「立即生效」改成「下一次请求起生效」；保存成功时给一句明确的生效时机说明 |
| SP3 | vt-system-prompt | 若用户在 profile 里把 `maxSourceBytes` 调小（例如 256 KiB），插件仍允许保存到 1 MiB；DSH 侧读文件时超限直接跳过（不报错），用户看到「已保存」但规则从未生效 | `MAX_FILE_BYTES = 1024 * 1024`，客户端只按这个值校验 | `dsh-agent-instructions/lib/index.js:19`（默认 1 MiB）、`:774-790`（`readBounded` 超限返回 `undefined`，静默跳过）、`:27-28`（`maxSourceBytes` 可配置） | 脆弱 | 保存前把 DSH 实际生效的上限读出来（或至少把「超过上限会被静默忽略」写进页面提示），不要只按插件自己的常量校验 |
| SP4 | vt-system-prompt | 无现象。声明里的 `dsh-client-ui-slots` 在 asar 里找不到独立包目录，容易被误判为「依赖缺失导致插件坏掉」 | `"inject": ["@deepseek-ai/dsh-client-locale","@deepseek-ai/dsh-client-ui-slots","@deepseek-ai/dsh-client-ui-settings"]` | `inject` 只参与模块图到达顺序，查不到就跳过：`dsh-client-modules/lib/client.js:66-74`、`:791-794`；`dsh-client-ui-slots` 由前端产物运行时提供（`dsh-web-frontend/dist/assets/index-BgUyXZcc.js` 模块表） | 正常 | 可保留；建议在 README 里加一句「`dsh-client-ui-slots` 是运行时模块，没有独立包目录」以免下次误判 |
| SP5 | vt-system-prompt | 若 `settings.section` 的注册选项收窄（例如不再接受 `label` 函数），设置页左侧会出现一个没有文字的条目，点进去页面仍在 | `{ name:'settings.section', id:'system-prompt', order:18, label: () => t('nav'), inject: () => ({ t, locale }) }` | 插槽声明 `{ kind:"list", scope:"root" }`（`dsh-client-ui-settings-general/lib/client.js:1547-1550`）；列表按 `resolveSlotLabel(entry.options.label)` 取标签，内置条目用同样的函数式 label（`:1595`、`:1438`） | 正常 | 保持现状；给 `label` 同时提供一个静态字符串兜底会更稳 |
| SP6 | vt-system-prompt | 若 DSH 日后自带「全局指令」设置页，用户会在设置里看到两个功能相同的入口，改哪个都不清楚 | 插件注册 `id:'system-prompt'`、`order:18` | 当前 0.2.2 的设置包里没有任何指令编辑页（`dsh-client-ui-settings-*` 中 grep 不到 `AGENTS.md`，也没有 `dsh-client-ui-settings-instructions` 之类的包） | 正常 | 保持现状；等官方出现同类入口时改为「跳转到官方页」或直接下线 |
| SP7 | vt-system-prompt | 若写盘方式与 DSH 的读取发生竞争，可能读到半截文件；当前实现用同目录临时文件 + rename，读侧不会看到半截内容 | `await writeFile(temp, …); await rename(temp, target.path)` | DSH 侧读取走 `ctx.get("fs")` 的 `resolve`+流式读取（`dsh-agent-instructions/lib/index.js:774-790`），把文件当作一个整体；rename 是原子替换 | 正常 | 保持现状；`mtimeMs` 冲突检查已覆盖「别处改过」的场景 |

---

## 四、mcx-prompt-preset · 提示词库

### 交互目的

把本机 MineCodex 的提示词库接进 DSH：输入框「+」右边多一个书本按钮，点开就能选提示词填进草稿；侧边栏另有一页做完整管理。数据始终是同一份 SQLite，不复制不同步。

### 依赖契约清单

| # | 契约 | 插件里的原文 | DSH 侧现状 | 判定 |
|---|---|---|---|---|
| 1 | 宿主路由 + 鉴权 | `ctx.webServer.register({ kind:'prefix', path:'/mcx-prompt-preset/api' })` + `connection.requestRejection` | `dsh-host-webserver/lib/index.js:370-386`；`dsh-client-connection/lib/index.js:737-740` | 正常 |
| 2 | 输入框工具行 `.tools` 的类名后缀 | `document.querySelector('[class*="_tools"]')` | `dsh-client-ui-conversation/lib/client.js:21701` 的样式表里是 `.JZLxKW_tools`；`:22070` 的 JSX 是 `className: InputBar_module_css_default.tools`（`JZLxKW_` 前缀未变） | 正常 |
| 3 | 审查模式容器 `.modes` 的类名后缀 | `tools.querySelector('[class*="_modes"]')` | 同上：`.JZLxKW_modes`（`:21701`）、`:22098-22101`（`div.modes` 内含 permission / plan 两个插槽） | 正常 |
| 4 | 锚点落点：槽位出口是 `.tools` 的直接子节点，且前一个兄弟是 `.modes` | `const wrapper = anchor.parentElement; const tools = wrapper?.parentElement; before: wrapper.previousElementSibling` | `renderSlot("conversation.input.left", {})` 是 `.tools` 的最后一个子节点（`dsh-client-ui-conversation/lib/client.js:22102`）；每个 outlet 渲染 `<div data-slot=… style="display:contents">`（`dsh-client-ui-renderer/lib/client.js:1116-1124`）；条目直接渲染为组件根节点、无额外包裹（`:792-798` `renderEntry`、`:631-641` `SlotErrorBoundary` 成功时原样返回 children） | 正常 |
| 5 | 「+」是 `.tools` 里的第一个 `button` | `const addButton = tools.querySelector('button')` | `dsh-client-ui-conversation/lib/client.js:22069-22103`：`.tools` 内依次是 `Tooltip > button.add`（「+」）、隐藏的 `input[type=file]`、`div.modes`、`conversation.input.left` 插槽 | 语义变化（见 MX1） |
| 6 | 输入框可编辑区 `[contenteditable="true"]` | `document.querySelector('[contenteditable="true"]')` | Lexical 宿主仍设置 `contentEditable = "true"`：`dsh-client-ui-conversation/lib/client.js:11482` | 正常 |
| 7 | 插槽 `conversation.input.left`（`list` / `session`） | `ctx.slots.inject('conversation.input.left', …)` | `dsh-client-ui-conversation/lib/client.js:22974-22977`（声明）、`:22102`（渲染） | 正常 |
| 8 | 条目 props 里带 `useInput` 与 `inputActions` | `props.useInput`、`props.inputActions` | `ctx.uiSession.provide({ hooks:["conversation","input"], props:["inputActions"], … })`（`dsh-client-ui-conversation/lib/client.js:22775-22791`）；`useInput` 是 session 作用域标准 prop（`dsh-cordis-client-runner/lib/client.js:2707-2709`） | 正常 |
| 9 | 侧边栏条目插槽 `sidebar.panellist`（`list` / `root`），读 `id` / `order` / `label` | `{ name:'sidebar.panellist', id: PANEL_ID, order: 20, label: () => t('entry') }` | 声明：`dsh-client-ui-sidebar/lib/client.js:749-752`；消费：`:689-700`（`entriesOfSlot(...).map(({options}) => ({ id, order, label: resolveSlotLabel(options.label) }))`）、`:705`（订阅） | 正常 |
| 10 | 主面板插槽 `main`（`keyed` / `root`，按 `key` 选面板） | `{ name:'main', key: PANEL_ID, inject: () => ({ t, locale }) }` | 声明：`dsh-client-ui-layout/lib/client.js:713-716`；面板判定：`:699`（`entries("main").some(e => e.options.key === id)`） | 正常 |
| 11 | 跳转面板 `ctx.layout.selectPanel(id)` | `ctx.layout.selectPanel(PANEL_ID)` | 服务 `layout` 由 `ctx.reflect.provide("layout", layout)` 提供（`dsh-client-ui-layout/lib/client.js:704`）；方法在 `:522-527`（未注册的面板会抛错，插件已 try/catch） | 正常 |
| 12 | 客户端依赖声明 `inject: ['slots','locale','layout']` | 同左 | 三个服务在客户端运行时都存在（`slots`/`locale`/`layout`） | 正常 |
| 13 | 本机 SQLite 路径与 `MCX_PROMPT_DB` 覆盖 | `~/Library/Application Support/CodexNotes/codex-notes.sqlite` | 本机文件存在（98 KB）；不属 DSH 契约，见 MX6 | 正常（外部依赖） |
| 14 | `node:sqlite` 的 `DatabaseSync` | `({ DatabaseSync } = await import('node:sqlite'))` | 宿主运行时 Node 24.21.0；用宿主 Electron 以 `ELECTRON_RUN_AS_NODE` 实测：`node:sqlite ok function`、建表执行成功 | 正常 |
| 15 | 只碰 `prompts` / `prompt_categories` / `metadata` 三张表 | 所有 SQL 语句 | 本机库实测存在这三张表，列名与插件读取的字段逐一对齐（`prompts` 含 `id,title,body,starred,created_at,updated_at,last_used_at,category_id,emoji,sort_order,use_count,called_at` 等） | 正常 |
| 16 | 主题 token | `--dsw-specific-bubble`、`--dsw-specific-menu`、`--dsw-alias-interactive-bg-hover-solid` 等 | `dsh-client-ui-theme/lib/client.js:1470` 全部有定义 | 正常 |
| 17 | 「+」被其它插件改样式时跟随（读计算值） | `getComputedStyle(addButton)` 的 `width/height/borderRadius/backgroundColor` | 与 `UiEnhancer` 类插件无契约关系，纯视觉跟随；读数来源仍是「+」按钮本身 | 正常 |

### 重点疑点：输入框工具行结构变了吗

**结论：变了，但这次没伤到插件；按钮仍能挂上，位置也对。**

- 0.2.2 的 `.tools` 只剩「+」按钮、隐藏的 `input[type=file]`、`.modes`、`conversation.input.left` 插槽（`dsh-client-ui-conversation/lib/client.js:22069-22103`）。插件 `DESIGN.md` 描述的是「`button.add` ×2（+ 与回形针）+ input + .modes + 插槽」——回形针按钮已经不在这一行里了。
- 但插件的取法是 `tools.querySelector('button')`，第一个 `button` 仍是「+」（`:22078-22089`），所以「读『+』的计算样式来对齐外观」这件事**结果仍然正确**，只是它依据的结构描述过期了。
- 锚点的两层定位仍然成立：出口 div 是 `.tools` 的直接子节点，其前一个兄弟就是 `.modes`，所以按钮被插到「+ 右侧、审查模式左侧」（`:22098-22102`）。
- 兜底路径 `[class*="_tools"]` 也仍能命中，但它是全文档第一个匹配——其它包也用了 `_tools` 后缀（例如 `dsh-client-ui-deliverables/lib/client.js:1729` 的 `.i67LPW_tools`），一旦主路径失效，兜底有定位到别人的风险。

### 发现

| 编号 | 插件 | 失效时的用户可见现象 | 依赖的锚点原文 | DSH 侧证据（包名 文件:行） | 判定 | 建议加固方向 |
|---|---|---|---|---|---|---|
| MX1 | mcx-prompt-preset | 今天无差异。若按 `DESIGN.md` 的描述继续假设「+」前面还有回形针按钮，后续任何「取第 2 个按钮 / 取所有按钮」的改动都会取错元素 | `DESIGN.md`：「`button.add` ←「+」命令菜单 / `button.add` ← 回形针」；代码 `const addButton = tools.querySelector('button')` | `dsh-client-ui-conversation/lib/client.js:22069-22103`：`.tools` 内只有一个 `button`（「+」）+ 一个隐藏 `input[type=file]`；回形针不在这一行 | 语义变化 | 更新 DESIGN 的结构说明；取「+」时改用 `[class*="_add"]` 这类更明确的特征，而不是「第一个 button」 |
| MX2 | mcx-prompt-preset | 若主锚点路径失效、只剩兜底，且页面上先出现别的 `_tools` 容器，按钮会被插进别的控件组（看起来「按钮消失了」或出现在无关位置） | `const tools = document.querySelector('[class*="_tools"]')` | 同名前缀在多个包里出现：`dsh-client-ui-conversation/lib/client.js:21701`（`.JZLxKW_tools`）、`dsh-client-ui-deliverables/lib/client.js:1729`（`.i67LPW_tools`）、`dsh-experimental-client-ui-forge/lib/client.js:4466`（`._1C7SgG_tools`） | 脆弱 | 兜底限定在输入框卡片内（先从 `[data-composer-seat]` 或含 `[contenteditable="true"]` 的容器往下找），不要全文档 `querySelector` |
| MX3 | mcx-prompt-preset | 若插槽出口的层级再变（例如多包一层），按钮会落到插槽内部而不是 `.tools`，表现为出现在审查模式**右侧**或挤进插槽的隐形容器里 | `const wrapper = anchor.parentElement; const tools = wrapper?.parentElement ?? null;` | 当前成立：出口 div 是 `.tools` 直接子节点（`dsh-client-ui-conversation/lib/client.js:22102`），条目直接渲染组件根节点（`dsh-client-ui-renderer/lib/client.js:792-798`、`:631-641`） | 脆弱 | 改为「从锚点向上找最近的 `[class*="_tools"]`」，而不是数固定层数；找不到就不插，保持静默但不误插 |
| MX4 | mcx-prompt-preset | 浮层会贴到错误卡片的上沿（例如设置页里的某个输入框），位置飘到屏幕另一处 | `document.querySelector('[contenteditable="true"]')`，再向上找「包含该编辑器的卡片」 | 输入框编辑器仍是 `contenteditable="true"`（`dsh-client-ui-conversation/lib/client.js:11482`），但全文档可能有多个可编辑区 | 脆弱 | 改为从按钮自身向上找，或先取 `[data-composer-seat]` 再在其中找编辑器 |
| MX5 | mcx-prompt-preset | 侧边栏「提示词库」入口或页面消失、点「管理」跳转报错；数据本身不受影响 | `sidebar.panellist` / `main` / `ctx.layout.selectPanel` | `dsh-client-ui-sidebar/lib/client.js:749-752`、`:689-700`；`dsh-client-ui-layout/lib/client.js:713-716`、`:699`、`:522-527` | 正常 | 保持现状 |
| MX6 | mcx-prompt-preset | 若 MCX 升级改了库结构，页面与浮层会显示「该库文件里还没有提示词表」或 SQL 失败提示（插件已把这类错误做成可读文案，不会白屏） | `SELECT * FROM prompts` / `prompt_categories` / `metadata` | 本机库实测：三张表都存在，列与插件读取的字段一致；`node:sqlite` 在宿主 Node 24.21.0 上可用 | 脆弱（外部依赖） | 在页面底部显示库路径与 schema 版本，出问题时能一眼判断是「MCX 没装/没建表」还是「DSH 侧出错」 |
| MX7 | mcx-prompt-preset | 若 `node:sqlite` 不可用，浮层与页面统一显示「当前运行时缺少 node:sqlite」（可读，不崩），但提示词功能整体不可用 | `({ DatabaseSync } = await import('node:sqlite'))` | 宿主 `runtime/versions.json`: `node: 24.21.0`；实测 `node:sqlite ok function`。插件已用动态 import + 501 兜底 | 正常 | 保持现状；在 README 的「前置条件」里补上「宿主运行时需带 `node:sqlite`」（当前满足） |
| MX8 | mcx-prompt-preset | 若注册期抛错（插槽改名、locale 冲突等），插件在插件页仍显示 enabled/active，但输入框没按钮、侧边栏没入口，只有控制台有一行 `registration failed` | `catch (failure) { console.error(...) }` 包住整个 `apply` | 插件状态由 Loader 决定，与客户端注册成败无关；客户端注册失败只写控制台 | 脆弱 | 注册失败时降级为一条可见提示（或把失败写进一个可查询的 marker），不要只留控制台 |

---

## 五、小结（按严重度排序）

1. **【已失效 · 最严重】vt-steer-now 的「立即发送」按钮在 0.2.2-rc.1 上永远不出现。**
   宿主侧那条「移出队列 → `cancel(keepInbox)` → `followup` 重投递」的链路仍然完全成立（队列形态、中断语义、唤醒、重投递都不会被去重或计成重放），断掉的是最前端的定位：0.2.2 的用户气泡行首个子节点变成了插槽出口（待生效行是 `conversation.chat.user.content` 工厂出口），插件取 `children[0]` 拿到的是一个零高度、`display:contents` 的 div，可见性判断恒为 false，按钮被隐藏。用户侧表现是「这个功能凭空消失了」，没有任何报错。修一处取值即可恢复（取 `conversation.chat.user.content` 出口或第一个有高度的后代）。

2. **【语义变化】vt-system-prompt 把「两个全局指令根」呈现成二选一，实际是两份都生效。**
   `~/.dsh/AGENTS.md` 与 `~/.agents/AGENTS.md` 同时存在时都会被注入，只有正文完全相同时才去重。页签式 UI 很容易让用户以为后一个覆盖前一个，改完发现旧规则还在起作用。

3. **【语义变化】vt-system-prompt 的「保存立即生效」需要更准确的表述。**
   写盘是即时的，但指令要等下一次 step 边界重新组装才会进请求；用户保存后立刻追问，可能仍按旧规则回答。

4. **【脆弱】vt-system-prompt 的 1 MiB 上限与 DSH 的静默行为只差一步。**
   默认上限恰好相等（都是 1 MiB），但 DSH 侧超限是「跳过且不报错」。如果用户在 profile 里把 `maxSourceBytes` 调小，插件仍会允许保存到 1 MiB，用户看到「已保存」却永远不生效。

5. **【语义变化】mcx-prompt-preset 依赖的工具行描述已经过时，但结果仍正确。**
   回形针按钮已不在 `.tools` 里；`tools.querySelector('button')` 仍取到「+」，所以外观对齐没坏。风险在于后续改动会照着过时的结构继续假设。

6. **【脆弱】mcx-prompt-preset 的兜底定位与浮层锚点都是全文档选择。**
   `[class*="_tools"]` 与 `[contenteditable="true"]` 全文档各取第一个，页面里存在多个候选时可能定位到别人的容器。

7. **【正常】其余契约都还在。**
   三个插件的宿主路由、鉴权、locale、`settings.section` / `conversation.input.left` / `conversation.input.dock` / `sidebar.panellist` / `main` 插槽、`ctx.layout`、`ctx.get('agents')` 与 Agent inbox API 全部存在且语义一致；`node:sqlite` 在宿主 Node 24.21.0 上实测可用，本机 MCX 库的三张表与列名也与插件一致。

### 建议的处理顺序

| 顺序 | 动作 | 理由 |
|---|---|---|
| 1 | 修 vt-steer-now 的气泡定位（ST1） | 唯一一个「功能已整体失效」的项，改动小、收益最大 |
| 2 | 更新 vt-steer-now 的 README/DESIGN 依赖说明 | 与第 1 项同一处，顺手改掉过时的 `data-tool` 描述 |
| 3 | vt-system-prompt 增加「两份同时生效」提示与更准确的生效时机文案 | 不影响功能，但直接影响用户对「规则是否生效」的判断 |
| 4 | mcx-prompt-preset 更新工具行结构说明，并把兜底选择器收窄 | 今天无用户可见问题，属于防止下一次升级踩坑 |
| 5 | 其余脆弱项按升级节奏跟进 | 均不影响当前使用 |
