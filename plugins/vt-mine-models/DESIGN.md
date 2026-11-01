# DESIGN — dsh-vt-mine-models

这份文档记录**设计判断**：这套两段式模型选择器要什么、数值为什么是它、哪些 MCX 的东西在 DSH
上没有照抄，以及已知的脆弱点。实现细节与全部取值以 `client.js` 为准；本文的数值都是从
`client.js` 的 CSS / 常量里核对过的。

## 设计目标与来源

**目标**：把 MineCodex 的模型选择器搬到 DSH 的 composer，但只用 DSH 自己的数据与视觉体系。

- **交互来自 MCX**（[`docs/research/mcx-model-slider.md`](../../docs/research/mcx-model-slider.md)）：
  点 chip 先展开「当前模型 + 思考强度滑条」，点模型名才下钻到模型列表；列表底边锚定、向上生长；
  `Escape` 逐层退出；滑条拖动预览、松手提交。
- **视觉来自 DSH**（[`docs/research/dsh-model-selector.md`](../../docs/research/dsh-model-selector.md)）：
  颜色、圆角、阴影、字体全部用 `--dsw-*` token；菜单用共享的 `MenuSurface`，列表沿用
  `MenuGroup` / `Input` / `rankByName` / `observeStickyMenuGroups` 的平台行为。模型列表本身
  保持 DSH 现有设计（provider 分组、吸顶标题、超过 4 个模型才搜索、勾选、pending 点），
  只有根面板是新做的。
- **和官方选择器的关系**：以 `priority: -1` 注册 `conversation.input.model`，遮蔽官方
  `ModelSelect`（官方优先级 `0`，`single` 槽位规则是 lowest renders）。官方 registration
  仍在、子槽位仍被它声明，所以禁用插件就回到原样；插件本身不写持久状态。

**不做的**：Fast / service tier、重置为默认模型、收藏。DSH 没有 service tier，也没有
「重置为默认」与收藏的数据面；照抄 MCX 的按钮只会制造无效状态。深色模式、窄容器、焦点环、
reduced-motion 都属于「必须跟随 DSH」，不是可选装饰。

## 交互流程与状态机

### 状态

| 状态 | 判据（组件内） | 用户看到 |
|---|---|---|
| `closed` | `open === false` | 只有 composer chip |
| `effort` | `open && stage === 'effort'` | 强度面板：当前档位 + 模型行 + 滑条 |
| `model` | `open && stage === 'model'` | 列表覆盖在面板上，底边不动、向上长 |
| `model-leaving` | `stage === 'effort' && listLeaving` | 列表 200ms 淡出下移，随后卸载；shell 高度同时 320ms 回缩 |
| `busy` | `state.pending !== null` | 行禁用、pending 行显示状态点、搜索只读 |
| `notice` | 选中失败后 `setNotice(text)` | 面板内错误条（可关闭） |
| `load-error` | `state.error !== null && lastAction === 'load'` | 错误条 + 重试 |
| `group-failure` | `state.failures` 非空 | 每个失败 provider 一条警告 + 重试 |

`lastAction` 记录最近一次动作是 `load` 还是 `select`：目录错误条只在这种动作能解释它时出现，
避免「上次选择失败」的旧错误在重新打开时冒充加载错误。

### 转换

| 从 | 触发 | 到 |
|---|---|---|
| `closed` | 点 chip / `Enter` / `Space`（chip 是原生 button） | `effort`（`show()`：清空搜索、高亮、preview、notice，测量锚点，`load()`） |
| `effort` | 点模型行 | `model`（`drillIntoModels()`：清搜索与高亮，列表挂载，shell 高度跟随列表） |
| `model` | 点返回按钮 / `Escape` | `effort`（`backToEffort()`：列表 200ms 离开，同时焦点回模型行；200ms 后卸载列表） |
| `model` | 选中模型 / 选中当前模型 | `closed`（提交成功才关；焦点回 chip，并置 `selectionFocus` 抑制焦点环） |
| `model` | 点当前已选模型 | 直接关闭，不重复提交 |
| `effort` | `Escape` | `closed`（焦点回 chip） |
| `effort` | `Shift+Tab` | `closed`（把 Tab 交给页面，焦点回 chip） |
| 任意 `open` | 点面板外 / `mousedown` 外部 / 焦点离开 root+menu | `closed` |
| 任意 `open` | 点 chip 本身 | 面板已盖住 chip，这条不可达；关闭走外点 / `Escape` / `Shift+Tab` |

