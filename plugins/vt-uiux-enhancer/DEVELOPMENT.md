# DEVELOPMENT — dsh-vt-uiux-enhancer

实施层的判断依据：补丁怎么选、以及会让你白改一轮的机制陷阱。
设计方向与取舍在 `DESIGN.md`；验证方法在 `docs/VERIFY.md`。

## 选哪一类补丁

按「能碰到多深」四级，从浅到深取第一个可行的。优先级就是这张表的顺序：
能用 token 表达的观感问题，不要用 CSS 兜；能用 CSS 表达的，不要去改 DOM。

| 想要的效果 | kind | 判据 |
|---|---|---|
| 换颜色、换阴影、换圆角数值 | `tokens` | 目标是通过 `var(--dsw-*)` 消费的 token，且只声明在 `body` |
| 换一个被 `body, body *` 重复声明的变量 | `variables` | 主题服务够不到（见陷阱 3） |
| 改具体控件的几何/形状/对齐 | `component` | 没有 token 能表达，必须命中元素 |
| 换掉浏览器/原生绘制的东西（如原生 tooltip） | `behavior` | CSS 完全够不到，只能接管属性或事件；必须自带完整回退 |

`behavior` 会碰到 React 管不到的东西，有两种形态，硬要求不同：

| 形态 | 例子 | 硬要求 |
|---|---|---|
| 接管 DOM | `native-tooltip`、`scroll-edges`、`message-clamp` | 作用域限制在一个容器内；释放时把改动原样写回；新节点只加在 React 不回收的位置（见陷阱 10） |
| 贡献 slot | `view-switch` | 只经 `ctx.slots.register` 增加自己的节点，不碰别人的；释放即 dispose 注册 |

新增 `component` 时：

1. 写**规则签名**，不写类名 —— 类名带每构建变化的哈希。
2. 给一条 `fallback`（唯一硬编码选择器），保证 discovery 失败时仍在工作。
3. 需要同一控件的第二个状态类时用 `moduleSibling()` 推导，不猜类名。
4. 弹窗类、由 `useAnchoredPosition` 摆放的面板，直接套 `anchoredDialog()`。

新增 `behavior` 时：

1. 先确认 CSS 真的够不到。判据是「这件事需要读状态或响应事件」，不是「写起来麻烦」——
   够得到就退回 `component`。
2. 补丁里写 `behavior: '<名字>'`，实现进适配器的 `BEHAVIORS` 表。数据段只留名字，不留函数引用。
3. 选形态：要覆盖浏览器/原生绘制的东西走「接管 DOM」，要往官方列表里加一项走「贡献 slot」。
4. 失败必须看得见：让异常抛到 `installBehaviors` 的 catch 里（进 `behaviorErrors`），不要自己吞掉。

**完成判据**：`component` 是报告 token 里的 `discovered-N`（`fallback` 是可接受的降级但要记录原因）；
`behavior` 是 `__vtInterface.behaviors()` 里 `installed === total` 且 `errors` 为空 —— 这两条只管
「装上了」，界面是否真的变了要另看探针（`docs/VERIFY.md`）。

---

## 陷阱

每条都曾让一轮改动完全无效，或在别处造成回归。

### 1. `border-radius` 不等于圆

Harness 全局声明 `--dsw-corner-shape: superellipse(1.5)` 并应用到 `*, ::before, ::after`。
`border-radius` 只决定角的大小，`corner-shape` 决定角的曲线。所以 `border-radius: 999px` 在一个
28×28 盒子上得到的是**圆角方块**（squircle），不是正圆，而且看起来像「已经改对了」。

- 现象：radius 报告 999px，肉眼仍不是圆；hover 灰底形状不随 radius 变。
- 做法：要正圆就同时声明 `corner-shape: round`，再叠一条 `superellipse(1)` 兜底（走 `CONTROL_SHAPE` 常量）。
- 推论：squircle 容器里**不能用圆内切公式算内距**，按光学等距取整（原生下边距是基准）。

### 2. CSSOM 会重写你写的值

`getComputedStyle` / `rule.style.cssText` 返回的是**序列化后**的值，和你写的不同：

| 写 | 读回 |
|---|---|
| `flex: none` | `flex: 0 0 auto` |
| `min(300px, 100vw - 24px)` | `min(300px, -24px + 100vw)` |

