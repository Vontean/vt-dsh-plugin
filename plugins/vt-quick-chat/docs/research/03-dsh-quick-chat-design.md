# 03 · DSH 插件方案与 UI 规范

> 目标：在 DSH 执行 agent 任务时，按快捷键弹出一个临时聊天小窗，
> 借用一点当前上下文解释概念，**不创建 Session、不写 session log、不调用工具**。
>
> 本文只做方案与规范，不包含插件代码。
>
> **实现状态（2026-11-16）**：第一版已落地，与本文的差异只有四处：
> ① Web Linux 默认不绑定（DSH 的 Web 绑定白名单拒绝该组合）；Desktop 为 `Mod+Alt+N`，Web（macOS/Windows）为 `Mod+Alt+Q`；
> ② 浮层锚定主输入框上方 24px（`bottom: 96px`），避免压住 composer；
> ③ 按键折叠选区时，回退到 5 秒内的最近选区；
> ④ `shell.overlay` 实测为 root 作用域 list 槽位（z-index 20），无需硬编码层级。

## 1. 目标与非目标

### 1.1 目标

| 目标 | 可观察的验收 |
|---|---|
| 随时可开 | 快捷键在 100ms 内弹出小窗，输入框自动聚焦 |
| 不打断主任务 | 主对话、主输入框、侧栏都不被替换；小窗是非模态浮层 |
| 不产生会话 | 侧栏不新增 session，session log 不新增记录，不生成标题 |
| 能解释概念 | 支持多轮对话、流式输出、停止、复制、重试 |
| 带一点上下文 | 默认带当前选中文本；可选带当前对话的最后一段 |
| 和 DSH 一致 | 只用 `--dsw-*` token 和 DSH 图标；浅色/深色都对 |
| 安全 | API Key 只在 Host 半边；路由鉴权；请求体有上限 |

### 1.2 非目标（第一版）

- 不创建 Session、不进入侧栏、不进入「最近会话」、不写 session log。
- 不调用 agent 工具、不读写工作区文件、不执行命令。
- 不做语音、文件上传、图片输入、深度思考搜索。
- 不接管主输入框，不替换主对话的发送链路。
- 不做团队共享、云同步、跨设备历史。

## 2. 用户流程

```
用户在 agent 任务中看到一个不懂的概念
        │
        ├─ 选中一段文字（可选）
        │
        └─ 按快捷键（Desktop Mod+Alt+N / Web Mod+Alt+Q）
                │
                ▼
        ┌──────────────────┐
        │ 紧凑输入条（48px）│  ← 自动聚焦，带「引用选中文字」chip
        └────────┬─────────┘
                 │ 输入问题，Enter
                 ▼
        ┌──────────────────┐
        │ 展开对话（560×520）│  ← 流式回答，可停止、复制、重试
        └────────┬─────────┘
                 │ 继续追问 / 关闭
                 ▼
        关闭：丢弃未发送草稿；已发送内容只留在本地历史（可选）
```

### 2.1 三个入口

1. **快捷键**（主入口）：Desktop `Mod+Alt+N`（`⌘⌥N` / `Ctrl+Alt+N`）；Web（macOS/Windows）`Mod+Alt+Q`。
2. **快捷键设置页**：DSH 的「快捷键」参考里会出现「快捷提问」，可改键。
3. **（第二版）输入框「+」菜单**：加一条「快捷提问」，方便不知道快捷键的人。

第一版只做 1 和 2，避免动主输入框的菜单。

## 3. 快捷键

### 3.1 推荐键位

| 平台 | 键位 | 说明 |
|---|---|---|
| macOS Desktop | `⌘⌥N` | `Mod+Alt+N` |
| Windows Desktop | `Ctrl+Alt+N` | `Mod+Alt+N` |
| Linux Desktop | `Ctrl+Alt+K` | 同上 |
| Web（macOS / Windows） | `Mod+Alt+Q` | `Mod+Alt+N` 被 `session.new` 占用；`Mod+Shift+N` 是浏览器保留键 |

### 3.2 为什么是 `⌘⌥N`

Codex 的 Quick Chat 用 `⌘⌥N`，但 DSH 里：

- `session.new` 已占用 `Mod+N`，并在 Web 上使用 `Mod+Alt+N`；
- `session.search` 已占用 `Mod+K`，并在 Web 上使用 `Mod+Alt+K`；
- Desktop 的 `Mod+Alt+K` 目前没有被 DSH 的默认命令占用（截至 0.2.2-rc.1）。

