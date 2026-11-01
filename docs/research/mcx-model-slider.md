# MCX（MineCodex）model-slider 交互与实现规格

> 调研对象：`~/Project/harnessTools/MineCodex/features/model-slider/`（只读，未修改任何文件）。
> 目标读者：在 DSH（DeepSeek Harness）插件里复刻这套模型选择器的实现者。读完后不需要再打开 MCX 源码。
> 证据写法：`文件:行号`。文件名简写见文末「证据索引」。
> 标记约定：**［必须］** = 复刻不可省略的行为；**［可降级］** = 依赖 Codex 私有 DOM/架构、DSH 平台做不到或成本过高时可以替换，并给出降级方案。

---

## 0. 一句话总览

点击 composer 的模型 chip 后，第一个弹出的是**思考强度（effort）滑条面板**——上面一行 effort 标签、下面一行模型名 + chevron，右侧 Fast 闪电按钮，下面是一条档位滑轨；**不是**模型列表。点击「模型名那一行」才进入模型列表：列表覆盖在原面板上、底边锚定、往上生长、顶部 sticky 搜索框、264px 宽、最多 6 行可见。从列表返回是 320ms 的高度回缩 + 内容下移 10px 淡出（`install.mjs:1016-1043`）。设计意图见 `DESIGN.md:20-34`、`PRODUCT.md:5-8`。

---

## 1. 交互流程

### 1.1 进入：第一个面板是 Slider

1. composer 上的 chip 是原生节点 `[data-codex-intelligence-trigger]`，由 adapter 收集可见触发器（`controller.mjs:4-12`）。主对话与 side chat 各有一个（`DESIGN.md:22`、`install.mjs:2239-2246`）。
2. 用户点击 chip → Codex 原生打开一个 `[role="menu"][data-state="open"]`，其中含 `[data-reasoning-slider]`（`install.mjs:422-429` 用这两个特征定位原生 picker 主菜单）。
3. MCX 找到该菜单后，**不新建弹层**，而是把原生菜单内容（`parentMenu.firstElementChild`）压成不可见层：`position:absolute; inset:0; opacity:0; pointer-events:none; aria-hidden=true; inert=true`（`install.mjs:2103-2108`），然后追加自己的 shell（`install.mjs:2080-2113`）。原生菜单节点保留，用于宽度测量与原生关闭行为。
4. 因此用户看到的第一个面板 = MCX Slider 面板 `[data-codex-model-slider-generic]`（`install.mjs:1724-1730`）。这一步是**同步替换**，没有「先原生再增强」的闪烁；唯一的等待窗口见 1.5 的 template-wait。

### 1.2 Slider 面板头部结构（自上而下）

```
┌──────────────────────────────────────────────┐
│                 （上行）Effort 标签           │  ← 居中的中列，左右各留 calc(--mcx-spacing*4)
│              模型名  ▾（chevron）            │  ← 下行居中；chevron 来自原生克隆
│                                    ⚡（Fast） │  ← 右侧独立按钮，仅模型真正支持 Fast 时出现
│  ●────────●────────●────────●────── 滑轨      │
└──────────────────────────────────────────────┘
```

- 头部容器是原生 `ViewControls`（`install.mjs:1806-1810`，注释写明「上方档位，下方模型，两侧放置能力控件」）。
- 「模型名 + effort + chevron」被包成一个 `role="button"` 的 `ViewToggle`，`tabindex=0`、`aria-haspopup="menu"`、`aria-expanded="false"`（`install.mjs:1739-1746`）。**整个 toggle 区域（含 effort 文字）都可点击进入模型列表**（`install.mjs:1798-1804`）。
- 两行是独立布局：外层 `flex column; gap:0`（`install.mjs:1750-1752`），保证长模型名不会把 effort 与箭头撑开；注释见 `install.mjs:1748-1749`。
- effort 行是 grid：`calc(var(--mcx-spacing) * 4) auto calc(var(--mcx-spacing) * 4)`，标签落在中列 `gridColumn=2`（`install.mjs:1753-1757`、`1771-1781`）。`--mcx-spacing` = 4px（`packages/ui/src/native/mcp-theme.css:2`），即左右各 16px 槽位。
- effort 标签带 `data-accent="true"`；当档位是 `ultra` 时额外带 `data-maximum="true"`（`install.mjs:1778-1780`）。
- chevron 从原生 `[data-model-picker-view-toggle] svg`（旧结构回退到原生行 svg）克隆，`aria-hidden`、不收缩（`install.mjs:1782-1794`）。
- Fast 按钮：仅当控制器 `serviceTierOptions` 里存在 `value === "priority"` 且 `onSelectServiceTier` 是函数时创建（`install.mjs:1735-1738`、`1817-1845`）。无 Fast 时按钮不渲染，头部自然居中（`DESIGN.md:24`）。
- 若原生存在 `_ResetToDefault_`（重置为默认），克隆一份放在能力控件区（`install.mjs:1847-1865`）。
- 档位数 < 2 时只渲染头部，不渲染滑轨（`install.mjs:1867-1870`）。

### 1.3 进入模型列表

- 点击模型名 toggle → `openControllerModelMenu(parentMenu, modelButton, selector)`（`install.mjs:1130`）。
- 列表是**新造的 div**：`role="menu"`、`data-state="open"`、`data-codex-model-slider-menu`、`data-codex-model-slider-controller-menu`，`className` 直接复制原生菜单的 class 串（`install.mjs:1143-1152`），材质走共享 Dropdown 的 `opaque` 分支（`install.mjs:1149`）。
- 列表挂在**原生 picker 主菜单内部**：先把主菜单改成 `position:relative; overflow:visible`，再 `append`（`install.mjs:1299-1305`）。这是「底边锚定」的物理基础（见 §3.2）。
- 打开瞬间做的事，按顺序：
  1. 记录 `sliderHeight` = 主菜单当前计算高度（`install.mjs:1301`）；
  2. 挂载列表、测高 `sizeModelMenuViewport`（`install.mjs:1306`）；
  3. `modelButton.aria-expanded = "true"`（`install.mjs:1307`）；
  4. `search.focus({preventScroll:true})`（`install.mjs:1308`）；
  5. 记录 `listHeight`（`install.mjs:1310`）；
  6. 准备「滚动定位」控制器（`install.mjs:1311`）；
  7. 播放入场动画（`install.mjs:1312-1319`）。
- 打开期间 chip 文案就地改成 `Select model` / `选择模型`（`install.mjs:1282-1291`）。实现细节：只改**同一个文本节点的 nodeValue**，不能 `textContent` 整体替换，否则 React 卸载时会因找不到旧文本节点而报错（`install.mjs:1286-1289`）。

### 1.4 层级退出顺序（三层）

| 当前层级 | 触发 | 结果 | 证据 |
|---|---|---|---|
| 模型列表 | `Escape` | 只关闭列表 → 回到 Slider；焦点回到模型名 toggle；**不会**连带关闭整个 picker | `install.mjs:2334-2342`（window capture，`preventDefault` + `stopImmediatePropagation`）；搜索框内另有一份 `install.mjs:1223-1226`；列表自身 `install.mjs:1266-1273` |
| 模型列表 | 点击列表外部且不在模型名按钮上 | MCX 只关闭列表；但若点击位置也在原生 picker 之外，原生 dismiss 会同时关闭整个 picker（DSH 版需自行决定：建议外部点击直接全关，避免两次点击） | `install.mjs:2343-2347` |
| 模型列表 | 选中某个模型 | 提交模型 + 推理强度 → 关闭列表 → 回到 Slider（新模型） | `install.mjs:1247-1265` |
| 模型列表 | 再次点击模型名按钮 | `openControllerModelMenu` 发现已有记录且未在关闭中 → 走关闭 | `install.mjs:1131-1137` |
| Slider 面板 | `Escape` | MCX 不拦截 → 原生关闭整个 picker | 无 MCX 监听（对照 `install.mjs:2336` 只处理列表） |
| Slider 面板 | 再次点击 chip | 原生 toggle 关闭 | 原生行为，MCX 未拦截触发器点击 |
| 处理中（effort 事务） | 点击外部 | 第一次点击被吞掉（防止 react 受控菜单提前关闭），事务结束后才生效 | `install.mjs:554-573` |

