# dsh-vt-uiux-enhancer

DeepSeek Harness 的 UI/UX 改善插件（Cordis bundle + client 半边）。
改外观 = 改 `client.js` 的 DOMAIN 数据；插件关闭即完全还原。

## 文件路由

| 要做的事 | 先读 |
|---|---|
| 想清楚要什么观感、否过什么方案 | `DESIGN.md` |
| 写或改一个补丁 | `DEVELOPMENT.md`「选哪一类补丁」→ `client.js` 的 `PATCHES` |
| 补丁写完却没生效 | `DEVELOPMENT.md`「陷阱」 |
| 判断改动到底加载了没有 | `docs/VERIFY.md`「三种失败先分清」 |
| 想知道 Harness 侧的机制（token 分层、浮层原语、锚点定位） | `DEVELOPMENT.md`「Harness 机制备忘」 |
| 要把代码拆成多文件 | `DEVELOPMENT.md`「打包与装载约束」——客户端半边只能是一个文件 |
| 补丁做完了，要同步哪些文档 | 下一段「文档同步」 |

单个补丁「为什么是这个值」写在它自己的代码注释里，不在文档里重复。

## 文档同步

补丁落地后按变化类型同步，没有对应的变化就不动：

| 变的东西 | 落点 |
|---|---|
| 跨补丁的取舍，或否掉过的方案 | `DESIGN.md`「跨补丁决策记录」 |
| 一条会让人白改一轮的机制事实 | `DEVELOPMENT.md`「陷阱」 |
| Harness 侧的新事实（slot、token 层、生命周期） | `DEVELOPMENT.md`「Harness 机制备忘」 |
| 新的补丁形态，或新增步骤变了 | `DEVELOPMENT.md`「选哪一类补丁」 |
| 探针新字段、新的失败判据 | `docs/VERIFY.md` |

## 硬约束

1. **只改本仓库**。Harness 本体一行不动 —— 撤销是产品需求，不是礼貌。
2. **样式作用面只来自 discovery 结果、补丁声明的 `fallback`,或 `fixedSelector` 声明的语义属性**。影响面必须能用一句话说清是哪个类或哪个属性。
   行为补丁定位自己的素材时可以用 `data-*` 语义属性；探针是只读的，不受这条约束，但新写的查询
   优先复用已解析出来的选择器，而不是新造子串选择器。
3. **要正圆就同时给 `corner-shape`**。只写 `border-radius` 得到的是 squircle。
4. **签名 token 只用 longhand，且不含 `calc()/min()/max()`**。CSSOM 会重写这两类值。
5. **视觉数值集中**：新数字写进 DOMAIN 常量或 `PATCHES` 字段 —— 包括行为里内联的图标盒子与描边，
   不在规则模板或组件代码里现写。
6. **探针默认关闭**。要数据先 `__vtInterface.probe(true)`，用完再关。

理由与失效方式都在 `DEVELOPMENT.md` 的「陷阱」。

## 改动循环

1. 改 `client.js` → 保存即生效，**不重启**（客户端模块热更新已实测）。
2. 确认补丁 resolved：查报告 token。

   ```
   cordis_inspect_query(platform="client", provider="Theme", method="listTokens")
   ```

   **完成判据**：`component` 补丁每条都有 `--vt-report-<id>-discovered-N`（用 `fixedSelector` 的报
   `fixed`；`fallback` 是可接受的降级，但要记下原因），且 `--vt-report-build-<version>` 等于
   `client.js` 里的 `VERSION`。

   `behavior` 补丁不产生这些 token。它要求在 `__vtInterface.behaviors()` 里 `installed` 等于 `total`
   且 `errors` 为空 —— 但「注册成功」不等于「界面上看得见」（见陷阱 9），所以再加一次探针读数。
3. `index.js`（host 半边）改动需要重启应用；它目前是空实现，正常情况下不用碰。

## 环境

- 插件本体：本目录，即总集仓库 `vt-dsh-plugin` 的 `plugins/vt-uiux-enhancer`（软链进
  `~/.dsh/profiles/desktop/node_modules`）。
- 客户端半边只能是一个文件（装载器拼装下发），见 `DEVELOPMENT.md`「打包与装载约束」。
- 运行中的应用：DeepSeek Harness 桌面端，Harness 版本 `0.2.1-rc.5`；`package.json` 的
  `engines.dsh` 声明兼容范围，改这里等于改安装门槛。
- 版本：`package.json` 的 `version` 与 `client.js` 的 `VERSION` 必须同值；发布流程与 tag 命名见
  仓库根 `README.md` 的「发布」段。
- 代码索引：`.codegraph/`（`codegraph explore "<问题>"` 查符号与调用链）。本地产物，已 gitignore。
- 版本控制：git，分支 `main`。
