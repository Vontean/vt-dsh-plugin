# 对话内 UI 插件的「原型向组件」可复用来源调研

> 调研对象：**面向 `dsh-vt-gen-ui` 的页面级骨架组件（容器/标题栏、导航、列表行、字段组、弹层、空态/加载、双栏）的外部可复用来源**。
> 调研日期：**2026-11-21**。文内所有版本号、包体积、许可证文本均为该日实际抓取到的状态；页面会变，引用时请带上抓取日期。
> 目标：回答三个可执行问题——①**能直接搬哪些代码**、②**只能借哪些规格**、③**哪些必须自己写**；并回答「低保真观感 vs 真产品观感」哪种更适合「讨论锚点」用途。
> 约束（来自需求方，不在本文重新论证）：渲染层是**声明式白名单**（50 个组件、字段固定、无任意 JS 运行时）；样式层是**自研 CSS Modules**，只吃宿主 `--dsw-alias-*` / `--dsw-static-*` token，深浅主题都要成立；**不能引入一个 React 组件库跑起来**。
> 本文不覆盖：对话内渲染通道（iframe / 声明式 fence）的协议选型，那是 [`prototype-channel.md`](./prototype-channel.md)（馆员维护）的范围；本文只在其结论上引用，不重复论证。
> 证据约定：每条结论给 **链接 + 原文片段（英文原样）+ 抓取日期**。`[一手]` = 官方文档 / 仓库 LICENSE / 包注册表元数据 / 组件源码；`[二手]` = 博客、第三方分析站；`[未验证]` = 抓不到或说法冲突。

---

## 0. 结论先行

1. **没有任何视觉组件值得「直接搬源码」（形态 ①）。** 不是许可问题（主流库都是 MIT/Apache-2.0），是**样式载体不兼容**：shadcn、DaisyUI、Flowbite、Mantine、Ant Design 的视觉全部长在 Tailwind class 或 CSS-in-JS 或预设 class 上，搬进「CSS Modules + token 驱动」等于只留下 20–30 行 JSX 骨架，视觉层要全部重写。**收益不在代码，在字段命名与状态语义。**
2. **主参考一：`shadcn/ui` —— 当「规格字典」用，不当代码源用。** 它 2026 年的组件清单（61 个）恰好补上我们的缺口：`field`（label+控件+hint+error）、`item`（头像+主副文本+尾部操作）、`empty`、`skeleton`、`sheet`、`sidebar`、`card`、`breadcrumb`。它的价值是三样东西：**零件解剖命名**、**`data-slot` / `data-invalid` / `data-orientation` 这层状态属性约定**、**表单错误用 `role="alert"`、字段组用 `role="group"`、列表用 `role="list"` 这些无障碍落点**。许可 MIT `[一手]`。
3. **主参考二：`json-render`（Vercel Labs）—— 当「schema / 提示词契约」用。** 它是同类架构（限定组件目录 → 模型产出 JSON → 渲染），但它比我们多做对一件事：**`catalog.prompt()` 从组件定义自动生成系统提示词**，让「字段清单」和「给模型看的说明」只有一份真相。许可 Apache-2.0 `[一手]`。
4. **无障碍原语（Radix / Base UI / React Aria / Ark UI）一个都不要装来当组件层**——我们不是在做应用，白名单渲染里没有任意交互。**唯一值得考虑装依赖的地方是弹层（modal/sheet）的行为**：焦点陷阱、`inert`、滚动锁、`Escape`、`aria-modal`、关闭后归还焦点，自己写约 150 行且容易错。要么用 `@base-ui/react/dialog`（MIT、按子路径 tree-shakable、1.9.0），要么明确写「弹层在原型阶段是静态示意，不做焦点管理」。
5. **保险丝：把付费库彻底排除。** `tldraw` 明确「Not to use the Software in Production Environments」且带 License Key 与水印强制 `[一手]`；`Tailwind Plus`（原 Tailwind UI / Flowbite Pro 同类）明文禁止「Re-distribute the Components … separately from an End Product」以及「Creating a UI library using Tailwind Plus components」`[一手]`；`Flowbite Pro` 同款禁止 `[一手]`。它们连「抄设计规格」都要谨慎，**不能进参考池**。
6. **低保真 vs 高保真的答案不是二选一，而是分层：内容与外观层低保真，排版与节奏层高保真。** 依据：低保真与高保真在**发现问题**上能力等同（Walker 2002）`[一手]`；低保真的真实收益是**降低设计者沉没成本依恋、阻止 stakeholder「看着不错就上线」、让用户更敢说负面**（NN/g 2016）`[一手]`；但低保真会被用户**高估美感**（Sauer 2009）`[一手]`，所以它不能用来评价视觉质量。→ 详见 §8。
7. **必须自己写的清单有 9 项**（§10.2），其中 3 项**没有任何可借对象**：页面容器与标题栏、聊天内导航、双栏布局。

---

## 1. 先定判据：三种复用形态的准入条件

后面每个库都按这三档打分。判据是我按本仓库约束推的，写在这里以便复核。

| 形态 | 准入条件（全部满足才算） | 对本仓库意味着 |
|---|---|---|
| **① 直接搬源码** | 许可证 MIT/Apache-2.0 且无附加条款；**无重运行时依赖**（不引入 Tailwind / CSS-in-JS / 组件库 runtime）；**样式可改为 token 驱动**（视觉不依赖某个 framework 的原子类或预设主题） | 实际门槛是「样式载体」。`className="flex flex-col gap-2"` 这种搬过来没有意义 |
| **② 只借设计规格与语义** | 能拿到「零件划分 + 状态 + 间距/层级 + 无障碍规则」，且不涉及复制受版权保护的视觉资产 | 主要来源：组件源码的**结构**、官方无障碍说明、WAI-ARIA APG |
| **③ 只借字段/API 命名** | 命名能对齐模型提示词与团队沟通，不带来实现负担 | 最便宜、收益最稳的一档 |

> 补充第 4 档（不在三档里，但绕不开）：**加一个依赖**。只有它能把「重活」从我们身上拿掉时才考虑；本次只有一处候选（弹层行为，见 §3.5）。

---

## 2. shadcn/ui

### 2.1 它到底是什么：源码分发，不是 npm 组件库

