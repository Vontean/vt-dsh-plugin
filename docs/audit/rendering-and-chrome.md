# 渲染与界面装饰层：稳固性核查

核查对象：`plugins/vt-uiux-enhancer`、`plugins/vt-gen-ui`。本轮只记录，不修改任何插件源码。

## 核查口径

| 项 | 值 |
| --- | --- |
| 运行中的 DSH | `0.2.2-rc.1`（`/Applications/DeepSeek Harness.app` 的 `Info.plist` 与 `@deepseek-ai/dsh-app-boot` 的 `package.json` 一致） |
| 插件开发时基准 | 各插件 `README`/`engines.dsh` 声明为 `>=0.2.1-rc.5 <0.3.0` |
| DSH 源码基准 | 从 `app.asar` 抽出的 330 个 `@deepseek-ai` 包（含 `src/*.ts` 与 `lib/*.js`）到 `/tmp/dsh-full` |
| 运行时状态 | 两个插件均为 `enabled: true` / `fiberPhase: active`，没有装载失败 |
| 方法 | 先读意图文档 → 提取插件读取的 DSH 侧锚点 → 逐条到源码确证存在性与语义 → 再用插件自带的实时报告通道交叉验证 |

判定分四档：

- **正常**：锚点存在且语义一致。
- **语义变化**：锚点还在，但含义或位置变了，插件按旧语义使用会得到错误结果。
- **已失效**：锚点已从 DSH 消失，对应功能不再生效。
- **脆弱**：当前能工作，但依赖的稳定性假设不成立，下一次 DSH 更新容易断。

## 结论一句话

两个插件的**主链路都还在工作**：`vt-uiux-enhancer` 的 15 个组件补丁全部定位成功、1 个走固定锚点；`vt-gen-ui` 的围栏识别依赖的代码块锚点全部存在。失效的是一处跨面板排除、一处诊断扫描，加上若干「当前只是没被触发」的脆弱点。

---

## vt-uiux-enhancer 1.2.9

### 交互目的

把 Harness 调成干净的白纸界面，并在流式回答时冻结阅读位置、把超长用户消息折叠成 20 行。它不改 Harness 代码，而是**在运行时认领 Harness 的控件**，给它们补一条 CSS。因此它天然依赖「怎么认出那个控件」。

### 定位机制（判断稳固性的前提）

每个补丁有两套定位手段：

1. **CSS 签名发现**：按计算样式的几条声明去认控件（例如 `height:28px` + `border-radius:var(--dsw-radius-sm)`）。语义稳定，但 DSH 改样式就会落空。
2. **哈希类名兜底**：`fallback: '.JZLxKW_primary'` 这类 DSH CSS Module 生成的类名。精度高，但哈希会随样式内容变化而漂移。

另有一个补丁改用**固定属性锚点**（`fixedSelector: '[data-message-bubble]'`）。

### 实时证据

插件把每个补丁的定位结果编码进主题 token 名，可无损读出。本次读数：

| 读数 | 含义 |
| --- | --- |
| `--vt-report-build-1-2-9` | 运行的是 1.2.9 |
| `--vt-report-behaviors-6-of-6` | 6 个行为补丁全部安装成功 |
| `--vt-report-user-bubble-fixed` | 用户气泡走的是固定属性锚点，已命中 |
| `--vt-report-messages-rows-13-bubbles-11-clamped-1-expanded-0` | 13 个消息行、11 个气泡、1 个处于折叠态 |
| `--vt-report-messages-first-lines-213-max-418px-...-lh-22px` | 折叠按实测行高 22px 计算，`max-height` 418px |
| `--vt-report-scroll-pin-hook-installed` | 滚动冻结钩子已装 |

其余组件补丁的读数是 `discovered-1`（或 `-2`），即签名发现成功。

### 发现列表

