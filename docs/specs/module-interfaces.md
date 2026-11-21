# Spec：模块接口契约（Module Interfaces）

> 状态：ready-for-agents
> 日期：2026-11-22
> 读者：全体 Bot（卡尺 / 码匠 / 扳手 / 画师 / 文豪 / 馆员 / 记者）与主 Bot
> 范围：`plugins/vt-gen-ui`（主战场）+ 总集仓库中与它耦合的构建、市场、文档路径
> 上游：`docs/specs/prototype-channel.md`、`docs/specs/prototype-visual-rules.md`、`plugins/vt-gen-ui/AGENTS.md`、`plugins/vt-gen-ui/DESIGN.md`

姊妹文档：`docs/specs/host-contract.md`（扳手维护，宿主半边与工程链的只读盘点与细化）。本文定归属与契约，它定宿主侧细节；两者冲突时以本文 §1 归属为准。

这份文档解决一件事：**在多个 Bot 同时动手之前，先把「谁改哪个文件」和「改了什么别人要跟」写死。** 它不是设计文档，是协作契约。任何与本文冲突的口头约定，以本文为准；本文与代码冲突，先改代码或先改本文，不允许两套并存。

---

## 0. 角色与权限总则

| 角色 | 层 | 可写范围 | 只读范围 |
| --- | --- | --- | --- |
| **卡尺**（契约） | 契约层 | catalog、派生、校验容错、纯规则、契约测试、本文件 | 其余全部 |
| **码匠**（渲染） | 表现层 | `src/client/**` 的组件、样式、渲染入口、导出、i18n 结构 | catalog、guard、spec、宿主半边 |
| **扳手**（宿主） | 宿主层与工程链 | `src/plugin/**`、构建配置、**`lib/**` 的唯一构建与提交权**、仓库级脚本与市场索引 | 契约层、渲染实现 |
| **画师**（设计） | 设计层 | `DESIGN.md`、`docs/specs/prototype-visual-rules.md`、`tools/visual/**`、`docs/visual/**`、`docs/recon/**`、`docs/research/**` | 代码 |
| **文豪**（文案） | 文案层 | `README.md`、`SKILL.md` 的叙述性文字、i18n 词典条目、`src/client/templates.ts` 的模板文案 | 代码逻辑 |
| **馆员**（资料） | 查证 | 无（本机事实只报告，不写入） | 全部 |
| **记者**（外查） | 查证 | 无（外部事实只报告，不写入） | 全部 |
| **小鲸鱼**（主） | 仲裁 | 仲裁、放行 `pnpm build` 与 `git commit`、对外通知 | 全部 |

### 0.1 本轮已拍板的决定（2026-11-22）

| 编号 | 决定 | 落实位置 | 谁执行 |
| --- | --- | --- | --- |
| **A** | `typecheck` 改 `--noEmit`（两个 tsconfig 都改），产物只由 `build` 生成；**唯一构建者是扳手**，`lib/**` 归构建者，各切片提交只带源码 | §1.3、§4.1 | 扳手落脚本；全员遵守 |
| **B** | `modal` 本轮做；切片 4 期间 catalog 条目**由码匠一并落**，卡尺只审不写；切片 4 提交后 catalog 与校验写权立刻归卡尺 | §1.1、§2.1 | 码匠 → 卡尺 |
| **C** | `spec.ts` 与 catalog 合一，本轮只收敛枚举（`DIAGRAM_KINDS`、`ECHART_PRESETS` 等），50 余个 interface 形状不动 | §4.3 | 卡尺（切片 5） |
| **D** | 50 条 fixture 冻结为只读基线；新增类型另立 additive 清单；「50」相关断言不再因新增变红，且要能一眼读出新增了哪些 | §1.1、§2.1、附录 A | 卡尺 |
| **E** | 错误字符串当判定依赖：给错误加稳定 `code`/`kind`，判定读 code 不读文案 | §4.4 | 卡尺（切片 5） |
| **F** | 三档边界散在六个入口：补一条「同一 fixture 走完 救 → 丢 → 降级」的端到端测试 | §4.5、§5.4 | 卡尺 |

> A–F 是协作约束，不是愿望。与本文其他段落冲突时，以本节与对应节的新表述为准。

三条硬则：

1. **文件归属唯一。** 一个文件只有一个「拥有者」可以自由写；其他人要改，走任务卡或消息提需求，不直接改。
2. **契约先行。** 任何 type / 字段 / 别名 / 函数签名 / props 形状的变化，先在本文落契约，再写实现。
3. **越界即停。** 发现自己范围内的正确做法要求改别人的文件，停下来报告，不要顺手改。

---

## 1. 文件所有权表

### 1.1 契约层 —— 卡尺

