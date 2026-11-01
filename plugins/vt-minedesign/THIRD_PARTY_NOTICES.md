# 第三方资源说明

本插件在 `icon.svg`、`assets/` 与浏览器半边内联的图标中，使用 **MineDesign** 的官方图标。
图标不是本插件画的，来源与许可见下。

## MineDesign 图标

- 来源：MineDesign（npm 包 `@vontean/minedesign`，仓库 <https://github.com/Vontean/MineDesign>）
  的 `assets/brand/`。生产源为 `minedesign-icon.svg`，其 `assets/brand/README.md` 记载了
  几何与状态规则以及生成方式。
- 本插件携带的副本：
  - `icon.svg` — MineDesign 的 light 变体（`#0d0d0d`），用于插件卡与市场列表（`<img>` 里
    `currentColor` 不可控，所以用固定色的变体）。
  - `assets/minedesign-icon.svg` — 生产源，保留 `currentColor`。
  - `assets/minedesign-icon-dark.svg` — dark 变体（`#fafafa`）。
  - `client.js` 里的 `MineDesignIcon` — 与生产源同一几何的内联版本，随主题走 `currentColor`。
- 图标由两部分构成，各自的许可原文随包携带：
  - **外圈**（`codex-outline`，六瓣轮廓）：来自 MineCodex，MIT —— 见
    [`LICENSES/MineCodex-LICENSE.txt`](LICENSES/MineCodex-LICENSE.txt)。
  - **画笔**（`brush`）：Lucide 的 `brush` 图标，ISC —— 见
    [`LICENSES/lucide-LICENSE.txt`](LICENSES/lucide-LICENSE.txt)。
- MineDesign 自身的许可见其包内 `FORK.md`。本插件只使用它的品牌图标来标识 MineDesign 本身，
  不改动图标，也不把它当作本插件的自有标识。

## 上游技能正文

MineDesign 的两个设计技能（`skills/design`、`skills/design-system`）**不随本包分发**：
本插件在运行期从用户本机已安装的 MineDesign 里只读读取，并在内存中追加一段 DSH 适配说明。
详见 `src/skills.js` 与 `DESIGN.md`。