DSH 的快捷键服务按平台 profile 做冲突检查，会在注册时拒绝冲突的默认值。
所以推荐：**Desktop 用 `Mod+Alt+K`，Web 用 `Mod+Shift+K`**。
这与 DSH 自己的惯例一致：同一个动作在 Desktop 和 Web 可以有不同默认键位，
快捷键参考里显示的是当前设备实际生效的键。

如果未来这两个键位也被占用，改到设置页可用的组合，并在 README 里说明；
不要在代码里绕过冲突检查。

### 3.3 注册契约

DSH 的快捷键是 `ctx.shortcuts.register(command)`，命令属于插件 fiber，插件卸载即消失。
参考 `@deepseek-ai/dsh-client-ui-layout` 的 `sidebar.left.toggle`：

```js
ctx.effect(() => ctx.shortcuts.register({
  id: "quickChat.toggle",
  label: () => t("shortcut.toggle"),
  aliases: ["quick chat", "explain concept", "快捷提问"],
  defaults: {
    "desktop:macos":   { code: "KeyK", modifiers: ["primary", "alt"] },
    "desktop:windows": { code: "KeyK", modifiers: ["primary", "alt"] },
    "desktop:linux":   { code: "KeyK", modifiers: ["primary", "alt"] },
    "web:macos":       { code: "KeyK", modifiers: ["primary", "shift"] },
    "web:windows":     { code: "KeyK", modifiers: ["primary", "shift"] }
  },
  regions: ["page", "editable"],
  modals: [],
  resolve: () => ({ status: "handled", run: () => controller.toggle() })
}), "quick-chat: toggle shortcut");
```

- `regions: ["page", "editable"]`：在页面和输入框里都能触发，用户在 composer 里也能按。
- `modals: []`：有模态框时不触发，避免和设置页、确认框抢输入。
- `resolve` 返回 `blocked` 时带原因（例如「当前没有可用模型」），DSH 会显示提示。

## 4. 布局规范

### 4.1 紧凑态（默认）

```
┌──────────────────────────────────────────────────────┐
│ ✦  问点什么…                          [联网]   [→]  │  48px
└──────────────────────────────────────────────────────┘
   ↑ 16px 图标    ↑ 14/22 placeholder        ↑ 28px 圆钮
```

| 项 | 值 |
|---|---|
| 宽度 | `560px`，最大 `calc(100vw - 48px)` |
| 高度 | `48px` |
| 内边距 | `6px 8px 6px 12px` |
| 圆角 | `var(--dsw-radius-lg)` = 16px |
| 背景 | `var(--dsw-alias-bg-layer-2)` |
| 描边 | 由 `--dsw-elevation-prominent` 的 0.5px stroke 提供；不要再加 `border` |
| 阴影 | `var(--dsw-elevation-prominent)` |
| 图标 | `light-outline` 16px，`label-tertiary` |
| 输入 | 14px/22px，`label-primary`；placeholder `label-dimmed` |
| 发送 | 28px 圆钮，`button-primary-fill` + `label-primary-inverted` |
| 联网 | 28px 胶囊按钮，默认 `label-tertiary`；开启后 `state-business-primary` |

> 为什么是 48px：MineCodex 实测原生紧凑条就是 48px，按钮上下各 10px。
> DSH 的控件高度体系里 48px 也正好是「一行输入 + 上下留白」的自然高度。

### 4.2 展开态

```
┌──────────────────────────────────────────────────────┐
│ ✦ 快捷提问                    [历史] [最小化] [×]    │  44px
├──────────────────────────────────────────────────────┤
│  [🔗 引用：当前选中的 2 行 ×]                        │  32px
│                                                      │
│  你                                                   │
│  什么是 MCP？                                         │
│                                                      │
│  助手                                                 │
│  MCP 是 Model Context Protocol……                      │
│                                                      │
│  [解释这段] [举个例子] [对比一下]                     │
│                                                      │
├──────────────────────────────────────────────────────┤
│ ＋  继续追问…                          [联网]   [→]  │  56px
│ Enter 发送 · Shift+Enter 换行 · Esc 关闭              │  20px
└──────────────────────────────────────────────────────┘
```

