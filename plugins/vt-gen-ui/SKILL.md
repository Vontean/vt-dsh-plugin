---
name: genui
description: "Render structured interactive UI inline through the dsh-ui fence. Use for key points, emphasis, comparisons, flows, steps, status, data, demos, and interactions whenever structured presentation would be clearer than prose. Preserve conversation language for all user-visible text."
---

# GenUI — 生成式 UI 输出规范

**Language:** Match the user's requested language (otherwise the language of their message) in both surrounding prose and all user-visible UI text: titles, labels, content, options, and explanations. Chinese examples below illustrate the schema only; do not switch the conversation to Chinese after loading this skill. Keep JSON keys, component types, IDs, and actions unchanged. An English request gets English prose and UI text; a Chinese request gets Chinese prose and UI text. `<user-language ...>` tokens are meta-placeholders only. Replace every one with actual content in the conversation language; never emit these placeholders literally.

你可以**在回答正文中间**输出可交互 UI 组件：写一个 `dsh-ui` 围栏（fenced block with language tag `dsh-ui`），内含 JSON 规格，渲染器会把这一整块画成真实组件，文字照常穿插在前后。组件**就是回答的一部分**，不是工具调用。

```dsh-ui
{"title":"<user-language text>","gap":14,"items":[...]}
```

## 围栏书写铁律（先读这一节）

围栏开头那一行的语言标记**统一写 `dsh-ui`**，不要添加标点、引号或注释。渲染器会容错大小写、首尾空格和部分尾部标点；其他语言标记不会作为 GenUI 接管，用户会看到普通代码块。

| 写法 | 结果 |
| --- | --- |
| ` ```dsh-ui ` | ✅ 渲染 |
| ` ```dsh-ui> ` | ✅ 容错渲染；生成时仍应去掉 `>` |
| ` ```dsh-ui ` 带行尾空格 | ✅ 渲染（自动 trim） |
| ` ``` DSH-UI ` | ✅ 渲染（忽略大小写） |
| ` ```dshui ` / ` ```ds-ui ` | ❌ 不是合法标记 |

此前同一模型曾在同一会话里写出 **182** 个 ` ```dsh-ui> ` 围栏并导致静默失效；现在已对这类尾部标点统一容错。写围栏时**只写 `dsh-ui` 这六个字符**，不要加任何标点、引号、注释；收尾必须是单独一行的 ` ``` `。

围栏位置：只写在**回答正文**里。写进 reasoning / 思考块不会渲染，用户看不到。

公式：`$...$` / `\(...\)` 为行内公式，`$$...$$` / `\[...\]` 为独立公式；支持矩阵、分段函数、多行对齐推导，以及加粗/高亮内的公式。正文、列表、键值、表头/单元格、卡片/步骤/时间线/标签页标题、题目与说明、按钮与表单标签、指标、媒体说明和图表外层标题共用此能力。JSON 字符串中的反斜杠必须双写，如 `"content": "\\(\\frac{a}{b}\\)"`。代码源码、输入值/占位符、原生下拉选项和图表引擎内部绘图文本仍遵循各自的原生格式，不解析富文本。数学语法以 KaTeX 为准，不执行 HTML、外部资源或脚本；不支持 LaTeX 文档编译、加载任意宏包。

## 组件词汇（由 catalog 生成）

只允许系统提示词 `genui:fence` 段列出的 type。组件定义只有一份来源（`src/shared/catalog/`）：校验 schema、系统提示词里的组件清单/字段速查/易错字段，以及本文末尾的「组件字段参考」都由它生成。

**本文件不再手写字段表**——手写的副本会和校验 schema 漂移，这正是这次要消除的问题。需要精确字段时读文末生成参考，或者直接对围栏调 `validate_dsh_ui`。

内置图标：64 个内联、685 个按需载入；完整名单见 `ICON-NAMES.md`，需要猜名字时 grep 它，不要在对话里穷举。

## 多屏原型（可选，点着看）

讨论「点进去是什么」时，一个围栏可以放多屏：用户点击就地切屏，不发消息、不打断讨论节奏。

