# 工作区插件稳固性核查 · 总索引

本轮**只核查、只记录，没有修改任何插件源码**。目的回答一个问题：DSH 从 `0.2.1-rc.5` 升到 `0.2.2-rc.1` 之后，工作区里 11 个插件还有哪些地方是靠「新版本恰好没改」在工作。

## 一、核查范围与基准

| 项 | 值 |
| --- | --- |
| 核查对象 | `plugins/` 下全部 11 个插件 |
| 运行时 DSH | **`0.2.2-rc.1`**（`Info.plist`、`@deepseek-ai/dsh-app-boot`、各 client 包一致） |
| 插件开发基准 | 各插件 `engines.dsh` 与 README 均声明 `>=0.2.1-rc.5 <0.3.0` |
| 对照源码 | 从 `app.asar` 抽出的 330 个 `@deepseek-ai` 包（含 `src/*.ts` 与 `lib/*.js`） |
| 运行时状态 | 11 个插件全部 `enabled: true` / `fiberPhase: active`——**没有一个是装不上的** |
| 旁证 | `vt-steer-now` 部分用本机另一份 `0.1.5-rc.2` 全局安装判断「某处结构是这次改的还是本来如此」 |

分册：

| 分册 | 覆盖插件 |
| --- | --- |
| [rendering-and-chrome.md](rendering-and-chrome.md) | `vt-uiux-enhancer`、`vt-gen-ui` |
| [sidebar-composer.md](sidebar-composer.md) | `vt-sidebar-sort`、`vt-quote-bar`、`vt-mine-models`、`vt-web-chat` |
| [flow-and-prompt.md](flow-and-prompt.md) | `vt-steer-now`、`vt-system-prompt`、`mcx-prompt-preset` |
| [mcp-integration.md](mcp-integration.md) | `vt-minedesign`、`vt-use-figma` |

判定分四档：**正常** / **语义变化**（锚点还在但含义变了）/ **已失效**（锚点没了，功能不生效）/ **脆弱**（今天能跑，但假设不成立）。

## 二、结论先说

**11 个插件里，只有 1 个功能是真的坏掉了，而且是最容易修的那个。**

`vt-steer-now` 的「立即发送」按钮在 `0.2.2-rc.1` 上永远不出现：待生效气泡行把行首的插槽链换成了返回 `null` 的桩（`PendingSteeringBubble` 传 `renderSlotChain: NO_MESSAGE_SOURCE`），于是该行首个子节点变成 `conversation.chat.user.content` 的工厂插槽出口——一个 `display:contents` 的 div。这类元素**没有盒子**，`getBoundingClientRect()` 各项恒为 0，插件的可见性判断永假，按钮每次都被设成 `display:none`，全程不报错。

其余插件的核心链路都还在。四份分册合计 84 条发现：

| 判定 | 条数 | 分布 |
| --- | --- | --- |
| 正常 | 48 | 27 + 9 + 7 + 5 |
| 脆弱 | 22 | 5 + 8 + 5 + 4 |
| 语义变化 | 9 | 4 + 4 + 1 + 0 |
| 已失效 | 5 | 0 + 1 + 1 + 3 |

（每列依次对应 `sidebar-composer` / `flow-and-prompt` / `mcp-integration` / `rendering-and-chrome`。）

5 条已失效里只有 1 条影响用户正在用的功能，另外 4 条的形态是：1 条外部依赖构建不一致、1 条只影响诊断读数、2 条落在边缘场景或死代码。

## 三、11 个插件一览

