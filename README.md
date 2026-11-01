# vt-dsh-plugin · DeepSeek Harness 插件总集

一组面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的插件，放在同一个仓库里统一维护、统一发布。
每个插件目录都是一个**独立发布的 npm 包**，可以单独安装、单独升级。

## 插件

| 插件 | 包名 | 作用 | 分类 |
|---|---|---|---|
| [VT UI/UX 增强](plugins/vt-uiux-enhancer/README.md) | `dsh-vt-uiux-enhancer` | 把界面调成干净的白纸：配色、层级、控件形状、间距与动效；关闭即完全还原 | 界面与外观 |
| [VT GenUI 生成式界面](plugins/vt-gen-ui/README.md) | `dsh-vt-gen-ui` | 把 `dsh-ui` 围栏渲染成可交互界面：50 种组件、图表与流程图、表单本地判分、常驻面板 | 生成式界面 |
| [模型额度](plugins/vt-quote-bar/README.md) | `dsh-vt-quote-bar` | 在侧边栏显示 DeepSeek 余额与 OpenCode Go 的额度 | 用量与额度 |
| [网页对话](plugins/vt-web-chat/README.md) | `dsh-vt-web-chat` | 「新建会话」下方的网页对话入口，把 chat.deepseek.com 作为主区面板打开 | 界面与外观 |
| [全局提示词](plugins/vt-system-prompt/README.md) | `dsh-vt-system-prompt` | 设置页里的全局系统提示词（`AGENTS.md`）查看与编辑 | 工作流与提示词 |

## 安装

插件装进某个 profile 后**必须重启 dsh**，刷新页面不生效。

### 插件市场（推荐，有更新提示）

在「插件 → 发现 → 添加索引源」里填入市场索引地址：

```
https://vontean.github.io/vt-dsh-plugin/index.json
```

市场属于实验特性：第一次使用要先在插件页开启 **Custom plugin markets**。索引地址必须是 https，
不能带 query 或 fragment。添加后按分类浏览，点安装即可；有新版时市场会显示「有更新」，
更新动作等于卸载再安装。

### npm

```bash
dsh plugin --profile <profile> add dsh-vt-quote-bar@1.0.0
```

npm 通道要等该版本真的发布到 npm 之后可用（用 `npm view <包名>@<版本>` 能查到即可）。
还没发到 npm 时，请用市场索引或 Release tarball：三条通道发出去的是同一份构建。

### Release tarball