> 旧路径补充（原生子菜单兜底）：在**原生**模型子菜单里点某项时，MCX 不直接关闭整个 picker，而是 260ms 后「回到 Slider」（`install.mjs:653-660`、`802-805`、`840-845`），必要时重试 3 次（`install.mjs:614-651`）。DSH 版没有原生子菜单，此逻辑可整体丢弃。

### 1.5 「loading」窗口（template-wait）

原生 GPT 模型在私有模板（`[data-model-picker-power-slider] _TickRail_ > span`）尚未出现时，MCX 会隐藏主菜单（`visibility:hidden`）、打上 `data-codex-model-slider-template-wait` 计数，用 `requestAnimationFrame` 重试，最多 3 次，之后强制渲染 fallback 滑条（`install.mjs:2044-2056`、`2057-2059`）。DSH 版自绘滑条没有这个问题，可省略；**但「先量模板、量不到就降级」这个兜底思想建议保留**（避免面板空白）。

---

## 2. 状态机

### 2.1 状态清单

| 状态 id | 判据（DOM/内存） | 用户可见表现 | 证据 |
|---|---|---|---|
| `closed` | 无 `[data-codex-model-slider-generic]`；`modelSelectorControllerMenu === null` | composer chip 正常；picker 关闭 | `install.mjs:2227-2272` |
| `template-wait` | 主菜单有 `data-codex-model-slider-template-wait`，`visibility:hidden` | 短暂空白（≤3 帧） | `install.mjs:2044-2056` |
| `slider` | 有 shell，无 controller menu | 头部 + 滑轨 | `install.mjs:2080-2113`、`1706-1992` |
| `list-opening` | `modelSelectorControllerMenu` 存在且 `closing !== true`，`motionTimer` 未到期 | 列表从底部展开，内容 10px 上移淡入 | `install.mjs:1293-1319`、`1016-1043` |
| `list` | 入场动画完成（`motionTimer` 触发） | 列表可滚动、可搜索 | `install.mjs:1312-1319` |
| `searching` | 搜索框有值 | 行过滤 + 高度 320ms 变化 + 底边不动 | `install.mjs:1194-1215`、`669-722` |
| `revealing` | `prepareSelectedModelReveal` 的 rAF 未结束 | 列表自动滚到选中项中央（400ms） | `install.mjs:1045-1091` |
| `list-closing` | `record.closing = true`，`menu.inert = true` | 高度回缩 + 内容下移淡出 | `install.mjs:1093-1118` |
| `effort-transaction` | `<html data-codex-model-slider-selecting-effort>`；2s 定时器 | 原生 effort 子菜单被 `visibility:hidden` 抑制，用户无感 | `install.mjs:97-99`、`538-552` |
| `fast-transitioning` | shell 有 `data-codex-model-slider-fast-transitioning`（260ms） | Fast 开启动画期间不重建面板 | `install.mjs:1556-1565`、`2060-2064` |
| `unsupported-effort` | rail 带 `data-stale-reasoning-effort`，`aria-disabled` | 滑条不可拖，缺 `tabindex` | `install.mjs:1884-1894` |
| `drag-preview` | `dragging === true`，`pendingIndex` 变化 | 滑条与 effort 标签实时跟随，未提交 | `install.mjs:1920-1974` |
| chip 占位态 | 触发器带 `data-codex-model-slider-trigger-placeholder` | 文案 `Select model` / `Select effort`，宽度 160px | `install.mjs:2168-2170`、`2202-2203`、`91-93` |
| chip 真实态 | 触发器有 `-trigger-raw`，无 placeholder | 显示格式化模型名，宽度 HUG | `install.mjs:2190-2218`、`82-90` |

### 2.2 转换条件

- `closed → slider`：原生 picker 打开并命中 `nativeModelPickerMenu()`，且 `enhanceGenericModelPicker` 成功（`install.mjs:2247-2265`、`2012-2115`）。
- `slider → list-opening`：模型名 toggle 的 click / Enter / Space（`install.mjs:1798-1804`），且控制器提供 `models[]` 与 `onSelectModel`（`install.mjs:1138-1141`）。
- `list-opening → list`：`animateControllerModelMenu(record, true, onFinish)` 的 320ms 定时器到期 → `overflowY=auto`、重算可见高度、执行选中项滚动定位（`install.mjs:1312-1319`、`1042`）。
- `list → searching`：搜索框 `input` 事件（`install.mjs:1194`）。搜索**不关闭**列表，也不移动底边。
- `searching → revealing`：只在「打开周期的首次展开」结束调用（`install.mjs:1318`）；搜索、键盘、滚动都会取消自动定位（`install.mjs:1049-1056`、`test/model-reveal.test.mjs:46-57`）。
- `list|searching → list-closing`：Escape / 点外部 / 选中模型 / 再次点模型名（见 §1.4）；`closeControllerModelMenu` 幂等，`closing` 期间重复调用直接返回 true（`install.mjs:1096`）。
- `list-closing → slider`：320ms 动画结束后 `finish()` 恢复主菜单 `position/overflow`、移除列表、清空记录（`install.mjs:1107-1114`）。
- `slider → closed`：主菜单消失（原生关闭）→ `ensureModelSelector` 检测 `!parentMenu`，若挂在错误主菜单上的 controller menu 还活着则 `immediate` 关闭（`install.mjs:2248-2250`）。
- `* → closed`（卸载）：`dispose()`（`install.mjs:2274-2332`）即时关闭列表、清所有定时器/rAF/observer、还原被压扁的原生容器与文案。

### 2.3 面板在内存中的形态（便于实现者对齐）

```
modelSelectorControllerMenu = {
  menu, content, parentMenu, button,
  placeholderText,          // chip 原占位文案，关闭时还原
  position, overflow,       // 主菜单被临时改写前的值
  sliderHeight,             // 主菜单高度 = 关闭动画的终点高度
  listHeight,               // 列表高度 = 打开动画的终点高度
  animations: [],           // 当前 WAAPI 句柄，重播前全部 cancel
  motionTimer,              // 320ms 兜底清理（后台窗口可能不派发 animationend）
  closing,                  // 关闭中标记（幂等 + 防抖）
  reveal                    // 滚动定位控制器 {cancel, finishOpening}
}
```
证据：`install.mjs:1293-1302`、`1309-1311`、`1093-1118`、`1016-1043`。

---

## 3. 动效（最关键）

### 3.1 参数总表

| # | 场景 | 属性 | 起 → 止 | 时长 | 缓动 | 延迟 | 证据 |
|---|---|---|---|---|---|---|---|
| M1 | 打开列表：容器高度 | `height` | `sliderHeight` → `listHeight` | **320ms** | **`cubic-bezier(.19,1,.22,1)`** | 0 | `install.mjs:1028-1031` |
| M2 | 打开列表：内容 | `opacity` + `translate` | `0 / 0 10px` → `1 / 0 0` | **200ms** | **`cubic-bezier(.23,1,.32,1)`** | **40ms** | `install.mjs:1032-1035` |
| M3 | 关闭列表：容器高度 | `height` | 当前 → `sliderHeight` | **320ms** | `cubic-bezier(.19,1,.22,1)` | 0 | `install.mjs:1028-1031` |
| M4 | 关闭列表：内容 | `opacity` + `translate` | `1 / 0 0` → `0 / 0 10px` | **200ms** | `cubic-bezier(.23,1,.32,1)` | 0 | `install.mjs:1032-1035` |
| M5 | 关闭列表：整层 | `opacity` | 1 → 0 | **200ms** | `cubic-bezier(.23,1,.32,1)` | **40ms** | `install.mjs:1037-1040` |
| M6 | 搜索改高度 | `height` | 变化前 → 变化后 | **320ms** | `cubic-bezier(.19,1,.22,1)` | 0 | `install.mjs:1198-1208` |
| M7 | 选中项滚动定位 | `scrollTop` | 当前 → 居中目标 | **400ms** | **ease-out cubic**：`1-(1-p)^3` | 0 | `install.mjs:1079-1087` |
| M8 | 静态星点淡出 | `opacity` | 1 → 0 | **240ms** | `ease-out` | 0 | `install.mjs:1486-1489` |
| M9 | 流动粒子层淡入 | `opacity` | 0 → 1 | **240ms** | `ease-out` | 0 | `install.mjs:1531` |
| M10 | Fast 粒子流动 | `animation-duration` | — | **1.9s** | linear（原生 CSS） | 负延迟 `-((i+0.5)/14)*1.9s` | `install.mjs:1507-1515` |
| M11 | 星标按钮 hover 显隐 | `opacity` | 0 → 1 | 无过渡（瞬时） | — | — | `install.mjs:108-121`、`150-152` |