- 现象：签名看着对，补丁却报 `fallback`；断言里比对字符串永远不相等。
- 做法：签名 token 只用 longhand 的简单声明；遇到 `calc/min/max` 只匹配稳定前缀，
  再配一个同规则里唯一的长属性收敛。

### 3. 声明在 `body, body *` 上的 token 无法用内联覆盖

`--dsw-elevation-*` 这类变量在每个元素上各声明一次。主题服务把值写到 `body` 的内联样式，
后代元素仍从样式表重新取值，**够不到**。

- 现象：`ctx.theme.overrideTokens` 成功返回，界面纹丝不动。
- 做法：用 `body, body * { --x: … !important }` 重声明（`kind: 'variables'`）。
- 判断：先查这个 token 在主题包里是声明在 `body` 还是 `body, body *` 上。

### 4. 子串选择器的爆炸半径

`[class*="_card"]` 会命中全 App 任何类名含 `_card` 的组件，不只是输入框。曾经用它「保险」地
兜住 hover 圆角，结果输入框里的附件缩略图（64×64、圆角 20px）hover 时变成正圆。

- 现象：目标改对了，别处出现说不清的变化。
- 做法：选择器只来自 discovery 或声明的 fallback；影响面必须能一句话说清是哪个类。
- 复核：探针只打印带 `!important` 的规则（上游不这么写），打印结果就是本插件的全部作用面。

### 5. `anchor-name` 全局唯一

CSS 锚点定位用 `anchor-name` 认元素。同一个名字同时挂在两个元素上时，定位会跳到其中一个上。

- 现象：弹窗偶尔对错目标，取决于哪个控件先渲染。
- 做法：锚点选择器必须带「当前展开」这个状态限定（如 `:has(> button[aria-expanded="true"])`），
  保证同一时刻只有一个元素持有该名字。

### 6. 原生 `title` 提示不受任何样式控制

有些控件把说明文字放在 `title` 属性里（审查 chip 的沙箱说明、模型 chip 的 `label · effort`），
另一些用应用自己的 `<Tooltip>` 组件（上下文环）。前者由操作系统绘制：方角灰框、无视设计系统，
所以同一个输入框里会并排出现两种 tooltip 外观。

- 现象：tooltip 是系统灰框，调 token 或写选择器都没有任何变化。
- 做法：只能接管属性 —— 把 `title` 移到私有映射里（元素保留 `aria-label`，无障碍不受影响），
  再用应用自己的 `--dsw-alias-tooltip-bg` 与同款几何（`3px 7px`、`radius-sm`、`13/20`）画一个气泡。
- 归属：这是唯一需要「改 DOM」的补丁，因此单独归为 `kind: 'behavior'`，与纯 CSS 补丁分开。
- 现象：接管成功（`title` 已清零）但气泡不出现或一闪即逝 —— 隐藏逻辑不能挂在「全文档有任何变更」
  上。DSH 在一轮对话进行时持续改 DOM，那样挂等于气泡出现即被自己关掉。只在指针离开、滚动、
  点击、锚点被替换这几种情况隐藏。
- 回退：释放时把 `title` 原样写回，气泡节点移除。

### 7. 浮层「脏」来自透明度与饱和滤镜

面板难看时先查材质层，不是圆角或阴影：低不透明度 + `saturate()` 会让背后内容渗上来，
同一个面板在不同位置颜色不同。

- 做法：近不透明表面 + 短模糊 + 一条实体细边；去掉 `saturate`。
- 注意：阴影里若引用 `--dsw-elevation-stroke-color`，面板自己声明的浅色值会把它冲淡，
  需要描边时把颜色直接写进阴影值。

### 8. 缩放 SVG 会连描边一起缩放

`width`/`height` 改的是视口映射，`stroke-width` 是用户单位，会跟着一起缩。所以「只把图标改小一点」
同时也在把它改细；反过来说，想让字形变小时保持同一视觉粗细，必须同时抬高 `stroke-width`。

- 现象：把 14px 图标改成 12px，尺寸对了但看起来发虚、比相邻图标轻。
- 做法：先量墨迹盒（`svg` 的 `ink`）与描边，再按比例反算 `stroke-width`；两个值一起写进常量
  （`ADD_GLYPH`），不散落在规则里。
