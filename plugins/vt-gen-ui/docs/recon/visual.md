# dsh-genui 渲染与视觉层侦察报告

> 侦察对象：`@changfenhuang/dsh-genui` **0.14.0**（只读）
> 源码根：`/Users/mac/.dsh/profiles/desktop/node_modules/@changfenhuang/dsh-genui`
> 宿主：DeepSeek Harness Desktop（`app.asar`，2026-10-29 构建）
> 目的：为 fork 版 `dsh-vt-gen-ui` 定位「丑」的实证原因与换皮接缝。
> 配套文档：`docs/recon/schema.md`（组件规格/字段，本文不重复）。
>
> 方法说明：全部结论来自静态阅读源码 + 宿主 asar 内联 CSS/token 提取；**未运行 GUI 截图**，凡是「用户会看到什么」均由代码路径推导，标注为推断的地方均已注明。

---

## 0. 结论速览

| 问题 | 结论 |
|---|---|
| 视觉代码在哪 | 96% 在 `src/client/GenuiBlock.module.css`（2575 行 / 550 个类）+ `PlotBlock.module.css`（171 行）；TSX 里另有 45 处内联 `style` |
| 有设计 token 吗 | **有，而且是认真做过的**：`GenuiBlock.module.css:38-128` 是集中 token 段（字号/间距/圆角/动效/颜色/表面） |
| 跟宿主主题联动吗 | **大方向正确**：颜色基本走 `--dsw-alias-*`，深浅色靠 `body[data-ds-dark-theme]`（`:24-36`）。但**品牌色选错了 token**，且有 2 个 token 名在宿主根本不存在 |
| 那为什么还丑 | 三个层面的原因叠加，见下 |
| 只改 CSS 够不够 | **只改 token 段不够**；**改整个 CSS 文件 + 少量 TSX** 能覆盖约 70–75% 的视觉问题 |

### 最大的 3 个「丑」根因（一句话版）

1. **字重与色阶一路走到黑，没有对比**：69 处 `font-weight` 声明里 **67 处 ≥600**（唯一 400 只有 `:2075` 的判卷反馈），标题 800、正文 650、标签 700；宿主自己的 UI 用 `500` 做标签（asar 内提取到的 `.vdszpW_title{font-weight:500}` 一类，类是构建期 hash 名，此处只证明字重值）。整块文字「全部加粗」= 没有层级 = 廉价。
2. **每个组件都在抢注意力**：卡片=边框+双层阴影（`:212-226`）、表头=大写+字距+斑马纹+双边框（`:686-728`）、hero=三层渐变（`:441-475`）、进度条=高光渐变（`:647`）、图标=色块底板（`:2389-2393`）、入场=逐项 90ms 级联动画（`GenuiBlock.tsx:204`）。装饰密度远高于宿主正文，读起来像「PPT 模板」。
3. **它是宿主里的第二套设计系统，而不是宿主的一部分**：品牌色用 `--dsw-alias-state-business-primary`（状态蓝，`:83`）而宿主自己的主按钮色是 `--dsw-alias-brand-primary`（单色，asar 中 `button-primary-fill → brand-primary → label-primary`）；按钮/输入/悬停/滚动条/内联码全部自己用 `color-mix` 重造，没消费宿主的 `--dsw-alias-interactive-bg-hover` / `button-primary-fill` / `scrollbar-*`（宿主共 107 个 alias token，插件只用了 24 个）。

---

## 1. 渲染管线

### 1.1 客户端入口注册了什么（`src/client/index.tsx`）

`apply(ctx)` 返回 disposer 数组，共 5 个注册点：

