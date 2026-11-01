# DESIGN — AGENTS.md 指令页面

本页面是 DSH 设置面板里的一个 section，不引入独立视觉体系；只记录复用了哪些宿主
约定，供后续局部修改时保持一致。

## 来源

沿用 DSH 设置页的既有构成（对照 dsh-better-sidebar 的 settings section）：

- 内容列：`max-width: 760px`，纵向 `gap: 14px`，不额外加页面内边距（由面板提供）；
- 卡片：`border: 1px solid var(--dsw-alias-border-l2)`、`border-radius: 16px`、
  `background: var(--dsw-alias-bg-layer-3)`；
- 内层工具条 / 分段用 `--dsw-alias-bg-layer-2` + `--dsw-alias-border-l1`；
- 文本三级：`label-primary`（正文/控件值）、`label-secondary`（路径、次要动作）、
  `label-tertiary`（说明、状态、计数）。

## Token

| 用途 | Token |
|---|---|
| 页面/卡片底色 | `--dsw-alias-bg-layer-3`、`--dsw-alias-bg-layer-2` |
| 边框 | `--dsw-alias-border-l1`、`--dsw-alias-border-l2`、`--dsw-alias-border-l3` |
| 文本 | `--dsw-alias-label-primary` / `-secondary` / `-tertiary` |
| 主按钮 | `--dsw-alias-label-primary`（填充）+ `--dsw-alias-bg-layer-3`（字色） |
| 悬停 | `--dsw-alias-interactive-bg-hover`、`--dsw-alias-button-primary-hover` |
| 强调 / 焦点 | `--dsw-alias-brand-primary` |
| 状态色 | `--dsw-alias-state-success-primary`、`--dsw-alias-state-warn-primary`、`--dsw-alias-state-error-primary` |
| 等宽字体 | `--ds-font-family-code`（回落 `ui-monospace, SFMono-Regular, Menlo`） |

## 排版与尺寸

- 页面标题 16 / 24 semibold；副标题 13 / 20；
- 正文与按钮文字 13 / 20；页签、状态行 12 / 18；路径与体积 11–11.5 / 16；
- 编辑器 12.5px / 1.7 等宽，`tab-size: 2`，高度 `clamp(320px, 52vh, 620px)`，可竖向拖拽；
- 圆角：卡片 16、按钮 8、页签 999；
- 动效只用于 hover / focus 颜色过渡（120ms）；`prefers-reduced-motion` 下关闭。

## 交互约定

- 标题右侧三个动作按视觉权重排列：刷新（图标按钮）→ 取消（次按钮）→ 保存（主按钮）；
- 「保存」仅在存在未保存修改且不在保存中时可用；`⌘S` / `Ctrl+S` 等价于保存；
- 「取消」回到上次保存的内容；刷新丢弃草稿前用一次确认；
- 刷新按钮只放图标（16px、`currentColor`、28×28 命中区），文案进 `title` 与 `aria-label`；
- 状态行没有冗余态：无内容时整行左侧留空，只有未保存 / 已保存时间 / 错误 / 待创建时才出现；
- 绝对路径不单独占一行，作为页面标题的悬停提示保留；
- 焦点可见环统一 2px `brand-primary`，偏移 1–2px。
