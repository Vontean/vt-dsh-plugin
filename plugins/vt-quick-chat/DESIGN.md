# 快捷提问 · 设计说明

> 包名 `dsh-vt-quick-chat`，目录 `plugins/vt-quick-chat/`。
> 目标：agent 执行任务中按快捷键弹出临时小窗解释概念；不创建 Session、不写 session log、
> 不调用工具、不进侧栏。范围：Desktop `⌘⇧K`（Web 不提供）、`shell.overlay` 非模态浮层、
> 紧凑/展开两态、`ctx.llm.stream()` 流式、本地历史、只用 DSH token 与 `ICON_SYMBOLS`。

## 1. 问题与边界

### 1.1 用户问题

DSH 正在跑 agent 任务时，用户经常遇到一个不懂的词。写进主对话会打断任务；新开 Session
会进入侧栏、生成标题、写 session log；用外部浏览器又要重新解释背景。用户需要的是一次
**临时、只读、可丢弃**的解释。

### 1.2 目标

| 目标 | 可观察的验收 |
|---|---|
| 随时可开 | 快捷键打开，输入框自动聚焦 |
| 不打断主任务 | 主对话/主输入框/侧栏不被替换；浮层非模态 |
| 不产生会话 | 侧栏不新增 session；session log 不新增；不生成标题 |
| 能解释概念 | 多轮、流式、停止、复制、重试 |
| 带一点上下文 | 默认带当前选中文本；可移除 |
| 和 DSH 一致 | 只用 `--dsw-*` / `--dsh-*` token 与 DSH 图标；浅色/深色/大字号都对 |
| 安全 | 凭证只在 Host；路由鉴权；请求体上限；不传 tools / sessionId |

### 1.3 非目标（第一版）

不创建 Session、不进入侧栏/最近会话、不写 session log；不调用工具、不读写工作区文件、
不执行命令；不做联网搜索、文件/图片输入、语音、深度思考；不接管主输入框；不做云同步。

## 2. 架构

```
┌──────────────────────────────────────────────┐
│ Client（client.js）                           │
│  • shell.overlay 浮层（list 槽位，root 作用域）│
│  • quickChat.toggle 快捷键                    │
│  • 紧凑/展开状态机、草稿、本地历史             │
│  • 选中文本 chip                              │
│  • SSE 解析 / 停止 / 重试 / 复制               │
└──────────────────┬───────────────────────────┘
                   │ POST /vt-quick-chat/api/chat (SSE)
┌──────────────────▼───────────────────────────┐
│ Host（index.js）                              │
│  • webServer 前缀路由 + connection 鉴权        │
│  • 请求体校验 / 截断 / 服务端块白名单          │
│  • 凭证：账号授权 → DEEPSEEK_API_KEY          │
│  • 直连 api.deepseek.com Messages → SSE 帧    │
│  • 联网：deepseek_web_search / read_url       │
│  • 无凭证时降级到 ctx.llm.stream()            │
│  • 不传 sessionId / 不注册 agent 工具          │
└──────────────────────────────────────────────┘
```

### 2.1 为什么需要 Host 半边

模型调用要碰凭证、取消与失败码，这些只能留在 Host 进程。浏览器侧只拿同源 SSE 文本，
看不到 account token 或 API Key。Host 只做「把一段临时对话翻译成一次模型调用」，不接触 Session。

### 2.1.1 为什么直连 DeepSeek 而不只用 ctx.llm.stream()

DSH 内置的 DeepSeek adapter 不透传 `deepseek_web_search` / `deepseek_read_url` 这两个
**服务端工具**（在 app.asar 里搜不到这两个名字），所以 `ctx.llm.stream()` 拿不到网页端
的搜索与读链接能力。要在小窗里复现网页端行为，只能由 Host 直接调
`POST https://api.deepseek.com/anthropic/v1/messages`，并在 `tools` 里声明它们。

代价是这条通道要自己解析 SSE、自己保存服务端块。收益是：联网、引用、读链接与网页端一致。

`ctx.llm.stream()` 保留为降级通道：没有 DeepSeek 凭证时，小窗仍然可用，只是没有联网。

### 2.2 为什么不是 Session