| 路径 | 内容 | 变更影响面 |
| --- | --- | --- |
| `plugins/vt-gen-ui/src/shared/catalog/model.ts` | catalog 元类型：`ComponentSchema` / `ComponentRecordSchema` / `ComponentFieldKind` / 规则类型 | 全链路（提示词、校验、渲染都吃它） |
| `plugins/vt-gen-ui/src/shared/catalog/definitions.ts` | 枚举域、25+ 常量、58 个 `COMPONENT_SCHEMAS`、`GENUI_SPEC_SCHEMA`、`PROTOTYPE_TYPES` | 提示词 + 校验 + 渲染注册 key 集合 |
| `plugins/vt-gen-ui/src/shared/catalog/docs.ts` | 分类表 `CATALOG_CATEGORIES`、文档表 `CATALOG_DOCS`（summary / promptInline / quickRef / gotcha / usage）、`SCREEN_SPEC_DOC` | 提示词与 skill 的模型可读文本 |
| `plugins/vt-gen-ui/src/shared/catalog/derive.ts` | 派生函数 + 加载期一致性校验 `assertCatalogCoherence()` | 系统提示词、skill 正文 |
| `plugins/vt-gen-ui/src/shared/catalog/index.ts` | 目录出口（`export *` 四项） | 导入路径稳定性 |
| `plugins/vt-gen-ui/src/shared/catalog/catalog.test.ts` | 契约测试：一致性 + 50 型基线 + **新增可选字段台账** | 新增 type / 新增字段的闸门 |
| `plugins/vt-gen-ui/src/client/genui-runtime/schema.ts` | 薄再导出（历史导入路径保持稳定） | 不可删；删了所有 importer 断 |
| `plugins/vt-gen-ui/src/client/genui-runtime/normalize.ts` | 别名归一（字段名、枚举值、结构别名、双层编码 JSON） | 「救」档的实现点 |
| `plugins/vt-gen-ui/src/client/genui-runtime/diagnostics.ts` | `diagnoseUnknownGenuiFields`：未知字段与别名诊断 | 「救」档的可读提示 |
| `plugins/vt-gen-ui/src/client/genui-runtime/limits.ts` | `GENUI_LIMITS` 36 项资源上限 | 校验、渲染、面板折叠三方共用 |
| `plugins/vt-gen-ui/src/client/genui-runtime/value-utils.ts` | `str` / `num` / `int` / `enu` / `obj` / `opt` / `color` / `safeHref` / `safeMediaSrc` | 全部取值与安全过滤 |
| `plugins/vt-gen-ui/src/client/genui-runtime/screens.ts` | 屏幕状态机纯函数（见 §2.4） | 多屏行为；**不含 React** |
| `plugins/vt-gen-ui/src/client/genui-runtime/index.ts` | 仅再导出 `GENUI_LIMITS`（其余模块按文件直接导入） | 导入路径稳定性 |
| `plugins/vt-gen-ui/src/client/spec.ts` | `GenuiNode` 联合类型与各节点接口、`parseGenuiSpec` / `isGenuiSpec` / `wrapSingleComponentRoot` | 渲染层类型来源；与 catalog 平行（风险见 §4.3） |
| `plugins/vt-gen-ui/src/client/guard.ts` | 修复、校验、处理管线、节点计数（2335 行，全链路枢纽） | 宿主工具、回合内自修、围栏降级 |
| `plugins/vt-gen-ui/src/client/parse-partial.ts` | 流式半截 JSON 的候选收集与解析 | 流式渲染 |
| `plugins/vt-gen-ui/src/client/table-details.ts` | 表格详情行可达性规则 | guard + charts 渲染共用 |
| `plugins/vt-gen-ui/src/client/submission-registry.ts` | 表单聚合/交卷规则分析 | guard + 表单控件共用 |
| `plugins/vt-gen-ui/src/client/walk-spec.ts` | spec 遍历规则 | family-cap 计数、详情行、守卫 |
| `plugins/vt-gen-ui/src/client/file-link.ts` | 链接目标分类（安全判定） | guard + 渲染器共用 |
| `plugins/vt-gen-ui/src/shared/fence-language.ts` | 围栏标签识别与归一 | 宿主自修 + 浏览器通道 |
| `plugins/vt-gen-ui/src/shared/fence-repair.ts` | JSON 两级修复（tier-1 修补 / tier-2 补全）与截断工具 | 「降级」档的上游 |
| `plugins/vt-gen-ui/src/shared/fence-resolve.ts` | `resolveFence` / `resolveFenceSpec`：解析 → 守卫 → 坏节点清理 | **宿主与浏览器共用的唯一判定入口** |
| `plugins/vt-gen-ui/src/client/genui-runtime/__fixtures__/component-schemas.json` | 50 型契约基线（required + field kinds） | 契约回归网；只许卡尺按纯加法更新 |
| `plugins/vt-gen-ui/vitest.config.ts` 的测试语义部分 | 测试环境、别名桩、CSS Modules 策略 | 与扳手共有（见 §1.7） |
| `docs/specs/module-interfaces.md` | 本文 | 全员 |

**临时例外（决定 B，仅限切片 4）**：`modal` 的 catalog 条目（`definitions.ts` schema、`docs.ts` doc、`CATALOG_CATEGORIES` 位置、`PROTOTYPE_TYPES`、fixture 条目、`catalog.test.ts` 断言）**由码匠一并落**，卡尺只审不写。切片 4 提交后，本节恢复「catalog 与校验只归卡尺」，码匠不再写这些文件。

> `safe-math.ts` 不在此表：它只被 `PlotBlock.tsx` 消费，是 plot 引擎的实现细节，归码匠。

### 1.2 渲染与视觉 —— 码匠

| 路径 | 内容 |
| --- | --- |
| `plugins/vt-gen-ui/src/client/blocks/*.tsx` `*.module.css` | 50 型的渲染实现、样式、原型组件（`prototype.tsx`）与样式表 |
| `plugins/vt-gen-ui/src/client/blocks/render-node.tsx` | 递归分发器（legacy 50 型 switch + 原型注册表兜底） |
| `plugins/vt-gen-ui/src/client/blocks/prototype-registry.ts` | 原型 type → 渲染组件绑定（**交叉文件**，见 §1.7） |
| `plugins/vt-gen-ui/src/client/screen-navigation.tsx` | 屏幕导航 React Context（只做接线，规则在 `screens.ts`） |
| `plugins/vt-gen-ui/src/client/GenuiBlock.tsx` + `*.module.css` | 块级渲染宿主、状态持久化接线、屏幕接线 |
| `plugins/vt-gen-ui/src/client/fence-render.tsx`、`dom-fence.tsx`、`source-fence.tsx`、`svg-fence.tsx`、`embed.ts` | 渲染通道与入口 |
| `plugins/vt-gen-ui/src/client/index.tsx` | 浏览器半边 `apply`：slots 注册、action 回传、/panel 命令（**交叉**） |
| `plugins/vt-gen-ui/src/client/blocks/diagram/**`、`diagram-*.ts` | 编辑级品牌图渲染 |
| `plugins/vt-gen-ui/src/client/{chart-theme,primitive-adapter,primitive-labels,inline,copy-preview-state}.ts(x)` | 视觉主题与内联富文本 |
| `plugins/vt-gen-ui/src/client/{panel,panel-store,panel-command,toolview}.ts(x)` | 会话面板 dock 与工具视图 |
| `plugins/vt-gen-ui/src/client/artifact/**` + `ExportableGenuiBlock.tsx` | 导出（单文件 HTML / `.genui.json`） |
| `plugins/vt-gen-ui/src/client/standalone/**` | 独立运行时（导出页用） |
| `plugins/vt-gen-ui/src/client/{asset-*,*-lazy,mermaid-safe,echarts-engine,scene3d-core}.ts` | 懒加载引擎与主题 |
| `plugins/vt-gen-ui/src/client/icons/**`、`achievement*`、`gallery.ts`、`templates.ts`（机制部分） | 图标、成就、模板抽屉机制 |
| `plugins/vt-gen-ui/src/client/i18n/{index,runtime}.ts` | i18n 机制 |
| `plugins/vt-gen-ui/src/client/blocks/*.test.tsx` | 渲染侧测试 |

### 1.3 宿主半边与工程链 —— 扳手

