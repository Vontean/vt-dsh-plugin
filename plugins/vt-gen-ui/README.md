# dsh-vt-gen-ui · VT GenUI 生成式界面

DeepSeek Harness（DSH）的生成式界面插件：模型在**回答正文**里写一段 ` ```dsh-ui ` 围栏，
渲染器把它画成可点、可填、可拖动的真实界面。协议与 50 个组件词汇沿用上游，视觉层按
「宿主正文的延伸」重做——关闭插件即回到普通 Markdown 代码块，会话不受影响。

## 它能做什么

- **四种渲染通道**：正文内联围栏（边流边渲染，组件 JSON 闭合一个上屏一个）、常驻面板
  （`panel: true` 或 `/panel` 命令，原地更新、可调高度、支持追加）、工具卡 `render_ui`、
  以及直接安全渲染的 ` ```svg ` 围栏。
- **50 个白名单组件**：标题/stat/表格/列表/图表/流程图/时间线/树/代码/JSON/diff/测验…
  共 33 项资源上限；JSON 坏了或插件不在时**退回代码块**，不会破坏会话。
- **图表与图形**：bars / line / donut、ECharts、mermaid 流程图、公式绘图（可拖拽缩放、
  参数滑杆与动画）、3D 场景。
- **本地交互与判分**：radio / checkbox / input / slider / 表单组件就地承载选择与填写；
  `radio` + `answer` 组成的测验可以**本地判分**，不打扰模型。
- **面板与产出**：面板 dock、收藏模板、成就提示、导出（HTML / JSON）、复制原文。
- **模型侧配套**：自动注册 `genui` 技能（`SKILL.md`，一套完整的围栏语法与组件手册），
  并提供 `validate_dsh_ui` 工具让模型**发出前**自检 JSON、拿到修复建议。
- **按需加载**：mermaid / three / ECharts / 749 个图标目录都是懒加载资产，只在用到时下载。
- **视觉层**：颜色只来自宿主 `--dsw-alias-*` token，深浅色双主题都要成立；
  细节、判据与取舍见 [`DESIGN.md`](./DESIGN.md)。

> ⚠️ **不要与上游 `@changfenhuang/dsh-genui` 同时启用**：两者注册同一个 system prompt 段、
> 同一批工具、同一个会话 DOM 渲染器，第二个 `apply` 会直接抛错。

## 安装

插件装进某个 profile 后**必须重启 dsh**，刷新页面不生效。

**插件市场**（推荐，可在界面里看到更新提示）
在「插件 → 发现 → 添加索引源」填入：

```
https://vontean.github.io/vt-dsh-plugin/index.json
```

第一次使用市场要先在插件页开启 **Custom plugin markets**；然后在本插件条目上点安装。
市场里的「更新」是卸载再安装。

**npm**

```bash
dsh plugin --profile <profile> add dsh-vt-gen-ui@1.0.0
```

**Release tarball**

到 [Releases](https://github.com/Vontean/vt-dsh-plugin/releases) 下载
`dsh-vt-gen-ui-1.0.0.tgz`，然后：

```bash
dsh plugin --profile <profile> add /绝对路径/dsh-vt-gen-ui-1.0.0.tgz
```

**与上游共存时的切换顺序**（顺序不能反，否则重复注册抛错）：先在插件页停用上游，或在 profile 里
`remove` 掉它，再装本插件；回滚时先停用本插件，再启用上游。

```bash
# 装本插件前：先去掉上游
dsh plugin --profile <profile> remove @changfenhuang/dsh-genui
dsh plugin --profile <profile> add dsh-vt-gen-ui@1.0.0

# 回滚：先去掉本插件，再装回上游
dsh plugin --profile <profile> remove dsh-vt-gen-ui
dsh plugin --profile <profile> add @changfenhuang/dsh-genui@0.14.0
```

## 支持的 DSH 版本

`engines.dsh` = `>=0.2.1-rc.5 <0.3.0`。超出范围时 DSH 会在加载前拒绝该插件，不会带着
不兼容的代码跑起来；DSH 大版本升级后需要本插件跟进发布新版本。

## 安全边界

- 插件代码在**用户进程内**运行，**没有沙箱**，也没有额外权限边界：host 半边能读自身包目录
  里的文件、能注册 HTTP 路由，client 半边能读写页面 DOM。只从你信任的来源安装。
- 本插件的网络行为仅限**本机自取自用**：懒加载引擎通过 `/plugins/dsh-vt-gen-ui/assets/*`
  从插件自己的目录下载，不访问外部服务、不上传遥测。
- 交互状态、面板状态与成就计数存在浏览器 **localStorage**，不写系统文件；密码类
  `input` 字段永不持久化。
- 围栏内容是**模型生成的**：其中的链接、图片、代码块会按 host 的既有规则渲染，模型说什么
  不等于事实。`svg` 围栏经过安全过滤后才上屏。

## 开发

| 要做的事 | 先读 |
| --- | --- |
| 文件路由、硬约束（协议不可改的那部分） | [`AGENTS.md`](./AGENTS.md) |
| 视觉体系、token 与验收判据 | [`DESIGN.md`](./DESIGN.md) |
| 这个插件到底做了什么（能力全景） | [`docs/CAPABILITY-MAP.md`](./docs/CAPABILITY-MAP.md) |
| 50 个组件的字段表、渲染现状诊断、构建与安装契约 | [`docs/recon/`](./docs/recon/) |
| 749 个图标名 | [`ICON-NAMES.md`](./ICON-NAMES.md) |
| 模型看的语法手册 | [`SKILL.md`](./SKILL.md) |
| 仓库级约定（包名、bundle patch、市场信息） | [`docs/plugin-conventions.md`](../../docs/plugin-conventions.md) |

```sh
pnpm install
pnpm build        # → lib/index.js（host）+ lib/client.js（浏览器）+ lib/assets/*
```

构建产物 `lib/` 必须一起提交：git 子目录安装与 Release tarball 直接读产物，不执行构建脚本。
装好之后，视觉层改动只需 `pnpm build`，浏览器约 0.5 s 内热替换（host 半边改动需重启应用）。

## 来源与许可

- 本包是 [`@changfenhuang/dsh-genui@0.14.0`](https://www.npmjs.com/package/@changfenhuang/dsh-genui)
  的 fork，包名、bundle 行 id、模块 id 与资产路由都改成 `dsh-vt-gen-ui` 独占；
  上游以 MIT 发布，归属说明见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。
- 内联图标来自 OpenAI Apps SDK UI（MIT），同样记录在 `THIRD_PARTY_NOTICES.md`。
- 本仓库代码以 MIT 发布，见 [`LICENSE`](./LICENSE)。
