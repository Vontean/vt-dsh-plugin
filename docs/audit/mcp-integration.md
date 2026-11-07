# MCP / 技能集成类插件：稳固性核查

核查对象：`plugins/vt-minedesign`、`plugins/vt-use-figma`。本轮只记录，不修改任何插件源码。

## 核查口径

| 项 | 值 |
| --- | --- |
| 运行中的 DSH | `0.2.2-rc.1`（`@deepseek-ai/dsh-mcp-client` 与 `@deepseek-ai/dsh-app-boot` 的 `package.json` 均为该版本） |
| 插件开发时基准 | 两个插件 `engines.dsh` 都声明 `>=0.2.1-rc.5 <0.3.0` |
| DSH 源码基准 | 从 `app.asar` 抽出的 330 个 `@deepseek-ai` 包到 `/tmp/dsh-full`（含 `src/*.ts` 与 `lib/*.js`） |
| 外部依赖基准 | `@vontean/dsh-oauth-mcp-client@0.1.0`（**profile 实装的那一份**，`lib/` 里没有 `clientName`/`callbackPath`/`tokenEndpointAuthMethod`）；另有同版本号的源码检出 `~/.dsh/plugins/dsh-oauth-mcp-client`（**有**这三个键）。两者不一致本身就是一条环境风险，详见「环境依赖风险」§2 |
| 运行时状态 | 两个插件均 `enabled: true` / `fiberPhase: active`，没有装载失败。问题只可能是**行为退化** |
| 方法 | 读意图文档 → 从插件源码提出它读取的 DSH 锚点 → 逐条到源码确证存在性与语义 → 用运行时可见事实交叉验证 |

判定分四档：

- **正常**：锚点存在且语义一致。
- **语义变化**：锚点还在，但含义或位置变了，插件按旧语义使用会得到错误结果。
- **已失效**：锚点已消失（或从未在实装版本里存在），对应功能不再生效。
- **脆弱**：当前能工作，但依赖的稳定性假设不成立，下一次 DSH 更新或依赖升级容易断。

一处口径说明：外部依赖（非 DSH 包）的契约差异也用这四档描述效果，但会在证据列写明"外部依赖"，不与 DSH API 结论混为一谈。

### 实时交叉验证

本会话的系统提示里同时出现两段插件注入的文字，是两条主链路活着的直接证据：

- `## Figma（远程 MCP + 官方技能）`，结尾为「技能已就绪：16 个 figma-* 技能（来源 openai-curated-remote@17.0.0）」；
- `## MineDesign（远程 MCP + 两个设计技能）` 段与其 15 个 `mcp__minedesign__*` 工具栏。

---

## vt-minedesign 1.0.0

### 交互目的

让模型用本机 MineDesign 的 15 个本地 MCP 工具和 2 个设计技能做设计稿，并让用户在右侧栏面板里直接看见和编辑同一份作品。

它比普通 MCP 插件多做两件事，也就在这两处承担额外风险：

1. **结果投影**：MineDesign 的有用返回值在 `structuredContent` 里，而 DSH 的 MCP 客户端只把 `content` 渲染给模型，所以它挂 `tools/post-execute` 补一段文本，把编辑器地址交到模型手里。
2. **面板通道**：注册一条 HTTP 路由，浏览器半边轮询它拿到"当前打开哪份作品"，再把 MineDesign 应用本体框进右栏。

### 依赖契约清单

