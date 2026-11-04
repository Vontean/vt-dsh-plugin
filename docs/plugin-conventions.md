# 插件约定（plugins/ 下每个目录都是一份独立发布的 npm 包）

这份文档是总集仓库的**硬约定**。新增或迁移插件时逐条对照；发布工作流 `market/index.json`
都是从这些字段和文件生成并校验的，缺一项就会在 CI 里失败或被市场过滤掉。

目录：`plugins/<slug>/`，`<slug>` = 包名去掉 `dsh-` 前缀（例：`dsh-vt-quote-bar` → `plugins/vt-quote-bar`）。

## 1. package.json

必填字段（缺任何一项都算未就绪）：

| 字段 | 约定 |
|---|---|
| `name` | `dsh-` 开头，全小写 kebab-case，与目录 slug 对应 |
| `version` | 首次公开发布一律 `1.0.0`；之后按 SemVer 递增 |
| `private` | **必须删掉**（保留即为不可发布） |
| `type` | `"module"` |
| `description` | 一句话英文描述（插件页与 npm 页共用），不要写中文 |
| `license` | `"MIT"`，并在插件目录放一份 `LICENSE` |
| `author` / `homepage` / `repository` / `bugs` | 见下方模板 |
| `keywords` | 含 `dsh-plugin`、`deepseek-harness` 及本插件相关词 |
| `engines.dsh` | 固定 `">=0.2.1-rc.5 <0.3.0"`（与应用运行时版本对齐，改这里等于改安装门槛） |
| `exports` | 至少 `.` → `./index.js`；**有浏览器半边时**再加 `./client` → `./client.js` |
| `files` | 只列真正要发出去的文件（含 `cordis.patch.yml`、`README.md`） |
| `dsh.bundle.patch` | `"./cordis.patch.yml"` |
| `dsh.client` | **仅当插件有浏览器半边时必填**：`platform: "web"`、`immediately: true`、`inject` 列出用到的 `@deepseek-ai/dsh-client-*` 模块 |

```json
{
  "name": "dsh-vt-example",
  "version": "1.0.0",
  "type": "module",
  "description": "One-line English description.",
  "license": "MIT",
  "author": "Vontean",
  "homepage": "https://github.com/Vontean/vt-dsh-plugin/tree/main/plugins/vt-example#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/Vontean/vt-dsh-plugin.git",
    "directory": "plugins/vt-example"
  },
  "bugs": { "url": "https://github.com/Vontean/vt-dsh-plugin/issues" },
  "keywords": ["dsh-plugin", "deepseek-harness"],
  "engines": { "dsh": ">=0.2.1-rc.5 <0.3.0" },
  "exports": {
    ".": "./index.js",
    "./client": "./client.js"
  },
  "files": ["index.js", "client.js", "cordis.patch.yml", "README.md"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "immediately": true, "inject": [] }
  }
}
```

> 上面是**带界面**插件的模板。纯 host 插件删掉 `exports["./client"]`、`files` 里的
> `client.js` 和整个 `dsh.client` 段，见 §2.2。

## 2. 身份一致性（改名时最容易漏）

同一个插件里，下面这些位置必须是**同一个新名字**，不能混用旧名：

1. `package.json` 的 `name`
2. `cordis.patch.yml` 里 `insert` 条目的 `id` 与 `name`（`name` = 包名；`id` 全仓库唯一）
3. `client.js` 的 `window.__ModuleLoader__.load({ id: '<包名>' })` 与 `PLUGIN_ID`
4. `client.js` 的 `VERSION` = `package.json` 的 `version`（两边必须同值）
5. `locale/{zh,en}.json` 的 `meta.title` / `meta.description`（面向用户的名字，可与包名不同）
6. Host 半边的 `ROUTE_PREFIX` 与客户端拼的 `API_PREFIX` 必须同时改、且拼得上
7. 代码里打印前缀、`data-plugin`、样式标签 id、localStorage key 等带上旧包名的字符串
8. `market.json`、`README.md` 以及文档标题里的旧名

检查命令（应无输出）：

```bash
grep -rn "<旧包名>" --include='*.js' --include='*.json' --include='*.yml' --include='*.md' plugins/<slug>
```