| 路径 | 内容 |
| --- | --- |
| `plugins/vt-gen-ui/src/plugin/index.ts` | 系统提示词段 `genui:fence`（内嵌三段派生）、`apply`、资产路由、skill provider |
| `plugins/vt-gen-ui/src/plugin/tool.ts` | `render_ui` / `validate_dsh_ui` 工具定义与 presentation meta |
| `plugins/vt-gen-ui/src/plugin/fence-feedback.ts` | 回合内自修（`agent/turn-stopping` 转向，每回合上限 2 次） |
| `plugins/vt-gen-ui/src/plugin/genui-diagnostic.ts`、`inline-content-diagnostic.ts`、`chart-contract.ts` | 节点级诊断文案、内联内容诊断、图表语义契约 |
| `plugins/vt-gen-ui/src/plugin/node-shims.d.ts`、`src/index.ts` | 宿主入口与类型垫片 |
| `plugins/vt-gen-ui/tsdown.config.ts` | 8 个构建目标：node half `lib/index.js`、client bundle `lib/client.js`、standalone runtime、5 个懒加载资产（pele / three / echarts-core / echarts-full / icons） |
| `plugins/vt-gen-ui/tsconfig.json`、`tsconfig.test.json` | 类型检查范围与声明产物 |
| `plugins/vt-gen-ui/vitest.config.ts` | 测试运行配置（**交叉**） |
| `plugins/vt-gen-ui/package.json` | exports、`dsh` 段、scripts、依赖与 peer |
| `plugins/vt-gen-ui/lib/**` | **构建产物，入库，扳手独占**：`lib/index.js`、`lib/client.js`、`lib/assets/*.js`、`lib/types/**`。只有扳手跑 `build` 并提交产物；其他人只读、不跑 build、不提交产物（决定 A） |
| `plugins/vt-gen-ui/cordis.patch.yml`、`.gitignore`、`LICENSE*`、`THIRD_PARTY_NOTICES.md` | 装载补丁与发布必需文件 |
| 仓库根 `package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml` | workspace 与依赖锁定 |
| `scripts/*.mjs`、`market/**`、`.github/workflows/**` | 市场索引、发行与 CI |

### 1.4 设计与调研 —— 画师（外部资料另见记者）

| 路径 | 归属 |
| --- | --- |
| `plugins/vt-gen-ui/DESIGN.md` | 画师：设计 token 与验收判据 |
| `docs/specs/prototype-visual-rules.md` | 画师：可实现的取值与判据 |
| `plugins/vt-gen-ui/tools/visual/**` | 画师：探针页面与 `shot.sh` 截图脚本 |
| `plugins/vt-gen-ui/docs/visual/**` | 画师：截图基线 |
| `plugins/vt-gen-ui/docs/recon/**`、`docs/CAPABILITY-MAP.md` | 画师：侦察与能力文档（`CAPABILITY-MAP §7` 的三档表由卡尺供数，见 §1.7） |
| `plugins/vt-gen-ui/ICON-NAMES.md` | 画师：图标清单（生成物，见 §4.6） |
| `docs/research/**` | 记者：外部调研报告，只写报告不改代码 |
| `docs/audit/**`、`docs/upstream/**` | 画师：本机能力分析与上游对照，只写报告不改代码 |

### 1.5 文案 —— 文豪

| 路径 | 边界 |
| --- | --- |
| `plugins/vt-gen-ui/README.md`、仓库 `README.md` | 可写全文；涉及字段名/数字时以 catalog 为准 |
| `plugins/vt-gen-ui/SKILL.md` | 只改叙述性文字（**交叉文件**，见 §1.7）；字段表由 catalog 生成，禁止手写 |
| `plugins/vt-gen-ui/src/client/i18n/{zh,en}.ts` | 只改字符串值，不改 key 结构（**交叉**） |
| `plugins/vt-gen-ui/src/client/templates.ts` | 只改模板文案，不改 `id` / 字段结构（**交叉**） |
| 对外说明与公告 | 到主 Bot 处领取 |

### 1.6 仓库级与其他插件

`plugins/` 下其余 12 个插件（`vt-mine-models`、`vt-minedesign`、`vt-quick-chat`、`vt-quote-bar`、`vt-sidebar-sort`、`vt-steer-now`、`vt-system-prompt`、`vt-taskboard`、`vt-uiux-enhancer`、`vt-use-figma`、`vt-web-chat`、`vt-mcx-prompt-preset`）不在本轮并行范围。任何涉及它们的改动先报主 Bot，不自行推进。

`.agents/worktrees/**` 是旧工作树的残留副本，**只读参考**，不作为任何人的编辑目标。

### 1.7 交叉文件清单与仲裁规则

这些文件两个以上角色都需要动，必须指定唯一写权并约定通知方式。

| # | 文件 | 双方 | 写权归属 | 交接方式 |
| --- | --- | --- | --- | --- |
| C1 | `src/client/blocks/prototype-registry.ts` | 卡尺（type 集合、props 形状）／码匠（绑定与实现） | **码匠** | 卡尺改 `PROTOTYPE_TYPES` 或 `PrototypeDispatchProps` 时，先在本文改契约并消息通知码匠；码匠只实现绑定，不改 `Record<PrototypeType, …>` 的 key 集合 |
| C2 | `src/client/genui-runtime/__fixtures__/component-schemas.json` | 卡尺／码匠（渲染假设） | **卡尺** | 只在「新增 type」时追加条目；既有 50 型条目永不修改 |
| C3 | `src/client/guard.ts` | 卡尺（实现）／扳手（工具与自修消费） | **卡尺** | 错误字符串与 `GenuiProcessResult` 字段是隐式契约（§4.4），改前通知扳手 |
| C4 | `src/client/spec.ts` | 卡尺（类型契约）／码匠（渲染引用） | **卡尺** | 新增字段必须同改 catalog schema；码匠只读 |
| C5 | `src/shared/fence-resolve.ts` | 卡尺（判定）／扳手（回合内自修走 `settled` 语义） | **卡尺** | 改 `settled` 或降级含义前必须与扳手对齐 |
| C6 | `src/client/index.tsx` | 码匠（slots 接线）／卡尺（action payload 形状）／扳手（宿主服务） | **码匠** | payload 形状改动由卡尺先定，码匠实现，扳手确认宿主可消费 |
| C7 | `SKILL.md` | 文豪（叙述）／卡尺（字段契约一致性）／扳手（运行时读取） | **文豪**（正文）＋**卡尺**（字段相关段落） | 提交前跑 `pnpm test`，`catalog.test.ts` 会拦住手写字段表 |
| C8 | `src/client/i18n/{zh,en}.ts` | 码匠（key 结构）／文豪（措辞） | **码匠** | 文豪给文案，码匠落 key；新增 key 双方确认 |
| C9 | `src/client/templates.ts` | 码匠（机制）／文豪（文案） | **码匠** | 文豪给文案；`id` 与字段结构不得改 |
| C10 | `vitest.config.ts` + `src/client/__tests__/primitives-stub.tsx` | 扳手（配置）／卡尺（测试可用性） | **扳手** | 测试环境变更需卡尺复跑全部契约测试后才算完成 |
| C11 | `docs/CAPABILITY-MAP.md` §7 | 画师（文档）／卡尺（三档定义与数字） | **画师** | 三档语义与上限数字由卡尺供；画师改文字不改语义 |
| C12 | `package.json` | 扳手（exports/scripts/依赖）／卡尺（无）／文豪（description） | **扳手** | `description` 文案由文豪提，扳手落 |
| C13 | `docs/specs/host-contract.md` | 扳手（宿主半边与工程链盘点）／卡尺（本文的宿主侧引用） | **扳手** | 该文档只写宿主侧事实；本文不复制其表格，只引用其结论，避免两份契约各说各话 |

**仲裁规则（按优先级）**