滑条提交（`commitEffort`）只换档位、**不关面板**：调强度是连续动作，关掉会打断。若目标档位
与当前档位相同，直接返回、不发请求。选择模型（`choose`）是终态动作，提交成功后关闭。

### 数据

组件不缓存模型目录：`directory.store` 用 `useSyncExternalStore` 订阅，`load()` 在打开时调用
（幂等、共享 in-flight），`select()` 只在用户动作时调用。`pending` 非空即视为 busy；选择
失败时把 `error.code/message` 读成面板内错误条，`session/writer-held` 用专门文案（会话被其它
DSH 实例占用）。subagent 会话通过 `sessions.subagentAddress(sessionId)` 判定，组件返回 `null`。

## 动效参数表

缓动与时长照 MCX；「关闭」一栏的取舍见后文。

| # | 场景 | 属性 | 时长 | 缓动 | 延迟 |
|---|---|---|---|---|---|
| M1 | 菜单入场（整个面板） | `opacity` 0→1、`translateY(4px)`→0 | 150ms | `cubic-bezier(.23,1,.32,1)` | 0 |
| M2 | 两段之间的容器高度 | `height`（实测两段的真实高度） | 320ms | `cubic-bezier(.19,1,.22,1)` | 0 |
| M3 | 列表 pane 进场 | `opacity` 0→1、`translateY(10px)`→0 | 200ms | `cubic-bezier(.23,1,.32,1)` | 40ms |
| M4 | 列表 pane 退场 | `opacity` 1→0、`translateY(0)`→10px | 200ms | `cubic-bezier(.23,1,.32,1)` | 0 |
| M5 | 列表卸载 | 退场结束后 `setListMounted(false)` | 200ms（JS 定时器与 M4 同长） | — | 0 |
| M6 | 强度面板隐藏 | `opacity` | 140ms `linear` | — | 0 |
| M7 | 档位标签换档 | `color` | 160ms `ease` | — | 0 |
| M8 | 滑条填充 / 拇指位置 | `width` / `left` | 180ms | `cubic-bezier(.23,1,.32,1)` | 0 |
| M9 | 刻度 / 拇指颜色与阴影 | `background-color` / `box-shadow` | 160ms `ease` | — | 0 |
| M10 | 拖动中 | 禁用 M8/M9 的过渡（实时跟手） | 0 | — | — |
| M11 | chip chevron | `transform`（打开时旋转 180°） | 120ms 默认缓动 | — | 0 |
| M12 | 模型行 chevron（hover） | `transform: translateX(2px)` | 200ms | `cubic-bezier(.23,1,.32,1)` | 0 |
| M13 | 面板关闭 | **无**：整层直接移除 | 0 | — | — |

细节：

- **高度动效只发生在两段之间**（M2/M3/M4），不是打开/关闭面板。首帧用 `data-ready` 关掉
  `height` 过渡，避免从 `0` 动画到实测高度；`ready` 在打开后 40ms 置位。
- 高度取「当前挂载那一阶段的 `offsetHeight`」，用 `ResizeObserver` + `requestAnimationFrame`
  合并重测，再与可用高度取 min。背景窗口丢帧时也不会留下错误高度。
- 滑条键盘调整有一个 **140ms 的预览窗口**：先显示目标档位，再提交。它不是动效，是给按键
  一个可见反馈；reduced-motion 下过渡虽为 0，这个窗口仍在。
- `@media (prefers-reduced-motion: reduce)` 把 pane 进出、高度、滑条、刻度、强度面板淡出
  （M6 的 140ms `opacity`）与 chevron 的 `animation` / `transition` 全部置为 `none`；
  M5 的卸载定时器照常（不可见）。因此 reduced-motion 下没有残留过渡，不存在例外项。

## 布局与尺寸表

