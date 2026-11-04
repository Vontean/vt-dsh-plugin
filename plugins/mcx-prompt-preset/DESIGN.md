# DESIGN — dsh-mcx-prompt-preset

记录本插件的设计约定：它为什么长这样、用了哪些 token、边界在哪。新增界面时先读这里。

## 目标

在 DSH 里得到「和原生一致」的提示词入口：位置、尺寸、颜色、hover、图标重量都要像 DSH 自己长出来的，而不是像贴上去的第三方控件。

## 输入框按钮

### 位置

输入框工具行的 DOM 顺序是：

```
.row
└─ .tools
   ├─ button.add            ← 「+」命令菜单
   ├─ button.add            ← 回形针
   ├─ input[type=file]      ← 隐藏
   ├─ .modes                ← 审查模式（权限选择器）+ 计划开关
   └─ slot(conversation.input.left)
```

要求是「`+` 右侧、审查模式左侧」，而 DSH 只提供 `.modes` 之后的槽位。因此：

1. 注册一个渲染隐形锚点（`data-mcxpp-anchor`）的槽位条目，获得一个 React 管理的合法落点；
2. 槽位会给每个条目包一层无类名 `div`，所以从锚点向上两层才到 `.tools`；
3. 把按钮插到 `.tools` 里、锚点的**前一个兄弟节点**（即 `.modes`）之前。

兜底：找不到锚点时用 `[class*="_tools"]` 定位工具行（类名带构建哈希，如 `JZLxKW_tools`，故只匹配后缀）。

### 尺寸与颜色

不自绘一套，而是运行时对齐真实的「+」按钮：

| 属性 | 来源 |
| --- | --- |
| 宽高 | `getComputedStyle(addButton).width/height`（当前 28×28） |
| 圆角 | `borderRadius`（当前 999px） |
| 底色 | `backgroundColor`；透明时判定为「空心」形态 |
| hover | 空心 → `--dsw-alias-interactive-bg-hover`；实心 → `--dsw-alias-interactive-bg-hover-solid` |
| 图标尺寸 | 源 SVG 的计算宽高（当前 13px） |
| 描边 | 空心 → 1.5；实心 → 1.25（与 16 视图框一致） |

用 CSS 变量（`--mcxpp-base` / `--mcxpp-hover`）承载底色与 hover，因为行内 `background` 会盖掉 `:hover` 规则，自定义属性不会。

这样「+」被其它插件（如 UI Enhancer）重新设计时，提示词按钮自动跟随；没有装那些插件时，两者一起保持原生外观。

### 图标

书本轮廓取自 Lucide `book-open`（ISC），按 16 视图框重算坐标（原图 24 视图框 × 2/3），描边口径与 DSH 的 outline 图标一致。DSH 原生图标集里没有书本，因此这是唯一一处外部图形。

## 输入框浮层

对齐 DSH 自己的命令菜单（`+` 弹出的那个）而不是另起一套：

| 属性 | 值 |
| --- | --- |
| 背景 | `--dsw-specific-menu` |
| 阴影 | `--dsw-elevation-prominent` |
| 圆角 | 20px |
| 内边距 | 4px |
| 行高/字号 | 20px / 13px |
| 行圆角 | 8px，hover 用 `--dsw-alias-interactive-bg-hover` |
| 搜索框 | `.5px solid --dsw-alias-border-inverted`，圆角 8px |
| 位置 | 输入卡片上沿之上 8px；上方空间不足时落到卡片下方 |

内容结构同 MCX：分类页签 → 最近使用（前 3 条）→ 各分类 → 其他。

## 侧边栏页面

- 入口：`sidebar.panellist`，`order: 20`（在「定时任务」之后、「记忆」之前）；
- 主面板：`main` 槽位，key 与入口 id 同为 `mcx-prompt-preset`；
- 版式：max-width 880px 居中，`28px` 内边距，标题 20/28 semibold，正文 13/20；
- 表面色：卡片用 `--dsw-alias-bg-layer-1` + `.5px --dsw-alias-border-l1`；
- 主按钮：`--dsw-alias-button-info-fill`，与 DSH 发送按钮同源。

页面点击条目是**复制**而非填入：主面板会替换对话区，此时没有草稿可写。填入只发生在输入框浮层。

## 数据层

Host 半侧直接用 `node:sqlite` 打开 MCX 的库：

- 写事务 `BEGIN IMMEDIATE`，成功后 `metadata.revision + 1`，与 MCX 的 `mutate()` 同语义；
- `PRAGMA busy_timeout = 3000`，与 MCX 服务并发写时不互相报错；
- 只读三张表；库文件或表缺失时返回可读错误，不创建、不迁移；
- 所有路由经 `connection.requestRejection`，与内置 `/api` 同一套浏览器信任栅栏。

## 文案

所有可见文案走 Client locale（`mcx-prompt-preset` 命名空间，zh/en 两套），切换语言时按钮 tooltip、浮层与页面同步刷新。