补充常量：
- 320ms 同时也是**兜底清理定时器**：`record.motionTimer = setTimeout(onFinish, 320)`，因为后台窗口未必派发动画完成事件（`install.mjs:1041-1042`）。
- 列表关闭时先 `overflowY = "hidden"`（`install.mjs:1027`），入场结束后改回 `auto`（`install.mjs:1316`）。
- 打开/关闭都用 `fill: "both"`（`install.mjs:1031`、`1035`、`1039`）。

### 3.2 底边锚定（bottom-anchored）高度动画怎么实现

三层配合，缺一不可：

1. **定位层**：列表是 `position:absolute; left:50%; bottom:0; transform:translateX(-50%); z-index:10; padding:6px`（`install.mjs:36-43`）。`bottom:0` 让列表底边永远贴住原视口位置，高度变化只能往上长。
2. **容器层**：主菜单被临时改成 `position:relative; overflow:visible`（`install.mjs:1303-1304`），否则 `absolute` 子元素会被裁剪、且 `overflow:hidden` 会截掉向上溢出的部分。
3. **动画层**：只对列表自身的 `height` 做 WAAPI 关键帧，从「Sliver 高度」到「列表高度」；同时 `overflowY:hidden` 防止内容在动画中被用户滚动（`install.mjs:1027`）。关闭动画的终点高度就是打开前记录的主菜单高度 `record.sliderHeight`（`install.mjs:1301`、`1029-1030`）。

高度怎么算（打开时）：`sizeModelMenuViewport`（`install.mjs:724-756`）
```
chrome        = paddingTop + paddingBottom + borderTopWidth + borderBottomWidth   // 728-733
resultsHeight = 第 6 个可见项的 offsetTop + offsetHeight - content.offsetTop        // 734-735
available     = (主菜单 bottom - 8) / currentCSSZoom                               // 736
height        = ceil(min(chrome + header.offsetHeight + resultsHeight, available))  // 737
```
即：**列表高度 = 搜索栏 + 最多 6 行 + 内边距，且不超过「窗口顶部到菜单底边 - 8px」**。
- `maxVisibleItems` 默认 6，来自 manifest（`codex-feature.json:18`），测试断言为 6（`test/manifest.test.mjs:16`）。
- 原生（非 MCX 自建）列表分支用 CSS 变量 `--codex-model-slider-menu-max-height` + `data-codex-model-slider-overflow`，按第 6 项底边计算（`install.mjs:741-756`、`61-64`）。

### 3.3 列表内容的进入/退出方向

- 进场：内容块从**下方 10px** 上移到位，同时 0→1 淡入（`install.mjs:1033`）。
- 退场：反向下移 10px 并淡出（`install.mjs:1034`），**关闭时内容无延迟**（`delay: opening ? 40 : 0`，`install.mjs:1035`）。
- 关闭时额外整层再做一次 1→0 淡出、延迟 40ms（`install.mjs:1037-1040`），让「快速消失」看起来是渐隐而不是切断。
- 内容块的锚点：`record.content` = `[data-codex-model-slider-results]`，`flexShrink=0`（`install.mjs:1164-1167`）。

### 3.4 滚动定位（400ms ease-out cubic）

规则（`install.mjs:1045-1091`，行为断言 `test/model-reveal.test.mjs:26-39`）：

1. 打开瞬间先 `menu.scrollTop = 0`（`1057`）——**先显示列表顶部**。
2. 入场动画结束后（320ms）下一帧再检查选中项（`1060-1063`，注释：先呈现顶部，再在下一帧检查）。
3. 可见内容区 = 从 **sticky 搜索栏底边** 到 **列表底边减 paddingBottom**（`1068-1069`）。搜索栏不算内容区。
4. 选中项已完整可见 → 不滚动，直接结束（`1071`）。测试断言 `test/model-reveal.test.mjs:41-44`。
5. 需要滚动 → 目标 = 让选中项居中，并 clamp 到 `[0, scrollHeight - clientHeight]`（`1072-1074`）；zoom 用 `1/currentCSSZoom` 归一（`1074`）。
6. 动画：400ms、`progress = min(1, elapsed/400)`、位置 = `from + (to-from) * (1-(1-progress)^3)`（`1079-1087`）。
7. **中断**：监听 `wheel / touchstart / pointerdown / keydown / input / click`（capture + passive + AbortController），任一发生立刻取消，且本打开周期不再自动定位（`1049-1056`、`1059-1062`）。测试覆盖全部 6 种事件 `test/model-reveal.test.mjs:46-57`。
8. 关闭/断开时取消：`closeControllerModelMenu` 调用 `record.reveal?.cancel()`（`1097`）；帧内检测 `menu.isConnected`（`1081`）。测试 `test/model-reveal.test.mjs:59-66`。

### 3.5 reduced-motion 分支

| 场景 | 正常 | `prefers-reduced-motion: reduce` | 证据 |
|---|---|---|---|
| 打开/关闭列表 | 320/200ms 动画 | **立即 onFinish，无动画** | `install.mjs:1022-1025` |
| 搜索改高度 | 320ms | 直接改，不播放 | `install.mjs:1206` |
| 选中项定位 | 400ms 滚动 | `menu.scrollTop = to`（瞬时） | `install.mjs:1075-1078`，测试 `model-reveal.test.mjs:59-61` |
| 星标按钮 | — | `transition:none` | `install.mjs:150-152` |
| Fast 粒子 | 14 个流动粒子 | 不创建粒子层，静态星点保留 | `install.mjs:1481-1483`、`1493`、`1696-1698` |
| shell 标记 | — | `data-reduced-motion="true"` 写在 shell 上 | `install.mjs:1731` |

### 3.6 定时器与动画的取消/清理规则（易漏，逐条照抄）

1. 播放新动画前：`clearTimeout(record.motionTimer)` + `record.animations?.forEach(a => a.cancel())` + `animations = []`（`install.mjs:1019-1021`；搜索路径同 `1199-1201`）。
2. `finish()` 里：清定时器、cancel 全部动画、恢复主菜单 `position/overflow`、移除节点、清引用（`install.mjs:1107-1114`）。
3. 关闭开始即 `menu.inert = true`（`install.mjs:1106`），防止动画期间仍可聚焦/点击。
4. 卸载 `dispose()`：即时关闭列表、清 `modelSelectorReturnTimer` / `modelSelectorEffortTransactionTimer`、disconnect 全部 observer、`cancelAnimationFrame` 全部待处理尺寸帧、移除注入样式（`install.mjs:2274-2332`）。
5. 一个菜单同一时刻只排一个尺寸 rAF（`modelSelectorMenuSizeFrames` Map，`install.mjs:679-687`、`715-721`）。
6. effort 事务有 2s 上限（`install.mjs:548-551`），原生子菜单选择观察有 1.5s 上限（`install.mjs:1411-1415`）——两者都是「不要永久等待别人」的兜底。

---

## 4. DOM / 结构 / CSS 技巧

### 4.1 两层容器结构（核心架构）

```
原生 picker 主菜单  [role=menu][data-state=open]（Codex 私有节点，保留）
├── 原生内容容器      ← 被压扁：absolute/inset:0/opacity:0/inert   （install.mjs:2103-2108）
└── MCX Slider shell [data-codex-model-slider-generic]
    └── ViewPanel
        ├── ViewControls  （模型名 toggle / Fast / Reset）
        └── SimpleView    （滑轨）
└── MCX 列表        [data-codex-model-slider-controller-menu]（打开时追加，绝对定位于主菜单底部）
    ├── header [data-codex-model-slider-search-header]  ← sticky
    └── content [data-codex-model-slider-results]
        ├── item × N（role=menuitem, tabindex=-1, id=mcx-model-result-{i}）
        └── empty [data-codex-model-slider-empty]（role=status, hidden）
```