坐标全部是视口 `fixed` 定位：底边与 chip 底边齐平（打开时面板把 chip 整行盖住），右边缘对齐 chip 右边缘，再钳进视口。

| 元素 | 数值 | 说明 |
|---|---|---|
| 菜单宽度 | `240–420px`，内容自适应 | 照原生规则：用 13px 字宽量出最长模型名 + 行内固定占位 60px，夹在 240–420；两段共用同一测量宽度，切段不横跳 |
| 菜单内边距 | 四周 `6px` | 列表滚动区贴着这圈内边距 |
| 菜单 z-index | `1100` | 与 DSH 原生模型菜单同层 |
| 菜单圆角 / 描边 | `MenuSurface` 提供（`lg`），描边 token 改指 `--dsw-alias-border-l1` | 不自绘浮层材质 |
| 菜单间距 | 底边 = chip 底边；距视口边 `12px`（`MENU_MARGIN`）；右边缘对齐 chip | 面板打开后 chip 被遮住，不再有 chip 上方的 8px 间隙 |
| 菜单可用高度 | `max(160, chip.bottom − 12 − 12)`，再 `min(360, …)` | 两个 12 = 视口边距与顶部安全余量；`360px` 是原生 `ModelSelect` 的 `max-height` 上限 |
| 面板 shell | 高度 = 当前段实测高度，上限 = 菜单可用高度 | 两段之间做纯高度补间 |
| 列表滚动区 | `max-height: max(120, 菜单可用高度)`，`overflow-y: auto` + `overflow-x: hidden` | 只纵向滚动；模型名过长时单行省略号截断，行与分组标题不允许把面板撑宽 |
| chip | 高 `28px`，`padding: 0 4px 0 8px`，`gap: 4px`，字号 `13/20`，圆角 `--dsw-radius-sm` | 沿用原生 chip 几何 |
| chip 最大宽 | `min(360px, 45cqw)` | 文本溢出省略 |
| 强度面板内边距 | `8px`（四周同值） | 滑条与面板边缘的留白全部由这一层提供 |
| 强度档位标签 | `min-height: 18px`，`13/18`，weight `500` | 居中，强调蓝；与 DSH 正文同一字号 |
| 强度面板模型行 | `min-height: 20px`，`margin: 2px 0 0`，`padding: 0 6px`，`gap: 4px`，`13/18` | 圆角 `--dsw-radius-sm`；只显示模型名 + chevron 12px，不显示厂商图标 |
| 滑轨容器 | 高 `30px`，`margin: 8px 0 0`；宽度 = 面板内容宽（240–420px 减去两侧各 8px padding） | 不再有左右/下额外缩进 |
| 轨道 | 高 `16px`，距滑轨顶 `7px`，圆角 `999px`，底 `--dsw-specific-selector` | `corner-shape: round`；轨道中心线仍在 y=15px，与 24px 拇指同心 |
| 填充 | 在轨道内部（`top:0; bottom:0`），宽度 = 档位百分比，圆角继承轨道 | 宽度不做端点修正 |
| 刻度点 | `4×4px`，顶 `15px` 且 `translate(-50%,-50%)`（垂直居中于轨道），横向按端点修正 | 常态 `opacity: .55`，已过档位反色且 `opacity: .9`，避免视觉过实 |
| 拇指 | `24×24px`，距顶 `3px`，`translateX(-50%)`，`0.5px` 描边 | 阴影 `elevation-soft`；横向按端点修正 |
| 端点修正 | `left = calc(progress% + (12 − progress/50 × 12)px)`：0% 右移 12px、50% 为 0、100% 左移 12px | 拇指与刻度用同一公式，让两端收进胶囊端头 |
| 强度提示行 | 高 `16px`，`11/16` | 只有一档时显示 |
| 列表标题行 | `margin-bottom: 3px`，`gap: 2px` | 返回按钮 `24×24` 圆形 |
| 搜索框 | 内边距 `5px 7px`，输入 `12px`，有查询时右侧留 `34px` 给清除按钮 | 清除按钮 `24×24` |
| 模型行（列表） | `min-height: 34px`，`padding: 5px 7px`，`gap: 8px` | 沿用原生行高与字号 `13/18` |
| 勾选位 | `14×14px` | pending 时换成 `StateDot` |
| 状态/空态行 | `padding: 8px`，`12/18` | 空状态只在 `status === 'ready'` 时出现 |
| 错误/警告条 | `padding: 6px 7px`，`11/16`，`gap: 6px` | 圆角 `--dsw-radius-md` |
| 分组标题 | 由平台 `MenuGroup` 渲染：`11px`、三级色 | 不自己画 |

