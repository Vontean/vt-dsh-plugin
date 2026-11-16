# 01 · DeepSeek 全家桶应用 API 调研

> 调研时间：2026-11-16
> 官方发布：2026-11-13，[DeepSeek 发布全家桶应用 API](https://api-docs.deepseek.com/zh-cn/news/news261113/)
> 适用模型：V4.1-Flash（`deepseek-flash`）

## 1. 这次开放了什么

过去，DeepSeek API 只提供模型推理；联网搜索、文件解析、读链接、语音这些「DeepSeek App / 网页端」的能力，
需要开发者自己接外部工具、自己拼上下文。这次把这些能力直接整合进原有 API：

> 在原有 API 中开启对应参数，即可获得深度思考搜索、文件输入等对话功能；
> 相关工具调用与上下文拼接均由服务端自动完成。

当前 `deepseek-flash` 在 **Messages、Responses、Chat Completions** 三种协议下都支持下列能力。
这意味着：如果只是想做「一个能解释概念的小聊天窗」，不需要自己实现搜索、抓网页、解析文件；
在请求里声明工具即可，服务端会完成调用与上下文拼接。

## 2. 能力矩阵

| 能力 | 开启方式 | 对 quick chat 的价值 | 第一版是否采用 |
|---|---|---|---|
| 普通对话 | 直接 `messages` / `input` | 解释概念、举例、对比 | ✅ 核心 |
| 联网搜索 | 声明 `deepseek_web_search`，关闭思考 | 解释新词、查最新资料、带引用 | ⏸ 第二版可选 |
| 深度思考搜索 | 声明 `deepseek_web_search`，开启思考 | 多步推理 + 搜索 + 打开网页 + 页内查找 | ❌ 第一版不做 |
| 图片搜索 | `deepseek_web_search` + 用户消息带图 | 以图搜图、解释图片 | ❌ 第一版不做 |
| 阅读链接 | 声明 `deepseek_read_url` | 用户粘贴文档/网页链接，快速读懂 | ⏸ 第二版可选 |
| 文件输入 | 上传 PDF / Office / 图片，服务端解析 | 让模型读一份资料再解释 | ❌ 第一版不做 |
| 模型内容安全 | `safety_check: { level: "low" \| "high" }` | 对外服务时审核输入输出 | ⏸ 按使用场景决定 |
| 用户元信息 | 日期、所在地、语言 | 让回答更贴合用户环境 | ⏸ 可选 |
| 会话标题 | `title` 参数 | 自动起标题 | ❌ 不需要（quick chat 不进会话列表） |
| 语音合成 / 识别 | 独立 TTS / ASR 接口 | 朗读回答、语音提问 | ❌ 第一版不做 |
| OCR | 独立接口 | 图片文字识别 | ❌ 第一版不做 |

## 3. 三种协议下的工具声明

### 3.1 Messages（DSH 当前 DeepSeek adapter 使用的协议）

```json
{
  "model": "deepseek-flash",
  "thinking": { "type": "enabled" },
  "tools": [
    { "type": "deepseek_web_search", "name": "deepseek_web_search" },
    { "type": "deepseek_read_url", "name": "deepseek_read_url" }
  ],
  "messages": [{ "role": "user", "content": "DeepSeek V4.1 有哪些更新？" }],
  "stream": true
}
```

### 3.2 Responses

```json
{
  "model": "deepseek-flash",
  "reasoning": { "effort": "high" },
  "tools": [
    { "type": "deepseek_web_search" },
    { "type": "deepseek_read_url" }
  ],
  "input": "DeepSeek V4.1 有哪些更新？",
  "stream": true
}
```

### 3.3 Chat Completions

```json
{
  "model": "deepseek-flash",
  "thinking": { "type": "enabled" },
  "tools": [
    { "type": "deepseek_web_search" },
    { "type": "deepseek_read_url" }
  ],
  "messages": [{ "role": "user", "content": "DeepSeek V4.1 有哪些更新？" }],
  "stream": true
}
```

### 3.4 关键限制

- `tool_choice` **不能**指定 `deepseek_web_search` / `deepseek_read_url`，否则 400；
  是否搜索由模型判断。
- `tool_choice: "none"` 会关闭全部工具，包括阅读链接。
- 使用这些工具时请用 `deepseek-flash`。
- 联网工具不能和普通 `web_search` 工具同时声明；也不支持 `allowed_domains`、`blocked_domains`、`user_location`。
- 联网工具不能和 `web_search_options` 同时出现（Chat Completions）。

## 4. 返回结构与多轮

### 4.1 服务端工具块

一次工具调用会产生：

1. `server_tool_use`：`name`、`input.action`、`kind`；
2. 结果块：`web_search_tool_result` 或 `web_fetch_tool_result`；
3. 正文 `text` 块，可能带 `citations`。

`kind` 取值：

| kind | 含义 |
|---|---|
| `search` | 普通联网搜索 |
| `deep_search` | 深度思考搜索中的搜索/打开网页/页内查找 |
| `read_link` | 阅读用户消息中的链接 |
| `image_search` / `deep_image_search` | 图片搜索 |

### 4.2 多轮必须原样回传

- 每一轮都要携带完整历史，并把上一轮 assistant 的回复**原样回传**，保留 `kind` 和 `signature`。
- 阅读链接得到的网页正文不在块里，而是加密在 `signature` 中；不原样回传，下一轮就读不到这个网页。
- 搜索结果、打开的网页、之前轮次的思考**不会**进入后续轮次的上下文，只保留回答正文。
- 使用过 `deepseek_web_search` / `deepseek_read_url` 的回复**不能续写**（会 400）。

> 对 quick chat 的含义：如果第一版只做普通对话，多轮就是普通 messages，简单。
> 一旦打开联网/读链接，就必须把服务端工具块和 `signature` 完整保存在 quick chat 的本地历史里，
> 否则第二轮会丢上下文。

### 4.3 引用

- 回答引用来源时，`text` 块带 `citations`，每条包含 `url`、`title`、`cited_text`。
- 流式输出时，引用通过 `citations_delta` 事件下发。
- Chat Completions 的引用在 `message.annotations`（`url_citation`），不在正文角标里。

## 5. 计费

除 Token 费用外，工具调用另行计费：

| 项目 | 价格 |
|---|---|
| 文字 / 图片搜索 | 5 元 / 千次 |
| 网页抓取 | 5 元 / 千次 |
| 文字识别（OCR） | 1.5 元 / 千页 |
| 语音识别（ASR） | 0.39 元 / 小时（限时 5 折） |
| 语音合成（TTS） | 1.5 元 / 万字符（限时 5 折） |

计费口径（来自官方文档）：

- 网页搜索：一次调用包含 N 个查询词，按 N 次计费；调用失败或无结果不计费。
- 图片搜索：每张图 1 次；框选区域每个区域另计 1 次。
- 网页抓取：按成功抓取的网页数计费；失败不计费。
- 深度思考搜索中重复打开同一网页、页内翻页、打开搜索结果里已带内容的网页不计费。

> 对 quick chat 的含义：**默认关闭联网**，用户显式打开「联网」再计费；
> UI 上要有「联网」徽标和一次性的费用提示，避免用户以为 quick chat 是免费的。

## 6. 独立接口：Search / Fetch / OCR / ASR / TTS

官方同时开放了底层能力，可单独调用。对 quick chat 最有价值的是 **Search / Fetch**：

- 如果不想依赖 DeepSeek 的「服务端工具」协议，可以在 Host 半边先调用 Search API 拿到结果，
  再把结果作为普通文本拼进 `ctx.llm.stream()` 的 messages；
- 这样仍然走 DSH 的 provider / 凭证 / 模型选择，不需要绕过 DSH 的 LLM 服务；
- 代价是引用、深度搜索、页内查找等行为要自己实现一部分。

官方指南：
- [构建 Chatbot](https://api-docs.deepseek.com/zh-cn/guides/build_a_chatbot/)
- [联网工具](https://api-docs.deepseek.com/zh-cn/guides/web_tools/)
- [网页搜索与抓取（独立接口）](https://api-docs.deepseek.com/zh-cn/guides/search.md)

## 7. 在 DSH 里的接入判断

DSH 的模型调用入口是 `ctx.llm.stream()`（见 `@deepseek-ai/dsh-llm`），
DeepSeek 的 Messages adapter 是 `@deepseek-ai/dsh-llm-deepseek`。
这带来一个必须确认的边界：

> **DSH 的 `GenerateOptions.tools` 是 agent 工具定义，不是 DeepSeek 的「服务端工具」声明。**
> `deepseek_web_search` / `deepseek_read_url` 是 DeepSeek 特有的工具类型，
> 当前 adapter 是否原样透传，需要一次 spike 验证。

### 方案 A：普通 `ctx.llm.stream()`（推荐第一版）

- 只用 messages，不声明服务端工具；
- 联网需求通过独立 Search API 在 Host 半边完成，再把结果拼进 messages；
- 优点：完全走 DSH 的 provider / 凭证 / 模型选择 / 取消 / 错误码；实现简单；
- 缺点：没有 DeepSeek 原生的深度搜索、引用块、`signature` 多轮回传。

### 方案 B：Host 直接调用 DeepSeek Chat Completions / Responses

- 在 Host 半边用 `fetch` 直接请求 `https://api.deepseek.com/chat/completions` 或 `/responses`；
- 声明 `deepseek_web_search` / `deepseek_read_url`，获得 1:1 网页端行为；
- 需要自己解析凭证（API Key 或 account grant）、自己处理流式块、自己保存 `signature`；
- 优点：能力最完整；缺点：绕过 DSH LLM 服务，模型选择、重试、计费口径都要自己接。

### 方案 C：扩展 DSH 的 DeepSeek adapter

- 通过 `ctx.deepseekLlmApiExtensions` 增加顶层字段；
- 但 `tools` 已经是基础请求字段，不能作为「新增字段」注入；
- 需要改 adapter 或新增一个 provider，属于上游改动，不建议作为插件方案。

**建议**：第一版走 A；把「联网」作为第二版的可选增强，先验证 A + 独立 Search API 的体验是否足够。
如果产品上明确要求「和 DeepSeek 网页端一样」的深度搜索/引用，再评估 B。

## 8. 安全与隐私

- API Key / account token **只在 Host 半边**使用，客户端只拿同源路由的流式结果。
- quick chat 的内容会发送给模型 provider；UI 上应有一句简短说明。
- quick chat **不写入 DSH session log**，但本地历史（如果开启）会存在浏览器 `localStorage`。
- 如果打开联网，查询词会发送给 DeepSeek 的搜索服务；UI 上要有「联网」状态。
- 如果对外提供服务，官方要求开启 `safety_check`，并承担内容安全审核、大模型登记、AI 标识等义务。
  个人自用场景可以按实际合规要求决定。

## 9. 待确认问题

1. `dsh-llm-deepseek` 是否支持 `tools: [{ type: "deepseek_web_search" }]`？
   需要写一个最小 spike，确认请求是否原样到达 DeepSeek、响应块是否能被 `BlockAssembler` 处理。
2. quick chat 用哪个模型？
   建议读 `ctx.agentDefaultModel.currentSelection()`，或跟随当前 session 的模型；
   需要一个明确的降级顺序。
3. 用 API Key 路由还是 account 路由？
   `ctx.llm.listProviders()` 会给出当前可用路由；quick chat 不应该假设只有一种。
4. 联网的引用 UI 是否第一版就要做？
   如果第一版不做联网，引用可以延后；如果做，需要设计 citation chip 和来源列表。
5. 计费提示的粒度？
   每次打开联网时提示一次，还是每个回答显示 token/工具次数？建议第一版只做「联网」徽标 + 一次性提示。
