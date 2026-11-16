# 02 · Codex / MineCodex Quick Chat 与 harness 机制

> 证据来源：
> - 本机 `ChatGPT.app` **26.1111.21308**（build 27194）的 `app.asar` 内构建产物；
> - 本机 `MineCodex` **2.1.3** 的 `features/quick-chat/DESIGN.md`、`DEVELOPMENT.md`；
> - 两者都是本机安装版本，构建哈希与压缩名会随版本变化，本文只记录语义。
>
> 结论先行：Codex 的 Quick Chat 不是「再开一个正式会话」，而是
> **浮层窗口 + 临时侧对话（ephemeral side conversation）**：
> 只读、无工具、不进入历史、不进入会话列表。

## 1. 先区分三个容易混淆的东西

| 名称 | 是什么 | 入口 | 对我们的价值 |
|---|---|---|---|
| **ChatGPT 桌面端 Quick Chat** | 经典的小聊天浮层，紧凑输入条 ↔ 展开正文 | `⌘⌥N` / `Ctrl+Alt+N` | **布局与交互的主要参考**（MineCodex 增强的就是它） |
| **Codex App 的 Mini / Avatar Overlay** | 宠物头像上方的浮层，含语音与 `quick-chat` 呈现 | 命令 `openAvatarOverlay`，macOS `Alt+Space` | **窗口与呈现状态机的参考** |
| **Codex harness 的临时侧对话** | `ephemeral: true` + `sideConversation: true` 的线程 | 由浮层/侧栏发起 | **「不新开会话」的机制参考** |

这三者不是同一个东西。MineCodex 的文档主要描述第一个；Codex App 的 `avatar-overlay`
是第二个；第三个是 harness 层如何保证「临时」语义。我们的插件要把三者的优点拆开用：
**布局学第一个，窗口状态学第二个，会话语义学第三个。**

## 2. MineCodex 对 Quick Chat 的定义

MineCodex 的 `features/quick-chat/DESIGN.md` 把原生 Quick Chat 的契约写得很具体：

### 2.1 快捷键

- Windows：`Ctrl+Alt+N`
- macOS：`⌘⌥N`
- 原生命令缺失时，MineCodex 自己补偿；官方恢复 `quickChat` 命令后让回原生处理。
- `⌘⇧N` 的 Temporary Chat 不受影响。
- 再次按键：已显示时最小化，最小化时恢复已有会话，完全退出后调用原生 New chat。

### 2.2 形态与状态

- **紧凑态**：一条输入横条，原生高度 48px；只有输入、添加、选项、麦克风、语音等按钮。
- **展开态**：正文 + header；header 右侧是 Close，Close 左侧是原生 Drag 手柄。
- **最小化**：保留会话与草稿；恢复后回到原来的 compact / expanded 形态。
- **关闭**：结束本次 Quick Chat，**丢弃本浮层未发送的文字与附件草稿，不弹确认**；
  已发送历史保留，不影响主页面草稿；生成中的回答继续后台执行，之后从历史查看。
- **History**：只出现在紧凑态的原生 standalone 悬浮控制区，紧邻 Minimize 左侧，边缘间距 8px；
  正文展开或历史展开时，History 替换为 Close。

### 2.3 视觉细节

- History 图标使用 **16×16 Lucide 官方资源**，匹配原生项目选择器的小图标层级。
- 原生浮层圆角 **22px**；紧凑态与展开态共用单行输入对齐补偿。
- 原生 footer 的 `align-items` 为 `end`，编辑器默认 36px、按钮 28px，文字中线高出 4px；
  MineCodex 把编辑器单行高度绑定到按钮高度，使中线一致。
- 紧凑态 48px 横条中，按钮上下各留 10px。

### 2.4 明确不做的事

- 不复制原生历史数据；History 只是调用原生历史动作。
- 不接管发送；提交事件只记录基线，原生发送确认后才展开。
- 不创建新的聊天数据模型；列表、分页、选择行为由原生拥有。
- 关闭不销毁会话；不取消后台回答。

> 对我们的启示：**Quick Chat 的「轻」来自状态机，不来自功能少。**
> 它仍然有历史、最小化、恢复、关闭、草稿丢弃，但这些状态都属于浮层自己，
> 不属于正式会话。

## 3. Codex App 的 Mini / Avatar Overlay

在 `ChatGPT.app` 的主进程构建产物里，命令定义是：