| 契约 | 插件侧锚点 | DSH 侧证据 | 判定 |
| --- | --- | --- | --- |
| 系统提示分段 + MCP 位置 | `index.js:180-188` `ctx.systemPrompt.section({name:'minedesign:routing', order: getSectionOrder('MCP_SERVERS'), interpolate:false, text})` | `@deepseek-ai/dsh-system-prompt lib/index.js:38`（`MCP_SERVERS: 3100`）、`:255`（`section()`）、`:264`（`getSectionOrder`）、`:120`（`interpolate:false` 保留字面量） | 正常 |
| 技能 provider | `index.js:191-201` `ctx.skills.registerProvider((control)=>({name,list,get}))`；`control.invalidate()` | `@deepseek-ai/dsh-skill lib/index.js:147`（`registerProvider(create)`）、`:153`（`control.invalidate`） | 正常 |
| 技能候选字段 | `src/skills.js` 产出 `name/description/source/provider/rank/path/resourceBase/invocation` | `@deepseek-ai/dsh-skill lib/index.js:452-463`（逐字段校验：`source`+`rank`+`provider` 必填）、`:75`（`resourceBase.kind==='directory'`）；`@deepseek-ai/dsh-skill-filesystem lib/index.js:22`（`CUSTOM_RANK = 300`，插件用 300） | 正常 |
| 工具注册 | `index.js:203-211` `tools.register(createStatusTool(probe))` | `@deepseek-ai/dsh-tools lib/index.js:433`（`register`）、`:436`（强制 `output.schema` + `output.render`） | 正常 |
| 结果投影事件 | `index.js:214-238` `ctx.on('tools/post-execute', (exec,result,next)=>…)`，读 `result.value.structuredContent` | `@deepseek-ai/dsh-tools lib/pipeline.js:673`（`ctx.waterfall(…,'tools/post-execute',exec,result,next)`）、`:710`（成功结果含 `value`）；`@deepseek-ai/cordis lib/index.js:903`（waterfall 语义） | 正常 |
| HTTP 路由 | `src/panel.js:120-124` `{kind:'exact', path:'/vt-minedesign/sessions', handler(req,res)}` | `@deepseek-ai/dsh-host-webserver lib/index.js:375`（`register(route)` 按 `route.kind` 分表）、`:471`（`responder.handler(req,res)`） | 正常 |
| 会话投递 | `src/delivery.js:61-71` `controller.prompt({requestId,sessionId,mode:'queue',content}, signal)` | `@deepseek-ai/dsh-api-session-controller lib/index.js:3791`（服务名 `sessionController`）、`:4048`（`async prompt(request, signal)`）；`lib/typert.host.js:2395`（必填 `requestId/sessionId/mode/content`，`mode` 枚举为 `queue` 与 `steer`） | 正常 |
| web 半边模块入口 | `client.js:21` `window.__ModuleLoader__.load({id:'dsh-vt-minedesign', factory})` | `@deepseek-ai/dsh-client-modules lib/client.js:1`（同形入口）、`lib/index.js:91`（读取 `dsh.client.inject`） | 正常 |
| `dsh.client.inject` 三个包 | `package.json` → `@deepseek-ai/dsh-client-ui-slots` / `-ui-sidebar-right` / `-locale` | `@deepseek-ai/dsh-client-modules lib/index.js:91`（解析 `dsh.client.inject` 为字符串数组）；`lib/client.js:791-794`（**图里没有对应 row 时静默跳过**，所以多声明一个不存在的名字也不会让插件装载失败）；`@deepseek-ai/dsh-client-ui-sidebar-right lib/client.js:5599-5600`（`provide('sidebarRightTabs'/'sidebarRight')`）；`@deepseek-ai/dsh-client-locale lib/client.js:1838`（`provide('locale')`） | 正常 |
| 右栏 tab 类型 | `client.js:578-596` `sidebarRightTabs.register({id, kind:'minedesign', priority:'extension', title, guide})` | `@deepseek-ai/dsh-client-ui-sidebar-right lib/client.js:4834`（`RANKS.extension`）、`:4905`（`register`） | 正常（guide 字段见 MD-04） |
| 右栏面板插槽 | `client.js:599-614` `slots.register({name:'sidebar.right.pane.tab', key:PLUGIN_ID, inject:(sessionId)=>({store,t,sessionId})})` 与 `.title` | `@deepseek-ai/dsh-client-ui-sidebar-right lib/client.js:1625`（分派 `sidebar.right.pane.tab`）、`:1597`（`entryKey = definition.id`，与插件 `key` 对应）；`@deepseek-ai/dsh-client-ui-sidebar-files lib/client.js:2228-2242`（随包插件同形用法） | 正常 |
| 会话头部快捷入口 | `client.js:647-658` `slots.register({name:'conversation.session.header.utilities'})` | `@deepseek-ai/dsh-client-ui-conversation lib/client.js:20899`（渲染点）、`:22928`（插槽声明） | 正常 |
| 语言包 | `client.js:551-552` `ctx.locale.register(NS,'zh',DICT.zh)` / `('en')`；`:562` `ctx.locale.bind(NS)` | `@deepseek-ai/dsh-client-locale lib/client.js:1675`（同时支持 `register(ns, loc, dict)` 与 `register(ns, {zh,en})`）、`:1702`（`bind`） | 正常 |
| 打开面板 | `client.js:568-576` `ctx.sidebarRight.openTab(KIND)`（`:572`）包在 try/catch | `@deepseek-ai/dsh-client-ui-sidebar-right lib/client.js:2503`（跨插件面 `openTab(kind, options)`） | 正常 |
| MCP 子进程配置键 | `cordis.patch.yml` → `serverName/transport/command/args/env/toolCallTimeoutMs/failOnStartupError` | `@deepseek-ai/dsh-mcp-client lib/index.js:781-792`（stdio 分支逐键在 schema 内；同 schema 另有可选的 `cwd`/`maxInstructionBytes`/`reconnect`，都带默认值） | 正常 |
| `!!js` 启动表达式 | `cordis.patch.yml` → `command: !!js process.execPath`、`args: !!js String(baseUrl)…` | `@deepseek-ai/cordis-plugin-loader lib/index.js:360`（`with(ctx)` 求值）、`:366`（递归替换）、`:744`（以 `fiber.ctx` 求值，`baseUrl` 在作用域内） | 正常 |
| 版本闸门 | `engines.dsh: ">=0.2.1-rc.5 <0.3.0"` | `@deepseek-ai/dsh-app-boot lib/index.js:1094`（`semver.satisfies(…, {includePrerelease:true})`）、`:1097`、`:1129` | 正常（预发布版参与范围匹配，`0.2.2-rc.1` 合法） |