- 为什么保留原生节点而不删：原生宽度测量、原生关闭/外点行为、React 卸载安全（`install.mjs:1286-1289` 注释）。
- 样式一次性注入到 `<head>`：`<style data-codex-model-slider-style>`（`install.mjs:32-34`、`2238`），卸载时移除（`2329`）。
- 列表 `className` 复制原生菜单 class（`install.mjs:1144`），item 的 class 串见 `install.mjs:1170`（`rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm … hover:bg-primary-ghost-hover flex flex-col`）。

### 4.2 关键 CSS（可直接照抄的结构）

列表尺寸与定位：
```css
[data-codex-model-slider-menu] { width: 264px !important; min-width: 264px; overflow-x: hidden; }
[data-codex-model-slider-controller-menu] {
  position: absolute !important; left: 50%; bottom: 0;
  transform: translateX(-50%) !important; z-index: 10; padding: 6px;
}
```
（`install.mjs:35`、`36-43`）

sticky 搜索栏 + 「补丁式遮挡」：
```css
[data-codex-model-slider-search-header] {
  position: sticky; top: 0; z-index: 1; flex-shrink: 0; padding: 2px 8px 8px;
  background: var(--mcx-color-surface-elevated-secondary);
}
/* sticky 保留菜单的 6px 内边距，补齐顶部遮挡而不改变布局高度。 */
[data-codex-model-slider-search-header]::before {
  content: ""; position: absolute; top: -6px; left: -6px; right: -6px; height: 6px;
  background: inherit; pointer-events: none;
}
```
（`install.mjs:44-52`）→ 技巧点：**用 `::before` 覆盖菜单 6px 顶部内边距，不占布局高度，所以不影响可视高度/筛选/底边锚定计算**（`DESIGN.md:30`）。

搜索输入：
```css
[data-codex-model-slider-search] {
  width: 100%; height: 28px; border: 0; outline: none; padding: 0;
  background: transparent; color: var(--mcx-color-text-primary);
  font: inherit; font-size: var(--mcx-text-sm, 13px);
}
[data-codex-model-slider-search]::placeholder { color: var(--mcx-color-text-tertiary); }
```
（`install.mjs:53-58`）→ 无边框、透明底，只有辅助色 placeholder（`DESIGN.md:27`）。

行结构：
```css
[data-codex-model-slider-row]   { display:flex; width:100%; min-width:0; align-items:center; gap:10px; }
[data-codex-model-slider-brand] { display:grid; width:18px; height:18px; flex:0 0 18px; place-items:center; }
[data-codex-model-slider-brand] svg { width:16px; height:16px; display:block; }
[data-codex-model-slider-copy]  { display:flex; min-width:0; flex:1; flex-direction:column; gap:1px; }
[data-codex-model-slider-name]  { overflow:hidden; color:var(--mcx-color-text-foreground); text-overflow:ellipsis; white-space:nowrap; }
[data-codex-model-slider-provider] { overflow:hidden; color:var(--mcx-color-text-foreground-tertiary); font-size:11px; line-height:14px; text-overflow:ellipsis; white-space:nowrap; }
```
（`install.mjs:100-105`）→ 模型名 = 主信息（正文色、单行省略），Provider = 辅助（11px/14px、三级色）。

收藏星标（hover 才出现 + 扩大热区）：
```css
[data-codex-model-slider-item] { position: relative; }
[data-codex-model-slider-item][data-codex-model-slider-selected] { background: var(--mcx-color-token-list-hover-background); }
[data-codex-model-slider-star] {
  display:grid; width:24px; height:24px; flex:0 0 24px; place-items:center; border:0;
  border-radius: var(--mcx-radius-md,6px); padding:0; background:transparent;
  color: var(--mcx-color-text-foreground-tertiary); cursor:pointer; opacity:0; pointer-events:none;
}
[data-codex-model-slider-item]:hover [data-codex-model-slider-star],
[data-codex-model-slider-item]:focus-within [data-codex-model-slider-star] { opacity:1; pointer-events:auto; }
[data-codex-model-slider-star]::after { content:""; position:absolute; top:0; right:0; bottom:0; width:40px; z-index:1; }
[data-codex-model-slider-star] svg { position:relative; z-index:2; width:16px; height:16px; pointer-events:none; }
```
（`install.mjs:106-121`）→ 24px 视觉按钮 + `::after` 40px 右侧热区，命中率更高。

分隔线：
```css
[data-codex-model-slider-divider] { height:0; border-top:1px solid var(--mcx-color-token-border,var(--mcx-color-border)); margin:6px 8px; }
```
（`install.mjs:122-125`）

### 4.3 opaque dropdown 分支

- 调用：`featureUI.surface(menu, "dropdown", { variant: "opaque" })`（`install.mjs:1149`）。
- 效果：`data-mcx-ui-surface="dropdown"` + `data-mcx-ui-variant="opaque"` → 背景直接用 `--mcx-color-surface-elevated-secondary`，**`backdrop-filter:none`**，保留 Dropdown 的 ring + 阴影（`packages/ui/src/foundation/surfaces.mjs:11-12`）。
- 理由：避免后方聊天文字透过列表（`DESIGN.md:29`、根 `DESIGN.md` 组件选型表 Dropdown 行）。
- 另一个细节：`menu.style.animation = "none"`（`install.mjs:1151`）——因为只切换同一个 picker 的视图，不要重复播放 Dropdown 的入场缩放。

### 4.4 水平居中

`centerGenericModelPicker`（`install.mjs:1994-2006`）：读主菜单与触发器矩形，算差值写进 CSS 变量 `--codex-model-slider-menu-center-shift`，由 `[data-codex-model-slider-generic-menu] { transform: translateX(var(--...shift,0px)) !important; }` 应用（`install.mjs:126-129`）。这样即使原生 popper 把菜单放偏了，增强面板也与触发器水平居中（`DESIGN.md:25`）。

### 4.5 zoom 处理

Codex 26.1007+ 的原生弹层带 CSS `zoom` 与开场 `scale`；高度必须用「布局尺寸」，否则动画起点/终点会被重复缩放（`DESIGN.md:51`）。代码里用 `getComputedStyle(menu).height` 读布局高度、用 `menu.currentCSSZoom` 归一可用空间与滚动距离（`install.mjs:1017-1018`、`736`、`1066`、`1074`）。
**［可降级］** DSH 是标准 Web 页面（`docs/plugin-conventions.md:26` 的 `platform: "web"`），若无 `zoom` 胶囊需求，可删掉 `currentCSSZoom` 归一，保留纯 px 计算。

---

## 5. 键盘与焦点

### 5.1 打开时的焦点

- 列表打开后立即 `search.focus({ preventScroll: true })`（`install.mjs:1308`）。焦点永远先落在搜索框，而不是列表项。

### 5.2 搜索框内键位（`install.mjs:1220-1246`）

| 键 | 行为 | 证据 |
|---|---|---|
| 任意键 | `event.stopPropagation()`，阻止原生菜单 typeahead 吞掉输入 | `1221` |
| IME 组合期 | `if (event.isComposing) return;` 不提交任何动作 | `1222` |
| `Escape` | `preventDefault` → 关闭列表 → `modelButton.focus()` | `1223-1226` |
| `ArrowDown` / `ArrowUp` | 在**可见项**里循环移动（首尾环绕）；打 `data-codex-model-slider-keyboard` 高亮、写 `aria-activedescendant`；并做最小滚动让高亮项不被 sticky 搜索栏挡住 | `1227-1241` |
| `Enter` | 点击当前高亮项；无高亮时点第一个可见项 | `1242-1245` |

高亮滚动算法（`1238-1241`）：
```js
const top    = item.offsetTop - header.offsetHeight;
const bottom = item.offsetTop + item.offsetHeight - menu.clientHeight;
if (top < menu.scrollTop) menu.scrollTop = top;
else if (bottom > menu.scrollTop) menu.scrollTop = bottom;
```
高亮样式：`background: var(--mcx-color-background-primary-ghost-hover)`（`install.mjs:60`）。

### 5.3 列表内键位（`install.mjs:1266-1279`）

- `Escape`：`preventDefault` + `stopPropagation` → 关闭列表 → 焦点回模型名按钮。
- `Enter` / `Space`：作用于 `event.target` 最近的 item（`item.click()`）。
- 列表项本身 `tabindex="-1"`、`role="menuitem"`（`1171-1172`），即**不进入 Tab 序列**。