| 注册点 | 位置 | 作用 |
|---|---|---|
| `installDomFenceRenderer` | `index.tsx:129` | ```dsh-ui 围栏 → DOM 通道渲染（主路径） |
| `tool.call.toolview`（key=`render_ui`） | `index.tsx:142-151` | `render_ui` 工具的**工具卡片**，读 `result.meta` 里的已修复 spec |
| `conversation.input.dock`（id=`genui-panel`，order=50） | `index.tsx:155-163` | 会话面板 dock（常驻输入框上方） |
| `inputTriggers.registerSource` | `index.tsx:178-184` | `/panel` 斜杠命令；**用 `ctx.inject` 可选注入**，宿主没有该服务时不注册也不影响渲染 |
| `mountAchievementToasts` | `index.tsx:137` | body 级成就弹层（与视觉重构无关，但会渲染 DOM） |

硬依赖声明在文件末尾：`export const inject = ['slots', 'sessions']`（`index.tsx:204`）。注释明确解释了为什么不把 `inputTriggers` 写进 `inject`：cordis 的硬注入是激活门槛，宿主没有该服务会永久 park（`index.tsx:196-203`）。

三条渲染通道的**输出组件同一个**：`GenuiBlock`（fence 走 `fence-render.tsx` → `GenuiBlock`，toolview 走 `GenuiToolView` → `ExportableGenuiBlock` → `GenuiBlock`，panel 走 `GenuiPanel` → `GenuiBlock`）。所以**换皮只要改 `GenuiBlock` + CSS，三条通道同时生效**。

### 1.2 为什么是 DOM 通道而不是 fence-registry

宿主 0812-final 快照**移除了 fence-registry 扩展点**，插件因此降级为 DOM 观察；CHANGELOG 记录了这次决策与后续升级：

- `CHANGELOG.md:454`：宿主提供 fence-registry 时走 registry 通道，原版 DSH 走 DOM 通道，「零宿主代码改动」。
- `CHANGELOG.md:451`：0812-final 移除扩展点后，最初只能等 `data-streaming` 落定才挂载，随后 DOM 通道升级为**流式接管**。

即：**fork 版不能指望宿主给围栏注册 API**，DOM 通道是必须继承的既成事实。

### 1.3 挂载与隐藏（DOM surgery）

机制（`dom-fence.tsx`）：

1. 用常量类名/属性定位宿主块：`.md-code-block, .code-block, .code-block-small`（`:75`）、语言标签、`<pre>` 正文（`:19-22` 注释 + `:492` `findFenceCandidates`）。
2. 解析正文 → 渲染成 React 节点（`:1177`）。
3. **先挂载、后隐藏**：`block.after(container)`（`:1202`）成功后才 `block.style.display = 'none'`（`:1224`）。注释（`:1190-1192`）说明这是 issue #19 的修复：挂载失败绝不能让原文消失。
4. 注入的容器是 `div.genui-dom-fence`（`:114`，**稳定、未 hash 的类名**），诊断块是 `div.genui-dom-fence-diagnostic`（`:116`）。
5. 被隐藏的原始块加 `data-genui-rendered`（`:110`）防重复处理。

**视觉后果（重要）**：宿主代码块的边距是 `.md-code-block{margin:10px 0}`（asar 提取），而插件的 `.block` 是 `margin: 8px 0`（`GenuiBlock.module.css:135`），容器 `div.genui-dom-fence` 自身无边距 → 每处 GenUI 块比它替换掉的代码块**上下各紧 2px**。单点看不出来，一段回复里有 3–4 个块时整条消息的纵向节奏跟正文段落对不上。

另一个后果：容器插在宿主 markdown 正文容器内部（`.markdown` 内），宿主的 prose 元素选择器会**漏进插件的 DOM**。插件方的应对是逐条打补丁（见 `:740-802` 的长注释，专门处理宿主 `.markdown` 的 `overflow-wrap`/`inline-flex` 造成的表格串列 #280），而不是在根上加一次 reset —— 这是后面很多「补丁摞补丁」CSS 的来源。

### 1.4 流式期间的增量挂载与修复

- 观察者：`new MutationObserver`（`:1666`），`subtree: true` + `attributeFilter: FENCE_ATTRIBUTES`（`:1739`）+ `characterData: true`（`:1742`，流式 token 是文本节点增长）。
- 观察边界（明确排除，避免与其他插件/宿主区域打架）：不观察插件自己的容器与诊断块（`SURFACE_EXCLUDES`，`:120`）、推理/工具/侧栏/插件面板的文本（`TAG_TEXT_EXCLUDES`，`:123`）、输入区（`IGNORED_MUTATION_SCOPE`，`:134`）；单轮脏节点上限 512（`DIRTY_TARGET_LIMIT`，`:157`）。
- 增量语义：`enqueueMutationTarget`（`:1258` 起）把变更节点收敛成候选，**不做全量重扫**；一次流式 token 的成本是「一次 `closest()`」。注释在 `:1240-1256`。
- 首个组件完成即接管：正文还没写完、但只要 partial parser 能闭合一个组件就渲染（`index.tsx:10-13` 注释 + `dom-fence.tsx:1177-1190`）。一个组件都没闭合时显示骨架屏 `GenuiSkeleton`（`:213-225`），而不是半截 JSON。
- Pre-paint 修复：宿主 React 重渲染会抹掉外来容器或重置 `display`，因此在 MutationObserver 的微任务里**在绘制前**补回（`:26-30` 注释、`:1492` `if (block.style.display !== 'none') block.style.display = 'none'`）。
- 兜底 sweep：1s 一轮（`SWEEP_MS = 1000`，`:142`），每轮预算 8ms（`SWEEP_BUDGET_MS`，`:147`）；预算超了就延后。
- 每次重渲染都换新 React 节点，靠 `GenuiBlock` 的 `memo` + `JSON.stringify` 等值比较避免整树重渲染（`GenuiBlock.tsx:80-83`、`:236-239`）。

### 1.5 清理

- `unmountBlock(block)`（`:1049`）：`root.unmount()` + 移除容器 + 恢复原始代码块。
- 调用点：块被宿主移除、分支切换、语言判错回退、unload（`:1465,1484,1521,1536,1540,1561,1570,1604`），最终在 `:1782` 统一清空 `mounts`。
- React 层：`GenuiBlock` 卸载时清空 slider 的 debounce timer（`GenuiBlock.tsx:43-48`），持久化节流 300ms（`:182`）。

### 1.6 分发：GenuiBlock → render-node

```
GenuiBlock  (GenuiBlock.tsx:192-217)
  ├─ .block[data-genui]              ← 换皮第一钩子
  ├─ .banner (spec.title)            :193
  └─ .col (gap = spec.gap ?? 16)     :194
       └─ .reveal ×N (动画延迟 i*90ms，上限 720ms)   :200-211
            └─ renderNode(node, i, onAction, 0, answers)   blocks/render-node.tsx:174
                 └─ switch (50 个 type)  :190-525
                      ├─ 简单节点就地渲染（text/row/col/grid/card/button/badge/hero/stat/progress/divider/list/table/chart/avatar/spacer/icon/blocks/arrow/link）
                      └─ 复杂家族分文件（forms/checkbox/charts/advanced/image/svg/icon/blocks/diagram/EChartNode/PlotBlock）
