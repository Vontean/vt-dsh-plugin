# dsh-genui 组件规格（spec）参考

> 侦察对象：`@changfenhuang/dsh-genui@0.14.0`
> 源码根（只读）：`/Users/mac/.dsh/profiles/desktop/node_modules/@changfenhuang/dsh-genui`
> 本文所有「文件:行号」均相对该包根目录。结论以源码为准，不引用 README/SKILL 的说法（个别处标注「文档口径」以区分）。
> 侦察方式：按 `wc -l` 定位规模，重点读协议链、`render-node.tsx` 派发、`schema.ts`/`normalize.ts`/`guard.ts` 三层、`limits.ts`，再按需抽查各 block 实现。

---

## 0. 阅读地图（规模与职责）

| 文件 | 行数 | 本报告中的作用 |
| --- | --- | --- |
| `src/client/dom-fence.tsx` | 1785 | DOM 观察通道：识别 `dsh-ui` 代码块、挂载 React 根、手术式隐藏宿主块、动作回传 |
| `src/client/guard.ts` | 2124 | 归一化后的**类型修复 / 安全过滤 / 校验 / 部分修复**，围栏能否渲染的最终裁决 |
| `src/client/spec.ts` | 1014 | spec 语言的 TypeScript 词汇表（50 个 type 的字段定义）、根 spec 结构、单组件根包装 |
| `src/client/fence-render.tsx` | 250 | 围栏→spec→React 的渲染管线、面板发布、坏 fence 降级与诊断条 |
| `src/client/parse-partial.ts` | 170 | 流式部分解析（只提取「已经闭合的组件」） |
| `src/client/genui-runtime/schema.ts` | 384 | 运行时 schema：必填/可选字段、枚举、别名、嵌套记录 |
| `src/client/genui-runtime/normalize.ts` | 365 | 字段别名与结构别名的确定性归一化 |
| `src/client/genui-runtime/limits.ts` | 61 | 全部资源上限 |
| `src/shared/fence-repair.ts` | 572 | JSON 两级修复（tier-1 随时可跑 / tier-2 仅回合结束） |
| `src/shared/fence-resolve.ts` | 80 | 统一解析顺序（partial → process → prune → tier1 → tier2） |
| `src/client/blocks/render-node.tsx` | 529 | **组件派发 switch（50 个 case）**，组件目录的权威来源 |
| `src/client/blocks/charts.tsx` | 1018 | `table` / `chart` 的渲染与本地排序、筛选、导出 |
| `src/client/blocks/forms.tsx` | 531 | `input/select/radio/submit/switch/slider/textarea` 与本地判卷 |
| `src/client/blocks/advanced.tsx` | 669 | `tabs/accordion/quiz/plot/mermaid/scene3d/file-tree/...` |
| `src/client/interaction-store.ts` | 127 | 持久化键规则与 localStorage 结构 |
| `src/client/submission-registry.ts` | 150 | `group`/`id` 聚合、submit 进度与本地判卷条件 |
| `src/client/EChartNode.tsx` | 480 | ECharts 节点与 preset 模板、core/full 引擎选择 |
| `src/plugin/index.ts` | 249 | 宿主侧：系统提示段、资产路由、render_ui/validate_dsh_ui 注册 |
| `src/plugin/fence-feedback.ts` | 701 | 回合末「让模型自修坏围栏」的转向回路 |

---

## 1. 围栏协议

### 1.1 识别：什么算一个 `dsh-ui` 围栏

1. **语言标记归一化**：只接受标签等价于 `dsh-ui` 的语言名。大小写不敏感，并吸收标签**尾部**标点（```` ```dsh-ui> ````、```` ```dsh-ui` ```` 等）；`dsh-ui-dark` 这类真实语言名不受影响（`src/shared/fence-language.ts:5-19`，判定入口 `:28-30`）。
2. **浏览器侧靠 DOM 观察，而非宿主 API**：插件观察会话 DOM，找「横幅里有一个纯文本叶节点等于 `dsh-ui` 且内部含 `<pre>`」的代码块表面；命中的选择器集合为 `.md-code-block, .code-block, .code-block-small` 加 `[data-code-block-content]`（`src/client/dom-fence.tsx:75-80`）。Desktop 0.11.0 会把围栏渲染成 `<dsh-ui>…</dsh-ui>` 纯文本标签，也被单独识别（`src/client/dom-fence.tsx:243-260`）。
3. **防误伤**：横幅里出现 `dsh-ui` 但结构像整条消息容器（多个 `<pre>`、标签在代码体之外）时跳过并 warn，避免整条消息被隐藏（`src/client/dom-fence.tsx:565-568`）。
4. **宿主源文对照**：为了拿到「围栏序号 → 语言」的稳定映射，客户端会从 ChatSnapshot 的 assistant text block 里用 mdast 再解析一遍围栏（`src/client/source-fence.ts:25-42`、`:66-71`）。这说明语言信息有两路来源：DOM 横幅 + 宿主快照。
5. **SVG 围栏是另一套**：```` ```svg ```` 走 `src/client/svg-fence.tsx:8-35`，与 `dsh-ui` 无 spec 关系（见 6.4）。

挂载方式：插件在宿主块旁边自建 React root，并把宿主块隐藏；宿主 React 在流式期间重渲染会抹掉这些「外来节点」，所以同一 MutationObserver 微任务里会重新做一次手术，另有 1s 巡检兜底（`src/client/dom-fence.tsx:1-52`，安装入口 `:830`）。

### 1.2 解析流水线（唯一入口）

`resolveFence(raw, { settled })` 按固定顺序尝试（`src/shared/fence-resolve.ts:53-69`）：

```
raw fence body
  ├─ 1. parsePartialGenuiSpec(raw)            // 流式部分解析，见 1.3
  │      └─ 命中 → processGenuiSpec → partialRepairGenuiSpec → spec
  ├─ 2. repairFenceJson(raw)                  // tier-1：引号/尾逗号，随时可跑
  │      └─ 整块能 parse 才采用
  ├─ 3. 若 settled：completeFenceJson(raw)    // tier-2：补缺失括号/引号，仅回合结束
  │      └─ 整块能 parse 才采用
  └─ 全部失败 → spec = null
```

- `processGenuiSpec`（`src/client/guard.ts:1585-1632`）：别名归一化 → 确定性修复 → 校验 → **声明数 vs 渲染数对账**；若 `declaredNativeCount > renderedNativeCount` 就追加一条 `repair dropped N declared native node(s)` 错误（`:1606-1608`）。
- `partialRepairGenuiSpec`（`src/client/guard.ts:1703-1760`）：严格校验失败时**按错误里的节点路径剪掉坏节点**，重跑一次整条管线；仍然不可渲染或渲染出 0 个原生节点就返回 null（`:1757-1759`）。这一层就是「一个坏组件不拖垮整块围栏」的实现。
- 图表语义错误（`variant is unsupported`、`kind must be bars, line, or donut` 等）同样被换算成节点路径交给剪枝，因此**画不出来的图表被丢弃，而不会被修成空白画布**（`src/client/guard.ts:1691-1701`、`1801-1840`）。

### 1.3 流式渲染规则

