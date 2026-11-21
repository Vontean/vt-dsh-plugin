/**
 * Model-facing catalog metadata: how each component is grouped in the prompt,
 * how it is one-line described, and the gotchas worth repeating.
 *
 * Kept beside `definitions.ts` because the prompt, the validation schema, and
 * the render registry must all agree on the same set of types — `derive.ts`
 * asserts that agreement at module load, so adding a schema without a doc (or
 * the reverse) fails loudly instead of silently drifting.
 */

export type CatalogCategoryKey = 'layout' | 'display' | 'chart' | 'interactive' | 'advanced'

export interface CatalogCategory {
  readonly key: CatalogCategoryKey
  /** Prompt label, e.g. 布局. */
  readonly label: string
  /** Types in prompt order. Every schema type appears exactly once. */
  readonly types: readonly string[]
  /** Text appended after the last type of the group. */
  readonly tail?: string
}

export interface CatalogDoc {
  readonly category: CatalogCategoryKey
  /** One sentence the model sees in the generated component reference. */
  readonly summary: string
  /** Appended after the type name in the system prompt's component list. */
  readonly promptInline?: string
  /** Compact required-field shape used by the field quick reference. */
  readonly quickRef?: string
  /** Clauses in the system prompt's "wrong field name" paragraph (type name is prepended). */
  readonly gotcha?: readonly string[]
  /** Extra usage hint for the generated skill reference. */
  readonly usage?: string
}

/** Prompt grouping. Order is the order the model reads; keep it stable. */
export const CATALOG_CATEGORIES: readonly CatalogCategory[] = [
  {
    key: 'layout',
    label: '布局',
    types: ['text', 'row', 'col', 'grid', 'card', 'divider', 'spacer', 'hero', 'page', 'nav', 'split'],
  },
  {
    key: 'display',
    label: '展示',
    types: [
      'badge', 'stat', 'progress', 'list', 'table', 'keyvalue', 'timeline', 'file-tree', 'breadcrumb',
      'callout', 'steps', 'diff', 'json', 'code', 'copy', 'avatar', 'image', 'audio', 'video', 'icon',
      'blocks', 'arrow', 'list-row', 'empty', 'loading',
    ],
  },
  {
    key: 'chart',
    label: '图表',
    types: ['chart', 'echart', 'plot', 'svg'],
  },
  {
    key: 'interactive',
    label: '交互',
    types: [
      'button', 'input', 'textarea', 'select', 'checkbox', 'switch', 'slider', 'radio', 'submit',
      'quiz', 'link', 'tabs', 'accordion', 'field-group',
    ],
    tail: '（row.justify / col.width / card.flat 见图元）',
  },
  {
    key: 'advanced',
    label: '高级',
    types: ['mermaid', 'diagram', 'scene3d'],
  },
]