### 发现列表

| 编号 | 插件 | 失效时的用户可见现象 | 依赖的锚点原文 | DSH 侧证据（包名 文件:行） | 判定 | 建议加固方向 |
| --- | --- | --- | --- | --- | --- | --- |
| MD-01 | vt-minedesign | 面板那条本地路由不再被宿主接收，右栏面板永远停在"面板数据通道不可用"，`Send to chat` 失效 | `{ kind:'exact', path:'/vt-minedesign/sessions', async handler(request,response){} }`（`src/panel.js:120-124`） | `@deepseek-ai/dsh-host-webserver lib/index.js:375`：`register(route)` 按 `route.kind === 'exact'` 分表；`:471` 以 `(req,res)` 调用 handler。与插件形状逐字段一致 | 正常 | 无需改动；升级 DSH 时把"路由必须带 `kind`"写进插件自检 |
| MD-02 | vt-minedesign | 面板"Send to chat"点了没反应，或消息进了错误的会话 | `controller.prompt({ requestId: randomUUID(), sessionId, mode:'queue', content:[{type:'text',text}] }, abort.signal)`（`src/delivery.js:61-71`） | `@deepseek-ai/dsh-api-session-controller lib/index.js:3791` 提供服务名 `sessionController`；`:4048` 方法签名为 `prompt(request, signal)`；`lib/typert.host.js:2395` 要求 `requestId/sessionId/mode/content` 四个字段，`mode` 枚举仍含 `queue` | 正常 | 无需改动 |
| MD-03 | vt-minedesign | 模型拿到 `"(returned no model-visible content)"`，看不到编辑器地址，整个"写作品→面板打开→标注回传"闭环断在最后一步 | `ctx.on('tools/post-execute', async (exec, result, next) => { … enrichMineDesignResult({ name: exec.name, result }) … })`，投影读 `result.value.structuredContent`（`index.js:214-238`、`src/projection.js:478-481`） | `@deepseek-ai/dsh-tools lib/pipeline.js:673` 以 `(exec, result, next)` 触发 waterfall，`:710` 的 `createSuccessResult` 返回 `{isError, value, content}`，`value` 即工具原值；`@deepseek-ai/dsh-mcp-client lib/index.js:200-219` 的 `output.render` 只渲染 `extractText(value.content)`，**确实不含** `structuredContent` | 正常 | 无需改动；投影层存在的前提要写进注释，避免被当成冗余代码删掉 |
| MD-04 | vt-minedesign | 右栏入口列表里 MineDesign 的引导卡片消失，或未来加第二条引导卡时整个 tab 类型注册抛错、面板彻底不出现 | `guide: [{ order: 40, title: () => 'MineDesign', description: () => t('guide.description'), icon: MineDesignIcon }]`（`client.js:586-593`）——**没有 `id`、没有 `commandId`** | `@deepseek-ai/dsh-client-ui-sidebar-right lib/client.js:4908` 校验 `new Set(entries.map(e => e.id)).size === entries.length`；单条时 `id` 为 `undefined` 仍可通过，所以现在只是"没被触发"。`:642` 把 `entry.id` 作为 `entryId` 传给引导项；`:4834` 的 `RANKS` 中 `extension` 合法 | 脆弱 | 按 `@deepseek-ai/dsh-client-ui-sidebar-files lib/client.js:28-35` 的写法补 `id: 'minedesign'`（必要时补 `commandId`），让引导项有稳定标识 |
| MD-05 | vt-minedesign | 面板 `Send to chat` 可以让**本机任意进程**在没有登录态的情况下向当前会话注入一条用户消息；会话快照（作品路径、编辑器地址、token 化 URL）也可被无身份读取 | `function isTrusted(request){ … if (origin === undefined) return true; … }`（`src/panel.js:47-59`），路由同时接受 `POST`，`parsed.action === 'message'` 时调 `deliver()`（`src/panel.js:129-150`） | `@deepseek-ai/dsh-client-connection lib/index.js:737` 提供宿主权威准入 `requestRejection(request)`；`:742` 的 `admit()` 先过 Host/Origin 围栏，再要求 `browserAuth` 认证成功，否则 `401`。实测（Lead 在 `127.0.0.1:53724` 上直接 curl）：`/vt-quote-bar/api`、`/vt-steer-now/api`、`/vt-system-prompt/api`、`/mcx-prompt-preset/api` 四条同类路由均 `403`，而 `/vt-minedesign/sessions` 返回 `200` 与真实 `editors` 数据 | 脆弱（安全一致性） | 改用 `connection.requestRejection(request)`；若要保持"面板专用"，至少要求 POST 带一个只注入面板的令牌，别用"Host 是本机"当身份 |
| MD-06 | vt-minedesign | `minedesign_status` / `figma_status` 这类自检工具把已连上的 MCP 误报成"没连上"，模型于是拒绝工作 | `toolNames()` 用 `ctx.get('tools').schemas()` 取可用的 `mcp__minedesign__*` 工具名（`index.js:124-137`） | `@deepseek-ai/dsh-tools lib/index.js:589` 的 `schemas(scope, toolSet)` 在**省略 scope 时读全局视图**；`:477` 的 `view()` 只合并全局层与祖先层。若某个 Agent 预设把 MCP 客户端挂成 agent 作用域，工具就不会出现在全局视图里 | 脆弱 | 自检改成"读当前 Agent 作用域的工具集"，或同时接受"路由段里已声明"作为次证据，避免作用域一变更就误报 |
| MD-07 | vt-minedesign | 技能列表为空，模型以为没有 MineDesign 技能；或技能正文取不到 | `skillCtx.skills.registerProvider((control) => { registration = control; return { name, list, get } })`（`index.js:191-200`） | `@deepseek-ai/dsh-skill lib/index.js:147-183`：`create(control)` 同步调用，control 含 `signal` 与 `invalidate`；provider 需 `name/list/get`；`:452-463` 校验 `source`（字符串）、`rank`（有限数）、`provider`（必须等于注册名） | 正常 | 无需改动 |

