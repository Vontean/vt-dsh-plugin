# dsh-vt-system-prompt · 全局提示词编辑器

在 DSH 的「设置 → 全局提示词」里查看并编辑本机全局系统提示词（`AGENTS.md`）。它就是
设置页里的全局系统提示词编辑器：标题 + 大文本编辑区 + 保存 / 取消，重新载入是标题右侧的
刷新图标按钮。

## 它解决什么问题

全局 `AGENTS.md` 决定每次会话里 agent 遵循的默认规则，但之前只能去 Finder 里找到
`~/.dsh/AGENTS.md` 再改。这个插件把它放回 DSH 设置面板：

- 打开页面即读取磁盘当前内容；
- 编辑后「保存」立即写回，不重启、不开新会话；
- 「取消」回到上一次保存的内容；
- 文件在别处被改过（比如另一个会话里 agent 写了它）时，保存会被拒绝并提示重新载入，
  避免静默覆盖。

## 页面结构

| 区域 | 说明 |
|---|---|
| 标题区 | 「全局提示词」+ 一句作用说明；右侧是刷新图标、取消、保存 |
| 文件页签 | 存在 `~/.agents/AGENTS.md` 时出现，可在两个用户全局指令根之间切换 |
| 编辑卡片 | 等宽编辑器（`⌘S` / `Ctrl+S` 保存）；绝对路径挂在标题的悬停提示上 |
| 状态行 | 只在有信息时出现：未保存标记 / 已保存时间 / 错误原因 / 文件待创建 |
| 右下角 | 行数与字符数 |

## 写入范围

只认两个固定目标，请求体不接受任意路径：

1. `$DSH_HOME/AGENTS.md`（默认 `~/.dsh/AGENTS.md`）
2. `$DSH_AGENTS_HOME/AGENTS.md`（默认 `~/.agents/AGENTS.md`，仅在该文件已存在时出现）

与 `@deepseek-ai/dsh-agent-instructions` 的加载顺序一致。两个路径都不存在时，页面显示
空编辑器，保存即创建第一个文件。

## 安装

1. **插件市场（推荐）**：在「插件 → 发现 → 添加索引源」里填入
   `https://vontean.github.io/vt-dsh-plugin/index.json`，找到「全局提示词」点安装。
2. **npm**：`dsh plugin --profile <profile> add dsh-vt-system-prompt@1.0.2`。
3. **Release tarball**：从 GitHub Release 下载 `.tgz`，再执行
   `dsh plugin --profile <profile> add <该 .tgz 的本地路径或 URL>`。

安装或升级后需要重启 DSH；只刷新页面不生效。

## 支持的 DSH 版本

`engines.dsh` = `>=0.2.1-rc.5 <0.3.0`。超出范围时，加载器会在插件装载前拒绝，
不会出现「装上了但只加载一半」的状态。

## 安全边界

- 插件代码在用户进程内运行，**没有沙箱**；只安装你信任的来源。
- Host 半侧只读写上面两个固定文件，请求体里不接受任意路径，因此没有目录穿越面。
- 每个请求都过 `ctx.connection.requestRejection`，与 `/api` 网关同一套 Host/Origin
  与浏览器鉴权判定。
- 写入走「同目录临时文件 + rename」，按 `mtimeMs` 做并发冲突检查：文件在别处被改过时
  保存被拒绝，不会静默覆盖。

## 开发

- `index.js`：Host 半侧，注册 `/vt-system-prompt/api/{read,save}` 路由。
- `client.js`：客户端半侧，向 `settings.section` 槽位注册页面；文案进 locale 服务。
- `DESIGN.md`：页面复用的宿主视觉约定与 token。

## 已知边界

- 只覆盖用户全局指令；仓库级的 `AGENTS.md` / `CLAUDE.md` 仍按工作目录加载，不在本页编辑。
- 没有文件监视：外部改动不会自动推到已打开的页面，点「重新载入」取最新内容。
- 单文件上限 1 MiB；超过时页面提示改用其他编辑器。
- 与指令加载一致，不解释 `@path` 导入、`.claude/rules/` 或小写文件名。