1. **契约优先于实现。** 交叉文件上「类型、字段名、props 形状、错误字符串、上限数字」的争议，卡尺决定；「怎么画、怎么拆组件、怎么命名 CSS」由码匠决定。
2. **唯一写权。** 同一时刻只有一个 Bot 能写同一个交叉文件。多人同时需要时，先改契约，再由唯一写权者落地；另一方只提需求。
3. **先登记后动手。** 动交叉文件前，在任务卡评论里写明「文件 + 改什么 + 为什么 + 影响谁」；没有评论记录就不算完成。
4. **构建与提交单点。** `pnpm build` 与 `git commit` 同一时间只允许一个 Bot 执行，由主 Bot 放行。`lib/**` 冲突一律以「重新完整构建」解决，不手工合并产物。
5. **跨两条线时拆两步。** 契约一步（可独立通过 typecheck/test），实现一步；不允许一个提交里混两层的改动。

---

## 2. 契约定义

### 2.1 catalog 条目结构

一个组件由**四处**共同定义，缺一处 `assertCatalogCoherence()` 会在模块加载时抛错（不是静默跳过）。

| 组成 | 位置 | 字段 | 说明 |
| --- | --- | --- | --- |
| schema | `definitions.ts` → `COMPONENT_SCHEMAS[type]` | `required` / `fields` / `optional` / `enums` / `aliases` / `valueAliases` / `oneOfRequired` / `conditionalRequired` / `rules` / `nested` / `validator` | 校验与修复的唯一依据；`fields` 是完整字段映射，`required` 的**名称与顺序**是模型协议 |
| 文档 | `docs.ts` → `CATALOG_DOCS[type]` | `category` / `summary`（必填）/ `promptInline` / `quickRef` / `gotcha[]` / `usage` | 模型可读文本；`summary` 进 skill 参考，`promptInline` 进系统提示词清单 |
| 分类位置 | `docs.ts` → `CATALOG_CATEGORIES[].types` | 数组顺序即提示词顺序 | 每个 type 恰好出现一次；分类决定模型读到的分组 |
| 渲染绑定 | `definitions.ts` → `PROTOTYPE_TYPES` + `blocks/prototype-registry.ts` | 仅「不走 legacy switch」的新组件需要 | key 集合归卡尺，绑定归码匠 |

**新增一个组件必须改的清单**（按顺序）：

1. `definitions.ts`：加 `schema({...})` 到 `COMPONENT_SCHEMAS`。
2. `definitions.ts`：若需要专属渲染器且不属于 legacy 50 型，加进 `PROTOTYPE_TYPES`。
3. `docs.ts`：加 `CATALOG_DOCS[type]`，至少写 `category` 与 `summary`。
4. `docs.ts`：把 type 插进对应 `CATALOG_CATEGORIES[].types` 的正确位置（决定提示词顺序）。
5. `__fixtures__/catalog-additions.json`：把新 type 写进 **additive 清单**（结构见下）。**不要动 `component-schemas.json`**——它是 50 条冻结基线（决定 D）。
6. `catalog.test.ts`：**不改**与「50」有关的断言；只需让新增类型被 additive 断言覆盖。
7. 通知码匠：实现渲染 + 绑定注册表；通知扳手：确认提示词段与工具输出无需改。

**切片 4 的临时例外（决定 B）**：`modal` 走完这 7 步的**执行者本轮是码匠**（他已写出 `ModalFrame` 外壳），卡尺承担审阅：核对 schema 的 `required` 与 `fields` 是否与 `modal-behavior.ts`、`modal.test.tsx` 的能力一致，核对 doc 的 `summary` / `quickRef` / `gotcha` 是否与「弹层既无 `trigger` 又非 `open`」的诊断（§5、D2）一致。切片 4 提交后写权归还卡尺。

**additive 清单（决定 D）**

- 文件：`src/client/genui-runtime/__fixtures__/catalog-additions.json`。
- 结构：以 type 名为 key，值给出 `required`、`fields`（字段 → kind）、`since`（版本或切片号）、可选 `note`。
- 断言（两条，替代原来「改 50」的做法）：
  1. catalog 的 type 集合 == 基线 50 条的 key 集合 ∪ additive 的 key 集合；
  2. additive 的每个 key 都在 catalog 里，且其 `required` 与 `fields` 与当前 schema 一致（防止清单与实现脱节）。
- 可读性要求：additive 的 key 就是「新增了哪些」的答案，按 `since` 排序、一条类型一个对象；测试失败时直接打印 additive 的 key 列表，不需要 `git log` 或逐条比对。
- 归属：切片 4 由码匠为 `modal` 落第一条；之后归卡尺。

**已知覆盖缺口（待补，切片 5）**：`catalog.test.ts` 的可选字段台账只遍历基线里的 50 个 legacy type；基线之后新增的类型（`page` / `nav` / `list-row` / `field-group` / `empty` / `loading` / `split`）不参与遍历，因此它们身上的可选字段（例如 `page.label`）**目前没有任何台账覆盖**。在补上之前，这类字段只能靠评审发现；不要为了让测试变绿把 `label` 塞进 `['close','goto']` 的期望里——那会让断言永远红。

**字段级红线**

- 既有 50 型的 `type` 名、`required` 名称与顺序、既有字段的 `kind`：**永不修改**。
- 新字段只能是 **optional**，且必须进 `catalog.test.ts` 的「新增可选字段台账」（当前：`['close','goto']`）。注意这是**字段台账**，与决定 D 的**类型清单** `catalog-additions.json` 是两件事：前者记既有 50 型上新增的字段，后者记新增的 type。
- 别名（`aliases` / `valueAliases`）只允许「新增旧写法 → 新写法」的映射，不允许删除已有别名。

### 2.2 派生输出（五个导出 + 一个类型出口）

全部由 `derive.ts` 从 `definitions.ts` + `docs.ts` 生成，**不允许任何地方手写第二份**。

| 导出 | 形状 | 消费方 | 何时变化 |
| --- | --- | --- | --- |
| `componentListPrompt()` | 5 行字符串，每行 `- <分类>：type1 · type2…`，类型上带 `promptInline` 后缀 | `src/plugin/index.ts` 的 `GENUI_SECTION_TEXT`，注入系统提示词段 `genui:fence` | 增删 type、改分类、改 `promptInline` |
| `fieldQuickRefPrompt()` | 一行：`**字段速查**…` + 仅带 `quickRef` 的组件，形如 `` `type` `{…}` `` | 同上 | 增删 `quickRef` |
| `fieldGotchaPrompt()` | 一段：`**字段名写错 = 该组件被丢弃**（…）：` + 每条 `gotcha` 前缀 type 名 | 同上 | 增删 `gotcha` |
| `prototypeScreensPrompt()` | 一段：多屏原型说明（`screens` / `initial` / `goto` / 返回 / 持久化） | 同上 | 改 `SCREEN_SPEC_DOC.prompt` |
| `catalogReferenceMarkdown()` | 完整组件字段参考（按分类分节，含必填/可选/枚举/用法），带「由 catalog 生成，勿手改」抬头 | `composeSkillContent()` 追加到 `SKILL.md` 正文之后，成为 `genui` skill 内容 | 任何字段变化 |
| `PROTOTYPE_TYPES` / `PrototypeType`（再导出） | 只读字符串数组与联合类型 | `blocks/prototype-registry.ts` | 增删原型渲染器 |

