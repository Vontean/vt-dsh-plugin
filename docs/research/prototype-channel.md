# 对话流内「可交互原型」通道：外部实现调研

> 调研对象：Claude Artifacts / MCP Apps（SEP-1865）与 mcp-ui / ChatGPT Canvas 与 Apps SDK / Codex Sites 与插件生态 / 开源实现 assistant-ui `with-artifacts`。
> 调研日期：**2026-11-21**。文内所有版本号、日期均为该日实际抓取到的页面状态；页面会变，引用时请带上抓取日期。
> 目标：为「DSH 插件要不要做、怎么做对话流内可交互原型」提供可比对的外部事实，重点回答三件事——**渲染通道（A/B/C）、交互结果如何回到模型、隔离与信任边界**。
> 作用范围：只回答外部实现与取舍；不评价本仓库 `dsh-vt-gen-ui` 的实现细节（仅作为对照基线，见 §7）。
> 证据约定：每条结论给 **链接 + 原文片段（英文原样）+ 出处日期**。官方文档为一手证据；逆向系统提示、厂商博客、媒体转述为二手，单独标注。
> 可信度标注：`[一手]` 官方文档/规范/仓库源码；`[二手]` 逆向、访谈、媒体；`[未验证]` 抓不到或说法冲突。

---

## 0. 结论先行

1. **对话流内跑任意 HTML/JS 已是行业标准做法，但 2026 年的标准答案不是「Claude Artifacts」，而是 MCP Apps（SEP-1865）。** 该扩展于 **2026-01-26 转 Stable**，用 `ui://` 资源 + 沙箱 iframe + `postMessage` 上的 JSON-RPC 桥；OpenAI 官方文档已声明 ChatGPT 同时支持 MCP Apps 与自家 extensions，并把 `window.openai` 贬为 legacy `[一手]`。→ 若 DSH 要做 B 形态（任意 HTML），**照 MCP Apps 的桥与 CSP 模型做**，不要自创协议。
2. **B 形态的桥已经不满足于「回传一条用户消息」。** MCP Apps 有三个语义不同的回传通道：`ui/message`（进对话、触发展开一轮）、`ui/update-model-context`（只更新模型上下文，不占对话气泡）、`tools/call`（走工具调用）。我们的 `[genui-action]` 只实现了第一种，且是用户消息形态。`[一手]`
3. **C 形态（写文件 + 预览）在 Claude Code 里已产品化，但「把结果带回会话」官方只给到「复制文本回终端」。** 这不是没做，是刻意不做自动回传 `[一手]`。代价是每次迭代多一次人工粘贴。
4. **Codex 侧确实有官方内置的对话内 UI——`Visualize`（可视化），但它是「B 形态 + 强渲染约束」，且不在 CLI/IDE 生效。** 官方文档《Visualizations》写明它把问题变成 "charts, maps, diagrams, calculators, simulations, and interactive explanations"，在 ChatGPT 聊天气泡里渲染，用 `@Visualize` 唤起；可用面是 **ChatGPT web / 桌面 / 移动的 chat**，Codex CLI 与 IDE 扩展明确"Visualization rendering isn't supported" `[一手]`。三件事必须分开：①**Visualize**＝官方内置、对话内、模型现写 HTML；②**Sites**＝官方托管运行时（D1/R2 + 公开 URL + 计费），不是对话内嵌；③**MagicPath 等**＝第三方画布插件。`[一手]`
   > 更正记录：本文 2026-11-21 首版曾断言"Codex 没有对话内官方交互式 UI 原语"，该结论有误，已按本节与 §4 重写。
5. **对 DSH 的判断**：A 形态（白名单 JSON，无 iframe）在**信任边界**上仍是最强的一档（模型无法注入任意脚本），短板只在表达力和「结果回传语义」。最划算的增量不是换成 iframe，而是**补 `update-model-context` 式的静默回传**与 **iframe 逃生舱（B）作为可选通道**。
   **那 Visualize 这套「B + 强约束」是否说明 A 做原型不够用？我的判断是：不能这么推。** 它恰恰是把 B 的自由度（全屏布局、内部滚动、固定工具栏）压回到接近 A 的可预测性；官方自己把"能真跑流程"分流给了 Sites，Visualize 明说是快照。A 真正不够用的是**「一次性视觉表达/排版主张」**（两种方案并排对比、信息架构差异），不是**「交互能力」**。完整论证见 §5.5。
6. **一个必须知道的时间点**：Claude 聊天里的自由 HTML artifact 已停止新建——**2026-09-16 之前的叫 legacy artifacts，"you can't make new ones"**，官方转向模板化（Docs/Slides/Design/Data/Sheets/Whiteboards/Motion）。这提示：**自由生成的 HTML 原型在消费级产品里维护成本高于收益**。`[一手]`

---

## 1. Claude Artifacts

### 1.1 运行方式与隔离

