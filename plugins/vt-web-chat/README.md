# dsh-vt-web-chat · 网页对话

在「新会话」正下方加一行「网页对话」入口。点开后，主内容区是一整套 DeepSeek 网页版的界面，
但页面由插件自己托管：请求走 DeepSeek API，用你已登录的 DeepSeek 账户代发，
不需要再登录一次，也不需要填 API Key。

## 它改了什么

- 侧栏「新会话」下面多一行「网页对话」，点击后在主内容区打开整页对话面板；
- **默认不展开自己的侧栏**：进入面板先看到对话；需要会话列表时点左上角的展开按钮，
  之后按你的选择记住（升级到本版本时会强制收起一次）；
- **与 DSH 的悬浮岛避让**：DSH 侧栏收起后，左上角有一组「展开侧栏 / 新对话」控件。
  面板会量出它占的高度，把自己的侧栏与收起态按钮组整体下移同样的距离，
  并在顶部补一条同色带，所以两边的控件不会再叠在一起；
- 面板里是 DeepSeek 官方开源的 [chat-demo](https://github.com/deepseek-ai/chat-demo)：
  多会话、自动标题、消息分支、流式回答、深度思考、智能搜索与来源引用、文件上传、
  语音输入与朗读、Markdown / 代码高亮 / KaTeX / Mermaid、深浅色主题；
- **不用填 API Key**：宿主用 `ctx.deepseekAccount` 的账号 token 代发请求；
  账号不可用（未登录或授权失效）时自动回落到 DSH 里配置的 DeepSeek API Key；
- **会话保留策略**：默认「闲置超过 30 天」的会话会在下次打开面板时自动删除，
  可在「设置 → 网页对话」改成 30 / 60 / 90 天或永不；附件原件同步清理，不再被引用的才删；
- 会话历史存在本机浏览器 IndexedDB（面板自己的 origin），**不会写进 DSH 会话**，
  也不会出现在 DSH 的会话列表里；
- 界面语言首次跟随宿主语言，之后以面板自己的设置为准；主题跟随系统；
- 侧栏图标与面板品牌位显示 `DeepSeek Chat`。

## 和 1.x 的区别

1.x 把 `chat.deepseek.com` 塞进桌面壳的内嵌浏览器，由此带来三个改不动的问题：
站点提示「使用环境异常」、guest 分区是内存级导致重启后要重新登录、Web 端完全不可用。

2.0 改成自己托管官方前端 + 宿主代理 API，三个问题一起消失：

| 项 | 1.x | 2.0 |
|---|---|---|
| 载体 | 桌面壳 webview 租约 | 插件自己的 `/webchat` 路由 + 同源 iframe |
| 登录 | 每次重启重新登录 | 用 DSH 已登录的账户，无需再登 |
| 环境异常提示 | 需要替用户勾「不再提示」 | 不存在 |
| Web 端 | 不可用 | 可用 |
| 计费 | 网页端额度 | DeepSeek API |

**旧历史不迁移**：1.x 里登录的是官网账号，历史在官网；2.0 的会话是本机新库。
需要旧记录时，可在官网「设置 → 数据管理 → 导出所有历史对话」后，
用面板自己的「设置 → 数据管理 → 导入历史对话」导入 ZIP。

## 安装

1. **插件市场（推荐）**：在「插件 → 发现 → 添加索引源」里填入
   `https://vontean.github.io/vt-dsh-plugin/index.json`，找到「网页对话」点安装。
2. **npm**：`dsh plugin --profile <profile> add dsh-vt-web-chat@2.0.0`。
3. **Release tarball**：从 GitHub Release 下载 `.tgz`，再执行
   `dsh plugin --profile <profile> add <该 .tgz 的本地路径或 URL>`。

安装或升级后需要重启 DSH；只刷新页面不生效。

## 支持的 DSH 版本

`engines.dsh` = `>=0.2.1-rc.5 <0.3.0`。超出范围时加载器会在插件装载前拒绝，
不会出现「装上了但只加载一半」的状态。

## 安全边界

- 插件代码在用户进程内运行，**没有沙箱**；只安装你信任的来源。
- **静态产物是公开的**：`/webchat/` 下的 HTML / JS / CSS 不需要 DSH 登录即可取到。
  这里没有任何用户数据——会话存在浏览器自己的 IndexedDB 里，服务端不落盘。
- **代理接口需要准入**：`/webchat/anthropic/*`、`/webchat/models`、`/webchat/v1/tools/*`
  先校验入口页下发的进程级能力令牌（`x-vtwc-cap`，只认回环来源且 Origin 必须同源），
  再退到 DSH 自己的请求栅栏（浏览器 Cookie / 桌面壳 IPC）；
  两条都不满足就拒绝，避免任何本地网页借你已登录的 DSH 花账号额度。
- **凭据只在 Host 半边**：账号 token 与 API Key 都不下发到浏览器，
  浏览器只认识 `/webchat/...` 这一组同源地址。
- 会话内容会发送给 DeepSeek API 计费与服务端工具（搜索、读链接、文件解析、语音）。

## 开发

```bash
node scripts/sync-upstream.mjs   # 按固定 commit 构建官方前端到 webview/dist
node scripts/dev-server.mjs      # 单独跑 /webchat，不用重启 DSH
node --test test/                # 路由、凭据、代理、注入单测
```

- `index.js`：Host 入口，只注册 `/webchat` 路由。
- `src/route.js`：静态托管、设置接口、自检、准入校验。
- `src/proxy.js`：转发到 `api.deepseek.com` 并注入凭据（SSE 与 multipart 都是流式）。
- `src/maintenance.js`：入口页注入——会话保留清理、前端启动闸门、默认收起侧栏、避让样式。
- `src/settings.js`：`$DSH_HOME/vt-web-chat/settings.json` 的读写。
- `client.js`：侧栏入口、整页面板、设置页里的保留策略。
- `webview/dist/`：官方前端的构建产物（提交进仓库，安装即用）。
- `webview/UPSTREAM.json`：产物出自哪个 commit、哪个接口前缀。
- 上游只改两处：`rspack.config.ts` 的 `apiOrigin` 可注入，`i18n` 的 `appName` 改成
  `DeepSeek Chat`；其余一行未动，升级时重跑 `sync-upstream` 即可。