```dsh-ui
{"initial":"list","screens":{
  "list":[{"type":"page","title":"成员","items":[{"type":"list-row","title":"王小鲸","desc":"产品设计师","actions":[{"type":"button","label":"查看","goto":"detail"}]}]}],
  "detail":[{"type":"page","title":"王小鲸","subtitle":"产品设计师","items":[{"type":"text","content":"这里放详情结构"}]}]
}}
```

- 根字段 `screens`（屏 id → 节点数组，最多 12 屏）与 `initial`（起始屏，省略取第一屏）代替 `items`；普通单屏仍用 `items`。
- 可交互节点加 `"goto":"屏id"` 切屏。当前由 `button` 触发；没有 `goto` 也没有 `action` 的按钮仍是禁用态。
- 切屏是本地状态机：块头部出现「返回」，栈深 20，未声明的屏 id 被忽略；已填的表单/滑块值跨屏保留。
- 别把多屏做成「每屏一个按钮发 action」——那会变成一轮一轮的消息往返，正是这个通道要避免的事。

## 什么时候用：内容类型 → 组件映射

**判断口诀**：这段内容换成结构化组件，会不会比纯文字更好扫、更好懂、更好操作？会 → 就用，**不需要等用户开口要 UI**。

**硬触发（出现就至少出一个围栏，不要退回纯文字段落）**：
- ≥3 条并列要点 → `list`；≥2 组数字对比 → `table`；指标/进度/状态 → `stat`/`progress`/`badge`
- 步骤/时间线 → `steps`/`timeline`/`mermaid`；架构/流程 → `diagram`/`mermaid`；单条风险/结论摘要 → `callout`；代码/改动 → `code`/`diff`/`json`
- 趋势/占比 → `chart`（≤8 点）或 `echart`（多序列/要交互/数据量大）
- 收尾自检：回答超过约 10 行时确认至少有一个围栏；同一份信息不要既写文字又重复出组件；纯问答不套 UI。

| 你要呈现的内容 | 用这些组件 |
|---|---|
| 并列结论 / 要点罗列（≥2 条） | `list`、`keyvalue` |
| 单条重点强调 / 警告 / 注意事项 | `callout`（info/success/warning/error）、`badge`、`stat` |
| 多项风险 / 注意事项 | `list`；需要统一风险底色时用 `card.tone` + `list` |
| 数据对比 / 趋势 / 占比 | `chart`（bars/line/donut）、`echart`（ECharts 全功能）、`table` |
| 关键指标数字 / 进度状态 | `stat`、`progress`、`badge` |
| 回答的视觉锚点（第一个组件） | `hero`（封面块，一条回答最多一个） |
| 想排版不呆板 | `grid` + 子节点 `span`（bento：宽窄混排） |
| 数据多、需要读者自己找 | `input`（id）+ `table`/`chart`/`list` 的 `filter` 绑定 |
| 流程 / 步骤 / 阶段 / 时间线 | `steps`、`timeline`、`mermaid`（flowchart/sequence/gantt） |
| 架构 / 系统拓扑 / 数据流 / 品牌图 | `diagram`（编辑级，27 种类型；自动布局需求才用 `mermaid`） |
| 目录 / 文件结构 / 层级关系 | `file-tree`、`mermaid`、`accordion` |
| 状态一览 / 检查结果 | `badge` + `table` + `progress` 组合 |
| 代码 / 配置 / 改动对比 | `code`、`diff`、`json` |
| 图片 / 截图 / 图表预览 | `image` |
| 语音 / 音乐 / AI 视频 / 演示录像 | `audio`、`video` |
| 两个方案 / 选项对比 | `table`、`tabs`、`diff` |
| 教学 / 自测 / 判断题 | `quiz` |
| 数学函数 / 曲线关系 | `plot`（可带参数滑块、动画） |
| 需要用户操作 / 筛选 / 反馈 | `button`、`input`、`select`、`checkbox`、`radio`、`switch`、`tabs` |
| 3D 物体 / 空间布局 | `scene3d` |

多项风险需要统一底色时，复用 `card` 包含 `list`；普通要点直接用 `list`。卡片的严重风险色是 `danger`，提示框对应的是 `error`。

```json dsh-ui
{"items":[{"type":"card","tone":"warning","title":"<user-language risk summary>","items":[{"type":"list","items":[{"title":"<user-language item title>","desc":"<user-language description>"},{"title":"<user-language item title>","desc":"<user-language description>"},{"title":"<user-language item title>","desc":"<user-language description>"}]}]}]}
```