- 不传 `sessionId`、不调用 `ctx.sessions`、不经过 agent loop；
- 不注册任何 DSH agent 工具；联网时声明的是 DeepSeek 的**服务端工具**，由 DeepSeek
  执行，不触碰工作区；
- 小窗自己的状态（紧凑/展开、草稿、历史）只属于浮层，不进入 layout store；
- 因此侧栏、session log、「最近会话」都没有可写入的入口。

降级通道里 `ctx.llm.stream()` 的 `purpose: "quick-chat"` 把调用标记为辅助请求，与标题
生成、compaction 同类；不进入普通对话链路。主通道是直连 DeepSeek，天然不在任何 session 里。

## 3. 数据流

1. 用户选中一段文字，按快捷键。
2. Client `controller.open()`：
   - 读取 `window.getSelection()`（忽略浮层内部的选择）；
   - 进入 `compact`，输入框聚焦。
3. 用户输入并按 Enter：
   - 消息进入本地状态，切到 `expanded`；
   - `POST /vt-quick-chat/api/chat`，body 为 `{ messages, selection, web }`。
4. Host：
   - 鉴权 → 路径/方法 → 请求体上限 → 消息校验（只允许 user/assistant，截断到最近 40 条）；
   - assistant 消息的 `blocks` 过白名单与 96 KiB 上限；user 消息的 `files` 只认 `file-api-` id；
   - 附件先经 `/upload` 转发到 DeepSeek Files API，拿回 `file_id` 后再进对话；
   - 解析凭证：`deepseekAccount.resolveToken()` → `credentials.resolve('DEEPSEEK_API_KEY')`；
   - 有凭证：`POST api.deepseek.com/anthropic/v1/messages`；`web` 为真时带两个服务端工具，
     `deepThink` 为真时带 `thinking: {type:'enabled'}`，有附件时带 `anthropic-beta`；
   - 无凭证：降级到 `ctx.llm.stream()`。
5. Host 把上游事件转成 SSE：
   - `{"type":"start","via","provider","model","web"}`
   - `{"type":"delta","text"}`
   - `{"type":"tool","action","queries","url"}`（搜索 / 打开网页 / 读链接）
   - `{"type":"citation","url","title"}`
   - `{"type":"blocks","blocks"}`（assistant 完整内容块，下一轮原样回传）
   - `{"type":"done","usage","tools","truncated"?}` / `{"type":"error","code","message"}` / `{"type":"aborted"}`
6. Client 增量渲染；`blocks` 暂存，`done` 时连同引用一起写进本地历史。
7. 关闭：abort 请求、丢弃未发送草稿、已发送内容留在历史。

## 4. 状态机

```
closed ──toggle/open──▶ compact ──send──▶ expanded
  ▲                        │  ▲              │
  │                        │  └── minimize ──┘
  └──────── close ─────────┴──── close
```

| 状态 | 行为 |
|---|---|
| `closed` | 不渲染；历史保留；下次打开是新的临时对话 |
| `compact` | 48px 输入条；Enter 发送；有对话时上方多一条 36px 状态行 |
| `expanded` | 36px 状态行 + 消息区 + composer + 提示行；可停止/复制/重试/历史 |
| `history` | expanded 内的子视图；不改变主状态。列表是 DSH 会话列表那种单行结构：标题 + 右侧相对时间，hover 时时间换成删除 |

### 设置（settings.section）

小窗自己的配置放在 DSH 的 Settings 里，不再是写死的常量：

| 设置项 | 作用 | 落点 |
|---|---|---|
| 系统提示词 | 替换内置 `SYSTEM_PROMPT`；留空即用内置，可一键恢复默认 | 宿主读盘后逐请求生效 |
| 模型 | 下拉第一项是「DeepSeek 直连（支持联网与深度思考）」；选了具体模型就跳过 DeepSeek 直连 | 宿主按 `provider::model` 解析 |
| 凭证状态 | 三态：可用（说明走账号授权还是 API Key）/ 明确不可用（提示会退回默认模型且无联网）/ 未知（旧宿主没返回字段时不显示结论） | GET /settings 的 `deepseek` 字段 |
| 触发方式 | 显示当前键位键帽，并提供「立即打开」；DSH 拒绝注册时直接说明原因 | 客户端 `shortcutState` + `controller.toggle()` |
| 默认开启联网 | 小窗打开时联网开关的初始状态（仅在直连通道下生效） | 客户端缓存 |
| 默认开启深度思考 | 小窗打开时深度思考开关的初始状态（仅在直连通道下生效） | 客户端缓存 |

