# 侧边栏排序 · `dsh-vt-sidebar-sort`

把「新会话」下面那一列入口拖成你习惯的顺序；把暂时用不到的拖到「更多」上收进去，需要时再从「更多」里拖回来。
拖拽时的插入线直接沿用会话列表那一套：**左侧小箭头 + 2px 主色横线**，不另造一套视觉。

## 它改了什么

- **拖动排序**：`网页对话 / 插件 / 自动化任务 / 提示词库 / 记忆系统` 这些入口都能拖。按住任意一行拖到两行之间，松手即落位。
- **拖进「更多」**：拖到最下面的「更多」上，整行进入投放态（主色描边 + 底色 + 图标与文字转主色），松手即收进菜单；「更多」菜单里立刻出现这一项。
- **从「更多」拖回**：打开「更多」，按住里面那一行拖回列表，放到哪一行之间就插到哪里。
- **记住结果**：顺序与收起项写在 `localStorage` 的 `dsh-vt-sidebar-sort:layout`，刷新、重启都保持。
- **插件增减也稳**：新装的插件入口默认排在末尾，不会打乱你已经排好的顺序；插件卸掉后它的位置自动消失。
- **收起成图标栏也能用**：图标栏里拖动同样生效，「更多」投放态只剩描边与底色。

## 视觉与交互规格

| 元素 | 规格 |
|---|---|
| 插入线 | 与 `ui-workspace` 会话行完全一致：12px 高的定位盒、`--dsw-alias-state-business-primary` 画的 2px 横线 + 左侧 5px 箭头，`right: 4px` 与行内边距对齐 |
| 拖拽中 | 悬浮影像由浏览器原生拖拽绘制；来源行压到 45% 不透明度，避免看起来有两份 |
| 「更多」投放态 | 主色 14% 底色（`color-mix`，不支持时退回 hover 底色）+ 1px 主色内描边 + 图标与文字转主色，120ms 过渡 |
| 投放完成 | 「更多」上播放 480ms 的收束动画，确认已收进去 |
| 「更多」菜单行 | 复用面板自己的图标：14×14 的盒子，描边按 16 格归一到同一视觉粗细（24 格图标取 1.5，屏幕上都约 0.875px）；文字 13px/20px、行高 34px、内边距 6/8、间距 6px，与官方菜单行逐项对齐 |

动效遵循系统 `prefers-reduced-motion`：开启减少动效时，过渡与收束动画都关闭，只保留状态色。

## 安装

```bash
# 市场索引（推荐，有更新提示）
# 在「插件 → 发现 → 添加索引源」填：https://vontean.github.io/vt-dsh-plugin/index.json

# npm
dsh plugin --profile <profile> add dsh-vt-sidebar-sort

# Release tarball
dsh plugin --profile <profile> add /绝对路径/dsh-vt-sidebar-sort-1.0.0.tgz
```

装完**必须重启 dsh**，刷新页面不生效。

## 支持的 DSH 版本

`engines.dsh` 为 `>=0.2.1-rc.5 <0.3.0`，与合并时的应用运行版本一致。超出范围 DSH 会在加载前拒绝该插件，
不会带着不兼容的代码跑起来。本插件按 CSS Module 类名的稳定后缀（`_panelList` / `_panelRow`）定位侧边栏，
并按「唯一带 `aria-haspopup` 的面板行」识别「更多」，大版本升级后请先确认这两点仍然成立。

## 安全边界

- 插件代码在**用户进程内**运行，没有沙箱；本插件只做三件事：读侧边栏 DOM、移动行的顺序、读写一个
  `localStorage` 键。不发网络请求、不写系统文件、不读取会话内容。
- 顺序只覆盖「显示顺序」，不改任何插件在 Slot 里的注册顺序；关掉本插件后，侧边栏回到各插件声明的原始顺序，
  收起项同时全部恢复显示。
- 已知边界：用的是 HTML5 原生拖拽，触屏与手写笔不支持拖动（桌面端鼠标/触控板正常）。

## 恢复默认

本插件不提供界面上的「重置」入口。要恢复默认顺序：

```js
localStorage.removeItem('dsh-vt-sidebar-sort:layout'); location.reload();
```

或直接卸载本插件。

## 开发

- `index.js`：Host 半边，空实现（功能全在浏览器侧，见文件头注释）。
- `client.js`：唯一实现。分四块——状态（`localStorage`）、行身份（读 `PanelRow` 的 React fiber props）、
  样式（一段带 `data-plugin-css` 的 `style`，卸载时精确移除）、引擎（`MutationObserver` + rAF 合并的
  布局校正，以及 document 级原生拖拽手势）；末尾是注册进 `sidebar.panellist.actions` 的菜单组件。
- 本地自检：`node --check client.js`，仓库根 `node scripts/check-client-bundles.mjs`、`pnpm market`。