| 项 | 值 |
|---|---|
| 宽度 | `560px`，最大 `calc(100vw - 48px)` |
| 高度 | `520px`，最大 `calc(100vh - 48px)` |
| 圆角 | 16px（`--dsw-radius-lg`） |
| header | 44px，左右 12px，标题 13/20 500 |
| header 动作 | 28px 圆形按钮，gap 4px；图标 16px |
| 上下文 chip | 28px，`bg-layer-1` + `border-l1`，12/18 |
| 消息区 | `padding: 12px 16px`；用户气泡 `bg-layer-3`，助手无气泡 |
| 正文 | 14/24，`label-primary` |
| 元信息 | 12/18，`label-tertiary` |
| 代码块 | `markdown-code-block` 背景，`--ds-font-family-code`，11/18 |
| composer | 56px，输入 14/22；发送 28px 圆钮 |
| 提示行 | 20px，12/18，`label-tertiary` |
| 滚动条 | `--dsw-alias-scrollbar-bg-l1` / `hover-l2`，宽度 `--dsh-scrollbar-width` |

### 4.3 位置

- 默认锚定主内容区右下角：`right: 24px; bottom: 24px;`。
- 不覆盖主输入框：如果主输入框在底部，浮层底边至少留 24px；展开态向上生长。
- 记住上次位置（`localStorage`），但第一版不做拖拽；第二版再加拖动。
- 窄窗口：`width: min(560px, calc(100vw - 32px))`，`height: min(520px, calc(100dvh - 32px))`。

### 4.4 视觉语言

- **表面**：`bg-layer-2` 不透明底 + `elevation-prominent`（含 0.5px stroke，`border: 0`）；
  把 `--dsw-elevation-stroke-color` 设为 `--dsw-alias-border-l2`，让边缘在浅色/深色下都清楚。
  不用玻璃模糊，避免和 DSH 的菜单材质混在一起；DSH 的对话框也是不透明 `bg-layer-2`。
- **强调**：整窗只有一个蓝色强调（联网开启 / 发送按钮 hover / 链接），
  其余靠字重和层级。发送按钮默认用 DSH 的主按钮填充（`button-primary-fill`），不是蓝色。
- **消息**：用户消息用浅层底色气泡；助手消息直接排在表面上，不加气泡，
  这样读起来像 DSH 的正文，而不是「另一个聊天软件」。
- **图标**：只用 DSH 的 `ICON_SYMBOLS`，不手绘 SVG；默认 16px，密集控件 14px，空态 20px。
- **动效**：打开 160ms `ease-out`，`opacity 0→1` + `translateY(4px)→0`；
  展开 180ms；`prefers-reduced-motion: reduce` 时全部关闭。

## 5. Design token

DSH 的颜色 token 都在 `--dsw-alias-*` 下，几何 token 在 `--dsw-radius-*` / `--dsw-elevation-*`。
下表的值来自本机 DSH **0.2.2-rc.1** 的 `dsh-client-ui-theme` 构建产物；实现时只引用变量，不写死 HEX。

### 5.1 颜色

| 用途 | Token | 浅色解析值 | 深色解析值 |
|---|---|---|---|
| 浮层表面 | `--dsw-alias-bg-layer-2` | `#fff` | `#2c2c2e` |
| 次级表面 / chip | `--dsw-alias-bg-layer-1` | `#fff` | `#232324` |
| 用户气泡 | `--dsw-alias-bg-layer-3` | `#fff` | `#353638` |
| 主文字 | `--dsw-alias-label-primary` | `#0f1115` | `#f9fafb` |
| 次文字 | `--dsw-alias-label-secondary` | `#61666b` | `#cfd3d6` |
| 三级文字 / placeholder | `--dsw-alias-label-tertiary` | `#81858c` | `#adb2b8` |
| 更淡的 placeholder | `--dsw-alias-label-dimmed` | `#e1e5ee` | `#43454a` |
| 半像素描边 | `--dsw-alias-border-l2` | `#0000001a` | `#ffffff1f` |
| 更浅描边 | `--dsw-alias-border-l1` | `#0000000a` | `#ffffff0f` |
| 主按钮底 | `--dsw-alias-button-primary-fill` | 由主题解析 | 由主题解析 |
| 主按钮图标 | `--dsw-alias-label-primary-inverted` | 由主题解析 | 由主题解析 |
| 蓝色强调 / 联网 | `--dsw-alias-state-business-primary` | `#4176e6` | `#7aaaff` |
| hover 底 | `--dsw-alias-interactive-bg-hover` | `#2631480f` | `#ffffff14` |
| 代码块底 | `--dsw-alias-markdown-code-block` | `#f9fafb` | `#1b1b1c` |
| 错误 | `--dsw-alias-state-error-primary` | 由主题解析 | 由主题解析 |
| 成功 | `--dsw-alias-state-success-primary` | 由主题解析 | 由主题解析 |

