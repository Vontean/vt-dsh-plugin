# dsh-vt-Interface

DeepSeek Harness 的 UI/UX 改善插件（Cordis bundle + client 半边）。
改外观 = 改 `client.js` 的 DOMAIN 数据；插件关闭即完全还原。

## 文件路由

| 要做的事 | 先读 |
|---|---|
| 改配色、圆角、阴影、间距、对齐 | `DESIGN.md` → 再读 `client.js` 的 `PATCHES` |
| 新增一个界面修复 | `DESIGN.md`「选哪一类补丁」→ `client.js` 的 `anchoredDialog()` 与 `PATCHES` |
| 判断改动到底生效没有 | `docs/VERIFY.md` |
| 遇到「改了完全没变化」 | `docs/VERIFY.md`「三种失败先分清」 |
| 想知道 Harness 侧的机制（token 分层、浮层原语、锚点定位） | `DESIGN.md`「Harness 机制备忘」 |

单个补丁「为什么是这个值」写在它自己的代码注释里，不在文档里重复。

## 硬约束

1. **只改本仓库**。Harness 本体一行不动 —— 撤销是产品需求，不是礼貌。
2. **选择器只来自 discovery 结果或补丁声明的 `fallback`**。影响面必须能用一句话说清是哪个类。
3. **要正圆就同时给 `corner-shape`**。只写 `border-radius` 得到的是 squircle。
4. **签名 token 只用 longhand，且不含 `calc()/min()/max()`**。CSSOM 会重写这两类值。
5. **视觉数值集中**：新数字写进 DOMAIN 常量或 `PATCHES` 字段，不在 `rules()` 模板里现写。
6. **探针默认关闭**。要数据先 `__vtInterface.probe(true)`，用完再关。

理由与失效方式都在 `DESIGN.md` 的「陷阱」。

## 改动循环

1. 改 `client.js` → 保存即生效，**不重启**（客户端模块热更新已实测）。
2. 确认补丁 resolved：查报告 token。

   ```
   cordis_inspect_query(platform="client", provider="Theme", method="listTokens")
   ```

   **完成判据**：每条补丁都有 `--vt-report-<id>-discovered-N`（或 `fallback`，表示仍在兜底工作），
   且 `--vt-report-build-<version>` 等于 `client.js` 里的 `VERSION`。两条都满足才算这次改动被加载。
3. `index.js`（host 半边）改动需要重启应用；它目前是空实现，正常情况下不用碰。

## 环境

- 插件本体：本目录（软链进 `~/.dsh/profiles/desktop/node_modules`）。
- 运行中的应用：DeepSeek Harness 桌面端，Harness 版本 `0.2.1-rc.5`。
- 代码索引：`.codegraph/`（`codegraph explore "<问题>"` 查符号与调用链）。本地产物，已 gitignore。
- 版本控制：git，分支 `main`。