## 颜色、排版、圆角、阴影 token

全部是 DSH token，不写死品牌色（品牌色只出现在厂商图标自己的图形里）。

| 用途 | Token |
|---|---|
| 菜单材质（不透明） | `--dsw-alias-bg-layer-1`（覆盖 `MenuSurface` 第一层材质，并把 `backdrop-filter` 置 `none`） |
| 菜单阴影 / 描边 | `--dsw-elevation-prominent`；`--dsw-elevation-stroke-color` → `--dsw-alias-border-l1` |
| 文字 | `--dsw-alias-label-primary`、`-secondary`、`-tertiary`、`-caption`、`-dimmed` |
| 已过刻度（反色） | `--dsw-alias-label-primary-inverted` |
| hover / 选中底 | `--dsw-alias-interactive-bg-hover` |
| 强调（档位标签、滑条填充、滑条焦点回退） | `--dsw-alias-state-business-primary` |
| 滑轨轨道底 | `--dsw-specific-selector` |
| 焦点环 | `--dsw-focus-ring-color`（缺省回退 `--dsw-alias-state-business-primary`；滑条聚焦时画在拇指外圈） |
| 错误条 | 底 `--dsw-alias-interactive-bg-hover-danger`，字 `--dsw-alias-state-error-primary` |
| 警告条 | 底 `--dsw-alias-bg-module-platform`，字 `--dsw-alias-state-warn-label` |
| 行内 chevron | `--dsw-alias-menu-icon` |
| 拇指描边 | `--dsw-alias-border-l2`（`0.5px`） |
| 阴影档位 | `--dsw-elevation-soft`（拇指）、`--dsw-elevation-prominent`（菜单） |
| 滚动条 | `--dsh-scrollbar-thumb` → `--dsw-alias-scrollbar-bg-l2`，hover → `--dsw-alias-scrollbar-hover-l2` |
| 窄容器文字开关 | `--dsh-composer-model-text-display`（composer 行写入；插件只读） |
| 圆角 | `--dsw-radius-sm`（chip、强度面板模型行）、`--dsw-radius-md`（列表行、选项、搜索框、错误条）；圆形元素 `999px` |
| 全局圆角形态 | 圆形元素同时写 `corner-shape: round`，抵消 DSH 全局 `superellipse(1.5)`；否则滑条与刻度会被渲染成超椭圆（观感偏方，不是正圆） |

**排版**：不引入字号体系，直接对齐原生——chip `13px/20`、列表行 `13px/18`、
档位标签 `13px/18` weight 500、强度面板模型行 `13px/18`、搜索输入 `12px`、状态行 `12px/18`、
错误条 `11px/16`、强度提示 `11px/16`、重试文字 weight 600。字体族继承宿主，不覆盖。

**材质选择**：`MenuSurface` 默认是半透明毛玻璃。长列表后面就是聊天正文，透出来会读不清，
所以沿用 MCX 的 «opaque dropdown» 选择：把材质层底色改成不透明的 `--dsw-alias-bg-layer-1`、
去掉模糊，保留 `MenuSurface` 自带的描边与阴影。这样仍然是「同一套菜单」，只是不再是玻璃。

## 图标匹配规则

厂商图标只出现在**模型列表行首**。composer chip 不显示品牌图标（窄容器下用原生通用 `IconDataOutlineRegular`，与官方 chip 一致），强度面板的模型行也只显示名称与 chevron。

12 个厂商标记以**内联资产**的形式随 `client.js` 打包（客户端 bundle 只能从平台模块表解析模块，
不能读取包内文件，所以图标只能是内联数据；其中 11 个是 SVG，智谱是 SVG 包 PNG，见本节末）。

