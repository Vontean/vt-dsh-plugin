# VERIFY — 改动是否真的生效

界面改动最贵的成本不是改，是**判断它有没有生效**。这份文档只讲这件事。
代码侧 API 见 `client.js` 的 `diagnostics` 对象，不复述。

---

## 三种失败先分清

现象都是「改了没变化」，但修法完全不同。按顺序排除：

| # | 失败点 | 判据 | 修法 |
|---|---|---|---|
| 1 | **代码没被加载** | `--vt-report-build-<version>` 不等于 `client.js` 的 `VERSION` | 保存文件触发客户端模块热更新；确认文件真的写盘了 |
| 2 | **补丁没解析到目标** | 该补丁报 `fallback`，或 `-el-none` / `-s0-n-0` | 改签名（见 DESIGN.md 陷阱 2）或改 fallback |
| 3 | **解析到了但没赢得级联** | 补丁 `discovered`、元素 `-s0-n-1`，但计算值不变 | 进「通道 B」读该元素的真实计算值，看是谁在覆盖 |

第 3 类只能靠计算值判断 —— 样式表文本里写着你的规则，不代表它赢了。

---

## 通道 A：报告 token（始终开启）

Harness 的 inspect provider 只列 token **名字**不列值，所以客户端把测量结果编码进名字：

```
--vt-report-build-1-2-0                     当前模块的 VERSION
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

扫 `--vt-report-` 前缀即可。**完成判据**：每条补丁都有 `discovered-N`（`fallback` 表示仍在兜底工作，
可接受但要记录原因），且 `build` 与代码一致。

这个通道每次 body 变动后 600ms 重发一次，只测「解析到没有 + 首个元素的尺寸/圆角」，
刻意保持廉价。

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

每次 POST 是一条 JSON，`kind` 分四类：

| kind | 何时发 | 内容 |
|---|---|---|
| `static` | 挂载后 2.5s，及计划模式 chip 首次出现 | 输入框内所有控件的尺寸/圆角/形状/背景/阴影/字体/墨迹高，加每个控件会命中的 hover 规则 |
| `hover` | 指针进入输入框内某元素后 90ms | 该元素 + 5 层祖先 + 其 hover 规则全集（回答「谁在画这个底」） |
| `surface` | 出现新的浮层面板时 | 面板的材质、圆角、阴影、滤镜，加居中判定（锚点中心 vs 面板中心） |
| `manual` | 调用 `__vtInterface.dump()` | 同上，按需 |

**关**：`__vtInterface.probe(false)`，或把常量改回 `false`。接收端可以一直开着，空闲无开销。

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