存储是宿主侧的 `~/.dsh/vt-quick-chat/settings.json`（临时文件 + rename 原子写），
客户端通过 `/vt-quick-chat/api/settings` 读写，浏览器侧拿不到文件路径。
做法与 `vt-system-prompt` 一致：客户端注册 `settings.section` 槽位，宿主提供同源路由。

状态行（`ConversationBar`）是两态共用的一块，展开态里它直接充当 header：

- 左：当前对话标题，取第一条用户消息压成一行，与本地历史里存的标题同源，两处不会漂移；
  超过一行用 `…` 截断。
- 右：新话题、历史、展开/收起、关闭。展开与收起用同一支雪佛龙翻转方向，不混用全屏图标。
  紧凑态只多这一行，不再往输入条里塞展开图标。
- 没有对话时整行不渲染——空态就是一条干净的输入条。

关闭语义：

- `Esc` / `×`：关闭；丢弃未发送草稿与选中引用；abort 正在生成的请求；
  已生成的部分作为 assistant 消息留在本地历史。
- 关闭不取消历史；下次打开从空对话开始，可从历史恢复。
- 焦点：打开前记录 `document.activeElement`，关闭后归还（元素仍存在时）。

## 5. 模型解析与失败

### 5.1 解析顺序

主通道固定用 DeepSeek `deepseek-flash`（官方要求联网工具用这个模型）。凭证顺序：

1. `ctx.get('deepseekAccount')?.resolveToken('https://api.deepseek.com')` → 请求头 `x-dsh-auth-token`；
2. `ctx.get('credentials')?.resolve('DEEPSEEK_API_KEY')` → 请求头 `x-api-key`；
3. 都没有 → 降级到默认模型：`agentDefaultModel.currentSelection()` → 第一个有模型的 provider，
   此时没有联网能力，`start` 帧的 `via` 为 `default`。

不跟随当前 session 的模型：quick chat 不是该 session 的一部分，跟随固定通道更可预测。

### 5.2 失败码映射

| Host 错误码 | UI |
|---|---|
| `NO_MODEL` / `NO_LLM` | 当前没有可用模型 |
| `MISSING_CREDENTIAL` / `INVALID_CREDENTIAL` / `AUTH` / `HTTP_401` / `HTTP_403` | 未登录或凭证缺失 |
| `RATE_LIMIT` / `HTTP_429` | 请求太频繁 |
| `CONTEXT_WINDOW_EXCEEDED` | 对话太长，请新开话题 |
| `QUOTA` / `ACCOUNT_QUOTA` | 额度不足 |
| `CONTENT_RISK` | 内容安全拒答 |
| `UPSTREAM` | 上游生成失败，可重试 |
| `NETWORK` / `STREAM_FAILED` | 网络中断 |
| 其他 | 通用失败 + 重试 |

## 6. 上下文

第一版只带**当前选中文字**：

- 打开时读取一次，显示为可移除 chip；按键可能折叠选区，因此回退到 5 秒内的最近选区；
- chip 与附件同款，而且**在输入框内部**：`.vqc-files` 是输入容器的第一行（`order:-2`、`flex:1 1 100%`），
  所以看起来就像输入框里贴着一排附件，而不是浮在框外的独立一行；同样的边框与内边距、同样的 × 移除，
  图标换成 T（`TextIcon`）表达「一段文字」；DSH 没有 T 形图标，按 16 viewBox + 描边 1 自绘；
- 只在打开时读一次：输入区不放「重新读取」按钮，少一个说不清的图标；要换引用就关掉重开；
  选中浮层内部文字时忽略，避免自我引用；
- 选区记忆只记录浮层外的非空选区，不跨页面、不上传；
- Host 把它包装成一条引用行（`> ...`）放在最前面，避免选中文本里的围栏代码破坏格式；
- 上限 8k 字符。