| 插件 | 交互目的 | 判定 | 最需要注意的一条 |
| --- | --- | --- | --- |
| `vt-steer-now` | 插话卡在慢工具上时给「立即发送」，中断当前工具让消息在下一个边界被读到 | **已失效** | 「立即发送」永不出现，全程无报错 |
| `vt-use-figma` | Figma 链接走远程 MCP，并把官方技能接进 DSH | **已失效（外部依赖）** | 重新授权路径断了；令牌一过期就会撞 403 |
| `vt-uiux-enhancer` | 白纸化界面、流式时冻结阅读位置、超长消息折叠 | 正常（含脆弱） | 兜底哈希类名内容派生，已有一处漂移；诊断通道会跟着说谎 |
| `vt-gen-ui` | 把 ` ```dsh-ui ` 围栏渲染成可交互界面 | 正常（含已失效） | 跨面板排除锚点 `[data-panel-conversation]` 已改名，多面板下才会碰到 |
| `vt-sidebar-sort` | 拖动侧栏入口排序，可拖进「更多」 | 语义变化 | 自建隐藏列表与 0.2.2 新出现的官方 pin/unpin 并行，将来会打架 |
| `vt-web-chat` | 侧栏入口整页打开 chat.deepseek.com | 脆弱 | 不校验桌面壳 `protocolVersion`，协议升版后坏得看不见 |
| `vt-system-prompt` | 设置页里编辑全局指令 AGENTS.md | 语义变化 | DSH 读取两个全局根（`~/.dsh/AGENTS.md` 与 `~/.agents/AGENTS.md`），两者都存在时**都会生效**，UI 却呈现成页签二选一；本机目前只有前者，所以问题尚未显现 |
| `mcx-prompt-preset` | 把 MCX 提示词库接进输入框「+」旁 | 语义变化 | 依赖的工具行结构已过时（结果仍对），兜底选择器是全文档取首个 |
| `vt-quote-bar` | 侧栏显示 DeepSeek 余额与额度 | 脆弱 | 客户端版本硬编码 `0.2.1`；官方改为从 `DSH_CLIENT_VERSION` 取且为空即抛错 |
| `vt-mine-models` | 两段式模型选择面板 | 脆弱 | 用 `.vtmm_menu > div:first-child` 覆写内部材质层，无契约保护 |
| `vt-minedesign` | 接入本机 MineDesign 的 MCP 与编辑器面板 | 脆弱 | 路由准入用自带 `isTrusted`，本机无身份即可读；且缺 `id`，加第二条引导项就崩 |

## 四、跨插件的系统性发现

这些是单看某个插件看不出来的，也是这次核查最值得留下的部分。

### S1 · 版本闸门的保护是假的

所有插件写 `>=0.2.1-rc.5 <0.3.0`，看起来把 DSH 钉死在 `0.2.x`。实测（`semver.satisfies(v, range, {includePrerelease:true})`，与 `dsh-app-boot` 的 `satisfies()` 同参）：

| DSH 版本 | 闸门 |
| --- | --- |
| `0.2.2-rc.1` | 放行 |
| `0.3.0-rc.1` | **放行** |
| `0.3.0` | 拒绝 |

也就是说，整个 `0.3.0-rc.*` 系列——破坏性变更最密集的阶段——上界**完全不起作用**，直到 `0.3.0` 正式版才拦。写这个上界会让人误以为「升级前会被挡住」。

### S2 · 装载成功不等于行为正确

11 个插件全部 `active`，其中一个的核心功能已整体失效。DSH 的 `fiberPhase` 只反映插件是否挂载，不反映它认不认得出要在上面加东西的控件。

这解释了为什么这类退化很难被发现：**插件不报错，DSH 不报警，界面上什么异常都没有，功能就是不见了。**

### S3 · 静默降级是共同根因

本次 5 条已失效里有 4 条的共同形态是「找不到目标 → 安静跳过」：

- `vt-steer-now`：定位不到就 `display:none`；
- `vt-uiux-enhancer`：签名发现落空就走兜底，兜底也落空就什么都不做；
- `vt-gen-ui`：排除锚点失效只是少排除一些容器；
- `vt-sidebar-sort`：换序失败时顺序悄悄回到默认。

设计上都合理（不能因为找不到元素就崩），但副作用是**没有一条路径会告诉你「我这次没找到」**。

### S4 · 仓库自带的闸门不覆盖这个风险

`node scripts/check-client-bundles.mjs` 实测通过（10 个 client 模块可解析、包名与 VERSION 一致、1 个纯 host 插件跳过）；`node scripts/build-market.mjs` 通过（18 个插件、41 个版本）。两个闸门都不校验 DSH 侧锚点，所以「CI 全绿」与「功能还在」是两件事。

### S5 · 锚点选型直接决定寿命

按本次证据排序，从抗到脆：

| 稳定性 | 锚点类型 | 本次证据 |
| --- | --- | --- |
| 最稳 | **语义属性** | `[data-message-bubble]`、`[data-code-block-content]` 全程未变，`vt-gen-ui` 靠它活下来 |
| 稳 | **插槽 id** | 13 个插槽全部有效 |
| 较稳 | 内容属性 | `data-chat-flow-kind` 的 `user`/`steering`/`assistant` 三值仍在 |
| 会漂 | CSS 签名 | 依赖计算样式，DSH 改样式即落空 |
| 会漂 | 哈希类名 | 内容派生，已实证漂移（`_ghost_1rv3m_` → `_ghost_1ulci_46`） |
| 最脆 | React 内部键 | `__reactFiber$` 认行，无任何契约 |

### S6 · 同一件事在两个插件里做法不一致

路由准入：`vt-quote-bar`、`vt-steer-now`、`vt-system-prompt`、`mcx-prompt-preset` 都用宿主权威准入 `connection.requestRejection`；`vt-minedesign` 用自带的 `isTrusted`（只校验 Host 是回环，无 Origin 即放行）。实测同一端口上四个返回 403，`/vt-minedesign/sessions` 返回 200 真实数据。

### S7 · 文档里的版本基准已过期

`0.2.1-rc.5` 仍被当作「活契约」写在 3 处说明性文字里（例如 `vt-use-figma/README.md` 的「都按 0.2.1-rc.5 的活契约实现」）。`engines.dsh` 字段本身不用改，但「按哪个版本核对过」这句话已经不对了。

## 五、建议的处理顺序（本轮不执行）

| 顺序 | 事项 | 理由 |
| --- | --- | --- |
| 1 | `vt-steer-now` ST1：按插槽出口取气泡，而非 `children[0]` | 唯一整体失效的功能；改一处取值即可恢复 |
| 2 | `vt-web-chat` W5：校验 `dshDesktop.browser.protocolVersion === 1` | 一行判断，能把「打不开且原因不可见」变成可诊断 |
| 3 | `vt-use-figma` FG-05：把 profile 的 OAuth 客户端对齐到支持那三个配置键的构建 | 令牌过期后重新授权会撞 403；本机已有可用构建 |
| 4 | `vt-minedesign` MD-04：补 `id`/`commandId` | 现在靠去重检查凑巧通过，加第二条引导项就整块消失 |
| 5 | `vt-minedesign` MD-05：改用 `connection.requestRejection` | 与另外四个插件对齐，消除本机无身份可读的问题 |
| 6 | `vt-uiux-enhancer` U5/U7：让诊断能报出「兜底命中」与「认错目标」 | 不影响观感，但决定下次能不能早点发现问题 |
| 7 | 语义变化三项（两个全局指令根、MCX 工具行结构、sidebar-sort 与官方 pin 并行） | 今天不坏，但会持续误导用户或未来的改动 |
| 8 | 其余脆弱项按升级节奏跟进 | 均不影响当前使用 |

## 六、怎么复现

```bash
# 1. 抽取当前 DSH 源码（脚本已修好 asar 偏移）
node /tmp/asar-extract.mjs /tmp/dsh-full 'dsh/node_modules/@deepseek-ai' 2000000