---

## vt-use-figma 1.0.1

### 交互目的

让模型遇到 Figma 链接或 Figma 任务时，先确认远程 MCP 连上了、先建会话、先加载 Figma 官方技能，再调工具；并把 16 个 `figma-*` 技能就地接进 DSH。它自己不建连接，连接归 `dsh-oauth-mcp-client`。

### 依赖契约清单

| 契约 | 插件侧锚点 | DSH 侧证据 | 判定 |
| --- | --- | --- | --- |
| 系统提示分段 | `index.js:391-404` `ctx.systemPrompt.section({name:'figma:routing', order:getSectionOrder('MCP_SERVERS'), interpolate:false, text})` | `@deepseek-ai/dsh-system-prompt lib/index.js:38`、`:255`、`:264`、`:120` | 正常 |
| 分段名不与 MCP 客户端撞车 | `SECTION_NAME = 'figma:routing'`（`index.js:35`） | 内置客户端用 `mcp:<server>`（`@deepseek-ai/dsh-mcp-client lib/index.js:732-742`）；外部 OAuth 客户端用 `tool:mcp:<server>`（`@vontean/dsh-oauth-mcp-client lib/index.js:122`）。`figma:routing` 与两者都不同 | 正常 |
| 技能 provider | `index.js:407-437` `ctx.inject(['skills'], …registerProvider(...))`，`control.invalidate()` | `@deepseek-ai/dsh-skill lib/index.js:147`、`:153` | 正常 |
| 技能候选字段与排序 | `index.js:331-341` → `source:'custom'`、`rank:300`、`path`、`resourceBase:{kind:'directory'}`、`invocation` | `@deepseek-ai/dsh-skill lib/index.js:452-463`、`:75`；`@deepseek-ai/dsh-skill-filesystem lib/index.js:22`（`CUSTOM_RANK = 300`） | 正常 |
| 技能名文法 | `SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u`（`index.js:61`） | `@deepseek-ai/dsh-skill lib/index.js:19` 同一正则 | 正常 |
| 工具注册 | `index.js:439-469` `toolsCtx.tools.register(createStatusTool(...))`；工具含 `parameters`、`output.schema`、`output.render`、`execute` | `@deepseek-ai/dsh-tools lib/index.js:433`、`:436`；JSON Schema 关键字白名单见 `lib/shared-DTdn5dXO.js:220`（`type/oneOf/properties/required/additionalProperties/items/enum/const` + 注解），插件用法在白名单内 | 正常 |
| 工具自检读数 | `toolsCtx.tools.schemas().map(s=>s.name).filter(startsWith('mcp__figma__'))`（`index.js:445-450`） | `@deepseek-ai/dsh-tools lib/index.js:589`、`:477` | 正常（作用域风险见 FG-03） |
| 注入了两次 `ctx.inject` | `index.js:354` `export const inject = ['systemPrompt']`，其余走 `ctx.inject([...])` | `@deepseek-ai/cordis lib/index.js:1672`（`inject(inject, callback)`，回调收到派生 ctx）、`:463`（`effect`）、`:1347`（`get` 无注入可读，缺失返回 `undefined`） | 正常 |
| 版本闸门 | `engines.dsh: ">=0.2.1-rc.5 <0.3.0"` | `@deepseek-ai/dsh-app-boot lib/index.js:1094`（`includePrerelease:true`） | 正常 |
| 依赖的外部 OAuth 客户端配置键 | README/profile 写 `clientName`、`callbackPath`、`tokenEndpointAuthMethod` | `@vontean/dsh-oauth-mcp-client@0.1.0 lib/index.js:30-41` 的 `Config` **只接受** `serverName/url/credentialRef/scope/headers/callbackPort/authorizationTimeoutMs/toolCallTimeoutMs/failOnStartupError/reconnect` | 已失效（外部依赖，见 FG-05） |