- 复核：探针的 `controls[].svg` 同时给出盒子、描边和墨迹盒 —— 三个数一起看才是「光学尺寸」。

### 9. React 用 DOM 宽度做布局决策时，`display:none` 会改变界面

会话 header 的标签行不是纯展示：「显示几个视图标签」由
`floor((tabRow.clientWidth - 48) / 120)` 算出，超出的标签被挪进「…」菜单，而菜单项只在菜单打开时才渲染。
标签行 `display:none` 之后 `clientWidth` 为 0，预算塌成 1，第二个视图的按钮从 DOM 里消失 ——
于是「点它」这条路径本身失效，而且不报任何错。

- 现象：标签行确实不见了、高度也对了，但别的补丁查不到第二个标签，功能入口静默缺失。
- 做法：要隐藏又必须保留度量时，用 `height: 0 + overflow: hidden`（宽度不变），不要用 `display: none`。
- 复核：探针 `viewSwitch.tabs.labels` 列出仍在 DOM 的标签；只剩一个就是预算塌了。

### 10. `overflow: hidden` 裁在 padding 盒，不在内容盒

折叠一个盒子时最容易想到「`max-height` 限高 + `padding-bottom` 预留按钮行 + 按钮绝对定位进这块内距」。
它不成立：`overflow: hidden` 的裁切边缘是 **padding 盒**，不是内容盒。超出 `max-height` 的文字会继续
画进预留的内距里，**压在按钮上**；`padding-bottom` 越大，漏出来的行越多。

- 现象：折叠高度、按钮位置、`clientHeight` 全部正确，画面上却有两三行正文穿过按钮。计算值查不出来，
  只有截图或肉眼能看见 —— 这也是它第一次上线后马上被用户抓到的原因。
- 做法：把披露行放到**被裁盒子的外面**。`message-clamp` 的实现是把 `padding-bottom` 归零、让裁切边缘
  正好落在第 19 行的底边，披露块作为气泡的**兄弟节点**插入，自己带同一底色与顶部直角，两块拼起来
  仍是一个气泡。
- 兄弟节点会吃到 `.userStack` 自己的 `gap`：披露块用负 `margin-top` 抵掉（`MESSAGE_CLAMP.stackGap`），
  否则两块之间露一条缝。
- 推论：`.bubble` 是 `content-box`（Harness 没有全局 `border-box`），所以 `max-height` 只写
  `19 × 行高`，不要加内距 —— 这两个事实要一起用才对。

### 11. 自动下滚只有一条写路径，而且状态改不回去

聊天区跟随尾部不是 CSS、不是 `scrollIntoView`，也不是某个可订阅的 store：`ChatViewport` 在
`ResizeObserver` 里收到尺寸变化，若 `followingTail` 为真就调 `followTail()`，它在内部让
`followWindow` 把 `scroller.scrollTop` 写成新的 floor（少数路径走 `scrollTo`）。**写完还会回读**
`element.scrollTop` 当作 landing。

更关键的是 `followTail()` 最后 `commit(landing, true, …)`：`followingTail` 被**硬写回 `true`**，
即使这次落地被改了也一样。所以想停住跟随，不能去改那个状态，只能在写入处限位。

- 现象：给滚动容器加 `overflow-anchor`、改 `data-chat-following-tail`、往状态里塞 `false`，全都无效；
  下一帧依旧滚到底。
- 做法：在滚动容器实例上定义 own 的 `scrollTop` 访问器与 own `scrollTo`，把写入**替换成冻结位置**
  （回答开始那一刻的 `scrollTop`），转发给 `Element.prototype` 的真实描述符。`jump()` 回读到的就是
  替换后的值，它的记账因此自洽。
- 副作用是好的：夹过之后位置离 floor 很远，它 500ms 的读者采样把这次移动判成「读者接管」，
  `followingTail` 自己变 `false`，跟随真正停下，「回到最新」按钮也照常出现。
- 收尾还有个坑：限位后的写入不产生位移，**就不会触发应用的采样**，于是 `followingTail` 一直是 true。
  轮次结束时它会做最后一次跟随——表现为「回答写完又跳到底部」；同一个原因还让「回到底部」按钮
  **根本不渲染**（它只在 `!followingTail` 时出现）。