- **匹配串**：`<providerId> <model.id> <model.name>` 全部转小写。
- **顺序即优先级**：按下表从上到下，第一个命中的关键字胜出；`BRANDS` 数组的顺序就是优先级。
- **未命中**：sparkles（Lucide）兜底。
- **着色**：外层 `fill="currentColor"`；本身带 `fill` 的品牌图形保留自己的颜色（DeepSeek、
  Gemini、MiniMax、Kimi、MiMo、混元、Qwen、Muse 等），单色图形跟随文字色。
- **尺寸**：chip、强度面板模型行、列表行统一 `16×16`（`viewBox` 按各品牌自带）。

| 序 | 品牌 | 关键字 | 图标键 |
|---|---|---|---|
| 1 | DeepSeek | `deepseek` | `deepseek` |
| 2 | Anthropic | `claude`, `anthropic` | `anthropic` |
| 3 | Gemini | `gemini`, `gemma` | `gemini` |
| 4 | Grok | `grok`, `xai` | `grok` |
| 5 | 小米 MiMo | `mimo`, `xiaomi` | `xiaomimimo` |
| 6 | Kimi | `kimi`, `moonshot` | `kimi` |
| 7 | MiniMax | `minimax` | `minimax` |
| 8 | Qwen | `qwen`, `qwq` | `qwen` |
| 9 | 腾讯混元 | `tencent`, `hunyuan` | `hunyuan` |
| 10 | Meta Muse | `muse`, `muse-spark` | `muse` |
| 11 | 智谱 | `zhipu`, `chatglm`, `glm` | `zhipu` |
| 12 | OpenAI | `openai`, `gpt`, `codex`, `o1`, `o3`, `o4` | `openai` |

注意两点：

1. **不用裸 `hy` 当混元关键字**。MCX 用 `opencode-go/hy3` 这类 backend 名来识别混元，裸 `hy`
   会把 `hyphen-3` 之类的模型名误判成混元；这里只认 `tencent` / `hunyuan`。
2. **智谱图标是「SVG 包一张 PNG」**：上游的 `zhipu.svg` 是 `viewBox="0 0 96 96"` 内嵌
   `data:image/png;base64,…` 的包装层，所以它在 16px 下是位图缩放，不是矢量。这是从上游原样
   带过来的资产，说明见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。

## 键盘与焦点

| 容器 | ↑ / ↓ | ← / → | Home / End | Enter | Esc | Tab |
|---|---|---|---|---|---|---|
| chip | — | — | — | 打开面板（原生 button） | — | 页面正常顺序 |
| 强度面板（焦点默认在模型行） | 不拦截 | 滑条上才生效 | 滑条上才生效 | 模型行 → 列表 | 关闭面板，焦点回 chip | `Shift+Tab` 关闭并把焦点交还页面 |
| 滑条 `role="slider"` | ±1 档 | ±1 档 | 首 / 末档 | — | — | — |
| 列表（有搜索，>4 个模型） | 移动高亮并环绕，焦点留在搜索框 | — | — | 选中高亮项 | 回强度面板，焦点回模型行 | 不拦截 |
| 列表（无搜索） | 在行之间循环移动焦点 | — | — | 选中聚焦行 | 回强度面板，焦点回模型行 | 不拦截 |

- **打开面板的焦点**：强度面板总是把焦点交给模型行（`Enter` 可以直接下钻，`Escape` 直接关）；
  鼠标点击打开时浏览器不会显示 `:focus-visible` 环。
- **进入列表的焦点**：有搜索框时聚焦搜索框（MCX 的行为）；没有搜索框时聚焦当前选中行，
  找不到就聚焦第一行。
- **关闭的焦点**：`closeMenu(true)` / 选中模型后用微任务把焦点还给 chip；`blur` 或点外部关闭
  则不抢焦点。
- **滑条的焦点环画在拇指上**：`.vtmm_rail:focus-visible .vtmm_thumb` 用 2px
  `--dsw-focus-ring-color` 外圈，轨道本身不加阴影，避免切档时焦点环跟着填充宽度抖动。