`[一手]` "This is not a component library. It is how you build your component library." / "**Open Code**: The top layer of your component code is open for modification." / "**Distribution**: A flat-file schema and command-line tool make it easy to distribute components."
— [ui.shadcn.com/docs](https://ui.shadcn.com/docs)（2026-11-21 抓取）

这解释了为什么它的许可模式能成立：**它把代码给你，所以你必须自己承担维护**。对我们来说这意味着「搬过来」不是白拿，是把上游的维护责任接过来。

`registry-item.json` 的字段（`[一手]`，[docs/registry/registry-item-json](https://ui.shadcn.com/docs/registry/registry-item-json)，2026-11-21）：

- `type` 枚举：`registry:base | block | component | font | lib | hook | ui | page | file | style | theme | item`
- `dependencies`（npm）、`registryDependencies`（别的 registry 项）、`files[].path/type/target`
- `target` 支持占位符 `@components/ @ui/ @lib/ @hooks/`，解析到用户 `components.json` 里配置的别名
- `cssVars` / `css` / `peerDependencies` 等

**对我们的用处**：如果以后要给「50 个白名单组件」写可分享的目录（比如让别的 bot 或用户生成新组件），这个 schema 是最省事的参考——尤其是 `type` 枚举和 `target` 占位符两层。**不需要**引入它的 CLI。

### 2.2 2026 年的两个关键时间点（会过期的事实，务必带日期）

| 时间 | 事实 | 证据 |
|---|---|---|
| **2026-07-02** | **Base UI 成为 shadcn/ui 默认底层**；Radix 仍完全支持，不迁移 | `[一手]` "Starting today, **Base UI is the default component library in shadcn/ui**." / "**Radix is not being deprecated.** We still support it…" / "Prefer Radix for new projects? It's one flag away: `npx shadcn init -b radix`" — [changelog 2026-07-base-ui-default.mdx](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/changelog/2026-07-base-ui-default.mdx) |
| **2026-09** | `cn` 从 `lib/utils.ts` 的本地函数变成 npm 包 `cn`；组件改为 `import { cn } from "cn"` | `[一手]` "Every shadcn component now imports `cn` from the `cn` package." — [ui.shadcn.com/docs/changelog](https://ui.shadcn.com/docs/changelog) |
| **2026-10** | 新增 `Trace`、`Code Block`、`AI Elements`；原文写「available for **Base UI, React Aria and Radix** across **all eight styles**」 | 同上 |

> ⚠️ 版本陷阱：网上大量 2024–2025 的 shadcn 代码是 **Tailwind v3 + Radix + 本地 `cn`**。现在仓库里 `dialog.tsx` 已经 `import { Dialog as DialogPrimitive } from "radix-ui"`（单一包，不是 `@radix-ui/react-dialog`）。**抄之前先看 import 行。**

### 2.3 组件清单：61 个，缺口基本都对得上

`[一手]` 取自仓库目录 `apps/v4/registry/new-york-v4/ui/`（[GitHub API](https://api.github.com/repos/shadcn-ui/ui/contents/apps/v4/registry/new-york-v4/ui)，2026-11-21），62 个条目含 `_registry.ts`，即 **61 个组件**：

```
accordion alert-dialog alert aspect-ratio attachment avatar badge breadcrumb bubble
button-group button calendar card carousel chart checkbox collapsible combobox command
context-menu dialog direction drawer dropdown-menu empty field form hover-card
input-group input-otp input item kbd label marker menubar message-scroller message
native-select navigation-menu pagination popover progress radio-group resizable
scroll-area select separator sheet sidebar skeleton slider sonner spinner switch
table tabs textarea toggle-group toggle tooltip
```

对照需求方给的缺口清单：

| 我们的缺口 | shadcn 对应 | 可借什么 |
|---|---|---|
| 页面容器与标题栏 | `card`（有 Header/Title/Description/Content/Footer/Action 解剖） | 只借解剖命名；「页面容器」本身没有 |
| 导航（顶栏/侧栏/底部标签） | `sidebar`、`navigation-menu`、`tabs`、`breadcrumb` | `sidebar` 有折叠/移动端状态规格；**聊天内嵌场景没有对应物** |
| 列表行（头像+主副文本+尾部操作） | **`item`** | ✅ 最直接：完整的零件与变体命名 |
| 字段组（label+控件+hint+error） | **`field`** | ✅ 最直接：完整解剖 + 无障碍落点 |
| 弹层（modal/sheet） | `dialog`、`alert-dialog`、`sheet`、`drawer` | 借 `data-state=open/closed` 与关闭按钮的可访问名 |
| 空态与加载态 | **`empty`**、`skeleton`、`spinner` | 规格极简，借命名与状态 |
| 双栏布局 | `resizable`（分隔条拖动） | **不适用**：我们要的是静态双栏，不是可拖拽 |
| （额外收获） | `kbd`、`marker`、`message`、`message-scroller`、`bubble`、`attachment` | 后四个是 2026 年新增的**对话界面原生组件**，见 §7.4 |

### 2.4 关键源码：`field.tsx` 与 `item.tsx`（形态 ②③ 的具体靶子）

**`field.tsx`**（`[一手]`，[raw](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/field.tsx)，2026-11-21）——零件与各自的无障碍落点：

| 零件 | 语义 | 代码证据 |
|---|---|---|
| `FieldSet` | `<fieldset>` | `<fieldset data-slot="field-set" …>` |
| `FieldLegend` | `<legend>`，`variant: "legend" \| "label"` | `<legend data-slot="field-legend" data-variant={variant}>` |
| `FieldGroup` | 容器查询上下文 | `"group/field-group @container/field-group flex w-full flex-col gap-7"` |
| `Field` | **`role="group"`** + `data-invalid` + `data-orientation` | `<div role="group" data-slot="field" data-orientation={orientation} …>` |
| `FieldContent` | 文本列 | `"group/field-content flex flex-1 flex-col gap-1.5 leading-snug"` |
| `FieldLabel` / `FieldTitle` | 标签 | `data-slot="field-label"` |
| `FieldDescription` | **hint 文本**（`<p>`） | `<p data-slot="field-description" …>` |
| `FieldError` | **`role="alert"`**，支持 `errors[]` 去重、多条转 `<ul>` | `<div role="alert" data-slot="field-error" …>` |
| `FieldSeparator` | 带文字的分隔 | `data-content={!!children}` |

`Field` 的三种 `orientation`（`vertical` / `horizontal` / `responsive`）用 `has-[>…]` 选择器处理「内容区在上、控件在下」和「`checkbox`/`radio` 需要 `mt-px` 微调」——**这是纯布局规格，可以完整照搬成 CSS Modules 的 `:has()` + 容器查询**，不需要任何 Tailwind。

**`item.tsx`**（`[一手]`，[raw](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/item.tsx)，2026-11-21）：

- `ItemGroup` → `<div role="list">`
- 零件：`Item`、`ItemMedia`、`ItemContent`、`ItemTitle`、`ItemDescription`、`ItemActions`、`ItemHeader`、`ItemFooter`、`ItemSeparator`
- `Item` 变体：`variant: default | outline | muted`，`size: default | sm`，`asChild` 时用 `Slot.Root` 换标签
- `ItemMedia` 变体：`default | icon | image`（`icon` = `size-8 rounded-sm border bg-muted`，`image` = `size-10 overflow-hidden rounded-sm`）
- 有一处细节值得抄：`ItemDescription` 存在时把媒体区顶部对齐 —— `group-has-[[data-slot=item-description]]/item:translate-y-0.5 … :self-start`。这是「副文本存在 → 头像与标题对齐而非与整行居中」的真实规格。

**结论：`field` 与 `item` 是本次调研里性价比最高的两个对象。** 借到的是零件表 + 状态属性 + 无障碍落点，丢掉的是 Tailwind class。

### 2.5 形态判定

| 档 | 判定 | 理由 |
|---|---|---|
| ① 直接搬源码 | ❌ | `dialog.tsx` 依赖 `radix-ui`、`cn`、`lucide-react`、`Button`；`field.tsx` 依赖 `class-variance-authority` + `cn` + `Label` + `Separator`。全部视觉得靠 Tailwind class，搬进 CSS Modules 等于重写 `.module.css`，只留下结构 |
| ② 借规格 | ✅✅ | 零件解剖、`data-*` 状态属性、orientation 布局规则、`role` 落点 |
| ③ 借命名 | ✅✅ | `Field`/`FieldLabel`/`FieldDescription`/`FieldError`/`Item`/`ItemMedia`/`ItemActions` 这套名字可以同时用于「JSON 字段名」和「提示词里的组件说明」 |

**适配成本（实测量级）**：`field` 约 10 个零件、上游 ~220 行（含空行）→ 我们改写为 CSS Modules 约 180 行组件 + 120 行 CSS。`item` 约 11 个零件、上游 ~200 行 → 约 150 行 + 100 行 CSS。**两天以内可完成，且不需要任何新依赖。**

---

## 3. 无障碍原语：Radix / Base UI / React Aria / Ark UI

### 3.1 许可与体积（`[一手]`，全部核到 LICENSE 或 npm 元数据）

| 库 | 许可 | 证据 | 包与依赖 |
|---|---|---|---|
| **Radix Primitives** | **MIT** | `[一手]` "MIT License / Copyright (c) 2022 WorkOS" — [raw LICENSE](https://raw.githubusercontent.com/radix-ui/primitives/main/LICENSE)（2026-11-21） | 推荐装单一包 `radix-ui`（[docs](https://www.radix-ui.com/primitives/docs/overview/introduction)："We recommend installing the `radix-ui` package… The package is tree-shakeable"） |
| **Base UI** | **MIT** | `[一手]` npm `@base-ui/react@1.9.0`：`"license":"MIT"`，`"sideEffects":false`，子路径导出 `./dialog` `./field` `./progress` 等 | 依赖仅 `@base-ui/utils`、`@floating-ui/react-dom`、`@floating-ui/utils`、`use-sync-external-store`；`unpackedSize` 10,377,319（≈10.4 MB，含全部组件与类型） |
| **React Aria / react-aria-components** | **Apache-2.0** | `[一手]` `react-aria-components` 的 `package.json`：`"license": "Apache-2.0"`（v1.22.1）— [raw](https://raw.githubusercontent.com/adobe/react-spectrum/main/packages/react-aria-components/package.json) | Adobe 维护；注意 1.17 起「90% fewer dependencies」 |
| **Ark UI** | **MIT** | `[一手]` "This project is licensed under the terms of the [MIT license]" — [ark-ui.com/docs/overview/about](https://ark-ui.com/docs/overview/about)（2026-11-21） | 基于 `@zag-js` 状态机；Chakra 3 内部就是它（`@chakra-ui/react@3.38.0` 精确依赖 `@ark-ui/react: 5.40.0`） |

### 3.2 它们各自「多做了什么」

- **Radix**：`[一手]` "Components adhere to the WAI-ARIA design patterns where possible. We handle many of the difficult implementation details related to accessibility, including aria and role attributes, focus management, and keyboard navigation." — 同 §3.1 链接。
- **Base UI**：shadcn 的现行底座，且文档明确「styling 可以是 Tailwind、CSS Modules、CSS-in-JS 或任何方案」（`[一手]` [base-ui.com/react/overview/quick-start](https://base-ui.com/react/overview/quick-start)：*"since Base UI is unstyled, you can use CSS-in-JS, plain CSS, or any other styling solution you prefer"*）。
- **React Aria**：定位最偏「行为层」，`react-aria-components` 是带结构的样式化层。
- **Ark UI**：**每组件一台有限状态机**，`[一手]` "At its core, most components are designed as finite state machines that interact solely with the DOM." → 好处是状态可穷举，坏处是抽象层比我们用得到的深。

### 3.3 结论：不要装来当组件层

我们的渲染是「白名单 JSON → 静态 React 树」，不存在任意交互。真正需要行为保证的只有三处：**弹层的焦点管理**、**表单控件的原生语义**、**Tab/手风琴的键位**。前两处用原生元素 + 少量 ARIA 就够（见 §2.4 的 `role` 落点）；第三处在原型阶段可以只做视觉切换。

**代价对比**：装 `@base-ui/react` 只为 `dialog` → 只 import `@base-ui/react/dialog`，tree-shaking 后实际进包的是 dialog + 定位工具，量级可控；自写 → 约 150 行，难点是 `inert` 兼容、滚动锁在滚动容器嵌套时的处理、关闭后焦点归还。

### 3.4 一个容易忽略的负面结论

**无障碍原语不解决「声明式白名单」的任何问题。** 它们解决的是「交互逻辑与 a11y 的正确性」，而我们的瓶颈是「50 个组件的字段设计 + 提示词契约 + 深浅主题 token」。上一个原语库不会让模型少写错一个字段。**所以它们的价值在文档（怎么划分零件、状态怎么命名），不在依赖。**

### 3.5 唯一值得考虑装依赖的地方

| 方案 | 成本 | 风险 |
|---|---|---|
| A. 装 `@base-ui/react/dialog` + `/drawer` | 一个 MIT 依赖，子路径导入 | 与我们「无重运行时依赖」的自律冲突；但 dialog 是唯一真正难自写的行为 |
| B. 自写 `useDialogBehavior`（焦点陷阱 + `inert` + Escape + 焦点归还 + `aria-modal`） | ~150 行 + 测试 | 容易漏：嵌套弹层、`inert` 在 Safari 的历史问题、关闭后焦点目标已被卸载 |
| C. 原型阶段不做焦点管理，明说「弹层是静态示意」 | 0 | 无障碍不达标；若这块要进生产必须先还债 |

**建议**：先按 C 上线原型能力（写进组件说明「弹层不做焦点管理」），等真的有用户用弹层讨论需求时再按 B 还债。**不要为了一个 3 秒的示意图引入依赖。**

---

## 4. 成型企业级：Ant Design / MUI / Mantine / Chakra

### 4.1 元数据（`[一手]`，npm registry `/latest`，2026-11-21 抓取）

| 库 | 版本 | 许可 | unpackedSize | 关键运行时依赖 | 样式机制 |
|---|---|---|---|---|---|
| `antd` | **6.7.1** | MIT | **49,469,790**（≈49.5 MB） | ~40 个 `@rc-component/*`、`@ant-design/cssinjs`、`dayjs` | **运行时 CSS-in-JS**（`@ant-design/cssinjs`） |
| `@mui/material` | **9.5.0** | MIT | 8,503,169（≈8.5 MB） | `@mui/system`、`@popperjs/core`、`react-transition-group`、`prop-types` | **Emotion**（peer `@emotion/react` + `@emotion/styled`） |
| `@mantine/core` | **9.8.2** | MIT | 10,742,063（≈10.7 MB） | `clsx`、`type-fest`、`@floating-ui/react`、`react-number-format`、`react-remove-scroll` | **编译期 CSS Modules**（`./styles.css` 显式导出） |
| `@chakra-ui/react` | **3.38.0** | MIT | 2,825,049（≈2.8 MB） | `@ark-ui/react@5.40.0`（精确锁定）、`@emotion/{utils,serialize,is-prop-valid}`、`@pandacss/is-valid-prop` | **Emotion**（peer `@emotion/react`）+ Panda 的 token 校验 |

`antd` 自己也声明了体积预算：`"size-limit": [{"path":"./dist/antd.min.js","limit":"449 KiB","gzip":true}]`（同一次抓取）。

### 4.2 解读：哪一条路线和我们的栈同构

- **Ant Design**：能力最全、中文生态最好，但 **49.5 MB 源码 / 40+ 个 rc 组件 / 运行时 cssinjs**。它的价值是「企业级表格、表单、树」的**交互规格**，不是代码。`Dayjs` 还会带进日期处理依赖。→ 形态 ②，且**只在做「密集数据表」时才值得翻它的文档**。
- **MUI**：Emotion 运行时 + popper。Material 视觉语言和我们的「宿主正文延伸」基调冲突（`DESIGN.md` 三条铁律：装饰密度低于正文）。→ 形态 ②（借 `Skeleton`、`Dialog` 的状态机），视觉不借。
- **Mantine**：**唯一与我们同构的路线**——编译期产出的 CSS Modules（`exports` 里直接给 `./styles.css`、`./styles.layer.css`），无 CSS-in-JS 运行时，依赖表干净（`@floating-ui/react` + `react-remove-scroll`，这俩正好是弹层定位与滚动锁）。它的 **AppShell / Grid / Container / Stack / Group** 是「页面级骨架」里最成熟的一套规格。→ **形态 ②，可作为布局规格的第二参考。**
- **Chakra**：`2.8 MB` 但依赖 `@ark-ui/react` **精确版**（`5.40.0`），意味着 Chakra 的 a11y 行为全部转包给 Ark。它的 `anatomy` 导出（`./anatomy`）是很好的「零件命名」来源。→ 形态 ③。

> ⚠️ 注意 `@mantine/core` 的 peer 是 `react: ^19.2.0`，而本插件 `package.json` 的 peer 是 `react: ^18.0.0 || ^19.0.0`、devDep 是 `react 18.3.1`。**如果要装 Mantine 会撞 React 版本**——但按结论我们只借规格，不装。

### 4.3 「可裁剪程度」排序（对我们是关键指标）

1. **Mantine**：编译期 CSS，按组件 import，可裁剪度最高。
2. **Base UI / Radix**：按子路径/单包 import，tree-shakable，无样式负担。
3. **Chakra / MUI**：Emotion 运行时无法按组件裁掉，只能整体接受 CSS-in-JS。
4. **Ant Design**：cssinjs + 40 个 rc 包，裁剪成本最高（社区做法是 `babel-plugin-import`，但它仍要 runtime）。

---

## 5. 轻量 CSS 路线：DaisyUI / Flowbite / Preline / Tailwind UI

这一档的许可差异最大，逐条落实。

### 5.1 许可核查表

| 库 | 许可 | 原文 / 证据 | 能否进参考池 |
|---|---|---|---|
| **DaisyUI** | **MIT**（干净） | `[一手]` "MIT License / Copyright (c) 2020 Pouya Saadeghi" — [raw LICENSE](https://raw.githubusercontent.com/saadeghi/daisyui/master/LICENSE)（2026-11-21） | ✅ 可 |
| **Flowbite**（开源库） | **MIT** | `[一手]` "The open-source Flowbite Library found on GitHub and all of its components are licensed under the MIT License…" / "Copyright (c) 2023 Bergside Inc." — [flowbite.com/license](https://flowbite.com/license/)（2026-11-21） | ✅ 可 |
| **Flowbite Pro** | **付费 EULA** | `[一手]` "No Standalone Distribution: Don't distribute the download files or anything based on them as separate items." / "No Building Tools for Others" — 同上 | ❌ 禁止 |
| **Preline UI** | **MIT + Fair Use 附加条款（双许可）** | `[一手]` "released under dual license terms 'MIT' and 'Preline UI Fair Use License'"；附加条款含 "The Software shall not be used to create any product or service that directly competes with Preline UI"、"Redistributions must include this Fair Use License in addition to the MIT License" — [raw LICENSE](https://raw.githubusercontent.com/htmlstreamofficial/preline/master/LICENSE)（2026-11-21） | ⚠️ 有条件：不是纯 MIT，"fair use" 与"竞品"判据模糊 |
| **Tailwind Plus**（原 Tailwind UI / Catalyst / Elements） | **商业许可** | `[一手]` "A commercial license is required to use Tailwind Plus Elements."；禁止项含 "Re-distribute the Components, Templates, Libraries, or derivatives of them separately from an End Product, neither in code or as design assets."、"Creating a UI library using Tailwind Plus components… and making it available either for sale or for free."、"Creating a Figma or Sketch UI kit based on the Tailwind Plus component designs." — [npm LICENSE.md](https://cdn.jsdelivr.net/npm/@tailwindplus/elements@1.0.22/LICENSE.md)（2026-11-21） | ❌ 禁止（连设计规格都不行） |

> 许可页 `tailwindcss.com/plus/license` 本身要登录（2026-11-21 抓取只回到登录页），所以上表用**随包分发的 `LICENSE.md`** 作为一手证据 —— 它和官网许可同源，且是用户实际收到的那份。

### 5.2 关键判断：这一档对我们几乎无用

三个理由：

1. **它们全是 Tailwind 的延伸**。DaisyUI 是 Tailwind plugin、Flowbite/Preline 是 Tailwind 组件类集合、Tailwind Plus 是 Tailwind 模板。我们没有 Tailwind，**搬 class 名等于搬了一门我们不会用的语言**。
2. **唯一的可用产出是「语义 class 命名」**（`btn`、`card`、`alert`、`drawer`）——但我们已经有 CSS Modules 的局部类名，再加一层 BEM 式语义名是重复。
3. **风险不对称**：Preline 的 Fair Use 条款、Tailwind Plus 的绝对禁止，都可能被误判为「反正只是抄结构」。**一旦有人把 Tailwind Plus 的某个 layout 直接翻译成我们的组件，就踩线了。**

**结论：形态 ③（借命名）局部可用；形态 ① 和 ② 都不做，且把 Tailwind Plus / Flowbite Pro / Untitled UI 一类明确列入「不可参考」名单。**

---

## 6. 线框 / 低保真专门：Wired Elements / Rough.js / Excalidraw / tldraw

### 6.1 许可与形态（`[一手]`，npm 元数据 + LICENSE）

| 对象 | 许可 | 技术栈与依赖 | 我们的可用形态 |
|---|---|---|---|
| **Rough.js** | **MIT** | `roughjs@4.6.6`，依赖 `hachure-fill`、`points-on-path`、`points-on-curve`、`path-data-parser`（**全部 4 个小包，无框架**）。`unpackedSize` 169,684 | ① 仅限「生成手绘 SVG/Canvas 图形」，**不能给 CSS 组件描边** |
| **Wired Elements** | **MIT** | `wired-elements@3.0.0-rc.6`，依赖 `lit@^2.0.0-rc.1` + `roughjs@^4.3.1` | ❌ 不可搬：**Web Components（lit）**、且仍在 `rc` |
| **Excalidraw** | **MIT** | `[一手]` "MIT License / Copyright (c) 2020 Excalidraw" — [raw LICENSE](https://raw.githubusercontent.com/excalidraw/excalidraw/master/LICENSE) | ② 只借「低保真画布观感」的规格 |
| **tldraw** | **专有许可，禁止生产** | `[一手]` "**Not to use the Software in Production Environments.**" / "Not to disable, change, or interfere with the Software's License Key enforcement." / "To include a verbatim copy of this License in any distribution" — [raw LICENSE.md](https://raw.githubusercontent.com/tldraw/tldraw/main/LICENSE.md)（2026-11-21） | ❌ 排除（连「借鉴观感」也要避开，因为它是商业产品的核心视觉资产） |

### 6.2 Wired Elements 的两个硬伤（值得单独说）

1. **仍是 RC**：最新 npm 版本是 `3.0.0-rc.6`。按该版本的发布记录时间戳（`_npmOperationalInternal.tmp` 内的 epoch `1619299211756`）换算约 **2021-04-24**。也就是说「手绘风 Web Components 的旗舰项目」停在 RC 已 4 年多。
2. **Web Components + lit**：我们是 React 18 + CSS Modules。要用它得处理 custom element 与 React 19 的事件绑定差异、lit 的运行时、Shadow DOM 里的 token 穿透（宿主 `--dsw-alias-*` 在 shadow root 里能否继承需要实测）。

**结论：Wired Elements 不能作为代码来源。** 它能给的是「手绘风组件长什么样」的一批样本。

### 6.3 Rough.js 的真实定位

它画的是路径（`canvas` / `svg`），产出的是**图形**而不是**样式**。对我们的意义只有两个：

- 如果要做「线框示意图」类组件（比如让模型输出一个手绘风流程图），`roughjs` 是现成的、MIT、无框架依赖、4 个小依赖。
- 如果只是想让**容器/卡片**看起来像手绘（虚线边框、不规则圆角），**CSS 就够了**：`border-style: dashed`、`border-radius: 255px 15px 225px 15px/15px 225px 15px 255px`（业界常见的手绘圆角写法），不需要任何 JS。

→ **① 只在「图形」场景成立；② 在「容器描边」场景成立，且用 CSS 实现比引库更省。**

---

## 7. 聊天内生成 UI 的既有方案

### 7.1 Claude Artifacts 的 Tailwind CDN 做法（引用，不重复调研）

馆员的 [`prototype-channel.md`](./prototype-channel.md) 已把 CSP 白名单查清，这里只引用其结论（同一日期 2026-11-21）：

> `[二手]` "the viewer's CSP loads external scripts only from https://cdnjs.cloudflare.com (preferred), https://cdn.jsdelivr.net/npm/, https://unpkg.com, https://cdn.tailwindcss.com … and https://code.jquery.com, and external stylesheets only from https://fonts.googleapis.com …"
> —— 引自该文 §1.2，原始出处在逆向系统提示（二手）。

**对我们的意义**：Claude 允许模型「现写 HTML + 引 Tailwind CDN」，是因为它有 iframe + CSP 这两层隔离。**我们在声明式白名单里没有 iframe，也就不需要为「模型能引什么 CDN」设计任何策略**——这反过来是白名单方案的一个隐性优势：少一整类安全问题。

### 7.2 MCP Apps / mcp-ui 的组件约定

`[一手]` `mcp-ui`（`idosal/mcp-ui`）是 **Apache-2.0**（"Apache License 2.0 © The MCP-UI Authors"，[LICENSE](https://raw.githubusercontent.com/idosal/mcp-ui/main/LICENSE)），且 README 明确它是 **MCP Apps 标准的实现**："The `@mcp-ui/*` packages implement the MCP Apps standard. `@mcp-ui/client` is the recommended SDK for MCP Apps Hosts."

关键事实 —— **它没有组件级约定，只有 HTML/remote-dom 两种资源**：

- 资源 `mimeType` 是 `text/html;profile=mcp-app`，渲染方式是 `<iframe>`："Rendered using the internal `<HTMLResourceRenderer />` component, which displays content inside an `<iframe>`."
- 它的 Roadmap 里**仍未完成**的两项：「Add **declarative UI content type**」、「Support **generative UI?**」

**结论：截至 2026-11-21，MCP 生态里「声明式组件白名单」还不是标准。** 我们的 50 组件白名单不是在抄谁，是在填一个生态空白；**反过来说，也没有现成的字段规范可以直接对齐**（§10.2 第 8、9 项因此在「必须自己写」里）。

### 7.3 json-render（Vercel Labs）：架构同源，最值得借

`[一手]` **Apache-2.0**（"Copyright 2025 Vercel Inc."，[LICENSE](https://raw.githubusercontent.com/vercel-labs/json-render/main/LICENSE)）。README 自述：

> "**Guardrailed** - AI can only use components in your catalog" / "**Predictable** - JSON output matches your schema, every time"

它的三段式：

| 概念 | 作用 | 原文 |
|---|---|---|
| **Schema** | JSON 结构长什么样 | "The schema is the grammar; the catalog is the vocabulary." |
| **Catalog** | 有哪些组件、每个组件的 props 类型（zod） | `defineCatalog(schema, { components: { Card: { props: z.object({...}), description } } })` |
| **Renderer** | 把 spec 渲染成组件树 | `defineRegistry(catalog, { components })` + `<Renderer spec registry />` |

**两个最能直接用的设计**：

1. **`catalog.prompt()`** —— 从组件定义**自动生成系统提示词**：
   `[一手]` "```ts\nconst systemPrompt = catalog.prompt();\n// Includes component descriptions, props schemas, available actions\n```"
   这解决了我们最大的维护痛点：`SKILL.md` 里的组件说明与渲染器里的字段定义**是两份人手维护的真相**。
2. **扁平元素表**（`root` + `elements` map，元素之间用 key 引用）而不是嵌套树：
   ```json
   { "root": "card-1", "elements": { "card-1": { "type": "Card", "props": {...}, "children": ["text-1"] } } }
   ```
   好处：流式追加时只需追加一个 map entry，不用改动祖先节点；引用关系可校验（`children` 指向不存在的 key 立即报错）。

它还有几个我们**不该抄**的东西（会与「无任意 JS 运行时」冲突）：`$state` / `$cond` / `$template` / `$computed` 数据绑定表达式、`watch` 状态监听、`actions` + 内置 `setState`。这些是「有状态应用」的能力，我们是「一次性回答里的静态块」，抄过来就是引入一个表达式求值器。

### 7.4 一个必须知道的新事实：shadcn 已经有对话原生组件了

`[一手]` 2026-10 changelog + 仓库清单显示新增：`message`、`message-scroller`、`bubble`、`trace`、`attachment`、`marker`、`questionnaire`、`spinner`、`empty`。

原文对 `Trace` 的描述值得抄思路：

> "Reasoning, tool calls, sources, plans and subagent runs all have the same shape: **something the agent did, and what happened.** In Trace, each one is a line with an icon, a title, and an optional description and status."
> — [ui.shadcn.com/docs/changelog](https://ui.shadcn.com/docs/changelog)（2026-11-21）

**对我们的意义**：如果以后要加「工具调用轨迹 / 子 agent 运行」类组件，别自己发明字段，先看 `trace` 的解剖（line = icon + title + description + status，可展开/链接/开弹层）。**这类「把 agent 行为渲染成行」的组件，2026 年已经有事实标准形状了。**

### 7.5 Vercel AI SDK 的 generative UI：架构不同，不可套

`[一手]` 官方定义："Generative UI is the process of connecting the results of a **tool call** to a React component."（[ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces)，2026-11-21）

它的模型是：**一个 tool 对应一个组件**（`part.type === 'tool-displayWeather'` → 渲染 `<Weather {...part.output} />`），状态是 `input-available | output-available | output-error`。

**这不是组件目录**，没有「模型用 50 个组件自由拼装」的能力。所以：**API 形状不可借，但三个状态名可以借**（`input-available` / `output-available` / `output-error` 正好对应我们的「加载中 / 有数据 / 出错」，比自造 `status: 'loading' | 'ok' | 'error'` 更贴合「工具结果」语义）。后者的三态在设计上更准确地表达「模型这一步在等工具返回」。

### 7.6 其他

| 方案 | 许可 | 与我们关系 |
|---|---|---|
| **CopilotKit** | `[一手]` MIT（"The MIT License / Copyright (c) Atai Barkai"，[LICENSE](https://raw.githubusercontent.com/CopilotKit/CopilotKit/main/LICENSE)） | 它推动的 **AG-UI** 协议是「agent ↔ 前端」的事件协议，不是组件规范。仅作术语来源 |
| **A2UI**（Google，Agent-to-User Interaction） | **【未验证】** | json-render 的 schema 列表里提到支持 A2UI，但我没有抓到 A2UI 的一手规范原文，**不引用其结论** |
| **Adaptive Cards**（Microsoft） | **【未验证】**许可与版本未核 | 同上，只在「存在这类格式」的层面提及 |

---

## 8. 低保真 vs 真产品观感：证据与结论

### 8.1 三条实证

**① 保真度不影响「发现问题」的能力 → 选低保真不损失信息量**

> `[一手]` "We found that low- and high-fidelity prototypes are **equally good at uncovering usability issues**. Usability testing results were also found to be **independent of medium**, despite differences in interaction style. Designers should choose whichever medium and level of fidelity suit their practical needs and design goals."
> — Walker, Takayama & Landay (2002), *High-Fidelity or Low-Fidelity, Paper or Computer?*, Proc. HFES 46(5):661-665，[SAGE 摘要页](https://journals.sagepub.com/doi/abs/10.1177/154193120204600513)（2026-11-21 抓取）

**② 低保真的收益在「人」，不在「信息」——正好是「讨论锚点」要的**

> `[一手]` "**Low-fidelity prototypes put less pressure on users.** If a design seems incomplete, users usually have no idea whether it took a minute or months… feel less obliged to be successful, and be more likely to **express negative reactions**."
> "**Designers feel less wedded to low-fidelity prototypes.** … Once we invest more time and sweat in a design, it's harder to give it up if it does not work well."
> "**Stakeholders recognize that the work isn't finished yet.** … when a design looks very polished, it's easy for an executive to fall into the trap of saying, 'this looks good, let's make it go live now.'"
> — Kara Pernice, NN/g, *UX Prototypes: Low Fidelity vs. High Fidelity*, 2016-12-18，[nngroup.com](https://www.nngroup.com/articles/ux-prototype-hi-lo-fidelity/)（2026-11-21 抓取）

**③ 但低保真会系统性地扭曲「美感判断」→ 不能用它评视觉**

> `[一手]` "…users appeared to **compensate for deficiencies in aesthetic design by overrating the aesthetic qualities of reduced fidelity prototypes**."
> — Sauer, Franke & Ruettinger / Sauer et al. (2009), *The influence of prototype fidelity and aesthetics of design in usability tests*, Applied Ergonomics 40(4):670-677，[PubMed 18691696](https://pubmed.ncbi.nlm.nih.gov/18691696/)（2026-11-21 抓取）

### 8.2 结论：分层，不是二选一

> **低保真应该出现在「内容与外观」层，高保真应该出现在「排版与节奏」层。**

具体到我们这个插件（界面寿命秒级、嵌在回答正文里、用途是讨论锚点）：

| 层 | 取哪一档 | 依据 |
|---|---|---|
| **内容**（文案、数据、是否放了某个字段） | **低保真**：可以是占位文本、`lorem` 式假数据、`--` | 讨论的是「这个信息该不该在这里」，不是「值是多少」 |
| **外观**（色彩、图片、图标、阴影、品牌感） | **低保真**：灰阶、虚线占位块、无品牌色、图标用几何占位 | NN/g ② 的三条收益全部落在这层 |
| **排版与节奏**（字号层级、间距、行长、对齐） | **高保真**：必须用真实的宿主 token 与真实的字号层级 | Sauer ③ 警告「低保真会被高估美感」的另一面：如果你把排版也做糊了，用户讨论的就变成「这排版真难看」而不是「这个结构对不对」；且在聊天正文里，排版糊会被读成**渲染 bug** |
| **交互** | **低保真**：点击可以无反应，或只做视觉切换 | 原型是锚点，不是可点的应用；真交互会把讨论拉到细节 |

一句话版本：**要低保真的「信号」，不要低保真的「质感」。** 用虚线框、灰阶、显式区域标注（比如区域角上一个小标签写「导航」）告诉人「这是草图」；但字号、行高、间距、对齐必须是最终品质。

### 8.3 落地成 5 条可检查的规则

1. **每个原型块必须有「这是草图」的显式信号**：虚线边框 **或** 角标 **或** 灰阶，三选一，不能一个都不给。
2. **禁止品牌色**。颜色只用 `--dsw-alias-*` 的中性档；语义色（成功/警告/错误）只能出现在**真的表达状态**的地方。
3. **禁止图片与真实图标**。用带尺寸的占位块（`aspect-ratio` + 虚线 + 中央可选图标名）。
4. **排版不许打折**：字号层级、行高、间距必须走 `DESIGN.md` 的 token；不允许「先随便排一下」。
5. **占位文本要标出语义**，比如 `{{用户姓名}}`，不要写 `Lorem ipsum`——中文语境下 lorem 会让人分心去读它。

### 8.4 一个反例，值得写进组件说明

如果整块做成「真产品观感」（成型组件、真图标、品牌色），会有两个具体后果，都能在证据里找到：

- **内部**：团队会对它产生沉没成本依恋（NN/g ②），后面改结构时阻力变大。
- **外部**：看到的人会说「这个做得挺好，什么时候上线」——而它本来的用途是「这个结构对不对，我们讨论一下」。

这正是 `DESIGN.md` §1 已经写下的那句判断（「界面寿命秒级，滚动过去就不再看」）的外部印证：**既然它不会活过一条消息，把它做漂亮就是纯亏损。**

---

## 9. 主表

体积一列的口径：npm `unpackedSize`（含类型与全部组件），**不等于实际进包体积**；「运行时重量」一列才是对我们有意义的判断。

| 库 / 对象 | 许可 | 技术栈与运行时重量 | 可复用形态 | 与「token 驱动 + 白名单」的适配成本 | 风险 |
|---|---|---|---|---|---|
| **shadcn/ui** | MIT | React + Tailwind + `cva` + `cn` + `radix-ui`/`@base-ui/react`；无自身 runtime，但**要求 Tailwind** | **②③** | 中：视觉层全重写（CSS Modules），结构/命名/状态属性可直接用。`field`+`item` 约 2 天 | 2026-07 起默认 Base UI；社区教程多是 Tailwind v3 + Radix 旧版；`cn` 在 2026-09 才独立成包 |
| **Radix Primitives** | MIT | 无样式，单包 `radix-ui` tree-shakable | ②（文档）/ 4（依赖） | 低（若只读文档）；若要装则每个 primitive 一个包 | 收购后更新节奏变慢（`[二手]`，仅社区观察，未核官方路线图） |
| **Base UI** | MIT | 无样式，`@base-ui/react@1.9.0`，子路径导入，`sideEffects:false`；依赖 `@floating-ui/*` + `use-sync-external-store` | ②（文档）/ **4（仅弹层）** | 低：`import { Dialog } from '@base-ui/react/dialog'` | 1.x 仍在演进；子路径命名可能变 |
| **React Aria** | **Apache-2.0** | 行为层 + 可选样式层；1.17 起依赖大幅减少 | ② | 中：API 面比 Radix 大，文档偏长 | Apache-2.0 需保留 NOTICE；生态不如 Radix 广 |
| **Ark UI** | MIT | `@zag-js` 状态机；Chakra 3 的底座 | ②③ | 中：状态机模型对我们是过度设计 | 抽象层深，调试成本高 |
| **Ant Design** | MIT | `antd@6.7.1`，49.5 MB，40+ `@rc-component/*`，**运行时 cssinjs**，`dayjs` | ②（仅密集表格/表单规格） | 高：cssinjs 与我们 CSS Modules 冲突 | 体积与依赖最重；视觉语言与我们基调冲突 |
| **MUI** | MIT | `@mui/material@9.5.0`，8.5 MB，**Emotion** peer，`@popperjs/core` | ② | 高：需要 Emotion 运行时 | Material 观感与「宿主正文延伸」冲突 |
| **Mantine** | MIT | `@mantine/core@9.8.2`，10.7 MB，**编译期 CSS Modules**（`./styles.css`），依赖干净 | **②（布局规格第二参考）** | 低（若只读规格） | peer 要求 `react ^19.2.0`，与本仓库 React 18.3 冲突 → **只借不装** |
| **Chakra** | MIT | `@chakra-ui/react@3.38.0`，2.8 MB，**Emotion** + `@ark-ui/react` 精确锁定 | ③ | 高：Emotion + Ark 双层 | 精确 pin `@ark-ui/react` 会与其它依赖打架 |
| **DaisyUI** | MIT | Tailwind plugin，纯 CSS class | ③ | 高：**必须有 Tailwind** | 视觉是强观点（圆角/阴影/配色预设），改造成 token 驱动几乎等于重写 |
| **Flowbite**（开源） | MIT | Tailwind class + JS 交互脚本 | ③ | 高：需 Tailwind；JS 交互与声明式冲突 | 与 Flowbite Pro（付费）同名，易误引 |
| **Preline UI** | MIT **+ Fair Use** | Tailwind class + `HS*` JS 初始化 | ③ | 高 | **非纯 MIT**：禁止竞品、必须双许可转载、必须署名 |
| **Tailwind Plus** | **商业** | Tailwind 模板 + `@tailwindplus/elements` | ❌ | ❌ | **禁止**「separately re-distribute」与「UI library」；**连基于其设计的 Figma kit 都禁止** |
| **Rough.js** | MIT | 169 KB，4 个小依赖，**无框架** | **①（仅图形）** | 低：但产出是 SVG/Canvas 路径，不能给 DOM 组件描边 | 只适合「示意图」组件 |
| **Wired Elements** | MIT | `wired-elements@3.0.0-rc.6`（**RC**，约 2021-04 发布），`lit@^2.0.0-rc.1` + `roughjs` | ❌ | 高：Web Components + Shadow DOM + lit runtime | **停在 RC 4 年**；Shadow DOM 内 token 继承需实测 |
| **Excalidraw** | MIT | React 画布应用 | ②（观感规格） | 高：它是整应用不是组件库 | 体积与定位都不匹配 |
| **tldraw** | **专有，禁生产** | React 画布引擎；带 License Key + 水印强制 | ❌ | ❌ | 明文 "Not to use the Software in Production Environments" |
| **json-render** | **Apache-2.0** | 多包 monorepo；`@json-render/core` + 各平台 renderer | **②③（schema / prompt 契约）** | 低（读文档）；若装，只装 core 会带入 zod | 它的状态/表达式/directive 能力与我们「无任意 JS」冲突，**不能整包照搬** |
| **mcp-ui** | **Apache-2.0** | iframe + `postMessage`，资源类型是 HTML/remote-dom | ❌（无组件规范） | — | **声明式组件类型仍在其 roadmap 未完成** |
| **CopilotKit** | MIT | React + AG-UI 协议 | ③（术语） | 高 | 协议 > 组件，与本次目标不重合 |
| **Vercel AI SDK** | Apache-2.0（`ai` 包） | tool → component 一对一映射 | ③（三态命名） | — | **不是组件目录**，架构不兼容 |

---

## 10. 推荐

### 10.1 选哪 1–2 个作主要参考

#### 主参考 A：**shadcn/ui** —— 作为「组件解剖与状态的规格字典」

**理由（按重要性）**：

1. **缺口命中率最高**。61 个组件里，`field`（字段组）和 `item`（列表行）是**组件库里最稀缺的两类**——大多数库只给 `Form`/`List` 这种大块，不给「label + 控件 + hint + error」这种四件套。我们要的就是这四件套。
2. **它天生就是给「你要自己维护」设计的**。`[一手]` "This is not a component library. It is how you build your component library." —— 这与「我们不引库、自研 CSS Modules」的前提**同构**，所以借它的结构不产生架构负债。
3. **它把状态放进了 DOM 属性**（`data-slot`、`data-invalid`、`data-orientation`、`data-variant`、`data-size`）。这层约定对我们尤其值钱：**CSS Modules 用 `[data-invalid="true"] &` 就能写状态样式，不需要在 React 里多传一个 `className`**，也不需要 `cva`。
4. **它 2026 年已经在做对话原生组件**（`message`/`bubble`/`trace`/`attachment`/`marker`），我们的下一个需求大概率就在这批里。
5. 许可干净：MIT，无附加条款。

**怎么用（明确边界）**：只读 `apps/v4/registry/new-york-v4/ui/*.tsx` 的**结构与零件命名**，把每个 `className` 当「设计意图的文字描述」读，然后用自己的 token 重写 `.module.css`。**不要**执行 `npx shadcn add`，**不要**引入 `cva`/`cn`/Tailwind。

#### 主参考 B：**json-render** —— 作为「schema + 提示词契约」的规格

**理由**：

1. **唯一一个和我们是同一架构、并把「提示词生成」作为一等公民的开源实现**：`catalog.prompt()` 让组件定义成为唯一真相。我们现在 `SKILL.md` 与渲染器字段表两份人维护，这是长期的错位风险。
2. **它的「schema vs catalog」二分法值得直接采纳**：`[一手]` "The schema is the grammar; the catalog is the vocabulary." —— 对应我们的「fence 语法（root/elements/children）」与「50 个组件的字段定义」。
3. **扁平 `root + elements` 引用式结构**，对**流式输出**友好（追加一个 entry 即可），比嵌套树更抗截断。
4. Apache-2.0，可以合法地读、抄结构、甚至摘一段写成自己的类型定义。

**怎么用**：读 [schemas.mdx](https://raw.githubusercontent.com/vercel-labs/json-render/main/apps/web/content/docs/schemas.mdx) 与 README 的 Catalog/Renderer 两节。**明确不抄**：`$state`/`$cond`/`$template`/`$computed` 表达式、`watch`、`actions`/`setState`（它们是「有状态应用」的能力，会破坏「无任意 JS 运行时」这条边界）。

#### 次参考（只在特定子问题上去看）

- **`item`/`field` 的布局细节**：`Field` 的 `orientation: responsive` + `:has()` 微调，是「同一组件在窄/宽容器里换排布」的完整解法。
- **布局骨架规格**：**Mantine 的 `AppShell`/`Grid`/`Container`/`Stack`**（编译期 CSS Modules 路线，与我们同构），只在设计「双栏/页面容器」时翻它的文档。**只读不装**（React 19 peer 冲突）。
- **弹层行为**：`@base-ui/react/dialog` 的文档（读它的「关闭后焦点归还」「嵌套弹层」两节），再决定自写还是装依赖（§3.5）。

### 10.2 「必须自己写」清单（9 项）

按「有没有可借对象」排序，**前 3 项没有可借对象**。

| # | 组件 | 为什么必须自己写 | 可借的只有 |
|---|---|---|---|
| 1 | **页面容器 + 标题栏**（PageShell / PageHeader） | shadcn 的 `card` 是卡片不是页面；Mantine `AppShell` 是整应用外壳。**聊天内嵌的「页面」是一个有边界的矩形**，没有现成对应物 | 解剖命名（Header/Title/Description/Actions） |
| 2 | **导航：顶栏 / 侧栏 / 底部标签** | 聊天正文里没有「导航」这件事——原型里的导航是**示意**（表示「这屏有导航」），不是功能。所有库的导航都是可交互的，直接抄会引入一整套状态机 | ARIA landmark 规则（`<nav>`、`aria-current="page"`）、`sidebar` 的折叠状态规格 |
| 3 | **双栏布局** | shadcn `resizable` 是可拖拽分隔（要 JS + 指针事件）；Mantine `Grid` 是 12 栅格。我们要的是**静态比例双栏 + 窄容器自动堆叠** | 容器查询（`@container`）写法，Mantine Grid 的比例规格 |
| 4 | **列表行 `Item`** | 结构可借，**DOM 与 CSS 必须重写**（Tailwind → token） | ✅ 完整零件表 + 变体 + `role="list"` + 媒体区对齐规则 |
| 5 | **字段组 `Field`** | 同上 | ✅ 完整零件表 + `role="group"`/`role="alert"` + 三种 orientation |
| 6 | **弹层 Modal/Sheet** | 行为是最贵的部分（焦点陷阱/`inert`/滚动锁/Escape/焦点归还/`aria-modal`），**结构简单但行为容易漏** | `data-state=open/closed` 约定、关闭按钮 `sr-only` 文案、`@base-ui/react/dialog` 的行为文档 |
| 7 | **空态 `Empty` / 加载态 `Skeleton`** | 规格极简（一段文案 + 一个图形 / 一组灰块），**借的价值低于写的成本** | 命名（`Empty`/`Skeleton`）、`Skeleton` 的动画曲线（我们已有 `cubic-bezier(.22,1,.36,1)`） |
| 8 | **fence 语法与校验**（root/elements/children/字段类型） | **MCP 生态里没有标准**（mcp-ui 的 "declarative UI content type" 仍在 roadmap） | json-render 的 schema/catalog 二分、扁平结构思路 |
| 9 | **提示词生成**（从 50 个组件定义产出 `SKILL.md` 的组件说明段） | 我们的字段是手写的、有中文说明与业务约束，**不能直接跑 `catalog.prompt()`** | ✅ `catalog.prompt()` 的产品形态（一份定义两处用） |

> 第 6 项如果按 §3.5 建议走「原型阶段不做焦点管理」，则成本从 ~150 行降到 ~40 行（只管 `Escape` 与视觉遮罩），但**必须在组件说明里写清这是示意**。

### 10.3 可直接搬的代码：几乎为零，逐条说明

| 候选 | 能否直接搬 | 依据 |
|---|---|---|
| shadcn `field.tsx` / `item.tsx` | ❌ | 依赖 Tailwind class + `cva` + `cn` + `radix-ui`/`@base-ui/react`；无 token 驱动 |
| DaisyUI / Flowbite / Preline 的 CSS | ❌ | 全部是 Tailwind `@apply`/plugin 产物，脱离 Tailwind 无意义 |
| Ant Design / MUI / Mantine / Chakra | ❌ | CSS-in-JS / 编译期主题，不是可摘的 CSS 文件 |
| **`roughjs@4.6.6`** | **✅（有条件）** | MIT；`unpackedSize` 169,684；依赖仅 `hachure-fill`/`points-on-path`/`points-on-curve`/`path-data-parser`；**无框架**。但产出是 SVG/Canvas 路径，只适合「示意图」类组件，**不能给 DOM 容器描边** |
| 手绘圆角 CSS | ✅（不是别人的代码） | `border-radius: 255px 15px 225px 15px/15px 225px 15px 255px` 是业内通用写法，无版权问题；比引库省 |
| json-render 的 schema 结构 | ✅（抄结构，不抄实现） | Apache-2.0 允许；但只能抄「root + elements + children」这层语法，**不能抄状态/表达式系统** |
| `@base-ui/react` 作为依赖 | 取决于 §3.5 决策 | MIT，子路径 tree-shakable |

**一句话**：这次调研的产出**不是一份可粘贴的代码**，是一份「零件表 + 状态属性约定 + 无障碍落点 + 5 条低保真规则」。

---

## 11. 可复用点（速查）

1. **`field` 的 10 零件解剖 + 3 种 orientation** → 直接映射成我们的 `Field*` 组件组与 CSS Modules 的 `:has()` 规则。
2. **`item` 的 11 零件解剖 + 3 变体 × 2 尺寸** → 列表行组件；`ItemActions` 放尾部操作。
3. **`data-slot` / `data-invalid` / `data-orientation` / `data-variant` / `data-size`** → 状态进 DOM 属性，CSS Modules 直接选，React 层不用传 `className`。
4. **`role="group"`（字段）/ `role="alert"`（错误）/ `role="list"`（列表）/ `<fieldset>`+`<legend>`（字段集）** → 无障碍落点，几乎零成本。
5. **`catalog.prompt()` 的产品形态** → 组件定义与提示词同源，消除两份真相。
6. **`root + elements` 扁平引用式 spec** → 流式追加友好、引用可校验。
7. **AI SDK 三态命名** `input-available` / `output-available` / `output-error` → 比 `loading/ok/error` 更贴合「工具结果」。
8. **`Trace` 的行模型**（icon + title + description + status）→ 未来做「agent 行为轨迹」类组件的现成形状。
9. **低保真 5 条规则**（§8.3）→ 直接写进 `DESIGN.md` 与组件说明。

---

## 12. 未验证项与已知冲突

| 项 | 状态 | 说明 |
|---|---|---|
| **Tailwind Plus 官网许可页** | `[未验证]` 页面本体 | `tailwindcss.com/plus/license` 返回登录页；改用随包分发的 `@tailwindplus/elements@1.0.22` 的 `LICENSE.md`（同源文本）。若需要法律级确认，应让用户登录后下载正式许可 |
| **ACM 10.1145/3815553**《Rethinking Prototype Fidelity in the Age of Generative AI》 | `[未验证]` 抓不到 | PDF 与 landing page 均返回 404；搜索摘要提到「when high-fidelity becomes cheap」，但**本文不引用其结论**。值得后续单独取 |
| **A2UI（Google）** | `[未验证]` | 只在 json-render 的 schema 列表中被提及（"A2UI — Google's Agent-to-User Interaction protocol"），未抓到一手规范 |
| **Adaptive Cards** | `[未验证]` | 同上，许可与版本未核 |
| **shadcn 的 "eight styles"** | `[一手]` 提到了这个名字，但未核列表 | 2026-10 changelog 原文 "across all eight styles"；具体是哪八种未查 |
| **Radix 收购后维护节奏** | `[二手]` | LFX Insights / 社区观察称更新变慢；**官方无正式声明**，本文正文已标注为社区观察 |
| **`wired-elements` 是否复活** | `[一手]` 只有包元数据 | 最新版本 `3.0.0-rc.6`，按发布记录时间戳约 **2021-04-24**；未核 GitHub 仓库是否仍在活跃提交 |
| **宿主 `--dsw-alias-*` 在 Shadow DOM 内是否继承** | 未测 | 只在「要不要用 Wired Elements」这个已经否定的分支上有关；不影响主结论 |

---

## 13. 证据索引（本文实际抓取的页面）

| 对象 | 链接 | 抓取日期 |
|---|---|---|
| shadcn 引言（Open Code / 不是组件库） | https://ui.shadcn.com/docs | 2026-11-21 |
| shadcn registry 索引 | https://ui.shadcn.com/docs/registry | 2026-11-21 |
| shadcn `registry-item.json` 规范 | https://ui.shadcn.com/docs/registry/registry-item-json | 2026-11-21 |
| shadcn changelog（2026-09 `cn` / 2026-10 Trace） | https://ui.shadcn.com/docs/changelog | 2026-11-21 |
| shadcn 2026-07 Base UI 默认 | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/changelog/2026-07-base-ui-default.mdx | 2026-11-21 |
| shadcn 组件目录（GitHub API） | https://api.github.com/repos/shadcn-ui/ui/contents/apps/v4/registry/new-york-v4/ui | 2026-11-21 |
| shadcn `dialog.tsx` | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/dialog.tsx | 2026-11-21 |
| shadcn `field.tsx` | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/field.tsx | 2026-11-21 |
| shadcn `item.tsx` | https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/item.tsx | 2026-11-21 |
| shadcn LICENSE（MIT） | https://raw.githubusercontent.com/shadcn-ui/ui/main/LICENSE.md | 2026-11-21 |
| Radix 引言 | https://www.radix-ui.com/primitives/docs/overview/introduction | 2026-11-21 |
| Radix LICENSE（MIT, WorkOS） | https://raw.githubusercontent.com/radix-ui/primitives/main/LICENSE | 2026-11-21 |
| Base UI quick start | https://base-ui.com/react/overview/quick-start | 2026-11-21 |
| `@base-ui/react@1.9.0` 元数据 | https://registry.npmjs.org/@base-ui%2Freact/latest | 2026-11-21 |
| React Aria Components `package.json`（Apache-2.0） | https://raw.githubusercontent.com/adobe/react-spectrum/main/packages/react-aria-components/package.json | 2026-11-21 |
| Ark UI About（MIT） | https://ark-ui.com/docs/overview/about | 2026-11-21 |
| `antd@6.7.1` 元数据 | https://registry.npmjs.org/antd/latest | 2026-11-21 |
| `@mui/material@9.5.0` 元数据 | https://registry.npmjs.org/@mui%2Fmaterial/latest | 2026-11-21 |
| `@mantine/core@9.8.2` 元数据 | https://registry.npmjs.org/@mantine%2Fcore/latest | 2026-11-21 |
| `@chakra-ui/react@3.38.0` 元数据 | https://registry.npmjs.org/@chakra-ui%2Freact/latest | 2026-11-21 |
| DaisyUI LICENSE（MIT） | https://raw.githubusercontent.com/saadeghi/daisyui/master/LICENSE | 2026-11-21 |
| Flowbite 许可页（MIT + Pro EULA） | https://flowbite.com/license/ | 2026-11-21 |
| Preline LICENSE（MIT + Fair Use） | https://raw.githubusercontent.com/htmlstreamofficial/preline/master/LICENSE | 2026-11-21 |
| Tailwind Plus LICENSE.md（商业） | https://cdn.jsdelivr.net/npm/@tailwindplus/elements@1.0.22/LICENSE.md | 2026-11-21 |
| `roughjs@4.6.6` 元数据（`"license":"MIT"`，未单独抓 LICENSE 原文） | https://registry.npmjs.org/roughjs/latest | 2026-11-21 |
| Wired Elements LICENSE（MIT） | https://raw.githubusercontent.com/rough-stuff/wired-elements/master/LICENSE | 2026-11-21 |
| `wired-elements@3.0.0-rc.6` 元数据 | https://registry.npmjs.org/wired-elements/latest | 2026-11-21 |
| Excalidraw LICENSE（MIT） | https://raw.githubusercontent.com/excalidraw/excalidraw/master/LICENSE | 2026-11-21 |
| tldraw LICENSE（专有，禁生产） | https://raw.githubusercontent.com/tldraw/tldraw/main/LICENSE.md | 2026-11-21 |
| json-render LICENSE（Apache-2.0） | https://raw.githubusercontent.com/vercel-labs/json-render/main/LICENSE | 2026-11-21 |
| json-render README | https://raw.githubusercontent.com/vercel-labs/json-render/main/README.md | 2026-11-21 |
| json-render Schemas 文档 | https://raw.githubusercontent.com/vercel-labs/json-render/main/apps/web/content/docs/schemas.mdx | 2026-11-21 |
| mcp-ui LICENSE（Apache-2.0） | https://raw.githubusercontent.com/idosal/mcp-ui/main/LICENSE | 2026-11-21 |
| mcp-ui README（MCP Apps / roadmap） | https://raw.githubusercontent.com/idosal/mcp-ui/main/README.md | 2026-11-21 |
| CopilotKit LICENSE（MIT） | https://raw.githubusercontent.com/CopilotKit/CopilotKit/main/LICENSE | 2026-11-21 |
| AI SDK Generative UI | https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces | 2026-11-21 |
| Walker/Takayama/Landay 2002 | https://journals.sagepub.com/doi/abs/10.1177/154193120204600513 | 2026-11-21 |
| Sauer et al. 2009 | https://pubmed.ncbi.nlm.nih.gov/18691696/ | 2026-11-21 |
| NN/g, Pernice 2016 | https://www.nngroup.com/articles/ux-prototype-hi-lo-fidelity/ | 2026-11-21 |