- **逐个组件上屏**：部分解析器先整块 `JSON.parse`（常见 settled 情形，最多一次）；失败则做**一次**从左到右的括号栈扫描，收集「前缀括号已平衡」与「根 `items[]` 里某个组件已闭合」两类候选，候选最多 32 个（`src/client/parse-partial.ts:31`、`:62-116`），**最长优先**逐个试解析，第一个能当 spec 的胜出（`:152-170`）。
- 因此结果**永远是目标 spec 的前缀**：已经出现的组件都是完整且合法的，可以安全渲染（`src/client/parse-partial.ts:20-25`）。
- 一个组件都没闭合时返回 null，围栏保持宿主普通代码块——**未完成的 JSON 绝不当成错误**（`src/client/parse-partial.ts:168-169`，`src/client/fence-render.tsx:61-77`）。
- 流式期间没有稳定 source 身份：`resolveGenuiSpec` 用 `context?.source !== undefined` 判断 settled（`src/client/fence-render.tsx:174-176`）；流式实例没有持久化 `stateKey`，settled 后追认第一个 key（`src/client/fence-render.tsx:179-191`，`src/client/GenuiBlock.tsx:221-236`）。
- 渲染去重靠结构化等值（JSON.stringify）比较，避免每个 chunk 全树重渲染（`src/client/GenuiBlock.tsx:67-83`、`:236-239`）。
- 入场渐显：根 items 逐个 `animationDelay = min(index*90, 720)ms`，prefers-reduced-motion 关闭；settled 回放不加动画（`src/client/GenuiBlock.tsx:198-214`）。

### 1.4 坏 fence 的降级路径

| 情形 | 结果 | 依据 |
| --- | --- | --- |
| 流式中，尚无完整组件 | 宿主普通代码块（无提示） | `src/client/parse-partial.ts:168-169` |
| settled，JSON 非法且两级修复都失败 | 保留宿主代码块 + 红色诊断条（含 JSON.parse 位置信息） | `src/client/fence-render.tsx:87-98`、`:118-134` |
| JSON 合法但校验失败，且能剪掉坏节点 | **正常渲染**，坏组件静默消失，无黄色提示 | `src/client/guard.ts:1703-1760`；`src/client/fence-render.tsx:186-191` 注释 |
| JSON 合法但错误无法定位到节点（根级错误、剪枝后仍失败、渲染 0 节点） | 回到代码块 + 诊断条 | `src/client/guard.ts:1718`、`:1757-1759` |
| 超过 200 节点 | **仍然渲染**，尾部被截断（视为策略性截断，不算失败） | `src/client/guard.ts:1516-1521`、`:1635-1645` |
| `chart` 语义非法 | 只丢该 chart，其余照常 | `src/client/guard.ts:1801-1840` + 1.2 的剪枝 |
| `panel:true` 且流式中 / 无稳定 source | 不发布，正文里是一个空 Fragment（占位但不显示） | `src/client/fence-render.tsx:206-224` |
| `panel:true` + `append:true` 但正文 JSON 不完整 | 不合并（防止部分内容双写） | `src/client/fence-render.tsx:212`、`src/client/spec.ts:83-90` |
| 回合结束后仍有围栏不可渲染 | 宿主 `agent/turn-stopping` 边界触发一次「自修请求」，每回合最多 2 条、每个正文最多 1 次，子代理不触发（默认开启，配置 `fenceFeedback:false` 关闭） | `src/plugin/fence-feedback.ts:1-28`、`:44`；`src/plugin/index.ts:202-214` |

### 1.5 四条渲染通道