- **选中后抑制焦点环**：选中提交后 chip 上置 `data-selection-focus`，`:focus-visible` 规则
  对它不生效，下次 `blur` 清除。否则鼠标用户会在 chip 上看到一圈焦点环。
- **IME**：滑条与根容器的键盘处理都先检查 `event.nativeEvent.isComposing`，中文输入法组合
  期间不提交任何动作。
- **列表不自动滚动到选中项**：进入列表时 `scrollTop = 0`（MCX 是先呈现列表顶部）；只有键盘
  高亮时才对高亮项做 `scrollIntoView({ block: 'nearest' })`，避免选中行在入场时滑到吸顶标题
  下面。
- **鼠标动作不抢焦点**：菜单层 `mousedown` 对 `button` 目标 `preventDefault`，列表行
  `mousemove` 只在无搜索模式下聚焦行；搜索框内输入不会被行 focus 打断。

## 已知取舍与限制

1. **关闭是瞬时的，不做退场**。DSH 的 `MenuSurface` 在 macOS 上会在表面后面 portal 一层
   不透明的 `[data-menu-backing]` 垫片（玻璃材质靠它挡住后面的内容）。如果对整层做 opacity
   淡出，会先露出这层不透明底色 → 闪一下。DSH 自己的菜单也是瞬时关闭，所以这里放弃 MCX 的
   「关闭时整层 200ms 淡出」，换来的是一致、不闪的关闭；两段之间的高度回缩与列表 pane 的
   进出（M2/M3/M4）仍然保留。
2. **列表高度按像素上限，不按行数**。MCX 固定「最多 6 行」，这里跟 DSH 原生一致：上限
   `min(360px, 可用高度)`，超出滚动。好处是不用假设行高、搜索过滤时高度自然变化；代价是
   不同字号/缩放下可见行数会变。
3. **父槽位接管导致 `conversation.input.model.label` 子槽位失效**。子槽位只能由声明它的
   registration 渲染（DSH 的 slot 所有权规则），所以官方名称装饰（如 1017 角标）不再出现在
   chip、面板与列表里。要保留只能改走「隐藏官方 seat + 自己放 chip」的 A2 方案，代价是双重
   DOM 与 CSS 契约，本插件不采用。
4. **依赖 0.2.1-rc.5 的内部分与平台基元**：`modelDirectories` 的 store 形状、`MenuSurface` /
   `Input` / `MenuGroup` 的行为、`rankByName` / `observeStickyMenuGroups` 的签名。`package.json`
   已用 `engines.dsh` 限制 `>=0.2.1-rc.5 <0.3.0`，但升级后仍需回归。
5. **subagent 会话不显示选择器**（`available === false` 时返回 `null`），与官方行为一致。
6. **没有 Fast / 重置 / 收藏**，理由见开头。
7. **窄容器文字隐藏依赖 composer 行**：chip 的 label / effort 用
   `display: var(--dsh-composer-model-text-display, block)`，变量由 composer 行的测宽逻辑写入；
   插件不自带测宽，因此窄容器下是否退化成图标 + 省略完全跟随宿主。
8. **reduced-motion 由 CSS 媒体查询处理**，JS 不跑一套并行的动画时钟；高度、pane、滑条、
   强度面板淡出与 chevron 的过渡全部为 0，列表卸载等定时器仍按原时长执行（不可见）。
10. **面板打开时盖住 chip**：底边与 chip 底边齐平是刻意的视觉选择，代价是 chip 不可见也不可点，关闭只能外点、`Escape` 或列表返回后 `Escape`。
9. **`selectionFocus` 只压制 chip 的焦点环**，不改变真实焦点位置；可访问性名称（`aria-label`）
   始终包含当前模型与档位。

## 验证范围

实现完成后在**隔离 profile + 独立 `dsh web` 实例（0.2.1-rc.5）** 上验证：开合、两段切换、
搜索过滤、`Escape` 逐层、滑条键盘提交、模型选择提交、亮/暗主题、`prefers-reduced-motion`，
控制台无错误。**没有**在用户日常使用的桌面端 profile 上逐项实测；桌面端与 `dsh web` 共享
同一客户端 bundle，行为应一致，但验收记录以上述环境为准。