```js
{
  id: "openAvatarOverlay",
  titleIntlId: "codex.command.showMiniOverlay",
  descriptionIntlId: "codex.commandDescription.showMiniOverlay",
  availableIn: ["electron"],
  shortcutScope: "os-global",
  electron: {
    menuTitle: "Toggle Mini",
    platformDefaultKeybindings: {
      macOS: [{ key: "Alt+Space" }],
      default: [{ key: "Super+Alt+P" }]
    }
  }
}
```

关键点：

- 它是 **OS 级快捷键**（`shortcutScope: "os-global"`），不是普通应用内快捷键；
- macOS 默认 `Alt+Space`，其他平台 `Super+Alt+P`；
- 菜单名是 **Toggle Mini**，说明它的产品语义是「切换 Mini」，不是「新建会话」。

浮层控制器（构建产物里的 `uc` 类，日志名 `avatar-overlay-realtime`）负责：

- `isSessionReserved()`：是否已有会话/启动中；
- `requestStart(source, ...)`：按来源启动；
- `startIfReady()`：窗口与 renderer 就绪后启动；
- `injectContext(...)`：把当前上下文注入浮层会话；
- `toggleGlobalHotkeySession()`：全局快捷键的「打开 / 最小化 / 恢复」切换。

它记录的启动来源包括：

| 来源 | 含义 |
|---|---|
| `global_hotkey_new_thread` | 全局快捷键新开 |
| `composer_button_new_thread` | 主输入框按钮新开 |
| `composer_button_existing_thread` | 主输入框按钮基于当前线程打开 |

呈现面（presentation surface）有两种：

| 值 | 含义 |
|---|---|
| `main-thread` | 在主窗口内呈现 |
| `global-overlay` | 在全局浮层呈现 |

> 对我们的启示：**浮层不是模态框。** 它有自己的「呈现面」和「启动来源」，
> 主窗口仍然可交互。DSH 的 `shell.overlay` 槽位正好对应 `global-overlay`。

## 4. Codex harness 的临时会话机制（最关键）

### 4.1 临时生成线程：只读、无工具、无 MCP

在 `ChatGPT.app` 的构建产物里，有一个创建临时线程的 helper（压缩名为 `J`），
它启动线程时使用下面这组参数：

```js
startThread({
  model,
  modelProvider: null,
  allowProviderModelFallback: true,
  cwd,
  approvalPolicy: "never",
  permissions: ":read-only",
  runtimeWorkspaceRoots: [],
  config: {
    ...config,
    "mcp_servers.codex_app": { enabled: false, command: "" },
    model_reasoning_effort: effort
  },
  personality: null,
  ephemeral: true,
  threadSource: source,
  experimentalRawEvents: false,
  dynamicTools: null,
  serviceTier: serviceTier ?? null,
  baseInstructions,
  developerInstructions
})
```

同时，它使用一份「关闭大部分能力」的 config：

```js
{
  include_permissions_instructions: false,
  include_apps_instructions: false,
  include_environment_context: false,
  project_doc_max_bytes: 0,
  apps: { _default: { enabled: false, destructive_enabled: false, open_world_enabled: false } },
  skills: { bundled: { enabled: false }, config: [] },
  memories: { use_memories: false, generate_memories: false },
  "features.apps": false,
  "features.plugins": false,
  "features.tool_suggest": false,
  "features.shell_tool": false,
  "features.unified_exec": false,
  "features.shell_snapshot": false,
  "features.apply_patch_freeform": false,
  "features.js_repl": false,
  "features.code_mode": false,
  "features.multi_agent": false,
  "features.image_generation": false
}
```

这组配置的语义非常明确：

- **只读**：`:read-only`，没有工作区写权限；
- **无工具**：`dynamicTools: null`，shell / apply_patch / js_repl / code_mode / multi_agent 全部关闭；
- **无 MCP**：`mcp_servers.codex_app` 关闭；
- **无技能/记忆/应用**：skills、memories、apps 全部关闭；
- **无环境上下文**：不注入 project doc、不注入环境信息；
- **临时**：`ephemeral: true`，线程不进入正式历史。

> 这是 Codex 对「临时问题」的 harness 答案：**不是把主会话复制一份，而是起一个能力被削到最小的临时线程。**
> 它只保留模型推理，不保留 agent 的行动能力。

### 4.2 临时侧对话：`ephemeral` + `sideConversation`

在 renderer 的会话读取路径里，有一段逻辑：