| 通道 | 触发 | 身份 / 持久化键 | 依据 |
| --- | --- | --- | --- |
| 内联围栏 | 正文里的 `dsh-ui` 代码块 | `f:<sessionId>:<sourceId>:<内容指纹>` | `src/client/fence-render.tsx:179-194` |
| 面板围栏 | spec 带 `panel: true` | `p:<sessionId>:<内容指纹>`，面板快照另存 `dsh.genui.panel` | `src/client/interaction-store.ts:120-122`；`src/client/panel-store.ts:29-33`、`:104-110` |
| `render_ui` 工具卡 | 模型调用工具（与围栏同词汇） | `t:<sessionId>:<callId>` | `src/plugin/tool.ts:205-260`；`src/client/interaction-store.ts:125-127` |
| SVG 围栏 | ```` ```svg ```` | 无 spec 解析 | `src/client/svg-fence.tsx:8-35` |

`render_ui` 与 `validate_dsh_ui` 两个工具由宿主侧注册（`src/plugin/index.ts:227-234`），`renderUiTool:false` 只关工具、不影响围栏（`src/plugin/index.ts:210-214`）。`validate_dsh_ui` 的返回是协议块：`status=valid|invalid`、`diagnostic=`、`repair=applied|failed`、`repaired_json`、`next=emit_fence|fix_and_revalidate`（`src/plugin/tool.ts:263-283`、`:363-433`）。

---

## 2. 顶层 spec 与容器 / 布局语义

### 2.1 根 spec 字段

| 字段 | 类型 | 默认 | 语义与限制 | 依据 |
| --- | --- | --- | --- | --- |
| `items` | node[] | — | **必填**；根组件列表 | `src/client/spec.ts:91-92`；`src/client/genui-runtime/schema.ts:257-263` |
| `title` | string | 无 | 渲染为块横幅（支持行内富文本）；截断 2000 字符 | `src/client/GenuiBlock.tsx:193`；`src/client/guard.ts:1291` |
| `gap` | number | `16` | 根列间距（px），修复时 clamp 到 0–96 | `src/client/GenuiBlock.tsx:88`、`:194`；`src/client/guard.ts:1292` |
| `panel` | boolean | `false` | `true` 时渲染进会话面板 dock，不进消息流 | `src/client/spec.ts:79-82`；`src/client/fence-render.tsx:206-224` |
| `append` | boolean | `false` | 仅与 `panel:true` 搭配：合并进已有面板而不是替换 | `src/client/spec.ts:83-90`；`src/client/fence-render.tsx:150-157` |

**单组件根简写**：正文可以整个就是一个组件对象（`{"type":"callout","content":"…"}`），会被包成 `{items:[node]}`；`panel`/`append` 提升到包装层，`title` 在组件自身没有 title 字段时也提升（`src/client/spec.ts:926-997`）。判定「是组件根还是信封」的规则：根上有 `type` 且 `type` 在白名单里 → 组件根；`type` 不在白名单 → 仍按信封读（`src/client/spec.ts:945-964`）。根级裸数组会被 `normalize` 收养为 `{items: […]}`（`src/client/genui-runtime/normalize.ts:341-351`）。

### 2.2 容器与布局字段

| type | 字段 | 取值范围 / 默认 | 渲染语义 | 依据 |
| --- | --- | --- | --- | --- |
| `row` | `items`（必填）、`wrap`、`spacer`、`justify` | `justify`: `start`(默认)/`center`/`end`/`between`；`spacer:true` 追加一个弹性占位 | 主轴横向排列 | `src/client/blocks/render-node.tsx:205-216`；`schema.ts:357` |
| `col` | `items`（必填）、`gap`、`width` | `gap` 0–96；`width` 1–100（占 row 百分比，`flex: 0 1 N%`） | 纵向排列 | `src/client/blocks/render-node.tsx:217-230`；`guard.ts:354-360` |
| `grid` | `cols`、`items`（必填） | `cols` 整数 1–12，**缺省 = 1**（不写就是单列） | `grid-template-columns: repeat(cols, minmax(0,1fr))` | `src/client/blocks/render-node.tsx:231-245`；`guard.ts:363` |
| `grid` 子节点 | `span` | 修复阶段 clamp 到 **2–12**；渲染再 clamp 到 1–12 | bento 宽窄混排；`span` 只对 grid 直接子节点有意义 | `src/client/blocks/render-node.tsx:238-241`；`guard.ts:259-260` |
| `card` | `items`（必填）、`title`、`eyebrow`、`tone`、`accent`、`flat` | `tone`: info/success/warning/danger；`accent` 只影响边框+标题色（不改底色）；`flat:true` 去阴影 | 卡片容器 | `src/client/blocks/render-node.tsx:246-270`；`guard.ts:365-375` |
| `tabs` | `tabs[] {label, items}` | 最多 12 个 tab；`content` 是 `items` 的别名 | 本地切换，默认第 0 个 | `src/client/blocks/advanced.tsx:123-180`；`guard.ts:869-885` |
| `accordion` | `items[] {title, items}` | 最多 24 项；默认展开第 0 项 | 折叠面板 | `src/client/blocks/advanced.tsx:191-225`；`limits.ts:21` |
| `list` | `items[]`（必填）、`filter` | 最多 50 项；`filter` 绑定某个字段 id 做本地子串过滤 | 列表；typed child 也是节点 | `src/client/blocks/render-node.tsx:425-443`；`limits.ts:23` |
| `table.details` | `details[i]: node[] \| null` | 与 `rows` 位置对齐，超出 rows 会被截断并报错 | 行内主从展开 | `src/client/spec.ts:420-422`；`guard.ts:523-543`、`1967-1979` |
| `blocks` 行 | `rows[].cells`、`columns`、`variant` | `columns` 缺省 = 每行自行均分；`variant`: fill(默认)/outline/plain | 声明式方块图 | `src/client/blocks/blocks.tsx:62-143`；`schema.ts:340` |

嵌套计数与遍历规则（影响「哪些容器里的节点算节点」）：`row/col/grid/card` 的 `items`、`tabs[].items`、`accordion[].items`、`list` 里的 typed child、`table.details[i]` 会递归计数；`file-tree.items` 是数据记录不算节点（`src/client/guard.ts:1324-1372`、`:1390-1451`；`src/client/walk-spec.ts:6-43`）。

### 2.3 资源上限总表（`src/client/genui-runtime/limits.ts`）

| 常数 | 值 | 适用 |
| --- | --- | --- |
| `maxDepth` | 8 | 组件树嵌套深度（渲染、修复、校验、遍历四处一致） |
| `maxNodes` | 200 | 全树节点总数（超出的尾部被截断） |
| `maxString` | 2000 | 任意普通字符串字段 |
| `maxCode` | 12000 | `code.code`、`copy.text`、`svg.code` |
| `maxCopyPreview` / `maxCopyPreviewLines` | 2000 / 30 | `copy` 预览 |
| `maxMermaid` | 8000 | `mermaid.code` |
| `maxGridCols` | 12 | `grid.cols` |
| `maxTabs` | 12 | `tabs.tabs` |
| `maxAccordionItems` | 24 | `accordion.items` |
| `maxListItems` | 50 | `list.items`、`file-tree` 顶层 |
| `maxOptions` | 50 | `select`/`radio`/`submit.groups` |
| `maxTableRows` / `maxTableCols` | 50 / 12 | `table` |
| `maxChartPoints` | 60 | `chart.data`、每个 series 的点数、`echart.links` |
| `maxPlotSeries` / `maxPlotParams` | 8 / 6 | `plot`、`chart.series` |
| `maxMeshes` | 5 | `scene3d.meshes` |
| `maxQuizOptions` | 8 | `quiz.options` |
| `maxSteps` / `maxTimelineItems` / `maxBreadcrumbItems` / `maxKeyValuePairs` | 24 / 24 / 12 / 24 | 对应组件条目 |
| `maxTreeDepth` | 6 | `file-tree` 嵌套层 |
| `maxBlocksRows` / `maxBlocksCells` | 14 / 16 | `blocks` |
| `maxDiagramNodes` / `maxDiagramEdges` / `maxDiagramZones` / `maxDiagramFocal` / `maxDiagramLabel` | 9 / 12 / 3 / 2 / 14 | `diagram` |
| `maxEChartOptionDepth` / `maxEChartArrayLen` / `maxEChartOptionNodes` | 10 / 500 / 2000 | `echart.option` 深度遍历预算 |
| 面板：`PANEL_LIMITS.maxNodes` / `maxAppends` | 200 / 200 | 面板快照与追加次数（`src/client/panel-store.ts:29-33`） |

上限**超限的行为**并不统一，务必区分：
- 家族上限（tabs>12、accordion>24）→ 截断并产出 `kind:'truncated'` 警告，围栏照常渲染（`src/client/guard.ts:1610-1616`）。
- 200 节点 → 尾部省略，但因为「声明 201 / 渲染 200」被判定为策略性截断，围栏照常渲染（`src/client/guard.ts:1635-1645`）。
- 其他上限（字符串、选项、表格行列…）→ 静默截断，不报错。

---

## 3. 完整组件目录（以 `render-node.tsx` 的 switch 为准：**50 个 type**）

派发入口 `renderNode`（`src/client/blocks/render-node.tsx:174-527`），`default: return null`（`:525`）——**白名单外的 type 不渲染任何东西**。下表「渲染实现」列若写 `render-node.tsx:NN` 表示就地渲染，否则为独立组件文件。

列含义：**必填**＝schema 的 `required`；**默认值**＝代码里的实际兜底；**action**＝是否消费 `action` 字段；**本地状态/answers**＝组件内部状态或是否参与聚合/持久化。

### 3.1 文本与展示（text / badge / hero / stat / progress / divider / avatar / list / table）

| type | 必填 | 可选字段（含默认） | 渲染实现 | action | 本地状态 / answers |
| --- | --- | --- | --- | --- | --- |
| `text` | `content` | `size`: display/h1/h2/h3/body(默认)/muted/caption；`align`: left(默认)/center/right；`center`(旧写法)；`tone`: danger/success/warning/info/muted；`mono` | `render-node.tsx:191-204` | ✗ | 无 |
| `badge` | `label` | `tone`: success/warn/danger/accent（默认无色调）；`icon` | `render-node.tsx:307-315` | ✗ | 无 |
| `hero` | `title` | `value`、`label`、`subtitle`、`delta`、`spark[]`(2–60 个有限数)、`tone`: accent(默认)/success/warning/danger | `render-node.tsx:316-336` | ✗ | 数值一次性 count-up（reduce-motion 关闭） |
| `stat` | `label`、`value` | `delta`、`spark[]`、`size:'hero'` | `render-node.tsx:337-349` | ✗ | `size:'hero'` 时数值 count-up |
| `progress` | `value`(0–100) | `label`、`valueLabel`、`variant`: bar(默认)/ring、`target`(0–100 标记线) | `render-node.tsx:350-414` | ✗ | 无（越界值在修复阶段直接丢弃该节点） |
| `divider` | — | `label`（带 label 渲染章节分隔样式，否则 `<hr>`） | `render-node.tsx:415-424` | ✗ | 无 |
| `avatar` | `name` | `color`（缺省按 name 哈希取宿主色板） | `render-node.tsx:459-465` | ✗ | 无 |
| `spacer` | — | — | `render-node.tsx:466` | ✗ | 无 |
| `list` | `items` | `items[]` 可为 string / `{title,desc}` / 节点；`filter`(字段 id) | `render-node.tsx:425-443` | ✗ | 由 `filter` 绑定的输入框驱动本地过滤 |
| `table` | `columns`、`rows` | `types[]`(每列 text(默认)/num/delta/bar/badge/spark/ring/index/group)、`total`、`export`、`details[]`、`filter`、`filterColumn`、`sortField` | `charts.tsx:225-500` | ✗ | 本地三态排序、分组折叠、详情展开、合计行、Markdown/CSV 复制、`filter`/`sortField` 绑定 |

### 3.2 布局容器（row / col / grid / card / tabs / accordion / blocks）

| type | 必填 | 可选字段（含默认） | 渲染实现 | action | 本地状态 / answers |
| --- | --- | --- | --- | --- | --- |
| `row` | `items` | `wrap`、`spacer`、`justify` | `render-node.tsx:205-216` | ✗ | 无 |
| `col` | `items` | `gap`、`width` | `render-node.tsx:217-230` | ✗ | 无 |
| `grid` | `items` | `cols`(默认 1)；子节点 `span` | `render-node.tsx:231-245` | ✗ | 无 |
| `card` | `items` | `title`、`eyebrow`、`tone`、`accent`、`flat` | `render-node.tsx:246-270` | ✗ | 无 |
| `tabs` | `tabs` | `tabs[].label`、`tabs[].items`（`content` 别名） | `advanced.tsx:123-180` | ✗ | 当前 tab 索引（不持久化） |
| `accordion` | `items` | `items[].title`、`items[].items` | `advanced.tsx:191-225` | ✗ | 展开项索引，默认第 0 项 |
| `blocks` | `rows` | `rows[].label/cells/color/variant`、`columns`、`title`、`caption` | `blocks.tsx:62-143` | ✗ | 无（纯静态图形） |

### 3.3 媒体与图形（image / audio / video / svg / icon / arrow）

| type | 必填 | 可选字段（含默认） | 渲染实现 | action | 本地状态 / answers |
| --- | --- | --- | --- | --- | --- |
| `image` | `src` | `alt`、`caption` | `image.tsx:9-29` | ✗ | 加载失败降级为错误提示 |
| `audio` | `src` | `alt`、`loop` | `basic.tsx:77-96` | ✗ | 原生控件；忽略 autoplay |
| `video` | `src` | `alt`、`poster`、`loop`、`muted`、`aspectRatio`: 16:9/4:3/1:1/9:16 | `basic.tsx:98-121` | ✗ | 原生控件；忽略 autoplay |
| `svg` | `code` | `title`、`height`(100–800) | `svg.tsx:42-65` | ✗ | 解析失败回落到源码 `<pre>` |
| `icon` | `name` | `label`、`tone`: default(默认)/muted/info/success/warning/danger、`size`（就近夹到 16/20/24/32，缺省 20）、`tile` | `icon.tsx:65-93` | ✗ | 未知名字降级为圆点，不报错 |
| `arrow` | — | `dir`: down(默认)/right、`length`(16–96，down 默认 26 / right 默认 32)、`label` | `render-node.tsx:469-500` | ✗ | 无 |

### 3.4 交互与表单（button / input / textarea / select / checkbox / radio / switch / slider / submit / quiz / link / copy）

| type | 必填 | 可选字段（含默认） | 渲染实现 | action | 本地状态 / answers |
| --- | --- | --- | --- | --- | --- |
| `button` | `label` | `tone`: primary/danger/success/ghost、`full`、`small`、`icon`、`action` | `render-node.tsx:271-290` | ✓ 有 action 且有 provider 才可点，否则**禁用** | 点击反馈 chip |
| `input` | — | `label`、`placeholder`、`value`、`inputType`: text(默认)/email/password/color、`action`、`id` | `forms.tsx:383-463` | ✓ blur（值变化时）与 Enter；IME 组合中不提交 | `id` → 持久化 + submit `fields`；`password` 永不持久化、不进 submit |
| `textarea` | — | `label`、`placeholder`、`rows`(默认 4)、`value`、`action`、`id` | `forms.tsx:469-528` | ✓ blur / Ctrl·Cmd+Enter | 同上（无 secret 语义） |
| `select` | `options` | `label`、`action`、`selected`(默认无，显示占位项)、`id` | `forms.tsx:322-373` | ✓ change | `id` → 持久化 + `fields` |
| `checkbox` | `label` | `checked`、`action`、`group` | `checkbox.tsx:17-61` | ✓ 仅无 `group` 时 | 有 `group` → 只写 `multiAnswers`，不逐次回调 |
| `radio` | `options` | `label`、`selected`、`action`、`group`、`answer`、`explanation` | `forms.tsx:16-71` | ✓ 仅无 `group` 时 | 有 `group` → 写 `answers`；判卷后整组锁定 |
| `switch` | `label` | `checked`、`action` | `forms.tsx:201-222` | ✓ toggle | 本地 on/off（不持久化） |
| `slider` | — | `label`、`min`(0)、`max`(100)、`step`(1)、`value`(=min)、`action`、`id` | `forms.tsx:229-274` | ✓ 拖动，300ms 尾部防抖（按 action+id 合并） | `id` → 持久化 + `fields`（数值字符串） |
| `submit` | `label` | `action`、`resetAction`、`groups[]` | `forms.tsx:81-198` | ✓ 不满足本地判卷时用 action 提交；`resetAction` 用于「重新作答」 | 读取整块 `answers/multiAnswers/fields`，输出 `{type:'submit', answers, fields?, total, answered}` |
| `quiz` | `question`、`options` | `options[].correct/feedback`、`explanation`、`id`（换题重置）、`action` | `advanced.tsx:573-645` | 可选（作答同时回传） | 纯本地判卷；选中即评，可重做 |
| `link` | `label` | `href`（无 href 或非法 → 渲染为纯文本） | `render-node.tsx:294-303` | ✗ | 文件链接走 FileLink |
| `copy` | `text` | `label`、`expandable`(默认 false)、`previewLines`(0–30) | `advanced.tsx:268-323` | ✗ | 复制成功态 / 展开态 |

### 3.5 图表（chart / echart / plot）

| type | 必填 | 可选字段（含默认） | 渲染实现 | action | 本地状态 / answers |
| --- | --- | --- | --- | --- | --- |
| `chart` | `data` **或** `series` 之一 | `kind`: bars(默认)/line/donut、`series[]`、`horizontal`、`stacked`、`palette[]`(≤12 合法色)、`filter`(字段 id) | `charts.tsx:616-627`（bars `:644`、line `:855`、donut `:959`） | ✗ | 悬浮 tooltip；`filter` 本地按 label 过滤 |
| `echart` | `option` / `data` / `series` / `links` 至少一项 | `title`、`height`(默认 300，范围 100–800)、`preset`(14 种)、`palette[]` | `EChartNode.tsx:400`（preset 模板 `:85-393`） | ✗ | 引擎实例生命周期 |
| `plot` | `series[]` | `series[].expr`、`label`、`color`、`kind`: line(默认)/area/scatter、`params[]`(name/value/min/max/step/animateTo/durationMs(4000)/loop(false))；根 `xMin`(默认 −5)、`xMax`(5)、`yMin`/`yMax`(自动)、`title` | `advanced.tsx:81-93` → `PlotBlock.tsx` | ✗ | 参数滑块、拖拽平移/缩放；动画 play |

### 3.6 高级与图形化（callout / steps / keyvalue / diff / json / code / mermaid / diagram / scene3d / timeline / file-tree / breadcrumb）

| type | 必填 | 可选字段（含默认） | 渲染实现 | action | 本地状态 / answers |
| --- | --- | --- | --- | --- | --- |
| `callout` | `content` | `tone`: info(默认)/success/warning/error、`title` | `advanced.tsx:29-38` | ✗ | 无 |
| `steps` | `steps` | `steps[].title/desc`、`current`(默认 = 条目数，即全部完成) | `advanced.tsx:41-61` | ✗ | 无 |
| `keyvalue` | `pairs` | `pairs[].key/value` | `advanced.tsx:64-76` | ✗ | 无 |
| `diff` | `diffs` | `diffs[].path/oldText/newText`（≤24 组，每组文本 ≤20000） | `advanced.tsx:96-99` | ✗ | 无 |
| `json` | `value` | 任意 JSON 值 | `advanced.tsx:102-109` | ✗ | 树展开（宿主 JsonTree 内部） |
| `code` | `code` | `lang` | `advanced.tsx:112-115` | ✗ | 复制 |
| `mermaid` | `code` | — | `advanced.tsx:331-436` | ✗ | 懒加载 + 视口内才渲染 + 主题变化重渲染 |
| `diagram` | `kind`、`nodes` | `variant`: light/dark/editorial、`title`、`edges[]`、`zones[]`、`theme` | `diagram/index.tsx:206`（布局 `layout.ts:155`） | ✗ | 无（纯 SVG） |
| `scene3d` | `meshes` | `title`、`ambient`(0.8)、`background`(透明)；mesh 字段见 6.7 | `advanced.tsx:439-468` | ✗ | 引擎加载 / WebGL 上下文 |
| `timeline` | `items` | `items[].title/desc/time` | `advanced.tsx:471-492` | ✗ | 无 |
| `file-tree` | `items` | `items[].name/type/children`；有 children 无 type 时自动补 `dir` | `advanced.tsx:515-566` | ✗ | 本地折叠，默认全展开 |
| `breadcrumb` | `items` | `items[]: string` | `advanced.tsx:648-660` | ✗ | 无 |

---

## 4. 交互与状态

### 4.1 action 契约

组件只声明 `action: string`（动作名）。真正回传由宿主注入的 `onAction(action, payload)` 完成；上下文是插件自有的 `GenuiActionContext`（`src/client/action-context.ts:11-21`），围栏/面板/工具卡各自提供实现。

回传 payload 的**形状（按组件）**：

| 组件 | payload | 依据 |
| --- | --- | --- |
| `button` | `{ type:'button', label }` | `render-node.tsx:284` |
| `input` | `{ type:'input', value, id?, submit? }`（Enter 时 `submit:true`） | `forms.tsx:409` |
| `textarea` | `{ type:'textarea', value, id?, submit? }` | `forms.tsx:485` |
| `select` | `{ type:'select', value, id? }` | `forms.tsx:352` |
| `checkbox` | `{ type:'checkbox', checked }` | `checkbox.tsx:54` |
| `radio` | `{ type:'radio', value }` | `forms.tsx:62` |
| `switch` | `{ type:'switch', checked }` | `forms.tsx:215` |
| `slider` | `{ type:'slider', value, id? }` | `forms.tsx:250` |
| `submit` | `{ type:'submit', answers, fields?, total, answered }`；重置为 `{ type:'submit-reset', groups }` | `forms.tsx:183-189`、`:160` |
| `quiz` | `{ type:'quiz', question, answer, correct }` | `advanced.tsx:612-617` |

送达模型时的文案形态（模型侧看到的是一条用户消息）：
`[genui-action] <action>。用户刚刚在界面中触发了动作 "<action>"，请根据组件数据执行相应操作，并用 dsh-ui 输出更新后的界面。<组件数据 JSON>`
（`src/client/index.tsx:109`；面板通道另有「只回一个 panel:true 围栏 + 至多一行 10 字确认」的收紧文案，`:63`）。

### 4.2 触发时机与节流

- **离散手势立即送达**：button、checkbox、radio、switch、select、input、textarea、submit、quiz 都逐次回调——每个都是一次明确用户意图（`src/client/GenuiBlock.tsx:23-38`）。
- **只有连续手势（slider 拖动）做 300ms 尾部防抖**，键为 `action + "\0" + id`，不同滑块互不挤占（`src/client/GenuiBlock.tsx:21`、`:50-62`）。
- input/textarea 的 blur 只在「值相对上次已送达值有变化」时发送，避免聚焦进出产生空往返（`forms.tsx:401-411`、`:449-451`）。
- 无 action 的按钮渲染为**禁用**态，不做「看起来可点但没反应」的假控件（`render-node.tsx:275-288`）。

### 4.3 聚合模式（group / id）与 submit

- `radio.group`：选择写入块级 `answers[group] = 选项文本`，**不逐次回调**（`forms.tsx:56-64`）。
- `checkbox.group`：写入 `multiAnswers[group] = 选项文本数组`；显式清空会保留空数组，使 `checked` 默认值不会在刷新后复活（`src/client/GenuiBlock.tsx:112-127`；`checkbox.tsx:24-40`）。
- `input/textarea/select/slider.id`：写入 `fields[id]`，随持久化恢复（`src/client/GenuiBlock.tsx:128-136`）。
- `submit.groups`：引用上述成员键（radio.group / checkbox.group / 字段 id），控制「需要哪些成员」与进度显示；不写则只要有已完成成员即可提交（`src/client/spec.ts:588-611`；`submission-registry.ts:128-149`）。
- 校验期诊断：键重复、`submit.groups` 引用未知成员、`groups` 里出现 secret 字段都属于**校验错误**（`submission-registry.ts:84-104`，由 `guard.ts:1529`/`1604` 并入），会触发 1.2 的节点剪枝——**可能把 submit 节点本身剪掉**。
- 就绪条件：`answered > 0 && answered >= total && (可本地判卷 || action + provider)`，否则按钮 disabled（`forms.tsx:113-114`、`:175`）。

### 4.4 本地判卷（「卷子」模式）

判卷资格（`submission-registry.ts:146-148`）：作用域内**全部成员都是 radio**、至少一个 radio 带 `answer`、且没有未知成员。满足时点 submit **不发任何请求**，就地进入结果视图：

- 计分：`score / graded.length`，逐题 ✓/✗，错题给正确答案与 `explanation`（`forms.tsx:116-168`）。
- 判卷后 `locked=true`，radio 全部 disabled（`forms.tsx:36`）；「重新作答」清空答案、`round+1`（radio 用 round 做 remount key）并可选触发 `resetAction`（`forms.tsx:157-165`；`render-node.tsx:508`）。
- 若作用域里混有非 radio 成员，或存在作用域外的已填内容且 submit 有可用 action，则**放弃本地判卷走 action**（`forms.tsx:104`：`shouldGradeLocally = localGradeEligible && (!hasOutOfScopePayload || !canSendAction)`）。

### 4.5 quiz（单题自测）

- 纯本地判卷：选中即在原地标 ✓/✗、显示该选项 `feedback` 与题级 `explanation`，可重做（`advanced.tsx:573-645`）。
- `action` 可选：作答的同一次点击里回传 `{type:'quiz', question, answer, correct}`（`advanced.tsx:609-619`）。
- `id` 变化会清空作答状态（换题复用同一树位置时不会串答案）（`advanced.tsx:578-586`）。

### 4.6 持久化键规则

存储：`localStorage['dsh.genui.interaction']`，最多 200 个块，按最近写入 LRU 淘汰（`src/client/interaction-store.ts:32-34`、`:77-88`）。块内保存 `answers`、`multiAnswers`、`locked`、`fields`（`interaction-store.ts:18-30`）。

键的构造（`interaction-store.ts:106-127`）：
- 内联围栏：`f:<sessionId>:<fence sourceId>:<fingerprint(spec JSON)>`
- 面板：`p:<sessionId>:<fingerprint>`
- 工具卡：`t:<sessionId>:<callId>`
- 指纹是 djb2（base36），只用于判等：**同样内容重放会恢复原状态，内容一改则换新键 → 干净状态**。

写入策略：状态变化后 300ms debounce 落盘；secret 字段在落盘前被剔除（`src/client/GenuiBlock.tsx:153-184`）。外部宿主可改用 `onStateChange` 接管持久化（`:93`、`:176-184`）。

### 4.7 面板（dock）语义

- 席位：槽位 `conversation.input.dock`，默认折叠，展开后限高可拖动（120–600px），默认 360px（`src/client/index.tsx:152-156`；`panel.tsx:8-24`、`:40-41`、`:73`）。
- 发布：`panel:true` 的 settled 围栏 / `render_ui` 结果都折算成面板操作 `{sourceId, order, mode:'replace'|'append'}`；同一 source 的重放幂等，后到的 replace 清空更早内容（`src/client/panel-store.ts:1-27`、`:286-296`）。
- 预算：折叠快照 ≤200 节点、追加 ≤200 次；超预算不 LRU 淘汰，而是记一条 overflow 屏障，保证重放顺序可重现（`panel-store.ts:29-33`、`:215-258`）。
- `/panel` 斜杠命令：发布默认 spec 并立即展开；`/panel clear` 清空；`/panel <指令>` 先显示默认内容再把指令交给模型（`src/client/panel-command.ts:1-24`）。

---

## 5. 归一化与容错

### 5.1 字段级别名（写错也能被救回）

归一化在修复/校验之前跑（`src/client/genui-runtime/normalize.ts:80-117`），别名表来自 `schema.ts:275-382`。高频项：

| 组件 | 别名 → 规范字段 |
| --- | --- |
| `text` | `text` → `content` |
| `callout` | `text` / `body` / `desc` → `content`；`kind` → `tone`；`tone` 值 `danger`→`error`、`warn`→`warning` |
| `card` | `label` → `title`；`content` → `items` |
| `badge` | `text` / `value` → `label` |
| `divider` | `title` / `text` → `label` |
| `icon` | `icon` → `name` |
| `code` | `content` / `text` → `code` |
| `copy` | `content` / `code` / `value` → `text` |
| `image` / `audio` / `video` | `url` / `link` → `src` |
| `table` | `headers` → `columns`；`data` / `items` → `rows` |
| `keyvalue` | `items` / `rows` / `entries` → `pairs`；记录内 `label` → `key` |
| `steps` | `items` → `steps` |
| `diff` | `items` / `files` → `diffs` |
| `select` / `radio` | `items` → `options` |
| `quiz` | `title` / `text` → `question`；`choices` / `items` → `options` |
| `blocks` | `items` / `data` → `rows`；行内 `title` → `label` |
| `file-tree` | `nodes` → `items`；记录内 `label` → `name` |
| `tabs` | 记录内 `content` → `items` |
| `arrow` | `direction` → `dir` |
| `list` | 条目内 `label`/`name` → `title`；`description`/`content`/`text`/`body`/`detail` → `desc` |

若别名与规范字段同时存在，规范字段胜出，别名被丢弃并产出 `kind:'alias'` 警告（`normalize.ts:85-99`）。

### 5.2 结构级修复（`normalize.ts`）

| 现象 | 处理 | 依据 |
| --- | --- | --- |
| 整个 spec 被当成字符串二次编码 | 解一次 JSON 并采纳 | `normalize.ts:323-340` |
| 根是裸数组 | 收养为 `{items: [...]}` | `normalize.ts:341-351` |
| 缺 `type` 但字段能唯一确定组件 | 推断出类型：`table`(columns+rows)、`keyvalue`(pairs)、`steps`(steps)、`diff`(diffs)、`scene3d`(meshes)、`tabs`(tabs) | `normalize.ts:20-33` |
| `stat` 写成了指标列表（`{type:'stat',items:[{label,value}…]}`，无 label/value） | 归一成一行多个单指标 `stat` | `normalize.ts:204-223` |
| `keyvalue.pairs` 写成 `[[k,v],…]` | 转成 `{key,value}` | `normalize.ts:255-266` |
| `file-tree` 父节点有 children 但没 `type` | 补 `type:'dir'` | `normalize.ts:163-171`、`:200-202` |
| `tabs[].items` 不是数组 | 单值包成数组；`content` → `items` | `normalize.ts:267-294` |
| `list.items` 里出现 `["文本"]` | 压平成字符串 | `normalize.ts:231` |
| `table.details` 比 rows 多 | 截断（校验报错、修复侧同步截断） | `normalize.ts:301-307`；`guard.ts:1737-1742` |

### 5.3 哪些错误「静默丢组件」，哪些「整块变代码块」

**静默丢弃（该组件消失，其它照常渲染）**——都发生在 `repairNodeFields` 返回 null：

- 缺必填字段：`button/checkbox/link/switch/submit` 缺 `label`、`stat` 缺 `label|value`、`progress.value` 非 0–100、`select/radio` 缺 `options`、`text` 缺内容、`callout` 缺 `content`、`code/svg/mermaid/copy` 缺正文、`icon` 缺 `name`、`hero` 缺 `title`、`scene3d` 缺 `meshes`、`quiz` 缺 `question/options`、`diagram` 缺合法 `kind` 或 `nodes`（`guard.ts:269-775`）。
- 安全过滤不过：`image/audio/video` 的 `src` 非 http(s)/相对路径；`link.href` 非 http(s)/mailto（此时 link 仍渲染为纯文本而非丢弃，`:420-426`）。
- 空的派生数据：`blocks.rows` 修复后为空、`table` 无法得出 columns、`chart` 既无 `data` 又无 `series`、`echart` 四种输入全无、`quiz` 无可读选项（`guard.ts:326`、`:551`、`:762-763`、`:1175-1177`）。
- 白名单外的 `type`：修复层**原样透传**（`guard.ts:776-779`），渲染层 `default: return null`（`render-node.tsx:525`）——结果是**隐形**，但不会拖垮整块，也不会进「声明/渲染」对账（`declared()` 只认白名单，`guard.ts:1398-1401`）。

**整块降级为代码块**：

- JSON 无法解析（两级修复都救不回）→ `parsePartialGenuiSpec` 返回 null（`fence-resolve.ts:53-69`）。
- 校验错误无法映射到具体节点（根级错误、`spec.items must be an array`、剪枝后仍不可渲染、渲染出 0 个原生节点）（`guard.ts:1718`、`:1757-1759`）。
- 注意：单点错误**不会**再降级——`partialRepairGenuiSpec` 会剪掉坏节点后重试一次（`guard.ts:1691-1760`）。

### 5.4 诊断分级

| 诊断 | 级别 | 影响 |
| --- | --- | --- |
| `kind:'alias'` | 警告 | 字段被改名后正常渲染 |
| `kind:'unknown-field'` | 警告 | 字段被丢弃，组件照常渲染（`diagnostics.ts:124-165`）；`list` 条目只渲染 `title/desc`，其它字段同样只报不动（`:134-145`） |
| `kind:'truncated'` | 警告 | tabs/accordion 家族上限截断（`guard.ts:1610-1616`） |
| `spec exceeds 200 nodes; tail elided` + `repair dropped …` | 错误但被判定为「策略性截断」 | 照常渲染（`guard.ts:1635-1645`） |
| 结构性/语义错误 | 错误 | 触发剪枝，剪不掉则整块降级 |
| 围栏不可渲染 + settled | 红色诊断条 | 显示在宿主代码块上方（`fence-render.tsx:110-134`） |
| 行内内容问题（`text.content` 里有 ```` ``` ```` 或 Markdown 表格） | `warning=block_markdown` | 只由 `validate_dsh_ui` 提示，建议改用 `code`/`table` 节点（`src/plugin/inline-content-diagnostic.ts:33-70`；`src/plugin/tool.ts:263-268`） |

