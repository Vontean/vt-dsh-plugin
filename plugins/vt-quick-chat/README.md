# 快捷提问（dsh-vt-quick-chat）

agent 正在跑任务时，看到一个不懂的词：按一个快捷键，在当前界面上弹出一个**临时小窗**，
借用你选中的那一小段文字解释概念。**不创建 Session、不写 session log、不调用 agent 工具、不进侧栏**；
关掉小窗，主任务原样继续。

## 它做了什么

- **随时可开**：Desktop `⌘⌥N`（Windows/Linux `Ctrl+Alt+N`）。Web 端不提供入口。
  输入框自动聚焦，打开前的主界面焦点在关闭后归还。
- **非模态浮层**：挂在 DSH 的根级 `shell.overlay` 上，不替换主对话、主输入框或侧栏。
  小窗打开时仍可继续操作主界面；`Esc` 只在小窗内生效。
- **紧凑 / 展开两态**：默认是一条 48px 输入条；发送后展开成完整对话，可收起回输入条。
- **流式回答**：Host 直连 DeepSeek Messages API（`deepseek-flash`），浏览器按 SSE 增量渲染；
  可随时停止，已生成的部分会保留。失败时显示可读错误与「重试」。
- **输入区就是能力面板**：宽度 420px，一条 48px 的输入条里从左到右是
  附件、输入框、深度思考胶囊、联网胶囊、发送。开关都在提问之前就能设好，
  不必先展开窗口。
- **对话状态行**：一旦有了对话，输入条上方多出一条 36px 的状态行，左边是本次对话的标题
  （取第一条问题，单行省略），右边是新话题、历史、展开/收起、关闭。展开态里它同时就是
  窗口的 header，所以两态的标题与按钮永远一致；没有对话时这条行不出现。
- **联网**：默认关闭。打开后本次提问会声明 `deepseek_web_search` 与
  `deepseek_read_url`，搜索与读链接都在 DeepSeek 服务端完成，行为与网页端一致；
  回答会带引用来源，底部显示本轮计费的搜索/抓取次数。
- **深度思考**：默认关闭。打开后请求带 `thinking`，配合联网会升级成官方的
  「深度思考搜索」；回答前会显示「正在深度思考…」，思考内容不显示也不进历史。
- **附件**：回形针按钮上传 PDF、Word、PPT、图片与文本，单个不超过 30 MiB。
  文件走 DeepSeek Files API 解析，返回 `file_id` 后按 document / image 块引用；
  chip 显示上传中与失败状态，可逐个移除。
- **借用选中文字**：打开时读取当前选中文本，作为一条和附件同款的 chip（T 图标 + 文本 + ×，可移除）；
  按键导致选区折叠时，会回退到 5 秒内的最近选区。想换引用就关掉重开，输入区不再放多余的按钮；
  没有选中文字时不显示 chip。
- **设置页**：DSH「设置 → 快捷提问」里可以改系统提示词（可恢复默认）、指定模型，
  以及设定联网/深度思考的默认开关。数据存在 `~/.dsh/vt-quick-chat/settings.json`。
- **本地历史**：最近 30 个临时对话存在本机 `localStorage`，可恢复、单条删除、清空全部。
  超过 30 个时自动丢掉最旧的一条；历史只在本机浏览器里，不上传、不跨设备同步。
- **解释用 Markdown**：支持短段落、标题、列表、引用、行内代码、围栏代码块与 https 链接。
- **只用 DSH 的视觉体系**：颜色/圆角/阴影全部走 `--dsw-*` / `--dsh-*` token，
  图标来自 `@deepseek-ai/dsh-client-ui-primitives` 的 `ICON_SYMBOLS` 组件，只有
  「深度思考」按 DeepSeek 网页端自绘（DSH 图标库里没有原子形），规格与 DSH 图标一致；
  字号跟随用户设置的正文大小，浅色/深色都适配，`prefers-reduced-motion` 下关闭动效。

## 它明确不做的事

| 不做 | 原因 |
|---|---|
| 不创建 Session、不写 session log、不生成标题 | 临时提问不应该污染侧栏与历史 |
| 不进入侧栏、不进入「最近会话」 | 关掉即走 |
| 不调用任何 agent 工具、不读写工作区文件、不执行命令 | 小窗只解释，不行动 |
| 不替换主输入框、不接管主对话发送链路 | 主任务不被中断 |
| 不做语音输入、语音朗读 | 先把文字问答做稳 |
| 联网默认关闭 | 搜索 5 元/千次、抓取 5 元/千次，不该在用户不知情时计费 |

## 快捷键

| 平台 | 默认键位 |
|---|---|
| macOS Desktop | `⌘⌥N` |
| Windows Desktop | `Ctrl+Alt+N` |
| Linux Desktop | `Ctrl+Alt+N` |
| Web | 不提供。见下方说明 |

**这个插件面向 Desktop。** Web 端不注册默认键位，原因是两个组合都被占了：

- DSH 的 `session.new` 在 Web 上已占用 `Mod+Alt+N`（桌面端它是 `Mod+N`）；
- `Mod+Shift+N` 是 Chrome/Edge「无痕窗口」的浏览器保留键，网页收不到事件。

缺少 `web:*` 默认值时 DSH 视为「未绑定」，不会报错，也不会占用任何 Web 快捷键。
如果你想在 Web 上试用，可以在「快捷键」设置里手动给它指定一个空闲组合，
但它不在支持范围内。

可以在 DSH 的「快捷键」设置里改成别的组合；命令名是「快捷提问」（`quickChat.toggle`）。

再按一次快捷键会关闭小窗。关闭会丢弃未发送草稿与选中引用；已发送的对话留在本地历史。

