# 宿主 token 审计：边框档位 / 品牌色 / 错误色 / 静态近黑 / 弹层字号

> 调研对象：DeepSeek Harness **0.2.2-rc.5**（`/Applications/DeepSeek Harness.app/Contents/Resources/app.asar`，mtime `2026-11-18 19:35:40`，210,072,818 bytes）；主题包 `@deepseek-ai/dsh-client-ui-theme@0.2.2-rc.5`。
> 目标：为 `docs/specs/prototype-visual-rules.md` §10「差异与待定」的 6 条待定，提供宿主 token 的**真实取值**与**可复核的对比度数字**。
> 作用范围：只读。不改规范、不改 `src/**`、不改 `plugins/**`。本文只回答"宿主里是什么值、能达到多少对比度"，不替画师拍板视觉取舍。
> 证据约定：解包后的 CSS 用 `文件:行号`；单行 minified bundle 用 `@字节偏移`（与本仓库 `dsh-model-selector.md` 相同约定）。
> 复算基准：浅色卡片面 = `#ffffff`，深色卡片面 = `#2c2c2e`（`--dsw-alias-bg-layer-2`，见 `design-platform.css:182` / `:334`）。对比度按 WCAG 2.x sRGB 相对亮度计算。

解包命令（本次实际使用，只读）：

```bash
# 解析 asar 头部后按前缀导出（脚本见 /tmp/tok/asar.mjs；asar 是简单容器，无需装依赖）
node /tmp/tok/asar.mjs "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar" \
  extract "dsh/node_modules/@deepseek-ai/dsh-client-ui-theme/" /tmp/tok/theme
node /tmp/tok/ext-css.mjs "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar" /tmp/tok/css  # 216 个 CSS
```

---

## 0. 结论摘要

| # | 问题 | 结论 | 关键数字 |
|---|---|---|---|
| 1 | `border-l3` 存不存在 | **存在**。四档齐全（另有 `l2-darkmode-thin`）；宿主**按钮/分段用 l3、输入框用 l4**、分隔用 l2 | l3 浅 `rgba(0,0,0,.12)` = **1.32:1**；深 `rgba(255,255,255,.16)` = **1.67:1** |
| 1b | 能否升到 3:1 | **不能**。四档全部远低于 3:1；要达标需 alpha 41.6%（浅）/34.3%（深），或改用纯色 `bluish-600`（= `label-tertiary`） | l4 = 1.45/1.91；bluish-600 = **3.71/3.76** |
| 2 | accent 与 brand 是否同一套 | **不是**。`brand-primary` 是**单色**（近黑/近白），就是主按钮填充；蓝色是另外两个 token | 品牌蓝浅 `#4176E6` 4.23:1；深 `#5686FE` **4.14:1**（比现用 accent 5.99 更暗） |
| 3 | error 有没有更高档 | **没有**更亮的错误文本档。达标与否取决于**所在的面** | 卡面 4.24:1（✗）／base 面 **5.55:1**（✓）；`red-500` 更差 3.70 |
| 4 | static 近黑是否翻转 | `bluish-1000` **两套同值不翻转**；但"static"不等于"永不变"，其它 static 有被深色覆盖的例子 | 同值 `rgb(15,17,21)`；但 48% 遮罩在深色下几乎无效（对 base 仅 **1.02:1**） |
| 5 | 弹层标题字号 | 宿主 **Modal 标题 = 16/24/500**；15 是"面板标题"档，18 是"页面标题"档 | 15: `ApprovalPanel.module.css:43`；16: `index-*.css@33576`；18: `PluginsSettingsSection.module.css:13` |

---

## 1. 边框四档（`--dsw-alias-border-l1 … l4`）

### 1.1 取值

| token | 浅色 | 深色 | 对卡面对比度（浅/深） |
|---|---|---|---|
| `--dsw-alias-border-l1` | `rgba(0, 0, 0, 0.04)` | `rgba(255, 255, 255, 0.06)` | **1.09:1 / 1.20:1** |
| `--dsw-alias-border-l2-darkmode-thin` | `rgba(0, 0, 0, 0.1)` | `rgba(255, 255, 255, 0.06)` | 1.25:1 / 1.20:1 |
| `--dsw-alias-border-l2` | `rgba(0, 0, 0, 0.1)` | `rgba(255, 255, 255, 0.12)` | **1.25:1 / 1.46:1** |
| `--dsw-alias-border-l3` | `rgba(0, 0, 0, 0.12)` | `rgba(255, 255, 255, 0.16)` | **1.32:1 / 1.67:1** |
| `--dsw-alias-border-l4` | `rgba(0, 0, 0, 0.16)` | `rgba(255, 255, 255, 0.2)` | **1.45:1 / 1.91:1** |

