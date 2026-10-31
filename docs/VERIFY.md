# VERIFY — 改动是否真的生效

界面改动最贵的成本不是改，是**判断它有没有生效**。这份文档只讲这件事。
代码侧 API 见 `client.js` 的 `diagnostics` 对象，不复述。

---

## 三种失败先分清

现象都是「改了没变化」，但修法完全不同。按顺序排除：

| # | 失败点 | 判据 | 修法 |
|---|---|---|---|
| 1 | **代码没被加载** | `--vt-report-build-<version>` 不等于 `client.js` 的 `VERSION` | 保存文件触发客户端模块热更新；确认文件真的写盘了 |
| 2 | **补丁没解析到目标** | 该补丁报 `fallback`，或 `-el-none` / `-s0-n-0` | 改签名（见 `DEVELOPMENT.md` 陷阱 2）或改 fallback |
| 3 | **解析到了但没赢得级联** | 补丁 `discovered`、元素 `-s0-n-1`，但计算值不变 | 进「通道 B」读该元素的真实计算值，看是谁在覆盖 |

第 3 类只能靠计算值判断 —— 样式表文本里写着你的规则，不代表它赢了。

---

## 通道 A：报告 token（始终开启）

Harness 的 inspect provider 只列 token **名字**不列值，所以客户端把测量结果编码进名字：

```
--vt-report-build-<version>                  当前模块的 VERSION
--vt-report-composer-submit-discovered-1    该补丁解析状态
--vt-report-composer-submit-size-28x28      命中元素的首个尺寸
--vt-report-composer-submit-radius-999px    命中元素的计算圆角
--vt-report-<id>-s0-n-1                     第 0 个选择器命中 1 个元素
--vt-report-<id>-el-none                    选择器完全没命中
```

读取：

```
cordis_inspect_query(platform="client", provider="Theme", method="listTokens")
```

扫 `--vt-report-` 前缀即可。**完成判据**：每个 `component` 补丁都有 `discovered-N`（`fallback` 表示仍在
兜底工作，可接受但要记录原因），且 `build` 与代码一致。

`behavior` 补丁在这里**不会出现** —— 它不解析选择器。它的判据是
`__vtInterface.behaviors()` 返回 `installed === total` 且 `errors` 为空，见下一条通道。

这个通道每次 body 变动后 600ms 重发一次，只测「解析到没有 + 首个元素的尺寸/圆角」，
刻意保持廉价。

`view-tabs` 的 `size-0x0` 是**预期结果**，不是失败：这个补丁压的就是标签行的高度。
它只证明规则落到了标签行上；「有没有真的藏住、高度有没有还回去」只能看探针的 `viewSwitch`。

---

## 通道 B：探针（按需开启）

回答「这个元素**现在**的计算样式是什么」。默认关闭 —— 发布态不该带定时器和网络请求。

**开**

```bash
node tools/dump-receiver.mjs        # 127.0.0.1:8899，落到 /tmp/vt-dump.jsonl
```

然后二选一：

- 运行中打开：控制台执行 `__vtInterface.probe(true)`；
- 或把 `client.js` 里的 `PROBE_ENABLED` 改成 `true`（保存即热更新）。

**看**

```bash
tail -f /tmp/vt-dump.jsonl | jq -c 'select(.kind=="hover") | .hovered'
```

每次 POST 是一条 JSON，`kind` 分五类：

| kind | 何时发 | 内容 |
|---|---|---|
| `static` | 挂载后 2.5s，及计划模式 chip 首次出现 | 输入框内所有控件的尺寸/圆角/形状/背景/阴影/字体/墨迹高，加每个控件会命中的 hover 规则 |
| `hover` | 指针进入输入框内某元素后 90ms | 该元素 + 5 层祖先 + 其 hover 规则全集（回答「谁在画这个底」） |
| `surface` | 出现新的浮层面板时 | 面板的材质、圆角、阴影、滤镜，加居中判定（锚点中心 vs 面板中心） |
| `rail-preview` | 挂载后 4s，用合成 `pointermove` 打开轮次条预览 | 预览卡的几何、材质、字体（`static`/`manual` 里也有 `rail` 块） |
| `manual` | 调用 `__vtInterface.dump()` | 同上，按需 |

`static` 里另有几个直读字段，用来免交互确认：

