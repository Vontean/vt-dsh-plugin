# DEVELOPMENT — dsh-vt-Interface

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

`behavior` 是唯一会改 DOM 的一类，因此附带两条硬要求：作用域限制在一个容器内（如输入框卡片），
释放时把改动原样写回。

新增 `component` 时：

1. 写**规则签名**，不写类名 —— 类名带每构建变化的哈希。
2. 给一条 `fallback`（唯一硬编码选择器），保证 discovery 失败时仍在工作。
3. 需要同一控件的第二个状态类时用 `moduleSibling()` 推导，不猜类名。
4. 弹窗类、由 `useAnchoredPosition` 摆放的面板，直接套 `anchoredDialog()`。

**完成判据**：报告 token 里该补丁是 `discovered:1`；`fallback` 是可接受的降级但要记录原因。

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

---

## Harness 机制备忘

外部事实，读本仓库代码看不出来，但每次改动都要用。

- **token 三层**：`static`（reference 色阶）→ `alias`（语义）→ `specific`（产品专属）。
  改色先看 alias 是否链式引用 static —— 改 static 会连带改到所有引用它的语义色。
- **浮层面板三层**：`surface`（圆角 + 定位）→ `material`（背景 + 背景滤镜，`z-index:-1`）→
  `backing`（仅 macOS，填不透明底给模糊用）。所有 popover 共用同一套，改 token 即全站生效。
- **弹窗定位**：`useAnchoredPosition` 只接受 `align: 'start' | 'end'`，没有居中；它把结果写成
  内联 `left/top`。`!important` 的作者样式优先于普通内联声明，这是用 CSS 接管水平定位的依据。
- **消息流分隔线**用 `--dsw-alias-border-l2`（`_ioDivider`、`_divider` 都是它），输入框内的竖分隔线取这个色。
- **轮次跳转条是虚拟列表**（`overscan: 3`）：DOM 里只有渲染窗口内的刻度，容器内滚动由组件自己接管。
  推论：用 CSS 兄弟选择器做「邻居」效果时，可见深度上限就是 3（`±1/±2/±3`），更远的会静默消失。

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