export const CATALOG_DOCS: Readonly<Record<string, CatalogDoc>> = {
  // ---- 布局 ----
  text: { category: 'layout', summary: '段落/标题文字，支持大小、对齐、语义色与等宽。' },
  row: { category: 'layout', summary: '横向排列一组成员。' },
  col: { category: 'layout', summary: '纵向排列一组成员，可占行宽百分比。' },
  grid: { category: 'layout', summary: '网格布局；子节点 span 控制占几列。' },
  card: { category: 'layout', summary: '带标题的分组表面；tone 给语义底色，flat 去阴影。' },
  divider: { category: 'layout', summary: '分隔线；带 label 时渲染成章节分隔。' },
  spacer: { category: 'layout', summary: '纯间距占位。' },
  hero: {
    category: 'layout',
    summary: '封面块：大数字 + 标题 + 副标题，一条回答最多一个。',
    promptInline: '（封面块，一条回答最多一个）',
  },
  page: {
    category: 'layout',
    summary: '页面容器：可选标题栏（标题/副标题/尾部操作）与内容区，原型的根节点。',
    promptInline: '（页面容器：标题栏 + 内容区）',
    quickRef: '{"type":"page","title","items":[...]}',
    usage: '窄容器下内边距自动收紧；标题栏只在写 title/subtitle/actions 时出现。',
  },
  nav: {
    category: 'layout',
    summary: '导航示意：variant 取 top/side/tabs，当前项用 active 标记；点击只做视觉选中。',
    promptInline: '（顶栏/侧栏/底部标签）',
    quickRef: '{"type":"nav","items":[{"label","active"}]}',
    gotcha: ['items 是 [{label,active}] 记录数组，不是字符串数组'],
    usage: '聊天正文里的导航是示意：点击只在本地切换选中态，不承载路由。',
  },

  split: {
    category: 'layout',
    summary: '双栏布局：ratio 取 1:1/2:1/1:2，窄容器自动堆叠为单列。',
    promptInline: '（1:1/2:1/1:2 双栏，窄容器堆叠）',
    quickRef: '{"type":"split","ratio":"1:1","items":[...]}',
    gotcha: ['ratio 只接受 1:1 / 2:1 / 1:2；分隔线默认不画，需要时才写 divider'],
    usage: '各栏通常各放一个 `page`；两栏并排时等高。容器窄于 600 时堆叠，间距仍是 16。',
  },

  // ---- 展示 ----
  badge: { category: 'display', summary: '短状态标签。' },
  stat: {
    category: 'display',
    summary: '单个指标：标签 + 数值，可带涨跌与微趋势线。',
    quickRef: '{"type":"stat","label","value"}',
  },
  progress: {
    category: 'display',
    summary: '进度条或环形进度。',
    quickRef: '{"type":"progress","value":0-100}',
  },
  list: { category: 'display', summary: '要点列表；条目可嵌节点，可用 filter 就地筛选。' },
  table: {
    category: 'display',
    summary: '数据表格：排序、合计、导出、行明细、就地筛选。',
    quickRef: '{"type":"table","columns":[...],"rows":[[...]]}',
    gotcha: ['要 columns+rows 不是 items'],
    usage: '`types` 可按列指定 bar/ring/spark/badge/delta/num/index/group；`total:true` 追加合计行；`export:true` 出现复制 Markdown/CSV；`filter` 绑定输入框 id 就地过滤。',
  },
  keyvalue: {
    category: 'display',
    summary: '键值对列表。',
    quickRef: '{"type":"keyvalue","pairs":[{"key","value"}]}',
    gotcha: ['记录是 {key,value} 不是 {label,value}'],
  },
  timeline: { category: 'display', summary: '时间线：条目含标题、说明、时间。' },
  'file-tree': {
    category: 'display',
    summary: '目录树，本地折叠展开。',
    quickRef: '{"type":"file-tree","items":[{"name","type":"file|dir"}]}',
    gotcha: ['记录是 {name,type} 不是 {label}'],
  },
  breadcrumb: { category: 'display', summary: '面包屑路径。' },
  callout: {
    category: 'display',
    summary: '单条强调/提醒/风险摘要。',
    quickRef: '{"type":"callout","content"}',
    gotcha: ['正文是 `content` 不是 text/desc', 'tone 是 info/success/warning/error（无 danger）'],
    usage: '`content` 只能是文本字符串，可含 `\\n` 分行；多条独立事项改用 list。',
  },
  steps: {
    category: 'display',
    summary: '步骤条：current 标记进行到第几步。',
    quickRef: '{"type":"steps","steps":[{"title"}]}',
  },
  diff: { category: 'display', summary: '代码改动对比：路径 + 旧文 + 新文。' },
  json: { category: 'display', summary: 'JSON 树查看器。' },
  code: { category: 'display', summary: '代码块，带复制。' },
  copy: { category: 'display', summary: '可复制的文本；长文可折叠预览。' },
  avatar: { category: 'display', summary: '头像（按名字取色）。' },
  image: { category: 'display', summary: '图片，可带 alt 与图注。' },
  audio: { category: 'display', summary: '音频播放器（不自动播放）。' },
  video: { category: 'display', summary: '视频播放器（不自动播放）。' },
  icon: { category: 'display', summary: '内置图标；tile 画成淡色圆角底。' },
  blocks: { category: 'display', summary: '色块图解：阶梯/等分/泳道，适合分组与逐轮推进。' },
  arrow: { category: 'display', summary: '图里的细线连接箭头。' },
  'list-row': {
    category: 'display',
    summary: '紧凑列表行：媒体位 + 主文本 + 副文本 + 尾部操作。',
    promptInline: '（媒体+主副文本+尾部操作）',
    quickRef: '{"type":"list-row","title","desc"}',
    usage: 'media 是短标签或图标位；actions 放 button 等节点；一行只表达一个对象。',
  },
  empty: {
    category: 'display',
    summary: '空态：图形位（可省）+ 标题 + 说明 + 可选操作，按真实状态呈现。',
    quickRef: '{"type":"empty","title","desc"}',
    gotcha: ['标题是 `title`，不要只写 desc；这是真实状态，不要画成虚线草稿'],
    usage: '「没有数据」的样子，不是「还没画完」；actions 放 button/link。',
  },
  loading: {
    category: 'display',
    summary: '加载态骨架：variant 取 block/row，lines 控制条数（≤3）。',
    quickRef: '{"type":"loading","variant":"block","lines":3}',
    gotcha: ['lines 最多 3 条，宽度自动错落，不要手写宽度字段'],
    usage: '骨架按 100/88/72 错落收口；容器带 role=status + aria-busy。',
  },

  // ---- 图表 ----
  chart: {
    category: 'chart',
    summary: '轻量原生图表：bars/line/donut，≤8 点快速对比。',
    promptInline: ' {"kind":"bars|line|donut","data":[{"label":"...","value":n}]}（series：bars 分组/堆叠 / line 多序列）',
  },
  echart: {
    category: 'chart',
    summary: 'ECharts 全功能图表：preset 或原生 option。',
    promptInline: ' (preset 名或 option 直通，清单见 skill)',
    usage: 'preset 支持 bar/line/area/pie/scatter/radar/gauge/funnel/treemap/sankey/graph/heatmap/bigline/wordCloud；多序列或需要缩放时优先用它。',
  },
  plot: { category: 'chart', summary: 'SVG 函数图，可带参数滑块与动画。', promptInline: ' (函数图)' },
  svg: { category: 'chart', summary: '独立 SVG 图片预览。', promptInline: ' (单图预览)' },

  // ---- 交互 ----
  button: { category: 'interactive', summary: '按钮；无 action 时渲染为禁用态。' },
  input: { category: 'interactive', summary: '单行输入；带 id 的值会持久化并进 submit。' },
  textarea: { category: 'interactive', summary: '多行输入；失焦与 Ctrl/Cmd+Enter 提交。' },
  select: { category: 'interactive', summary: '下拉选择。' },
  checkbox: { category: 'interactive', summary: '复选；带 group 进入聚合模式。' },
  switch: { category: 'interactive', summary: '开关。' },
  slider: { category: 'interactive', summary: '滑块，实时显示数值。' },
  radio: { category: 'interactive', summary: '单选；带 group 聚合，可本地判卷。' },
  submit: { category: 'interactive', summary: '聚合提交；groups 列出需完成的成员。' },
  quiz: { category: 'interactive', summary: '单题自测，点选即判、可重试。' },
  link: { category: 'interactive', summary: '安全链接；无合法 href 时渲染为纯文本。' },
  tabs: { category: 'interactive', summary: '标签页容器。' },
  accordion: { category: 'interactive', summary: '折叠面板。' },
  'field-group': {
    category: 'interactive',
    summary: '字段组：标签 + 控件 + 提示 + 错误；错误态 role=alert。',
    quickRef: '{"type":"field-group","label","items":[...]}',
    gotcha: ['label 与 items 都必填'],
    usage: 'items 放控件（input/select/…）；desc 是提示，error 是错误文案，必填时加 `required:true`。',
  },

  // ---- 高级 ----
  mermaid: {
    category: 'advanced',
    summary: 'Mermaid 图（流程/时序/甘特/ER 等 30+ 图型）。',
    promptInline: ' (流程图/时序/甘特/ER 等，关键字见 skill)',
  },
  diagram: { category: 'advanced', summary: '编辑级品牌图，27 种视觉类型。', promptInline: ' (架构/流程图)' },
  scene3d: { category: 'advanced', summary: '3D WebGL 场景，1–5 个 mesh。', promptInline: ' (3D WebGL)' },
}

/**
 * Root-level multi-screen contract. It is not a component: `screens` /
 * `initial` live on the spec root, and `goto` is a cross-cutting node hint.
 * Kept in the catalog so the prompt, the generated reference and the guard
 * assertions describe the same contract.
 */
export const SCREEN_SPEC_DOC = {
  prompt: `**多屏原型**（可选）：spec 根可写 \`{"screens":{"home":[...],"detail":[...]},"initial":"home"}\` 代替 \`items\`；可交互节点（当前为 \`button\`）加 \`"goto":"detail"\` 在本地切屏，不发 action、不请求模型。块头部出现「返回」；未声明的屏 id 被忽略，表单值与当前屏随块持久化。`,
  reference: `### 多屏原型（根级字段，不是组件）

- 根字段 \`screens\`（屏 id → 节点数组，最多 12 屏）与 \`initial\`（起始屏，缺省取第一个声明的屏）；与 \`items\` 二选一。
- 公共节点字段 \`span\`（grid 占列）和 \`goto\`（切屏目标）对所有 type 都可写；\`goto\` 目前由 \`button\` 触发，其他节点携带但不动作。
- 切屏是本地状态机：不发 action、不请求模型；「返回」回上一屏，栈深 20，未声明的目标忽略。`,
} as const