| 字段 | 含义 |
|---|---|
| `titles` | 输入框内还残留多少个原生 `title`；接管生效时应为 `0` |
| `titlesDoc` | 全文档的 `title` 数量，用于确认接管范围只落在输入框 |
| `tipCss` | 自绘 tooltip 的 CSS 是否已注入 |
| `tip` | 自绘气泡节点当前状态（未 hover 时为 `null`） |
| `controls[].svg` | 输入框内每个按钮图标：盒子尺寸、计算描边、第一个图形的墨迹盒。改图标大小时三个数一起看 |
| `rail` | 轮次跳转条：条本身/所在容器/侧栏/正文墨迹左缘的位置与尺寸，单根刻度的计算值（长度、颜色、`scaleX`、缓动），预览卡与 `:has()` 波峰规则是否被浏览器保留 |
| `convo` | 会话视口：滚动容器/输入框座/视区的矩形与计算值、`scrollTop` 与两端是否到头、注入的渐隐覆盖层是否在位（两条带的 24px 高度与不透明度、底带偏移） |
| `viewSwitch` | 视图切换入口：`header`（会话 header 实测高，应从 76 掉到 51）、`tabs`（标签行实测高、当前标签、**仍在 DOM 里的标签文案**）、`entry`（入口按钮的类名/几何/图标/`aria-label`）、`dock`（状态行成员的文案与顺序） |

`viewSwitch` 要按顺序读三个值，缺一个都会误判：

- `tabs.labels` 必须有两个（对话 + 轨迹）。只剩一个说明标签行被 `display:none`，React 的宽度预算塌成 1，
  第二个标签被挪进「…」菜单 —— 入口也就点不到它了（见 `DEVELOPMENT.md` 陷阱 9）。
- `tabs.height` 必须是 `0`。隐藏靠的是压高度，标签行的 `display` 仍然是 `flex` —— 看 `display` 会误判成
  「没藏住」，看 `header` 又会漏掉「藏了但没还高度」。
- `entry` 不为 `null`，`text` 与 `aria-label` 等于当前**不在**的那个视图名，`svg` 的墨迹盒在两个方向不同
  （列表 7×8 / 左箭头 3×7）—— 这对数能证明图标真的换了。
- `dock` 里入口必须排第一，后面才是「N 轮 N 步」与用量。

切视图是双向的：进入轨迹页后 `tabs.active` 变「轨迹」、`entry.text` 变「对话」；返回后两者复原。
这条链路没有公共 API，所以它必须被实测过一次，不能靠读代码推断。

`rail` 里有两个字段不看数值也要看一眼：`textLeft`（正文墨迹左缘）与 `frame.x`。
两者之差就是跳转条和文字之间的余量；改成负数说明它压到正文上了。

`convo.fade` 的三个值要一起看：`top`/`bottom` 是「这一侧还有隐藏内容」的判定，`bandBottom.offset`
必须等于输入框座的高度（实测 122px）—— 偏移错了，底带就会压在卡片上或飘在半空。

**关**：`__vtInterface.probe(false)`，或把常量改回 `false`。接收端可以一直开着，空闲无开销。

**悬停态是个例外。** `:hover` 不是声明，计算值里读不出来，探针只能证明「规则被浏览器保留」
（`rail.wave.parsedHasRules`）和「预览卡挂载后的样子」（`rail-preview`）。波峰本身要真指针
滑一遍才能确认 —— 录屏或直接上手，别用探针冒充。

依赖只有 `node`。探针只往 `127.0.0.1` 发数据，不出网。

---

## 生效范围

| 改的东西 | 生效方式 |
|---|---|
| `client.js`（含新增/修改补丁、token、探针） | 保存即热更新，**不重启** |
| `index.js`（host 半边） | 需要重启应用；它目前是空实现 |
| `cordis.patch.yml`、`package.json` 的 `dsh` 字段 | 需要重启应用（装载期读取） |

## 复核作用面

探针只打印带 `!important` 的规则，而 Harness 上游不这么写 —— 所以打印出来的就是本插件实际发出的
**全部** CSS 规则。新增补丁后跑一次 `static` dump，确认规则数量和选择器都在预期内，就能证明没有
波及到输入框以外的组件。

`myCss` 截断在 12000 字符（当前约 8.7k）。余量过半时先抬高截断值，否则上面那句「全部」就不成立了。