补充：`SCREEN_SPEC_DOC.reference` 进 skill 参考的前置段落；`catalogCategoryOf()` 供诊断与测试用。

### 2.3 校验与容错入口

| 入口 | 签名 | 输入 | 输出 | 角色 |
| --- | --- | --- | --- | --- |
| 归一化 | `normalizeGenuiSpec(value: unknown)` | 原始 spec / 裸组件 / 双层编码字符串 | `{ value: unknown, warnings: GenuiDiagnostic[] }` | 别名与结构归一，不动上限 |
| 修复 | `repairGenuiSpec(value: unknown): GenuiSpec \| null` | 原始值 | 可直接渲染的 canonical spec 或 `null` | 先归一，再按上限裁剪、按字段类型取舍 |
| 校验 | `validateGenuiSpec(value: unknown): GenuiValidation` | 原始值 | `{ ok: boolean, errors: string[] }` | 别名归一后只报真错，不把可修别名当错 |
| 诊断 | `diagnoseUnknownGenuiFields(value: unknown): GenuiDiagnostic[]` | 归一后的值 | `kind: 'alias' \| 'unknown-field' \| 'truncated'` 的诊断数组 | 给模型的可读提示 |
| 管线 | `processGenuiSpec(value: unknown): GenuiProcessResult` | 原始值 | `{ value, normalized, repaired, spec, errors, errorDetails, warnings, declaredCount, renderedCount, declaredNativeCount, renderedNativeCount, renderedTotalCount }` | 归一 → 修复 → 校验 → 账目核对。`errorDetails[].code` 是稳定判定依据（见 §4.4） |
| 坏节点清理 | `partialRepairGenuiSpec(processed): GenuiSpec \| null` | 管线结果 | 剪掉错误指向节点后的 spec，或 `null` | 单次重试，只剪不修 |
| 围栏解析 | `resolveFence(raw: string, { settled: boolean }): FenceResolution` | 围栏正文 | `{ value, processed, spec }` | tier-1 任意时刻、tier-2 仅 `settled` |
| 围栏快捷 | `resolveFenceSpec(raw, options): GenuiSpec \| null` | 同上 | spec 或 `null` | 浏览器与宿主共用 |
| 计数 | `countGenuiNodes(value, cap?)` / `countDeclaredGenuiNodes(value, cap, { familyCaps? })` / `countRenderedNativeGenuiNodes(value)` | 树 | 数字 | 节点预算与账目 |
| 上限 | `GENUI_LIMITS` | — | 36 项常量（节点 200、嵌套 8、屏 12、字符串 2000、表格 50×12…） | 全链路共用 |

**三档判定边界**

| 档 | 判定点（代码位置） | 判定条件 | 用户可见结果 |
| --- | --- | --- | --- |
| **救** | `normalize.ts` 别名命中；`fence-repair.ts` 的 tier-1（引号转义、尾逗号）；`repairGenuiSpec` 的数值夹取 / 字符串截断 / 数组切片 | 改动是**确定性的、可逆语义的**：旧字段名 → 新字段名、越界值 → 边界值 | 正常渲染，可能伴随一条 `warning=` 前缀的诊断 |
| **丢** | `guard.ts` 单节点字段类型不符 / 必填缺失 → 该节点不进入 repaired 树；`partialRepairGenuiSpec` 剪掉 `errors` 指向的节点路径；`processGenuiSpec` 过滤 `': unknown type '` 错误（自定义节点按不透明处理） | 问题**能定位到具体节点**，且其余节点独立可渲染 | 那个组件**静默消失**，同屏其余照常；`declaredNativeCount > renderedNativeCount` 时记一条 `repair dropped N…` |
| **降级** | `resolveFence` 返回 `spec === null`；`fence-render.tsx` 据此保留代码块 | ① 没有可解析值；② 两级 JSON 修复都失败；③ `partialRepairGenuiSpec` 返回 `null`（错误无法定位到节点）；④ 渲染出 0 个节点 | 整块退回代码块（+ 红色诊断条） |
| **截断（不降级）** | `processGenuiSpec` 的 `truncated` 诊断；`isIntentionalBudgetCut` | 超出 `tabs ≤ 12` / `accordion ≤ 24` / 节点预算的**按设计**截断 | 围栏照常渲染，提示「超出上限未渲染，可拆分」 |
| **回合内自修** | `src/plugin/fence-feedback.ts`（宿主侧，非浏览器） | 回合结束时仍有不可渲染围栏；每回合 ≤ 2 次；每围栏正文 ≤ 1 次；子代理不触发 | 模型在同一回合收到节点级诊断并重发 |

三档的**一致性要求**：同一个输入，`processGenuiSpec`、`resolveFence`、`fence-feedback` 必须得到同一个档位判定。它们现在共享 `resolveFence` 这一条路径，任何一方另起判断都算违约。

### 2.4 屏幕状态机纯函数

文件：`src/client/genui-runtime/screens.ts`。**不含 React、不含存储**，只有规则。

| 函数 | 输入 | 输出 | 约定 |
| --- | --- | --- | --- |
| `readScreenModel(spec)` | `Pick<GenuiSpec, 'screens' \| 'initial'> & { items? }` | `ScreenModel \| null` | 无 `screens` 或屏数为 0 → `null`（legacy spec 走原路径，字节不变） |
| `initialScreenState(model, persisted?)` | model + `{ screen?, stack? }` | `ScreenState` | `initial` 只在命名了已声明屏时生效，否则取第一个 key；恢复时过滤不存在的屏、栈截到 20 |
| `screenItems(model, state)` | model + state | `readonly GenuiNode[]` | 当前屏缺失时回落初始屏，再回落空数组 |
| `goToScreen(model, state, target)` | model + state + 目标 id | `ScreenState` | **无效目标或原地跳转一律原样返回**（笔误不能让界面变空） |
| `goBackScreen(state)` | state | `ScreenState` | 栈空时原样返回 |
| `degradedScreenItems(model)` | model | 仅初始屏节点 | 状态机不可用时的降级渲染 |
| `SCREEN_STACK_LIMIT` | — | `20` | 栈深上限 |

边界：屏数 ≤ `GENUI_LIMITS.maxScreens`(12)，屏 id 与 `goto` 长度 ≤ `maxScreenId`(96)。

**分工**：卡尺写这些函数与边界；码匠只做 React 接线（`GenuiBlock.tsx` 的 `useMemo`/`setScreenState`、`screen-navigation.tsx` 的 Context），**不得在渲染层重写规则**。

### 2.5 渲染注册表接口

映射链路：catalog `type` → 渲染组件，分两条路。