> 不要用 `--dsw-alias-brand-primary` 当聊天强调色：它是 DSH 的黑/白品牌色，
> 在浅色下是近黑、深色下是近白；聊天里的「联网」「链接」应该用蓝色 business 状态色。

### 5.2 圆角

| Token | 值 | 用途 |
|---|---|---|
| `--dsw-radius-xs` | 4px | 小标签、行内代码 |
| `--dsw-radius-sm` | 8px | 按钮、chip、输入框 |
| `--dsw-radius-md` | 12px | 卡片、消息气泡 |
| `--dsw-radius-lg` | 16px | **浮层主圆角** |
| `--dsw-radius-xl` | 20px | 大卡片（本插件不用） |
| `--dsw-radius-panel` | 28px | DSH 对话框；本插件不用，避免像模态框 |

### 5.3 阴影

| Token | 用途 |
|---|---|
| `--dsw-elevation-prominent` | **浮层主阴影**（含 0.5px 描边） |
| `--dsw-elevation-panel` | 菜单/面板（本插件不用） |
| `--dsw-elevation-soft` | 轻浮起（上下文 chip hover 可选） |

> DSH 的 elevation token 自带 `0 0 0 .5px` 描边；如果用了 elevation，
> 就不要再叠加 `border`，否则描边会变粗。二选一：`elevation-prominent` + `border: 0`。

### 5.4 字体

| 用途 | Token / 值 |
|---|---|
| 正文 | `var(--dsh-content-font-size, 14px)` / `calc(24px + var(--dsh-content-font-delta, 0px))` |
| 次级 | `var(--dsh-content-font-size-secondary, 13px)` / 20px |
| 小字 | 12px / 18px |
| 代码 | `var(--ds-font-family-code)`，`--dsw-font-markdown-code-block` |
| 字重 | 400 / 500 / 600 三档；标题 500，强调 600 |

DSH 的正文大小是用户可调的（10–22px）。quick chat 必须跟随 `--dsh-content-font-size`，
不要在组件里写死 14px，否则用户调大字号后小窗会显得更小。

### 5.5 间距

DSH 没有公开的 spacing token；沿用宿主现有的 4px 栅格：

| 值 | 用途 |
|---|---|
| 4px | 图标与文字、按钮组 gap |
| 8px | 控件内边距、chip 间距 |
| 12px | header 左右、消息区间距 |
| 16px | 消息区左右、浮层内边距 |
| 24px | 浮层与窗口边缘 |

## 6. 图标

DSH 的图标是 `ICON_SYMBOLS`（本机构建产物中枚举到 93 个 outline/fill id），由 `ui-primitives` 的图标组件渲染；
每个 id 有 `*-outline`（1px 描边）和 `*-fill` 两种风格。**不要手绘 SVG，也不要用 Lucide 替换。**

| 场景 | 图标 id | 尺寸 | 说明 |
|---|---|---|---|
| 小窗标题 / 空态 | `light-outline` | 16 / 20 | 「解释概念」的语义，比 sparkles 更克制 |
| 新建话题 | `new-chat-outline` | 16 | 清空当前临时对话 |
| 关闭 | `close-outline` | 16 | header 右侧 |
| 最小化 | `compact-outline` | 16 | 收起到紧凑条 |
| 展开 | `fullscreen-outline` | 16 | 紧凑条 → 展开 |
| 历史 | `clock-outline` | 16 | 本地历史列表 |
| 发送 | `send-outline` | 16 | 发送按钮；也可用 `paper-plane-outline` |
| 停止 | `stop-fill` | 16 | 流式生成中替换发送 |
| 复制 | `copy-outline` | 14 | 回答操作 |
| 已复制 | `check-outline` | 14 | 复制成功 |
| 重试 | `refresh-outline` | 14 | 错误态 |
| 联网 | `globe-outline` | 14 | 「联网」开关 |
| 阅读链接 | `link-outline` | 14 | 上下文 chip / 链接 |
| 附件（第二版） | `paperclip-outline` | 16 | 文件输入 |
| 更多 | `ellipsis-outline` | 16 | 历史、清空、设置 |
| 清空历史 | `trash-outline` | 14 | 历史面板 |
| 错误 | `warning-outline` | 16 | 错误提示 |
| 外部打开 | `right-up-outline` | 14 | 在浏览器打开来源 |
| 思考中 | `think-outline` | 16 | 可选：显示「思考中」 |
| 帮助 | `question-outline` | 14 | 快捷键提示 |

