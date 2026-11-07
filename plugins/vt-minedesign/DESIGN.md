# DESIGN.md — dsh-vt-minedesign（维护者文档）

用户文档在 [README.md](README.md)，硬约束在 [AGENTS.md](AGENTS.md)。本文件回答
「为什么这样切、改哪里会坏、哪些路已经否掉」。术语固定：**面板**、**伴生应用**、
**面板通道**、**一条缝**。

## 1. 它补的是两个断点

MineDesign 按 Codex 的形态分发：一个 stdio MCP 服务 + 两个技能 + 一个 MCP App 编辑器。
在 DSH 上这条路断两次，插件就补这两处：

| 断点 | 补法 |
|---|---|
| 模型读不到 `structuredContent`（DSH 的 MCP 客户端只渲染 `content`） | 宿主侧投影层 `src/projection.js` |
| 用户看不到编辑器（DSH 不是 MCP Apps 宿主，资源桥不存在） | 面板 + 伴生应用：web 半边注册 tab 类型，host 半边另起一个 `mdn` 提供完整应用 |

## 2. 模块表（接口 + 它隐藏了什么）

| 文件 | 接口 | 隐藏了什么 |
|---|---|---|
| `index.js` | `apply(ctx, config)` | 注册顺序、memo 化的安装与技能发现、live reader 的绑定 |
| `src/config.js` | `normalizeConfig(config) → Settings` | 10 个键的默认值、未知键忽略、`skillPrefix` 的空串语义 |
| `src/install.js` | `resolveInstall(config)` → `Install \| {reason}` | 四处候选的尝试顺序、`LaunchSpec` 推导、`MINEDESIGN_*` 覆盖 |
| `src/skills.js` | `listSkills`、`readSkill`、`SKILL_NAME_MAP` | frontmatter 解析、候选形状、适配段拼接 |
| `src/projection.js` | `enrichMineDesignResult({name, result})` | 每种工具的投影规则、4 KiB 上限、码点截断、不动 `design_check` 一类 |
| `src/routing.js` | `routingText(resolved, candidates)` | 提示词正文与就绪行（每请求都发，所以短） |
| `src/sessions.js` | `createSessions({limit})` → `{remember, list, activeUrl}` | `documents`/`document` 两种形状、去重、最近序、20 条上限 |
| `src/panel.js` | `PANEL_ROUTE`、`createSessionRoute`、`createPanelSnapshot` | 状态码矩阵、Host/Origin 校验 + 可选的宿主准入探针、body 上限、快照的「纯读 + 一次懒启动」 |
| `src/companion.js` | `createCompanion({launch, cli, workspace})` → `{appUrl, ensureUrl, open, api, dispose}` | 进程生命周期、URL 正则、30 s 预算、token/origin 解析、失败吞掉 |
| `src/bridge.js` | `createAppBridge({companion, documents})` | MCP 工具名 → 伴生 HTTP 动作的翻译表、结果与错误的形状、未映射即拒绝 |
| `src/delivery.js` | `createDelivery({resolveController})` → `{deliver, state}` | `sessionController.prompt` 的窄契约、超时、失败记录 |
| `src/status.js` | `createStatusTool(probe)`、`createStatusProbe({install, skills, tools, sessions})` | payload 形状、`hints` 文案、可粘贴的 YAML 兜底 |
| `bin/mdn-mcp.mjs` | 进程入口 | stdio 透传、信号与退出码、失败时那一行 stderr |
| `client.js` | `apply(ctx)`（web 半边） | tab 类型、槽位、MCP Apps shim、轮询与自动打开 |

## 3. 三条不变量

1. **双半边各自封闭。** host 半边只用 Node 内置模块与本包 `src/`；web 半边只用
   `dsh.client.inject` 列出的 client 包与浏览器 API。两边不互相 import。理由是升级互不牵连：
   宿主换版不该让 host 半边解析失败，网页换版也不该动到 MCP 那条链。
2. **两边只走一条缝 `PANEL_ROUTE`。** `GET` 是会话快照；`POST` 只收 `{tool, args}`（工具桥）与
   `{action:'message', sessionId, text}`（投递）。没有 RPC、没有共享模块、没有第二条路由。
3. **伴生进程只服务「给人看的那份界面」。** agent 的读写只走 MCP 工具与 DSH 文件工具。
   同一 workspace 上两个服务并存是 MineDesign 自己文档里点名的风险，这条是它的边界。

## 4. 深模块

术语按 codebase-design：**模块**有**接口**与实现，**深度**是「每单位接口能撬动的行为」，
**seam** 是接口所在的位置，**adapter** 是占据 seam 的具体实现。原则：接口就是测试面，
调用方与测试穿同一道缝；能删掉模块后复杂度在 N 个调用点复现，才说明它值得存在。

- **`src/sessions.js`** —— 三个方法的接口，藏住「两种载荷形状 + 去重 + 最近序 + 上限」。
  删除测试：`index.js`、`panel.js`、`bridge.js`、`status.js` 四个调用面会各自解析
  `structuredContent`、各自维护顺序——复杂度确实复现，深度成立。