### 发现列表

| 编号 | 插件 | 失效时的用户可见现象 | 依赖的锚点原文 | DSH 侧证据（包名 文件:行） | 判定 | 建议加固方向 |
| --- | --- | --- | --- | --- | --- | --- |
| FG-01 | vt-use-figma | 模型还是会凭记忆描述 Figma 文件、用截图猜设计，跳过"先建会话、先加载技能" | 整段路由手册 `ROUTING_TEXT`，经 `ctx.systemPrompt.section({name:'figma:routing', interpolate:false, text})` 注入（`index.js:69-88`、`:391-404`） | `@deepseek-ai/dsh-system-prompt lib/index.js:255`（`section()` 接受 `{name,order,interpolate,text}`）、`:264`（`getSectionOrder`）、`:38`（`MCP_SERVERS: 3100`）、`:120`（`interpolate:false` 时不做 `{{}}` 替换）。本会话系统提示里确实存在该段 | 正常 | 无需改动 |
| FG-02 | vt-use-figma | 技能目录里看不到 `figma-*`；或名字对但正文读不出来、`references/` 相对路径解析不到 | `{ name, description, source:'custom', provider:'dsh-vt-use-figma', rank:300, locator:file, path:file, resourceBase:{kind:'directory',path:directory}, invocation:{modelInvocable,userInvocable} }`（`index.js:331-341`） | `@deepseek-ai/dsh-skill lib/index.js:452-463` 逐字段校验；`:75` 用 `resourceBase.path` 生成"Base directory for this skill"提示；`:19` 名字文法；`@deepseek-ai/dsh-skill-filesystem lib/index.js:22` 的 300 是官方 custom 档位 | 正常 | 无需改动 |
| FG-03 | vt-use-figma | `figma_status` 报 `mcpConnected:false`、`figmaTools:[]`，模型据此说"这个会话没连上 Figma" | `figmaTools = toolsCtx.tools.schemas().map(s=>s.name).filter(n=>n.startsWith('mcp__figma__'))`（`index.js:445-450`） | `@deepseek-ai/dsh-tools lib/index.js:589` 省略 scope 时为全局视图；`:477` 只合并全局与祖先层。Figma 连接若挂在某个 Agent 作用域，全局视图看不到 | 脆弱 | 自检改为读当前 Agent 作用域；或在读不到时回退到"路由段声明的连接状态"，别把"全局视图为空"等同于"没连上" |
| FG-04 | vt-use-figma | 技能出现但描述为空被跳过，或描述只剩半个句子，模型据此选错技能 | `parseFrontmatter` 只取 `key: value` 单行，**有意忽略续行**（`index.js:55-58`、`:147-158`），注释写明"16 个技能的 description 都是单行，最长 975 字符" | 现状核验：`~/.codex/plugins/cache/openai-curated-remote/figma/17.0.0/skills/*/SKILL.md` 共 16 个，`description:` 全部为单行，`name:` 全部符合 kebab 文法。假设今天成立，但没有任何机制保证 Figma 不改用 YAML 折叠块写法 | 脆弱 | 解析器至少识别折叠块写法（`description` 后跟 `>` 或竖线）并在遇到时降级为"整块拼接"，或直接引 `yaml` 解析 frontmatter |
| FG-05 | vt-use-figma | 首次连接或**重新授权** Figma 时，浏览器授权回来仍没有 Figma 工具；按 README 的"依赖版本提醒"自己的说法，表现就是 DCR 阶段 403。改 `clientName`/`callbackPath` 也不起作用 | README「一、配置远程 Figma MCP」（`README.md:44-58`）写 `clientName: GitHub Copilot CLI`、`callbackPath: /`、`tokenEndpointAuthMethod: client_secret_post`；`README.md:73-75` 自述"本机验证过的构建其活 schema 里已有这三项" | 外部依赖：`@vontean/dsh-oauth-mcp-client@0.1.0 lib/index.js:30-41` 的 `Config` 只列 `serverName/url/credentialRef/scope/headers/callbackPort/authorizationTimeoutMs/toolCallTimeoutMs/failOnStartupError/reconnect`，**没有这三个键**；`lib/oauth.js:8` 硬编码 `CALLBACK_PATH='/oauth/callback'`、`:70-78` 硬编码 `token_endpoint_auth_method:'none'` 与 `client_name:'DeepSeek Harness MCP OAuth (figma)'`。`callbackPort` 反而被接受（`:36`），所以只有"固定端口"这一条生效。README 那句话在源码检出 `~/.dsh/plugins/dsh-oauth-mcp-client` 上成立，在 profile 实装的那份上不成立 | 已失效（外部依赖构建差异，非 DSH API 变化） | 把 profile 依赖对齐到支持这三个键的构建（本机已有一份源码检出），或改用 Figma 官方允许的客户端形态；README 那句"本机验证过的构建已有"要写明是哪一份、怎么核对 |
| FG-06 | vt-use-figma | 用户照 README 抄 profile 配置，重启后提示找不到包，Figma 连接根本没挂上 | `README.md:48`：`name: "@dsh-external/dsh-oauth-mcp-client"` | profile 实装与 `~/.dsh/profiles/desktop/package.json` 的依赖都是 `@vontean/dsh-oauth-mcp-client`；本机不存在名为 `@dsh-external/dsh-oauth-mcp-client` 的包 | 语义变化（文档与实装不一致） | 把 README 的包名统一成 `@vontean/dsh-oauth-mcp-client`，并注明"这是外部插件，不在本仓库" |
| FG-07 | vt-use-figma | 技能缓存换版本后仍加载旧版本，或两个 marketplace 缓存选错 | `resolveSkillSource` 扫 `<codexHome>/plugins/cache/<marketplace>/figma/<build>/`，按 `.codex-plugin/plugin.json` 的 `version` 取最高（`index.js:240-265`） | 现状核验：`openai-curated-remote/figma/17.0.0`（version `17.0.0`）与 `openai-curated/figma/1e285826`（version `2.0.20`），插件选中 `17.0.0`，与系统提示里的"来源 openai-curated-remote@17.0.0"一致 | 正常 | 无需改动；`compareVersions` 只做数字段比较，遇到 `17.0.0-beta` 这类版本会被 `VERSION_RE` 挡掉并跳过该构建，可接受但值得写进注释 |