```

50 个 type 的全量清单见 `schema.md §3`。对视觉重构有意义的是：**所有节点的外壳类名都由 CSS Module 提供，TSX 只负责结构和少量内联几何**（内联样式集中在 `charts.tsx` 20 处、`render-node.tsx` 6 处、`PlotBlock.tsx` 4 处）。

---

## 2. 样式体系

### 2.1 文件与体量

| 文件 | 行数 | 说明 |
|---|---|---|
| `src/client/GenuiBlock.module.css` | **2575** | 主样式，约 550 条类规则，三条通道共用 |
| `src/client/PlotBlock.module.css` | 171 | 函数图块，**自带一份 token 副本** |
| `src/client/artifact/ArtifactExport.module.css` | — | 导出/预览徽标 |
| `src/client/TemplateDrawer.module.css` | — | 模板抽屉（面板内） |
| `src/client/blocks/**/*.tsx` | 7522 | 块组件；`charts.tsx` 1018、`advanced.tsx` 669、`forms.tsx` 531 |

### 2.2 集中 token 段（`GenuiBlock.module.css:38-128`）

设计 token 全部声明在 `.block, .panel` 上（`:38-39`），注释里自称 **design system v2 → v12** 迭代。分五组：

| 组 | 行 | 值 |
|---|---|---|
| radius | `:45-48` | surface 12 / control 8 / sm 6 / pill 999 |
| type | `:56-66` | stat-hero 44 / stat 34 / mega 52 / display 28 / h1 24 / h2 19 / h3 16 / **body 14.5 / title 13.5 / meta 12.5 / data 12** |
| spacing | `:68-72` | 4 / 8 / 12 / 16 / 24 |
| motion | `:76-79` | 0.15s / 0.6s / 0.45s + 一条 ease-out |
| color/surface | `:81-127` | border / accent / hover / zebra / tint 三档 / mono 字体 / surface / shadow |

深浅色覆写只有一处：`body[data-ds-dark-theme] .block, .panel`（`:24-36`），改 4 个变量（surface / shadow / tint 18% / tint-quiet 12%）。全文 `data-ds-dark-theme` 只出现 **2 次**、`prefers-color-scheme` **0 次** → 深浅色完全靠 token 别名，插件自己不做第二套配色。这一点是**做对了**的。

### 2.3 命名约定与分段地图

- 前缀 `dsl-g-*`（dsh-genui 局部 token），类名为简短语义块（`.card` `.statValue` `.tdDelta`…），无 BEM。
- 文件内用 `/* ---------- 段名 ---------- */` 分段，共 30+ 段。主要段（行号）：

| 段 | 行 | 段 | 行 |
|---|---|---|---|
| token / 深色 | 24-128 | hero（封面） | 432-492 |
| layout primitives | 159-260 | inline 标记 | 494-517 |
| text | 261-295 | badge/stat/progress | 519-650 |
| controls | 296-403 | list/table/chart/tabs/avatar | 651-1002 |
| media | 404-431 | callout / steps / keyvalue | 1003-1110 |
| chart 变体（环形/水平条） | 1112-1370 | 表格单元格类型 | 1411-1463 |
| 表单（radio/switch/textarea/submit/slider） | 1464-1586 | accordion / copy | 1586-1673 |
| mermaid / scene3d / echart | 1674-1744 | timeline / file-tree / breadcrumb | 1744-1863 |
| 骨架屏 / 入场动画 | 1864-1940 | 滚动条 / a11y | 1941-1980 |
| quiz | 1980-2097 | 工具卡 / 面板 dock | 2096-2210 |
| 模板中心 / 成就弹层 | 2205-2378 | icon | 2379-2430 |

**判断**：token 段是集中的，但**装饰性规则不集中**——每个段自己决定边框、阴影、大写、渐变。这就是「同一屏里卡片长得都不太一样」的直接原因。

### 2.4 构建与注入方式（决定换皮手法）

- `lib/client.js`（791KB）里 CSS 被**压缩内联**，类名带 hash 前缀：`.V1MMBW_block{--dsl-g-radius-surface:12px;…}`（`grep -o "dsl-g-radius-surface" lib/client.js`）。
- `package.json` 的 `files` 里**包含 `src`**，且 `dsh.bundle.patch` 指向 `cordis.patch.yml`；构建产物由 `tsdown.config.ts` 生成。

推论（对 fork 很关键）：
1. **改 CSS 必须重新构建**才能生效（或另注入覆盖样式表）。
2. 外部覆盖样式必须先打败 hash 类的特异性，而 token 是声明在 `.block`（hash 类）上的 —— 在容器 `.genui-dom-fence` 上设 `--dsl-g-*` **无效**，因为 `.block` 自己又声明了一遍（更近的声明优先）。

### 2.5 原语映射（`src/client/primitive-adapter.ts`）

全文只有 2 行：

```ts
export { CodeBlock, DiffBlock, JsonTree, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
```

即：**只借了宿主的 4 个东西**（代码块、diff、JSON 树、剪贴板）。表格、按钮、输入框、下拉、开关、单选、标签、提示框、滚动条**全部自己实现**。

- 优点：宿主没有第二套按钮/表格可复用（`@deepseek-ai/dsh-client-ui-primitives` 在 profile 的 `node_modules` 里并不单独安装，是宿主 bundle 提供的运行时 peer），自研无可厚非。
- 代价：**交互控件的视觉语言与宿主不一致**。宿主有 `--dsw-alias-button-primary-fill` / `-primary-hover` / `--dsw-alias-interactive-bg-hover` 这一整套控件语义 token（asar 提取，共 107 个 alias），插件一个都没用，全部用 `color-mix` 自己算 tint。

### 2.6 `PlotBlock.module.css` 是 token 的第二份副本，且值已漂移

`PlotBlock.module.css:5-31` 又声明了一遍 `--dsl-g-*`，注释说「plot 也可独立挂载所以自带一份」。但值跟主文件不一致：

| token | GenuiBlock.module.css | PlotBlock.module.css |
|---|---|---|
| `--dsl-g-font-title` | 13.5px (`:64`) | **13px** (`:9`) |
| `--dsl-g-font-meta` | 12.5px (`:65`) | **12px** (`:10`) |
| `--dsl-g-font-data` | 12px (`:66`) | **11px** (`:11`) |
| `--dsl-g-tint` | 12%（深色 18%）(`:101`,`:34`) | **8%** (`:20`) |

**用户可见后果**：同一个回复里，函数图（plot）的标题、图例、刻度比其它组件小半号到一号，tint 也淡一档 → 「这两个块不是一个产品里的」。另外 `PlotBlock.module.css:113,121` 直接写死 `12.5px`，绕过了 token。

### 2.7 硬编码 vs 主题变量（一句话回答任务里的关键判断）

| 维度 | 来源 | 实际变量名 | 硬编码举例（fallback 或字面值） |
|---|---|---|---|
| 正文/次要/三级文字 | **主题变量** | `--dsw-alias-label-primary/secondary/tertiary/caption` | `#5b6378`（`:374` placeholder fallback） |
| 边框 | **主题变量** | `--dsw-alias-border-l1/l2` | `rgba(255,255,255,.12)`（`:81-82`） |
| 表面/抬升 | **主题变量** | `--dsw-alias-bg-layer-1/2/3`、`--dsw-alias-bg-base` | `#fff`（`:122`）、`#1c1c1e`（`:889`）、`#17171a`（`:1998`） |
| 状态色（成功/警告/错误/业务） | **主题变量** | `--dsw-alias-state-{success,warn,error,business}-primary/secondary` | `#3ecf8e` / `#f5b83d` / `#ff6b6b` / `#4f8ef7`（全文件 30+ 处 fallback） |
| 图表分类色 | **主题变量**（选错槽位） | `--dsw-static-deepseek/green/amber/red/blue/neutral-bluish-*` | `charts.tsx:25-34` |
| 字号 | **插件自建 token** | `--dsl-g-font-*`（`:56-66`） | `11px`×3、`10px`、`18px`（绕过 token） |
| 间距 | **插件自建 token** | `--dsl-g-gap-*`（`:68-72`） | `9/10/14/15/22px` 等 30 处非 4 倍数 |
| 圆角 | **插件自建 token** | `--dsl-g-radius-*`（`:45-48`） | `14/10/6/5/4/3/2px` 共 7 种字面值 |
| 阴影 | **插件自建 token** | `--dsl-g-shadow-card`（`:28`、`:127`） | `rgba(0,0,0,.3)`（`:890`）、`rgba(0,0,0,.4)`（`:909`） |
| 字重 | **无 token** | — | `650/680/750` 等字面值（V1） |
| 动效 | **插件自建 token** | `--dsl-g-dur-*` / `--dsl-g-ease-out`（`:76-79`） | — |

结论：**颜色层是「主题变量 + 深色 fallback」，几何与排版层是插件完全自建**。宿主没有间距/圆角/字号 token 可继承（§5.1），所以这部分自建是必然的；问题在于自建之后**没有守住自己的栅格**（V3–V5）。

---

## 3. 视觉问题清单（15 条，均可证伪）

> 每条：现象 → 证据（文件:行号）→ 用户会看到什么。
> 严重度：★★★ 直接决定「廉价感」，★★ 明显不统一，★ 细节。

### V1 字重体系崩了：69 处声明里 67 处 ≥600 ★★★

- 证据：`GenuiBlock.module.css` 内 `font-weight` 统计 —— `600`×32、`700`×17、`650`×13、`800`×3（`:151,266,288`）、`750`×1（`:483`）、`680`×1（`:506`）、`500`×1（`:526` badge）、`400`×1（`:2075` quizFeedback）。
- 对比宿主：宿主自己的标签用 `font-weight:500`、正文 400（asar 内 `.vdszpW_title{font-size:13px;font-weight:500;line-height:20px}`）。
- 后果：整块文字几乎全是 semibold/bold，**标题和正文只差字号不差字重**，长回复读起来是一整片「加粗感」；而且 650/680/750 在非可变字体上会被吸附到 700，本意丢失。
- 附带：`.banner` 用 800（`:151`）、`.text.display`/`.text.h1` 也用 800（`:288,266`）。

### V2 字号不是整数，和宿主的 13/14px 对不上 ★★★

- 证据：`--dsl-g-font-body: 14.5px`、`--dsl-g-font-title: 13.5px`、`--dsl-g-font-meta: 12.5px`（`:63-65`）。
- 对比宿主：宿主的字号是整数并配固定行高（asar 中大量 `font-size:13px;line-height:20px`、`font-size:14px;line-height:22px`）。
- 后果：在 1x/1.25x DPR 屏幕上 14.5px 会落在半像素上，笔画发虚；与正文 14px 并列时基线/字面高不一致，同一行里「大小看着差不多但就是对不齐」。

### V3 行高各自为政：15 种取值 ★★

- 证据：`line-height` 统计 —— `1.5`×26、`1.6`×5、`1.55`×4、`1`×4、`1.45`×3、`1.4`×3、`1.3`×3、`1.65`×2、`1.25`×2、`1.02/1.05/1.2×6/1.7/18px/0` 各 1–6。
- 宿主用 px 行高（20/22/24px）保证网格对齐；插件全用无单位倍数且值不统一。
- 后果：卡片标题、列表项、表格单元格、图例的行高各不相同，一屏里**文字基线密度不均匀**，眼睛找不到节奏。

### V4 间距破了 4px 栅格：30 处奇数值 ★★

- 证据：`padding/margin/gap` 的字面值里，非 4 倍数出现 **30 次**：`1px`×6、`3px`×7、`5px`×2、`7px`×5、`9px`×5、`15px`×5（如 `.li` `padding: 9px 4px 9px 16px`（`:656`）、`.stat` `padding: 14px 16px 15px`（`:563`）、`.hero` `padding: 22px 24px 24px`（`:441`）、`.panelToggle` `padding: 9px 14px`（`:2163`））。
- 后果：相邻组件的上下留白差 1–2px，视觉上「肉眼看不出但感觉不齐」；配合 V3 让整块看起来像手工拼的。

### V5 圆角混用：声明的 3 档 + 7 种字面值 ★★

- 证据：token 只说 12/8/999（`:45-48`），实际还有 `border-radius: 14px`（hero，`:442`）、`10px`（icon 底板，`:2390`）、`6px`×4（`.badge` 之外的 pill 例外在 `:529`）、`4px`×6、`5px`、`3px`×3（`.legendSwatch`，`:875`）、`2px`（漂移填充，`:952` 一带）。
- 后果：卡片 12、hero 14、外框 8、内部小件 3/4/5/10 —— 同屏出现 5–6 种圆角，圆角失去「组件身份」的语义。

### V6 每个表面都是「边框 + 阴影」，深度语言重复 ★★★

- 证据：`box-shadow` 20 处；`.card` 同时有 `1px border` + 双层 shadow（`:212-226`；`--dsl-g-shadow-card` 定义在 `:127`：`0 1px 3px rgba(0,0,0,.10), 0 8px 24px rgba(0,0,0,.06)`）；`.stat` 与 `.hero` 复用同一套（`:557-570`、`:436-452`）。
- 后果：`card` 里套 `stat`、`stat` 里再套 `grid` 时，一个回复里会出现 **3 层带边框+阴影的盒子**，每个都在说「我是最重要的」。

### V7 表格是 Excel 味，不是聊天正文味 ★★★

- 证据：`.tableWrap` 外框 `1px border` + 圆角（`:679-688`）、`.table th` `uppercase`（`:697`）+ `letter-spacing:.06em`（`:696`）+ `font-weight:700`（`:695`）+ 12.5px（`:694`）+ 斑马底（`:699`）、`tbody tr:nth-child(even)` 第二层斑马（`:712`）、每行 `border-bottom`（`:703`）、第一列再加 600 字重（`:710`）。
- 后果：`大写表头 + 斑马 + 行线 + 外框` 四层信息同时存在，一张 4 行表看起来比正文重一倍；截图发出去像 BI 报表附件。

### V8 列表变成了「带点 + 分隔线」的伪表格 ★★

- 证据：`.li` 左侧蓝点 `::before`（`:663-671`）+ `.li + .li { border-top: 1px solid }`（`:674`）。
- 后果：3 条以上的 list 会出现横线，视觉上更像表格而非项目符号，**列表和表格两种组件的边界消失**。

### V9 hero 卡是「AI 生成模板」的典型配方 ★★★

- 证据：`.hero` 同时叠 **radial-gradient + linear-gradient + layer**（`:443-447`），四角有 18–22% 的品牌色晕染；`heroLabel` 大写 + `letter-spacing:.1em`（`:469-475`）；`heroValue` 用**等宽字体** 52px + `letter-spacing:-.028em`（`:483`）。
- 后果：这是 2023 年以来「AI 仪表盘」最常见的三件套（彩色渐变 + 大写小标签 + 等宽大数字）。放在 DSH 这种克制的白底/黑底聊天流里，hero 是**唯一一块有彩色的东西**，抢眼且廉价。

### V10 进度条有「糖果高光」，按钮有内嵌高光 ★★

- 证据：`.fill` 渐变 `color-mix(accent 85%, white) → accent`（`:643-648`），`.barFill` 同款（`:952`），`.button.primary` 的 `box-shadow: inset 0 1px 0 rgba(255,255,255,.14)`（`:339`）。
- 后果：拟物化残留。在扁平宿主 UI 里，这样的进度条顶部一条白边会读成「渲染错误」。

### V11 图表：色板语义冲突 + 尺寸写死 ★★★

- 证据一：分类色用的是 `--dsw-static-deepseek-400 #7aaaff` / `green-400 #4ed17e` / `amber-400 #f7ad31` / `red-400 #f25a5a` / `blue-450` / `deepseek-450` / `neutral-bluish-400` / `deepseek-300`（`blocks/charts.tsx:25-34`）。**前三色恰好是宿主的成功/警告/错误色**，而 8 个槽位里有 5 个是蓝。
- 证据二：绘图区高度写死 `height: 160px`（`:846`），Y 轴槽 42px（`:831`），轴标签用等宽字体（`:832-839`）。
- 证据三：ECharts 的 grid 也写死 `grid:{left:48,right:16,top:24,bottom:32}`（`EChartNode.tsx:112`）。
- 后果：4 个系列的单图会被读成「有 3 个出问题了」（绿/黄/红）；宽卡片里图表永远 160px 高 → 扁平分外空旷；2 个系列时第 5 个蓝和第 1 个蓝几乎分不出（#4d93f8 vs #7aaaff）。

### V12 所有卡片同一副面孔，五种语义（成功/警告/危险/信息）只靠底色 ★★

- 证据：`.card` 与 `.cardSuccess/Warning/Danger/Info`（`:212-226`、`:1363-1369`）、`.badge`（`:521-536`）、`.callout`（`:1013-1026`）、`.quizOpt*`（`:1993-2045`）——四套组件、四组类似但不相同的 tint 与边框百分比（badge 30%、callout 无边框、quiz 30–40%、card 无边框只染底）。
- 后果：同一个「成功」在标签/提示块/卡片/答题四处颜色深浅不同，用户学不到「成功 = 什么样子」。

### V13 图标体系是第三方的，尺寸档位与文字不匹配 ★★

- 证据：图标来自 **OpenAI Apps SDK UI**（`icons/icon-data.ts:1-5`，749 个字形），尺寸只能取 16/20/24/32（`blocks/icon.tsx:26-39`），**默认 20px**（`:35`）；带底板时外框 = 图标 + 14px、圆角 10px（`:79`、`:2389-2393`）。
- 对比：它旁边的小标签是 12.5px、正文 14.5px。
- 后果：20px 图标摆在 12.5px 文字旁会显得**大一号**；带底板的图标是 34px 色块，在 12px 行距里会把整行撑高。另外字形来自 OpenAI 的图标语言（填充/圆角风格），与 DSH 自身图标不同源，同一屏里两种笔画风格。

### V14 入场动画在流式期间制造「迟到感」 ★★

- 证据：`GenuiBlock.tsx:204` `animationDelay: Math.min(i*90, 720)ms`；`.reveal` 用 `0.45s` + `backwards`（`:1922-1924`）。
- 后果：流式渲染时每闭合一个组件就挂一块新 DOM，第 8 个及以后的组件**固定等 720ms 才开始淡入**，加上 450ms 动画 = 数据已经到了但 UI 要 1.17s 后才出现。用户感知是「卡」。

### V15 面板 dock 与内联卡片不是同一套「表面语言」 ★

- 证据：`.panel` 用 `1px` 品牌色 35% 边框（`:2140`）+ `border-radius:12px` + `bg-layer-1`（`:2129-2146`）；内联 `.card` 用 `--dsl-g-surface`(=layer-2) + `--dsl-g-shadow-card`（`:212-226`）。
- 后果：同一个产品里，面板是「描边卡」、内联组件是「阴影卡」，两种抬升方式并存；面板还额外有一个 `panelBadge` 和强调边框（`:2129-2132` 注释自称「为了可识别」）。

### 补充：两个 token 名在宿主不存在（不是审美问题，是错）

| 引用 | 位置 | 宿主实际 |
|---|---|---|
| `--dsw-alias-markdown-hr` | `GenuiBlock.module.css:183,202` | **不存在**（宿主 107 个 alias 里没有），永远走 fallback `--dsl-g-border` |
| `--dsw-alias-fill-hover` | `TemplateDrawer.module.css:41`（fallback `rgba(255,255,255,.06)`） | **不存在**（只在插件自己的 `artifact/standalone-theme.ts:23,71` 里定义，即导出沙箱） |

`--dsw-alias-fill-hover` 这条**在浅色主题下是真 bug**：白色 6% 洗在白底上完全不可见，模板抽屉项的 hover 没有反馈。

---

## 4. 改造面分档

### 4.1 分档表

判据：A = 只动 CSS；B = 要改 TSX 结构/内联几何或读取逻辑；C = 必须换实现（引擎/图标集/字体）。

| 组件/能力 | 档 | 依据（文件:行号） |
|---|---|---|
| text / badge / hero / stat / progress | **A** | 尺寸/字重/大写/渐变全在 CSS（`:261-650`） |
| card / row / col / grid 表面 | **A** | 类名为驱动（`:159-260`、`:212-226`）；仅 `gap` 内联（`GenuiBlock.tsx:194`、`render-node.tsx:223,233`） |
| button / input / select / checkbox / switch / radio / textarea / slider | **A** | 全在 `:296-403`、`:1464-1586` |
| list / table / steps / keyvalue / callout / divider / tabs / accordion / timeline / breadcrumb / file-tree | **A** | `:651-1463`、`:1586-1863` |
| quiz / submit / 判卷面板 | **A** | `:1980-2097` |
| panel dock / tool 卡 / 骨架屏 | **A** | `:2096-2210`、`:1864-1900` |
| icon 尺寸档位 | **B** | 尺寸由 `icon.tsx:26-39,79` 决定并以 `width/height` 内联进 SVG；CSS 改不动字形大小 |
| 手写 chart（bar/line/donut/hbar） | **B**（结构） | 几何用内联 style（`charts.tsx` 20 处：`:219,605,607,697,712,751,759,763,775,797,816,820,919,931,...`）+ 固定 160px（CSS `:846`）。改配色/配字 `A`；改布局/轴/交互 `B` |
| echart | **B** | option 由 TS 生成（`EChartNode.tsx:85-200`），CSS 只能改容器 |
| plot | **B** | token 副本在 `PlotBlock.module.css`（`A` 可修），但表达式/坐标/滑块逻辑在 `PlotBlock.tsx` |
| diagram | **B** | 调色板在 `blocks/diagram/theme.ts:27-50`（TS 常量），非 CSS |
| mermaid | **B/C** | 主题色经 `mermaid-colors.ts` 读宿主变量后注入 mermaid 配置；字体/布局受 mermaid 自身限制 → 深度改造需换渲染器 |
| 图标体系（与宿主同源） | **C** | 换图标集（`icons/*`，749 字形）＝换数据源与尺寸体系 |
| 字体（若要统一到宿主 13/14px 体系） | **A**（改 token 即可，因为字体族继承宿主） | `:104` mono 已用 `--ds-font-family-code`（宿主存在该 token） |
| 图表引擎统一（三套并存：手写 / ECharts / plot） | **C** | `charts.tsx` + `EChartNode.tsx` + `PlotBlock.tsx` 三套独立实现 |
| Mermaid / Three / ECharts 懒加载资产 | **C** | `asset-*.ts` + `lib/assets/*.js`，换引擎要换资产 |
| 入口注册（toolview/dock/斜杠命令） | 不需要动 | `index.tsx:118-188` 与视觉无关 |

### 4.2 关键判断：只覆写 token 段够不够？

**不够。** 三个理由，都可验证：

1. **覆盖范围只有 4 类**。token 段（`:38-128`）只定义 `radius / type / spacing / motion / color`。而 V1（字重）、V7（表头大写+斑马+行线）、V9（渐变+大写标签）、V10（高光）、V6（边框+阴影并存）这些都是**具体规则里的字面量或属性组合**，token 段里没有对应变量可改。
2. **外部覆写 token 会被 hash 类挡住**。token 声明在 `.block`/`.panel` 上（`:38-39`），构建后是 `.V1MMBW_block`。在容器 `.genui-dom-fence` 或 `body` 上重设 `--dsl-g-*` **不生效**（更近的声明赢）；必须以同特异性且更晚的顺序命中 `[data-genui]` / `[data-genui-panel]`（这两个是稳定属性，`GenuiBlock.tsx:192`、`panel.tsx:189`）。
3. **token 段本身不统一**：`PlotBlock.module.css:5-31` 是第二份副本且值已漂移（见 §2.6），只改主文件会留下一个「小一号的 plot」。

**但是**：改**整个 CSS 文件**（不只是 token 段）能解决绝大多数问题。估算依据是 A 档覆盖了 50 个 type 里的绝大多数展示型组件（V1–V10、V12、V14、V15 全部落在 CSS 规则里），剩下的 B 档集中在 **图表/图标/diagram** 三类图形组件，C 档是引擎级替换（可以先不做）。

建议路线（供 lead 决策）：

- **阶段 1（纯 CSS，覆盖 ~70–75%）**：重做 token 段（整数字号 + 4 档字重 + 4px 栅格）+ 去掉大写/斑马/渐变/高光 + 统一「只有一个表面语言」+ 收敛圆角到 3 档 + 图表配色改成「单一蓝阶 + 灰阶」（只改 `charts.tsx:25-34` 就够了，是 8 行常量）。
- **阶段 2（少量 TSX，覆盖到 ~90%）**：`charts.tsx` 的固定 160px 与内联几何、`icon.tsx` 尺寸映射、`diagram/theme.ts` 调色板、`PlotBlock.module.css` 副本。
- **阶段 3（实现级，可选）**：图表引擎统一、图标集替换。**性价比最低，建议不做**。

---

## 5. 主题联动（DSH token 的真实用法）

### 5.1 宿主提供了什么

从 `app.asar` 提取到的 token 事实：

- `--dsw-alias-*`：**107 个**（颜色语义），含 `bg-layer-1/2/3`、`bg-base`、`border-l1..l4`、`label-primary/secondary/tertiary/caption/dimmed`、`state-*`（business/success/warn/error 各有 primary/secondary/tertiary）、`button-*`、`interactive-bg-hover`、`settings-card-fill/stroke`、`scrollbar-*`、`tooltip-bg`、`toast-bg`、`markdown-*`。
- `--ds-*`：**只有 5 个** —— `--ds-font-family-code`、`--ds-ease-in-out`、`--ds-transition-duration{,-fast,-slow}`。
- **没有**间距/圆角/字号 token。→ 「视觉尺度」必须由插件自己定义，宿主管不了。

### 5.2 关键发现：品牌色选错了 token

| 用途 | 插件用的 token | 宿主自己的映射链（asar 提取） |
|---|---|---|
| 主色/强调色 | `--dsw-alias-state-business-primary`（`:83`） | `--dsw-alias-brand-primary` → `--dsw-static-neutral-bluish-1000`（浅色，近黑）/ `bluish-50`（深色，近白）；`--dsw-alias-button-primary-fill` → `brand-primary` |

即 **宿主的主色是单色（浅色=近黑、深色=近白），蓝色是「状态/业务」专用色**。插件把状态蓝当成品牌色用在了：主按钮、链接、焦点环、数据集、进度条、tab 下划线（`:83` 一处定义，全链路引用）。

**用户可见后果**：DSH 里「主操作按钮」是黑白高对比，而 GenUI 块里的按钮是蓝色实心 —— 同一个会话出现两种「主按钮」语言；且蓝色在浅色主题下与宿主的 `--dsw-alias-link`（deepseek-500）又不完全同色。

### 5.3 深浅色怎么生效

- 唯一开关：`body[data-ds-dark-theme]`（`:24-36`）。宿主用同名属性（asar 中确认存在 `data-ds-dark-theme`、`data-ds-theme-source`），**属性名对得上**。
- 深色下只改 4 个变量（surface / shadow / tint 18% / tint-quiet 12%），其余靠 `--dsw-alias-*` 自动翻转。这是正确做法，改造成本低。
- 风险点：**字面量 fallback 偏深色**。例如 `--dsl-g-border` 的 fallback 是 `rgba(255,255,255,.12)`（`:81-82`）、图表 tooltip 底 `#1c1c1e`（`:889`）、错误文字 `#ffb3b3`（`:344`、`:1518`）。一旦宿主版本改名导致 token 取不到，浅色主题会**整块变深色**。最危险的一处是 quiz 选项 `var(--dsw-alias-bg-base, #17171a)`（`:1998`，同类还有 `:1527`、`:1682`、`:1738`）：宿主确实有这个 token，所以现在不出事，但这是全文件少数「深色 fallback 写在浅色块上」的位置。
- 皮肤插件：profile 的 `cordis.patch.yml:111-115` 声明了 `dsh-deepseek-style-theme`（`mode: always-blue`、`glassStyle: liquid`），但在本机 profile 的 `node_modules` 与 app.asar 中**都找不到该包**（`grep always-blue` = 0 命中）。→ 当前渲染结果里**皮肤没有生效**；如果以后装上，它会改写 `--dsw-alias-*`，而插件所有表面/悬停/边框都派生自这些别名，理论上会跟着变（这是插件 token 化的红利），但 V9/V10 那些**硬编码渐变与 #fff 文字**不会跟着变，会立刻暴露。

### 5.4 插件实际用了几个宿主 token

`grep -- "--dsw-"` 统计：**24 个 alias + 30 个 static**。未使用但明显更合适的：

| 场景 | 现在自己造 | 宿主已有 |
|---|---|---|
| 控件悬停 | `color-mix(label-primary 4%)`（`:87`） | `--dsw-alias-interactive-bg-hover`（浅 `#2631480f` / 深 `#ffffff14`） |
| 主按钮 | `state-business-primary`（`:83`） | `--dsw-alias-button-primary-fill` / `-hover` |
| 卡片表面 | `bg-layer-2` + 自算阴影（`:121-127`） | `--dsw-alias-settings-card-fill` / `-stroke` |
| 滚动条 | 手写 8px webkit（`:1945-1960`） | `--dsw-alias-scrollbar-bg-l1/l2`、`-hover-*` |
| 内联码底色 | `--dsl-g-surface`（`:494-500`） | `--dsw-alias-markdown-inline-code` |
| 链接色 | `--dsl-g-accent`（`:508`） | `--dsw-alias-link` |
| 骨架屏 | 自造 shimmer（`:1870-1900`） | `--dsw-alias-bg-skeleton` |

---

## 6. 换皮接缝（给 fork 的落点）

按可靠性排序：

1. **首选：fork 源码 + 重建**。CSS 在 `lib/client.js` 里是内联压缩的，任何外部覆盖都要对抗 hash 类；直接改 `src/client/GenuiBlock.module.css` + `PlotBlock.module.css` 再 `tsdown` 构建最干净（`package.json` 的 `files` 已包含 `src`，`tsdown.config.ts` 可用）。
2. **稳定 DOM 钩子**（若走运行时注入覆盖）：
   - `.genui-dom-fence`（`dom-fence.tsx:114`）——fence 容器，未 hash，可做布局级覆盖；
   - `[data-genui]`（`GenuiBlock.tsx:192`）——块根，与 `.block` 同特异性，**后注入的样式表可覆盖 token**；
   - `[data-genui-panel]`（`panel.tsx:189`）、`[data-genui-tool]`（`toolview.tsx:60`）——面板与工具卡根。
3. **`--dsl-g-*` 变量名可保留**：改名会让所有规则失联；换皮时保持变量名、只换值，改动面最小。
4. **别指望的接缝**：`fence-registry`（宿主已移除）、`@deepseek-ai/dsh-client-ui-primitives`（本机未安装，是宿主运行时 peer，只能 import 那 4 个导出）、宿主的间距/字号 token（不存在）。

---

## 7. 未覆盖 / 风险

- **没有运行截图**：本文所有「用户会看到」均为静态推导。V9（hero 观感）、V11（图表颜色）、V15（面板 vs 卡片）建议 fork 后做一次截图对照再定稿。
- **皮肤插件状态未确认**：`dsh-deepseek-style-theme` 在 patch 里启用但包不可解析；如果运行时通过其他机制装载，§5.3 的「皮肤未生效」结论需要修正。
- **未读的部分**：`scene3d`（three.js）、`mermaid` 内部主题、`artifact/` 导出链路（导出 HTML 自带 `standalone-theme.ts` 一套独立变量，与运行时无联动）、`TemplateDrawer` 完整样式。这三块约占剩余视觉代码的 15%，对「聊天内好不好看」影响小。
- **`AchievementToast`/成就弹层**（`:2264-2378`）是彩蛋性质 UI，未纳入问题清单。
