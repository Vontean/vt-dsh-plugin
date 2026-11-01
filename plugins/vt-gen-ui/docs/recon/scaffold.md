# dsh-vt-gen-ui 初始化侦察：插件包契约 · 构建链 · 安装共存

> 侦察员：`recon-scaffold`（task-3）／ 只读侦察，未安装依赖、未改 profile、未动第三方包。
> 基线：`@changfenhuang/dsh-genui@0.14.0`（profile `desktop` 里的真实安装副本）。
> 运行环境：DeepSeek Harness Desktop `0.2.1-rc.5`（runtime node `24.21.0` / pnpm `11.28.5`），本机 shell node `v22.22.0` / pnpm `10.33.2`。

---

## 0. 结论速览（TL;DR）

| # | 结论 | 关键证据 |
|---|---|---|
| 1 | 自建 bundle 的最小契约只有 **4 项**：`dsh.bundle.patch` + 该 patch 的 `insert` 行 + 包根 `apply(ctx)` + （可选）`dsh.client` + `exports["./client"]`。**不需要** dependencies、build 脚本或仓库结构 | `dsh-genui/package.json:196-204`、`cordis.patch.yml:7-9`、`src/plugin/index.ts:216,142-143` |
| 2 | client 半边**必须是自包含单文件**（静态相对 import 会 404）；代码分割出来的 `client.<name>.js` 是唯一例外通道，且必须由构建器生成 | `vt_UIUX_enhancer/DEVELOPMENT.md:143-159`、`dsh-client-modules` README §34/§72 |
| 3 | 浏览器可用的模块**只有 11 个**（平台种子表）。误用其它 `@deepseek-ai/*` 会让 bundle 在运行时抛错 | `dsh-web-frontend` 产物 `function OZ(){return{…}}`（见 §3.4） |
| 4 | **host 半边可以做到零跨包运行时依赖**——上游唯一的例外是一处 `await import("@deepseek-ai/dsh-llm")`，位于可裁剪的 `fence-feedback.ts` | `dsh-genui/lib/index.js` 尾部 grep、`src/plugin/fence-feedback.ts:28-35` |
| 5 | 构建链在本机**可行**，但本机 pnpm `10.33.2` 不满足上游 `engines.pnpm >=11.7 <12`；建议**删掉 `engines.pnpm`**（DSH 不校验它） | `dsh-genui/package.json:205-210`、`app-boot` README §53 |
| 6 | **新旧 genui 不能同时启用**：两者都注册 systemPrompt section `genui:fence` 与 tool `render_ui`，第二个 `apply` 直接抛错；client 半边还会出现双 DOM 观察者。切换必须"先禁旧、再装新" | `src/plugin/index.ts:218-222`；`src/plugin/tool.ts:205,346`；`dsh-system-prompt` / `dsh-tools` 的 `NamedEntries` 重复名抛错 |
| 7 | 安装只用 `plugin_manager`：`install_bundle` 落 `link:` 依赖 + 写 profile 的 `cordis.patch.yml`/`bundles`；`set_bundle` 写 `disabled: true`。**全程不需要手写 profile 文件** | `plugin-manager` README（Use this package）、profile `package.json:5,12,27` |
| 8 | 上游 MIT + 一份包含 **OpenAI Apps SDK UI 图标** 的第三方声明。fork 必须保留 `LICENSE` 与 `THIRD_PARTY_NOTICES.md`（或替换图标后换声明） | `LICENSE:1-3`、`THIRD_PARTY_NOTICES.md:1-16` |

---

## 1. 三类真实样本对照

| 维度 | 大插件 `@changfenhuang/dsh-genui` | link 小插件 `dsh-vt-interface` | link 小插件 `dsh-vt-quotabar` |
|---|---|---|---|
| 安装形态 | registry 实体目录 `profiles/desktop/node_modules/@changfenhuang/dsh-genui` | symlink → `Project/DSH/Plugins/vt_UIUX_enhancer` | symlink → `Project/DSH/Plugins/vt_QuoteBar` |
| package.json name | `@changfenhuang/dsh-genui`（带 scope） | `dsh-vt-interface`（无 scope） | `dsh-vt-quotabar`（无 scope） |
| `main` / `exports["."]` | `lib/index.js` / 同 | `index.js`（无 `main`，靠 exports） | 同 |
| `exports["./client"]` | `./lib/client.js`（带 types） | `./client.js` | `./client.js` |
| `dsh.bundle.patch` | `./cordis.patch.yml` | 同 | 同 |
| `dsh.client` | `{inject: [], platform: "web"}`（无 `immediately`） | `{platform:"web", immediately:true, inject:["@deepseek-ai/dsh-client-ui-theme"]}` | `{platform:"web", immediately:true, inject:[…sidebar, …locale]}` |
| `engines` | `dsh` / `node` / `pnpm` 三者都有 | 无 | 无 |
| host 入口行为 | 注入 prompt section + 2 个 tool + skill provider + 资产 HTTP 路由 | **空 `apply()`**（纯 client 插件） | 注册 `/vt-quotabar/api/*` 路由 |
| client 入口 | 693 KB minified CJS，DOM fence 渲染器 + toolview + dock | 101 KB 单文件 | 39 KB 单文件 |
| 构建链 | tsc(仅 d.ts) + tsdown 多 target + lightningcss | **无**（手写单文件） | **无** |
| 平台模块依赖 | react / react-dom/client / cordis / ui-primitives | react（由平台表提供） | react |
| 资产路由 | 自建 `/plugins/<pkg>/assets` 前缀路由 | 无 | 自建 `/vt-quotabar/api/*` |
| locale 目录 | **无**（显示名回退到 package.json） | `locale/{zh,en}.json` | `locale/` |
| icon | `package.json#icon: ./assets/genui-icon.svg` | `exports["./icon"]` | 同 |

**结论**：`dsh-vt-gen-ui` 属于第一类（大插件）——因为它必须同时具备 host 半边的 prompt/tool/skill 与 client 半边的渲染器。小插件的"手写单文件"路线不适用于本项目（视觉层规模大、需要 CSS Modules、需要 lazy 引擎资产），必须复制上游的 **tsdown + lightningcss** 构建链。

---

## 2. DSH 插件包契约

### 2.1 bundle 的最小契约（自建一个 bundle 必须提供什么）

1. **`package.json#dsh.bundle.patch`** → 指向包内 YAML。`app-boot` 用它把该 bundle 的 patch 层拼进 composition（`app-boot` README §51）。
   - 位置：`dsh-genui/package.json:196-199`；`vt_UIUX_enhancer/package.json`（`dsh.bundle.patch`）。
2. **patch 里的 `insert` 行**，每行 `{id, name, config?}`：
   ```yaml
   - insert:
       - id: genui
         name: '@changfenhuang/dsh-genui'
   ```
   （`dsh-genui/cordis.patch.yml:7-9`）。`name` 是 **Loader 的模块说明符**，可写包名、绝对路径或 file URL（`app-boot` README §66）。`id` 是**行标识**，patch 层的覆盖/禁用都按 `id` 匹配（`plugin-manager` README）。
3. **包根 host 入口导出 `apply(ctx, config?)`**，通常再导出 `name` 与 `inject`：
   ```ts
   export const name = '@changfenhuang/dsh-genui'
   export const inject = ['systemPrompt']
   export function apply(ctx, config) { … }
   ```
   （`src/plugin/index.ts:142-143,216`）。"混用 service class 默认导出与 `apply`"是不允许的两种互斥形态（`host-plugin` 参考 §57-64）。
4. **（若要浏览器 UI）`dsh.client` + `exports["./client"]`**：
   `dsh.client = {platform:'web', inject?: string[], external?: string[], immediately?: boolean}`（`dsh-genui/package.json:200-203`）。`exports["./client"]` 必须是字符串或 `{default: string}`，否则 composition 直接抛错（`dsh-client-modules/lib/index.js` 的 `clientExportOf`，第 172-182 行）。
5. **构建产物必须先存在**：host 只服务已构建的 `lib/client.js`；缺失时激活阶段报 `client-modules: client bundle not found; run pnpm run build before launch`（同上，第 129-143 行）。

不需要的东西（对 `dsh-vt-gen-ui` 而言）：dependencies、install/postinstall 脚本、仓库级 workspace、tests 目录、`dsh.manifestVersion`。

### 2.2 `dsh.client` 各字段的真实语义

| 字段 | 类型 | 真实作用 | 证据 |
|---|---|---|---|
| `platform` | string，必须是 `"web"` 才被扫描进 boot graph | 声明这是浏览器半边 | `cm.mjs:732`（`decl.platform !== "web"` → 跳过） |
| `inject` | string[] | **只决定浏览器插件的激活顺序**（依赖方排在提供方之后），不是 cordis 服务依赖 | `practices.md:35`；`ui-plugin.md:9` |
| `external` | string[] | 请求平台种子表之外的模块；每条必须由某个 boot graph 行或静态表键作答，自请求/环路/缺失供应者都会被 composition 拒绝 | `cm.mjs:414-441` |
| `immediately` | boolean | **启动时预取（prefetch，不执行）**该 bundle，让首次使用不付下载成本 | `web-frontend` 产物 `prefetchImmediateTier()`；`cm.mjs:745` |

