# DESIGN — 插话立即生效（dsh-vt-steer-now）

## 1. 问题

DSH 的「插入消息」（steer）不会立刻被模型读到，而是等一个 **step 边界**。用户观察到：
消息发出后要等当前工具执行完才生效，慢工具（bash、构建、抓取）会让等待变得明显。

## 2. 机制事实（来自 `@deepseek-ai/dsh-agent-loop` 与 `dsh-api-session-controller`）

| 事实 | 位置 |
|---|---|
| `prompt()` 按 `mode === 'steer'` 分流：steer → `agent.steer()`，否则 `agent.followup()` | `dsh-api-session-controller` |
| `followup` 投 `inbox["next-turn"]`，`steer` 投 `inbox["next-step"]`，`inject` 投 next-step 但不唤醒 | `dsh-agent-loop` `ReactLoopAgent.send()` |
| 每个 step 开始时 `preStep` 调 `inbox.claim(target)`：先取全部 next-step，若开新回合再取 1 条 next-turn，合并成一批请求 | `ReactLoopAgent.preStep()` / `inbox.claim()` |
| 一个 step = 1 次模型请求 + 该请求产生的工具调用；工具执行期间**没有**边界，也不检查 inbox | `ReactLoopAgent.step()` |
| 只有整回合 `cancel` 可用，没有单工具中断接口 | `context.cancel()` / `AI sessions.cancel` |
| `cancel(cause, { keepInbox: true })` 只中止、不清空待处理消息 | `ReactLoopAgent.cancel()` |
| abort 置位后 `send()` 走 `wakingAfterAbort`：改投 next-turn 并锁存一次唤醒 | `ReactLoopAgent.send()` / `wakeDriver()` |

由此得到结论：**「立即影响」在机制上只能是「结束当前 step，尽快发起下一次模型请求」**。
工具执行期间模型并未在推理，它只是在等结果，所以不存在「塞进去让模型马上看见」的中间态。

## 3. 方案选择

| 方案 | 结论 |
|---|---|
| A. 等工具结束（现状） | 不需要改动，但延迟不可控 |
| B. Host 原子操作：移出 → cancel(keepInbox) → followup | **采用**：保住同一条消息（附件、`rpcId`、id），没有 RPC 竞态 |
| C. 纯前端：updateQueue(remove) → cancel → prompt 重发 | 否决：丢附件、产生新消息 id、两条 RPC 之间有竞态 |
| D. 替换 `conversation.chat.flow` 槽位包一层 | 否决：需要重写整个聊天流，升级极脆弱 |

方案 B 的关键顺序：

```js
agent.inbox.remove(itemId);                       // 先移出，避免重复投递
if (running) agent.cancel({ kind: 'user' }, { keepInbox: true }); // 只中止，不清队
agent.followup(message);                          // abort 已置位 → next-turn + 锁存唤醒
```

第二步的 `keepInbox` 很重要：不带它会把其他排队消息一起清掉。

## 4. 交互

- **显示条件**：当前会话有 `placement === 'steering'` 的队列项 **且** `running` **且**
  DOM 中存在 `div[data-tool][data-state="running"]`。三者同时满足才显示，避免干扰
  正常快速生效的场景。
- **位置**：待生效气泡下方、与时间/图标同一行的左侧；按钮是 body 下常驻浮层的子节点，
  用气泡父容器里最后一个子元素（时间 + 图标操作行）的矩形做定位，结构不符时退回气泡右下角。
- **视觉**（全部取自 DSH 的真实 token，不使用品牌蓝）：

  | 项 | 取值 |
  |---|---|
  | 气泡背景 | `--dsw-specific-bubble`（light `#edf3fe`） |
  | 气泡正文 | `--dsh-content-font-size` 14px / 22px，字重 400 |
  | 气泡圆角 / 内边距 | 22px / 10px 16px |
  | 操作行 | 高 28px，`--dsh-content-font-size-secondary` 13px / 24px |
  | 文字颜色 | `--dsw-alias-label-tertiary`（light `#81858c`），悬停 `label-secondary` |
  | 时间 | 13px，`label-tertiary`，右内边距 12px |

- **文案**：`立即发送`；悬浮提示说明「当前工具正在执行，点击中断它」。
- **失败**：`claimed` 表示消息已被正常 claim（此时队列变化会让按钮消失），静默收敛；
  其他失败显示「立即发送失败」并恢复可点。
- **不做**：不改输入框区域、不加常驻状态条、不替换任何聊天行渲染。

## 5. 客户端状态来源

- `uiSession.current.getSnapshot()` → `{ key: sessionId, ctx }`；
- `binding.ctx.get('conversation').snapshot` → 含 `queue` 与 `running` 的会话快照；
- 工具运行态只能从 DOM 判定（快照里没有当前工具执行状态），这是本插件最脆的一处，
  依赖 `data-tool` / `data-state` 两个属性名。
- DOM 变化用 `MutationObserver` + 120ms 合并窗口，滚动/缩放用捕获阶段监听重新定位。

## 6. 风险与已知限制

1. **中断代价**：正在跑的工具会被杀；`bash` 之类的写入型工具可能留下半完成状态。
   文案必须说明，不能只写「立即发送」。
2. **属性名依赖**：`data-pending-steering` 与 `data-tool[data-state]` 是 DSH 内部标记。
   升级后若改名，按钮不再出现（功能静默失效，不会报错）。
3. **序号对齐**：气泡与队列项按顺序一一对应；若同屏出现本地 echo 与权威气泡混合，
   需要确认 `[data-pending-steering]` 只命中权威气泡（代码里 echo 走 `data-submission-echo`）。
4. **子会话**：`agents.get(sessionId)` 拿不到时返回 `offline`，按钮点击不生效；后续可扩展
   `interruptByParent`。

## 7. 验证计划

1. `node --check` 两个半边；`node scripts/check-client-bundles.mjs` 过拼接校验。
2. 安装后确认 Host 路由存在（`POST /vt-steer-now/api/preempt` 返回 400/正常 JSON）。
3. 真机：发起一个长工具（如 `sleep 30`），期间插一条消息，确认按钮出现、点击后
   工具被中断且消息在下一个回合第 1 步被读到。
4. 反例：工具未运行时按钮不出现；消息被 claim 后点击返回 `claimed`。
5. 刷新页面、切换会话后浮层状态正确。