### 5.4 全局 Escape 兜底

`window` capture 阶段监听（`install.mjs:2334-2342`）：只有「存在 controller menu」时拦截，`preventDefault + stopImmediatePropagation` 阻止原生 document 监听把整个 picker 一起关掉，然后关列表并把焦点还给 `record.button`。
——这是三层退出顺序能成立的关键：**先退插件层，再让原生层处理下一次 Escape**。

### 5.5 Tab / Shift+Tab

- MCX **没有**显式 Tab 处理，不设焦点陷阱。观察到的实际焦点序列：搜索框 →（Tab）→ 各行星标按钮（星标是无 `tabindex` 的原生 `<button>`，`832-838`）→ …。
- 列表项、滑条、模型名按钮、Fast、Reset 都可聚焦（`1739-1746`、`1877`、`1818-1821`、`1851`）。
- **［可降级/建议］** DSH 版建议显式处理 Tab（例如 Tab 在搜索框内循环、或把星标 `tabindex=-1` 仅在 hover 时可达），因为 MCX 这里依赖原生菜单的 Tab 语义，照抄会得到「Tab 落到每个星标」的体验。

### 5.6 焦点保持与恢复

- 鼠标点列表项时 `pointerdown` 要 `preventDefault`，否则原生菜单会把焦点从搜索框抢走（`install.mjs:1216-1219`）。
- 滑条因提交 effort 而被重建时，只有「焦点原本就在旧滑条上」才把焦点接续到新滑条，且要求菜单仍挂载；不抢模型按钮/搜索框/已关闭菜单的焦点（`install.mjs:1-9`）。单测断言见 `test/slider-focus.test.mjs:7-18`。
- 滑条聚焦时的键盘：`ArrowLeft/ArrowRight/Home/End` → 预览 + **立即提交**（`install.mjs:1975-1986`）。注意与列表里的 Arrow 语义不同：滑条是直接改档位。

### 5.7 键位总表

| 容器 | ↑/↓ | ←/→ | Home/End | Enter | Space | Esc | Tab |
|---|---|---|---|---|---|---|---|
| 搜索框 | 移动高亮（环绕） | — | — | 选中高亮/首项 | — | 回 Slider | 无处理 |
| 列表项 | （冒泡到搜索已 stopPropagation，实际不生效） | — | — | 选中该项 | 选中该项 | 回 Slider | 无处理 |
| 滑条 rail | — | 档位 ±1 | 首/末档 | — | — | — | 无处理 |
| 模型名 toggle | — | — | — | 打开列表 | 打开列表 | — | 无处理 |
| Fast 按钮 | — | — | — | 原生触发 | 原生触发 | — | 无处理 |

---

## 6. 图标

### 6.1 资产清单（`assets/`）

品牌图标 12 个（`providers/`）：
`anthropic.svg`(368B) · `deepseek.svg`(2.1K) · `gemini.svg`(2.8K) · `grok.svg`(756B) · `hunyuan.svg`(1.1K) · `kimi.svg`(711B) · `minimax.svg`(1.5K) · `muse.svg`(6.0K, Meta 标志) · `openai.svg`(1.7K) · `qwen.svg`(2.0K) · `xiaomimimo.svg`(933B) · `zhipu.svg`(1.7K, 内嵌 PNG favicon, viewBox 0 0 96 96)

UI 图标 3 个（`ui/`，均来自 lucide-static v1.30.0 ISC）：
`sparkles.svg`（fallback）· `star.svg`（收藏）· `star-off.svg`（已收藏/取消收藏）

许可（复刻时必须一并保留）：品牌图标来自 `farion1231/cc-switch` v3.19.1（MIT）；`xiaomimimo.svg` 来自 simple-icons（CC0）；Lucide 为 ISC；`zhipu.svg`/`muse.svg` 是官方标志包装层（`THIRD_PARTY_NOTICES.md`）。**［可降级］** DSH 版不必复制这些文件，可用自有图标库 + 同样的匹配规则；若复制，必须带同样的 notices。

### 6.2 匹配规则（品牌 → 模型）

```js
// model-rules.mjs:48-53
const haystack = `${identity.backend} ${identity.raw}`.toLowerCase();
brands.find(b => b.keywords.some(k => haystack.includes(k))) ?? null
```
- `identity`：`provider/backend` 拆分，第一个 `/` 左边是接入 provider，右边是 backend（`model-rules.mjs:3-11`）。
- **判断依据是 backend + 完整 raw 的包含匹配，按 manifest 中 brands 的数组顺序取第一个命中**（顺序即优先级，`codex-feature.json:53-66`）。
- keyword → 品牌：deepseek→`deepseek`；`claude|anthropic`→anthropic；`gemini|gemma`→gemini；`grok|xai`→grok；`mimo|xiaomi`→mimo；`kimi|moonshot`→kimi；`minimax`；`qwen|qwq`；`tencent|hunyuan|opencode-go/hy3`→hunyuan；`muse|muse-spark`→muse；`zhipu|chatglm|glm`→zhipu；`openai|gpt|codex|o1|o3|o4`→openai。
- 注意坑：`hunyuan` **不能**用裸 `hy` 做 keyword，否则 `opencode-go/hyphen-3` 会误判（`test/manifest.test.mjs:32-58` 专门断言这一点）。
- 没有命中 → 用 `icons.fallback`（sparkles），`brandRoot` 的 dataset 写 `"fallback"`（`install.mjs:816-818`）。
- `providerAliases` 只决定副文本显示名（`opencode-go`→`OpenCode Go` 等，`codex-feature.json:20-29`、`model-rules.mjs:38-41`），不参与品牌匹配。

### 6.3 尺寸 / 颜色 / 内联方式

- 内联：构建期把 `assets/*.svg` 读成 `{ viewBox, markup }`（只取 `<svg>` 内部内容，`feature-registry.mjs:101-115`）；运行时用图标工厂生成 `<svg width height viewBox fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden>` 再 `innerHTML = markup`（`packages/runtime-host/src/codex-injection.mjs:559-574`）。
- 品牌图标特殊处理：`fill=currentColor`，并**移除** stroke / stroke-width / linecap / linejoin，让单色 logo 跟随文字色、多色 logo 保留自身 fill（`install.mjs:158-169`）。
- 尺寸：列表行品牌图标容器 18×18、svg 16×16（`install.mjs:101-102`）；星标按钮 24×24、svg 16×16（`108-109`、`121`）；Fast 图标 20×20（`install.mjs:263-264`），克隆原生时沿用原生 width/height，缺省 16（`install.mjs:339-342`）。
- 颜色语义：品牌 svg 用 `currentColor`（行内默认文字色）；Provider 副文本三级色；星标默认三级色、hover/focus 变主文字色（`108-117`）。
- Fast 闪电图标来源（**［可降级］**）：从 Codex app bundle 里按两条 path 前缀正则抽取 `d:` 路径（`controller.mjs:81-93`），失败则从原生 DOM 克隆（`install.mjs:281-307`），并把结果缓存到 `localStorage["codex-model-slider:fast-icons:v1"]`（`install.mjs:31`、`202-239`）。DSH 版直接用自有图标资产即可。

### 6.4 星标（star / unstar）

- 初始：`star.setAttribute("data-codex-model-slider-star", starred ? "unstar" : "star")`，图标与 `aria-label`、`data-minecodex-tooltip` 同步（`install.mjs:832-838`）。
- 切换收藏后遍历所有 item 刷新图标与 tooltip（`install.mjs:766-777`）。
- 文案模板：`Star {model}` / `Unstar {model}`（`codex-feature.json:39-46`，zh 为「收藏 {model}」/「取消收藏 {model}」）。

---

## 7. 思考强度滑条

### 7.1 档位数据来源

- `model.supportedReasoningLevels` 数组顺序即档位顺序（`install.mjs:1707-1708`）；来源优先级：原生控制器模型 → catalog → 触发器属性 → 默认值（`install.mjs:2018-2036`）。
- 若 manifest 的 `openCodexRealEfforts` 声明了该模型的真实档位，则与模型自报档位做**交集过滤**（只减不增），过滤掉 catalog 为 mock 顶档而多广告的 `max/ultra`（`model-rules.mjs:62-81`，测试 `test/model-rules.test.mjs:32-39`）。
- 选中档位取 `controller.reasoningEffort`，不在支持列表时回退到默认档（`install.mjs:2021-2036`、`1120-1128`）。