- 做法是在冻结那一刻额外写 `当前值 - 1px`，而且这一步**必须绕过我们自己的 setter**（用 `Element.prototype`
  的原生 setter 直接写）。走 setter 的话，应用会把我们的值当成自己的 landing，采样算出的
  `movedByReader` 是 0，依然不会判成读者接管。绕过之后：低于肉眼阈值、高于采样器 0.5px 容差 →
  `followingTail` 变 false，收尾的跟随与折叠都改成按读者位置补偿，按钮也才会出现。
- 还原：`delete element.scrollTop` / `delete element.scrollTo` 即可。绝不要改原型。
- 折叠批次（`column[data-input-fold]`）自己按帧写 `scrollTop` 做位置补偿，限位期间必须放行，
  否则会和补偿打架。

---

## Harness 机制备忘

外部事实，读本仓库代码看不出来，但每次改动都要用。

- **token 三层**：`static`（reference 色阶）→ `alias`（语义）→ `specific`（产品专属）。
  改色先看 alias 是否链式引用 static —— 改 static 会连带改到所有引用它的语义色。
- **浮层面板三层**：`surface`（圆角 + 定位）→ `material`（背景 + 背景滤镜，`z-index:-1`）→
  `backing`（仅 macOS，填不透明底给模糊用）。所有 popover 共用同一套，改 token 即全站生效。
- **弹窗定位**：`useAnchoredPosition` 只接受 `align: 'start' | 'end'`，没有居中；它把结果写成
  内联 `left/top`。`!important` 的作者样式优先于普通内联声明，这是用 CSS 接管水平定位的依据。
- **队列面板借浮层材质上色**：`[data-queue-dock]` 里那个 `_panel::before` 的背景是
  `var(--dsw-specific-menu)`，和所有 popover 同一个 token。改浮层材质会连带改它 —— 但它不是浮层，
  所以两者要分开处理（`queue-surface` 补丁读自己的 `--vt-queue-fill`）。
- **消息流分隔线**用 `--dsw-alias-border-l2`（`_ioDivider`、`_divider` 都是它），输入框内的竖分隔线取这个色。
- **轮次跳转条是虚拟列表**（`overscan: 3`）：DOM 里只有渲染窗口内的刻度，容器内滚动由组件自己接管。
  推论：用 CSS 兄弟选择器做「邻居」效果时，可见深度上限就是 3（`±1/±2/±3`），更远的会静默消失。
- **输入框座是滚动容器的 sticky 子元素**（`composerSeat`，z-index 7，`bottom: 0`）。它自带一条
  36px 的渐隐渐变，但卡片只在下沿 8px 处开始，其余部分被卡片盖住 —— 所以底部实际上仍是硬边。
  推论：不要给滚动容器整体加 `mask-image`，那会把输入框卡片一起渐隐；遮住卡片的边缘只能靠
  一张位于卡片与内容之间、锚在座顶边的覆盖层（`scroll-edges` 补丁）。
- **会话视图是一个 slot 列表**（`conversation.view`，list / session scope）：对话用 `order: 0`、
  轨迹用 `order: 10` 各自注册，`label` 是随语言变化的 thunk。但**标签行的 DOM 与样式写死在
  `ConversationSessionHeader` 里**，没有开关能换形态 —— 改它只能覆盖 CSS。
  另外轨迹条目在「开发者工具」关闭时会被过滤掉：这时轨迹视图根本不存在，
  指向它的入口必须自动隐藏，不能留一个点了没反应的控件。
- **切视图要写两处**：conversation store 的 `view` 字段 + `uiConversation.binding(sessionId).activate(id)`，
  两者合在 `selectView` 里，都在 conversation 包的闭包内。没有命令、快捷键、路由或公共服务能触达。
  能触达的只有标签按钮自己的 `onClick` —— 所以切换路径就是让那个（已隐藏的）button 被 `.click()`。
- **`conversation.composer.dock` 是 list slot**：状态行里的「50 轮 845 步」「用量」两项就是它的条目
  （order 0 / 1），容器是 `display:flex; justify-content:center; gap:12px`，条目高 22px、距卡片 4px。
  新增一项走 `ctx.slots.register` 即可，不必注入 DOM；视觉可以借 chat 包的 pill 类
  （`_pill` / `_anchor` / `_label`），字号、6px 图标间距、hover 底色因此与原生项同源。