**别用的情况**：一句话能说清的事、纯闲聊、用户明确说不要 UI、以及"为了炫技硬塞"——组件服务内容，不是内容服务组件。

## 行内富文本（文字类回答的底座）

`text.content`、`list` 项、`table` 文本列、`keyvalue` 值、`callout` 标题与正文里可以直接写四种行内标记——**重点留在句子里，不必为一个词单起一个组件**：

| 写法 | 渲染 |
|---|---|
| `` `code` `` | 行内代码胶囊 |
| `**加粗**` | 强调（不换行、不成块） |
| `==高亮==` | 极淡底色标记 |
| `[文字](https://…)` | 行内链接（http/https/mailto；围栏会话中的本地文件链接支持右侧栏打开与行号定位；无效目标及独立 HTML artifact 中的本地文件链接显示为普通文字） |
| JSON `"\n"`（真实换行符） | 换行——**多段文字写同一个字段**，不要为换行拆成多个节点 |

不嵌套、不解析 HTML（每个标记生成 React 元素，不走 innerHTML；`<br>` 字面显示，换行用 `"\n"`）；标记没闭合时原样显示。表格文本、`badge`、`delta` 单元格只识别本地文件链接，外部链接与无效目标显示为普通文字；`bar`、`spark`、`ring`、`index` 等专用数值单元格保持原有展示。

文字字段只支持行内富文本。`text.content`、`callout.content`、`list` 项、`keyvalue` 值、`table` 单元格等字段中不要嵌入 Markdown 表格或连续三个及以上反引号、波浪号组成的代码围栏；表格使用 `table`，代码使用 `code`，代码改动使用 `diff`，结构化 JSON 使用 `json`。误写入文字字段的代码围栏连同内部标记保持原文，未闭合时从围栏标记开始保持原文。`validate_dsh_ui` 返回 `warning=block_markdown` 时，按照 `replacement` 改写结构节点并重新验证。

## 回答级版式：默认无卡，焦点唯一

**规则来自设计规范，不是口味**（`design` skill 的 `references/design-reference.md`）：
「通用圆角矩形卡片当默认容器 = 模板思维，默认无卡；只有内容类型确实需要时才加卡片处理」，
「如果替换内容不需要改布局，那就是模板，重做」。

### 三条判据（不设组件数量上限）

1. **必要性**：这个组件承载的信息，用文字表达会明显更差吗？数字对比、趋势、空间关系、代码/数据原文才算过关，否则删掉。
2. **焦点唯一**：一条回答只有一个视觉焦点（最大那张图或那组数字）；其余组件的视觉权重必须明显更低，靠尺寸/位置/色彩强度拉开，**不是靠数组件个数**。
3. **不重复**：同一批数据不做两种表达（表格与图表二选一）。

### 卡片（`card`）只在有明确用途时用

- 需要**并排**的 `grid` 子项（没有边界就分不清内容归属）；
- 承载**数据对象**：表格、图、keyvalue、指标组；
- 同组风险需要**统一语义底色**：`card.tone` 包含 `list`，保留逐项标题与说明。

普通单段文字、普通列表、已经自带边界的表格/图表，**不要包卡**。用 `h3` 标题 + 正文 + 间距代替。

### 层级靠字，不靠框

- 卡片标题 16px / 字重 650 / 句首大小写（**不是** 12.5px 全大写小标签）；
- 12.5px 全大写只用于 eyebrow（如 hero 上方那一行）；
- 大字号带负字距（≥32px 约 -0.022em，20–28px 约 -0.012em），数字列 `tabular-nums`；
- CJK 正文行高 1.7，长段落行宽 ≤68ch；
- 表面对比遵循规范：浅色相邻表面明度差 ≥4%，或阴影 ≥ `0 1px 3px rgba(0,0,0,0.10)`；深色靠半透明白叠加（卡片约 4%，抬升面 8%），投影在深色几乎无效。

### 不要

- 装饰性编号（①②③）：该分点用 `list`，该分节用标题；
- 同一套骨架每条回答复用（标题栏 → 卡片网格 → 表格 → callout）；
- 为了"显得丰富"堆组件：读者找不到重点就是失败。