出处：`/tmp/tok/theme/src/styles/design-platform.css:195-199`（浅色 `body{}`）与 `:347-351`（深色 `body[data-ds-dark-theme]{}`）。

> 注意 `l2-darkmode-thin`：名字带 "darkmode"，但**浅色也有声明**（0.1），深色收到 0.06——它是"细分隔线"档，不是深色专属。

### 1.2 各档实际用在哪

| 档位 | 宿主用途（证据，`index-CSAdOBx6.css` = shell bundle） |
|---|---|
| **l4**（最深） | **文本输入框描边**：`._input_181ew_115{height:34px;…;border:.5px solid var(--dsw-alias-border-l4)}`（`@50769`）；胶囊 chip：`FeedbackDialog.module.css:19` |
| **l3** | **按钮默认描边**：`box-shadow: inset 0 0 0 .5px var(--dsh-button-outline-color, l3)`（`@8980`）；分段控件 `border:.5px solid l3`（`@21359`、`@23388`）；表格表头 `th{border-bottom:.5px solid l3}`（`@42739`）；开关轨道底色 `background: l3`（`@26268`） |
| **l2** | **分隔线**：菜单 `.separator{height:.5px;background:l2}`（`@17732`）、菜单组 `border-top:.5px solid l2`（`@14889`）、markdown `hr`（`@41120`）；`--dsh-button-outline-color: l2`（`PlatformOverlay.module.css:95`） |
| **l1**（最浅） | 弹出层 elevation 描边 `--dsw-elevation-stroke-color: l1`（`@11653`）；行内代码边框（`@41623`）、代码块（`@74418`）、文档块（`@74760`） |
| `border-selected` | `var(--dsw-static-neutral-bluish-400)`，两套同值（`design-platform.css:200` / `:352`）→ 对卡面 2.13:1（浅）/ 6.53:1（深） |

宿主全量引用次数（216 个 CSS 合计）：`l2` 125 > `l3` 92 > `l1` 75 > `l4` 53。**档位不是"越深越少用"，而是按角色分工**：l2 管分隔、l3 管按钮/分段、l4 管输入框与 chip、l1 管容器底色块。

**关键事实：宿主自己的控件描边是 `0.5px` 半像素线**，不是 1px（`FeedbackDialog.module.css:19`、`index@23388`）。这解释了为什么 12% 的黑看起来"还行"——线本身只有半像素宽。

### 1.3 3:1 的可行性（WCAG 1.4.11）

- 四档 alpha 上限 16%（浅）/20%（深），合成后分别是 1.45:1 / 1.91:1，**离 3:1 差一个量级**。
- 数值解：浅色白底要 **41.6%** 黑（合成 `rgb(149,149,149)`）；深色卡面要 **34.3%** 白（合成 `rgb(116,116,118)`）。
- 若改用**纯色**档，能过 3:1 的只有：

| 候选 | 浅色 | 深色 |
|---|---|---|
| `bluish-500`（`#979DA6`，= `label-tertiary` 之类的中间档） | 2.73:1 ✗ | 5.10:1 ✓ |
| `bluish-600`（`#81858C`，= **`label-tertiary`**） | **3.71:1 ✓** | **3.76:1 ✓** |
| `bluish-700`（`#61666B`，= `label-secondary`） | 5.80:1 ✓ | 9.25:1 ✓ |

> 结论：**能同时满足两套 3:1 的单一 token 只有 `bluish-600` 及以上**，而它们是文本色（`label-tertiary`），不是边框色。任何"升档到 3:1"的做法都是**语义挪用**，视觉上会明显变重。

---

## 2. `accent` 与 `brand` 不是同一套