| 编号 | 失效时的用户可见现象 | 依赖的锚点原文 | DSH 侧证据 | 判定 | 建议加固方向 |
| --- | --- | --- | --- | --- | --- |
| U1 | 无用户可见影响；诊断读数会误报「仍存在」 | `vtSheetScan(['pn0E2q_trigger','kKSgSq_chip','_ghost_1rv3m_','SJRB_q_trigger'])`（`client.js:3729`） | `_ghost_1rv3m` 在 DSH 中已 0 命中；同类控件现为 `_ghost_1ulci_46`（`dsh-client-ui-primitives` / `dsh-web-frontend` 样式产物） | 已失效 | 把这条扫描改为「按属性/角色扫描」而非哈希；或直接从扫描表移除，避免诊断说谎 |
| U2 | 签名发现某天落空时，兜底若同时漂移，该控件静默失去样式（无报错） | 14 个兜底类名：`.TQ0rwa_pill` `.JZLxKW_primary` `.JZLxKW_row` `.JZLxKW_select` `.JZLxKW_add` `.pn0E2q_trigger` `.htuFrW_trigger` `.kKSgSq_chip` `.mR10tW_panel` `.X0HXfW_panel` `._4if9eW_frame` `.kiGsTW_tabs` `.kB3qhq_newSession` `._6DJyyG_panel` | 14/14 当前仍在（分别命中 `dsh-client-ui-chat`、`dsh-client-ui-conversation`、`dsh-client-ui-plan`、`dsh-client-ui-model-selection`、`dsh-client-ui-sidebar`、`dsh-experimental-client-ui-voice-input`） | 脆弱 | 哈希是**内容派生**的（U1 已证明会漂移）。给每个兜底配一条等价属性锚点，或让兜底命中时在诊断里显式标记 `fallback`（目前只报 `fixed`/`discovered`，兜底成功不具名） |
| U3 | 用户消息折叠整块失效 | `fixedSelector: '[data-message-bubble]'`（`client.js:1215`） | `data-message-bubble` 只由 `dsh-client-ui-chat` 一处生产（`lib/client.js:9394`），挂在 `UserMessageBubble` 原语上 | 正常 | 无。这是表现最好的一条，因为它不依赖类名或样式 |
| U4 | 用户消息行定位与「回答行」识别出错 | `[data-chat-flow-kind="user"]`、`="steering"`、`="assistant"`；`[data-chat-group-part="response"]`、`="reasoning"` | 三个 kind 值均存在（`dsh-client-ui-chat` 的 `routedNode.kind`，写入点 `lib/client.js:4589`）；`group-part` 同源 | 正常 | 无 |
| U5 | 无直接影响；会让诊断读不出真实漂移 | `composer-select-chips` 报 `discovered-2`，但 `s0-n-0`（第 0 个候选 0 命中）、`s1-n-1` | 两个候选里一个长期零命中；DSH 侧 chips 仍在（`.kKSgSq_chip` 命中 `dsh-client-ui-plan`） | 脆弱 | 候选表里零命中的条目应被剔除或标记，否则「发现成功」这个结论永远成立，掩盖漂移 |
| U6 | 目前无可见异常 | `view-tabs` 报 `size-352x0`、`turn-rail` 报 `size-0x0` | 命中的元素确实存在，但高度为 0（多为 `display:contents` 包装或当前未展开的视图） | 脆弱 | 在「双标签 / 多视图」场景下复核一次，确认零尺寸是布局本意而非认错元素 |
| U7 | 无；但会让所有上述诊断失去可信度 | `publishReport` 把状态编码进 token 名（`client.js:1598`） | 该通道只报「匹配到几个元素」，不校验「匹配到的元素是不是那个控件」 | 脆弱 | 诊断加一项自检：命中的元素必须同时具备预期的角色/属性，否则报 `wrong-target` |

### 这一段小结

主链路健康，问题集中在**兜底层与诊断层**，不在功能层。最该先处理的是 U5 与 U7：它们不影响今天的观感，但会让「看起来一切正常」这个判断本身不可靠——这正好解释了为什么这类失效很难被发现。