### 怎么验证没模板化

`node scripts/genui-usage-audit.mjs` 输出「版式多样性」：不同版式签名数、最常见签名占比、归一化熵（越接近 1 越多样）、每回答 card 数分布。熵明显下降或 card 数不降反升，就说明规则没生效。

## 范例：示范「判断」，不要照抄组件序列

每个范例后面都跟着**什么时候不要这样**。组件多是好事——只要每个都在承载不同信息、并且有焦点和层次；真正的毛病是重复表达、以及把纯文字段落包进卡片。

### 1. 状态汇报（多点 + 有构图）

```json dsh-ui
{"items":[{"type":"grid","cols":4,"items":[{"type":"stat","label":"<user-language metric>","value":"26","delta":"#123–#148"},{"type":"stat","label":"<user-language metric>","value":"0"},{"type":"stat","label":"<user-language metric>","value":"556","delta":"<user-language status>"},{"type":"stat","label":"<user-language metric>","value":"45"}]},{"type":"table","columns":["<user-language column>","<user-language column>","<user-language column>"],"types":["text","badge","text"],"rows":[["<user-language text>","<user-language status>","<user-language text>"],["<user-language text>","<user-language status>","<user-language text>"]]},{"type":"callout","tone":"info","title":"<user-language title>","content":"<user-language text>"}]}
```

不要这样：把同一句话既写进正文又放进卡片；也不要为每条信息配一张卡（4 个 stat 排一行就够）。

### 2. 解释/教学（文字为主，一个点睛组件）

```json dsh-ui
{"items":[{"type":"text","size":"body","content":"<user-language text>"},{"type":"list","items":[{"title":"<user-language title>","desc":"<user-language description>"},{"title":"<user-language title>","desc":"<user-language description>"}]},{"type":"callout","tone":"warning","title":"<user-language title>","content":"<user-language text>"}]}
```

不要这样：每段都配一个组件；把一句话拆成好几个 text 节点（用行内标记就够了）。

### 3. 对比选型

```json dsh-ui
{"items":[{"type":"table","columns":["<user-language column>","<user-language column>","<user-language column>"],"types":["text","text","badge"],"rows":[["<user-language text>","<user-language text>","<user-language status>"],["<user-language text>","<user-language text>","<user-language status>"]]},{"type":"callout","tone":"success","title":"<user-language title>","content":"<user-language text>"}]}
```

不要这样：表格里放同一批数据后又画一张图。

反例（这条会被围栏校验直接拒绝，所以别抄）：

```json dsh-ui-bad
{"items":[{"type":"chart","kind":"donut","data":[{"label":"A","value":1}],"series":[{"label":"B","data":[{"label":"B","value":2}]}]}]}
```

为什么拒：`series` 只对 `bars`/`line` 有效；环形图给了 `series` 属于契约冲突，围栏会**静默降级为代码块**。

### 4. 排查诊断（顺序即叙事）

```json dsh-ui
{"items":[{"type":"steps","current":1,"steps":[{"title":"<user-language step>","desc":"<user-language description>"},{"title":"<user-language step>","desc":"<user-language description>"},{"title":"<user-language step>","desc":"<user-language description>"}]},{"type":"diff","diffs":[{"path":"PlotBlock.tsx","oldText":"e.preventDefault()","newText":"if (!e.metaKey && !e.ctrlKey) return"}]},{"type":"callout","tone":"info","title":"<user-language title>","content":"<user-language text>"}]}
```

不要这样：把"复现/定位/修复"写成三个卡片并列（那是流程，用 steps）。

### 5. 数据结论（一个主图 + 明细）

```json dsh-ui
{"items":[{"type":"chart","kind":"line","data":[],"series":[{"label":"<user-language series>","data":[{"label":"<user-language point>","value":8},{"label":"<user-language point>","value":12},{"label":"<user-language point>","value":9}]}]},{"type":"table","columns":["<user-language column>","<user-language column>","<user-language column>"],"types":["text","num","delta"],"rows":[["<user-language text>","8","-4%"],["<user-language text>","12","+50%"]]}]}
```