| 路径 | 覆盖 | 注册者 | 未注册时的行为 |
| --- | --- | --- | --- |
| legacy switch（`blocks/render-node.tsx`） | 既有 50 型中除原型外的部分 | 码匠 | 编译期无强制；靠 `catalog.test.ts` 的集合一致性兜底 |
| `PROTOTYPE_RENDERERS`（`blocks/prototype-registry.ts`） | `PROTOTYPE_TYPES` 的 7 型 | 码匠 | `Record<PrototypeType, PrototypeRenderer>` 类型穷尽性在 `pnpm typecheck` 时报错 |
| 不透明自定义节点 | 不在 `GENUI_NATIVE_TYPES` 的 type | 宿主/第三方（`registerGenuiComponent`） | 校验与修复原样放行，浏览器侧无渲染器则不显示 |

接口形状（契约，归卡尺）：

```ts
interface PrototypeDispatchProps {
  readonly node: GenuiNode
  readonly path: string
  readonly renderChildren: RenderPrototypeChildren
  readonly depth?: number
}
type PrototypeRenderer = ComponentType<PrototypeDispatchProps>
```

**责任划分**：卡尺定义 key 集合与 props 形状；码匠写绑定与组件实现；未注册的降级由 code（类型系统）保证，不由运行时兜底——这是刻意的，防止「悄悄少画一个组件」。

### 2.6 不可变清单（契约红线）

以下任何一项变化都属于**破坏性变更**，会同时让历史会话、已缓存 skill、模型习惯失效：

1. 围栏标签 `dsh-ui`。
2. 50 个 type 名；`required` 字段名与顺序；既有字段的 `kind`。
3. `action` payload 形状（`[genui-action]` 回传的消息模板）。
4. 持久化键公式（会话 + 位点 + 内容指纹）与屏幕持久化字段 `{ screen, stack }`。
5. 资源上限的**数量级**（节点 200、嵌套 8、屏 12、栈 20、表格 50×12、字符串 2000…）。
6. 三档语义与**判定用的错误字符串前缀**（`spec exceeds `、`repair dropped `、`unknown type `、`details must not contain more entries than rows`）。
7. 别名表只增不减。
8. 既有 50 型的 fixture 基线条目（`component-schemas.json`）与其断言只读；新增类型不得改动它们（决定 D）。

---

## 3. 跨模块改动流程

### 3.1 谁提出、谁实现、谁接线、谁通知

| 环节 | 责任 |
| --- | --- |
| 提出契约变更 | 任何角色都可提，但**落笔只有卡尺**；提法：任务卡评论写「想要的字段/类型/行为 + 为什么 + 影响谁」 |
| 契约落地 | 卡尺更新本文 §2 + `definitions.ts` / `docs.ts` / 派生 + 契约测试 |
| 渲染实现 | 码匠：组件、样式、绑定；不改 catalog |
| 宿主接线 | 扳手：提示词段、工具输出、回合内自修、构建 |
| 文档与探针 | 画师：视觉规则、探针、基线截图；文豪：叙述文字与 README |
| 对外通知 | 主 Bot 统一通知，不各自群发；涉及字段/行为变化时附本文链接 |
| 放行 | 主 Bot 放行合入与 `git commit`；`pnpm build` 由扳手执行（决定 A） |

### 3.2 一个切片要同时动两个模块时的顺序

固定五步，不可乱序：

1. **契约**（卡尺）—— 改本文 + catalog + 派生，跑 `pnpm typecheck`（`--noEmit`）与 `pnpm test`。
2. **冻结** —— 在任务卡里写明「字段名 / props 形状 / 函数签名已定」，此后不再改。
3. **并行实现** —— 码匠做渲染，扳手做宿主接线，画师做探针；三方互不改文件。
4. **合流验证** —— 切片作者跑 `pnpm typecheck && pnpm test`；扳手执行 `pnpm build` 生成 `lib/**`；画师跑 `bash tools/visual/shot.sh` 出基线截图。
5. **提交** —— 一个逻辑变更一个 commit；契约与实现**可以**分开两个 commit，但同一个 commit 内不混两层。

### 3.3 通知写在哪、谁读

- **权威**：本文 §1（谁拥有）与 §2（契约定义）。读它的人：所有 Bot。
- **动态**：任务卡评论（改哪个文件、为什么、影响谁）。主 Bot 与相关 Bot 读。
- **不采用**：私聊约定、口头同意、只写在 commit message 里的变更说明。

### 3.4 何时可以真正并行

只有 §3.2 第 2 步「冻结」之后。冻结前，契约文件只允许卡尺写；码匠可以做**不依赖新字段**的视觉工作（样式、布局、静态组件）；扳手可以做与字段无关的工程链工作（构建、路由、诊断文案）。

---

## 4. 已知的对接风险

### 4.1 `lib/**` 入库，但只有扳手能生成它（决定 A）

`plugins/vt-gen-ui/.gitignore` 明确写着「lib/ 是构建产物，必须入库」；`package.json` 的 `build` 是 `rm -rf lib && tsc && tsdown`——**先删目录再重建**，两个 Bot 同时跑必然互相覆盖。

更隐蔽的一层是：`tsconfig.json` 曾是 `emitDeclarationOnly` + `declarationDir: "lib/types"` 且无 `noEmit`，所以 `pnpm typecheck` 也会写 `.d.ts`。现场证据：源码里新增 `blocks/modal.tsx` 后，`lib/types/client/blocks/modal.d.ts` 与 `modal-behavior.d.ts` 先于源码提交出现。这意味着「只是检查类型」实际上也在产出交付物。

**已定（决定 A）**：

1. `typecheck` 脚本改为 `--noEmit`（`tsconfig.json` 与 `tsconfig.test.json` 都改），由扳手落脚本；卡尺不动 `package.json`。
2. 产物**只由** `build` 生成。**唯一构建者是扳手**，`lib/**` 归构建者所有。
3. 卡尺 / 码匠 / 画师 / 文豪不跑 `pnpm build`，不提交 `lib/**`；切片提交只带源码与文档。
4. 每个切片自己跑 `pnpm typecheck`（不落产物）+ 定向测试；合入时由扳手执行一次完整 `build`，产物与源码进同一个 commit。
5. 产物冲突的唯一解法是扳手重新完整构建；任何人不得手工合并 `lib/**`。
6. 发现 `lib/**` 有未预期改动时，先 `git status` 判定来源，再决定是否请扳手重跑；不要直接还原别人的产物。

**过渡期**：扳手落 `--noEmit` 之前，非构建者验类型请用 `pnpm exec tsc -p tsconfig.json --noEmit`。

### 4.2 CI 不跑插件测试，本地门禁不可省

`.github/workflows/checks.yml` 只做两件事：`scripts/check-client-bundles.mjs`（防止多个 `client.js` 顶层重名）与 `scripts/build-market.mjs` + 索引新鲜度检查。**它不跑 `plugins/vt-gen-ui` 的 `pnpm test`。** 契约测试（`catalog.test.ts`、`validation.test.ts`、`screens.test.ts`）只有本地跑才生效——一旦有人跳过，漂移会直接进 main。

### 4.3 `spec.ts` 与 catalog 是同一件事的两份描述（最容易漂移）

现状：