> 图标尺寸：默认 16px；header 动作按钮 28px 圆形，图标 16px；
> 消息内联操作 14px；空态 20px。描边用 `ICON_REGULAR_STROKE`（1px），
> 需要更明显时用 `ICON_MEDIUM_STROKE`（1.3px），不要自己加 `stroke-width`。

## 7. 状态机

```
closed ──toggle──▶ compact ──send/expand──▶ expanded
  ▲                  │  ▲                      │
  │                  │  └──── minimize ────────┘
  │                  │
  └──── close ───────┴──── close（丢弃未发送草稿）
```

| 状态 | 行为 |
|---|---|
| `closed` | 不渲染；保留本地历史；下次打开默认 compact |
| `compact` | 48px 输入条；Enter 发送；发送后进入 expanded；Esc 关闭 |
| `expanded` | 完整对话；可停止、复制、重试；最小化回 compact |
| `minimized` | 第一版不单独做；「最小化」= compact，保留草稿与消息 |
| `history` | 第二版；在 expanded 内切换，不改变主状态 |

### 7.1 关闭语义

- `×` / `Esc`：关闭浮层，**丢弃未发送草稿**；已发送内容保留在本地历史（如果开启）。
- 关闭不取消后台请求？第一版建议 **关闭即 abort**，因为 quick chat 是临时问题；
  如果要保留后台回答，需要像 Codex 一样有「历史」承接，复杂度更高。
- 关闭后不自动重新打开；下次打开是新的临时对话（或从历史选择）。

### 7.2 焦点

- 打开：聚焦输入框；记录打开前的 `document.activeElement`。
- 关闭：把焦点还给打开前的元素；如果元素已消失，焦点回到主内容区。
- 非模态：不 trap focus；用户可以直接点主界面。但 `Esc` 只在浮层内生效，
  避免抢主界面的 Esc。

## 8. 架构

### 8.1 两半分工

```
┌─────────────────────────────┐
│ Client（client.js）         │
│  • shell.overlay 浮层        │
│  • 快捷键 quickChat.toggle   │
│  • 本地历史 localStorage     │
│  • 上下文 chip / 选中文本    │
│  • SSE 解析 / 停止 / 重试    │
└──────────────┬──────────────┘
               │ POST /vt-quick-chat/api/chat (SSE)
┌──────────────▼──────────────┐
│ Host（index.js）             │
│  • webServer 路由 + 鉴权     │
│  • ctx.llm.stream()          │
│  • provider/model 解析       │
│  • 请求体校验 / 截断         │
│  • 不写 session log          │
└─────────────────────────────┘
```

### 8.2 Client 半边

**注入**：`['slots', 'locale', 'shortcuts']`（如果需要主题快照，再加 `theme`）。

**浮层**：注册到 `shell.overlay`（DSH 根级 list 槽位，官方示例就是浮层）：

```js
ctx.slots.inject("shell.overlay", () => ctx.slots.register({
  name: "shell.overlay",
  id: "quick-chat",
  order: 100,
  label: () => t("panel.label")
}, QuickChatOverlay));
```

- `order: 100` 让它排在其他 overlay 之后；具体层级还要用 z-index 验证。
- 组件自己画 `position: fixed` 的浮层；`shell.overlay` 只提供挂载点。
- 不要在 `main` 或 `sidebar` 里注册，否则会替换主界面。

**快捷键**：见第 3 节。

**本地历史**：

```js
const STORAGE_KEY = "dsh-vt-quick-chat:history:v1";
// [{ id, title, createdAt, messages: [{ role, content }] }]
```