| token | 浅色 | 深色 | 实际角色 |
|---|---|---|---|
| `--dsw-alias-brand-primary` | `bluish-1000` `rgb(15,17,21)` | `bluish-50` `rgb(249,250,251)` | **单色**，`--dsw-alias-button-primary-fill` 直接别名到它（`:215` / `:367`）→ 主按钮就是近黑/近白 |
| `--dsw-alias-brand-primary-invert` | 同上 | 同上 | 反向用 |
| `--dsw-alias-brand-text` | `bluish-1000` | `bluish-50` | 品牌文本 = 单色 |
| `--dsw-alias-brand-primary-new-colorprimary-new-color` | `rgb(65, 118, 230)` | `deepseek-450` `rgb(86, 134, 254)` | **唯一的品牌蓝**。主题层只被 `--dsw-specific-sidebar-right-flash` 引用（`:313`）；组件层另有使用：`AccountNotifications`、`DesktopUpdateIndicator`、`TrajectoryCell`、`TrajectoryTable` |
| `--dsw-alias-state-business-primary` | `deepseek-500` `rgb(65,118,230)` | `deepseek-400` `rgb(122,170,255)` | 画师现在叫 "accent" 的那个（焦点环、当前项图标） |

出处：`design-platform.css:201-204`、`:215`、`:277`、`:313`、`:353-356`、`:367`、`:429`。

### 2.1 对比度

| 组合 | 值 |
|---|---|
| accent 浅 `#4176E6` on 白 | **4.23:1**（过 3:1 图形线，不到 4.5 文本线） |
| accent 深 `#7AAAFF` on 卡面 | **5.99:1** |
| brand 蓝 深 `#5686FE` on 卡面 | **4.14:1**（比 accent 暗，margin 更小） |
| 白字 on 品牌蓝 `#4176E6` | **4.23:1**（正文 13px 不达 4.5） |
| 白字 on 品牌蓝 `#5686FE` | **3.37:1**（更差） |
| 主按钮：`#0F1115` 面 + 白字（浅） | 18.90:1 |
| 主按钮：`#F9FAFB` 面 + `#0F1115` 字（深） | 18.08:1 |

**要点**：宿主的主操作**本来就是"品牌色"——只不过它的品牌色是黑白单色**（18.9:1）。想把主操作改成蓝色属于**新增语义**，宿主没有为"蓝色主按钮"准备合规底色：白字 4.23 已不达 4.5。

---

## 3. `--dsw-alias-state-error-primary`

| 主题 | token 链 | 值 | 对卡面 | 对 base 面 |
|---|---|---|---|---|
| 浅 | `static-red-600` | `rgb(236,19,19)` | **4.50:1**（刚好） | 4.50:1 |
| 深 | `static-red-400` | `rgb(242,90,90)` | **4.24:1**（✗） | **5.55:1**（✓） |

出处：`design-platform.css:288`（浅）、`:440`（深）；色板 `:78-85`、`:164-171`。base 面：浅 `#ffffff`、深 `rgb(21,21,23)`（`:177` / `:329`）。

### 3.1 有没有更高档

| 候选 | 深色 on 卡面 | 结论 |
|---|---|---|
| `red-400`（现用） | 4.24:1 | 现状 |
| `red-500` `#EF4444` | **3.70:1** | 更差，不能用 |
| `red-100` `#FEE2E2` | 11.41:1 | 是**底色**档（浅色下仅 1.22:1），不能当深色文本用 |
| `state-error-secondary`（深） | 也是 `red-400` | 与 primary 同值，无升级空间 |

→ **深色下没有"更亮的错误文本"档位**。可选做法只有两条：换面（放到 base 面 → 5.55:1），或改用多通道（`label-primary` 文字 + 红色图标/描边）。

---

## 4. `--dsw-static-neutral-bluish-1000` 是否随主题翻转

- 声明两处，**取值完全相同**：`design-platform.css:57`（浅）与 `:143`（深）都是 `rgb(15, 17, 21)`。→ **不翻转**，遮罩/纯黑语义可依赖它。
- 但 **"static" 只是命名意图，不是保证**：深色块会重新声明部分 static 值，例如
  - `--dsw-static-neutral-bluish-60`：浅 `rgb(245,246,247)`（`:68`）→ 深 `rgb(249,250,251)`（`:154`）
  - `--dsw-static-neutral-bluish-900` 等也逐条重声明（`:75` / `:161`）
  → 结论：**逐个核对**，不要按前缀推断"static 就不会变"。

### 4.1 附带发现：48% 遮罩在深色下几乎无效

`--proto-scrim: color-mix(in srgb, var(--dsw-static-neutral-bluish-1000) 48%, transparent)`（`prototype-visual-rules.md:628`）叠在深色 base `#151517` 上：合成后 `rgb(18,19,22)`，与 `#151517` 的对比 **1.02:1** —— 深色主题下这层遮罩**看不出效果**（叠在卡片面 `#2C2C2E` 上也只有 1.18:1）。
宿主自己的做法是按主题分档：`--dsw-alias-bg-mask-1` 浅 `rgba(0,0,0,.24)`、深 `rgba(0,0,0,.5)`（`:184` / `:336`）。说明"固定 48%"不是宿主的做法。