- `definitions.ts` 有 `DIAGRAM_KINDS`(27)、`ECHART_PRESETS`(14)、各类枚举；
- `spec.ts` 又各写了一份 `DIAGRAM_KINDS` 常量、`EChartPreset` 联合类型、以及 50 余个节点 `interface`；
- 校验吃 catalog，渲染吃 `spec.ts`，两边靠人自觉对齐。

后果：改一处忘一处 → 校验通过但渲染拿到未定义枚举（或反之）。**新增字段、新增枚举值、新增 type 都必须两处同改**，这是当前最容易出错的点。

**本轮处理（决定 C，切片 5，归卡尺）**：先把 `DIAGRAM_KINDS`、`ECHART_PRESETS` 这类**枚举**收敛到 catalog 单一源——`spec.ts` 改为从 catalog 导入或由 catalog 派生对应联合类型，消灭重复常量。50 余个节点 `interface` 的形状本轮**不动**，合并类型源留到后续单独评估。

### 4.4 错误字符串本身就是判定依赖

`isIntentionalBudgetCut` 用 `startsWith('spec exceeds ')` / `startsWith('repair dropped ')` 判断「这是按设计截断」；`errorNodePath` 用固定前缀正则解析节点路径；`partialRepairGenuiSpec` 精确匹配 `details must not contain more entries than rows` 才认作详情行溢出；`processGenuiSpec` 用 `includes(': unknown type ')` 过滤自定义节点。

改动这些文案（包括改中文标点或加空格）会**静默改变**降级与坏节点清理行为，测试不一定覆盖。规则：这四类字符串的修改等同于契约变更，必须同时改判定函数与测试。

**本轮处理（决定 E，切片 5，归卡尺）**：给校验错误与诊断加稳定 `code`。
- **已落地（切片 5）**：`GenuiDiagnostic.code` + 五个原型诊断 code（`unknown-goto-target` / `modal-unreachable` / `nested-modal` / `screen-budget` / `unknown-initial`）；新增诊断判定一律读 code。
- **已落地（决定 F 配套）**：管线错误增加 `GenuiProcessResult.errorDetails[] = { code, message }`，`code` 取 `budget-nodes` / `dropped-nodes` / `unknown-type` / `invalid-schema`；`isIntentionalBudgetCut` 改为读 `code`，不再 `startsWith` 文案。错误文案到 code 的映射收在 `genuiErrorCode()` 一处。
- **未落地**：`errors: string[]` 仍为兼容保留（有外部消费者按字符串展示）；`errorNodePath` 与 `partialRepairGenuiSpec` 的 `details must not contain more entries than rows` 精确匹配仍读文案。**这两处文案的修改仍视同契约变更**。

### 4.5 三档边界分散在六个入口，缺一条端到端契约测试

归一、修复、校验、管线、坏节点清理、围栏解析各自实现一部分档位判定；现有测试集中在 `validation.test.ts`（187 行）与 `screens.test.ts`（111 行），**没有**「同一份 fixture 依次走完 救 → 丢 → 降级 三档」的端到端用例。任何人单独改一个入口，都能让档位语义分叉而不被拦住。

**本轮处理（决定 F，归卡尺）**：**已完成**。`src/client/genui-runtime/tiers.test.ts` 按 §5.4 的三档执行，只断言出口（`errorDetails` 的 code、`isRenderableProcess`、`repaired` 树、`resolveFenceSpec` 的 null），不测内部函数与调用顺序；另加一条反向对照：预算截断（`budget-nodes`）必须**可渲染**，防止「判定读 code」改动后长原型被整体降级。

### 4.6 文档与实现已经不一致（漂移正在发生）

- `docs/specs/prototype-channel.md` 写「8 个新类型」，含 `modal`（确认层/底部面板）；catalog 只有 7 个：`PROTOTYPE_TYPES` = `page / nav / list-row / field-group / empty / loading / split`。截至本文写作时，码匠已在 `src/client/blocks/` 写出 `modal.tsx`（`ModalFrame` 外壳）+ `modal-behavior.ts` + 测试，**但 catalog 侧还没有 `modal` 这个 type**（无 schema、无 doc、无分类位置）。这是「先有渲染、后补契约」的典型顺序，必须在接 node 层之前补完 §2.1 的七步，否则又会出现「渲染器存在但模型写不出来 / 校验不认识」的分叉。
- `ICON-NAMES.md` 声称「由 `scripts/generate-icon-data.mjs` 生成」，该脚本在仓库中不存在（`scripts/` 只有 4 个 `.mjs`），文件无法复现。

### 4.7 宿主半边反向依赖浏览器半边

`src/plugin/tool.ts`、`chart-contract.ts`、`genui-diagnostic.ts` 直接 import `../client/guard.ts`；`shared/fence-resolve.ts` import `client/guard.ts`、`client/parse-partial.ts`。所以 `src/client/` **不是**单纯的前端目录：改 guard 的返回结构会同时影响宿主构建、工具输出与回合内自修。改动前必须通知扳手。

### 4.8 持久化指纹对序列化顺序敏感

块级状态键 = `fenceStateKey(sessionId, sourceId, JSON.stringify(spec))`。任何改变 spec 字段**序列化顺序**或增加默认值的修复行为，都会让所有用户已填的答案与当前屏「看起来像内容变了」而被重置。修 bug 时优先避免改变 repaired 树的键顺序。

---

## 5. 待实现诊断清单

> 状态：**已实现（切片 5，卡尺）。** D1、D2、D4、D5 由本节落地；D3 沿用切片 4 已提交的「丢弃内层」行为，取舍见 §5.3。
> 代码位置：诊断在 `src/client/genui-runtime/diagnostics.ts`（`GenuiDiagnostic.code` 已落地，五个 code 见下表）；修复与账目在 `src/client/guard.ts`；共享判定在 `src/client/genui-runtime/modal-contract.ts`。
> 实现者不得自行升降级别：把「warning」改成「error」等于把可救的输入变成降级，属于契约变更。

### 5.1 共同约定

- **两层分工**：**修复期（repair）**可以改树；**校验期（validate）**只报不改。同一条诊断可以两层都出现，但修复行为只在修复期发生。
- **消息形状**：沿用 `GenuiDiagnostic`（`{ kind, path, message, type?, field?, canonical? }`）。本节每条给出计划中的 `code`；在 `code` 落地前（§4.4、决定 E），先用 `message` 的固定前缀表达，且该前缀同样是隐式契约。
- **path 语法**：与 `errorNodePath` 一致——`items[2]`、`screens.settings.items[0]`、`tabs[0].items[1]`、`details[3][0]`。
- **默认不阻断**：以下五条**没有一条**会把整块围栏降级为代码块。它们的后果只到「删字段 / 丢节点 / 丢屏 / 扁平化」这一级；真正触发降级的仍只有 §2.3 的四个条件。
- **不重复报**：同一节点同一 code 只报一次；被修复期删除的字段不再在校验期报错（校验看到的是 canonical 值）。

### 5.2 五条清单