- 最多 20 条；超出淘汰最旧。
- 只存文本，不存附件/图片。
- 设置项「保留历史」默认开启？建议默认 **开启**，但关闭窗口时清空当前草稿；
  历史面板里可以「清空全部」。
- 如果用户选择「不保留历史」，关闭即丢弃已发送内容。

**上下文**：

- 第一版：`window.getSelection().toString()` 作为「引用选中文字」；
  如果为空，不显示 chip。
- 第二版：在 `conversation.chat.flow` 或 `conversation.input.dock` 注册一个
  **不渲染 DOM 的桥**，用 `useProjection` 读取当前会话最后 N 条消息，写入一个 mirror；
  浮层读取 mirror。这个模式在 `vt-steer-now` 里已经用过（inbox mirror）。
- 不要把整个会话/工作区自动塞进去；chip 上要显示「引用了什么」，可一键移除。

**流式**：

```js
const response = await fetch("/vt-quick-chat/api/chat", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ messages, context }),
  signal
});
const reader = response.body.getReader();
// 解析 text/event-stream：data: {"type":"delta","text":"..."}
```

- `AbortController` 绑定「停止」和「关闭」。
- 解析时按 `\n\n` 分帧，忽略注释行；错误帧显示可读错误。
- 生成中发送按钮换成 `stop-fill`；停止后保留已生成文本。

### 8.3 Host 半边

**注入**：`['webServer', 'llm']`；`agentDefaultModel` 用 `ctx.get('agentDefaultModel')` 软取。

**路由**：

```js
const ROUTE_PREFIX = "/vt-quick-chat/api";

ctx.effect(() => ctx.webServer.register({
  kind: "prefix",
  path: ROUTE_PREFIX,
  handler: (req, res) => handle(req, res, api, admitted)
}), "quick-chat: chat route");
```

- 只接受 `POST`；`GET` 返回 405。
- 每个请求过 `ctx.connection.requestRejection(req)`，与 `/api` 同一套鉴权。
- 请求体上限建议 256 KiB；消息条数上限 40；单条文本上限 16k 字符。
- 不接受任意 URL、文件路径、工具名。

**模型调用**：

```js
const selection =
  ctx.get("agentDefaultModel")?.currentSelection() ??
  firstAvailableModel(ctx.llm);

const options = {
  provider: selection.provider,
  model: selection.model,
  system: QUICK_CHAT_SYSTEM_PROMPT,
  messages: [
    ...(context ? [{ role: "user", content: [{ type: "text", text: contextBlock(context) }] }] : []),
    ...history
  ],
  maxTokens: 2048,
  purpose: "quick-chat",
  signal
};

for await (const chunk of ctx.llm.stream(options)) {
  // 把 text-delta 转成 SSE
}
```

- **不传 `sessionId`**：避免任何 session 关联。
- **不传 `tools`**：quick chat 不调用工具。
- `purpose: "quick-chat"`：标记为辅助请求；如果 DSH 的类型校验要求先声明
  `LlmRequestPurposeMap`，在 TS 插件里做 module augmentation；JS 插件运行时按字符串传递。
- `system`：写清楚「你是 DSH 的快捷提问助手；只解释概念；不执行任务；不假装调用工具；
  回答尽量短；需要时给例子；不确定就说不知道」。
- 如果 provider 不支持 `system` 字段，改用 messages 里的 system 消息（按 adapter 契约）。

**SSE 帧**：

```text
data: {"type":"delta","text":"MCP 是"}
data: {"type":"delta","text":" Model Context Protocol"}
data: {"type":"done","usage":{"inputTokens":...,"outputTokens":...}}
```

错误：

```text
data: {"type":"error","code":"NO_MODEL","message":"当前没有可用模型"}
```

**为什么不用 Session**：

- `ctx.llm.stream()` 是 DSH 的模型调用服务，不要求 Session；
  `dsh-compaction-basic` 等辅助调用就是直接用它。
- 只要不传 `sessionId`、不调用 `ctx.sessions`、不经过 agent loop，
  **预期**这次请求不会进入 session log，也不会出现在侧栏；
  这一点必须在 Phase 0 用实际数据验证，不能仅凭推断（见 8.6）。
- 需要在 spike 里验证：调用后 `sessions.list` 不新增、session log 不新增。

### 8.4 模型解析

优先级建议：

