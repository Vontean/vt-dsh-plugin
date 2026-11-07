# dsh-vt-minedesign

把本机已装的 **MineDesign** 接进 DeepSeek Harness：模型用它的 15 个本地 MCP 工具和两个设计技能
做设计稿，你在**右侧栏的 MineDesign 面板**里看和改——面板里是 MineDesign 的完整应用，
不是一页孤零零的编辑器。

> 本插件是 host + web 双半边。host 半边注册工具、技能、结果投影和面板通道；web 半边注册
> 右侧栏的 tab 类型，把伴生应用框进面板。

## 它给你带来什么

- **面板 = MineDesign 完整应用。** 右侧栏入口列表里有 MineDesign，点开是应用本体：文档切换、
  缩放、撤销/重做、播放、属性/微调/评论侧栏都在。模型打开作品时面板自动切过去；页面刚加载时
  不弹，刷新页面也不弹旧作品。
- **15 个 MCP 工具**（`mcp__minedesign__*`）：打开作品、校验作品、读外部改动与标注、改设置等。
  真机核对 15 个，以上游版本为准。
- **两个技能**：`minedesign-design`（做设计稿）、`minedesign-design-system`（做设计系统）。
  正文在运行期从你装的 MineDesign 里只读读取，内存里追加一段 DSH 适配；不复制、不落盘、不改上游。
- **结果投影。** MineDesign 把编辑器地址、标注、事件放在 MCP 的 `structuredContent` 里，而 DSH 的
  MCP 客户端不把它交给模型。本插件在 `tools/post-execute` 把它投影成模型可见文本——没有这层，
  模型看不到编辑器地址，整条闭环断在最后一步。

### 为什么有两个 MineDesign 进程

完整应用在 `http://127.0.0.1:<port>/app/<token>/`，token 每个进程随机，只有 `mdn` 的**非 MCP
模式**会把它打印出来。所以：

- **MCP 子进程**（`mdn mcp`）给模型用，提供 15 个工具；
- **伴生应用**（`mdn`，非 MCP 模式）给你看，提供面板里的完整界面。

两个进程读同一个作品目录，文档 id 按 `hash(kind:path)` 生成，因此标注与文件保持共享。
**agent 的读写只走 MCP 工具与 DSH 文件工具**，伴生应用只作为你的编辑面。

## 前置条件

| 需要 | 说明 |
|---|---|
| DSH | 以 `package.json` 的 `engines.dsh` 为准（当前 `>=0.2.1-rc.5 <0.3.0`） |
| Node.js | `>=20`（两个子进程都用它跑） |
| MineDesign 本体 | 先装：`npx @vontean/minedesign plugin install`。本插件不下载、不安装它 |
| 右侧栏 | 面板需要带右侧栏的 Web 界面。无头部署没有 `webServer`，面板不出现，其余能力照常 |

## 安装

1. 装 MineDesign 本体：`npx @vontean/minedesign plugin install`（`mdn plugin install` 等价）。
2. 装本插件，三条通道任选：

**市场索引。** 在「插件 → 发现 → 添加索引源」填 `https://vontean.github.io/vt-dsh-plugin/index.json`，
在「工作流与提示词」分类里找到「MineDesign 设计稿」点安装。

**npm。** 该版本发布到 npm 之后：`dsh plugin --profile <profile> add dsh-vt-minedesign@1.0.1`

**本地 link。** profile 的 `dependencies` 写 `"dsh-vt-minedesign": "link:<workspace>/plugins/vt-minedesign"`，
再把包名加进 `dsh.profile.bundles`；`pnpm install` 后重启 DSH。

装完**必须重启 DSH**：MCP 子进程、工具注册、web 半边的 tab 类型都在启动时完成。

## 生效自查

1. 右侧栏入口列表里出现 MineDesign（带图标）。
2. 会话里调 `minedesign_status`：`install.ok: true`（带 `version` 与 `origin`）、
   `mcpConnected: true` 且 `tools` 非空、`skills.count: 2`、`hints: []`。

## 编辑器闭环

1. 模型写作品（`canvas.json` + 每块画板一个 `.dc.html`），跑 `design_check` 到零问题。
2. 调 `minedesign_open_document`（`kind` 取 `design` 或 `design-system`）。
3. 右侧栏面板自动出现，里面是完整应用，直接改。
4. 改完发标注或点应用里的 `Send to chat`，模型用 `minedesign_events` 读回来，不需要你复制粘贴。

面板不可用时（无头、`panel: false`、或旧版本），工具结果里仍有
`当前打开：<title> — <editorUrl>（id <documentId>）`，其中的 `editorUrl` 可作为 Markdown 链接打开。