> 易混点：`dsh.client.inject`（包清单，管浏览器**加载顺序**）≠ client bundle 导出的 `inject = ['slots','sessions']`（cordis **服务依赖闸门**，缺服务则 `apply` 永不运行）。上游两者都用：前者 `[]`，后者 `['slots','sessions']`（`src/client/index.tsx:204`）。

### 2.3 host 半边契约要点

- **`inject` 是硬闸门**：清单里的服务不存在 → fiber 永久 waiting、`apply` 永不执行。所以上游只把 `systemPrompt` 放进 `inject`，把 `tools` / `skills` / `webServer` 全部用 `ctx.inject([...])` 可选注入（`src/plugin/index.ts:138-143,216,227,236,242`）。这条对我们替换视觉层同样关键：**不要在 `inject` 里写非必需服务**。
- 注册资源必须挂在 owning effect 上（`ctx.effect` / `ctx.inject` 回调里），插件卸载时自动回收（`practices.md:8`）。
- **名字是全局唯一键**：systemPrompt section、tool 名在各自 registry 里重复注册会**抛错**（见 §6.1）。

### 2.4 patch `insert` 的 `id` / `name` 选择规则

- `id`：一旦发布就不要改，用户的 profile patch 与开关状态按 `id` 记录（`plugin-manager` README："Matching uses the entry id and any module-name assertion"）。
- `name`：本次 fork 用包名 `dsh-vt-gen-ui`（无 scope，与其它 `dsh-vt-*` 一致）。**行 id 建议直接用包名**（如 `dsh-vt-gen-ui`），与 `vt_QuoteBar`/`vt_UIUX_enhancer` 的既有惯例一致；若想保留"genui"语义也可用 `vt-genui`，但必须与 `package.json#name` 之外的所有字面量解耦（见 §3.5）。

### 2.5 准入检查：`engines.dsh` 与 `peerDependencies` 的互斥关系（**最容易被卡住的一条**）

`app-boot` README §53：

> 声明了 `engines.dsh` 时，**只有它**决定是否准入，`peerDependencies` 被忽略；没有 `engines.dsh` 时，每个指向 `@deepseek-ai/dsh` 或 `@deepseek-ai/dsh-*` 的 peer 范围都必须匹配。

对 fork 的影响：
- **必须**声明 `engines.dsh`（例如 `"^0.2.0-rc.1 || ^0.2.1-rc.1"`），否则一旦保留上游那 18 条 peerDependencies，就变成"18 条都必须匹配"的脆弱模式。
- `engines.node` / `engines.pnpm` **不参与** DSH 的准入检查（只有 `engines.dsh` 与 peer 被读）。所以 `engines.pnpm` 写不写都行——建议**不写**，理由见 §4.1。
- 版本门禁会对 `engines.dsh` 的**空值/非法值**报 incompatible；`workspace:` 前缀在 `engines.dsh` 里非法（同上）。

### 2.6 运行时模块解析：为什么 link 目录能 import `@deepseek-ai/*`

`app-boot` README §135「Linked directories」：

> profile 指向外部目录的 link，会为其 importer 打开"peer 感知的祖先查找"：在每个 `D/node_modules` 位置，`D/package.json` 里**声明为 peer 且存在于 runtime table** 的名字使用 runtime 包，其它名字使用物理候选。

含义（对本项目直接可操作）：
- 我们**不需要**在插件目录里 `pnpm add @deepseek-ai/cordis` 之类；只要**声明为 peerDependency**，就会解析到桌面版自带的副本。
- 反过来：**没有声明为 peer 的 `@deepseek-ai/*` 运行时 import 会解析失败**（物理 node_modules 不存在）。
- 实践佐证：`vt_UIUX_enhancer/index.js` 与 `vt_QuoteBar/index.js` 都**零跨包 import**，所以没有 peers 也能跑；上游 genui 的 host 产物也只 import node 内建，**唯一例外**是 `await import("@deepseek-ai/dsh-llm")`（`lib/index.js` 尾部），因此上游把那 18 条 peer 全列了出来（其中 `@deepseek-ai/dsh-llm` 是真正被用到的）。

---

## 3. client 半边装载约束

### 3.1 是不是必须单文件？

**静态 import 必须单文件；动态分割出的 `client.<name>.js` chunk 是唯一例外。**

- 服务端把插件 client 代码**拼装成一个 bundle**，整体下发到 `/plugins/<combo>/client.js`；`client.js` 里写 `import './probe.js'` 时浏览器会去请求 `/plugins/<combo>/probe.js` → 不存在（`vt_UIUX_enhancer/DEVELOPMENT.md:143-152`）。
- `factory(require)` 的 `require` 只解析**已注册的模块 id**（包名 / boot graph 行），不解析相对路径（同上 :149-150）。
- 例外通道：源码里的 `import()` 被 tsdown 分割后编译成 `require.async("./client.<name>.js")`，host 有精确路由 `/plugins/<package>/client.<n>.js?rev=…` 按需取（`dsh-client-modules` README §38、第 170 行 `CLIENT_CHUNK` 正则）。
- 上游选择不分割：`codeSplitting: false`（`tsdown.config.ts:183`），所以产物就是一个 `lib/client.js`（`791,947 B ≈ 792 KB`，单文件 minified）。**建议 fork 保持一致**：少一个可变量，也多一份"构建产物清单可核对"的确定性。

### 3.2 模块加载器协议（`window.__ModuleLoader__`）

标准形态（`tsdown.config.ts:184-186` 生成，`vt_UIUX_enhancer/client.js:40` 与模板 `templates/decoration/client.js:1-22` 同构）：

```js
window.__ModuleLoader__.load({
  id: 'dsh-vt-gen-ui',                       // 必须等于包名
  factory(require) {
    const React = require('react');         // 只解析平台表 + 已注册 id
    return { inject: ['slots'], apply(ctx) { … } };  // 返回 cordis 插件对象
  },
});
```

- `id` **必须等于 package name**（`ui-plugin.md:9`："a lazy factory whose id equals the package name"；`cm.mjs:99-101` 还会把 `<id>/client` 归一化回 `<id>`）。
- 执行 bundle 只是**注册工厂**；模块体副作用（含 CSS 注入）延迟到 materialization 才跑（`dsh-client-modules` README §72「Lazy-CJS model」）。
- 工厂内 `require` 三段解析顺序：平台种子表 → 记忆化记录 → boot graph 行/已注册工厂；其它一律 throw。**require 环路会直接抛错**（工厂式 CJS 无法交付部分导出）。
- 工厂必须**零副作用**：样式/定时器/监听器都放进 `apply` 里用 `ctx.effect` 注册并返回清理函数（`ui-plugin.md:13`）。

### 3.3 CSS Modules 是怎么在构建期被内联成 `<style>` 的

机制在 `tsdown.config.ts:33-77` 的 `cssModulesPlugin()`（虚拟模块方案，不是 tsdown 内置能力）：

1. `resolveId`：`*.module.css` → 虚拟 id `\0dsh-css:<相对路径>.mjs`（跳过 rolldown 默认的 CSS 处理）。
2. `load`：用 **lightningcss** `transform({cssModules:{pattern:'[hash]_[local]'}, minify:true})` 得到 `{code, exports}`。
3. 生成一段 JS：`css` 字符串 + **幂等注入** `<style data-plugin-css="<pkg>/<file>.module.css">`（用 `document.querySelector` 去重，`data-plugin` 标记归属插件）→ 因此 HMR 重载后不会堆叠重复 `<style>`。
4. `export default` 类名映射；**键按 UTF-16 本地名排序**（`:56-61` 注释：故意不用 `localeCompare`，避免系统 locale 漂移）。

对 fork 的直接要求：
- 视觉层可以继续用 `*.module.css`，但**必须保留这个插件**，否则 CSS Modules 会走 rolldown 默认管线（行为、类名、幂等性都会变）。
- 需要 `src/css-modules.d.ts` 的 ambient 声明（`declare module '*.module.css'`，上游 `src/css-modules.d.ts:1-5`）。

### 3.4 平台模块表（PLATFORM_MODULES）：只有这 11 个键

从 `app.asar/dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-BXV-oxvX.js` 里 `function OZ(){return{…}}` 取出（该 JS 是构建产物，键名可直读）：

```
react · react/jsx-runtime · react-dom · react-dom/client
@deepseek-ai/cordis · zod · @tanstack/react-virtual
@deepseek-ai/dsh-client-store
@deepseek-ai/dsh-client-ui-slots
@deepseek-ai/dsh-client-ui-primitives
@deepseek-ai/dsh-client-ui-dockkit
```