### 5.5 JSON 两级修复

- **tier-1**（`repairFenceJson`，随时可跑）：字符串值里未转义的半角引号、尾逗号、`"key"` 前无值的键。只有「整块能 parse」才采纳，所以流式半截不会被误判（`src/shared/fence-repair.ts:44-72`）。
- **tier-2**（`completeFenceJson`，**仅 settled**）：补缺失的结束引号/括号，跳过错配的 `]`/`}` 与重复终结符（`fence-repair.ts:12-16`，入口 `fence-resolve.ts:63-68`）。
- `validate_dsh_ui` 工具在「发出之前」同时允许两级，并把修好的 JSON 直接回给模型（`src/plugin/tool.ts:369-400`）。

### 5.6 安全过滤（协议级约束，不可绕过）

| 字段 | 允许值 | 依据 |
| --- | --- | --- |
| 任意颜色（`accent`、`color`、`palette[]`、`background`、`theme.*`） | `#hex`(3–8)、`rgb()/rgba()`、`hsl()/hsla()`、`var(--dsw-…)`；长度 ≤64 | `src/client/genui-runtime/value-utils.ts:18-24` |
| `link.href` | `http(s)://` 或 `mailto:`；≤2048 | `value-utils.ts:27-32` |
| `image/audio/video.src`、`poster` | `http(s)://` 或同源相对路径；拒绝 `javascript:` 等协议与 `//` 开头 | `value-utils.ts:35-42` |
| `echart.option` | 深度 ≤10、单数组 ≤500、总遍历 ≤2000；字符串含 `<script|img|svg|iframe…>`、`on*= `、`javascript:` 会被过滤 | `guard.ts:1197-1267` |
| `svg.code` | 必须能被 DOMParser 解析成 `<svg>` 根，再以 `data:image/svg+xml` 作为 `<img>` 呈现，**从不内联注入宿主 DOM** | `src/client/blocks/svg.tsx:9-65` |
| `mermaid.code` | 渲染前做 kind 白名单 + 输出 SVG 消毒（禁 script/事件属性） | `src/client/mermaid-safe.ts`、`mermaid-core.ts` |