到 [Releases](https://github.com/Vontean/vt-dsh-plugin/releases) 下载对应插件的 `.tgz`，然后：

```bash
dsh plugin --profile <profile> add /绝对路径/dsh-vt-quote-bar-1.0.0.tgz
```

### Git 子目录（不使用市场与 npm 时的兜底）

```bash
dsh plugin --profile <profile> add 'git+https://github.com/Vontean/vt-dsh-plugin.git#<commit>&path:/plugins/vt-quote-bar'
```

市场索引里的 git 来源就是这种 spec：commit 固定，不会漂移。仓库里提交了构建产物，安装时不执行构建脚本。

## 支持的 DSH 版本

每个插件在 `package.json` 的 `engines.dsh` 里声明兼容范围，目前统一为
`>=0.2.1-rc.5 <0.3.0`。超出范围时 DSH 会在加载前拒绝该插件，不会带着不兼容的代码跑起来。
DSH 大版本升级后，通常需要插件跟进发布新版本。

## 安全边界

- 插件代码在**用户进程内**运行，没有沙箱，也没有额外的权限边界；它能读写页面 DOM、
  能发起网络请求（个别插件会请求余额接口）。只安装你信任的来源。
- 本仓库的插件不上传遥测、不写系统文件；每个插件 README 的「安全边界」一节写明它实际会做什么。
- 市场索引只指向本仓库发布物（npm 包、Release tarball、commit 固定的 git 子树），不指向第三方来源。

## 仓库结构

```
vt-dsh-plugin/
├─ plugins/<slug>/          # 一个目录 = 一个独立 npm 包（构建产物一并提交）
├─ market/
│  ├─ config.json           # 索引标题与分类声明
│  ├─ releases.json         # 已发布版本账本（CI 写入）
│  └─ index.json            # 市场索引，官方解析器校验后部署到 Pages
├─ scripts/
│  ├─ build-market.mjs      # 生成 + 校验 index.json
│  ├─ record-release.mjs    # 发布时把版本写进账本
│  └─ refresh-sources.mjs   # 补发 npm 后把 git 来源刷成 npm 来源
├─ docs/plugin-conventions.md  # 新增/迁移插件的硬约定
└─ .github/workflows/       # Release / Refresh market sources / Pages / Checks
```

## 开发

```bash
pnpm install          # 仓库根，装开发依赖（含市场索引校验器）
pnpm market           # 重新生成并校验 market/index.json
```

插件本体开发见各插件目录的 `AGENTS.md` / `DEVELOPMENT.md`。新增插件或改包名，先读
[`docs/plugin-conventions.md`](docs/plugin-conventions.md)：包名、bundle patch id、
客户端模块 id、`VERSION`、市场展示信息都有硬约定，漏一项 CI 就会拦下来。

## 发布

发布 = 打一个 tag，其余由 CI 完成：

```bash
git tag vt-quote-bar-v1.0.0      # 名字 = plugins/ 下的目录名 + -v + package.json 的 version
git push origin vt-quote-bar-v1.0.0
```

tag 推上去后 `.github/workflows/release.yml` 会：

1. 校验 tag 与 `package.json` 的版本一致、且 tag 提交在 `main` 上；
2. 用 **npm Trusted Publishing（OIDC）** 发布到 npm——不需要 npm token，也不需要登录；
3. 打包 `.tgz` 挂到 GitHub Release；
4. 把版本写进 `market/releases.json`，重新生成并经官方解析器校验 `market/index.json`；
5. 提交索引到 `main`，重新部署 GitHub Pages。

### npm 发布：Trusted Publishing（OIDC）

npm 现在要求发布必须过 2FA，granular token 即使勾了「bypass 2FA」也不能直接发布
（见 [npm 公告](https://gh.io/npm-gat-bypass2fa-deprecation)）。所以 CI 发布走 OIDC：
GitHub Actions 用短时凭证向 npm 换一次性发布权，仓库里不存任何长期 token，provenance 自动生成。

**每个包上线时只需要配置一次**（包必须先存在于 npm 上，所以首次发布要手动过一次 2FA）：

```bash
# 首次发布（会要求 2FA；之后不再需要）
cd plugins/vt-quote-bar && npm publish --access public

# 绑定 Trusted Publisher：只允许本仓库 release.yml 直接发布这个包
npm trust github dsh-vt-quote-bar --repo Vontean/vt-dsh-plugin --file release.yml --allow-publish -y
```

也可以到 npmjs.com 的包设置页 → Trusted Publisher 手动填：用户 `Vontean`、仓库
`vt-dsh-plugin`、workflow `release.yml`、勾选 **Allow npm publish**。配置需在 2 天内完成首次
成功发布才算生效。之后每个新插件上线时重复这两步即可，日常发版不再需要登录 npm。

如果某个包的 OIDC 发布失败（还没配 Trusted Publisher），工作流不会中断：索引先退回 commit
固定的 git 来源；配好之后重跑该 tag 的 `Release` 工作流，或跑一次 **Refresh market sources**，
索引来源就会刷新成 npm 包。

## 版本策略

- 首次公开版本统一为 `1.0.0`，之后按 SemVer 递增；每个插件独立版本、独立 tag。
- 市场只有「有更新」提示，升级等于卸载再安装，所以尽量少做破坏性变更；
  需要迁移用户配置时，在插件 README 与 Release 说明里写清楚。

## 许可

[MIT](LICENSE)。各插件目录内的第三方归属声明见其 `THIRD_PARTY_NOTICES.md`（如有）。