1. 插件设置里的 `quickChat.model`（如果做设置页）；
2. `ctx.agentDefaultModel.currentSelection()`（如果 profile 挂了这个服务）；
3. 遍历 `ctx.llm.listProviders()`，对每个 provider 调 `ctx.llm.listModels(provider.id)`，
   取第一个可用条目；
4. 都没有 → 返回 `NO_MODEL`，UI 显示「请先在设置里选择模型」。

不要假设 `deepseek-official` 一定存在；DSH 可能用 account 路由或 pi-ai 路由。

### 8.5 联网（第二版）

两条路线：

- **A. 独立 Search API**：Host 先请求 DeepSeek Search，把结果拼成文本，再走 `ctx.llm.stream()`。
  优点：不绕过 DSH 的 LLM 服务；缺点：引用/深度搜索要自己做。
- **B. 直接 Chat Completions**：Host 直接请求 DeepSeek，声明 `deepseek_web_search`。
  优点：1:1 网页端；缺点：绕过 DSH 的模型路由/凭证/重试。

第一版不做联网；第二版先做 A，验证体验后再决定是否做 B。

### 8.6 与 DSH「模型输入可重建」不变量的关系

`@deepseek-ai/dsh-llm` 的 README 写了一条不变量：

> Callers must keep all model-visible input reconstructable from the session log.

quick chat 的目标是「不创建 Session、不写 session log」，这跟不变量有潜在冲突。
需要在 Phase 0 明确三选一：

1. **按辅助请求处理**：`purpose: "quick-chat"`，像标题生成、auto-review 一样是辅助调用；
   不进入 session log，但插件自己保留一份本地记录（localStorage 或插件日志）用于排查。
   这是最贴近产品目标的方案，但需要确认 DSH 是否接受这种边界。
2. **写插件自己的日志**：不写 session log，但写插件自己的本地记录；
   这能满足「可重建」的精神，但不是 session log。
3. **完全不保留**：关闭即丢弃，不追求可重建；产品上最轻，但和不变量的冲突最明显。

建议第一版采用 **1 + 2**：`purpose` 标记辅助请求，同时把 quick chat 历史留在本地。
Phase 0 要向 DSH 源码/维护者确认：

- `ctx.llm.stream()` 在无 `sessionId`、有 `purpose` 时是否仍会写 session log；
- 如果会写，是否有显式关闭的方式；
- 如果不会写，辅助请求是否需要独立的审计记录。

这个确认结果会直接影响「关闭即丢弃」还是「关闭保留本地历史」的默认值。

## 9. 错误与边界

| 情况 | UI | 处理 |
|---|---|---|
| 没有可用模型 | 浮层内错误卡片 | 「请先在设置里选择模型」+ 打开设置 |
| 凭证缺失 / 401 | 错误卡片 | 「当前 provider 未登录」+ 打开模型设置 |
| 429 / 限流 | 错误卡片 | 「请求太频繁，稍后再试」+ 重试 |
| 网络中断 | 错误卡片 | 保留已生成文本 + 重试 |
| 用户停止 | 保留已生成文本 | 发送按钮恢复 |
| 请求体过大 | 400 | 客户端先截断，Host 再校验 |
| 浮层渲染异常 | 局部错误边界 | 不让错误冒泡到 `shell.overlay`，避免整个界面挂掉 |

> DSH 的 `shell.overlay` 没有自动错误边界；组件必须自己包一层 error boundary，
> 这与 `vt-web-chat` 的做法一致。

## 10. 无障碍

- 浮层：`role="dialog"` + `aria-modal="false"` + `aria-label="快捷提问"`。
- 输入：`aria-label="快捷提问输入"`；发送/停止按钮有 `aria-label`。
- 焦点：打开聚焦输入；关闭归还焦点；`Esc` 只在浮层内关闭。
- 键盘：`Enter` 发送，`Shift+Enter` 换行；输入法组合中（`isComposing`）不发送。
- 动效：`prefers-reduced-motion: reduce` 时关闭所有过渡。
- 对比度：正文 `label-primary` 在 `bg-layer-2` 上满足 AA；三级文字只用于辅助信息。
- 屏幕阅读器：流式回答用 `aria-live="polite"`，但不要每个 token 都播报；
  建议按段落/完成时更新。

## 11. 安全