```js
const context = await host.getFollowUpContext(conversationId)
const history =
  context?.ephemeral === true && context.sideConversation
    ? await host.getLoadedConversationHistory(conversationId)
    : null
```

另有一个判定：

```js
function isEphemeralSideConversation(conversation) {
  return conversation.ephemeral === true && conversation.sideConversation === true
}
```

含义：

- 普通 follow-up 只拿 `getFollowUpContext`（标题、cwd、最近两轮等）；
- 只有 **同时** `ephemeral === true` 且 `sideConversation === true`，才会加载完整会话历史；
- 也就是说，**侧对话是「附着在当前线程上的临时分支」**，它需要当前线程的上下文，
  但自己不作为正式线程存在。

### 4.3 临时线程如何被排除在历史之外

构建产物里有两处明确排除：

```js
// 最近会话列表：临时会话与侧对话不进入
ensureRecentConversationId(id) {
  const conversation = this.conversations.get(id)
  this.isEphemeralConversation(id) ||
    conversation?.attachedToThreadId != null ||
    conversation?.sideConversation === true ||
    this.recentConversationIds.includes(id) ||
    this.recentConversationIds.unshift(id)
}
```

```js
// 线程目录：ephemeral 直接跳过
function toCatalogEntry(thread) {
  if (thread.ephemeral || ...) return null
  ...
}
```

> 这就是「不新开 session」的实现方式：
> **线程可以存在，但它被标记为临时，所有「正式历史」的入口都跳过它。**

### 4.4 上下文注入

浮层控制器有 `injectContext()`：

```js
async injectContext(context) {
  await this.contextProvider?.dup()?.injectContext(context)
}
```

配合 `requestStart(source, ..., contextProvider)`，浮层可以把「当前线程 / 当前选中内容」
作为上下文注入临时会话，而不是让用户重新解释背景。

> 对我们的启示：quick chat 应该支持「带一点当前对话上下文」，
> 但上下文的来源和范围要由用户可见、可关闭，不能悄悄把整个工作区塞进去。

## 5. 从 Codex 到 DSH：映射表

| Codex 的做法 | DSH 里的对应实现 | 说明 |
|---|---|---|
| `openAvatarOverlay` 命令 | `ctx.shortcuts.register({ id: "quickChat.toggle" })` | DSH 的快捷键服务支持 desktop/web 分平台默认值 |
| `global-overlay` 呈现面 | `shell.overlay` 槽位 | DSH 的根级 list 槽位，官方示例就是浮层 |
| 浮层自己的 compact / expanded / minimized 状态 | 客户端组件本地状态 | 不进入 session，不进入布局 store |
| `ephemeral: true` | 不创建 Session，直接 `ctx.llm.stream()` | DSH 的模型调用不要求 Session |
| `sideConversation` 读当前线程上下文 | 客户端截取当前对话片段，随请求发送 | 用户可见、可关闭 |
| `permissions: ":read-only"`、`dynamicTools: null` | 不注册任何工具，不给模型工具定义 | 模型只能回答，不能行动 |
| 临时线程不进入最近列表 | 不写 session log、不进入侧栏 | 没有「最近列表」可污染 |
| `⌘⌥N` / `Alt+Space` | Desktop `Mod+Alt+K`；Web `Mod+Shift+K` | 见 03 文档的冲突分析 |
| 22px 圆角、原生 glass | `--dsw-radius-lg` 16px + `--dsw-alias-bg-layer-2` + `--dsw-elevation-prominent` | 跟随 DSH 的视觉体系，不照搬 macOS 材质 |

## 6. 证据边界与风险

- 本文对 Codex 的结论来自 **本机安装包的压缩产物**。压缩名、模块边界、字段名可能随版本变化；
  插件实现不应依赖这些名字，只应依赖「临时、只读、无工具、不进历史」这些语义。
- `avatar-overlay-realtime` 主要是 **语音/实时** 浮层；经典 Quick Chat 是另一个功能。
  本文把两者分开，只把「窗口状态机」和「临时会话语义」作为参考。
- MineCodex 的 `DESIGN.md` 是对 **ChatGPT 桌面端 Quick Chat** 的原生契约描述，
  不是 Codex App 的实现文档。引用时不要混用。
- 我们没有运行原生 Quick Chat 做 GUI 验收；本文的布局数值来自 MineCodex 的实测记录，
  实现时应以 DSH 自己的 token 和实际渲染为准。