不要这样：图与表用同一粒度表达同一批数据（图看趋势、表看明细才不重复）。

### 6. 短回答：正确地不套组件

> 这个改动我先不做了——它要动宿主的输入组件，而你说了不碰宿主。

不要这样：一句话的结论配 stat + 表格 + callout。**没有内容就不发组件，这是对的，不算漏发。**

## 编排范式：高频场景的默认起点

范式是**验证过的起点，不是模板**：判断永远优先（上一节的「不要照抄」同样适用于范式）。六个范式各管一类高频场景——**数据问答**用「主表明细」、**分析收尾**用「结论卡」、**报告开篇**用「封面页」、**方案权衡**用「对比页」、**过程复盘**用「时间线叙事」、**教学自测**用「测验页」。从成套结构出发、按需增删；范式之外的场景自由组合。

### 阶段图（讲清「分几步 / 怎么变」的默认结构）

适用：一个过程有 2–4 个阶段，或一份数据被分成若干块、逐轮合并。

```json dsh-ui
{"items":[{"type":"text","size":"h2","content":"<user-language 过程名>"},{"type":"card","items":[{"type":"row","items":[{"type":"icon","name":"Function","tone":"info","tile":true},{"type":"col","gap":2,"items":[{"type":"text","size":"h3","content":"<user-language 阶段一：名称>"},{"type":"text","size":"muted","content":"<user-language 这一步做什么>"}]}]},{"type":"arrow","length":22},{"type":"row","items":[{"type":"icon","name":"Nodes","tone":"success","tile":true},{"type":"col","gap":2,"items":[{"type":"text","size":"h3","content":"<user-language 阶段二：名称>"},{"type":"text","size":"muted","content":"<user-language 这一步做什么>"}]}]}]},{"type":"blocks","rows":[{"cells":["<user-language 块 0>","<user-language 块 1>","<user-language 块 2>","<user-language 块 3>"],"color":"#3d7eb8"}],"caption":"<user-language 每块代表什么>"}]}
```

何时不用：只有一步就别画阶段图；纯数值对比用 `chart`，别把数字塞进色块。

### 主表明细（数据问答的默认结构）

适用：用户问的数据要「先看总量 → 再筛 → 再钻某一行」。

```json dsh-ui
{"items":[{"type":"grid","cols":2,"items":[{"type":"stat","label":"<user-language metric>","value":"<user-language value>","delta":"+3.1%"},{"type":"stat","label":"<user-language metric>","value":"<user-language value>"}]},{"type":"input","label":"<user-language filter>","placeholder":"<user-language hint>","id":"master-filter"},{"type":"table","filter":"master-filter","columns":["<user-language column>","<user-language column>","<user-language column>"],"types":["text","num","badge"],"rows":[["<user-language text>","128","<user-language status>"],["<user-language text>","190","<user-language status>"],["<user-language text>","250","<user-language status>"]],"details":[[{"type":"keyvalue","pairs":[{"key":"<user-language key>","value":"<user-language value>"}]}],null,[{"type":"progress","value":91,"target":80,"label":"<user-language metric>"}]]}]}
```

何时不用：行数 ≤5 不要配 `filter`；没有逐行明细可展开就别配 `details`；展开行里只放该行自己的信息，不要塞与该行无关的图表。

### 结论卡（分析收尾的默认结构）

适用：指标 + 一个明确判断 + 可执行的下一步（周报结论、复盘、健康度检查）。

```json dsh-ui
{"items":[{"type":"grid","cols":3,"items":[{"type":"stat","label":"<user-language metric>","value":"<user-language value>","delta":"+2.4%"},{"type":"stat","label":"<user-language metric>","value":"<user-language value>"},{"type":"stat","label":"<user-language metric>","value":"<user-language value>","delta":"-1.2%"}]},{"type":"card","tone":"success","title":"<user-language title>","items":[{"type":"text","size":"body","content":"<user-language text>"},{"type":"progress","value":72,"target":80,"label":"<user-language metric>","valueLabel":"72%"}]},{"type":"row","items":[{"type":"button","label":"<user-language action>","tone":"primary","action":"<action-name>"},{"type":"button","label":"<user-language action>","tone":"ghost","action":"<action-name>"}]}]}
```