- **`src/delivery.js`** —— 接口只有一个 `deliver()` 加一份 `state`，藏住宿主
  `sessionController.prompt(request, signal)` 的窄契约：`requestId`、`mode`、自己传 `AbortSignal`、
  15 s 超时、失败原因落进 `state`。这块契约不归我们所有，集中吸收才不会被下一次宿主改动打散。
- **`src/companion.js`** —— 四个方法的接口，藏住子进程生命周期、stdout 的 `MineDesign: <url>` 抓取、
  30 s 预算、token/origin 解析、以及「任何失败都返回 null/false」。
  它内部有 `spawnImpl` / `fetchImpl` 两个注入点：测试里是假实现，生产是真实现——**两个 adapter，
  所以这是一条真 seam**，不是假设的。

## 5. 已核实的事实（改代码前必读）

- **完整应用地址只从伴生进程的 stdout 来。** 应用外壳是 `/app/<token>/`，`dist/app.js` 硬依赖
  `config.api`；token 每进程随机，只有非 MCP 模式的 `dist/cli.mjs` 会 `console.log('MineDesign: ' +
  service.url)`。`minedesign_shell` 返回的 `window.MINEDESIGN_CONFIG` 只有 `{documents, build}`，
  缺 `api` 时外壳报 `Invalid URL`（实测）。
- **被 iframe 嵌进去就一定是 MCP App。** `dist/app.js` 是
  `if (window.parent !== window) { app = new App(...); await app.connect() }`：它会先发
  `ui/initialize` 等宿主应答，之后才用 `tools/call` 调工具。不应答就永远停在「正在连接作品」。
- **槽位的 `inject` 第一个参数是会话 id。** `sidebar.right.pane.tab` 注册时
  `inject: (sessionId, actions) => ({…})`；丢了它，`ui/message`（`Send to chat`）就没有会话可投递。
- **`sessionController.prompt(request, signal)`**：`requestId` 与 `mode` 必填；Host 侧直接调用要自己
  传 signal。我们走 `mode: 'queue'`，与输入框发消息同一条路径。
- **`minedesign_events` 的 `path` 是 `<editorPath>__deck/events`**，不是作品目录；传作品目录返回
  「不允许订阅的路径」。
- **`minedesign_shell` 的 `html` 约 100 KB**，投影层只报 `build` 与字节数，绝不让它进上下文。

## 6. 否掉的方案

**6.1 自己写 MCP 桥。** 等于把 `dsh-mcp-client` 复制一遍：传输、生命周期、schema 转换、错误映射、
超时全要跟，且外部插件 host 半边不能依赖宿主模块图。桥接交给补丁挂载的 `dsh-mcp-client`，
本插件只补它不做的投影。

**6.2 复制技能正文。** 上游每次改技能都要人工同步，抄漏了模型会照旧流程做事。改为运行期只读 +
内存追加适配段：上游升级自动生效，我们只维护那几条 DSH 差异。

**6.3 通用浏览器标签页。** 把 `editorUrl` 交给用户、让右侧栏当普通网页打开，技术成本为零，
但拿到的是一块没有归属的浏览器页面：没有入口胶囊、不会跟着模型打开的作品出现、多个作品只能靠
多个标签页。面板要的是「这是 MineDesign 的一个功能」，所以注册官方 tab 类型。

**6.4 Remote RPC 而不是一条只读路由。** 类型化 RPC 需要构建期 codegen：第三方插件的客户端没有
生成式 typert 描述，接入成本是一套我们无法在运行期生成的类型管线。而面板需要的只是「读一份快照
+ 转发两种请求」，一条 `webServer` 路由就够。

**6.5 在浏览器里直接调 MCP。** 技术上不可行：MCP 是 stdio 子进程，只有宿主能拉起、能读结果。
绕过宿主也会让「模型看到的」与「面板显示的」变成两份事实。

**6.6 只框编辑器页面，不起伴生应用。** 面板曾经直接框 `editorUrl`：能看能点，但没有 MineDesign
的完整应用——没有文档切换、缩放、撤销/重做、属性/微调/评论侧栏。这些正是「像 MineDesign」的部分，
所以宁可多一个进程也要框应用本体。

## 7. 降级策略