| 事实 | 证据 |
|---|---|
| artifact 在对话右侧独立窗口打开，`Edit / come back / share by link` | `[一手]` "An artifact is anything Claude makes for you that you'd put in front of someone… It opens beside your conversation, and you can edit it, come back to it, and share it with a link." — [support.claude.com/en/articles/17153992](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them)（2026-11-21 抓取） |
| 现在**必须**开启代码执行与文件创建，否则 artifact 不可用 | `[一手]` "Artifacts require Cloud code execution and file creation (called Create and edit files in the updated Settings layout) to be turned on" — 同上 |
| 渲染在**沙箱化 iframe** 里，站点级进程隔离；CSP 限制网络 | `[二手]` Anthropic 团队访谈原话："We use iFrame sandboxes with full-site process isolation… We also use strict Content Security Policies (CSPs) to enforce limited and controlled network access." — 转引自 [simonwillison.net 检索页](https://simonwillison.net/search/?tag=claude-artifacts&tag=anthropic)（2025） |
| 沙箱域是 `*.claudeusercontent.com`（Claude Code 侧文档明确写出） | `[一手]` "The viewer on claude.ai loads each artifact from a sandboxed `*.claudeusercontent.com` origin." — [code.claude.com/docs/en/artifacts](https://code.claude.com/docs/en/artifacts)（文档 `lastModified` 2026-11-21T00:10Z） |

### 1.2 允许的 CDN 与 CSP 边界（这是 A/B 形态最关键的工程参数）

**Claude Code 侧（官方文档，最可信）**：

| 约束 | 原文 |
|---|---|
| 外部脚本只允许 5 个公共 CDN；外部字体只允许 Google Fonts | "The page can load typefaces from Google Fonts, and scripts from five public CDN hosts: cdnjs, unpkg, the Tailwind and jQuery CDNs, and selected paths on jsDelivr such as `/npm/`." |
| 外部图片、其他脚本/样式/字体全被 CSP 拦 | "The CSP blocks every external image and all other external scripts, stylesheets, and fonts, and lets `fetch`, XHR, and WebSocket calls reach only the page's own origin and the Google Fonts hosts." |
| 所以做法是「库从白名单 CDN 取，其余 CSS/JS 内联，图片转 data URI」 | "Claude therefore loads any library the page needs from one of those CDNs, inlines all other CSS and JavaScript, and embeds images as data URIs." |
| 页面不能自己发起下载；要下载得声明 downloads capability | "The page can't start a download itself. To let viewers save a file the page generates, Claude declares the downloads capability." |
| 源文件只接受 `.html/.htm/.md`，UTF-8（或带 BOM 的 LE UTF-16） | "The published file must be `.html`, `.htm`, or `.md`, and must decode as UTF-8, or as little-endian UTF-16 by its byte-order mark." |
| 渲染后大小上限 16 MiB | "The rendered page must be 16 MiB or smaller." |
| 无后端；不能服务多路由 | "An artifact is a static page. It can't authenticate viewers itself." |

来源同上（[code.claude.com/docs/en/artifacts](https://code.claude.com/docs/en/artifacts)，2026-11-21 抓取）。

**Claude 聊天侧（逆向系统提示，二手但更细）**：CDN 白名单为 `cdnjs.cloudflare.com`（首选）、`cdn.jsdelivr.net/npm/`、`unpkg.com`、`cdn.tailwindcss.com`、`code.jquery.com`；样式只允许 `fonts.googleapis.com` + `fonts.gstatic.com`；`esm.sh` 等其它主机一律静默失败。
`[二手]` "the viewer's CSP loads external scripts only from https://cdnjs.cloudflare.com (preferred), https://cdn.jsdelivr.net/npm/, https://unpkg.com, https://cdn.tailwindcss.com … and https://code.jquery.com, and external stylesheets only from https://fonts.googleapis.com …" — [piebald-ai/claude-code-system-prompts](https://github.com/piebald-ai/claude-code-system-prompts/blob/main/system-prompts/tool-description-artifact-page-implementation-requirements-app-wording.md)（该文件提交 2026-11）

> **交叉印证**：官方文档与逆向提示的 5 个脚本主机、Google Fonts、`fetch` 受限三项完全一致 → 白名单本身**可信度高**；差异只在「首选/路径细则」，以官方文档为准。

### 1.3 artifact ↔ Claude 的桥：2025 年那次更新到底是什么

- 官方公告（2025-06-24）：一句话讲完——`[一手]` "Claude can now create artifacts that interact with Claude through an API— turning these artifacts into AI-powered apps, where the economics actually work for sharing." — [anthropic.com/news/claude-powered-artifacts](https://www.anthropic.com/news/claude-powered-artifacts)（经 [Wayback 2025-08-15 快照](https://web.archive.org/web/20250815012842/https://www.anthropic.com/news/claude-powered-artifacts) 获取；原站直连抓取失败）。
- **具体 API 没有官方开发者文档**。可核实的函数签名来自逆向系统提示与 Simon Willison 的记录：`window.claude.complete(prompt)`，单参数、返回文本。`[二手]` "The API accepts a single parameter -- the prompt you would like to complete… const response = await window.claude.complete('prompt you would like to complete')" — [gist（系统提示原文）](https://gist.github.com/simonw/31957633864d1b7dd60012b2205fd747?permalink_comment_id=5638775#gistcomment-5638775) / [simonwillison.net 2025-06-25](https://simonwillison.net/2025/Jun/25/ai-powered-apps-with-claude/)。
- 计费与鉴权模型：用**查看者自己的** Claude 账号跑 prompt，创作者不付钱、不需要 API key。`[一手]` "No API keys are required, and there's no cost to you… usage counts against each person's own plan limits rather than yours." — support 17153992。
- 2026 年现状：官方措辞退化为「text-based API」，未公布函数名；且改成**首次使用时询问权限**。`[一手]` "New artifacts ask you for permission the first time they want to use Claude." — 同上。
- **是否开放协议**：没有。这是 Anthropic 自家宿主提供的 JS 全局函数，不是公开规范，第三方无法定义兼容宿主。`[一手，基于官方文档未提及任何规范]`

> `[未验证]` `window.claude.complete` 在 2026 年是否改名/扩参数：抓不到 2026 年的 API 文档，无法确认。文中后续一律按「Anthropic 未公开该 JS API」处理。

### 1.4 呈现与迭代方式

- **侧栏 vs 正文**：artifact 走**独立右侧面板**（"you'll see the content displayed in a dedicated window to the right of the main chat"，另一篇帮助页 [support 9487310](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)），不是正文内联卡片。Claude Code 侧更彻底：发布成 `claude.ai` 上的一个 URL 页面，终端里只留一个链接和 `⧉` 药丸。`[一手]`
- **迭代**：改完由 Claude 改底层文件并**重新发布到同一 URL**，版本可切换；编辑器侧支持「选中文本 → Edit with Claude」的就地改。`[一手]` "Claude edits the underlying file and publishes again to the same URL… Each publish becomes a version" — code.claude.com/docs/en/artifacts。
- **结果回传**：官方只提供「导出可粘贴的文本」这一条路。`[一手]` "Ask for an export control that produces text you can paste into the terminal, so the result of interacting with the page flows back into the session instead of staying on the page." — 同上。

### 1.5 2026-09-16 的产品转向（对「要不要做自由 HTML」是强信号）

`[一手]` "Legacy artifacts are artifacts made in a chat before September 16, 2026. They keep working, and you can still publish and share them, but you can't make new ones." — support 17153992。

取而代之的是**模板化 artifact**：Docs / Slides / Design / Data / Sheets / Whiteboards / Motion（beta），每个模板有自己的画布与导出格式（Word/PDF/PPTX/MP4 等）。含义：Anthropic 把「模型现写一个 HTML 页面」收敛成「模型填一个受控结构的产物」。

---

## 2. MCP Apps（SEP-1865）与开源 mcp-ui

### 2.1 规范身份

| 项 | 值 | 证据 |
|---|---|---|
| 名称 | SEP-1865: MCP Apps: Interactive User Interfaces for MCP | `[一手]` [specification/2026-01-26/apps.mdx](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx) |
| 状态 | **Stable (2026-01-26)**，Created 2025-11-21 | 同上 head |
| 扩展标识 | `io.modelcontextprotocol/ui` | 同上 |
| 内容类型 | 仅 `text/html;profile=mcp-app`（MVP） | 同上 |
| 作者 | 跨厂商个人署名（Ido Salomon、Liad Yosef、Olivier Chafik、Jerome Swannack、Jonathan Hefner、Alexi Christakis 等）；其中 Alexi Christakis、Bryan Ashley 也出现在 OpenAI [Canvas 发布的作者致谢](https://openai.com/index/introducing-canvas/)里 → 可确认至少一侧是 OpenAI 工程师，其余署名者的雇主未在规范中标注 | 同上 head |
| 渊源 | 吸收 MCP-UI 与 OpenAI Apps SDK（2025-11 上线）两者设计 | 同上 |

规范里对「为什么要标准化」的自我说明很值得引用：
`[一手]` "OpenAI's Apps SDK, launched in November 2025, further validated the demand for rich UI experiences within conversational AI interfaces… This SEP addresses the current limitations through an optional, backwards-compatible extension that unifies the approaches pioneered by MCP-UI and the Apps SDK into a single, open standard."

### 2.2 `ui://` 资源与工具绑定

- 资源用 `ui://` scheme，`resources/read` 取回 HTML；`mimeType` 必须是 `text/html;profile=mcp-app`。
- 工具通过 `_meta.ui.resourceUri` 声明「我的结果该用哪个 UI 渲染」；旧写法 `_meta["ui/resourceUri"]` 已标记废弃。
- `_meta.ui.visibility: ["model" | "app"]` 决定工具**只给模型、只给 UI、还是都给**；`["app"]` 的工具对模型不可见但 UI 可调（刷新按钮、表单提交用这个藏实现细节）。
- 设计取向：工具**预声明**模板，宿主可预取/缓存/安全审查；「模板（静态）与数据（动态）分离」。
`[一手]` 全部来自 apps.mdx 的 "UI Resource Format" / "Resource Discovery" / "Rationale §1"。

### 2.3 iframe 渲染与 postMessage 桥（标准做法）

- **传输**：JSON-RPC 2.0 over `postMessage`；iframe 视角上它就是一个 MCP client，宿主是 server（可代理真实 MCP server）。规范还给了不依赖 SDK 的最小实现片段。
- **必须的双 iframe 沙箱代理**（Web 宿主）：
  `[一手]` "If the Host is a web page, it MUST wrap the View and communicate with it through an intermediate Sandbox proxy. 1. The Host and the Sandbox MUST have different origins. 2. The Sandbox MUST have the following permissions: `allow-scripts`, `allow-same-origin`."
- **默认 CSP（未声明时）**：
  ```
  default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
  img-src 'self' data:; media-src 'self' data:; connect-src 'none';
  ```
  宿主"MAY further restrict but MUST NOT allow undeclared domains"。
- **能力声明**：`ui.csp`（`connectDomains` / `resourceDomains` / `frameDomains` / `baseUriDomains`）、`permissions`（camera/microphone/geolocation/clipboard-write）、`domain`（专用沙箱 origin）、`prefersBorder`。
- **生命周期**：`ui/initialize` → `ui/notifications/initialized` → `ui/notifications/tool-input`（完整参数）→ `ui/notifications/tool-result`；流式有 `tool-input-partial`；拆毁前有 `ui/resource-teardown`。
- **UI → 宿主的三条语义不同的出站通道**（§8 要用）：

| 方法 | 语义 | 宿主行为 |
|---|---|---|
| `tools/call` | 让 UI 直接调工具（含 `visibility:["app"]` 的私有工具） | 宿主可代理到 server，或拦截/要求批准 |
| `ui/message` | 往对话里**发一条消息**（role 可指定） | "Host SHOULD add the message to the conversation context… Host MAY request user consent." → 会触发后续轮次 |
| `ui/update-model-context` | **只更新模型上下文**，不产生对话气泡 | "SHOULD provide the context to the model in future turns… If multiple updates are received before the next user message, Host SHOULD only send the last update" |
| `ui/open-link` / `ui/request-display-mode` | 开外链 / 请求 inline·fullscreen·pip | 宿主可拒绝 |
| `notifications/message` | 仅日志 | 不进化 |

### 2.4 谁在支持（版本与时间）

| 宿主 | 支持状态 | 证据 |
|---|---|---|
| Claude（web/desktop/mobile） | ✅ | `[一手]` mcp-ui 支持的 MCP Apps Hosts 表把 Claude 标 ✅ — [mcp-ui README](https://github.com/idosal/mcp-ui) |
| ChatGPT | ✅ 且「官方认可」 | `[一手]` "For new MCP apps, follow the MCP Apps UI and OpenAI MCP extensions specifications. ChatGPT supports and endorses both specifications as the official way to add UI to your MCP server. This page documents the legacy `window.openai` API." — [developers.openai.com/plugins/reference](https://developers.openai.com/plugins/reference.md) |
| VS Code / GitHub Copilot | ✅ Insiders 起，2026-01-26 宣布 | `[一手]` "Today, the MCP community is announcing MCP Apps, the first official MCP extension… VS Code is the first major AI code editor with full MCP Apps support. Available now in VS Code Insiders" — [microsoft/vscode-docs blog](https://github.com/microsoft/vscode-docs/blob/main/blogs/2026/01/26/mcp-apps-support.md)；`[一手]` SDK 侧 opt-in：`enableMcpApps` 默认 false — [copilot-sdk PR #1335](https://github.com/github/copilot-sdk/pull/1335)（2026-07） |
| 其它 | Postman / Goose / LibreChat / MCPJam / Smithery 等 | `[一手]` mcp-ui README 表 |

> **对用户问题的一处更正**：没有查到叫「Copilot Cowork」的产品。支持 MCP Apps 的是 **VS Code 里的 GitHub Copilot**；「Cowork」是 Anthropic 的产品名（Claude Cowork）。`[未验证]` 若用户指的是别的产品，需要补名字。

---

## 3. ChatGPT 侧：Canvas 与 Apps SDK

### 3.1 Canvas：解决「就地改稿」，不是「跑原型」

- 定位是一块**并排编辑的工作区**，面向写作与编码的反复修改，不是通用 UI 运行时。`[一手]` "Canvas 会在个别视窗中开启，方便您与 ChatGPT 协作处理专案" — [openai.com/index/introducing-canvas](https://openai.com/index/introducing-canvas/)（2024-10-02）。
- 代码预览确实是**沙箱渲染 React/HTML**，且有「代码执行 / 网络访问」开关：`[一手]` "React/HTML 코드는 샌드박스 환경에서 렌더링되어… 미리보기는 워크스페이스의 캔버스 네트워크 접근 설정에 따라 달라질 수 있습니다"（韩文帮助中心，英文版抓取 404）— [help.openai.com/ko-kr/articles/9930697](https://help.openai.com/ko-kr/articles/9930697-what-is-the-canvas-feature-in-chatgpt-and-how-do-i-use-it)。
- **没有**面向开发者的「Canvas ↔ 模型」桥；迭代靠对话 + 就地编辑 + 版本回退。`[一手，基于文档未提及任何桥]`

### 3.2 Apps SDK（`window.openai`）：解决「工具结果有专属 UI」

桥的能力面（现已标 legacy，但语义仍被 MCP Apps 继承）：

| 能力 | API |
|---|---|
| 读工具入参/结果 | `window.openai.toolInput` / `toolOutput` / `toolResponseMetadata` |
| 调工具 | `window.openai.callTool(name, args)` |
| **往对话发消息** | `window.openai.sendFollowUpMessage({ prompt, scrollToBottom })` |
| UI 状态持久化 | `widgetState` / `setWidgetState(state)` |
| 展示位 | `requestDisplayMode`（inline/pip/fullscreen）、`requestModal`、`requestClose`、`notifyIntrinsicHeight` |
| 环境 | `theme`、`displayMode`、`maxHeight`、`safeArea`、`locale`、`view` |
| 文件 | `uploadFile`、`selectFiles`、`getFileDownloadUrl` |
| 外链 | `openExternal({ href, redirectUrl })` |

`[一手]` 全部见 [developers.openai.com/plugins/reference](https://developers.openai.com/plugins/reference.md)（2026-11-21 抓取）。
CSP 与域名：`_meta.ui.csp` 的 `connectDomains/resourceDomains/frameDomains`；组件默认域 `https://web-sandbox.oaiusercontent.com`，提交插件时必须给**唯一**的 `_meta.ui.domain`。`[一手]` 同上。

### 3.3 与 Artifacts 的差别（一句话版）

| 维度 | Claude Artifacts | ChatGPT Canvas | ChatGPT Apps SDK / MCP Apps |
|---|---|---|---|
| 谁产生 UI | 模型现写 HTML/模板 | 模型现写文档/代码，并排编辑 | 第三方 **MCP server** 预声明 `ui://` 模板 |
| UI 与模型的关系 | 页面可调 `window.claude.complete`（不公开） | 无桥 | 标准 JSON-RPC 桥（工具调用/发消息/更新上下文） |
| 产物归属 | Anthropic 托管、可发布成链接 | 会话内草稿 | 宿主内嵌，生命周期跟随工具调用 |
| 信任模型 | 单宿主自研沙箱 | 单宿主自研沙箱 | 规范强制双 iframe + 声明式 CSP |

---

## 4. Codex 侧：三种「有 UI」的东西，严格分开

> 结论先说：**Visualize（对话内 HTML 原型）≠ Sites（托管应用）≠ MagicPath（第三方画布）**。三者都能"出界面"，但交付面、权限模型、成本结构完全不同，混为一谈会得出错误的产品判断。

### 4.1 Visualize：官方内置、对话内、模型现写 HTML

| 问题 | 事实 | 证据 |
|---|---|---|
| 官方出处 | 官方文档有专页《Visualizations》，挂在 Codex 文档集下 | `[一手]` [developers.openai.com/codex/visualizations](https://developers.openai.com/codex/visualizations.md)（2026-11-21 抓取；页内**无发布日期**） |
| 它是什么 | "Visualizations turn questions, ideas, and information into charts, maps, diagrams, calculators, simulations, and interactive explanations you can explore in a ChatGPT chat." | `[一手]` 同上 |
| 成熟度 | **预览灰度中**，不是 GA | `[一手]` "The Visualizations preview is rolling out. Availability can depend on your plan, platform, account, and workspace settings." |
| 怎么唤起 | composer 里输入 `@` → 选 **Plugins** 下的 **Visualize**；描述是 "Create visualizations and interactive tools"；也可直接打 `@Visualize` | `[一手]` 同上（两个 `ContentModeSwitch` 块分别描述 app 与 web） |
| 可用面 | ChatGPT web：supported accounts 可用（Chat 与 ChatGPT Work）；桌面：preview 灰度；移动：eligible accounts 灰度；**Codex CLI 与 IDE 扩展：渲染不支持** | `[一手]` 官方 "Check availability" 表逐行如此；其中 CLI/IDE 一行为 "Visualization rendering isn't supported" |
| 是否在公开插件仓库 | **不在**。`openai/plugins` 的 `plugins/` 目录我拉过完整列表：有 `data-analytics`、`build-web-apps`、`build-web-data-visualization`、`product-design`…**没有 `visualize`** | `[一手]` [GitHub API 目录列表](https://api.github.com/repos/openai/plugins/contents/plugins)（2026-11-21） |
| 因此是内置还是需安装 | 它是**插件形态**（文档把它列在 Plugins 下），但不在公开仓库 → 只能随客户端下发、按账号灰度解锁；**不能从公开插件目录自行安装**。注：这是由「公开仓库无此目录 + 文档称 under Plugins」推出的结论，官方未直接写"内置" | `[推断，中]` 依据同上两行 |
| 能力边界 | 官方语气很克制：①"a visualization is generally a snapshot of the information available when ChatGPT created it, **not a live dashboard** that stays synchronized"；②要持久化/权限/URL 就转 Sites；③"**A follow-up can create a replacement visualization instead of editing the original result in place**" | `[一手]` 同上（Refine / Share 两节） |
| 失败态 | 会**卡住或空白**，官方给的处置是等、刷新一次、重试、缩小规模 | `[一手]` "If the result is blank or missing, wait for the response to finish, reload the chat once, and then retry."；另见真实故障单 [openai/codex#57678](https://github.com/openai/codex/issues/57678)（2026-10-27，Visualize 任务无限运行、无可取消控件）`[一手]` |

> **对我们那句错结论的准确改写**：不是"Codex 没有对话内 UI 原语"，而是"**官方原语存在，但归属 ChatGPT 的 chat surface，Codex CLI / IDE 拿不到**"。做对照时要把这句差异写进去，否则会误判"Codex 用户都能用"。

### 4.2 Sites：官方托管运行时（不是对话内嵌）

| 项 | 事实 | 证据 |
|---|---|---|
| 定位 | 创建、**部署**、检视站点/Web app/游戏；给的是 URL、登录、存储（D1 10 GB / R2）、计费 | `[一手]` "Sites lets you build, host, and share a website by describing it in ChatGPT or Codex." — [developers.openai.com/codex/sites](https://developers.openai.com/codex/sites.md)（2026-11-21） |
| 运行时 | 支持 HTTP/HTTPS/WebSocket，**不支持原始 TCP**；部分框架、私网、后台服务不支持 | `[一手]` 同上 "Some frameworks, private networks, databases, background services, and hosting patterns aren't supported." |
| 与 Visualize 的关系 | 官方明确分流：要"durable hosted application with a shareable URL, permissions, or persistent data"就用 Site | `[一手]` visualizations.md "Use a [Site] when you need a durable hosted application…" |
| 定位差异 | **产物是可访问的应用**，有流量与存储成本；Visualize 是**会话内的一次性解释** | 同上 |

### 4.3 第三方画布插件（不要与官方混为一谈）

| 插件 | 定位 | 证据 |
|---|---|---|
| **MagicPath** | 在 Codex 里跑一块 canvas，可在 Codex 内置浏览器里长期打开；`magicpath-ai` CLI | `[一手]` 官方插件目录内有该插件：`openai/plugins/plugins/magicpath/README.md` — [raw](https://raw.githubusercontent.com/openai/plugins/main/plugins/magicpath/README.md)；`[二手]` 厂商博客 "Run MagicPath as a native canvas inside Codex"（2026-05-15）[magicpath.ai/blog](https://www.magicpath.ai/blog) |
| T3 Code 在 Codex 线程里渲染 MCP Apps | 社区宿主 | `[二手]` 单一来源，`[未验证]` — [builderio/agent-native 文档](https://github.com/builderio/agent-native/blob/main/packages/core/docs/content/mcp-apps.mdx) |

> 「官方插件目录收录」≠「OpenAI 官方能力」；反过来，「官方内置」也不等于「开放协议」——Visualize 没有公开的宿主契约文档，第三方无法做一个兼容宿主。

---

## 5. Visualize 的渲染约束与产品定位

### 5.1 实现形态结论：**模型现写 HTML，不是预置组件库**

三条独立线索指向同一形态：

1. **产物是一个 HTML 文件路径**，模型发一条内容引用让宿主内联渲染。
   `[二手]` 官方技能的参考文件写明交付格式："`【visualize|{"path":"/absolute/approved/visualizations/weekly-active-users.html"}】`"，并要求 "Both surfaces deliver the same generated fragment through their installed Visualize skill; Work Mode wraps the file-backed fragment as an inline app block." — [system_prompts_leaks 镜像（data-analytics/visualize-data）](https://github.com/asgeirtj/system_prompts_leaks/blob/main/OpenAI/Codex/plugins/data-analytics/skills/visualize-data/references/inline-chart-renderer.md)
2. **同一形态的故障报告**：当模型把调用当纯文本吐出来 `visualize({"path":"/path/to/trio-v2-routing-flow.html"})`，宿主不执行、**内联 UI 不渲染**。
   `[二手]` [opencodex#1349](https://github.com/lidge-jun/opencodex/issues/1349)（2026-08-08）
3. **官方文档的间接佐证**：排障建议里有 "remove a generated control or library that isn't working"——说明页面里的**控件与库是每次生成的**，不是从固定组件表里挑。
   `[一手]` [developers.openai.com/codex/visualizations](https://developers.openai.com/codex/visualizations.md)

→ 所以：**Visualize = B 形态（任意 HTML/JS）+ 一整套强渲染约束 + 文件落盘再引用**。不是 A（白名单组件），也不是纯 C（文件 + 外部预览面板）——它是"**C 的交付方式 + B 的渲染方式 + 内联呈现**"的混合体。

### 5.2 那套约束具体是什么

主要证据是一份**泄漏的 Codex Desktop 系统提示**（`[二手]`，但内容是可直接核对的规则文本）：

```text
## Layout and accessibility
- Use semantic HTML, keyboard-accessible controls, and concise labels.
- Keep the top-level surface transparent and unframed, and fill the available
  conversation width. Design for 736px and support widths down to 320px.
- At every supported width, text, controls, cards, toolbars, and dynamic content
  must fit without overlap or clipping. Reflow by stacking or wrapping. The host
  sizes the frame to its content, so avoid fixed outer widths, horizontal
  overflow, internal scrolling, `position: fixed`, and viewport-height layouts.
- Keep native tab order; never add `tabindex`.
```

- 来源：`[二手]` [LouisShark/chatgpt_system_prompt · codex-desktop/5.6-Sol_SystemPrompt.md:4086-4093](https://github.com/LouisShark/chatgpt_system_prompt/blob/main/prompts/official-product/openai/codex-desktop/5.6-Sol_SystemPrompt.md)（MIT 仓库，内容是泄漏的系统提示；2026-11-21 经 GitHub 代码搜索定位）
- 交叉印证：另一个项目（Apache-2.0）的 visualize 插件里保留了**同名小节与几乎相同措辞**，并多了 `aria-live="polite"` / `role="alert"` 两条。这大概率源自同一份提示（`[推断，中]`，该项目与 OpenAI 的关系未核实）。
  `[二手]` [zai-org/ZCode · visualize-plugin/skills/visualize/SKILL.md:165](https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/packages/visualize-plugin/skills/visualize/SKILL.md)
- 官方只给了"目标"层面的表述，没有给具体像素与禁令：`[一手]` "Generated visualizations aim to use semantic controls, visible focus, readable contrast, and reduced motion, but the result can vary." — visualizations.md

> 证据强度：**"设计 736px、支持降到 320px"、"顶层透明无框"、"宿主按内容定高所以禁固定外宽/内部滚动/position:fixed/vh"** 这三条来自泄漏提示，属 `[二手]`；官方文档只确认了可访问性目标与"是 Chat 内联"这一点 `[一手]`。**不要**把 736px 当成官方承诺的规格对外引用。

### 5.3 产品定位：原型是**讨论的锚点**，不是可运行 app

- 第三方体验记录（最早可查的公开使用记录）：`[二手]` "它现在还不能像正式 App（应用）一样，点一下就真的跑完整个流程。但你可以看着原型告诉 Codex：『我点了这里，我本来以为会发生什么？』…它就能顺着你点的地方，帮你理解自己到底想要什么，再改下一版。" — 微信公众号《Codex 新功能：把你的产品想法直接做成可讨论的原型》（2026-07-16，[原文](http://mp.weixin.qq.com/s?__biz=MzcwNTA0MTI2Ng==&mid=2247483955&idx=1&sn=8ffacfd704a6d5014d57f56204f6ccb6)｜[CSDN 镜像 2026-07-17](https://devpress.csdn.net/awstech/6a72eca7662f9a54cb983405.html)）
- 同一波二次整理把定位讲得更直白：`[二手]` "Codex 生成的原型不是最终界面，而是你和协作者之间共享的『视觉共识锚点』" — [php.cn（2026-10-24）](https://www.php.cn/faq/3325192.html)
- 官方口径与之**一致但不那么抒情**：`[一手]` 快照而非 live dashboard；follow-up "can create a replacement visualization instead of editing the original result in place"；要可运行/持久化就转 Sites。
- 时间线：2026-07 已有插件形态的公开使用记录；官方文档页在 2026-11-21 仍标 "preview is rolling out"；页内无发布日期，**正式发布时间 `[未验证]`**。

### 5.4 对 DSH 的可借鉴点（按价值排序）

| # | 可借鉴 | 为什么对我们有用 | 我们怎么落地 |
|---|---|---|---|
| 1 | **为对话宽度设计**：736px 基准、320px 下限、宿主按内容定高 → 禁固定外宽 / 内部滚动 / `position: fixed` / `vh` 布局，靠 stack & wrap 重排 | 我们现在的产物是**在会话 DOM 里直接渲染**，天然继承列宽；但一旦支持 B 通道或"单文件 HTML 导出"，就必须写死这套约束，否则导出页在窄栏里会横向溢出 | 写进 B 通道的校验清单 + 导出模板的默认 CSS（`max-width:100%`、`overflow-wrap`、无 `vh`） |
| 2 | **顶层透明无框**：产物不做卡片外壳，直接融进消息流 | 我们已有 `card.flat`，但这是"可选"；Visualize 把它变成**默认**。少一层壳 = 少一次"这到底是消息还是插件"的认知成本 | B 通道默认无框；A 形态保留 card 作为"并排项/风险清单"的例外（与 genui 规范一致） |
| 3 | **语义 HTML + 键盘可达 + 原生 tab 序（不加 tabindex）** | 我们的组件库已解决大半；但**导出的单文件 HTML** 与未来的 B 通道没有这层保证 | 导出时做一次静态检查：标题层级、`button` vs `div`、焦点可见、无 `tabindex` 正数 |
| 4 | **"替换优于原地编辑"** | 我们目前是"重渲染同一份规格"；Visualize 允许 follow-up 直接产出**新版本**，用户对比后再选 | 给 action/版本留一个"另存为新版本"的路径，而不是只能覆盖 |
| 5 | **失败要可恢复**：空白就先等、刷新一次、再缩小规模重试 | 我们的失败是"组件被丢弃"，用户看不到原因 | 降级时给一行"这块没渲染出来，试着缩小范围"的提示，而不是静默消失 |

### 5.5 判断：这套「B + 强约束」是否说明「A 形态做原型不够用」？

**我的结论：不能这么推。它说明的是「A 形态不适合做一次性视觉表达」，而不是「A 形态不适合做交互」。**

依据：

1. **Visualize 的约束本身是在把 B 往 A 的确定性上压。** 语义 HTML、无固定布局、宿主定高、禁内部滚动、禁 `position:fixed`——这套规则的目的是"**让任何人在任何列宽下都能稳定看到同一页**"，不是"让页面能跑任意逻辑"。它牺牲的恰恰是 B 的自由度（全屏布局、滚动容器、固定工具栏），换来的是可预测。这跟 A 的取舍方向一致。
2. **官方自己把"能真跑流程"分流走了。** 要持久化、权限、URL → Sites；要实时数据 → connector/数据表；Visualize 明说"是快照、不是 live dashboard"。**能力上限是被产品主动设限的**，不是技术不够。
3. **A 真正的短板是"排版与视觉主张"，不是"交互能力"。** 我们可以用 50 个组件拼出一个表单，但拼不出"两种信息架构并排对比、让人一眼看出差别"——那是**一次性排版问题**，白名单组件天然不擅长（组件是语义单元，排版是全局决策）。Visualize 命中的正是这个场景。
4. **反过来，A 有三个 B 给不了的东西**：schema 可校验（坏组件丢弃、其余照常）、跨会话可复现、零脚本注入面。Visualize 用"强约束"部分弥补了 B 的第一条，但**没有任何机制能弥补第三**——它的信任边界仍然建立在"宿主沙箱 + 模型守规矩"上。

**落地建议（一句话）**：主线继续 A；新增一条**受限 B** 只服务"一次性视觉表达"（对比排版、示意图、可讨论的原型快照），定位为**不可执行的快照**——不回传状态、不持久化、不承诺可运行；当用户真要点得动、要存下来，升级到 A 的 action 或 C 的产物。**不要**因为 Visualize 存在就把主渲染通道换成 iframe。

---

## 6. 开源参考实现

### 6.1 assistant-ui `with-artifacts`（MIT，活跃）

- 仓库：`assistant-ui/assistant-ui`，MIT，13,359 stars，`pushed_at` **2026-11-21**（即当天仍在提交）。`[一手]` [api.github.com/repos/assistant-ui/assistant-ui](https://api.github.com/repos/assistant-ui/assistant-ui)
- 线上说明：`[一手]` "Generated artifacts render in a sandboxed iframe… Code runs in a sandboxed iframe with scripts enabled but no access to the parent page" — [assistant-ui.com/examples/artifacts.md](https://www.assistant-ui.com/examples/artifacts.md)
- **架构要点（读源码）**：

| 要点 | 证据（`examples/with-artifacts/app/...`） |
|---|---|
| 模型不"画 UI"，而是**通过一个可交互工具填状态**；状态 schema 只有 `title` + `code`（完整 HTML 文档） | `artifact-state.ts`：`artifactSchema = z.object({ title, code: z.string().describe("A complete HTML document with inline CSS and JavaScript when needed.") })` |
| 渲染：`<iframe srcDoc={state.code} sandbox="allow-scripts allow-forms" />` | `artifact-surface.tsx` |
| **没有 `allow-same-origin`，也没有任何 `postMessage` 桥**——页面完全无法回话 | 同上，全文件无 `postMessage`/`contentWindow` |
| 呈现：对话里一张"HTML artifact"卡（Open workbench）→ 侧栏工作台（移动端为覆盖层） | 同上 |
| 版本历史来自工具状态的多版本（`origin: user-edit | assistant`），可 restore | 同上 + `unstable_useInteractableVersions` |
| 源码视图就是 textarea，不是 CodeMirror/Monaco | 同上 |

- **可复用度**：高（MIT、结构干净）。但它是**「模型写整页 HTML + 只预览」**，交互结果零回传——正好是我们 A 形态的对立极端。适合当 B 形态的渲染壳参考，不适合照抄交互回传。

### 6.2 mcp-ui（Apache-2.0，活跃）

- 许可：**Apache License 2.0**（不是 MIT）。`[一手]` [mcp-ui README](https://github.com/idosal/mcp-ui)
- 自我定位已转向「MCP Apps 标准的实现」：`[一手]` "The `@mcp-ui/*` packages implement the MCP Apps standard. `@mcp-ui/client` is the recommended SDK for MCP Apps Hosts." 同上。
- 客户端双组件：`AppRenderer`（MCP Apps，需传 `sandbox={{ url }}`）、`UIResourceRenderer`（legacy MCP-UI，`onUIAction` 回调）；另有 Web Component 形态；有 ChatGPT Apps SDK 适配器（把 MCP-UI 的 `postMessage` 翻译成 `window.openai`）。
- **可复用度**：**宿主侧**直接可用（`AppRenderer` 就是我们要的 iframe + 桥）；**服务端侧**与我们无关（我们是模型直出，不是 MCP server）。注意许可 Apache-2.0 与专利条款。

---

## 7. A / B / C 三种形态对照表

> A = 声明式 JSON 白名单（我方现状）；B = 沙箱 iframe 里跑任意 HTML/JS（MCP Apps / Claude Artifacts）；C = 生成代码文件 + 预览面板（Claude Code artifacts / assistant-ui）。

| 维度 | A 声明式白名单 | B 沙箱 iframe 任意 HTML/JS | C 代码文件 + 预览 |
|---|---|---|---|
| 表达力上限 | 白名单组件 × 白名单属性 | 任意 HTML/CSS/JS（受 CSP 与 sandbox 限） | 任意（同 B，但产物是文件） |
| 模型一次输出的确定性 | **高**：JSON schema 可校验，坏组件丢弃、其余照常渲染 | 低：整页 HTML 可能语法错、可能白屏 | 低-中：文件可被后续编辑/再发布，有版本 |
| 渲染隔离 | **无 iframe**（我方直接在会话 DOM 渲染）→ 零 iframe 开销，但**模型代码不能进 DOM** 是硬前提 | 必须 iframe + `sandbox`（MCP Apps 要求双 iframe + 异源代理） | iframe 或独立 URL 页 |
| 信任边界 | 最强：模型**无法**注入可执行脚本，攻击面=组件实现 | 中：可达任意 JS，靠 sandbox + CSP + 网络白名单兜底 | 中-弱：页面在托管域跑，还可能拿到 connector 能力 |
| 网络访问 | 不需要（数据随 JSON） | 声明式白名单；默认 `connect-src 'none'` | Claude Code：只能连自身 origin + Google Fonts；数据靠宿主代理 |
| 交互状态 | 客户端本地（判卷/筛选就地完成） | iframe 内部状态，宿主可 `widgetState` 持久化 | 文件内状态 + 可持久化存储 |
| 结果回传 | 只有**显式 action** → 一条 `[genui-action]` 用户消息 | `ui/message`（进对话）/ `ui/update-model-context`（静默）/ `tools/call` | 官方仅「复制文本粘回终端」 |
| 失败影响面 | 单组件降级，不易整块崩 | iframe 白屏/卡死只影响该块 | 页面打不开/发布失败，会话不受影响 |
| 宿主成本 | 组件库 + 校验器 + 渲染器 | iframe 管理、CSP 生成、桥、双沙箱代理、尺寸协商 | 文件生命周期、发布通道、版本、分享/权限 |
| 迭代方式 | 模型改 JSON，就地重渲染 | 模型改 HTML 重发；或 UI 内自更新 | 改文件→重新发布→同 URL 更新 |
| 典型实现 | 本仓库 `dsh-vt-gen-ui` | MCP Apps / Claude Artifacts / **Codex Visualize**（B 的变体） | Claude Code artifacts / assistant-ui |

> **Visualize 的位置**：它是 **B 形态的一个变体**——官方内置、对话内联、模型现写 HTML，但用一整套强渲染约束（语义 HTML、透明无框、按对话宽度设计、宿主定高）把 B 的自由度压回接近 A 的可预测性。它不是 A 的替代品，也不是 MCP Apps 那种开放协议（没有公开宿主契约，第三方做不了兼容宿主）。详见 §5。

**取舍判断（给主 Bot 用）**：

- 想要**稳定、可审、无脚本注入**的产物 → A 仍是最优，尤其当产物只是"看数据、点几下、填个表"。
- 想要**图灵完备的原型**（图表库、动画、canvas/WebGL、复杂交互）→ 只能 B 或 C；A 的边际成本会随组件数线性上升（我们已有 50 个组件，这就是信号）。
- C 的价值不在"能跑 JS"，而在**产物可保存、可分享、可被人再编辑**；如果 DSH 的目标只是"对话里看一眼"，C 是过度设计。

---

## 8. 交互结果如何回到模型（三种产品后果）

| 通道 | 是否自动进模型 | 是否留下对话痕迹 | 产品后果 |
|---|---|---|---|
| A：显式 action → 用户消息 | 是（作为下一条用户消息） | 是，占一条气泡 | 意图显式、可审计；但**每次交互都污染对话历史**，滑块拖动一次就多一条消息会很糟 |
| B：`ui/message` | 是，宿主 SHOULD 加入上下文并据此继续 | 是 | 同 A，且宿主"MAY request user consent"——可加一道确认 |
| B：`ui/update-model-context` | 是，但**只在后续轮次生效** | **否** | 最接近"UI 是个状态机，模型读状态"；规范要求多次更新只取最后一次，天然去抖 |
| B：`tools/call` | 间接（结果回工具链） | 取决于宿主 | UI 变成工具的遥控器，适合"刷新/提交"这类动作 |
| C：复制粘贴 | 否（手动） | 是（人打的字） | 零意外，但每次迭代一次人工搬运 |
| C：评论 → Claude 读 | 是（Claude Code 主动 watch，v2.1.228+） | 是 | 协作场景强，但需要托管 + 身份 + 评论系统 |
| **Visualize（B 变体）：无桥** | 否 | 否 | 页面里的点击**不会**自动回到模型；用户只能继续用文字描述"我点了这里、我以为会怎样"，且 follow-up 常生成**替换版本**而非原地编辑 `[一手]` |

> **推论**：我们现在的 `[genui-action]` 是「A + 用户消息」。**最缺的是 `update-model-context` 这一档**——它能让「用户调了滑块/勾了选项」在不发消息的前提下成为模型的下一轮输入。这正是 dsh-vt-gen-ui 的 `show_view`/`submit` 类交互最自然的语义。

---

## 9. 隔离与信任边界（iframe 能访问什么、失败时影响什么）

| 问题 | MCP Apps 的答案 | Claude Artifacts 的答案 | 我们（A）的答案 |
|---|---|---|---|
| iframe 能读宿主 DOM/cookie 吗 | 不能：双 iframe + 异源沙箱，`allow-scripts` + `allow-same-origin` 只给**外层 sandbox proxy**，内层 View 仍是隔离的 | 不能：`*.claudeusercontent.com` 独立 origin | N/A（无 iframe；但也没有模型代码进 DOM） |
| 能发网络请求吗 | 仅 `ui.csp.connectDomains` 声明的域；默认 none | 仅自身 origin + Google Fonts；connector 调用由 claude.ai 代理 | 不需要 |
| 能加载外部脚本吗 | 仅 `resourceDomains` | 仅 5 个 CDN | 不允许 |
| 能开新窗口/外链吗 | `ui/open-link`，宿主可拒 | 外链受限；下载必须声明 capability | 无 |
| 能反向骚扰模型吗 | 必须走 JSON-RPC，宿主可校验/记录/阻断；"Host MAY decide to block some messages or subject them to further user approval" | 只能调 `window.claude.complete`（受权限弹窗） | 只能发 `[genui-action]` |
| 崩了会影响会话吗 | 不会：独立 iframe；`ui/resource-teardown` 还能先优雅收尾 | 不会 | 不会（单组件降级） |
| 宿主必须做的额外功课 | CSP 生成、双沙箱代理、尺寸协商（`size-changed`）、生命周期、审计日志 | 自有沙箱服务 + 发布通道 | JSON 校验 |

规范明确把「社交工程」列为残余风险：`[一手]` "Social engineering: UI can still display misleading content. Hosts should clearly indicate sandboxed UI boundaries." — apps.mdx "Security Implications"。

---

## 10. 对 DSH 插件的可复用点

按「投入/收益」排序，只列有外部一手依据的：

1. **补一个「静默回传」语义（最高优先，成本最低）**
   借鉴 `ui/update-model-context`：UI 侧状态变化写进一个 per-message 的上下文块，随用户**下一条**消息一起送给模型，不产生额外气泡；多次变化只取最后。这解决 A 形态"一拖滑块就多一条消息"的硬伤。依据：apps.mdx "Host behavior" 原文 "If multiple updates are received before the next user message, Host SHOULD only send the last update to the model"。

2. **把 action 做成「声明式 + 可拒绝」**
   借鉴 `ui/message` 的 "Host MAY request user consent" 与 `visibility:["app"]`：区分「只影响本地的交互」与「需要模型参与的交互」，后者才回传。我们现在是"写了 action 才回传"，方向对，但缺"隐含状态也可以被模型看见"这一档。

3. **B 形态不要自创协议，套 MCP Apps 的壳**
   若要做 iframe 逃生舱：`sandbox="allow-scripts"`（**不加** `allow-same-origin`）+ 声明式 CSP + `srcDoc` + `postMessage` JSON-RPC 子集（`ui/initialize`、`tools/call` 不需要、`ui/message`、`ui/update-model-context`、`ui/notifications/size-changed`）。我们不是 MCP server，所以不必实现 `ui://` 与 `_meta.ui`，但**桥的消息形状照抄**，未来接第三方 MCP App 时零翻译。
   参照实现：`@mcp-ui/client` 的 `AppRenderer`（Apache-2.0）可直接读实现；`assistant-ui/with-artifacts` 的 `artifact-surface.tsx`（MIT）是极简 `srcDoc` 范例。

4. **CSP 白名单直接采用业界共识的 5+2 个域**
   `cdnjs.cloudflare.com`、`cdn.jsdelivr.net/npm/`、`unpkg.com`、`cdn.tailwindcss.com`、`code.jquery.com`；字体 `fonts.googleapis.com`/`fonts.gstatic.com`。理由：Claude 官方文档与逆向提示、以及第三方宿主（[MulmoClaude 的 csp.json 默认集](https://github.com/receptron/mulmoclaude/blob/main/docs/csp-config.md)：`default-src 'none'` + jsdelivr/unpkg/cdnjs/Google Fonts）都收敛到近似同一组，说明这是"够用且安全"的经验值。

5. **单文件 HTML 导出的定位可以更自信**
   Claude Code 的 C 形态证明"产物 = 一个自包含页面"是被接受的终点形态；我们已有单文件导出，缺的只是"导出后可再被别人喂回模型"的回路（对应 Claude Code 的 copy→paste 习惯）。不必为此建服务端。

6. **不要抄的两件事**
   - 自由 HTML artifact 的**消费级开放**：Anthropic 自己在 2026-09-16 停止了新建（"you can't make new ones"），转向模板化。对我们意味着：**B 形态应当是可选的逃生舱，不是默认路径**。
   - `window.claude.complete` 式的"页面直接调模型"：那是宿主自研的非公开 API，且要处理"用谁的额度/权限"。DSH 里等价物应该是走我们自己的模型通道，而不是给 iframe 一个万能入口。

---

## 11. 查不到 / 未验证（不要用推测补）

| 项 | 状态 |
|---|---|
| `window.claude.complete` 在 2026 年的正式签名、是否有更多方法（多轮、tools、结构化输出） | **查不到**：Anthropic 从未发布该 JS API 的开发者文档；只能引用 2025 年逆向系统提示。`[未验证]` |
| Claude 聊天侧 artifact 的**确切** `sandbox` 属性组合 | **查不到**：官方文档只写 `*.claudeusercontent.com` 与 CSP；`sandbox="..."` 的具体 token 只有二手描述。Claude Code 侧能确认 CSP，但不能外推到聊天侧。 |
| ChatGPT Canvas 的英文帮助页 | **抓不到**：`help.openai.com/en/articles/9930697` 经 fetch 返回 404；只有韩文版可读。Canvas 的"网络访问开关"细节来自韩文页与第三方监测，`[二手]`。 |
| Visualize 的**正式发布时间 / GA 时间** | **查不到**：官方页无发布日期，2026-11-21 仍标 "preview is rolling out"；公开使用记录最早见于 2026-07。`[未验证]` |
| Visualize 是"内置"还是"需安装" | **推断**：文档把它列在 **Plugins** 下（说明是插件形态），但 `openai/plugins` 公开目录里没有它 → 只能随客户端下发/灰度。官方未直接写"内置"。`[推断，中]` |
| Visualize 的布局规格（736px / 320px / 透明无框 / 禁固定定位） | **非官方承诺**：来自泄漏的 Codex Desktop 系统提示 `[二手]`；官方文档只写可访问性目标。对外引用前需再确认。 |
| Visualize 的宿主契约（渲染协议、content reference 格式） | **无公开文档**：内容引用的形状（`visualize` 标记 + `{"path": ...}`）只见于泄漏技能文件与故障报告 `[二手]`；无法据此实现兼容宿主。 |
| 「Copilot Cowork」这个产品 | **查不到**：应为误记（Cowork 是 Anthropic 的）。支持 MCP Apps 的是 VS Code Copilot。 |
| MCP Apps 的 `displayModes` 细节（pip 在桌面端行为） | 规范正文有定义，但抓取内容被截断，未逐条读完；`[未验证]`。 |

---

## 附：一手来源清单（按抓取日期 2026-11-21）

- MCP Apps 规范（Stable 2026-01-26）：https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx
- OpenAI 插件参考（含 MCP Apps 为官方推荐、`window.openai` legacy）：https://developers.openai.com/plugins/reference.md
- OpenAI Codex Sites：https://developers.openai.com/codex/sites.md
- OpenAI Canvas 发布：https://openai.com/index/introducing-canvas/ （2024-10-02）
- Codex 大更新（内置浏览器/标注）：https://openai.com/index/codex-for-almost-everything/ （2026-04）
- Claude 帮助中心 artifacts（当前版）：https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them
- Claude Code artifacts（含 CSP / 16 MiB / 回传方式）：https://code.claude.com/docs/en/artifacts
- Anthropic 公告（经 Wayback）：https://web.archive.org/web/20250815012842/https://www.anthropic.com/news/claude-powered-artifacts （2025-06-24）
- mcp-ui：https://github.com/idosal/mcp-ui （Apache-2.0）
- VS Code MCP Apps 支持：https://github.com/microsoft/vscode-docs/blob/main/blogs/2026/01/26/mcp-apps-support.md
- assistant-ui `with-artifacts`：https://github.com/assistant-ui/assistant-ui/tree/main/examples/with-artifacts （MIT）
- OpenAI 官方插件目录中的 MagicPath：https://raw.githubusercontent.com/openai/plugins/main/plugins/magicpath/README.md
- Codex Visualizations（官方，含平台可用性表）：https://developers.openai.com/codex/visualizations.md
- `openai/plugins` 插件目录（用于确认其中没有 `visualize`）：https://api.github.com/repos/openai/plugins/contents/plugins
- 泄漏的 Codex Desktop 系统提示（`[二手]`）：https://github.com/LouisShark/chatgpt_system_prompt/blob/main/prompts/official-product/openai/codex-desktop/5.6-Sol_SystemPrompt.md
- 第三方 Visualize 体验记录（`[二手]`，2026-07-16）：http://mp.weixin.qq.com/s?__biz=MzcwNTA0MTI2Ng==&mid=2247483955&idx=1&sn=8ffacfd704a6d5014d57f56204f6ccb6