### 2.1 client.js 的顶层作用域（写错会让整个界面起不来）

客户端装载器把多个插件的 `client.js` **拼进同一个脚本**（控制台里 `plugins/??a/client.js,b/client.js`
这种 URL）。所以每个 client 模块的顶层是共享作用域：

- 顶层只允许一个 `window.__ModuleLoader__.load({...})` 调用；
- 包名、`VERSION`、字典等常量一律放进 `factory(require) { ... }` 作用域；
- 两个插件都在顶层写 `const PLUGIN_ID`，第二个会抛 `SyntaxError: Identifier 'PLUGIN_ID'
  has already been declared`，结果是 **web boot 失败、应用报「无法启动」**。

改完用脚本自检（CI 也会跑）：

```bash
node scripts/check-client-bundles.mjs
```

它会按 `exports["./client"]` 找到每个插件的 client 入口，拼接后编译一遍，并核对
`load({ id })` 与包名、`VERSION` 与 `package.json` 是否一致。既不导出 `./client`、
也不声明 `dsh.client` 的纯 host 插件会被跳过并单独计数（见 §2.2）。

### 2.2 纯 host 插件

有些插件只有宿主半边（例：只注册系统提示段、技能 provider 或工具），没有界面要画。
这类插件**不要**写一个空 `client.js` 去满足校验：

- 不写 `exports["./client"]`，不声明 `dsh.client`，目录里不放 `client.js`；
- 包根仍要导出 `apply(ctx, config)`（loader 导入的就是包根）；
- `check-client-bundles.mjs` 会识别并跳过它，不再报「找不到 client 入口」；
- README 里说明「本插件没有界面，只影响模型行为」。

判断标准：如果插件在浏览器里没有任何可观察效果，就不该有浏览器半边。

## 3. market.json（市场展示信息，不发布到 npm）

```json
{
  "title": { "zh": "示例插件", "en": "Example plugin" },
  "description": { "zh": "一句话说明解决什么问题。", "en": "One sentence on the problem it solves." },
  "icon": "icon.svg",
  "category": "ui",
  "keywords": ["ui"]
}
```

- `category` 必须是 `market/config.json` 已声明的分类 id（`ui` / `usage` / `workflow` / `render`）。
- `icon` 是插件目录内相对路径（生成器会内联成 `data:` URL，≤32 KiB）。
- `title`、`description` 的 `zh` 与 `en` 都必须写，`en` 是校验器强制要求。

## 4. README.md（用户第一入口）

中文为主，至少包含：

1. 标题 + 一句话说明（与 `locale.meta.description` 一致的口径）
2. **它改了什么 / 能做什么**：具体到用户能观察到的行为
3. **安装**：市场索引 / npm / Release tarball 三种方式（见仓库根 README「安装」）
4. **支持的 DSH 版本**：`engines.dsh` 的范围，超范围会怎样
5. **安全边界**：插件代码在用户进程内运行，没有沙箱
6. **开发**：本目录的文档入口（DESIGN / DEVELOPMENT / docs 等，有则列出）

## 5. 构建产物

- 需要构建的插件（如 TS/tsdown）把 `lib/` **提交进仓库**：git 子目录安装与 Release tarball
  直接读产物，不执行构建脚本。
- 因此插件目录自己的 `.gitignore` 不能忽略 `lib/`。
- 改动源码后必须重新构建并一起提交，否则发布出去的是旧产物。

## 6. 禁止事项

- 不提交 `node_modules/`、`.codegraph/`、日志、本地绝对路径、任何密钥或 token。
- 不在插件间用 `workspace:*` 依赖：git 子目录安装只打包单目录，解析不了 workspace 依赖。
- 不写死 `~` 或 `/Users/...` 路径。
- 不在 `package.json` 留 `"private": true`。
- 不改 Harness 本体；只改本仓库。

## 7. 本地自检

```bash
cd plugins/<slug>
node --check index.js          # 语法
node --check client.js         # 有浏览器半边时才有这一步
node --test test/*.test.mjs    # 有 test/ 目录时
pnpm pack --dry-run            # 看 files 清单（在仓库根 pnpm install 之后）
cd ../.. && pnpm market        # 生成并校验 market/index.json
```