何时不用：结论还不成立时不要硬造结论卡（先摆数据，让读者自己看）；没有真实可执行的下一步就不要放按钮；`tone` 只有在确实传递语义（好/坏/险）时才用。

### 封面页（报告开篇的默认结构）

适用：正式报告/复盘/评审材料的**第一屏**——一个大数字定调，一句引言点题，三张摘要卡预告正文。

```json dsh-ui
{"items":[{"type":"hero","label":"<user-language metric>","value":"99.96%","delta":"+0.02%","tone":"accent","title":"<user-language title>","subtitle":"<user-language text>"},{"type":"text","size":"display","content":"<user-language statement>"},{"type":"divider","label":"<user-language chapter>"},{"type":"grid","cols":3,"items":[{"type":"card","title":"<user-language title>","items":[{"type":"stat","label":"<user-language metric>","value":"<user-language value>"}]},{"type":"card","title":"<user-language title>","items":[{"type":"stat","label":"<user-language metric>","value":"<user-language value>"}]},{"type":"card","title":"<user-language title>","items":[{"type":"stat","label":"<user-language metric>","value":"<user-language value>"}]}]}]}
```

何时不用：短回答不需要封面（hero 已是唯一焦点，再加 `display` 就是两个焦点）；hero 与 `display` 同屏时，后面不要再出现 h1 级大标题；普通问答直接给答案，不要套封面。

### 对比页（方案权衡的默认结构）

适用：两个（至多三个）方案/版本/选型的正面对决——定性取舍进卡，定量差异进表。

```json dsh-ui
{"items":[{"type":"grid","cols":2,"items":[{"type":"card","tone":"success","title":"<user-language option>","items":[{"type":"list","items":["<user-language text>","<user-language text>"]}]},{"type":"card","tone":"warning","title":"<user-language option>","items":[{"type":"list","items":["<user-language text>","<user-language text>"]}]}]},{"type":"table","columns":["<user-language column>","<user-language column>","<user-language column>"],"types":["text","num","num"],"rows":[["<user-language text>","8","12"],["<user-language text>","5","9"]]}]}
```

何时不用：只有单一方案时就是普通陈述，不要硬摆两张卡假装权衡；卡与表要承载**不同粒度**（卡给取舍理由、表给数值对比），两边复制同一批数字就是重复表达。

### 时间线叙事（过程复盘的默认结构）

适用：有先后顺序的过程/事故/迭代叙事——时间线主叙事，收尾一张卡给汇总结论。

```json dsh-ui
{"items":[{"type":"timeline","items":[{"title":"<user-language milestone>","desc":"<user-language description>","time":"<user-language date>"},{"title":"<user-language milestone>","desc":"<user-language description>","time":"<user-language date>"},{"title":"<user-language milestone>","desc":"<user-language description>","time":"<user-language date>"}]},{"type":"card","title":"<user-language title>","items":[{"type":"keyvalue","pairs":[{"key":"<user-language key>","value":"<user-language value>"},{"key":"<user-language key>","value":"<user-language value>"}]}]}]}
```

何时不用：两步以内的小流程用正文一句话讲清；纯日志列举不要套卡，`timeline` 单独就够。

### 测验页（教学自测的默认结构）

适用：教学/检查理解——两题以上的成组测验，radio 组带答案与解析，`submit` 聚合交卷本地判卷。

```json dsh-ui
{"items":[{"type":"radio","label":"<user-language question>","group":"q1","options":["<user-language option>","<user-language option>","<user-language option>"],"answer":1,"explanation":"<user-language explanation>"},{"type":"radio","label":"<user-language question>","group":"q2","options":["<user-language option>","<user-language option>"],"answer":0,"explanation":"<user-language explanation>"},{"type":"submit","label":"<user-language action>","action":"grade","groups":["q1","q2"]}]}
```

何时不用：单一知识点用单个 `radio`（自带本地判卷）或 `quiz` 组件，不需要 submit 组卷；题目多于 5 个拆成多条回答分批发。

## 使用规则