## 配置

写在 profile 的插件配置里，全部可选。键与默认值以 `src/config.js` 为准：

| 键 | 默认 | 作用 |
|---|---|---|
| `routing` | `true` | 注册系统提示里的 MineDesign 路由段 |
| `skills` | `true` | 暴露两个设计技能 |
| `projection` | `true` | 投影 `mcp__minedesign__*` 的结果（关掉后模型看不到编辑器地址） |
| `panel` | `true` | 注册右侧栏面板与面板通道 |
| `autoOpen` | `true` | 新作品出现时自动打开面板 |
| `entryButton` | `true` | 在会话头部放 MineDesign 快捷键 |
| `skillPrefix` | `'minedesign-'` | 技能名前缀；设 `''` 用上游原名 `design` / `design-system` |
| `skillsDir` | `null` | 显式指定技能目录 |
| `workspace` | `null` | 显式指定作品目录 |
| `launch` | `null` | `{ command, args }` 覆盖启动规格，排查用 |

另有三个环境变量对解析器与启动器生效：`MINEDESIGN_HOME`（数据目录，默认 `~/.minedesign`）、
`MINEDESIGN_WORKSPACE`（作品目录）、`MINEDESIGN_CLI`（直接指向 `mdn.mjs` / `dist/cli.mjs`）。

## 排障

### 面板停在「正在连接作品」

应用被 iframe 嵌进去时一定走 MCP Apps 协议：先发 `ui/initialize` 等宿主应答，之后用 `tools/call`
调工具。面板正常情况下会应答这条握手。停在这里说明宿主这一侧没接上：`panel: false`、无头部署
没有 `webServer`、或 web 半边没随新版加载（没重启）。先看 `minedesign_status`，再看面板是否显示
「面板数据通道不可用」。

### 「Send to chat」发不出去

面板把 `ui/message` 转成 `POST {action:'message', sessionId, text}`，宿主再用
`sessionController.prompt` 投递到你当前会话。失败原因记在面板快照的 `delivery` 里：

```bash
curl -s http://127.0.0.1:<dsh-port>/vt-minedesign/sessions | python3 -m json.tool | grep -A4 delivery
```

`attempts: 0` 表示请求没到宿主（面板侧问题）；`attempts` 非 0 且 `lastError` 有值则是宿主拒绝
（会话不存在、或投递超时）。修完重开面板再发一次。

### 面板显示「编辑器没能加载出来」

地址过期了。`editorUrl` 与伴生应用地址都只在本次进程存活期内有效，DSH 重启会换端口。
让模型重新 `minedesign_open_document`，或点面板里的「重新打开」。

### 右侧栏找不到 MineDesign

按顺序查：插件已启用且**重启过** DSH → 这个 profile 有 `webServer`（无头没有）→ 没设 `panel: false`。

### 面板显示「面板数据通道不可用」

host 侧没注册面板通道：`panel: false`、无头部署、或旧版本。此时回到「编辑器闭环」里的次要路径，
工具结果里的 `editorUrl` 仍然可用。

### 工具没出现，但技能在

bundle patch 里的 `!!js` 没求值成功，MCP 条目没挂上。`minedesign_status` 的 `hints` 里有一份
**填好本机真实路径、可直接粘贴**的 `cordis.patch.yml` 条目：替换 `id: mcp-minedesign` 那一条，
重启 DSH。

## 安全边界

- host 半边在你的进程内运行，没有沙箱；它能读你机器上的文件、能起子进程。只安装你信任的来源。
- 它**只读**已装的 MineDesign：技能正文调用时才读，不复制、不落盘、不写 `~/.minedesign`。
- 面板通道是一条本地路由：`GET` 返回会话快照；两个 `POST` 分别是工具桥（`{tool, args}`）与
  `Send to chat`（`{action:'message'}`）。路由要求 Host 必须是 loopback、带 Origin 时必须同源；
  `POST` 体上限 256 KiB，响应上限 64 KiB。
- 面板用 iframe 加载伴生应用地址；本插件不往那个 iframe 注入脚本，也不读它的内容。
- 伴生应用的 `/app/<token>/` 是一次性能力地址，不要贴到公开渠道；换机器或重启后失效。
- 无遥测。除了访问本机 `127.0.0.1` 上的伴生应用，本插件不发起网络请求。

## 开发

改这个插件先读 [DESIGN.md](DESIGN.md)：模块与接口、三条不变量、深模块原则、否掉的方案、
降级策略、决策记录。硬约束与自检命令见 [AGENTS.md](AGENTS.md)；图标与上游内容的来源见
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

许可：[MIT](LICENSE)。