- API Key / account token 只在 Host 半边；客户端只拿 SSE 文本。
- 路由鉴权与 DSH `/api` 一致；请求体有上限；只接受白名单字段。
- 不接受客户端传来的 `provider` / `model` 任意值？如果允许模型选择，
  必须校验它在 `ctx.llm.listModels()` 里；否则用服务端解析的 selection。
- 不执行工具、不读文件、不发起任意 URL 请求。
- 本地历史是明文 `localStorage`；UI 上说明「只保存在本机浏览器」。
- 关闭浮层即 abort 请求（第一版），避免后台继续计费。

## 12. 分阶段实现

| 阶段 | 内容 | 预估 |
|---|---|---|
| **Phase 0 · Spike** | Host 路由 + `ctx.llm.stream` + SSE + 最小浮层 + 快捷键；验证不新增 session | 0.5–1 天 |
| **Phase 1 · MVP** | 紧凑/展开、流式、停止、复制、重试、错误态、本地历史、选中文本 chip | 2–3 天 |
| **Phase 2 · 增强** | 当前对话上下文桥、联网开关、模型选择、插入到主输入框、拖动位置 | 2–3 天 |
| **Phase 3 · 可选** | 文件输入、语音、深度搜索、引用列表、导出 | 按需 |

### Phase 0 的验收问题

1. `ctx.llm.stream()` 不传 `sessionId` 能否正常返回？
2. 调用后 `ctx.sessions.list` 是否不新增？session log 是否不新增？
3. `purpose: "quick-chat"` 在 JS 插件里是否被接受？
4. `shell.overlay` 的 z-index 与 DSH 模态框/菜单的关系？
5. `ctx.shortcuts.register` 的 Desktop `Mod+Alt+K` / Web `Mod+Shift+K` 是否与现有默认值冲突？

## 13. 验收清单

- [ ] 快捷键打开/关闭；输入框自动聚焦；关闭后焦点归还。
- [ ] 侧栏不新增 session；session log 不新增；不生成标题。
- [ ] 不注册 agent 工具、不读写工作区文件；联网时只声明 DeepSeek 服务端工具。
- [ ] 流式输出可见；停止可用；重试可用；错误可读。
- [ ] 浅色/深色都只用 `--dsw-*` token；没有硬编码 HEX（fallback 除外）。
- [ ] 图标全部来自 DSH `ICON_SYMBOLS`；没有手绘 SVG。
- [ ] 字号跟随 `--dsh-content-font-size`；用户调大字号不破版。
- [ ] 非模态：主界面可继续操作；`Esc` 不抢主界面。
- [ ] `prefers-reduced-motion` 生效。
- [ ] 请求体上限、路由鉴权、模型白名单、关闭 abort。
- [ ] 本地历史可清空；关闭丢弃未发送草稿。

## 14. 未决问题

1. **模型选择**：quick chat 是跟随当前 session 的模型，还是用 DSH 默认模型？
   建议第一版用默认模型，设置页可改。
2. **上下文范围**：只带选中文本，还是也带最后两轮？
   建议第一版只带选中文本；第二版加「引用当前对话」开关。
3. **联网**：已决定——按钮常驻，默认关闭；开启后声明 `deepseek_web_search` +
   `deepseek_read_url`，回答带引用，底部显示本轮搜索/抓取次数。
4. **历史**：默认保留还是默认不保留？
   建议默认保留（最多 20 条），但关闭时丢弃未发送草稿；设置里可关。
5. **浮层层级**：`shell.overlay` 的容器是否有 stacking context？
   需要 spike 确认；不要用 `z-index: 2147483000` 这种硬编码。
6. **DSH 版本**：当前插件约定 `engines.dsh: ">=0.2.1-rc.5 <0.3.0"`；
   `shell.overlay` / `ctx.shortcuts` / `ctx.llm.stream` 在这些版本里的稳定性需要回归。
7. **DeepSeek 服务端工具**：已确认 `dsh-llm-deepseek` **不透传** —— 在 app.asar 里搜
   `deepseek_web_search` / `deepseek_read_url` 得到 0 处引用。因此 v1.1.0 改为 Host 直连
   `api.deepseek.com/anthropic/v1/messages`，凭证用 `deepseekAccount.resolveToken()`
   （请求头 `x-dsh-auth-token`），API Key 兜底（`x-api-key`）。这条路线已实现并通过测试。