## 8. 发布（仓库根执行，或由 CI 完成）

```bash
# tag 名 = <slug>-v<version>，必须与 package.json 一致
git tag vt-example-v1.0.0
git push origin vt-example-v1.0.0
```

Tag 推送后 `.github/workflows/release.yml` 会：校验版本 → 用 npm Trusted Publishing（OIDC）
发布 npm → 打包 `.tgz` 挂到 GitHub Release → 更新 `market/releases.json` 与
`market/index.json`（校验通过才提交）→ 重新部署 GitHub Pages。

### npm 首次上线（每个包一次）

npm 要求发布必须过 2FA，granular token 即使勾了 bypass 2FA 也不能直接发布；
CI 只能走 OIDC。所以每个新包第一次上线要手动做两步（之后不再需要登录 npm）：

```bash
# 1. 首次发布（本次会要求 2FA）
cd plugins/<slug> && npm publish --access public

# 2. 绑定 Trusted Publisher，只允许本仓库 release.yml 直接发布
npm trust github <包名> --repo Vontean/vt-dsh-plugin --file release.yml --allow-publish -y
```

配置必须在 2 天内完成首个成功发布才算生效。之后的版本推送 tag 即自动发布，
不用填 token、不用登录。

## 9. 收录第三方插件（market/external.json）

市场索引除了本仓库的插件，还可以收录**别人发布、我自己在用**的插件，让别人一次装到同一套配置。
这些条目写在 [`market/external.json`](../market/external.json)，`scripts/build-market.mjs` 会把它们合并进
`market/index.json` 并一起校验。

### 9.1 硬规则

- **只收 npm 来源**。`versions[].source.type` 必须是 `npm`；写 `git` 会在构建时直接报错。
  原因：git 来源要在安装现场跑 `prepare` 构建，而 pnpm 10 默认拒绝执行依赖的构建脚本
  （`ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`），市场安装路径不会替它开白名单，结果就是装完没有 `lib/`。
- **版本固定在我实际安装的那一个**。索引是「我这套配置」，不是版本追踪器。升级时同时改
  `version` 和 `publishTimestamp`（取自 `https://registry.npmjs.org/<包名>` 的 `time[version]`，单位是秒）。
- **包名不能和 `plugins/` 下的自研插件重名**，重名会让构建失败。
- **分类必须在 `market/config.json` 里声明过**，否则构建失败。
- **必须声明 `dsh.bundle`**，否则它不是一个 DSH 插件，装了也不会被加载。
- `title` / `description` 的 `zh` 与 `en` 都要写（校验器强制要求 `en`）；`author` 写包作者或仓库 owner，
  不要写成 `Vontean`。
- 没有界面的插件要在 `description` 里写明「没有界面」，否则用户会以为装了没反应。
- `icon` 可选，路径相对 `market/`。用别人仓库里的图标前先确认许可，并在 `author` 保留归属。

### 9.2 一条记录的形状

```json
{
  "name": "dsh-redo",
  "title": { "zh": "消息重做", "en": "Redo a Message" },
  "description": { "zh": "一句话说明解决什么问题。", "en": "One sentence on the problem it solves." },
  "author": "Imzl-zl",
  "homepage": "https://github.com/Imzl-zl/dsh-redo#readme",
  "repository": { "url": "https://github.com/Imzl-zl/dsh-redo" },
  "category": "workflow",
  "keywords": ["retry", "edit", "rewind", "session"],
  "versions": [
    {
      "version": "0.4.0",
      "publishTimestamp": 1793259505,
      "source": { "type": "npm" },
      "engines": { "dsh": ">=0.2.0-rc.1 <0.3.0" }
    }
  ]
}
```

`engines` 只认 `dsh`；包上声明的 `node` / `pnpm` 门槛不会被写进索引。

### 9.3 收录与删除

- 加一条：从本机 profile 的 `node_modules/<包名>/package.json` 取 `name` / `version`，从 npm registry 取
  `publishTimestamp` 与 `engines.dsh`，再补展示信息，然后 `pnpm market`。
- 删一条：从 `market/external.json` 移除该记录即可，不影响已安装的用户。
- 收录不代表背书：README 的「安全边界」已写明第三方插件由各自作者维护、没有逐行审计。