1. **围栏放哪，组件就出现在哪** —— 文字在前后自然流动，不要用工具、不要解释"这是一个围栏"。**围栏一闭合就立即渲染**（不等整条回答结束），所以可以边写文字边出组件
2. **组合优先**：复杂界面用 `grid`+`card`+`stat`+`table` 拼，不要追求单一巨型组件
3. **JSON 必须严格合法，发出前完成 4 步自检**：插件**只**修标点级小错（字符串内半角引号、尾随逗号）；**缺括号/错括号等结构错误一律不修**，直接红横幅退化成代码块——写错就重发，别指望兜底。**最容易犯的错：字符串值里用了半角引号 `"`**——中文引语一律写 `“”` 或 `「」`。发出围栏前自检 4 条：① 括号配对：`{` 与 `}`、`[` 与 `]` 数量相等，**收尾序列逐个核对**（长表格最易在最后几行错位：把 `]]}]}` 写成 `]}]}]}`）② 无尾随逗号 ③ 值内引号用中文引号 ④ 最后一个字符必须是 `}`（**`}` 之后不要再写任何字符**——实测常见错误是习惯性追加 `</p>` 或一句解释，整条围栏就解析不了）。不要在 JSON 字符串里放 markdown；超长表格/列表拆成多个组件分开发，宁短勿长
3.5. **字段名逐个核对（写错一个 = 整条围栏降级为代码块）**：某个组件的必填字段写错 / 缺失 → 该组件被丢弃 → 整份 spec 判定不可渲染 → 用户只看到一段裸 JSON。高频误写：`callout` 正文是 `content`（不是 text/body）；`table` 要 `columns` + `rows`（不是 data，只给二维 rows 时首行会当表头）；`keyvalue` 要 `pairs:[{key,value}]`（不是 items）；`diff` 是 `diffs`；图片/音视频是 `src`；`code` 是 `code`、`copy` 是 `text`。拿不准就调 `validate_dsh_ui`，不要凭直觉命名
4. **不要嵌套围栏**：dsh-ui 里不要再包 ``` 代码围栏
5. **深色主题友好**：配色选深底亮色；UI 主题跟随应用
6. **场景判断**：先查上面的映射表 —— 内容类型命中就上对应组件；只有纯文字问答、一句话能说清时才不用
7. **图表范围**：`plot` 给合理 xMin/xMax（如 -3.14 到 3.14）；3D 场景 mesh 少而精
8. **规格要紧凑**：整棵组件树 ≤200 节点、≤8 层嵌套；单个 `tabs` ≤12 个标签页、`accordion` ≤24 项（超出部分会被渲染器按上限截断渲染）。避免巨型 spec
9. **一个主题选一个主组件**：命中映射表后选**一种**组件承载，同一信息不要用两种组件重复表达（同一批数据又画 bars 又画 donut = 冗余）
10. **数量纪律**：一条回答 3–8 个组件为宜，宁缺毋滥。反例：该用 `table` 对比时写三段 `text`；一个 `stat` 能说清的事套 `card`+`grid`；与内容无关的 `scene3d` 炫技——3D 只在内容本身就是几何/空间时才用
12. **给命令就给能直接粘的**：多行 python 一律写成 heredoc 包装的**一整段** shell 代码块（`python - <<'PY'` … `PY`），不要用 `python -c "…"` 配反斜杠续行——续行在复制/粘贴里最容易碎成多行，用户还得自己拼回 heredoc。单行表达式才用 `-c`，且必须真的在一行内写完。示例：

    ````text
    cd /path/to/repo
    python - <<'PY'
    import json
    d = json.load(open('report.json'))
    print(d.get('status'))
    PY
    ````

    同理：需要用户执行的脚本放进 `code` 节点（`lang`: `bash`/`python`）或正文围栏，并保证**从第一行到最后一行一次粘进终端就能跑**。
11. **先验后发（复杂 UI）**：发出 ```dsh-ui 围栏前，若 spec ≥3 个组件或含 `table`（长表格最易括号错位），先调用 `validate_dsh_ui` 工具（参数 `spec` 传围栏内的 JSON 文本）验证；返回 `next=fix_and_revalidate` 就按诊断修正后重新验证；返回 `next=emit_fence` 再发出；返回 `next=emit_repaired_fence` 时直接照抄 `repaired_json` 发出，无需再次验证；简单 UI（≤2 个组件）不必验证，渲染器会自动修复大部分标点/括号错误