### 7.2 标签（`install.mjs:1331-1336`）

| effort 值 | 显示标签 |
|---|---|
| `none` | None |
| `minimal` | Minimal |
| `low` | **Light** ←注意不是 "Low" |
| `medium` | Medium |
| `high` | High |
| `xhigh` | **Extra High** |
| `max` | Max |
| `ultra` | Ultra |

未列出的值走 `formatIdentifier()` 兜底（首字母大写 + 连字符/下划线拆分，`model-rules.mjs:13-36`）。
注意原生 effort 子菜单识别用的是另一套小写标签集合（`install.mjs:488-497`），DSH 版无需该集合。

### 7.3 颜色语义

- 普通档位：进度填充 `var(--mcx-color-text-accent)`（`install.mjs:136`）——DESIGN 中称为 Reasoning Accent Blue，即原生 active effort 蓝（`DESIGN.md:11`）。注意 `DESIGN.md` 写作 `var(--color-chart-blue)`，代码实际消费的是 `--mcx-color-text-accent`（同一「蓝」语义的两层命名）；实现时取项目的蓝色强调 token 即可，不必纠结名字。
- Ultra/顶档：`[data-codex-model-slider-rail][data-max="true"] [data-codex-model-slider-range] { background: var(--mcx-color-chart-purple); }`（`install.mjs:137`），紫色**只**用于 Ultra 及相关状态（`DESIGN.md:12`）。
- 离开 Ultra 立即恢复普通色（`DESIGN.md:33`）：由 `syncGenericMaximumVisual` 把 `data-max` 写成 `"true"/"false"` 实现（`install.mjs:1441-1452`）。
- 档位刻度点：默认 `--mcx-color-text-foreground-tertiary`，已选（`tickIndex <= index`）变 `--mcx-color-text-on-accent`（`install.mjs:138-142`、`1435-1437`）。

### 7.4 几何与「边缘修正」（原生克隆路径，**［可降级］**）

原生克隆路径要抵消 26px 拇指的半径，否则两端填充会露出空隙（`install.mjs:1419-1439`）：
```js
const thumbRadius = 13;
const correction   = thumbRadius - (progress/50) * thumbRadius;        // 0% 时 13px，100% 时 -13px
const segment      = count <= 1 ? 100 : 100 / (count - 1);
const edgeScale    = Math.min(progress/segment, (100-progress)/segment, 1);
const edgeCorrection = correction * Math.max(0, edgeScale);
range.style.transform  = `translateX(calc(${progress-100}% + ${edgeCorrection}px))`;
thumb.style.left       = `calc(${progress}% + ${correction}px)`;
particleClip.style.clipPath = `inset(0 calc(${100-progress}% - ${edgeCorrection}px) 0 0)`;
```
刻度点位置同样用 `calc(progress% + correction px)`，correction 公式见 `install.mjs:1612-1619`。

**自绘 fallback 滑条**（原生模板不可用时）的 CSS 已在 §4 的注入样式里，尺寸：轨道 `top:12px; height:16px; radius:999px`，填充 `left:0; width:var(--codex-model-slider-progress)`，拇指 `26×26`（`top:7px`，`translateX(-50%)`，`border:0.5px`，`box-shadow: var(--mcx-shadow-md)`），刻度 6×6 圆点（`install.mjs:134-149`）。**DSH 版建议直接采用这套自绘几何**（不依赖任何原生 class）。

### 7.5 Fast 状态

- 显示条件：模型服务档位里存在 `value === "priority"` 且控制器有 `onSelectServiceTier`（`install.mjs:1735-1738`）。
- 初始状态：`selectedServiceTier.id === (fastOption.tier?.id ?? "priority")` 或等于 `"priority"`（`install.mjs:1811-1816`）。
- 点击：先立刻更新视觉（`syncGenericFastVisual`），再 `onSelectServiceTier(next ? "priority" : null)`，然后 `queueEnsure()` 重建面板（`install.mjs:1835-1841`）。
- 语义属性：`aria-pressed`、`data-fast-mode-enabled`、`data-max-power-selection`（`install.mjs:1822-1825`）；无障碍标签：`开启/关闭 Fast 模式`（`install.mjs:1826-1828`、`1547-1549`）。
- 时序标记：`data-fast-mode-dot-transition` 先置 `entering/exiting`，稳定后 1200ms（开）/350ms（关）再置 `active/inactive`（`install.mjs:1554`、`1566-1572`）；容器 `data-codex-model-slider-fast-transitioning` 260ms 后清除并重建（`install.mjs:1556-1565`）。

### 7.6 拖动预览（preview）

- `pointerdown`：`dragging=true`、**快照** `dragRect = rail.getBoundingClientRect()`（避免拖动中布局变化导致抖动）、`setPointerCapture`、立即预览（`install.mjs:1942-1947`）。
- `pointermove`：用 `requestAnimationFrame` 合并高频事件，只在帧内取最新 `clientX`（`install.mjs:1948-1956`）。
- `pointerup`：清 rAF、按最终位置预览、`selectNativeEffort(efforts[pendingIndex])` 提交（`install.mjs:1957-1966`）。
- `pointercancel`：回滚到原档位（`install.mjs:1967-1974`）。
- 预览内容：滑条填充/拇指/刻度 + `aria-valuetext` + 头部 effort 文本 + Ultra 紫色状态，**不提交**（`install.mjs:1930-1940`）。这实现了「拖动时标签跟着变，松手才提交」。
- 命中档位：`ratio = clamp((clientX - rect.left)/rect.width)`，`index = round(ratio * (count-1))`（`install.mjs:1925-1929`）。

### 7.7 Ultra 联动

`syncGenericMaximumVisual(rail, effortText, fastButton, maximum)`（`install.mjs:1441-1452`）一次同步四处：`rail[data-highlighted]`、`rail[data-max]`、`effortText[data-maximum]`、`fastButton[data-max-power-selection]`，并把原生 `_MaxEffects_` 层透明度设 0/1。拖动预览时也会调用（`install.mjs:1938-1939`），所以拖到 Ultra 立刻变紫、松手前就能看到。

### 7.8 粒子动画（**［可选］** 成本高，建议二期）

- 仅当 Fast 开启、非 reduced-motion、且能解析到原生 CSS Module 类名（`FastParticleClip`/`FastTrackParticles`/`FastTrackParticlePath`/`TrackParticle`）时创建（`install.mjs:1493-1498`）。
- 14 个粒子；`travelDuration = 1.9s`；每个粒子 `animationDelay = -((i+0.5)/14)*1.9s`（负延迟 = 等间距错相，保证「等速、等间距」）；`animationDuration = 1.9s`（`install.mjs:1507-1515`）。
- 随机但**确定性**：`nativeParticleSeed(i, salt) = frac(sin((i+1)*12.9898 + salt*78.233) * 43758.5453)`（`install.mjs:1472-1475`）；纵向 `top = 12% + seed(i,23)*76%`，透明度 `0.4 + seed(i,11)*0.6`，缩放 `0.5 + seed(i,12)*0.45`（`install.mjs:1516-1520`）。
- **档位只裁剪可见范围，不改变运动周期、不把粒子压缩到填充区**（`install.mjs:1513` 注释、`DESIGN.md:34`）：即粒子沿整条滑轨匀速跑，`clip-path` 决定露出的比例。
- 进/出：静态星点 240ms 淡出，粒子层 240ms 淡入（`install.mjs:1481-1490`、`1529-1532`）。
- DSH 降级：用一条 CSS `@keyframes` 平移 + `mask-image`/`clip-path` 裁剪即可复刻观感；不做 14 个独立粒子也能得到 80% 效果。

---

## 8. 搜索与收藏

### 8.1 搜索

- 常驻显示（不是「模型超过 N 个才出现」，`test/manifest.test.mjs:72-77` 专门断言移除旧阈值）。
- 输入框属性：`type=text`、`placeholder = strings.searchPlaceholder`、`aria-label = placeholder`、`autocomplete=off`、`spellcheck=false`（`install.mjs:1155-1161`）。
- 文案：`Search model` / `搜索模型`（`codex-feature.json:31-34`）。
- 筛选（`install.mjs:673-678`）：
  ```js
  query = input.value.trim().toLocaleLowerCase();
  terms = query.split(/\s+/).filter(Boolean);
  text  = `${item.dataset.codexModelSliderRaw} ${copy.textContent}`.toLocaleLowerCase();
  visible = terms.every(t => text.includes(t));
  ```
  → 匹配范围 = **完整模型 ID + 显示名 + Provider 副文本**，忽略大小写，多词 AND。