不带当前对话的最后几轮：那需要读 conversation projection，属于第二版；先把「用户可见、
可关闭」的上下文做对。

## 7. 视觉与可访问性

### 7.1 Token

- 表面：`--dsw-alias-bg-layer-2` + `--dsw-elevation-prominent`；
  把 `--dsw-elevation-stroke-color` 设为 `--dsw-alias-border-l2`，`border: 0`，
  避免 elevation 的 0.5px 描边叠加成粗线。
- 圆角：`--dsw-radius-lg`（16px）；按钮/chip `--dsw-radius-sm`；气泡 `--dsw-radius-md`。

消息区的排版照 DSH 来，不用「你 / 助手」这类角色标签：

| 角色 | 布局 | 样式 |
|---|---|---|
| 用户 | 右对齐 | 气泡：`--dsw-radius-md`（12px）、`padding: 10px 14px`、底色是业务蓝 8% 叠在 `bg-layer-2` 上（等价于 DSH 的 #EFF3FF，深色主题自动跟随） |
| 助手 | 整宽 | 无气泡，直接 Markdown 正文 |

宽度约束来自 DSH 的 `MessageItem.module.css`：
`max-width: min(calc(var(--dsh-chat-content-width,748px) * .702), 82%)`——左侧留白是这个
82% 顶出来的，所以用户气泡永远不会顶到窗口左边缘。
- 文字：`--dsw-alias-label-primary/secondary/tertiary`；
  字号跟随 `--dsh-content-font-size` 与 `--dsh-content-font-size-secondary`。
- 强调：链接与激活态用 `--dsw-alias-state-business-primary`；发送按钮用
  `--dsw-alias-button-primary-fill`，不额外引入品牌蓝。
- 代码块：`--dsw-alias-markdown-code-block` + `--dsw-font-markdown-code-block`。

### 7.2 图标

输入区的两个动作按钮直接照搬 DSH `InputBar` 的实现，不自绘：

| 按钮 | 尺寸 | 底色 | 图标 |
|---|---|---|---|
| 附件 | 28×28，透明底（悬停才上底色） | 无 | `IconPlusOutlineRegular` 16px、描边 1.5 |
| 发送 | 28×28 圆形 | `--dsw-alias-button-info-fill`，悬停 `-info-hover` | 14px 实心上箭头（与 DSH 同一条 path） |
| 停止 | 34×34 圆形 | `--dsw-alias-bg-layer-3` | 16×16 里 10×10、圆角 3 的方块 |

尺寸与字重取自 `dsh-vt-uiux-enhancer` 的 `composer-submit` / `composer-add` 两个补丁：
它把发送键从 34px 收到 28px、图标 14px，把附件的灰色底板去掉、图标缩到 13px 描边 1.5。
叠加 enhancer 之后的输入区才是目标外观，所以这里对齐它的数值，而不是 DSH 的原始值。

一处例外：附件的「+」用 16px 而不是 13px。enhancer 缩到 13px 是为了让「+」和权限 chip、
麦克风并排时不抢眼；这个浮层里它左边没有别的控件，13px 撑不住左侧，所以放大到与其它图标同尺寸。

**只有「深度思考」是自绘的例外。** 用户要求它和 chat.deepseek.com 一致，而 DSH 图标库里
没有原子形，所以直接用 SVG 描：

| 开关 | 来源 | 形状 |
|---|---|---|
| 深度思考 | 自绘（DSH 无此形状） | 两个交叉椭圆 + 中心实心点（原子形） |
| 联网 | `IconGlobeOutlineRegular` | DSH 原生地球，圆 + 一条赤道 + 两段经线弧，与网页端形状一致 |

自绘图标必须按 DSH 的规格画：**16×16 viewBox + 描边 1**。

其它几条排版约定（都来自设计走查）：