---

## vt-gen-ui 1.1.0

### 交互目的

把模型写在回答里的 ` ```dsh-ui ` 围栏渲染成可交互界面。它的核心难题是**在 Harness 的 DOM 里认出哪一段是围栏代码块**，并且只认一次、不重复接管。

### 发现列表

| 编号 | 失效时的用户可见现象 | 依赖的锚点原文 | DSH 侧证据 | 判定 | 建议加固方向 |
| --- | --- | --- | --- | --- | --- |
| G1 | 单个会话视图下无影响。多会话并排或分栏时，非活动会话面板里的围栏可能被一并接管，或标签文本被误扫 | `[data-panel-conversation]`，出现在 `TAG_TEXT_EXCLUDES`、`FENCE_ATTRIBUTES` 与 `closest()` 排除链（`src/client/dom-fence.tsx:123,139,620`） | DSH 中该属性 0 命中。现在会话区域用 `data-conversation-session`（`dsh-client-ui-conversation/lib/client.js:20603`）与 `data-conversation-region="chat"｜"composer"`（同文件 `20596`/`20604`）标记 | 已失效 | 需要重新定位「非活动会话面板」的等价锚点。**不要**直接换成 `data-conversation-region`：正文本身就在 `region="chat"` 里，换了会把围栏一起排除 |
| G2 | 全部围栏都无法识别，插件等于失效 | `.md-code-block`、`.code-block`、`.code-block-small`、`[data-code-block-content]`（`src/client/dom-fence.tsx:75,160`） | `.md-code-block` 仍在 `dsh-web-frontend` 与 `dsh-client-ui-trajectory`；`.code-block-small` 仍在 `dsh-client-ui-tool`/`-skill`/`-theme`；`data-code-block-content` 由 `dsh-web-frontend` 生产 | 正常 | 无。这是整个插件最关键的一条锚点，目前最稳 |
| G3 | 无影响，属死代码 | `MutationObserver` 的 `attributeFilter` 含 `'data-theme'`（`src/client/blocks/advanced.tsx:422`） | DSH 从不设置 `data-theme`（0 命中）；深色主题靠 `data-ds-dark-theme`（30 处），后者已被同一 filter 覆盖 | 已失效 | 从 filter 里删掉，减少一次误导性观察 |
| G4 | 围栏在侧栏 / 插件面板里被误接管 | `[data-sidebar-chat]`、`[data-sidebar-right-session]`、`[data-sidebar-right-panel]`、`[data-plugin-panel]`、`[data-tool]`、`[data-chat-group-part="reasoning"]` | 全部存在：`data-sidebar-chat` 由 `dsh-client-ui-subagent` 生产（1 处）；`data-sidebar-right-*` 由 `dsh-client-ui-sidebar-right` 生产；`data-plugin-panel` 由 `dsh-client-ui-plugin-manager` 生产；`data-tool` 13 处 | 正常 | 无 |
| G5 | — | 声明 `dsh.client.inject: []`，不注入任何客户端包 | 与 `vt-uiux-enhancer` 不同，它不依赖 `@deepseek-ai/dsh-client-ui-*` 的内部导出 | 正常 | 无。这是它比同类插件更抗版本变化的原因 |

### 这一段小结

`vt-gen-ui` 的锚点选择明显更克制：核心识别只依赖 `data-code-block-content` 这类**语义属性**，不碰样式签名，也不碰哈希类名。唯一失效的 `data-panel-conversation` 属于「多面板」边缘场景，单面板下不影响。

---

## 两者对比得到的经验

`vt-uiux-enhancer` 是「必须认领别人的控件」，所以必然依赖样式与类名，脆弱点集中且可预期；`vt-gen-ui` 是「识别一段内容」，只依赖语义属性，所以抗得住。

这条差异值得写进插件规范：**能用属性锚点的地方不要用类名或样式签名**；用了就必须接受「每次 DSH 更新都要重新取证」的维护成本。