- **用户消息是一串工厂 slot**：`conversation.chat.node`（keyed，key `user`/`steering`）→
  `UserStyleBubble` 的 `userRow` → 工厂 `conversation.chat.user.content` → `userStack` →
  `.bubble`（全仓唯一用 `--dsw-specific-bubble` 上色的盒子）→ 工厂 `conversation.user.text`
  （行内文本节点）。**气泡里没有可插入的 slot**：那个工厂只能有一个定义、子槽只有图片位，
  `conversation.user.text.node` 只出行内 chip。想在气泡里加控件只能改 DOM。
- **用户气泡的六个几何事实**（折叠补丁全靠它们）：`padding: 10px 16px`、
  `border-radius: var(--dsw-radius-xl)`、`font-size: var(--dsh-content-font-size,14px)`、
  `line-height: calc(22px + var(--dsh-content-font-delta))`、`white-space: pre-wrap`、
  `box-sizing` 是默认的 `content-box`。
- **聊天行的语义钩子**：flowItem 上有 `data-chat-flow-kind`（ChatNodeKind：`user`/`steering`/…）、
  `data-chat-flow-key`、`data-chat-node-key`、`data-chat-turn`。用户消息就用
  `[data-chat-flow-kind="user"],[data-chat-flow-kind="steering"]` 定位 —— 不用类名，不受构建哈希影响。
  transcript 本身不虚拟化，但切会话、compaction 与热更新都会重挂节点：重挂即回到折叠态，
  展开状态只活在该节点上（这是有意的，见 `DESIGN.md` 的决策记录）。
- **跟随尾部的可读信号**：聊天根上有 `data-chat-following-tail`（React 状态
  `followingTail` 的镜像，跟随为真时才存在，顺带把滚动容器设成 `overflow-anchor: none`）；
  内部还有 `[data-chat-running]`（本轮运行指示行，思考阶段就在，直到本轮关闭）与
  `[data-streaming]`（回答 / 推理正在流入）。
- **回答行与思考行同 kind，靠 group part 区分**：本轮回答的 flowItem 是
  `data-chat-flow-kind="assistant-step"` + `data-chat-group-part="response"`；思考行同样是
  `assistant-step`（或 `tool-call`），但 part 是 `"reasoning"` 或没有。**不存在**
  `data-chat-flow-kind="assistant"` —— 按 kind 找回答会永远找不到。运行期间回答行还带
  `data-turn-process-member`，所以「不是过程组成员」也不能用来筛回答。
- **`[data-conversation-scroll]` 可能不止一个**：侧栏 / 停靠面板里的会话预览也会渲染一个，
  它同样带 `[data-chat-flow]` 与完整历史。取「最大的那个」可能选到预览。可靠判据是先按
  「内含 `[data-chat-running]`」筛（只有真正在跑的那份有），再比高度。
- **跟随的判定是 25px + 500ms**：`ScrollFollow` 的阈值 25px（`useScrollFollow(…, 25)`），
  读者滚动后由 500ms 的采样定时器决定 `following = nearBottom`，在这段时间里 `onResize` 直接
  返回（`pending`）—— 也就是说「一旦被判成读者接管，500ms 内不会再有自动下滚」。
  这是限位补丁不需要持续纠偏的原因。
- **「正式回答」在 harness 里是事后判定的**：`ui-chat` 的 `latestAnswer()` 只认**最后一步、已
  settled、有回复内容、且不含 tool-call 块**的 assistant-step；`answerStep` 在流式期间是 `null`。
  DOM 也没有阶段属性（过程组标题 `TurnProcessNodeView` 在 `turn.status !== "closed"` 时直接返回
  `null`，`data-turn-process-answer` 只在轮次结束、`!liveProcess` 时才设）。想在运行期知道阶段，
  只能用会话事件流：`sessions.binding(id).eventSource` 的最近一条 `assistant/live-chunk`，
  看 `chunk.type`（`text-delta` / `reasoning-delta` / `tool-call-delta`）。
- **会话 id 的取法**：`[data-conversation-content]` 上的 `data-conversation-session`；这个元素
  **不在** `[data-conversation-scroll]` 内部（实测 `scroller.querySelector` 取不到，全文档只有 1 个），
  所以要从 `document` 查。