---

## 环境依赖风险

这一节只讲"机器上有没有、连没连上"，与上面的代码契约结论分开看。

### 1. MineDesign：已安装、已连接、有打开的作品

| 事实 | 证据 |
| --- | --- |
| 数据目录存在，作品目录指向 `/Users/mac/MineDesign` | `~/.minedesign/install.json` → `{"workspace":"/Users/mac/MineDesign"}` |
| CLI 全局安装，`dist/cli.mjs` 与 `bin/mdn.mjs` 都在 | `/Users/mac/.nvm/versions/node/v22.22.0/lib/node_modules/@vontean/minedesign/dist/cli.mjs` |
| MCP 子进程与工具数量正常 | 会话里可见 15 个 `mcp__minedesign__*` 工具，与 README 的"15 个"一致 |
| 面板通道确实在供数 | 实测 `GET /vt-minedesign/sessions` 返回 `200`，`editors` 里有 `/Users/mac/MineDesign/tplink-eb431v`（`kind: design-system`） |

风险提示：面板的 `editorUrl` 与伴生应用地址只在本次进程存活期内有效，DSH 重启会换端口。这是设计如此，不是缺陷；但它意味着"面板里打开的作品"在重启后必然显示旧地址，需要模型重新 `minedesign_open_document`。

### 2. Figma：当前连上了，但**重新授权**这条准备路径是断的