---

## 6. 图表与重型组件

### 6.1 `chart`（零依赖，纯 SVG/DOM）

- `kind` 缺省 `bars`（`src/client/blocks/charts.tsx:623`）；`bars/line/donut` 三分支（`:624-626`）。
- 多系列：`series[]` 存在时 bars 分组、`stacked:true` 堆叠；line 每项一条线（`charts.tsx:644-654`、`:855-870`）。
- 单系列柱状图以真实 0 线为基线，负值向下画（`:641-643` 注释）。
- 配色：`data[].color` > 显式 `palette` > 宿主 `--dsw-static-*` 分类色（`charts.tsx:25-38`、`:39-44`）。
- 本地筛选：`filter` 绑定字段值，对 label 做大小写不敏感子串过滤（`charts.tsx:629-639`）。
- 上限：每系列 60 点、最多 8 个系列、palette ≤12 色（`limits.ts:29-33`；`guard.ts:230-239`）。

### 6.2 `echart`（ECharts 引擎，双档懒加载）

- 两种模式：完整 `option` 直通（逃生舱）；或 `preset` + `data/series/links` 由组件生成主题化 option（`src/client/spec.ts:890-924`）。
- preset 14 种：`bar line area pie scatter radar gauge funnel treemap sankey graph heatmap bigline wordCloud`（`schema.ts:83-86`）。
- **引擎选择规则**：有 `option` → full；否则 preset ∈ {bar,line,area,pie,scatter,bigline} → **core**（tree-shaken，588 KB），其余 → **full**（1.04 MB）（`src/client/echarts-engine.ts:3-9`）。
- 高度：`height` 缺省 300，修复 clamp 100–800（`EChartNode.tsx:414`；`guard.ts:767`）。
- tooltip 强制 `renderMode:'richText'`，避免模型文案进入 `innerHTML`（`EChartNode.tsx:105-113`）。