---

## 5. 弹层标题字号

| 角色 | 字号/行高/字重 | 证据 |
|---|---|---|
| **Modal（弹层）标题** | **16 / 24 / 500** | `index-CSAdOBx6.css@33576`：`._title_1ytzq_79{margin:0;font-size:16px;line-height:24px;font-weight:500;color:var(--dsw-alias-label-primary)}` |
| Modal 描述 | 14 / 22 / 400 | `@34236` |
| Modal 卡片 | `width:min(380px,100%)`，`gap:20px`，`padding:0 0 24px` | `@32829` |
| 面板/卡片标题（15 档） | 15 / 24 / 500 | `ApprovalPanel.module.css:41-45`（`.headline`）；`ShareDialog.module.css:37-39`（`.panelTitle`） |
| 页面标题（18 档） | 18 / **600** | `PluginsSettingsSection.module.css:11-14`（`.heading`）；`SidebarRoot.module.css:299-307`（品牌名 18/24/600/0.04em） |

**结论**：宿主存在三档，不是一档——**弹层 16、面板 15、页面 18**。所以"跟宿主一致"不是一个值，而是"你要对齐哪一档"。

> 补充：`16px` 在 shell bundle 里只出现 2 次（`@1058` 是启动页 wordmark，`@33576` 是 Modal 标题），说明 16 在宿主里**几乎专属于弹层标题**，语义很干净。

---

## 6. 复算校验：画师 §7.2 的数字逐项吻合

用本文从 `app.asar` 读出的 token 值独立复算，与 `prototype-visual-rules.md:717-726` 的实测**逐位一致**（说明两边读的是同一套值、同一套算法）：

| 组合 | 画师实测（浅/深） | 本次复算（浅/深） | 一致性 |
|---|---|---|---|
| label-primary / 卡面 | 18.90 / 13.34 | 18.90 / 13.34 | ✓ |
| label-secondary / 卡面 | 5.80 / 9.25 | 5.80 / 9.25 | ✓ |
| label-tertiary / 卡面 | 3.71 / 6.53 | 3.71 / 6.53（深为 bluish-400 6.53） | ✓ |
| label-caption / 卡面 | 2.13 / 3.76 | 2.13 / 3.76 | ✓ |
| accent / 卡面 | 4.23 / 5.99 | 4.23 / 5.99 | ✓ |
| error-primary / 卡面 | 4.50 / 4.24 | 4.50 / 4.24 | ✓ |
| 结构线（l2）/ 卡面 | 1.25 / 1.46 | 1.25 / 1.46 | ✓ |

---

## 7. 对画师 6 条待定的答复

对应 `docs/specs/prototype-visual-rules.md:868-873`。

### 待定 1｜accent 是否切到 `brand-primary`

- **答复：维持 `state-business-primary`，不要切。** 宿主没有"品牌蓝主色"，`brand-primary` 是**单色**（近黑/近白）。
- 若切到蓝色（`brand-primary-new-color`）：浅 4.23:1 / 深 **4.14:1**，比现用 accent 的深色 5.99:1 **更差**；用于图标/焦点环仍过 3:1，margin 明显变薄。
- 若切到 `brand-primary`（单色）：那是**主按钮填充**的语义，不是 accent 的语义，会把"当前项/焦点"画成黑白。
- **能到多少**：现状 4.23（浅，仅图形）/ 5.99（深）。**维持现状**。

### 待定 2｜控件描边 1.25:1，能否升档

- **答复：`border-l3`、`l4` 都确实存在，可以升，但升不到 3:1。**
- 现状 l2 = 1.25/1.46；**l3 = 1.32/1.67**；**l4 = 1.45/1.91**。
- 按宿主自己的分工，**输入框用 l4、按钮/分段用 l3、分隔用 l2**（见 §1.2）。所以画师现在"控件描边走 l2"比宿主**浅了一到两档**。
- 3:1 需要的不是"下一档"，而是 **alpha 41.6%/34.3%** 或纯色 `bluish-600`（3.71/3.76，= `label-tertiary`，语义挪用且视觉过重）。
- **建议**：把 `field-group` 的控件描边从 `l2` 升到 **`l4`**（对齐宿主输入框），其余结构框维持 `l2`；文中把 1.45/1.91 明写为"低于 3:1，属宿主语言取舍"。同时修正 §96 那句"只有 l2 这一档，没有第三档可调"——**l3、l4 都在**。