| 事实 | 证据 |
| --- | --- |
| 远程 Figma MCP 当前可用 | 会话里可见 `mcp__figma__*` 全套工具 |
| 能连上靠的是已存凭证，不是本次授权 | `~/.dsh/.credentials.yaml` 里有 `DSH_MCP_OAUTH_FIGMA` 这条 ref |
| 首次/重新授权所需的三个键在实装构建里不存在 | `@vontean/dsh-oauth-mcp-client@0.1.0` 的 `Config`（`lib/index.js:30-41`）无 `clientName`/`callbackPath`/`tokenEndpointAuthMethod`；`lib/oauth.js:8` 硬编码 `CALLBACK_PATH='/oauth/callback'`，`:70-78` 硬编码 `token_endpoint_auth_method:'none'` 与 `client_name:'DeepSeek Harness MCP OAuth (figma)'`。只有 `callbackPort` 被接受（`lib/index.js:36`） |
| 默认行为与外层预期相反 | 该客户端 `failOnStartupError` 默认 `true`（`lib/index.js:39`），而内置 `@deepseek-ai/dsh-mcp-client` 默认 `false`（`lib/index.js:789`）。profile 里显式写了 `false`，所以当前不受影响，但它意味着"连接失败会阻塞启动"是这里的默认值 |
| Figma 技能目录正常 | `~/.codex/plugins/cache/openai-curated-remote/figma/17.0.0/skills/` 共 16 个 `figma-*` 技能 |

后果：**令牌一旦过期、被撤销、换机器或清除凭证，Figma 连接就恢复不了**——因为客户端发出去的 `redirect_uri`、`client_name`、`token_endpoint_auth_method` 都还是旧形态，而 Figma 对动态客户端注册做白名单校验。用户看到的现象是"浏览器授权完回来还是没有 Figma 工具"，这也正是 `README.md:73-75` 自己预告的 DCR 403。