### 6.3 `plot`（SafeMath 表达式）

- 表达式在无 `eval`/`new Function` 的手写递归下降求值器里计算；函数白名单 `sin cos tan asin acos atan sqrt cbrt exp log ln abs floor ceil round min max pow`，常量 `pi e tau`（`src/client/safe-math.ts:1-40`）。
- 坐标默认 `xMin=-5, xMax=5`，y 轴按默认参数值自动取景（`src/client/PlotBlock.tsx:139`、`:146-167`）。
- 参数滑块：每个 `params[]` 一个 slider，`animateTo` 可自动播放（默认 4000ms、不循环，修复上限 120000ms）（`advanced.tsx:81-93`；`guard.ts:895-913`）。
- `kind`: line(默认)/area/scatter（`schema.ts:69`、`:181-186`）。

### 6.4 `svg`

- 节点模式：`{type:'svg', code, title?, height?}` → DOMParser 校验 → `data:image/svg+xml` 塞进 `<img>`；HTML 风格无 xmlns 的 `<svg>` 会被补上命名空间后重校验（`src/client/blocks/svg.tsx:9-40`）。
- `height` 缺省 `auto`，修复 clamp 100–800，渲染 maxHeight 800（`svg.tsx:60`；`guard.ts:691`）。
- 围栏模式：```` ```svg ```` 由 `svg-fence.tsx` 处理，settled 后提供「预览 / 源码」两个 tab（`svg-fence.tsx:8-35`）。

### 6.5 `mermaid`

- 只接受 `code`（≤8000 字符）；引擎 `lib/assets/pele.js`（0.7 MB）按需 script 注入（`src/client/mermaid-lazy.ts:1-11`；`advanced.tsx:335`）。
- 调度：视口内（IntersectionObserver，前瞻一屏）才渲染；滚动/页面隐藏时排队等待，避免布局抖动阻塞输入（`advanced.tsx:336-423`；`mermaid-lazy.ts:36-99`）。
- 失败/加载中：显示原始源码 + 提示，不显示空白（`advanced.tsx:431-434`）。
- 主题联动：读取宿主 token 变化后重渲染（`advanced.tsx:372-413`）。

### 6.6 `diagram`（editorial SVG）

- 27 种 `kind`（`architecture/it-state/flowchart/sequence/state/er/timeline/swimlane/quadrant/radar/loop/nested/tree/org-chart/layers/venn/pyramid/bar/line/gantt/scatter/high-level/process/medallion/data-flow/dp-integration/dp-security-matrix`）（`schema.ts:73-78`）。
- 坐标类与规则类两种布局：`layout.ts` 的 `COORDINATE_KINDS` 用 `x/y/w/h`，其余按数据自动布局（`diagram/layout.ts:42-52`、`:155-180`）。
- 硬约束：坐标与尺寸被夹到 **4px 网格**（`guard.ts:1006-1008`、`:1011-1042`）；节点 ≤9、边 ≤12、zone ≤3、focal ≤2、边 label ≤14 字符（`limits.ts:49-54`）。
- 语义类型：`focal/backend/store/external/input/optional/security`；edge `kind`: solid(默认)/dashed/accent/link；`route`: auto(默认)/orthogonal/straight（`schema.ts:794-829`）。
- 纯 SVG 渲染，无外部引擎（`diagram/index.tsx:1-14`）。

### 6.7 `scene3d`（three.js）

- `meshes[]`: `shape` ∈ box(sphere/cone/cylinder/torus)，`color`、`position[3]`、`rotation[3]`、`scale`(数或三元组)、`size`(数或三元组)（`schema.ts:694-707`）。
- `ambient` 0–2，缺省 **0.8**；`background` 缺省透明，非法颜色直接忽略（`src/client/scene3d-core.ts:77-83`）。
- 固定透视相机 `(3, 2.4, 4)` + 网格地面，轨道控制（`scene3d-core.ts:72-91`、`:121-127`）。
- 引擎 `lib/assets/three.js`（700 KB）懒加载；mesh 上限 5，渲染侧再兜一次（`advanced.tsx:443-459`）。

### 6.8 `icon`

- 目录来自 OpenAI Apps SDK UI 图标集：**64 个内联**同步渲染，其余 685 个从 `lib/assets/icons.js`（969 KB）一次性加载；未知名字降级为圆点（`icon.tsx:1-13`、`:84-86`；`icons/icon-lazy.ts:1-14`）。
- 光学尺寸只取 16/20/24/32，缺省 **20**（`icon.tsx:26-32`）。
- `tile:true` 渲染带色底板；`label` 为空时 `aria-hidden`（`icon.tsx:69-83`）。
- 名字查表用 `Object.hasOwn` 防原型链（`icon-lazy.ts:32-40`）。

### 6.9 懒加载资产与路由

| 资产 | 大小 | 触发条件 | 依据 |
| --- | --- | --- | --- |
| `lib/assets/pele.js` | 0.7 MB | 出现 `mermaid` 节点且进入视口 | `mermaid-lazy.ts:79` |
| `lib/assets/three.js` | 700 KB | 出现 `scene3d` 节点 | `scene3d-lazy.ts:23-25` |
| `lib/assets/echarts-core.js` | 588 KB | preset ∈ core 六种 | `echarts-engine.ts:3-9` |
| `lib/assets/echarts-full.js` | 1.04 MB | 其他 preset 或 `option` 直通 | 同上 |
| `lib/assets/icons.js` | 969 KB | 图标名不在 64 个内联集内 | `icons/icon-lazy.ts` |
| `lib/assets/standalone-runtime.js` | 1.1 MB | 独立导出（artifact 导出用） | `package.json` exports |

加载机制：`<script>` 注入 → 引擎挂到 `window.__GenuiAssets__.<camelCaseName>` → 每文件每页最多加载一次、失败对整个页面终态（`src/client/asset-loader.ts:1-96`）。URL 前缀 `/plugins/@changfenhuang/dsh-genui/assets/`，由插件自己的 node-half HTTP 路由提供（最长前缀优先于通用 `/plugins` 路由），并带 boot rev 做缓存击穿（`asset-loader.ts:49-56`；`src/plugin/index.ts:38-84`、`:242-248`）。

---

## 7. 对 dsh-vt-gen-ui 的影响

> 前提：「规格能力」= 模型产出的 JSON 契约 + 宿主渲染语义。契约层改了就失去与模型/技能/SKILL.md 的兼容；表现层（CSS、主题、动画、图标、排版）可以自由重做。

### 7.1 必须原样保留（协议、字段名、语义）

| 项 | 为什么不能动 | 依据 |
| --- | --- | --- |
| 围栏标签 `dsh-ui`（含尾部标点、大小写的宽松匹配） | 模型被系统提示教的就是这个标签；不匹配就整条退化成代码块 | `fence-language.ts:5-19`；`src/plugin/index.ts:92-132` |
| `type` 白名单与 50 个 type 名 | 技能/提示词/历史会话都按这些名字写；改名即全量失效 | `schema.ts:275-382`；`render-node.tsx:190-526` |
| 每个组件的**必填字段名**（`content`/`columns`+`rows`/`key-value`/`name`/`steps`/`pairs`/`diffs`…） | 字段名错=该组件被丢弃，这是最高频的真实故障 | `schema.ts:275-382`；`guard.ts:269-775` |
| 别名与结构修复表 | 它们的价值就是「模型写错也能救」；删掉等于把容错能力归零 | `normalize.ts:80-307`；5.1/5.2 |
| 根 spec 结构 `{title,gap,panel,append,items}` 与单组件根简写 | 提示词里的示例、`validate_dsh_ui` 的判定、面板路由都依赖它 | `spec.ts:74-93`、`:926-997` |
| `action` 字段语义与 payload 形状（`{type, value|checked|label|answers|…}`） | 模型靠 payload 识别用户意图；形状变了等于改协议 | 4.1 表 |
| `group`/`id` 聚合 + `submit.groups` + 本地判卷资格 | 「卷子」是文档化的核心交互模式 | `submission-registry.ts:128-149`；`forms.tsx:104-198` |
| 持久化键公式（session + 位点 + 内容指纹） | 决定「刷新恢复 / 换题清空」，改了会出现状态串台或全量丢失 | `interaction-store.ts:106-127` |
| 资源上限的**数量级**（200 节点 / 深度 8 / 60 点 / 表格 50×12 …） | 与提示词里的写作约束、性能兜底绑定 | `limits.ts` |
| 颜色 / href / media src 的安全过滤正则 | 这是防注入边界，不是样式偏好 | `value-utils.ts:18-42` |
| 两级 JSON 修复的分层（tier-2 仅 settled） | 一旦流式允许补全，半截正文会被当成成品 | `fence-repair.ts:12-16`；`fence-resolve.ts:63-68` |
| 坏节点静默丢弃 vs 整块降级的分界 | 决定「一个字段写错」是丢一个组件还是毁掉整条回答 | 5.3 |
| `panel`/`append` 的折叠语义与预算 | 会话面板是独立于消息流的产品行为 | `panel-store.ts:1-33` |

### 7.2 纯表现层可改（不影响契约）

| 项 | 可改范围 | 依据（当前实现） |
| --- | --- | --- |
| 颜色 / 圆角 / 阴影 / 间距 / 字号 | 全部 `GenuiBlock.module.css` 与 `--dsl-g-*` 自定义属性；spec 只传语义 `tone`/`accent` | `accent` 仅用于边框+标题（`render-node.tsx:246-258`）；调色板走 `--dsw-static-*`（`charts.tsx:25-38`） |
| 入场/过渡动画 | 时间、缓动、是否 stagger；`prefers-reduced-motion` 必须保留 | `GenuiBlock.tsx:198-214` |
| 骨架/加载/错误态的视觉 | mermaid/echarts/three/icon 的 loading 与 fallback 外观 | `advanced.tsx:424-466`；`EChartNode` |
| 图表内部绘制（自研 SVG） | `chart` 的坐标轴、tooltip、图例、动画都可重画；只需保留 `kind`/`data`/`series`/`palette`/`filter` 语义 | `charts.tsx:616-1018` |
| `table` 的视觉与交互增强 | 排序/分组/详情/合计/导出的**行为**建议保留，样式与动画自由 | `charts.tsx:225-500` |
| 图标库来源 | 可换 Lucide/Phosphor 等，但 `icon.name` 的目录名（`Nodes`、`Check`…）是模型可见字段——换库需保留名字映射或改提示词 | `icon.tsx`；`ICON_NAMES.md` |
| 布局细节 | `row`/`col`/`grid`/`card` 的实际 CSS 实现（是否用 flex/grid、间距取值）自由；字段语义与外层结构保留 | `render-node.tsx:205-270` |
| 面板 dock 的形态 | 高度、折叠方式、拖拽手柄、标题栏样式；槽位与操作语义保留 | `panel.tsx:8-24`、`:40-41` |
| 动画化的 count-up、sparkline 画法 | 属表现细节 | `render-node.tsx:44-159` |
| 诊断条文案与样式 | 文字、配色、位置可改；「settled 后才提示」的时机建议保留 | `fence-render.tsx:34-44`、`:118-134` |
| 文案 i18n | `src/client/i18n/{zh,en}.ts` 可扩充 | `src/client/i18n/` |

### 7.3 落地时最容易踩的五个坑

1. **`grid.cols` 不写就是 1 列**——bento 布局必须显式写 `cols`；`span` 在修复阶段被 clamp 到 2–12，写 `span:1` 等于没写（`guard.ts:259-260`、`:363`）。
2. **`callout` 的 tone 没有 `danger`**，只有 `error`（`danger` 会被值别名救成 `error`，但 `validate_dsh_ui` 前别依赖）；`card/badge/button` 的 tone 集合各不相同（`schema.ts:290`、`:293`、`:281`、`:283`）。
3. **`table` 的 `columns` 可以省**，但只有 `rows` 的第一行是数组时才能从数据推出表头（`table-details.ts:33-46`；`guard.ts:1955-1959`）。
4. **任何 `submit`/`radio.group` 的键冲突都是校验错误**，会触发节点剪枝——键名要全局唯一（`submission-registry.ts:84-104`）。
5. **重型组件（mermaid/scene3d/echart/icon 扩展名）依赖插件自己的资产路由**。若 vt 版本自己没有等价路由，这三类会永久停在 fallback（`asset-loader.ts:60-96`；`src/plugin/index.ts:38-84`）。