### 待定 3｜深色 error 4.24:1

- **答复：数字确认 4.24，但"没救"只成立在卡片面上。**
- 同一 token 放在 base 面（深 `#151517`）是 **5.55:1，达标**。所以先决定错误文本挂在哪个面：弹层若用 layer-2，就给错误行一个 base 面的底，或把弹层整体降到 base 面。
- 深色**没有更亮的 error 文本档**：`red-500` 更差（3.70），`red-100` 是底色不能当字，`error-secondary` 与 primary 同值。
- **建议**：优先换面（5.55）；做不到就维持多通道（红图标 + `label-primary` 文案 + `role="alert"`）。

### 待定 4｜50 个组件里 `label-tertiary` 承载 12px 文本

- **答复：必须改，宿主值不支持。**
- `label-tertiary` 浅 3.71:1 / 深 6.53:1 → 浅色不达 4.5。
- 可用替代：`label-secondary` 浅 5.80 / 深 9.25（唯一同时达标且语义正确的档）。
- **能到多少**：3.71 → 5.80（浅）。**不要维持现状**。

### 待定 5｜`--proto-scrim` 依赖 static 近黑

- **答复：token 本身不翻转（两套同值 `rgb(15,17,21)`），但 48% 这个**比例**在深色下失效。**
- 深色下 48% 近黑叠在 `#151517` 上只有 **1.02:1** 的差（叠在卡面 1.18:1），遮罩等于没有。
- 宿主的分档做法：`bg-mask-1` 浅 0.24 / 深 0.5（`design-platform.css:184` / `:336`）。
- **建议**：`--proto-scrim` 改成引用宿主 `--dsw-alias-bg-mask-1`（两套自动分档），而不是固定 48% 的 `color-mix`；这样"static 不翻转"的风险也就不存在了。

### 待定 6｜弹层标题 15/22 要不要改 18/24

- **答复：都不是最佳。宿主 Modal 标题是 16/24/500，用 16 最对齐。**
- 三档证据：弹层 16/24/500（`index@33576`）、面板 15/24/500（`ApprovalPanel.module.css:43`）、页面 18/600（`PluginsSettingsSection.module.css:13`）。
- 改成 **18** 会让弹层标题与你们自己的 `page` 标题（18/600，`prototype-visual-rules.md:212`）同级，**抢层问题重新出现**；改成 **16/24** 只比现在的 15 大 1px，仍低于页面标题，安全且与宿主一致。
- 字重建议跟宿主 **500**（你们现在若用 600，会显得比宿主更重）。

---

## 8. 未验证 / 需要确认

| 项 | 状态 |
|---|---|
| `--dsh-hairline-width` / `--dsh-button-outline-color` 的**定义处** | **未找到**：在导出的 CSS 里只有引用（`index@26268` 等），未见声明；推测由客户端 JS 在运行时注入，未在 CSS 产物中落地。`[未验证]` |
| Modal 组件的**源码模块** | 未定位到独立 `Modal.module.css`；样式只在 `index-CSAdOBx6.css` 里以 hashed 类（`_title_1ytzq_79`）出现，属 shell 打包产物。引用时以上面的 `@字节偏移` 为准。 |
| 高对比主题（若存在）下的取值 | **未查**：本次只覆盖 `body` 与 `body[data-ds-dark-theme]` 两套。若有 `prefers-contrast` 分支，需另查。 |
| 画师规范里 `--dsl-g-border*` 中间层 | 本轮未追；它看起来是本仓库自己的别名层，指向 `border-l1/l2`。要改映射时需要一并核对。 |

---

## 9. 给码匠 / 画师的最小改动清单

1. `prototype-visual-rules.md:96` 的"只有 `border-l2` 这一档"**改为**：输入框 `l4`（1.45/1.91）、按钮 `l3`（1.32/1.67）、分隔 `l2`（1.25/1.46）、容器块 `l1`（1.09/1.20），均低于 3:1。
2. `:628` 的 `--proto-scrim` **改为** `var(--dsw-alias-bg-mask-1)`。
3. §6.8 弹层标题 **15/22 → 16/24/500**。
4. §10 待定 3 追加一句："同一 token 在 base 面为 5.55:1，达标"。
5. 待定 4 的目标值写死：`label-secondary`（5.80/9.25）。