- 筛选后：`requestAnimationFrame` 里重算可视高度（不是同步，避免布局抖动，`install.mjs:679-687`、`715-721`）。
- 收藏分隔线：只有「收藏组」和「未收藏组」都有可见行时才存在（`install.mjs:699-711`）。
- 空状态：`role="status"`、`textContent = strings.noResults`（`未找到模型` / `No models found`），`hidden` 由可见行数控制（`install.mjs:712-713`、`1182-1187`）；样式 `padding:12px 8px; 三级/二级文字色; 13px`（`install.mjs:59`）。
- 高度变化沿用底边锚定 320ms；reduced-motion 直接改（`install.mjs:1206`）。

### 8.2 排序

两级排序（`install.mjs:662-667`）：
1. 收藏优先：`return favB - favA`，即 `favorites.has() === true` 的排前面（`install.mjs:663-665`）。
2. 其余交给 `compareModelIds`（`model-rules.mjs:135-151`）：
   - 先按「厂商组」：`openai` 永远第一，其余按 manifest brands 顺序，未识别组排最后并按字母序（`138-141`）。
   - OpenAI 组内按档次 `astra < sol < terra < luna < 无档次`（`127-129`、`142-144`）。
   - 再按版本号**逐段数值降序**：`6.10 > 6.1 > 6 > 5.6 > 5.5`（`131`、`145-150`）。点号与连字符等价。
   - 完全相同时保持原顺序（稳定排序，返回 0）。
- 行为断言：`test/model-rules.test.mjs:65-99`（含「收藏组/未收藏组各自排序」）。
- 排序落地方式：把 DOM 节点按目标顺序 `append` 重排（`install.mjs:692-696`），**不是**重建节点（保留焦点与事件）。

### 8.3 收藏持久化

- 前端缓存 key：`codex-model-slider:favorites:v1`（`codex-feature.json:19`），值是 `string[]`（`install.mjs:395-402`、`415-419`）。
- 写入流程：算 add/remove 差集 → 串行队列 `favoritesWrite` 调 host action `{operation:'change', add, remove}` → 同时写 localStorage；localStorage 被禁用时静默降级（`install.mjs:406-420`）。
- 首次接入：把旧 localStorage 收藏通过 `{operation:'initialize', add: legacy}` 迁移一次，之后以后端为准（`install.mjs:2348-2358`）。
- 后端（Codex 侧）：SQLite `favorites.sqlite`，`favorites(id TEXT PRIMARY KEY)` + `metadata(key)`，`BEGIN IMMEDIATE` 事务，`mkdir 0700` / `chmod 0600`（`favorites.mjs:6-9`、`22-44`）。
- 校验：`version === 1`、数组、≤10000 条、每条为非空字符串且 ≤512 字符、不含控制字符、去重（`favorites.mjs:10-13`）。
- 操作集：`initialize | change | read | merge`；`change` 才删；`initialize` 第二次起只加不删（幂等，`favorites.mjs:35-39`）。
- 收藏键的匹配口径（跨机器）：`favoriteModelId(raw, {authoritative, nativeSlug, catalogSlug})` —— 控制器给的原生 ID 或带 provider 的 `provider/model` 用原值，否则用 nativeSlug/catalogSlug 兜底；**不同厂商同名模型不会互相对应**（`model-rules.mjs:113-116`、`DESIGN.md:49`）。
- **［可降级］** DSH 版用插件自己的存储（localStorage 或 host 存储 API）即可，只要保持「完整 ID 匹配 + 去重 + 只做增量 add/remove」。

---

## 9. 触发器（composer chip）行为

### 9.1 两种状态

| 状态 | 判据 | 宽度 | 证据 |
|---|---|---|---|
| 占位态 | 文案匹配 `/^(select\s+(model\|effort)\|选择\s*(模型\|思考强度))$/i` | 锁定原生 160px（Content 宽） | `install.mjs:2168-2170`、`2202-2203`、`91-93` |
| 真实态 | 有 `data-codex-model-slider-trigger-raw`，且文案不是占位语 | `max-width:none; overflow:visible; text-overflow:clip; flex-shrink:0`（**HUG 完整名称**） | `install.mjs:2190-2218`、`82-90` |

- 加固态（尚未接管）：label 与原生 `_ModelPickerTriggerModelLabel_`/`_ModelPickerTriggerModelText_` 都限宽 110px + 省略号（`install.mjs:65-70`、`76-79`）。
- 由 DESIGN 明确的产品意图：**占位态沿用原生 160px Content 宽；真实态让芯片 HUG 完整模型名，长名称不被截断，effort 始终完整可见**（`DESIGN.md:18`、`23`、`38`）。
- 长名称策略：chip 上「优先换行而不是扩大面板」（`DESIGN.md:38`）——即面板宽度固定 264px，不让长名把面板撑宽；而 chip 本身在真实态不省略模型名，由原生容器决定换行/溢出。

### 9.2 实现要点

1. 每个 chip 注册 `MutationObserver`（childList/subtree/characterData）→ `queueEnsure`（`install.mjs:2172-2177`），保证 React 重渲染后仍能重新接管。
2. 只在「存在原生 ModelText 节点」时改写；否则走 `restoreTriggerLabelWithoutNative` 的「空窗期回插」，避免关盒瞬间芯片丢名字（`install.mjs:2178-2189`、`2154-2166`）。
3. 插入 MCX 标签 `<span data-codex-model-slider-trigger-label>`，复制原生 label 的 class（`install.mjs:2210-2217`）；已存在标签时**移动复用**而不是新建，避免两个名字把芯片撑宽（`install.mjs:2206-2209`）。
4. 原生有 `_ModelPickerTriggerMeasurement_` 测量探针，MCX 把探针文本同步成显示标签，让原生的「按测量结果钉宽度/居中弹层」拿到真实宽度（`install.mjs:2219-2224`）。**［可降级］** DSH 版若自己控制弹层定位，这层探针 hack 完全不需要。
5. 列表打开时 chip 文案就地改成 `Select model` / `选择模型`，关闭时用 `record.placeholderText` 还原（`install.mjs:1282-1291`、`1098-1103`）。**这也是一个状态可视化的细节：列表层级打开时，chip 说「选择模型」而不是「选择思考强度」。**
6. 多输入框：主 chat 与 side chat 各自维护标签与宽度测量（`install.mjs:2239-2246`；`DESIGN.md:22`）。

---

## 10. 复刻优先级与降级方案

### 10.1 必须复刻（P0，缺任何一条都不算复刻成功）

| # | 内容 | 依据 |
|---|---|---|
| 1 | 层级顺序：先 Slider 后列表；Escape 逐层退出（列表→Slider→关闭） | §1.4、`install.mjs:2334-2342` |
| 2 | 头部两行结构：上行 effort 标签（居中）、下行 模型名 + chevron（居中）、右侧 Fast | §1.2、`install.mjs:1747-1796` |
| 3 | 点击模型名行进入列表；列表覆盖原面板 | §1.3 |
| 4 | 底边锚定高度动画：320ms `cubic-bezier(.19,1,.22,1)`，内容 200ms + 10px 位移 + 40ms 延迟 | §3.1、§3.2 |
| 5 | 关闭时高度回缩 + 内容下移淡出 + 整层 200ms 淡出（延迟 40ms） | §3.3、`install.mjs:1032-1040` |
| 6 | 列表 264px 宽、6px 内边距、最多 6 行可见、超出滚动 | §4.2、`codex-feature.json:18` |
| 7 | sticky 搜索栏 + `::before` 顶部补丁（不占布局高度） | §4.2 |
| 8 | opaque 下拉材质（不透明 + 无模糊 + 保留 ring/阴影） | §4.3 |
| 9 | 搜索：常驻、打开即聚焦、多词 AND、忽略大小写、匹配 ID+名称+Provider、空状态 | §8.1 |
| 10 | 键盘：↑↓ 高亮环绕、Enter 选中、Escape 回 Slider、IME 组合期不提交 | §5.2 |
| 11 | 焦点：打开聚焦搜索框；Escape 后焦点回模型名按钮；鼠标点列表项不抢焦点 | §5.1、§5.6 |
| 12 | 收藏：hover 显形、星标切换、收藏组置顶、两组间分隔线（仅两边都有可见项时） | §6.4、§8.2、`install.mjs:699-711` |
| 13 | 滑条：档位来自模型能力、标签映射（Light/Extra High 等）、拖动预览松手提交、Ultra 紫色 | §7 |
| 14 | reduced-motion 全链路降级（动画立即完成、滚动瞬时、无粒子） | §3.5 |
| 15 | 清理契约：重播前 cancel 旧动画、320ms 兜底定时器、卸载清理 | §3.6 |