# 2. 校验某个锚点是否还存在，以及由哪个包生产
grep -rl 'data-message-bubble' /tmp/dsh-full --include=*.js

# 3. 仓库自带闸门
node scripts/check-client-bundles.mjs
node scripts/build-market.mjs

# 4. 探测运行中的插件路由（端口取当前 Web GUI 端口）
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:53724/vt-quote-bar/api
```

`vt-uiux-enhancer` 还有一条无损的运行时读数通道：它的诊断把状态编码进主题 token 名，可用 `cordis_inspect_query` 的 client `Theme.listTokens` 读出（例如 `--vt-report-user-bubble-fixed`）。

## 七、取证边界

- **无法执行页面内 JS**：GUI 需要签名会话，所以「某个元素现在长什么样」只能通过主题 token、路由响应、崩溃日志间接取证。凡是只能间接验证的结论，各分册都标了「脆弱」并注明证据性质。
- `@deepseek-ai/dsh-client-ui-primitives` 在 `0.2.2-rc.1` **没有独立包目录**（合入 `dsh-web-frontend/dist`）。凡落在 `MenuSurface`/`Tooltip` 内部结构上的假设，只能间接验证。
- 工作区里有一个真实 git worktree `.agents/worktrees/vt-better-sidebar`，含一份插件旧副本。**全仓 grep 会把它扫进来**，核查时须显式排除，否则会把旧代码的结论算到当前插件上。
- 条件性风险已显式标注：例如「两个全局指令根都会生效」这条，写在 DSH 源码里成立（`dsh-agent-instructions` 定义了两个根），但本机当前只有 `~/.dsh/AGENTS.md`，所以属于**尚未显现**而不是正在发生。汇总时不要把它当成当前故障。
- 相邻但不属于本工作区的一项：profile 里 `@vontean/dsh-oauth-mcp-client/web-manager` 处于 `failed`，诊断信息 `cannot get property "webServer" without inject`。它与 `vt-use-figma` 依赖同一个 OAuth 客户端，影响面写在该分册里。
