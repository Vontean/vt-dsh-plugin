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
| `exports` | 至少 `.` → `./index.js`、`./client` → `./client.js` |
| `files` | 只列真正要发出去的文件（含 `cordis.patch.yml`、`README.md`） |
| `dsh.bundle.patch` | `"./cordis.patch.yml"` |
| `dsh.client` | `platform: "web"`、`immediately: true`、`inject` 列出用到的 `@deepseek-ai/dsh-client-*` 模块 |

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
node --check client.js
pnpm pack --dry-run            # 看 files 清单（在仓库根 pnpm install 之后）
cd ../.. && pnpm market        # 生成并校验 market/index.json
```

## 8. 发布（仓库根执行，或由 CI 完成）

```bash
# tag 名 = <slug>-v<version>，必须与 package.json 一致
git tag vt-example-v1.0.0
git push origin vt-example-v1.0.0
```

Tag 推送后 `.github/workflows/release.yml` 会：校验版本 → 可选发布 npm
（存在 `NPM_TOKEN` secret 时）→ 打包 `.tgz` 挂到 GitHub Release → 更新
`market/releases.json` 与 `market/index.json`（校验通过才提交）→ 重新部署 GitHub Pages。
