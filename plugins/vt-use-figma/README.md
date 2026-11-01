# dsh-vt-use-figma

让 DeepSeek Harness 在遇到 **Figma 链接**或 **Figma 任务**时，自动走远程 Figma MCP，并
**先加载对应的官方技能再调工具**。同时把 Figma 官方的 `figma-*` 技能接进 DSH——不复制文件、
不写你的目录。

> 本插件**不建立** MCP 连接。连接由 [`dsh-oauth-mcp-client`](https://github.com/Vontean/dsh-oauth-mcp-client)
> 负责，本插件负责「知道该去用它」和「技能就位」。

## 它改了什么

装好并重启后，新会话里多三件事：

1. **一段路由手册进系统提示**。命中 Figma 链接（`figma.com/design/...`、`/file/`、`/board/`、
   `/slides/`，或带 `node-id=`）或 Figma 任务时，模型按固定顺序做事：
   先确认 `mcp__figma__*` 工具在不在 → 先 `create_session` → **先加载技能** → 再调工具。
   不再凭记忆描述 Figma 文件，也不会用截图猜设计。
2. **16 个 Figma 官方技能出现在技能目录里**，可用 `skill` 工具按名加载，`references/` 里的
   相对文档也能读。技能**原地读自 Codex 插件缓存**，没有文件被复制。
3. **多一个 `figma_status` 工具**（只读）。模型拿不准连接状态时调它，返回：Figma MCP 是否连上、
   可见的 `mcp__figma__*` 工具、技能来源与版本、以及下一步该做什么。

本插件**没有界面**：它是纯 host 插件，只影响模型行为。

## 前置条件

| 需要 | 说明 |
|---|---|
| DSH | `>=0.2.1-rc.5 <0.3.0` |
| `dsh-oauth-mcp-client` | 提供远程 OAuth MCP 能力；本插件依赖它注册的 `mcp__figma__*` 工具 |
| Figma 账号 | 首次连接要在浏览器里完成 OAuth 授权 |
| Figma 技能 | 有 Codex + Figma 插件则自动发现；没有见下文「技能从哪来」 |

## 一、配置远程 Figma MCP

Figma 的 MCP 端点要求 OAuth，且**对动态客户端注册做 `client_name` 白名单校验**：不在白名单里
一律 403。已批准的 `GitHub Copilot CLI` 这个名字绑定的回调形态是「根路径 + 固定端口」。

把下面这段加进你的 profile patch（例如 `~/.dsh/profiles/desktop/cordis.patch.yml`）：

```yaml
# ── Figma 远程 MCP ────────────────────────────────────────────────────────
# Figma 对动态客户端注册做 client_name 白名单校验，非白名单一律 403。
# 这里用 "GitHub Copilot CLI"（Figma 已批准的名字）；该名字绑定的回调形态是
# 「根路径 + 固定端口」，所以 callbackPath 必须是 / 且端口不能随机。
- insert:
    - id: oauth-mcp-figma
      name: "@dsh-external/dsh-oauth-mcp-client"
      config:
        serverName: figma
        url: https://mcp.figma.com/mcp
        scope: mcp:connect
        clientName: GitHub Copilot CLI
        tokenEndpointAuthMethod: client_secret_post
        callbackPath: /
        callbackPort: 3846
        credentialRef: DSH_MCP_OAUTH_FIGMA
        failOnStartupError: false
```

字段为什么要这么写：

| 字段 | 为什么 |
|---|---|
| `clientName` | **不能改**。Figma 按这个名字走白名单；填别的（例如 `copilot-cli`）会被 403 拒绝。旁证见 [copilot-cli#4906](https://github.com/github/copilot-cli/issues/4906)。 |
| `callbackPath` | 必须是 `/`。这个 client 身份注册的回调是根路径，不是默认的 `/oauth/callback`。 |
| `callbackPort` | 必须**固定**，不能填 `0`（随机端口）。本机取 `3846`；若 3846 被占用就换一个固定端口再试。 |
| `tokenEndpointAuthMethod` | 该 client 走 `client_secret_post`。 |
| `scope` | Figma 要 `mcp:connect`。 |
| `credentialRef` | OAuth 令牌存进 DSH 凭证服务，不进仓库。名字随意，换连接时保持一致即可。 |
| `failOnStartupError: false` | 令牌过期或临时断网时不让整个应用启动失败。 |

> **依赖版本提醒**：`clientName` / `callbackPath` / `tokenEndpointAuthMethod` 这三个键只在支持
> 它们的 `dsh-oauth-mcp-client` 构建里存在。本机验证过的构建其活 schema 里已有这三项，但上游
> README 尚未收录——如果你的版本忽略它们，表现就是 DCR 阶段 403。

配好重启 DSH，首次会打开浏览器授权。授权完成后用 `figma_status` 或
**Settings → Plugins → MCP Connections** 确认连接状态。

## 二、技能从哪来

本插件按下面的顺序找技能目录：

1. 插件配置里的 `skillsDir`（显式指定，优先级最高）；
2. Codex 插件缓存：`$CODEX_HOME/plugins/cache/<marketplace>/figma/<build>/skills`
   （默认 `~/.codex`），按 `.codex-plugin/plugin.json` 里的 `version` **选最高版本**——
   注意目录名不一定是版本号（`17.0.0` 是版本，`1e285826` 是哈希）；
3. 都没有 → 路由段会说明「技能暂时加载不了」，`figma_status` 报 `skills.available: false`。

只接入目录名以 `figma-` 开头的技能，避免误把别的技能根当成 Figma 技能。

### 情况 A：机器上有 Codex 且装了 Figma 插件

零配置。本机检测结果：

```
~/.codex/plugins/cache/openai-curated-remote/figma/17.0.0/skills/
  figma-use  figma-design-to-code  figma-create-new-file  figma-generate-design
  figma-generate-diagram  figma-generate-library  figma-code-connect  figma-code-workflows
  figma-spec  figma-swiftui  figma-implement-motion  figma-use-figjam
  figma-use-slides  figma-use-motion  figma-shaders  figma-generative-plugins
```

### 情况 B：没有 Codex

Figma 把这些技能随 MCP 服务器发布，官方入口有两处：

- [Figma Community · Skills](https://www.figma.com/community/skills)（Figma 官方下载页）
- [openai/plugins · figma/skills](https://github.com/openai/plugins/tree/main/plugins/figma/skills)（同一套技能的公开镜像）

把需要的 `figma-<name>/SKILL.md`（含其 `references/` 一起）放进 DSH 的用户技能根：

```bash
mkdir -p ~/.dsh/skills
cp -R /path/to/figma-skills/figma-* ~/.dsh/skills/
```

放好后在会话里调一次 `figma_status({ refresh: true })`，不用重启。

也可以用配置直接指向任意已有目录，不必搬文件：

```yaml
- id: dsh-vt-use-figma
  name: dsh-vt-use-figma
  config:
    skillsDir: /absolute/path/to/figma/skills
```

> **为什么本插件不自动下载技能**：DSH 的 OAuth MCP 客户端目前**不桥接 MCP 资源**，拿不到
> Figma 服务器的 `skill://figma/<name>/SKILL.md`；而且这些技能的许可为
> `LicenseRef-Figma-Developer-Terms`，**不能随本仓库分发**。所以只做「就地读取」。

## 安装

三条通道发出去的是同一份构建：

```bash
# 市场索引：插件 → 发现 → 添加索引源
https://vontean.github.io/vt-dsh-plugin/index.json

# npm
dsh plugin --profile <profile> add dsh-vt-use-figma@1.0.1

# Release tarball
dsh plugin --profile <profile> add /绝对路径/dsh-vt-use-figma-1.0.1.tgz

# git 子目录（兜底）
dsh plugin --profile <profile> add 'git+https://github.com/Vontean/vt-dsh-plugin.git#<commit>&path:/plugins/vt-use-figma'
```

装进 profile 后**必须重启 DSH**，刷新页面不生效。

## 配置

全部可选：

| 键 | 默认 | 作用 |
|---|---|---|
| `routing` | `true` | 是否注入路由与操作手册那段系统提示。关掉只保留技能接入。 |
| `skills` | `true` | 是否注册 Figma 技能 provider。关掉只保留路由段。 |
| `codexHome` | `$CODEX_HOME` 或 `~/.codex` | 探测 Codex 插件缓存的根。 |
| `skillsDir` | 未设 | 显式技能目录，优先级最高。 |

```yaml
- id: dsh-vt-use-figma
  name: dsh-vt-use-figma
  config:
    routing: true
    skills: true
```

## 排障

| 现象 | 原因与处理 |
|---|---|
| `figma_status.figmaTools` 为空 | MCP 没连上。检查 profile 里有没有 `oauth-mcp-figma` 那条、`serverName` 是不是 `figma`，重启后到 **Settings → Plugins → MCP Connections** 看状态。 |
| OAuth 授权时 403 / `invalid_client` | `clientName` 不是 `GitHub Copilot CLI`，或用了不支持该字段的旧构建。 |
| 授权回调收不到 | `callbackPath` 不是 `/`，或 `callbackPort` 填了 `0`（随机）。端口被占用就换一个**固定**端口。 |
| 技能目录是空的 | Codex 缓存不存在。按「情况 B」把技能放进 `~/.dsh/skills/`，或用 `skillsDir` 指定，然后调 `figma_status({ refresh: true })`。 |
| 技能名和预期不一致 | 只接入目录名以 `figma-` 开头的技能；目录名不匹配就不会出现。 |
| 模型仍不加载技能 | 确认 `routing` 没被关掉；路由段是模型行为的唯一来源。 |
| 升级 Codex Figma 插件后技能没变 | 调一次 `figma_status({ refresh: true })`；provider 目录是注册期解析的，刷新会重新扫描。 |

## 支持的 DSH 版本

`engines.dsh: ">=0.2.1-rc.5 <0.3.0"`。超出范围时 DSH 会在加载前拒绝本插件，不会带着不兼容的
代码跑起来。本插件用到 `systemPrompt.section` / `getSectionOrder('MCP_SERVERS')`、
`skills.registerProvider`、`tools.register`，都按 0.2.1-rc.5 的活契约实现。

## 安全边界

- 插件在**用户进程内**运行，没有沙箱。
- 它**只读** Codex 插件缓存里的 `SKILL.md`；**不写**你的主目录、不改 profile 配置。
- 它**不发起网络请求**：MCP 通信完全由 `dsh-oauth-mcp-client` 承担。
- 它**不复制也不分发** Figma 技能正文（许可是 Figma Developer Terms）。
- 它注册的 `figma_status` 只读：不调 Figma、不改画布。
- `skillsDir` 指向哪里就会暴露哪里的 `figma-*` 技能，请指向 Figma 技能目录。

## 开发

```bash
cd plugins/vt-use-figma
node --check index.js
node --test test/*.test.mjs
cd ../.. && node scripts/check-client-bundles.mjs   # 纯 host 插件会被跳过
cd ../.. && pnpm market                             # 未发布时只有 warn
```

代码只有 `index.js` 一个文件：

| 区域 | 作用 |
|---|---|
| `ROUTING_TEXT` / `SKILLS_MISSING_TEXT` | 模型看到的操作手册，以及技能缺失时的降级说明 |
| `parseFrontmatter` / `compareVersions` | 解析 `SKILL.md` 头信息、按语义版本选缓存 |
| `resolveSkillSource` / `readSkillCandidates` | 定位技能目录、生成技能候选 |
| `apply` | 注册提示段、技能 provider、`figma_status` |

新增/改名时注意：包名、`cordis.patch.yml` 的 `id`/`name`、提示段名 `figma:routing` 三处要一致；
提示段名**不能**用 `tool:mcp:figma`，那是 `dsh-oauth-mcp-client` 占用的。