### 10.2 可以降级（P1/P2，附替代方案）

| 项 | MCX 做法 | 降级方案 | 影响 |
|---|---|---|---|
| 复用原生 React 节点 | 压扁原生容器 + 追加 shell（`install.mjs:2103-2113`） | DSH 插件直接挂自己的浮层（或 React Portal），自己管开关 | 无感；反而更简单 |
| 原生 CSS Module 类名克隆（`_ViewToggle_`、`_FastParticleClip_` 等，`install.mjs:1710-1723`、`1494-1498`） | 运行时按正则探测 Codex 私有类名 | 自建组件 + 固定 CSS，数值照抄 §4.2 | 无感 |
| 原生模板等待（template-wait） | 最多 3 帧重试（`install.mjs:2044-2056`） | 自绘滑条，无等待 | 无感 |
| 原生 canvas 高光纹理镜像（`install.mjs:1636-1664`，80ms 轮询 + `getImageData`） | 复制原生 canvas | 不做 | 视觉细节损失，可接受 |
| 14 粒子 Fast 动画 | 依赖原生 class | CSS keyframes + mask/clip-path 简化版 | 观感 80%，成本降一个量级 |
| Fast 图标从 app bundle 抽取（`controller.mjs:81-93`） | 正则抽 `d:` 路径 + localStorage 缓存 | 用自备闪电图标 | 无感 |
| zoom 归一（`currentCSSZoom`，`install.mjs:736`、`1066`） | 兼容 Codex 弹层 zoom/scale | 标准页面直接用 px | 无感 |
| 原生测量探针同步（`install.mjs:2219-2224`） | 让原生宽度测量拿到真实宽度 | 自己定位/自己量 | 无感 |
| 旧原生子菜单回退路径（`install.mjs:614-660`、`2117-2150`） | 私有 DOM 不满足时降级 | 不需要 | — |
| SQLite 收藏后端（`favorites.mjs`） | host action + sqlite + 0600 权限 | 插件本地存储 | 无感 |
| 选择项自动滚动定位（400ms） | 打开后把选中项滚到中央 | **建议保留**（体验明显），实现只需 ~30 行 rAF（`install.mjs:1079-1087`） | 若砍掉，长列表里用户找不到当前模型 |

### 10.3 平台差异与需要先确认的前提（不要假设）

1. **模型列表数据源**：MCX 从 Codex React fiber 里读 `models / model / reasoningEffort / serviceTierOptions / onSelectModel / onSelectReasoningEffort / onSelectServiceTier`（`controller.mjs:13-39`）。DSH 版必须有等价接口（模型清单、当前模型、当前档位、选择回调、Fast/服务档位、每模型支持档位）。**若 DSH 侧不暴露这些，本文所有交互都无法落地**，需要先由 host adapter 提供。
2. **chip 是否可被插件接管**：MCX 是把原生 chip 的文本节点改写成自己的标签并加 `data-*`（`install.mjs:2172-2225`）。DSH 若不开放 composer chip，可退化为「在 composer 侧插入独立入口按钮」，代价是视觉位置与原生产品级 chip 不同。
3. **弹层容器与 z-index/裁剪**：MCX 依赖 `overflow:visible` 让列表向上溢出主菜单（`install.mjs:1303-1304`）。DSH 的浮层根容器若有 `overflow:hidden` 或 `contain`，需改成 Portal 挂载。
4. **toast/tooltip**：星标 tooltip 用 `data-minecodex-tooltip` 属性交给共享 Tooltip（`install.mjs:836`），DSH 需换成本地 tooltip 组件。
5. **国际化**：所有用户可见文案都在 manifest 里分 en / zh-CN（`codex-feature.json:30-47`），`locale === "zh-CN"` 是硬判断（`install.mjs:1290`、`1548`、`1878`）。DSH 请用同一套 key，避免散落字符串。

### 10.4 建议的落地顺序

1. 静态结构与样式（§4）+ 头部布局（§1.2）+ 触发器（§9）——先把「看起来对」做出来。
2. 状态机与开关（§2）+ 键盘焦点（§5）——把「能操作」做出来。
3. 动效（§3）——底边锚定 + 双段缓动是最容易被察觉「不像」的部分，参数照抄，不要自创。
4. 搜索/排序/收藏（§8）——注意排序规则里的 Astra/Sol/Terra/Luna 与版本逐段比较。
5. 滑条细节（§7）——先做拖动预览与 Ultra 配色，粒子与边缘修正放最后。

---

## 11. 关键数值速查（实现时贴在手边）

```
宽度            264px（min-width 同值，overflow-x hidden）
列表内边距      6px（四周）；搜索栏 padding 2px 8px 8px；分隔线 margin 6px 8px
最大可见行      6
行结构          gap 10px；品牌 18×18（svg 16）；名称/Provider 列 gap 1px
星标            按钮 24×24（圆角 6px），svg 16×16，热区 ::after 宽 40px
搜索输入        高 28px，透明底，13px，无描边
空状态          padding 12px 8px，13px，二级文字色
高度动画        320ms  cubic-bezier(.19,1,.22,1)
内容动画        200ms  cubic-bezier(.23,1,.32,1)，位移 10px，开场延迟 40ms，收场延迟 0
整层淡出        200ms  同缓动，延迟 40ms
滚动定位        400ms  ease-out cubic（1-(1-p)^3）
粒子流动        1.9s linear × 14 个，负延迟 -(i+0.5)/14*1.9s
静态星点淡出    240ms  ease-out
Fast 标记        过渡态 260ms；稳定 1200ms（开）/ 350ms（关）
默认兜底定时器  320ms（动画同长，防止后台窗口丢事件）
effort 事务     2000ms 上限；原生子菜单观察 1500ms 上限
chip 占位宽      160px；接管前 label 限宽 110px
```

---

## 证据索引

| 简写 | 路径（相对 `features/model-slider/`，除注明外） |
|---|---|
| `install.mjs` | `src/frontend/install.mjs`（2373 行，UI/交互核心） |
| `model-rules.mjs` | `src/domain/model-rules.mjs`（171 行，身份/品牌/排序/去重） |
| `controller.mjs` | `src/adapters/codex/controller.mjs`（108 行，Codex 私有控制器适配） |
| `favorites.mjs` | `src/backend/favorites.mjs`（54 行，SQLite 收藏） |
| `codex-feature.json` | 功能清单（品牌表、字符串、图标、maxVisibleItems） |
| `DESIGN.md` / `DEVELOPMENT.md` / `PRODUCT.md` | 功能设计/开发/产品说明 |
| `test/*.mjs` | 行为断言：`model-reveal.test.mjs`（滚动定位）、`slider-focus.test.mjs`（焦点接续）、`model-rules.test.mjs`（排序/别名/档位交集）、`manifest.test.mjs`（清单与资产） |
| `packages/ui/src/foundation/surfaces.mjs` | MCX 仓库根下，Dropdown opaque 分支的真实 CSS（11-12 行） |
| `packages/runtime-host/src/feature-registry.mjs` | 图标资源 → `{viewBox, markup}` 的构建期转换（101-115 行） |
| `packages/runtime-host/src/codex-injection.mjs` | `createMarkupIcon` 图标工厂（559-574 行） |
| `packages/ui/src/native/mcp-theme.css` | `--mcx-spacing: 4px`（2 行） |
| `THIRD_PARTY_NOTICES.md`、`vendor/*-LICENSE` | 品牌图标与 Lucide 的许可来源 |