- 这 11 个之外的一切 import 都会被 `purityGate()` 在**构建期**拦下并抛错（`tsdown.config.ts:79-91`），除非登记到 `dsh.client.external` 且确有供应者。
- 上游 `EXTERNALS` 只列了 5 个（`react`, `react/jsx-runtime`, `react-dom/client`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-ui-primitives`，`tsdown.config.ts:25-27`），所以只放行自己**实际 require** 的子集；我们照抄这 5 个即可（若视觉层想用 `zod`/`dockkit`，再加进 EXTERNALS）。
- ⚠️ **`ui-primitives` 是保留字但不是安稳依赖**：`practices.md:35` 明确"不要 require `ui-primitives`"，因为它是宿主内部包、会不打招呼地变。上游 `lib/client.js` 里确实有一处 `require("@deepseek-ai/dsh-client-ui-primitives")`。**替换视觉层时这是优先要摘掉的耦合**（详见 §6 的风险 1）。

### 3.5 lazy 资产为什么单独出 IIFE + host 路由

1. **体积**：mermaid 3.4 MB、echarts-full 1.0 MB、icons 969 KB、three 700 KB。主 bundle 若含引擎，首屏要下 ~9 MB（`tsdown.config.ts:210-218` 注释）。
2. **加载协议不同**：lazy 资产**不走** module loader，而是 script 注入后读全局 `window.__GenuiAssets__`（`src/client/asset-loader.ts:68-95`）。
3. **服务端由插件自己的 host 半边提供**：`ASSET_ROUTE_PATH = '/plugins/@changfenhuang/dsh-genui/assets'`，通过 `webServer.register({kind:'prefix', path, handler})` 注册（`src/plugin/index.ts:38,242-248`），从 `lib/assets/` 读文件（`:70-73`）。
4. **为什么能抢在通用 `/plugins` 之前**：webserver 的匹配规则是"先精确、再**最长前缀**、再 fallback"（`dsh-host-webserver` README §62）。我们的前缀比 `/plugins` 长，所以赢。
5. **缓存失效**：URL 里带 `?rev=`，rev 取自 `window.__DSH_BOOT__.entries[].rev`，所以插件重建时资产缓存一起失效（`asset-loader.ts:51-56`）。
6. **HMR rev 的来源**：`mtimeMs/ctimeMs/size`（`dsh-client-hmr` README §62），不哈希内容。

**fork 必须改的三处字面量**（否则会去读旧插件的资产目录）：
- `src/plugin/index.ts:38` 的 `ASSET_ROUTE_PATH`
- `src/client/asset-loader.ts:22-25` 的 `PLUGIN_ID` / `ASSET_DIR`
- `tsdown.config.ts:18` 的 `ID`（它同时进 banner id、`style[data-plugin-css]` 的 tagId）

### 3.6 全量改名清单（实测 41 处）

`grep -rn "@changfenhuang/dsh-genui" src` → **41 处，分布在 ~30 个文件**。除此之外还有一批**不含包名但同样定义契约**的字面量，必须逐个判断"改 / 不改"：

| 字面量 | 位置示例 | 建议 |
|---|---|---|
| `@changfenhuang/dsh-genui` | 41 处 | **全改**为 `dsh-vt-gen-ui` |
| `dsh-ui`（围栏语言名） | `src/shared/fence-language.ts:5` | **不改**（模型契约、SKILL.md、用户文档都依赖它） |
| `[genui-action]`（回传动作前缀） | `src/client/index.tsx:63,109` | **不改**（skill 与模型行为契约） |
| `data-genui-rendered` 等 DOM 标记 | `src/client/dom-fence.tsx:109-110` | **建议加前缀**（如 `data-vtgenui-rendered`），见 §6 |
| `genui:fence`（prompt section 名） | `src/plugin/index.ts:219` | **不改**（与 SKILL.md/其它插件语义对齐；代价=与旧插件互斥，本来就互斥） |
| `render_ui` / `validate_dsh_ui`（tool 名） | `src/plugin/tool.ts:205,346` | **不改**（模型契约）；toolview key 同步 |
| skill 名 `genui` + provider `dsh-genui` | `src/plugin/index.ts:145-146,237` | skill 名**不改**；provider 名改成 `dsh-vt-gen-ui` |
| `data-plugin` / `data-plugin-css` | `tsdown.config.ts:66-69` | 自动跟随 `ID`，无需手改 |

> 建议做法：先做**纯机械替换**（包名字面量），用 `grep -c` 断言残留为 0；再单独一轮处理 DOM 标记前缀。不要在同一次提交里混做。

---

## 4. 构建链可行性

### 4.1 版本矩阵

| 项 | 上游要求（`package.json`） | 本机 / 桌面运行时 | 判定 |
|---|---|---|---|
| node | `^22.19.0 \|\| >=24.0.0`（`:206-210`） | shell `v22.22.0`；桌面 runtime `24.21.0` | ✅ 两者都满足 |
| pnpm | `>=11.7.0 <12`（`:205-210`） | shell `10.33.2` ❌；桌面内置 `11.28.5` ✅ | ⚠️ 本机 pnpm 不满足；见下 |
| tsdown | `^0.22.2`（devDep） | registry 有 0.22.0–0.22.14；0.22.x `engines.node: ^22.18.0 \|\| >=24` | ✅ 建议**精确锁** `0.22.14` 或 `0.22.2` |
| lightningcss | `^1.25.0` | registry 最新 `1.33.0`，1.25.0 起齐全 | ✅ 是原生二进制包，锁版本避免命令行差异 |
| typescript | `^5.6.0` | registry 最新 `7.0.2`（TS7 原生重写，不兼容风险高）；5.x 最新 `5.9.3` | ⚠️ **锁 `~5.9.3`**，别让 `^5` 的解析飘到 7 |
| rolldown | 由 tsdown 传递依赖（`rolldown ~1.1.0`） | — | ⚠️ minify 输出与 rolldown 版本强相关，锁 tsdown 即锁它 |

**关于 pnpm 的处置（建议）**：
- DSH 侧**不校验** `engines.pnpm`（只校验 `engines.dsh` 与 peers，`app-boot` README §53）；桌面 launcher 做包操作时用的是 **内置 pnpm 11.28.5**（`Resources/runtime/primary-runtime/runtime.json`），不是 shell 里的 10.33.2。
- 我们自己的 `pnpm install`（只在插件目录装构建工具）会用 shell 的 10.33.2。pnpm 的 `engine-strict` 本机为 `undefined`（默认 false）→ 只是**警告**不是失败。但为了零噪音，**建议 fork 的 package.json 不写 `engines.pnpm`、也不写 `packageManager`**——两者对 DSH 都无意义，只会制造版本抱怨。
- 如果坚持用 11.x：直接调内置 pnpm，例如
  `/Applications/DeepSeek\ Harness.app/Contents/Resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs install`

### 4.2 devDependencies：构建必需 vs 可裁剪

**构建必需（最小集，约 8 个）**

| 包 | 用途 | 依据 |
|---|---|---|
| `tsdown`（锁 0.22.x） | 打包 host + client + assets | `package.json:190`、`tsdown.config.ts` |
| `lightningcss` | CSS Modules 编译/压缩 + KaTeX CSS（若保留 standalone） | `tsdown.config.ts:16,50-55` |
| `typescript`（锁 5.9.x） | `tsc --emitDeclarationOnly` 产 `lib/types/**`（若保留 `types` 导出） | `tsconfig.json:15,29-30` |
| `react` + `react-dom` | JSX runtime 构建期解析 + `.tsx` 编译 | `tsdown.config.ts:25-27` |
| `@types/react` + `@types/react-dom` | 类型 | 上游 devDep |
| `@types/node` | node 内建类型（上游 tsconfig `types:["node"]`） | `tsconfig.json:12-14` |

**上游有、但可裁剪**（按"视觉层 fork"的口径）：

| 包 | 能否裁 | 理由 / 前提 |
|---|---|---|
| `vitest` / `jsdom` / `@testing-library/*` | ✅ 可裁 | 上游**没有发布 tests/**（`files` 里无 tests，实测包内无该目录），`pnpm test` 在 fork 里本来也无测试可跑 |
| `vite` / `tsx` | ✅ 可裁 | 只服务上游的开发/测试脚本 |
| `three` / `mermaid` / `echarts` / `echarts-wordcloud` / `@types/three` | ⚠️ 视裁剪 | 只有保留 scene3d/mermaid/echart 块时才需要；它们只被 `asset-*.ts` 入口引用 |
| `shiki` / `@shikijs/langs` / `anser` / `diff` | ⚠️ 视裁剪 | 代码块高亮相关 |
| `simple-icons` | ⚠️ 视裁剪 | 品牌图标 |
| `immer` / `zustand` / `clsx` | ⚠️ 视裁剪 | client 状态/样式工具 |
| `mdast-util-*` / `micromark-*` / `katex` / `@types/katex` | ⚠️ 视裁剪 | 公式与 GFM 渲染 |
| 全部 `@deepseek-ai/*`（60+ 条 devDep，全部 `0.2.1-rc.2`） | ⚠️ **必须逐条判断** | 它们是**类型来源**（`import type` 会被擦除）。裁之前先确认对应 `.tsx/.ts` 里没有 `import type` 引用，否则 `tsc` 报错。注意版本写的是 `rc.2`，而运行时不一定是 rc.2（peer 语义） |

> 关键事实：**上游 npm 包里没有 `scripts/` 目录**（`files` 未包含，实测 `ls` 无该目录），但 `package.json:190-195` 的 build 仍调用 `node scripts/clean.mjs` / `scripts/prepack.mjs` / `scripts/check-standalone.mjs`。**所以 fork 不能直接用上游 build 脚本**——要么自己写一个 `rm -rf lib`，要么把 clean 内联进 npm script。

### 4.3 构建命令与产物清单

```
构建：rm -rf lib && tsc -p tsconfig.json && tsdown
```

产物（实测 `dsh-genui/lib/`）：

| 产物 | 大小（实测） | 说明 |
|---|---|---|
| `lib/index.js` | 199 KB | host 半边，ESM，只 import node 内建 |
| `lib/client.js` | 791,947 B ≈ 792 KB（单文件 minified） | 浏览器半边，CJS + module-loader banner |
| `lib/types/{plugin,client}/**/*.d.ts` | — | tsc 声明输出 |
| `lib/assets/mermaid.js` | 3.39 MB | lazy IIFE |
| `lib/assets/three.js` | 700 KB | lazy IIFE |
| `lib/assets/echarts-core.js` | 588 KB | lazy IIFE |
| `lib/assets/echarts-full.js` | 1.04 MB | lazy IIFE |
| `lib/assets/icons.js` | 969 KB | lazy IIFE |
| `lib/assets/standalone-runtime.js` | 1.14 MB | 单文件 HTML 导出运行时（可裁） |

tsdown 是"多 config 数组"：`libConfig`（`tsdown.config.ts:246-261`）、`clientConfig`（`:153-188`）、`standaloneConfig`（`:190-208`）、`assetConfig()` × 5（`:219-244,267-273`）。全部 `clean: false`，清理交给 build 脚本（`:258-260` 注释解释了为什么：不能中途擦掉 tsc 的 `lib/types`）。

### 4.4 可复现性（"byte-identical"）判断

上游声明 client bundle 可重复构建出**逐字节相同**的 `client.js`（`tsdown.config.ts:7-11`）。成立的三个前提：
1. `sourcemap: false`（`:165`）——没有映射文件、没有路径重写；
2. CSS Modules 类名映射按 UTF-16 本地名排序，**不用 `localeCompare`**（`:56-61`）；
3. `minify: true` + 固定 `banner`/`footer`/`intro`/`entryFileNames`（`:162,177-187`）。

**但**"逐字节"只对**同一套工具链**成立：rolldown/lightningcss 的小版本升级会改变压缩输出。所以：
- fork 必须**锁死** `tsdown` / `lightningcss` / `typescript` 的精确版本（写死，不用 `^`）；
- 不要用 `Date`、随机数、绝对路径进入 bundle（注意 `new URL('./assets/', import.meta.url)` 只在 host 半边，没问题）；
- 我们的实际验收标准不必是"跨机器逐字节"，而是"**同机二次构建 sha256 相同**"——这条足够支撑"视觉层改动可审计"。

### 4.5 已知坑（都会白改一轮）

1. **`clean` 顺序**：先删 `lib` 再 `tsc` 再 `tsdown`；tsdown 里 `clean:false` 必须保持，否则会擦掉 `lib/types`。
2. **`fixedExtension: false`**（`:254`）：否则 ESM 产物会变成 `.mjs`，`main/exports` 全要改。
3. **`platform: 'node'` + `format: ['esm']`**（host）：node 内建保持 external（产物实测只有 `node:` import），这保证 link 安装时没有跨包依赖。
4. **typing 不一致**：`tsconfig.json:12-14` 写了 `types:["node"]` 且有 `@types/node` devDep，但 `src/plugin/node-shims.d.ts:6-7` 的注释仍声称 `types: []` 且"不装 @types/node"。**fork 要统一成一种**（建议保留 `@types/node` + 删掉那份手写 shim，或反之），否则后来人会照错的那份做。
5. **`jsx: react-jsx`**（`tsconfig.json:6`）：`react/jsx-runtime` 必须能解析到（devDep 里的 `react` 提供），否则 build 直接失败。

---

## 5. 安装方式

### 5.1 `"link:…"` 是怎么落地的（实证）

profile `package.json:12`：

```json
"dsh-vt-interface": "link:/Users/mac/Project/DSH/Plugins/vt_UIUX_enhancer"
```

落地结果（`ls -la ~/.dsh/profiles/desktop/node_modules/`）：

```
dsh-vt-interface -> ../../../../Project/DSH/Plugins/vt_UIUX_enhancer
dsh-vt-quotabar  -> ../../../../Project/DSH/Plugins/vt_QuoteBar
```

即：**pnpm 把依赖装成一个指向源目录的 symlink**，源目录里改文件立刻生效（不需要重新 install）。同时 `package.json:18-33` 的 `dsh.profile.bundles` 数组里必须有对应包名，bundle 层才会被拼进 composition。

> 注意：link 安装**不受 `files` 字段过滤**（`host-plugin` 参考 §35："Local directory installation links the checkout instead, so check the files directly"）。所以开发目录里不要留半成品/临时文件。

### 5.2 `plugin_manager install_bundle` 与手工 link 的差别

| | 手工 `pnpm add link:…` | `plugin_manager install_bundle` |
|---|---|---|
| 谁写 profile `package.json` | 你（违反本项目约束） | 工具（`link:<abs dir>`，Source/开发版 Desktop 的形态） |
| 谁写 `dsh.profile.bundles` | 你 | 工具（**追加到末尾**，会改变配置优先级） |
| 版本兼容预检 | 无 | 有（`engines.dsh` / peers，`local path 读自身 package.json`） |
| 失败回滚 | 无 | 恢复 `package.json` + `pnpm-lock.yaml` |
| `already-installed` 拒绝 | 无 | 有（HMR 下同名 spec 已装则拒绝） |
| 结论 | **开发期不要用** | **唯一合规路径** |

补充事实（`plugin-manager` README，Use this package）：
- "Linked packages use that checkout's **dependencies and peers**；rebuilding and restarting remain necessary after code changes." → 源目录要先 `pnpm install`（构建工具）并 `pnpm run build`（产物）。
- 没有 HMR 时，正在运行的 bundle 不能被移除 → 会报 `restart-required`。本 profile 的 web 组合**已挂 `client-hmr`**（`dsh-web-app/cordis.patch.yml:219-220`），所以配置变更可即时生效。

### 5.3 热更新的真实边界

| 改了什么 | 生效方式 | 需要重启 host？ | 需要刷新页面？ | 证据 |
|---|---|---|---|---|
| `lib/client.js`（或它引用的 chunk） | HMR 轮询产物 `mtime/ctime/size`（默认 500 ms）→ 失效旧模块 → 预取新脚本 → 重挂插件（**React 局部状态丢失**） | ❌ | ❌ | `dsh-client-hmr` README §32,62；`vt_UIUX_enhancer/DEVELOPMENT.md` 前身 watcher 注释（"the client module loader already hot-reloads this package on save"） |
| `lib/assets/*.js` | 下次按需加载时用新的 `?rev=` | ❌ | ❌ | `asset-loader.ts:51-56` |
| `lib/index.js`（host 半边） | Node ESM 模块代际，**无 live reload 通道**；需重启 Desktop（或至少重载该 fiber） | ✅ | — | `host-plugin` 参考 §68："replacing an installed package requires restart to load a fresh JavaScript module generation" |
| 新增/禁用 bundle（patch 变更） | HMR 重组合，即时生效 | ❌ | ❌ | `plugin-manager` README："With HMR enabled in YAML, configuration changes apply immediately" |
| `package.json#dsh.client` 变更 | 需要重新 composition（走 patch 变更路径） | ❌ | ❌ | 同上 |

### 5.4 开发期推荐流程（不手写 profile）

```
① 源目录改 src/**
② pnpm run build            # 只在检查通过时执行（tsc 先行，失败即停）
③ 浏览器自动换新（~0.5 s），肉眼验收；React 局部状态会重置
④ 改到 host 半边（prompt 文案 / tool 定义 / 资产路由）→ 重启 Desktop 后验收
⑤ 版本冻结时才 install_bundle（见 §9 第 12 步）
```

补充建议：
- 首次安装必须走 `install_bundle`；之后**同一目录**的日常迭代不再需要重装（link 已建立）。
- 想要"看 compose 后的真实配置"：`dsh --profile desktop --dump-config` 对 desktop **被拒绝**（实测：`error: profile "desktop" is managed exclusively by the Electron application`）。替代：`cordis_inspect_query`（Host Provider）或在 Web 的 Plugins 页看行状态。

---

## 6. 共存与切换风险

### 6.1 冲突矩阵（`dsh-vt-gen-ui` 与 `@changfenhuang/dsh-genui` 同时启用）

| 冲突面 | 具体键 | 后果 | 证据强度 |
|---|---|---|---|
| **prompt section** | `genui:fence` | 第二个 `apply` 抛错：`prompt section "genui:fence" is already registered` → 该 fiber 激活失败，**整个插件（含它的 tool/skill/资产路由）都不生效** | **确定**：`dsh-system-prompt/lib/index.js` 的 `NamedEntries` 错误串 + `src/plugin/index.ts:219` |
| **模型工具** | `render_ui`、`validate_dsh_ui` | 同上：`tool "render_ui" is already registered` | **确定**：`dsh-tools/lib/index.js` 的 `NamedEntries` 错误串 + `src/plugin/tool.ts:205,346` |
| 注册顺序 | — | `apply` 里 section 先于 tool（`:218` vs `:227`），所以**先炸的是 section** | **确定** |
| skill 目录 | 两个 provider 都报 skill 名 `genui` | skill 列表可能出现重复条目 / 同名覆盖，模型侧路由不确定 | 中（provider 是 `registerProvider`，按名聚合；`src/plugin/index.ts:236-237,145-146`） |
| **client DOM 观察者** | `data-genui-rendered` 标记 + MutationObserver | 两个实例都观察同一段对话 DOM。标记字符串相同 → 先到者挂载、后者多半跳过；但两边各持自己的 observer/root 表，任一方卸载都可能留下残挂载或恢复错误的 stock block | 中高（标记是字面量，`src/client/dom-fence.tsx:109-110`；挂载/恢复逻辑 `:46`） |
| client 槽位 | `tool.call.toolview` key=`render_ui`；`conversation.input.dock` id=`genui-panel` | 同名注册在浏览器端的行为取决于 slots 实现（**未验证**，见 §10）；最坏是重复卡片/重复 dock | 中（`src/client/index.tsx:142-163`） |
| 资产路由 | `/plugins/<pkg>/assets` | **不冲突**（前缀不同；同前缀才会 `duplicate path throws`） | 确定（`dsh-host-webserver` README §62） |
| 状态/持久化 | `[genui-action]`、会话内 durable state 的 `sourceId` | 若两边都渲染，动作可能被双发/双记 | 中 |
| install 层面 | 包名不同 | **不冲突**（`already-installed` 只对同名 spec 触发） | 确定 |

### 6.2 结论

**两者互斥，必须"只有一个启用"。** 理由不是"可能有点乱"，而是**host 半边第二个 `apply` 会抛异常**——这已经是确定的失败，不是概率问题。而 client 半边是否仍被装载（因为 Loader 行仍"存在"）**未验证**（见 §10 未验证项 A），所以不能用"host 失败了所以 client 也不会跑"来赌。

### 6.3 安全切换方案（推荐顺序；全部通过 `plugin_manager`，不手写 profile）

**方案 A（推荐，可回滚，零手写）：**

1. `plugin_manager` `list_bundles`（或 `list_plugins`）拿到精确标识与当前 `enabled`。
2. `plugin_manager` `set_bundle` `{target:"@changfenhuang/dsh-genui", enabled:false}`
   → 工具在 profile `cordis.patch.yml` 写（追加或更新）一条只含 `id` + `disabled: true` 的覆盖行；不改 `dsh.profile.bundles`（保留依赖，便于回滚）。
   - 依据：`plugin-manager` README「一个 plugin toggle 只更新 profile `cordis.patch.yml` 里最后一个匹配覆盖的 `disabled`，没有就追加」。
3. 验收"旧插件真的下线"：旧 section 消失（模型不再产出 `dsh-ui` 围栏）、Settings→Plugins 行显示 disabled、旧 client 的 DOM 渲染停止。
4. 用 §9 的清单把新包构建好（`lib/index.js` + `lib/client.js` 必须已存在）。
5. `plugin_manager` `install_bundle` `{target:"/Users/mac/Project/DSH/Plugins/vt_GenUi", enabled:true}`（本地绝对目录 → 落 `link:` 依赖 + 把 `dsh-vt-gen-ui` 追加进 `dsh.profile.bundles`）。
6. 验收：新 section 生效、`render_ui` 可用、围栏渲染、资产路由 200。
7. 出问题时 `set_bundle enabled:false`（新）→ `set_bundle enabled:true`（旧）。**顺序不能反**（先禁新再启旧）。

**方案 B（不推荐，仅当必须"新旧同时看得见"）：**
让新包**改所有唯一键**（section 名 `vt-genui:fence`、tool 名 `vt_render_ui`、skill 名 `vt-genui`、DOM 标记前缀、dock id、toolview key）。代价：模型契约分裂（两个 SKILL.md 说两套 tool 名）、toolview 要重注册、回归面翻倍。**除非有明确 A/B 需求，否则不要做。**

**绝对不要做的：**
- 手工往 profile `cordis.patch.yml` 里写 `- id: genui\n  name: '@changfenhuang/dsh-genui'\n  disabled: true`（违反约束、且会被后续 `plugin_manager` 写入视为"已有覆盖"而收敛到意外状态）。
- 手工改 `dsh.profile.bundles`（顺序即优先级；手工插入位置会改变覆盖语义）。
- 两个包同名安装（会触发 `already-installed` 拒绝，或导致"同一 package name 的两个 active Loader source"composition 报错——`cm.mjs` 注释 :122-124）。

### 6.4 回滚 checklist

- [ ] 新 bundle `enabled:false`（先），再旧 `enabled:true`
- [ ] 确认没留下 `lib/assets` 的 404（浏览器 Network 里 `/plugins/dsh-vt-gen-ui/assets/*` 应全部消失）
- [ ] 确认旧插件 duarable state / 面板仍正常（`panel-store` 按 session 存，不跨插件共享）
- [ ] 若要彻底移除：`remove_bundle`（会同时 deselect 并卸载）

---

## 7. 初始化清单（草稿）

### 7.1 `package.json` 草稿

```jsonc
{
  "name": "dsh-vt-gen-ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "dsh-vt-gen-ui：在 DSH Web 中把 ```dsh-ui 围栏渲染为结构化 UI（vt 视觉层 fork，源自 @changfenhuang/dsh-genui 0.14.0）",
  "icon": "./assets/icon.svg",

  "main": "lib/index.js",
  "types": "lib/types/plugin/index.d.ts",
  "exports": {
    ".":            { "types": "./lib/types/plugin/index.d.ts", "default": "./lib/index.js" },
    "./client":     { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    "./package.json": "./package.json",
    "./icon":       "./assets/icon.svg",
    "./locale/*.json": "./locale/*.json",
    "./skill":      "./SKILL.md"
    // 若保留 lazy 引擎资产（推荐），可按上游补 ./assets/mermaid 等
  },
  "files": [
    "lib/**", "src/**", "assets/**", "locale/*.json",
    "SKILL.md", "DESIGN.md", "cordis.patch.yml",
    "tsconfig.json", "tsdown.config.ts",
    "LICENSE", "THIRD_PARTY_NOTICES.md", "README.md"
  ],

  "dsh": {
    "bundle":  { "patch": "./cordis.patch.yml" },
    "client":  { "platform": "web", "inject": [] }
  },

  "engines": {
    "dsh":  "^0.2.0-rc.1 || ^0.2.1-rc.1",
    "node": "^22.19.0 || >=24.0.0"
  },

  "scripts": {
    "clean": "rm -rf lib",
    "build": "npm run clean && tsc -p tsconfig.json && tsdown",
    "build:fast": "tsdown"
  },

  "devDependencies": {
    "tsdown": "0.22.14",
    "lightningcss": "1.33.0",
    "typescript": "5.9.3",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "@types/react": "18.3.27",
    "@types/react-dom": "18.3.7",
    "@types/node": "22.19.0"
  }
}
```

要点 / 取舍说明：

| 决策 | 理由 |
|---|---|
| `private: true` | 本地 fork，不发布（发布才需要许可与 files 全量核对） |
| 无 `dependencies` | host 半边零跨包运行时依赖（裁剪 §4.2 后成立）；client 半边全部来自平台表 |
| 无 `peerDependencies` | 依赖 `engines.dsh` 单条准入；**若保留 `fence-feedback`**，必须补 `"@deepseek-ai/dsh-llm": "^0.2.0-rc.1 \|\| ^0.2.1-rc.1"` 作为 peer，否则 link 目录里那处动态 import 会解析失败（§2.6） |
| 无 `engines.pnpm` / `packageManager` | DSH 不校验；本机 pnpm 10 会抱怨（§4.1） |
| `locale/*.json` + `icon` | `host-plugin` 参考 §31-51 的展示元数据清单；上游**缺 locale**（显示名回退 package.json），我们补上是加分项 |
| `files` 里含 `src/**` | 便于 link 安装时对照源码（link 不按 files 过滤，但发布时有用） |

### 7.2 `cordis.patch.yml` 草稿

```yaml
# dsh-vt-gen-ui bundle patch。
# 由 deepseek-harness 的 profile 组合在 `plugin_manager install_bundle` 时拼入。
# 行 id 一旦发布不要改：用户的 profile patch 与开关状态按 id 匹配。
# host 半边：注入 `dsh-ui` 围栏的 prompt section + render_ui/validate_dsh_ui 工具 + bundled skill
# client 半边：dsh.client → lib/client.js，浏览器侧 DOM 围栏渲染器
- insert:
    - id: dsh-vt-gen-ui
      name: 'dsh-vt-gen-ui'
```

> 可选：把两个上游配置项暴露出来（`src/plugin/index.ts:202-214` 定义了 `fenceFeedback` / `renderUiTool`,见 `:208` / `:213`），加 `config: { fenceFeedback: false }` 之类。**注意**：patch 的覆盖是"整块替换 config"，config 一旦写就要写全你保留的键。

### 7.3 `tsconfig.json`：**照抄**（一处统一）

上游 `tsconfig.json:1-35` 全部照抄（`target es2024` / `module esnext` / `moduleResolution bundler` / `jsx react-jsx` / `strict` + 4 个额外严格项 / `emitDeclarationOnly` + `declarationDir: lib/types` / `allowImportingTsExtensions` + `rewriteRelativeImportExtensions`）。

只做一处修正：**统一 `types` 与 `@types/node` 的说法**（上游代码与注释自相矛盾，§4.5 第 4 条）。建议保留 `"types": ["node"]` + `@types/node` devDep，**删除** `src/plugin/node-shims.d.ts`。

> ⚠️ `allowImportingTsExtensions` + `rewriteRelativeImportExtensions` 依赖 TS ≥5.7 的语义；锁 `5.9.3` 安全，**不要升到 7.x**。

### 7.4 `tsdown.config.ts`：**照抄 + 4 处必改 + 视裁剪删 2 个 config**

必改：
1. `:18` `const ID = '@changfenhuang/dsh-genui'` → `'dsh-vt-gen-ui'`
2. `:25-27` `EXTERNALS`：先照抄 5 项；**目标**是删掉 `@deepseek-ai/dsh-client-ui-primitives`（若视觉层不再 require primitives，见 §6 风险 1）
3. `:267-273` 导出数组：按裁剪删 `standaloneConfig`（若不需单文件 HTML 导出）与不需要的 assetConfig
4. 文件名/路径常量无需改（`PROJECT_ROOT` 由 `import.meta.url` 推导）

必须保留：
- `cssModulesPlugin()`（`:33-77`）—— 视觉层的核心机制
- `purityGate()`（`:79-91`）—— 构建期拦截越界 import，这是防止"上线才发现 runtime 崩"的最便宜护栏
- `clientConfig` 的 `banner`/`footer`/`intro`/`entryFileNames`（`:184-187`）—— module loader 协议本体

判断结论 | 理由
---|---
**不要重写**这份 tsdown 配置 | 里面每个非默认选项都是踩过坑的结果（locale 无关排序、clean 顺序、purity、codeSplitting 关闭、IIFE 单入口限制）。自己写只会把这些坑重踩一遍。
**可以删** `standaloneConfig` + `standaloneAliasPlugin` + `standaloneKatexCssPlugin`（`:93-151,190-208`） | 只服务"导出独立 HTML/运行时"，视觉层 fork 通常不需要；删了省 1.14 MB 资产与一套 KaTeX 字体内嵌逻辑。前提：`artifact/*` 的导出功能一并下线（`toolview.tsx`/`panel.tsx`/`fence-render.tsx`/`embed.ts` 都引用 artifact）。

### 7.5 目录结构建议

```
vt_GenUi/
├── package.json              # §7.1
├── cordis.patch.yml          # §7.2
├── tsconfig.json             # §7.3 照抄
├── tsdown.config.ts          # §7.4 照抄+改
├── .gitignore
├── LICENSE                   # MIT（上游版权行 + 我方）§8.1
├── THIRD_PARTY_NOTICES.md    # §8.2
├── README.md
├── DESIGN.md                 # 视觉体系（token/typography/spacing/radius/motion/shadow）
├── SKILL.md                  # 模型侧技能（frontmatter: name+description）
├── assets/                   # icon.svg 等展示资源
├── locale/{zh,en}.json       # meta.title / meta.description
├── src/
│   ├── index.ts              # 根入口：export * from './plugin/index'
│   ├── css-modules.d.ts
│   ├── shared/               # 跨半边纯函数（围栏语言识别、JSON 修复、resolve）
│   │   ├── fence-language.ts
│   │   ├── fence-repair.ts
│   │   └── fence-resolve.ts
│   ├── plugin/               # host 半边
│   │   ├── index.ts          # apply / inject / name / section 文案 / 资产路由
│   │   ├── tool.ts           # render_ui + validate_dsh_ui 定义
│   │   ├── genui-diagnostic.ts
│   │   ├── inline-content-diagnostic.ts
│   │   └── (fence-feedback.ts)   # 可选，见 §4.2
│   └── client/               # 浏览器半边（=== 视觉层主战场）
│       ├── index.tsx         # apply(ctx)：DOM 渲染器 + toolview + dock
│       ├── dom-fence.tsx     # 对话 DOM 观察与挂载
│       ├── fence-render.tsx
│       ├── blocks/           # 组件实现（基本/图表/表单/高级/diagram）
│       ├── genui-runtime/    # schema / normalize / limits / diagnostics
│       ├── *.module.css      # 视觉层：这里改
│       ├── asset-loader.ts + asset-{mermaid,three,echarts-core,echarts}.ts
│       ├── standalone/ …     # 可裁
│       └── artifact/ …       # 可裁（但牵连 toolview/panel）
├── tests/                    # 建议新建：先只放"围栏解析 + 视觉快照"两类
└── docs/
    ├── recon/scaffold.md     # 本文件
    ├── reference/            # 上游 SKILL.md/CHANGELOG 等对照物
    └── VERIFY.md             # 视觉验收清单（对齐 vt_UIUX_enhancer 的做法）
```

**为什么把 `src/shared/` 单独留出来**：上游三个 `shared/*` 被 host 与 client 同时 import（`src/plugin/index.ts` 与 `src/client/*`），是"两份半边唯一的共享代码"。视觉层改造**不应该碰它们**——它们是契约层（围栏语言识别、JSON 修复）。这也是 §3.6 改名清单里要特别小心的一块。

### 7.6 `.gitignore`

```gitignore
# 构建产物（由 pnpm build 生成，不入库）
lib/

# 依赖
node_modules/

# 工具链缓存
.codegraph/
*.tsbuildinfo

# OS / 编辑器
.DS_Store
*.log
```

> 判断依据：`lib/` 是**可再生**的（§4.4 可复现），且体积 ~9 MB（含 4.9 MB 引擎资产）。但注意 **link 安装要求 `lib/client.js` 已存在**——所以 `pnpm build` 是"首次安装前"的硬前置，不能写成"可以后补"。

### 7.7 DESIGN.md / SKILL.md 义务

- `DESIGN.md`：本仓库 `~/.dsh/AGENTS.md`（UX/UI 章节）要求"新建页面/设计系统且尚无设计约定时，先创建 DESIGN.md 并引用其 token"。视觉层 fork **必须**先有 DESIGN.md 再动 CSS，否则"替换视觉层"没有判据。
- `SKILL.md`：frontmatter **必须**有 `name` 与 `description`——上游在运行时读它来注册 bundled skill，缺任一字段会 `throw`（`src/plugin/index.ts` `bundledSkillProvider()`：`invalid frontmatter` / `no description`）。

---

## 8. 版本与许可

### 8.1 MIT 义务（可执行清单）

`LICENSE:1-3`：`MIT License / Copyright (c) 2026 dsh-external`。MIT 要求"上述版权声明与许可声明应包含在本软件的所有副本或主要部分中"。

fork 必须做：
- [ ] 仓库根放 `LICENSE`，**原文保留**上游版权行。
- [ ] 追加我方版权行（如 `Copyright (c) 2026 <owner>`），或写成 "Portions copyright (c) 2026 dsh-external"。
- [ ] `package.json` 保留 `"license": "MIT"`（草稿里漏了，补上）。
- [ ] README 顶部写明：`dsh-vt-gen-ui` 是 `@changfenhuang/dsh-genui@0.14.0` 的 fork，视觉层由本项目替换。

### 8.2 `THIRD_PARTY_NOTICES.md` 义务

上游这份文件（`:1-16`）声明的是 **OpenAI Apps SDK UI 图标集**（MIT，pinned commit `0f00143…`，749 字形，vendored 到 `src/client/icons/icon-data.ts` + `icon-names-full.ts` + lazy `icons.js`）。

三种处置，**必须选一种并写清**：

| 方案 | 动作 | 合规义务 |
|---|---|---|
| A. 保留图标集 | 原样保留 `icon-data*.ts` / `icon-names-full.ts` | **必须**原样保留 OpenAI MIT 声明段（含版权行与 pinned commit） |
| B. 换 Lucide/Phosphor（推荐，符合本机 AGENTS.md 偏好） | 移除 `icons/*`，接新图标库 | 换成对应许可声明（Lucide = ISC；Phosphor = MIT）；**删掉** OpenAI 段（不再包含其代码） |
| C. 只留少量自绘图标 | 删 `icons/*` | 无需第三方声明，但要在 notices 里写"icons are original artwork" |

> ⚠️ 若只是"少用几个图标"但**文件还在**，仍属"包含其代码"，A 的义务不消失。

### 8.3 运行时引擎的许可（构建产物层面的再分发）

上游 notices 说 KaTeX/Mermaid/ECharts/three"运行时从各自包加载、未 vendored 进仓库"。但**产物 `lib/assets/{mermaid,three,echarts-core,echarts-full,icons}.js` 确实把引擎代码打进了 IIFE**。所以：

- 如果**只在本地用**（`private: true`、不发布）：不构成对外分发，风险低。
- 如果**将来发布**：需要补 KaTeX(MIT) / Mermaid(MIT) / three(MIT) / ECharts(**Apache-2.0，需 NOTICE**) / echarts-wordcloud(Apache-2.0) / shiki(MIT) / simple-icons(CC0) 的声明。**Apache-2.0 的 NOTICE 义务是最容易被漏的一条。**

### 8.4 抄代码的合规边界（我的判断）

- **合规**：整包 fork 结构 + 保留 LICENSE/notices + 保留上游版权行 → MIT 明确允许（"copy, modify, merge, publish, distribute"）。
- **合规但需记账**：`src/` 里 41 处包名字面量 + 一批 `data-genui-*` 标记仍带上游痕迹——这不违法，但**不要删除或弱化上游版权与来源说明**（那是 MIT 唯一实质义务）。
- **不建议**：把上游 README/CHANGELOG 里"作者/仓库"信息改成自己的，同时不声明来源。看起来像洗稿，且是 MIT 违规。
- **完全独立的部分**：我们要新写的视觉层（DESIGN.md、`.module.css`、新组件）版权归我方，可单独标注。

---

## 9. 初始化必须做的 13 步（lead 可直接按序执行）

> 每步给出**验收判据**；标注了「只读」「需 plugin_manager」的步骤不要用 shell 绕过。

**第 1 步 · 锁定基线与裁剪范围**
把上游 `0.14.0` 的 `src/` 复制到本仓库 `docs/reference/upstream-0.14.0/`（**只读参考，不进构建**）。同时写一页 `docs/recon/trim.md` 记录三个裁剪决策：①`fence-feedback.ts` 留/删（决定是否要 `@deepseek-ai/dsh-llm` peer）②`standalone/*` 留/删（决定是否少一个 tsdown config）③`achievements` 留/删。
*验收*：三行决策 + 各自的理由，能一句话说清"删了会失去什么"。

**第 2 步 · 建骨架目录**
按 §7.5 建 `src/{shared,plugin,client}/`、`assets/`、`locale/`、`tests/`、`docs/`。写 `.gitignore`（§7.6）。
*验收*：`git status` 只显示新目录，无意外文件。

**第 3 步 · 写许可文件**
`LICENSE`（上游 MIT + 我方版权行）、`THIRD_PARTY_NOTICES.md`（按 §8.2 选 A/B/C 之一）。
*验收*：`grep -c "Copyright" LICENSE` ≥ 2；notices 里对图标来源的表述与实际 `src/client/icons/` 是否存在一致。

**第 4 步 · 写 `package.json`**
按 §7.1 草稿，**补上 `"license": "MIT"`**。
*验收*：`node -e "JSON.parse(require('fs').readFileSync('package.json'))"` 通过；`dsh.bundle.patch`、`dsh.client.platform`、`exports["./client"]`、`engines.dsh` 四项齐全。

**第 5 步 · 写 `cordis.patch.yml`**
按 §7.2。行 `id` 与 `package.json#name` 保持一致。
*验收*：`node -e` 用 `yaml` 库（或 `python3 -c "import yaml"`）解析成功，顶层是数组、首个元素有 `insert`。

**第 6 步 · 复制并机械改名 `src/`**
先整目录复制上游 `src/`，再做**纯字面量替换**：`@changfenhuang/dsh-genui` → `dsh-vt-gen-ui`（41 处）。**本轮不改任何逻辑、不动 `dsh-ui`/`[genui-action]`/`render_ui`/`genui:fence`。**
*验收*：`grep -rn "@changfenhuang" src/ | wc -l` = 0；`git diff --stat` 与预期文件数匹配；三处必需的运行时字面量已改（`src/plugin/index.ts` 的 `ASSET_ROUTE_PATH`、`src/client/asset-loader.ts` 的 `PLUGIN_ID`/`ASSET_DIR`）。

**第 7 步 · 写 `tsconfig.json`**
照抄上游，统一 `types`/`@types/node` 说法（§7.3），删 `node-shims.d.ts`。
*验收*：文件是合法 JSON（JSONC 允许多行）；`include: ["src"]`。

**第 8 步 · 写 `tsdown.config.ts`**
照抄 + 4 处必改（§7.4），按第 1 步的决策删除不需要的 config 数组项。
*验收*：`grep -c "@changfenhuang" tsdown.config.ts` = 0；导出的 config 数组长度与保留的 target 数量一致（最小 3：lib / client / assets）。

**第 9 步 · 装构建工具链**
在 `vt_GenUi/` 内 `pnpm install`（若想避免 pnpm 版本噪音，用内置 `.../primary-runtime/dependencies/pnpm/bin/pnpm.mjs install`）。
*验收*：`node_modules/tsdown`、`lightningcss`、`typescript` 存在；`pnpm ls --depth 0` 无 warning 级的 engines 报错。

**第 10 步 · 首次构建并核对产物**
`pnpm run build`。
*验收*：`lib/index.js`、`lib/client.js` 存在；`lib/client.js` 首行以 `window.__ModuleLoader__.load({id:\`dsh-vt-gen-ui\`` 开头、以 `}});` 结尾；`lib/index.js` 里 `import` 只出现 `node:` 前缀（若有非 node import，说明第 1 步的裁剪没做干净、需要补 peer）；`lib/assets/*.js` 数量 = 保留的 assetConfig 数。

**第 11 步 · 静态自检（装机前最后一关）**

```
node --check lib/client.js           # 语法
grep -c "dsh-vt-gen-ui" lib/client.js # 应 ≥ 2（loader id + css tagId）
grep -o "require(\"[^\"]*\"" lib/index.js | sort -u   # 应为空或仅 node:
grep -rn "@changfenhuang" src/ lib/ cordis.patch.yml   # 应为 0
```
*验收*：四条全过。**这一步不通过就不要 install**（装坏会留下需要重启才能清的模块代际）。

**第 12 步 · 安装并验收（顺序不可颠倒）**
① `plugin_manager` `set_bundle` 禁用 `@changfenhuang/dsh-genui` → ② 确认旧 UI 渲染已停 → ③ `plugin_manager install_bundle` `{target: "/Users/mac/Project/DSH/Plugins/vt_GenUi"}` → ④ 在 Web UI 里验收：模型能出围栏、围栏能渲染、`render_ui` 工具卡片、资产路由 200、无 console 报错 → ⑤ 记录回滚开关（§6.4）。
*验收*：`install_bundle` 返回 `application: applied`（不是 `restart-required`）；浏览器 Network 里 `/plugins/dsh-vt-gen-ui/assets/*` 全部 200。

**第 13 步（可选，但建议） · 写 `DESIGN.md` 与视觉层第一刀**
只有在第 12 步**已装上一个能跑的基线**之后，才开始改 `.module.css`/组件。先写 DESIGN.md 定 token，再改 CSS。
*验收*：`pnpm run build` → 浏览器 0.5 s 内换新（无需刷新）；DESIGN.md 的 token 与 `.module.css` 里的实际值一一对应。

> 计数口径：**第 1–12 步是「能装上」的最小闭环**（做完即有一个能在浏览器渲染的可运行基线）；**第 13 步是首版之后的视觉迭代**。对 lead 报数用 **13**，报「最小可运行」用 **12**。

---

## 10. 未验证项与方法附录

### 10.1 我**没有**验证的（不要当成结论）

| # | 未验证项 | 为什么没验证 | 建议怎么验证 |
|---|---|---|---|
| A | host 行 `apply` 抛错后，它的 client 半边**是否仍被 composition 装载** | `client-modules` 扫描"enabled Loader entries"，失败 fiber 是否仍算 enabled，两处文档都没直说；需要在真实双开场景下看 console | 双开后看 console 有没有 `[genui] client active; fence-channel=dom`（client `apply` 会打 `[genui] client active; fence-channel=dom`；注意 `[genui]` 不是包名，机械改名不会动它，`src/client/index.tsx:126`） |
| B | 浏览器端 `slots.register` 同名 key/id 的冲突行为 | 实现全在 `dsh-web-frontend` 的压缩产物里，没有可读源码 | 双开时按 DevTools console 的 `slot entry crashed` / 重复卡片判断 |
| C | `byte-identical` 能否在本机复现 | 需要先 `pnpm install` + 构建上游原包，超出只读范围 | 装好后连续两次 build 比 `sha256 lib/client.js` |
| D | pnpm 10.33.2 对 `engines.pnpm` 的实际严格度 | 一次探测命令被自动审查拦下，没有绕过执行 | 任意空目录放一个带 `engines.pnpm` 的 package.json 跑 `pnpm install` 观察 |
| E | 双开时 `data-genui-rendered` 标记是否真的让后者跳过 | 逻辑推断（标记是同一字符串），未实测 | 双开后数一段对话里 `.dsh-ui` 容器的数量 |

### 10.2 证据获取方法（可复现）

- **第三方包**：直接读 `/Users/mac/.dsh/profiles/desktop/node_modules/@changfenhuang/dsh-genui`（普通目录，`cat`/`sed` 可用）。
- **DSH 自身**：实现被打进 `/Applications/DeepSeek Harness.app/Contents/Resources/app.asar`，shell 的 `ls`/`cat`/`ripgrep` **无法进入 asar**。我用两段一次性 Node 脚本（不装依赖）读 asar 头部的 JSON 目录表来列目录、按 offset 取文件：
  - 列目录：读 16 字节头 → `headerSize = readUInt32LE(12)` → 解析 JSON → 递归 `files`
  - 取文件：`offset = 16 + headerSize + node.offset`，长度 `node.size`
  - 产物路径：`/tmp/asar-list.cjs`、`/tmp/asar-cat.cjs`
- **关键证据落点**（都在 asar 内，路径前缀 `<asar>/dsh/node_modules/@deepseek-ai/`）：
  - `dsh-client-modules/README.md` §34/§38/§50/§54/§72
  - `dsh-client-modules/lib/index.js`（清单校验、`immediately`、external 图排序、缺失 bundle 错误）
  - `dsh-client-hmr/README.md` §32/§62
  - `dsh-app-boot/README.md` §51/§53/§66/§135
  - `dsh-host-webserver/README.md` §62（路由匹配与重复路径抛错）
  - `dsh-plugin-manager/README.md`（install/link/toggle/回滚语义）
  - `dsh-package-manifest/README.md` §47-56（manifest 字段表）
  - `dsh-web-app/cordis.patch.yml:219-220`（`client-hmr` 已挂载）
  - `dsh-web-frontend/dist/assets/index-BXV-oxvX.js`（`PLATFORM_MODULES` 与 `prefetchImmediateTier`）
  - `dsh-agent-preset/skills/cordis-plugin-development/{references,templates}/**`（官方插件模板与规则——`read` 工具可穿过 asar，`bash` 不行）
- **运行时版本**：`.../Resources/runtime/primary-runtime/runtime.json`（node 24.21.0 / pnpm 11.28.5）。
- **本机 profile**：`/Users/mac/.dsh/profiles/desktop/{package.json,cordis.patch.yml,pnpm-workspace.yaml}`；`desktop/node_modules` 里的 symlink 证实 link 安装形态。
- **反例证据**：`dsh --profile desktop --dump-config` 被拒绝（`profile "desktop" is managed exclusively by the Electron application`），所以"看真实 composition"只能走 `cordis_inspect_query` 或 Web 界面。

### 10.3 顺带发现的两个环境事实（lead 会用到）

1. **PATH 上的 `dsh` 是旧版本**：`/Users/mac/.nvm/versions/node/v22.22.0/bin/dsh` = `0.1.5-rc.1`，而桌面宿主是 `0.2.1-rc.5`。`~/.dsh/profiles/node_modules/@deepseek-ai/*` 那 240 个 symlink 指向的也是这个旧版安装目录（Sep 12 的产物）。**任何版本敏感的 CLI 判断都不要用 PATH 上的 `dsh`**；桌面自带 CLI 在 `.../Resources/runtime/cli/bin/dsh`（走 `ELECTRON_RUN_AS_NODE`）。
2. **profile 的 pnpm 配置**（`pnpm-workspace.yaml`）：`nodeLinker: hoisted`、`autoInstallPeers: false`、`allowBuilds` 白名单、`fetchTimeout: 1800000`。含义：**peer 不会被自动安装**（所以 §2.6 的"peer 只用于解析、不用于安装"在本机成立）；且任何需要 build 脚本的依赖会被拒，除非进 `allowBuilds`。我们的工具链（tsdown/lightningcss）走预编译二进制，正常情况下不需要 build 脚本，但 lightningcss/rolldown 的原生包若需 postinstall，会被这条拦下——若遇到，`install_bundle` 会返回 `pendingBuilds`，需人明确批准。

---

*本文件是 task-3 的唯一写入产物。所有结论均可按 §10.2 的方法复现；§10.1 列出的五项请勿当作已验证事实引用。*

---

## 11. 现场对账（02:27 观测：本目录已被并行脚手架填充）

> **归属说明**：本文件（`docs/recon/scaffold.md`）是我唯一写入的产物。观测时仓库根已出现 `package.json` / `cordis.patch.yml` / `tsconfig.json` / `tsdown.config.ts` / `src/` / `lib/` / `node_modules/` 与 `docs/recon/{schema,visual}.md`——这些是**并行 agent 的交付**，不是我造成的（我的任务边界是只读 + 只写本文件）。本节用于让 lead 不重复劳动，并逐项核对"已做对 / 仍需改"。

### 11.1 已落地且**与我方案一致**（§9 的第 2/4/5/6/7/8/9/10 步）

| 项 | 实测结果 | 对应契约 |
|---|---|---|
| 包名 / 版本 / 私有 | `dsh-vt-gen-ui` / `0.1.0` / `private: true` | §2.1 |
| `dsh.bundle.patch` / `dsh.client` | `./cordis.patch.yml` / `{inject: [], platform: "web"}` | §2.1、§2.2 |
| `engines.dsh` | `^0.2.0-rc.1 \|\| ^0.2.1-rc.1`（**已声明**，运行 0.2.1-rc.5 满足） | §2.5（关键，已做对） |
| `peerDependencies` | 20 条（保留了 `@deepseek-ai/dsh-llm`）→ link 目录能解析那处动态 import | §2.6 |
| `packageManager` / `engines.pnpm` | **已移除** → 与"本机 pnpm 10 会抱怨"的判断一致 | §4.1 |
| `cordis.patch.yml` | `insert: [{id: dsh-vt-gen-ui, name: dsh-vt-gen-ui}]`，且注释写明"两者不可同时启用" | §2.4、§6.2 |
| 三处运行时字面量 | `ASSET_ROUTE_PATH='/plugins/dsh-vt-gen-ui/assets'`；`PLUGIN_ID='dsh-vt-gen-ui'`；`tsdown.config.ts:18 ID='dsh-vt-gen-ui'` | §3.5 |
| 上游包名残留 | 仅 `cordis.patch.yml:3` 的 provenance 注释（**应保留**，属 MIT 署名） | §3.6、§8.1 |
| 构建产物 | `lib/index.js`(198,916 B)、`lib/client.js`(802,605 B，banner id=`dsh-vt-gen-ui`，尾部 `}});` 正确)、`lib/assets/*.js` × 6、`lib/types/**` 105 个 `.d.ts` | §4.3 |
| host 产物纯度 | `lib/index.js` 的 `import` **全部是 `node:` 前缀**（零跨包运行时依赖） | §4.5、§2.6 |
| 许可 | `LICENSE:3` 保留 `Copyright (c) 2026 dsh-external`；`THIRD_PARTY_NOTICES.md` 保留 OpenAI 图标段（与 `src/client/icons/` 仍在一致）；`SKILL.md` frontmatter 有 `name`/`description` | §8.1、§8.2、§7.7 |
| 目录结构 | `src/{plugin,client,shared}` + `assets/` 与 §7.5 建议一致 | §7.5 |

### 11.2 仍需处理（3 个**缺陷** + 3 个待办）

| # | 类型 | 问题 | 后果 | 建议动作 |
|---|---|---|---|---|
| D1 | 缺陷 | `scripts.build` = `rm -rf lib && tsdown`，但 tsdown 的所有 config 都是 `dts:false` → **下次构建会删掉 `lib/types/` 且不再重建**，而 `package.json` 的 `types` / `exports["./client"].types` 仍指向它 | 运行时不受影响；但类型声明会静默消失，直到有人 `tsc` 才发现 | 把 build 改回 `rm -rf lib && tsc -p tsconfig.json && tsdown`（与上游一致，`tsconfig` 的 `emitDeclarationOnly` 就是为此存在）；或删掉 `types`/`exports.*.types` 声明并接受无类型 |
| D2 | 缺陷 | `files` 里列了 `icon.svg`，但仓库根**没有该文件**（图标在 `assets/vt-gen-ui-icon.svg`，`package.json#icon` 也指向它） | link 安装不过滤 `files`，所以现在不影响运行；一旦发布/打包，`files` 白名单会与事实不符 | 删掉 `files` 里的 `icon.svg` |
| D3 | 待核 | 视觉层仍 `require("@deepseek-ai/dsh-client-ui-primitives")`（继承自上游），而 `practices.md:35` 明确不建议跨包 require | 该包在 `PLATFORM_MODULES` 里，所以**现在能跑**；但它属宿主内部包，升级可能变 | 视觉层改造时把 primitives 依赖摘掉（自带控件），并从 `tsdown.config.ts` 的 `EXTERNALS` 移除该项——这是本 fork 最高价值的"防腐"动作 |
| T1 | 待办 | 第 1 步的**裁剪决策**没有落盘：`standaloneConfig`（1.15 MB 运行时）、`fence-feedback`、`achievements`、`artifact/*` 全部仍在 | 包体大、`fence-feedback` 保留=多了 `agent/turn-stopping` / `llm/stream` 的耦合面 | 决策后写进 `docs/recon/trim.md`，再动 tsdown 数组与 `src/` |
| T2 | 待办 | **没有 `DESIGN.md`** | 视觉层改造没有判据（违反本机 AGENTS.md 的"DESIGN.md 先行"） | 视觉层动刀前先建 DESIGN.md（token/typography/spacing/radius/motion/shadow） |
| T3 | 待办 | **尚未安装到 profile**（`install_bundle` 未执行），旧插件仍在启用 | 现在跑浏览器看到的仍是上游 genui 的渲染 | 按 §6.3 + §9 第 12 步执行（先禁旧、再装新） |

### 11.3 给 lead 的一句话

> 本文件 §1–§8 是**契约与判断依据**（用来验收并行脚手架做得对不对、以及后面每一步为什么这么做）；§9 是**执行清单**（第 2/4/5/6/7/8/9/10 步已由并行 agent 完成并经我复核通过）；**当前唯一阻塞"能看见效果"的三件事是：D1（build 会丢 d.ts）、T2（无 DESIGN.md）、T3（尚未安装切换）**。