| # | 诊断 | 触发条件 | 实现层 | 计划 `code` | 消息形状 | 阻断渲染 |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | `goto` 指向不存在的屏 | 已有 `screens`，节点 `goto` 为字符串但不在已声明屏 id 内 | 修复期删字段 + 校验期 warning | `unknown-goto-target` | `items[2].goto: unknown screen 'detail' (declared: home, list, settings)` | 否 |
| D2 | 弹层既无 `trigger` 又非 `open` | `type=modal`，且 `trigger` 缺失或空串，且 `open !== true` | 修复期丢节点 + 校验期 error | `modal-unreachable` | `items[3]: modal needs a non-empty 'trigger' or 'open': true` | 否（丢该节点，其余照常） |
| D3 | 嵌套弹层 | 节点 `type=modal`，且祖先链中已有 `modal`（穿透 `tabs` / `accordion` / `page` / `card` 等容器） | 修复期扁平化为 `card` + 校验期 warning | `nested-modal` | `items[2].items[0]: nested modal flattened to card (modal inside modal)` | 否 |
| D4 | 跨屏预算超限 | ① 屏数 > `maxScreens`(12)；② 全 spec 节点合计 > `maxNodes`(200) | 修复期丢尾部屏 + 校验期 warning（`kind: 'truncated'`） | `screen-budget` | `screens: 14 declared, 12 kept ('settings' onward not rendered)` / `nodes ≥ 201 declared, 200 rendered (screens share one node budget)` | 否（属按设计截断） |
| D5 | `initial` 指向未知屏 | `initial` 为字符串但不在已声明屏 id 内 | 修复期保留现有回退 + 校验期 warning | `unknown-initial` | `initial: unknown screen 'home2', fell back to 'home'` | 否 |

### 5.3 逐条边界

**D1 `goto` 未知屏**
- 修复动作是**删字段不删节点**：按钮本身可能还带 `action`，仍然有用；没有 `action` 时它已经是禁用态，不会变成假按钮。
- legacy spec（无 `screens`）里的 `goto` 一律忽略且**不报**，避免历史会话满屏噪声——`goto` 只在多屏语境下有语义。
- 与 `screens` 内屏 id 比较时先 trim、区分大小写；空串按「未声明」处理。

**D2 弹层不可达**
- 判定必须与 `modal-behavior.ts` 的真实开合模型一致：本轮 `modal` 的支持面是「由 `trigger` 打开」或「`open: true` 静态展开」两种，两者都没有就是死节点。
- 「丢节点」之后若整块节点数归零，走既有降级档（§2.3 第 ④ 条），不是本条自己再发明一个降级。
- 若 `trigger` 指向的按钮不存在，属于另一条诊断（`orphan-trigger`），不在本轮五条内，先记录不实现。

**D3 嵌套弹层**
- **已提交行为是「丢弃内层」**（切片 4，码匠）：`repair` 在 `modalDepth > 0` 时直接丢该节点，`diagnoseNestedModals` 给出 `nested-modal`。本节初稿写的是「扁平化为 `card`」，理由是保留内容；实现先落地为丢弃，本轮**不改行为**（改它会推翻已合并的用例、并让内容取舍重新开放）。两者都不阻断渲染，取哪个属于产品取舍。
- 若要改成扁平化：先改本节、再加一条内容保留的用例，作为独立变更，不在本切片内做。
- 扁平化保留 `title` / `children` / `actions`，去掉开合语义；`actions` 里的按钮回到普通按钮行为。
- 深度按祖先链计，第一个 `modal` 不受影响；只在**第二个及更深**触发。

**D4 跨屏预算超限**
- 与既有节点预算共用口径：`countGenuiNodes` 计的是整棵树，跨屏合计按同一口径，不新开一套计数。
- 丢的是**整屏**（从尾部按声明顺序丢），不是散点丢节点——半屏缺块的界面比少一屏更难解释。
- 若 `initial` 落在被丢的屏上，按 D5 的回退规则处理，且只报 D4 一条（避免同一原因两条消息）。
- 这条**不得**变成 error：它与 `isIntentionalBudgetCut` 的「按设计截断」是同一类，变成 error 会让正常的长原型整块退回代码块。

**D5 `initial` 未知屏**
- 现状差距：`repairCanonicalGenuiSpec` 现在静默丢弃 `initial`，`readScreenModel` 静默回退第一个屏，用户与模型都看不出发生过回退。
- 本条要求的不是改行为（回退保持不变），而是**让回退可见**：校验期给一条 warning，消息里同时给出候选屏 id。
- 屏 id 为空字符串、`initial` 非字符串，走类型错误路径，不由本条处理。

### 5.4 三档端到端 fixture（供 §4.5 与决定 F 使用）

一个 fixture 文件、三段输入，按顺序断言出口：

| 段 | 输入构造 | 期望档位 | 断言什么 |
| --- | --- | --- | --- |
| 救 | 合法 spec，但字段用别名、JSON 带尾逗号 | 救 | `processGenuiSpec().spec` 非 null；`warnings` 含 alias 类诊断；渲染节点数不变 |
| 丢 | 在「救」的结果上再加一个缺必填字段的节点 | 丢 | `renderedNativeCount === declaredNativeCount - 1`；`errors` 含 `repair dropped 1`；其余节点仍在 `spec` 里 |
| 降级 | 根不可解析（截断且 tier-1、tier-2 均失败） | 降级 | `resolveFenceSpec(raw, { settled: true }) === null`；`isRenderableProcess() === false` |

约束：只断言出口（spec / 计数 / 诊断 code / null），不断言内部函数被调用的次数与顺序；fixture 里不复用 `modal` 的用例，保持这条测试与 §5 的诊断解耦。

## 附录 A：新增组件的落地检查单

- [ ] 本文 §2.1 的 7 步全部完成（schema / PROTOTYPE_TYPES / doc / 分类 / **additive 清单** / 测试断言 / 通知）。
- [ ] `component-schemas.json` 未被改动（`git diff` 应为空），新增类型只出现在 `catalog-additions.json`。
- [ ] `pnpm typecheck` 通过（`Record<PrototypeType, …>` 穷尽性、`exactOptionalPropertyTypes`）。
- [ ] `pnpm test` 通过（一致性、基线 50 型、台账、空白）。
- [ ] `catalogReferenceMarkdown()` 输出里能看到新 type 与其必填字段。
- [ ] 码匠已绑定渲染器；未绑定时 `typecheck` 会失败，这是预期。
- [ ] 合入前由扳手跑 `pnpm build` 并提交 `lib/**`；本切片不自行提交产物。
- [ ] 若涉及重新序列化 spec，确认 §4.8 的持久化影响。

## 附录 B：待主 Bot 通知的变更播报模板

```text
[契约变更] <一句话>
- 变了什么：<type / 字段 / 函数签名 / 错误字符串>
- 影响谁：<码匠 / 扳手 / 画师 / 文豪>
- 要跟的活：<具体文件与动作>
- 契约位置：docs/specs/module-interfaces.md §<节号>
- 兼容性：<纯加法 / 破坏性>
```