- **过程组在运行期保持展开**：`turnProcessAlwaysOpen()` 对 `status === "open"` 的轮次返回真，
  所以运行中 `processHidden` 不生效、成员不折叠；只有轮次结束后「最近完成的一轮」才保持展开，
  更早的轮次折叠。推论：思考阶段很长时，用户消息可能早已被推出视口，靠轮次结束后的折叠
  救不回来 —— 需要时得主动回拉（`scroll-pin` 的做法）。
- **图标来自旧的 primitives 包**：`@deepseek-ai/dsh-client-ui-primitives` 在磁盘上没有独立包，
  它是壳的 **seed 模块**（`staticModules` 里就有），`require` 在同步阶段一定命中，
  **不需要**写进 `dsh.client.inject`（那里的 id 必须是 boot graph 的行，否则被静默跳过）。
  chevron 是 `IconChevronDownOutlineRegular` / `IconChevronUpOutlineRegular`：16 单格、`stroke 1`、
  `size` 默认 14。
- **文案走 locale 服务**：`ctx.get('locale')` 是可选依赖；`resolveText({zh,en})` 按当前语言取串
  （不插值、不查字典），切换语言要自己 `subscribe` 才能重贴到已渲染的 DOM。
- **header 的 `:has()` 变体是一对**：`.header{min-height:76px}` 与
  `.header:where(:not(:has(.tabs))){min-height:0;padding-bottom:10px}`。元素只要还在树里（哪怕零高），
  `:has()` 就继续匹配，后者永不生效 —— 覆盖时必须自己把高度压回去。

---

## 打包与装载约束

**客户端半边必须是一个文件：`client.js`。** 这不是风格选择，是装载器的工作方式：

服务端把插件的客户端代码**拼装成一个 bundle** 后整体下发到 `/plugins/<combo>/client.js`，
并不按文件树提供静态文件。因此 `client.js` 里写 `import './probe.js'` 时，浏览器会去找
`/plugins/<combo>/probe.js` —— 那个地址不存在。

同时 `factory(require)` 里的 `require` 只解析**已注册的模块 id**（包名 / boot graph 里的行），
不解析相对路径。所以把 `client.js` 拆成多个源文件的两条路都走不通。

推论：

- 客户端代码靠**顺序段落 + 注释边界**表达模块划分，靠 `PATCHES` 的数据契约控制耦合，
  而不是靠文件。
- 想真正把某部分（例如探针）拆出去，唯一可行的方式是**再建一个插件包**，让它拥有自己的
  `exports["./client"]` 与独立装载生命周期。
- `index.js`（host 半边）与 `client.js` 之间没有 import 关系：它们是 Cordis bundle 的两半，
  各自被装载器单独加载。这不是耦合，是契约。

## 模块面（v2.2 起）

`client.js` 只能是一个文件，所以模块边界靠**闭包 + 单一入口**表达，不靠文件。
四段各有且只有一个对外面，段间只通过它往来：

| 段 | 对外面 | 说明 |
|---|---|---|
| DOMAIN | `PATCHES` | 纯数据：要改什么。不含选择器逻辑、不含 DOM 操作 |
| CSSOM 基底 | `collectStyleSheets()` / `walkRules()` | 唯一有两个真实消费者的底层：适配器做 discovery，探针做审计 |
| ADAPTERS | `createAdapters(ctx, patches)` | 返回 `applyTokenPatches` / `sync` / `installBehaviors` / `behaviorErrors` / `dispose` |
| PROBE | `createProbe(readState)` | 返回 `dump` / `dispose`；引擎只传一个状态读取器 |
| ENGINE | `mount(ctx)` | 只管生命周期、重试、诊断；不认任何 DSH 概念 |

两条硬规则：

1. **数据段只说「要什么」，适配器决定「怎么做」。** 例如 `behavior: 'native-tooltip'` 是行为名，
   实现放在适配器闭包内的 `BEHAVIORS` 表里。若反过来把函数引用写进补丁数据，数据段就必须
   伸进适配器闭包 —— 那正是这一层要挡住的耦合。
2. **跨段只走入口。** 引擎不再直接调用 `resolveTarget` / `renderVariables` / `createStyleHost`；
   探针不再回头读引擎内部状态，而是拿一个 `readState` 回调。

行为安装失败会在 `__vtInterface.behaviors()` 里留下 `{ installed, total, errors }`。
历史上这类失败被 try/catch 静默吞掉，表现是「界面上完全没变化」，排查代价很高。