需要说清的是：README **没有隐瞒**这个风险，它写了"如果你的版本忽略它们，表现就是 DCR 阶段 403"。问题在于同一段还断言"本机验证过的构建其活 schema 里已有这三项"——这句话对源码检出 `~/.dsh/plugins/dsh-oauth-mcp-client` 成立，对 profile 实际加载的 `node_modules/@vontean/dsh-oauth-mcp-client` 不成立。两个同版本号（都是 `0.1.0`）但内容不同的构建同时存在于本机，是这个坑的真正来源。

### 3. 相邻事实：`oauth-mcp-web-manager` 的 fiber 失败

profile 里 `include:oauth-mcp-web-manager`（`@vontean/dsh-oauth-mcp-client/web-manager`）当前 `fiberPhase: failed`，诊断是「cannot get property "webServer" without inject」。

与本任务两个插件的关系：

- **vt-use-figma 不受它影响**：它只用 `mcp__figma__*` 工具，不吃 web-manager 这条入口。
- **影响面在"连接管理界面"**：设置页里那条"添加并登录 MCP 连接"的路径会失效，用户无法从界面里新增/重授权连接，只能改 profile 文件再重启。
- 已安装的 `web-manager.js` 只声明 `inject = ['connection']`，包内也搜不到 `webServer` 字样，说明这条诊断来自另一个构建（源码检出版本与本机实装版本不一致）。这属于该插件自身的版本/构建问题，建议单独跟进。

---

## 小结（按严重度排序）

**严重：会让用户"看得见但用不了"的，是 Figma 的重新授权路径。**

- **FG-05 + 环境依赖 §2**：profile 实装的 `@vontean/dsh-oauth-mcp-client@0.1.0` 不接受 `clientName`/`callbackPath`/`tokenEndpointAuthMethod`，而 Figma 连接正依赖这三个键。当前能工作纯粹因为 `DSH_MCP_OAUTH_FIGMA` 凭证已存；令牌一过期就要重新授权，那时会撞上 README 自己预告的 DCR 403。本机另有一份**同版本号但支持这三个键**的源码检出，说明这是"构建没对齐"，不是"功能没做"。

**其次：安全一致性。**

- **MD-05**：`/vt-minedesign/sessions` 用插件自己的 `isTrusted`（Host 是 loopback 且无 Origin 即放行）替代宿主权威准入 `connection.requestRejection`。实测该路由对本机无身份请求返回 `200`，且同一个 handler 接受 `POST` 向会话注入消息。其余四个同类插件路由都返回 `403`，说明这是**不一致**，不是平台能力缺失。

**再次：作用域与文档，当前只是没被触发。**

- **MD-06 / FG-03**：两个插件的自检工具都用 `tools.schemas()` 的全局视图判断"MCP 连上了没有"。一旦 MCP 客户端挂到 agent 作用域，自检会误报"没连上"，模型于是拒绝工作。
- **MD-04**：右栏引导项缺 `id`/`commandId`。单条能过，加第二条就会让整个 tab 类型注册抛错、面板消失。
- **FG-06**：README 写的包名 `@dsh-external/dsh-oauth-mcp-client` 与实装 `@vontean/dsh-oauth-mcp-client` 不一致，照抄装不上。
- **FG-04**：技能 frontmatter 解析器只认单行 `description`，当前 16 个技能都满足，但没有任何机制保证 Figma 不改格式。

**正常（无需处理）**：MD-01/02/03/07、FG-01/02/07。两个插件的核心链路——系统提示注入、技能 provider、工具注册、结果投影、HTTP 路由、会话投递、右栏面板插槽与语言包——在 `0.2.2-rc.1` 上都逐字段对得上，包括最容易被怀疑的 `dsh-mcp-client` 配置 schema（`serverName/transport/command/args/env/toolCallTimeoutMs/failOnStartupError` 全部仍在，另有可选的 `cwd`/`maxInstructionBytes`/`reconnect`）。

**一个容易误判的点**：两个插件的 `engines.dsh` 写的是 `>=0.2.1-rc.5 <0.3.0`，按普通 semver 直觉 `0.2.2-rc.1` 不在范围内；但 DSH 的闸门用了 `includePrerelease: true`（`@deepseek-ai/dsh-app-boot lib/index.js:1094`），实际是放行的。不要据此认为插件已被版本闸门拒绝。