- **来源**：每条引用是一个 chip（链接图标 + 标题 + 边框），不再是一列蓝色文字链接；
- **chips 行**：强制单行，超出横向滚动，右端用 mask 渐隐；滚动条只在 Windows 的 hover 下出现；
- **输入框**：最高 4 行半，再长就在框内滚动，底部同样渐隐（`data-overflow` 控制）；
- **停止键**：圆形灰底（`--dsw-alias-button-ghost-active-fill`）+ 深色方块，与发送键区分；
- **关闭图标**：自绘圆头 X（15px），DSH 的平头 X 和同一行的圆形图标放一起偏硬，且墨迹偏大；
- **清空**：两步 —— 「清空」→「确认清空？」，中间有 3 秒自动回退。
### 7.2.1 图标按墨迹对齐

同一个区块里（标题行、输入行）的图标，按**实际墨迹宽度**对齐到约 13px，
而不是都写 16px。DSH 的图标画在 16 viewBox 里，但各自留白不同，直接给 16px
会得到 12.0～14.0 不等的外框：

| 图标 | 墨迹@16px | 用的尺寸 | 结果 |
|---|---|---|---|
| 新话题 | 14.0 | 15 | 13.1 |
| 历史 | 13.0 | 16 | 13.0 |
| 收起/展开（雪佛龙） | 9.0 × 4.6 | 19 | 10.7 |
| 关闭 | 12.0 | 16 | 12.0（对角线视觉更满，不能再放大） |
| 附件「+」 | 13.0 | 16 | 13.0 |
| 深度思考（原子） | 13.9 | 15 | 13.0 |
| 联网（地球） | 13.2 | 16 | 13.2 |
| 发送 | 12.6 × 13.2 | 14 | 12.6（唯一允许偏小的） |

两条经验：**对角线图形（X）同样外框下更「满」**，所以关闭保持 16 而不是放大到
17；**窄高比悬殊的图形（雪佛龙）**永远比圆小一圈，只能适当放大，别指望数值完全相等。
DSH 图标的 sprite 就是
16 viewBox，regular 描边取 1、medium 取 1.5。按 16 viewBox 画却用 1.5，视觉上会粗 50%，
和旁边的图标明显不在一个重量级——这正是第一版被指出的问题。

其余图标全部来自 `@deepseek-ai/dsh-client-ui-primitives` 的具名图标组件：

| 场景 | 组件 |
|---|---|
| 空态图标 | `IconLightOutlineRegular` |
| 关闭 | `IconCloseOutlineRegular` |
| 收起 / 展开 | `IconChevronDownOutlineRegular` / `IconChevronUpOutlineRegular`（同一支雪佛龙翻转方向） |
| 历史 | `IconClockOutlineRegular` |
| 新话题 | `IconNewChatOutlineRegular` |
| 发送 / 停止 | `IconSendOutlineRegular` / `IconStopFillRegular` |
| 复制 / 已复制 | `IconCopyOutlineRegular` / `IconCheckOutlineRegular` |
| 引用 chip 的移除 | `IconCloseOutlineRegular` |
| 工具活动里的「读链接」 | `IconLinkOutlineRegular` |
| 清空历史 | `IconTrashOutlineRegular` |
| 错误 | `IconWarningOutlineRegular` |

模块缺失时退化为同尺寸空占位，界面仍可用（不手绘 SVG 替代）。

### 7.3 无障碍

- `role="dialog"` + `aria-modal="false"` + `aria-label="快捷提问"`；
- 非模态：不 trap focus；`Esc` 只在浮层内关闭；
- 输入框、发送/停止/历史等按钮都有 `aria-label` 与 `title`；
- `Enter` 发送、`Shift+Enter` 换行；`isComposing` 时不抢键；
- 流式回答不逐 token 播报；用隐藏的 `role="status" aria-live="polite"` 报「正在回答/错误」；
- `prefers-reduced-motion: reduce` 关闭打开动画与光标闪烁。

### 7.4 位置与响应式

- 默认锚定主内容区右下角、主输入框上方 24px（`bottom: 96px`），避免压住主输入框；
- 宽度 `min(560px, calc(100vw - 32px))`；展开高度 `min(520px, calc(100dvh - 120px))`；
- 窄窗口下自动收窄，正文区滚动，不产生横向溢出；
- 不做拖拽（第二版再评估）。

## 8. 本地历史