| 情况 | 行为 |
|---|---|
| MineDesign 没装 | 启动器 stderr 一行原因后退出；工具不出现；`minedesign_status` 给 `{ok:false, reason}` 与安装指引；路由段换成「未找到」措辞 |
| `.mcp.json` 失效 / 换 node 版本 | 按 `config → mcp-json → PATH` 继续试，全失败才报错 |
| 补丁里的 `!!js` 求值失败 | MCP 不出现，routing / skills / status 照常；`status` 输出填好真实路径的可粘贴 YAML |
| 技能目录缺失 | 注册空列表 + 安装指引；可用 `skillsDir` 显式指定 |
| 无 `webServer`（无头）或 `panel: false` | 面板通道不注册、面板不出现；工具 / 技能 / 投影照常 |
| 伴生应用起不来或 30 s 内没打印 URL | `appUrl` 保持 null，面板退回框 `editorUrl`（编辑页仍可改） |
| 伴生应用中途退出 | 清空 `url` 与 token，下次请求重新启动 |
| 桥接的工具未映射 / 伴生 `api` 返回错误 | 返回 `isError` 结果，面板显示失败；不猜返回形状 |
| 面板里 `ui/initialize` 没人应答 | 停在「正在连接作品」——对应 README 的排障第一条 |
| `Send to chat` 没有会话或没有控制器 | 缺参 `400`、无投递能力 `503`、投递方拒绝 `502`；原因进 `delivery.lastError` |
| 地址过期（DSH 重启换端口） | iframe 6 s 未就绪 → 「编辑器没能加载出来」+「重新打开」/「在浏览器打开」 |
| 没有会话 | 面板显示空状态，不弹；自动打开只在 `active` 变化时触发，首见只建基线 |

## 8. 验证基线

| 项 | 当前值 |
|---|---|
| 单元测试 | `node --test test/*.test.mjs` → **112 全绿** |
| client bundle | `check-client-bundles.mjs` → **7 个 client 模块**，包名与 VERSION 一致 |
| 面板通道 | 4 种核心响应：`200` 快照 / `403` 不可信 Host·Origin 或未通过宿主准入 / `405` 非 GET·HEAD / `500` 坏快照；`POST` 另有 `400` 坏体、`502` 投递被拒、`503` 无桥·无投递能力 |
| 真机工具面 | 15 个 `mcp__minedesign__*`；2 个技能 |
| 伴生应用 | 真机拉起、`open` 200、外壳 200 且带 `api` 配置、重复打开幂等 |
| MCP Apps 链路 | DSH 之外完整复现：外壳渲染出 MineDesign 完整界面，界面语言随 `hostContext.locale` |
| 编辑器闭环 | `design_check` 零问题 → `open_document` → `editorUrl` 200；外部改动后 `events` 返回 `external-change` |
| 待人工验收 | 重启后在 DSH 面板里确认：入口胶囊、自动打开、完整应用可用、`Send to chat` 能进对话 |

## 9. 决策记录（为什么）

**v1 · host 半边。** 先补「模型看不见」而不是「用户看不见」：没有投影层，模型连编辑器地址都拿不到，
后面所有界面工作都没有数据来源。技能选择运行期只读，是为了不跟上游版本较劲。

**v2 · 官方 tab 类型。** 通用浏览器标签页能看不能用，且不随模型动作出现。注册 tab 类型让「编辑器」
成为插件自己的一个功能入口，代价是引入 web 半边与 `dsh.client` 声明。

**v3 · 伴生应用。** 完整应用的 token 只在非 MCP 模式打印，MCP 工具拿不到，所以要第二个进程。
明知会让同一 workspace 上有两个服务，仍选择它：另一条路只有编辑页，没有应用。代价写进 README，
并用不变量 3 兜住写者冲突。

**v4 · 最小 MCP Apps 宿主。** iframe 里的应用一定走 MCP Apps，不应答 `ui/initialize` 就永远连不上。
只实现它真正用到的三个方法（`ui/initialize`、`tools/call`、`ui/message`），`tools/call` 用翻译表
落到伴生 HTTP——**不做通用 MCP 宿主**，未映射的工具直接拒绝，避免猜错返回形状污染编辑器状态。

**v5 · 删掉自己的第二条工具栏。** 完整应用自带刷新与评论侧栏，我们那条栏在实机里读作重复的
MineDesign 品牌行。连带删除自绘的标注入口与宿主侧 `annotations` 读取：应用自带，重复且突兀。
**因此面板里不要再加 chrome。**

**v6 · 接上 `Send to chat`。** 应用的发送顺序是 `flush()` → `prepareFeedback()`（工具）→
`ui/message`。把它转成 `POST {action:'message'}` 再由 `sessionController.prompt` 投递，走的是用户
在输入框发消息的同一条路径，模型无需特殊处理。

**v7 · 两个失败原因。** 一是槽位 `inject` 丢了 `sessionId`（第一参数就是会话 id），二是失败只进
浏览器控制台、宿主看不见。修法是补上会话 id，并把 `delivery: {attempts, lastError, lastSessionId}`
放进面板快照——`attempts` 为 0 即面板侧问题，非 0 有错误即宿主拒绝。

**v8 · 准入交给宿主，不再只靠 Host/Origin 围栏。** `isTrusted` 只判断请求来自回环且 Origin 自洽，
本机任何进程都能通过——`GET` 能读到当前打开的是哪份文档，`POST` 还能往会话里投一条消息。
所以面板通道接入宿主 `connection.requestRejection`：它在同一条围栏之外还要求一个已认证的活 Peer，
也是其余插件路由使用的同一道门。服务缺失时（headless、旧宿主、测试）退回围栏本身，
保证不会因为拿不到服务而整条通道失效。`createSessionRoute` 的 `admit` 是可选注入，
测试因此仍按围栏矩阵断言。