## 安装

插件装进某个 profile 后**必须重启 dsh**，刷新页面不生效。

### 插件市场（推荐，有更新提示）

在「插件 → 发现 → 添加索引源」里填入市场索引地址：

```
https://vontean.github.io/vt-dsh-plugin/index.json
```

第一次使用要先在插件页开启 **Custom plugin markets**。添加后搜索「快捷提问」安装。

### npm

```bash
dsh plugin --profile <profile> add dsh-vt-quick-chat@1.1.2
```

npm 通道要等该版本真的发布到 npm 之后可用（用 `npm view dsh-vt-quick-chat@1.1.2` 能查到即可）。

### Release tarball

到 [Releases](https://github.com/Vontean/vt-dsh-plugin/releases) 下载
`dsh-vt-quick-chat-1.1.2.tgz`，然后：

```bash
dsh plugin --profile <profile> add /绝对路径/dsh-vt-quick-chat-1.1.2.tgz
```

## 支持的 DSH 版本

`engines.dsh` 为 `>=0.2.1-rc.5 <0.3.0`。超出范围时 DSH 会在加载前拒绝该插件，
不会带着不兼容的代码跑起来。插件依赖 DSH 的四处实现细节：`shell.overlay` 的 list 槽位、
`ctx.shortcuts.register` 的 profile 默认值、`ctx.llm.stream()` 的 chunk 协议、
`ctx.agentDefaultModel.currentSelection()`、`deepseekAccount.resolveToken()` 与
`x-dsh-auth-token` 请求头。大版本升级后通常需要跟进。

## 模型与凭证

- 主通道是 DeepSeek：模型固定 `deepseek-flash`（官方要求联网工具用这个模型）。
- 凭证解析顺序：**DeepSeek 账号授权**（`deepseekAccount.resolveToken`，走账号余额）→
  **`DEEPSEEK_API_KEY`**（走 API Key 余额）→ 都没有时退回 DSH 默认模型
  （`agentDefaultModel.currentSelection()` → 第一个有模型的 provider），此时没有联网能力。
- account token / API Key **只在 Host 半边**使用；浏览器只拿同源路由的 SSE 文本。
- 临时提问的内容会发送给当前 provider；UI 上没有额外的「已上传」提示，因为这是模型的
  正常工作方式。不要在小窗里粘贴密钥或敏感数据。
- 关闭联网时，回答只来自模型自身知识，可能过时；需要最新资料时点一下地球图标。
- 联网的计费：文字搜索 5 元/千次、网页抓取 5 元/千次，按查询词与成功抓取的网页数计算。
  小窗只在回答结束后显示次数，不预估金额。

## 安全边界

- 插件代码在**用户进程内**运行，没有沙箱，也没有额外的权限边界。
- Host 半侧只注册一个同源路由 `/vt-quick-chat/api/chat`：
  - 每个请求都过 `connection.requestRejection`（与内置 `/api` 同一套 Host/Origin 与鉴权判定）；
  - 只接受 `messages`（最多 40 条、单条 16k 字符）、`selection`（最多 8k 字符）、
    `web` / `deepThink` 布尔值，以及 user 消息上的 `files`（最多 6 个 `file-api-` id），
    请求体上限 512 KiB；
  - 另有一个 `/vt-quick-chat/api/upload`：只接收原始字节 + `x-filename`，
    按扩展名映射解析方式后转发到 DeepSeek Files API，单文件上限 30 MiB，不落盘；
  - assistant 消息可以带服务端工具块，但只放行 `text` / `server_tool_use` /
    `web_search_tool_result` / `web_fetch_tool_result` 四种类型，单条上限 96 KiB；
  - 不接受任意 provider / model / URL / 文件路径 / 工具名；
  - **不传 `sessionId`、不经过 agent loop**，因此不会创建 Session、不会写 session log；
    声明的是 DeepSeek 的服务端工具（服务端执行），不是 DSH 的 agent 工具。
- Client 半侧只读取当前选中文本、发一个同源 POST、把历史写进 `localStorage`。
- 除 DeepSeek 官方 API（`api.deepseek.com`）外不发起外部请求；不上传遥测、不写系统文件。

## 已知限制

- 只带「选中文字」这一点上下文，不带主对话的最后几轮。需要更多背景时，
  先把关键段落选中再打开小窗。
- 读过的网页靠 `signature` 在下一轮恢复；本地历史被清空或换了浏览器后，
  之前读过的网页不再进入上下文（请求仍可正常执行）。
- 关闭小窗会 abort 正在生成的回答（与「临时问题」的定位一致）；已生成的部分会留在历史里。
- 本地历史是明文 `localStorage`；共享电脑上请注意。可在历史面板「清空全部」。
- 没有拖拽位置、没有多窗口、没有语音/文件/图片输入。
- 浮层锚定在主内容区右下角、主输入框上方 96px；窄窗口下会自动收窄到可视宽度。
- Web 端没有快捷键入口；这是有意为之，原因见「快捷键」。

## 开发

- 设计说明：[DESIGN.md](./DESIGN.md)（架构、状态机、模型解析、验证计划）
- 研究笔记：[docs/research/](./docs/research/)（DeepSeek 应用 API、Codex Quick Chat、DSH 方案）
- 目录约定：[../../docs/plugin-conventions.md](../../docs/plugin-conventions.md)
- 测试：`node --test test/*.test.mjs`（Host 纯函数 + DeepSeek 通道 + Host 路由端到端 + Client 控制器/SSE/Markdown）
- 自检：`node --check index.js`、`node --check client.js`、
  `node scripts/check-client-bundles.mjs`、`pnpm market`