- key：`dsh-vt-quick-chat:history:v1`；
- 最多 30 个对话（超出丢最旧），每个最多 40 条消息；
- 序列化后超过 1.5MB 时从最旧对话开始丢弃，避免撑爆 `localStorage`；
- 只存文本；不存附件、图片、选中文本；
- 读取时白名单重建，坏条目/坏 JSON 直接丢弃；
- 清空需要二次确认（3 秒内再点一次）。

## 9. 安全与限额

| 项 | 值 |
|---|---|
| 请求体上限 | 256 KiB |
| 消息条数 | 40 |
| 单条消息 | 16,000 字符 |
| 选中文本 | 8,000 字符 |
| 输出上限 | 2,048 tokens |
| 鉴权 | `connection.requestRejection`，与 `/api` 同一套 |
| 白名单字段 | `messages` / `selection` / `web` |
| 服务端块 | 只放行 `text` / `server_tool_use` / `web_search_tool_result` / `web_fetch_tool_result`，单条 96 KiB |
| 不传 | `sessionId`、DSH agent 工具、任意 URL / 路径 / provider / model |

关闭浮层或点「停止」会 abort 请求；Host 监听 `res` 的 `close` 并把取消透传给 adapter。
（不能监听 `req` 的 `close`：请求体读完就会触发，会立刻误取消。）

## 10. 验证

### 10.1 自动化

- `node --test test/*.test.mjs`（57 个用例）：
  - Host 纯函数：消息校验/截断、服务端块白名单与上限、选中文本包装、失败帧、模型解析回退；
  - DeepSeek 通道：凭证顺序（账号 → API Key → 降级）、SSE 分帧、上游错误映射、
    联网时声明两个工具、`tool`/`citation`/`blocks`/`done` 帧顺序；
  - Host 路由端到端：SSE 帧顺序、`sessionId` 为空、鉴权、405/404/400、
    模型失败帧、客户端断开触发 abort；
  - Client：SSE 分帧（跨 chunk/CRLF/坏帧）、Markdown 分块、历史清洗（含服务端块与引用）、
    控制器发送/流式/停止/重试/错误/关闭与恢复、联网开关与引用渲染。
- `node scripts/check-client-bundles.mjs`：拼接后无顶层重名，`load({id})` 与包名一致，
  `VERSION` 与 `package.json` 一致。
- `pnpm market`：`market.json` 通过官方解析器校验。

### 10.2 手工验收清单

- [ ] Desktop `⌘⇧K`（`Ctrl+Shift+K`）打开；输入框聚焦；关闭后焦点归还。
- [ ] Web 端不注册默认键位；命令在快捷键设置里显示为「未绑定」。
- [ ] 侧栏不新增 session；session log 不新增；不生成标题。
- [ ] 紧凑条 ↔ 展开；收起保留消息。
- [ ] 流式可见；停止保留部分；重试替换上一条回答。
- [ ] 选中文字 → chip；按键折叠选区时 5 秒内仍能带上；可移除；Host 收到引用块。
- [ ] 本地历史恢复、单条删除、二次确认清空。
- [ ] 浅色/深色、放大字号不破版。
- [ ] 主界面在浮层打开时仍可操作；`Esc` 不抢主界面。
- [ ] 关闭浮层后请求被 abort（Network 面板显示 canceled）。
- [ ] 关闭联网提问：不出现搜索与来源；回答来自 `deepseek-flash`。
- [ ] 打开联网后问「今天有什么新闻」：出现「正在搜索」chip 与来源列表。
- [ ] 读链接：粘贴一个 URL 并要求总结，回答下方有该链接的来源。
- [ ] 停止后重试：上一轮服务端块随历史回传，不报 400。
- [ ] 退出 DeepSeek 账号后提问：自动落到 `DEEPSEEK_API_KEY`；两者都没有时提示未联网。

## 11. 后续版本

1. 当前对话最后两轮上下文（conversation projection 桥），带可见开关；
2. quick chat 模型选择（设置项，校验 catalog 成员；联网时仍固定 `deepseek-flash`）；
3. 深度思考搜索（`thinking: enabled` + `deepseek_web_search`），以及 thinking 折叠展示；
4. 文件/图片输入（DeepSeek 文件接口）、语音；
5. 拖拽位置、插入到主输入框、导出；
6. 历史加密/按会话隔离（如果产品需要）。
