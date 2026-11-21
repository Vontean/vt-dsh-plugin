# 宿主半边与工程链契约（dsh-vt-gen-ui）

> 本文是**只读盘点**的结果，供后续切片分工使用：谁可以改哪块、改之前要知道什么。
> 基线：仓库 commit `0ddf24a`，插件 `plugins/vt-gen-ui` v1.1.0，产物 `lib/` mtime `2026-11-22 00:03`，
> 本机 node `v22.22.0` / pnpm `10.33.2`，宿主桌面版 `0.2.1-rc.5`。
> 写这份文档时没有跑 `pnpm build`、没有改任何代码。

---

## 0. 一句话总览

| 面 | 内容 | 规模 |
| --- | --- | --- |
| 宿主提示词 | **1 个 system prompt 段**（`genui:fence`），骨架手写 + 4 个派生插槽 | 段文本 39 行 |
| 模型工具 | `render_ui`、`validate_dsh_ui` 两个，纯本地同步执行 | 433 行（`src/plugin/tool.ts`） |
| 回合末自修 | `agent/turn-stopping` 上 steer 一条纠正消息 | 701 行（`src/plugin/fence-feedback.ts`） |
| 资产路由 | `/plugins/dsh-vt-gen-ui/assets/*` 前缀路由，服务 6 个懒加载 IIFE | 61 行（同 `index.ts`） |
| 技能注册 | 1 个 provider，skill 名 `genui`，正文 + 派生字段参考 | 35 行 + `SKILL.md` |
| 构建链 | `rm -rf lib && tsc && tsdown`，8 个 tsdown config | 274 行配置，产物 8 个 js |
| 产物纪律 | `lib/` **入库**，源码与产物必须同一 commit | — |

**派生 vs 手写的总答案：**

- **派生**（改 `src/shared/catalog/definitions.ts` 或 `docs.ts` 就自动变）：系统提示词里的**组件清单**、**字段速查**、**字段名写错告警**、**多屏原型说明**，以及技能正文末尾的**组件字段参考**。派生入口只有 `src/shared/catalog/derive.ts` 一个。
- **手写**（改这里不影响另一处，容易漂移）：段里的围栏语法样例、`**默认就该出 UI**` 那组判定规则、`Rules:` 八条、`RENDER_UI_TOOL_GUIDANCE` 一行；工具参数/输出 schema 与协议字符串；自修的触发条件、上限与消息形状；资产路由的路径、正则与缓存头；技能注册的 rank / provider 名；`SKILL.md` 正文；整条构建链。
- **不可动（协议层）**：围栏标签 `dsh-ui`、组件 `type` 名与必填字段名、`action` payload、`src/shared/fence-{language,repair,resolve}.ts` 的修复语义。

---

## 1. 宿主半边现状

### 1.1 系统提示词：1 段，骨架手写 + 4 个派生插槽

**段数。** 插件只注册**一个** system prompt 段 `genui:fence`（`index.ts` → `apply` → `ctx.systemPrompt.section`）。
模型看到的其它 GenUI 文本都不走 system prompt：`SKILL.md` 走 skill provider 按需加载；`[genui-validation]` / `[genui-render]` / `[genui-fence-repair]` 三个协议块走**工具结果或 user 消息**。

**来源拆分。** 段模板 `GENUI_SECTION_TEXT`（`index.ts` 的导出常量）只有 4 处在运行时插值：

| 插槽 | 来源 | 派生自 | 行号 |
| --- | --- | --- | --- |
| `${componentListPrompt()}` | 派生 | `CATALOG_CATEGORIES` 分组 + `CATALOG_DOCS[].promptInline` | `derive.ts:67` |
| `${fieldQuickRefPrompt()}` | 派生 | `CATALOG_DOCS[].quickRef`（只有易错的组件才有） | `derive.ts:80` |
| `${prototypeScreensPrompt()}` | 派生（常量转发） | `SCREEN_SPEC_DOC.prompt` | `derive.ts:160` |
| `${fieldGotchaPrompt()}` | 派生 | `CATALOG_DOCS[].gotcha`（每句前拼组件名） | `derive.ts:92` |

其余全部**手写**：围栏示例 JSON、`**默认就该出 UI**` 五条、`**发回答前最后自检一次**` 段、`**节点规则**`、
`Rules:` 的 LANGUAGE / JSON 严格 / warning=block_markdown / 规模 / LOCAL-FIRST / Durable state / 卷子模式 /
Secrets ban / 围栏位置 / Panel 十条，以及 `RENDER_UI_TOOL_GUIDANCE` 一行常量（`index.ts` 内同名字符串）。

`RENDER_UI_TOOL_GUIDANCE` 是唯一会被**条件裁掉**的内容：`renderUiTool: false` 时用
`GENUI_SECTION_TEXT.replace(...)` 删掉那一行（同一处 `apply`）——因为工具不存在时不能教模型调它。

**注入点与生命周期。** `apply(ctx, config)` 里即时注册，插件 fiber 激活时生效；插件卸载随 fiber 释放。
`export const inject = ['systemPrompt']` 是硬依赖：没有 system prompt 服务的宿主不会加载本插件。

**顺序如何决定。**

1. 插件不自己写数字，调宿主中心分配：`order: ctx.systemPrompt.getSectionOrder('STRUCTURED_OUTPUT')`
   （`ctx.systemPrompt.getSectionOrder('STRUCTURED_OUTPUT')`）。宿主该表里 `STRUCTURED_OUTPUT: 9900`（`dsh-system-prompt/lib/index.js:39`）。
2. 宿主按 `order` 升序拼接，同 order 按段名字符串（code unit）排序（`dsh-system-prompt` README §Sections）。
3. 对照 first-party 顺序：identity `-1000` → persona `0` → 工具与结构化输出说明（本段落在 `9900`）→
   harness source `10000` → Web surface `10100` → persona suffix `10200`。也就是说本段紧挨在运行时环境描述**之前**。
4. 段名 `genui:fence` 是**唯一键**：同名段重复注册会直接抛错（宿主 `NamedEntries`），不是覆盖。

### 1.2 模型工具：`render_ui` + `validate_dsh_ui`

两个工具都通过 `ctx.inject(['tools'])` 注册（`index.ts` → `apply`），`tools` 服务不存在时插件其余部分照常工作
（围栏通道不需要工具）。注册名冲突同样抛错。

| 维度 | `render_ui` | `validate_dsh_ui` |
| --- | --- | --- |
| 定义位置 | `tool.ts:203-253` | `tool.ts:344-433` |
| 用途 | 把 spec 渲染成**工具行卡片** | 发围栏前的预检 |
| 输入 schema | `{ spec: object }`，`required:['spec']`，`additionalProperties:false`；`spec` 内声明 `title/gap/panel/items` 四个提示字段，`items` 元素是自由 object（`tool.ts:45-76`） | `{ spec: string \| object }`，`required:['spec']`（`tool.ts:272-285`） |
| 输出 schema | `string`（一行渲染摘要） | `string`（验证结论） |
| 正常返回 | `[genui-render]` + `status=rendered` + `title=` + `rendered=<n>` + warning 行 | `[genui-validation]` + `status=valid` + `rendered=<n>` + warning 行 + `next=` |
| 失败行为 | ① 无可用 spec → **返回** `status=invalid error=invalid_spec`（不抛）；② guard 判不可渲染 → **抛** `Error('render_ui spec invalid: …')`；③ 图表字段错 → 返回 `error=invalid_chart_fields` + 诊断 | **从不抛错**：JSON 解析失败 → `invalid_json` + 括号计数 + 可能 `repair=applied` 附 `repaired_json`；结构错 → `invalid_spec` 或 `droppedNodeFailure` 逐节点诊断 |
| 超时 | 无自定义超时。执行是同步纯本地（无 IO / 网络 / LLM） | 同左 |
| 附带机制 | `presentationMeta(args)` 把修好的 spec 存进结果 `meta`，浏览器 `toolview.tsx` 从那里取（`tool.ts:216-222`）；`presentCall/presentResult` 给通用卡片标题 `渲染 UI：<title>` | 固定标题 `验证 dsh-ui 围栏` |

**参数防御（必读）。** `specOf()`（`tool.ts:96-131`）会拆掉实测出现过的四种传输形状：
`{spec: "<JSON>"}`、`{arguments: "<JSON>"}`、`{arguments: {...}}`、裸 JSON 字符串。JSON 在传输中被截断
（实测大 spec 会被桥接层写坏）时**无法恢复**，只打一行 `console.error` 并走 `invalid_spec`。
改参数 schema 时别把这条路收窄——schema 越严，可修复的输入越少（`tool.ts:33-44` 的注释解释了取舍）。

### 1.3 回合末自修：`agent/turn-stopping` 上的一条 steer

**触发条件。** 两个入口：

1. `ctx.on('agent/turn-stopping')`（`fence-feedback.ts:662-700`）：`enabled` 为真、非子代理、当前 turn 无挂起
   `render_ui` 结果、且（存在未修过的失败围栏 **或** 本回合验证过却没交付任何正式内容）。
2. `ctx.on('llm/stream')`（`:655-660`）：本回合 `validate_dsh_ui` 过、非子代理、响应只有 reasoning block 时，
   若还有交付提醒可用就放行原始 `stop`（让 turn-stopping 去提醒），否则改写成 `EMPTY_RESPONSE_CODE` 交给宿主重试。

**次数上限。**

- 每回合**共享** 2 条纠正：`MAX_CORRECTIONS_PER_TURN = 2`（`:48`），render 失败与「没交付」提醒共用预算。
- 每个围栏正文在**当前回合**最多纠正一次：指纹 = `sha256(raw.trim())` 前 12 位（`:99-101`）；
  `turn/start` 时清空 `correctedSpec`（`:564`），所以新回合可以重新纠正同一个错。
- 两个账本独立：`correctedSpec`（按指纹）与 `deliveryRemindedTurns`（按 turn），互不消耗。
- **先记账再发送**（`:688-692`）：重入的边界不会重复投递。

**子代理例外。** 子会话的围栏属于父回复，两处都直接跳过：turn-stopping 里
`agent.session.header.parentSession !== undefined → return`（`:666`），stream 拦截里 `state.isSubagent`（`:658`）。

**消息形状。** 一条 `role: 'user'` 的消息，`source` 在 session format v4 上是
`{ kind: 'plugin:dsh-vt-gen-ui', form: 'notice', summary: 'genui fence repair requested' }`，
旧格式回退 `{ kind: 'plugin', plugin: 'dsh-vt-gen-ui', … }`（`:166-187`）。正文长这样：

```
[genui-fence-repair #<fp1>] [genui-fence-repair #<fp2>]

[genui-fence-repair]
status=render_failed
fences=2
next=resend_corrected_fence_only
repeat_rendered_content=false
reply_language=conversation

fence=1
fingerprint=<fp1>
error=invalid_spec
diagnostic="…"

fence=2
…
```

「没交付」提醒用 `#turn-<n>` 标记和 `status=nothing_delivered`、`next=emit_fence_in_body`（`:314-319`）。
marker 会被重新读回来恢复预算（`:609-619`），所以重启/重放后不会超发；旧版 marker 前缀 `[genui 自修 #` 仍被识别。

**关闭开关。** 插件配置 `fenceFeedback: false`（`index.ts` 的 `GenuiPluginConfig.fenceFeedback`）关掉整条转向；工具关闭另一个开关
`renderUiTool: false`。

### 1.4 资产路由：前缀 + 白名单 + no-cache

**路径前缀。** `/plugins/dsh-vt-gen-ui/assets`（`index.ts` 的 `ASSET_ROUTE_PATH`）。走宿主 webserver 的 **prefix** 注册类型，
**最长前缀优先**，所以它压过通用的 `/plugins` bundle 路由，且不需要改宿主源码。服务在插件启动时可选，
用 `ctx.inject(['webServer'])` + `effect` 绑定，跟随服务晚到/替换/插件重载。

**安全校验。**

| 检查 | 规则 | 结果 |
| --- | --- | --- |
| 方法 | 只允许 `GET` / `HEAD` | 其它 → `405` |
| URL 解码 | `decodeURIComponent` 失败 | `400` |
| 前缀 | 必须以 `<前缀>/` 开头 | 否则 `404` |
| 文件名 | `^[A-Za-z0-9][A-Za-z0-9._-]*\.js$`（**平铺、无斜杠、只 .js**） | 否则 `404`（这条同时挡掉 `../` 穿越） |
| 读文件 | `join(lib/assets/, file)` | 失败 → `404` |

**缓存。** 响应头 `content-type: text/javascript; charset=utf-8` +
`cache-control: no-cache`（`serveGenuiAsset` 的响应头）。客户端再加一层：URL 带 `?rev=<boot graph 里本包的 rev>`（`asset-loader.ts:51-57`），
插件重新构建会让 rev 变化，从而同时失效主 bundle 与资产缓存。

**缺失时的降级。** 服务端静默 `404`；客户端每个文件用一个 memoized Promise，**加载失败即为该页面的终态**
（`asset-loader.ts:68-100`）：mermaid/3D/echarts 节点显示「纯源码/占位」回退，不重试、不阻塞其它节点。
若宿主自己内联了引擎（standalone 运行时），`setGenuiAssetBase()` 会把基址换成内联 URL，路由不参与。

### 1.5 技能注册：一个 provider，正文 + 派生参考

**注册方式。** `ctx.inject(['skills'])` → `skills.registerProvider(() => bundledSkillProvider())`
（`index.ts` → `apply` → `ctx.inject(['skills'])`）。provider 是同步注册、返回 disposer；`skills` 服务不存在时静默不注册。

| 字段 | 值 | 说明 |
| --- | --- | --- |
| provider 名 | `dsh-vt-gen-ui` | 与包名一致（`BUNDLED_SKILL_PROVIDER`） |
| skill 名 | `genui` | 与上游插件同名，这是共存冲突点之一 |
| `source` | `bundled` | 走 bundled 优先级 |
| `rank` | `600` | 同层同名时先比 rank（`BUNDLED_SKILL_RANK`） |
| `invocation` | `modelInvocable: true, userInvocable: true` | 模型与用户都能加载 |
| `path` / `resourceBase` | `<pkg>/SKILL.md` 与其目录 | 面板预览用真实文件路径 |

**来源优先级。** 宿主 skill registry：跨 layer 时**最近 layer 直接胜出**；同一 layer 内同名按
`rank → provider 注册顺序 → provider 内部顺序` 解析（`dsh-skill` README §Implementation）。
本地文件系统 provider 的 rank 不在本仓库里，**未验证**；因此「本地同名 `genui` 技能会覆盖还是被覆盖」目前没有结论（见 §5 隐患 H5）。

**字段参考如何拼接。** skill 正文 = `SKILL.md` 去掉 frontmatter 的正文 + `catalogReferenceMarkdown()`：

- `SKILL.md` frontmatter 的 `description` 由**读文件**得到（`index.ts` 的 `frontmatterField`），代码里不留第二份文案——
  上一版就因为代码副本漂移，面板显示代码副本、模型读文件副本，改文件等于没改。
- `catalogReferenceMarkdown()`（`derive.ts:114-143`）按分类生成 `### 布局/展示/图表/交互/高级` 小节，
  每个组件的「必填 / 可选 / 枚举值」全部从 `COMPONENT_SCHEMAS` 读，`summary/usage` 从 `CATALOG_DOCS` 读。
- 因此 `SKILL.md` 里**不允许手写字段表**（文件里也这么写了）。改字段 = 改 `definitions.ts`。
- `assertCatalogCoherence()` 在模块加载时跑（`derive.ts:19-46`）：schema 缺 doc、doc 缺 schema、
  type 不在分类里、某个 type 少 `goto` 字段、spec 根少 `screens/initial`——任一情况**直接抛错**，
  不给「半生成提示词」上线机会。

---

## 2. 工程链现状

### 2.1 构建：一条命令，8 个 tsdown config

```sh
pnpm build   # = rm -rf lib && tsc -p tsconfig.json && tsdown
```

三段职责，顺序不能换：

| 段 | 命令 | 产出 | 关键约束 |
| --- | --- | --- | --- |
| 清理 | `rm -rf lib` | 空目录 | 必须在 tsc 之前；tsdown 里所有 config 都是 `clean: false`，否则会中途擦掉 `lib/types`（`tsdown.config.ts:258-260` 注释） |
| 类型 | `tsc -p tsconfig.json` | `lib/types/**/*.d.ts` | `emitDeclarationOnly: true`；`exclude` 掉 `*.test.ts(x)` 与 `__tests__` |
| 打包 | `tsdown` | `lib/index.js` + `lib/client.js` + 6 个资产 | 8 个 config 的数组（`:263-274`） |

tsdown 的 8 个 target：

| config | 入口 | 输出 | 格式/平台 | 说明 |
| --- | --- | --- | --- | --- |
| `libConfig` | `src/index.ts` | `lib/index.js` | ESM / node / es2024 | 宿主半边，`fixedExtension:false`（否则变 `.mjs`） |
| `clientConfig` | `src/client/index.tsx` | `lib/client.js` | CJS / browser | 单文件，`codeSplitting:false`，minify，无 sourcemap |
| `standaloneConfig` | `src/client/standalone/runtime.tsx` | `lib/assets/standalone-runtime.js` | IIFE / browser | 单文件 HTML 导出用，KaTeX CSS 与 woff2 全部内联 |
| `assets/pele` | `src/client/asset-pele.ts` | `lib/assets/pele.js` | IIFE | mermaid 引擎 |
| `assets/three` | `src/client/asset-three.ts` | `lib/assets/three.js` | IIFE | scene3d |
| `assets/echarts-core` | `src/client/asset-echarts-core.ts` | `lib/assets/echarts-core.js` | IIFE | 图表的 core 版 |
| `assets/echarts-full` | `src/client/asset-echarts.ts` | `lib/assets/echarts-full.js` | IIFE | 全量版 |
| `assets/icons` | `src/client/icons/asset-icons.ts` | `lib/assets/icons.js` | IIFE | 749 字形图标目录 |

为什么 IIFE 是**每个引擎一个 config**：rolldown 拒绝「多入口 + IIFE」，只能一个入口一个 config（`:210-218`）。

**四条脚本的语义边界（`package.json#scripts`，2026-11-22 起）：**

| 脚本 | 命令 | 写产物吗 | 谁跑 | 说明 |
| --- | --- | --- | --- | --- |
| `build` | `rm -rf lib && tsc -p tsconfig.json && tsdown` | **写** | **只有构建者** | 唯一合法的产物生成路径 |
| `typecheck` | `tsc -p tsconfig.json --noEmit --emitDeclarationOnly false && tsc -p tsconfig.test.json` | **不写** | 任何人 | 两个显式开关覆盖 `emitDeclarationOnly`；测试那套 tsconfig 本身已是 `noEmit` |
| `check` | `pnpm typecheck && pnpm test && pnpm build` | 写（末段） | **只有构建者** | 因为它以 `build` 收尾，所以整条算构建 |
| `test` | `vitest run` | 不写 | 任何人 | 只跑 `src/**/*.test.ts(x)` |

**为什么必须这样切**：`tsconfig.json` 是 `emitDeclarationOnly: true` + `declarationDir: lib/types`，
所以裸跑 `tsc -p tsconfig.json` 就是在**重写 `lib/types/**`**。改之前 `typecheck` 正是这么写的——
每次「只做检查」都会覆盖共享产物，和 `build` 一样互相踩（`lib` 里那 122 个 00:11 的 `.d.ts` 就是它的产物）。

**仍然算构建的写法**（除了构建者，任何人都不该跑）：

- `pnpm build`、`pnpm check`
- `tsc -p tsconfig.json`（裸跑，会 emit）
- `tsc -p tsconfig.test.json --emitDeclarationOnly true --noEmit false`（显式反选即可绕过脚本约定）
- 任何 `tsdown` 直接调用


### 2.2 产物清单与大小（实测 `ls -la lib`）

| 产物 | 字节 | 角色 |
| --- | --- | --- |
| `lib/index.js` | 226,958 | 宿主半边 |
| `lib/client.js` | 839,244 | 浏览器渲染器（单文件） |
| `lib/assets/pele.js` | 708,203 | 懒加载：mermaid |
| `lib/assets/three.js` | 704,938 | 懒加载：3D |
| `lib/assets/echarts-core.js` | 587,965 | 懒加载：图表 core |
| `lib/assets/echarts-full.js` | 1,044,488 | 懒加载：图表全量 |
| `lib/assets/icons.js` | 969,070 | 懒加载：图标目录 |
| `lib/assets/standalone-runtime.js` | 1,183,504 | 导出单文件 HTML 用 |
| `lib/types/**` | — | 121 个 `.d.ts`（`lib` 合计 129 个入库文件） |

懒加载设计的收益：主 bundle 不再背 ~9 MB 引擎，只有 spec 真的用到 mermaid/3D/图表时才拉对应资产。

### 2.3 CSS 内联方式与「单文件 client」包裹约定

**CSS Modules 内联**（`tsdown.config.ts:33-77`，插件名 `dsh-css-modules-inline`）：

1. `*.module.css` 被解析成虚拟模块 `\0dsh-css:<相对路径>.mjs`。
2. `lightningcss.transform` 编译，`cssModules.pattern: '[hash]_[local]'`，`minify: true`。
3. 类名映射按**本地类名的 UTF-16 顺序**排序（**不用 `localeCompare`**，否则随系统语言漂移）后作为默认导出。
4. 生成的 JS 在 `document.head` 里插一个 `<style data-plugin-css="dsh-vt-gen-ui/<文件名>">`（同 id 只插一次）。
5. 结果：**类名 hash 在构建期定死**。换皮只能改源码重建，外部无法覆写——这也是 AGENTS.md 硬约束 6 的由来。

**单文件 client 的包裹**（`:177-187`）：

```js
window.__ModuleLoader__.load({ id: "dsh-vt-gen-ui", factory: (require) => {
  var module = { exports: {} }; var exports = module.exports;
  /* …渲染器… */
  return module.exports; } });
```

三条硬规则：

- **只能有一个 `load({...})` 调用，且常量必须在 factory 作用域内**。多个插件的 `client.js` 会被宿主拼进
  同一个脚本，顶层 `const PLUGIN_ID` 重名会让整个 web boot 失败（`scripts/check-client-bundles.mjs` 就是查这个）。
- `codeSplitting: false` → 单文件；`entryFileNames: 'client.js'` 固定。
- **`EXTERNALS` 只有 4 项**：`react`、`react/jsx-runtime`、`react-dom/client`、`@deepseek-ai/cordis`、
  `@deepseek-ai/dsh-client-ui-primitives`（`:25-27`）。`purityGate()`（`:79-91`）把任何其它
  `@deepseek-ai/*` **值导入**变成**构建期报错**——跨插件共享只能走 cordis 服务。

### 2.4 产物纪律：入库、无测试残留、同 commit

**产物入库。** `lib/` 必须提交（根 `docs/plugin-conventions.md` §5）：git 子目录安装与 Release tarball
直接读产物、不执行构建脚本。插件自己的 `.gitignore` 里有一行显式说明「`lib/` 是构建产物，必须入库——不要在这里忽略它」；
根 `.gitignore` 只忽略 `dist/`，并对 `plugins/*/webview/dist/` 开了例外。
实测：`git ls-files plugins/vt-gen-ui/lib` = **129 个文件**，全部在版本控制里。

**提交规则。** 改源码必须**同一次提交**带上重建后的产物；否则发布出去的是旧包。
禁止手工编辑 `lib/` 里的任何文件（它是生成的，而且 minified）。

**如何确认没有测试文件残留。** 三层保障，当前**全部通过**：

| 层 | 机制 | 实测 |
| --- | --- | --- |
| 类型层 | `tsconfig.json` 的 `exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/__tests__/**"]` | 排除生效 |
| 打包层 | tsdown 只从 `src/index.ts` / `src/client/index.tsx` 等入口出发，测试文件不被 import，进不了图 | 排除生效 |
| 检查层 | `find lib -iname "*test*" -o -iname "*__tests__*"` | **0 命中** |

注意：`lib/client.js` 里 grep 到 `it(` 之类的子串是 minified 标识符，不是测试代码。

**一致性现状（盘点期间工作区在变，这是实测快照）。** 盘点开始时 `git status` 只有 `docs/research/host-token-audit.md`
一个未跟踪文件、`lib/` 与 HEAD 一致、`find src -newer lib/index.js` = 0。

盘点结束时（约 00:12）已经出现**混合产物**：其他 Bot 正在改 `src/client/blocks/Prototype.module.css` 并新增
`modal.tsx` / `modal-behavior.ts` / `modal.test.tsx`，而 `lib/` 里：

| 产物 | mtime | 状态 |
| --- | --- | --- |
| `lib/client.js` / `lib/index.js` | 00:03 | 上一轮完整构建，**不含 modal**（`grep -c modal lib/client.js` = 0） |
| `lib/types/client/blocks/modal*.d.ts` | 00:11 | 新生成，属于**未打包**的源码 |

**根因已确认并修掉（2026-11-22）。** 上表不是「有人只跑了 tsc」，而是**改之前的 `pnpm typecheck` 本身在 emit**：
`tsconfig.json` 的 `emitDeclarationOnly: true` + `declarationDir: lib/types`，于是每次「只做检查」都重写 `lib/types/**`。
这正是卡尺发现的事实。现在 `typecheck` 已改为
`tsc -p tsconfig.json --noEmit --emitDeclarationOnly false && tsc -p tsconfig.test.json`，
实测**产物快照逐字节不变**（见 §6）；`build` 的 tsc 保持原样，继续产出 `.d.ts`。

**本轮构建事故（记录在案）。** 恢复后第一次 `pnpm build` 在 tsc 阶段失败：
`prototype-registry.ts(36,14): error TS2741: Property 'modal' is missing …`
——catalog（卡尺）已把 `modal` 加进 `PROTOTYPE_TYPES`，渲染层的注册表（码匠）还没补。此时 `lib` 已被 `rm -rf`，
按 R5 立即 `git checkout -- plugins/vt-gen-ui/lib` 恢复。**该阻断已于 00:22 解除**（注册表补上 `modal: bind(ModalNode)`，
`pnpm typecheck` 复绿）。结论：**红树不是构建者的活**，见 R2。

因此提交前必须检查 `lib` 是否同一批次生成（R3 第②项），而产物只能由构建者生成（§4.0）。

### 2.5 版本与兼容

| 项 | 当前值 | 含义 / 约束 |
| --- | --- | --- |
| `engines.dsh` | `>=0.2.1-rc.5 <0.3.0` | 安装/激活硬门槛；超出范围宿主**加载前就拒绝**，不会半残运行（`README.md:72`） |
| `engines.node` | `^22.19.0 \|\| >=24.0.0` | 本机 shell 22.22 ✅，宿主内置 24.21 ✅ |
| `engines.pnpm` | **刻意不写** | DSH 不校验；桌面 launcher 用内置 pnpm 11.28.5，写了只会制造版本噪音（`scaffold.md` §4.1） |
| peerDependencies | `^0.2.0-rc.1 \|\| ^0.2.1-rc.1`，共 20 个（19 个 `@deepseek-ai/*` + `react`）；其中 16 个 `@deepseek-ai/*` 标 `optional`，**3 个是硬性**：`dsh-agent`、`dsh-agent-loop`、`dsh-client-ui-primitives` | 运行时由宿主 profile 作答，插件不打包这些；硬性 peer 缺失会挡安装 |
| devDependencies | 70 个，其中 55 个 `@deepseek-ai/*` 钉 `0.2.1-rc.2` | 仅作类型来源；`import type` 会被擦除 |
| 构建工具 | `tsdown 0.22.14` / `lightningcss 1.33.0` / `typescript 5.9.3`；资产引擎 `three 0.180.0` / `echarts 5.6.0` / `echarts-wordcloud 2.1.0` / `pele 1.13.0` | **精确版本**（全部去 `^`）：同源重建逐字节复现，`lib/**` 零差异（见 §5 H1） |
| 包版本 | `1.1.0` | 必须与 `lib/client.js` 里的 `VERSION` 一致（`check-client-bundles.mjs` 校验） |

**与上游插件共存/回滚的顺序约束（硬）。** `@changfenhuang/dsh-genui` 与本插件三处撞名：
system prompt 段 `genui:fence`、工具 `render_ui`/`validate_dsh_ui`、技能名 `genui`。
`apply` 里 section 先于 tool 注册，所以**第二个 apply 一定在注册 section 时抛错**，整个插件（含工具/技能/路由）都不生效。

- 切换：**先禁旧 → 再装新**。
- 回滚：**先禁新 → 再启旧**（顺序反了会两边都不可用）。
- 全程只用 `plugin_manager`（`set_bundle` / `install_bundle`）；**禁止手写** profile 的 `package.json` /
  `cordis.patch.yml`——手工写入会被后续工具写入当成「已有覆盖」并收敛到意外状态。
- 资产路由前缀不同（`/plugins/dsh-vt-gen-ui/assets` vs 上游），**这一项不冲突**，不能用它判断共存安全。
- 回滚后要确认 `/plugins/dsh-vt-gen-ui/assets/*` 在 Network 里全部消失，旧插件的 durable state / 面板仍正常。

**安装形态。** 当前 profile 里是 `link:` 符号链接指向本仓库目录（`~/.dsh/profiles/desktop/node_modules/dsh-vt-gen-ui`）。
副作用：**开发目录里的半成品会被直接读到**（link 安装不受 `files` 字段过滤）。

---

## 3. 宿主侧触点清单

风险等级定义：**高** = 改动可能让模型行为或渲染整块失效，且不易自测；**中** = 影响单一功能，有明确自测路径；
**低** = 内部实现细节，改动面局部。

### 3.1 宿主半边（`src/plugin/`）

| 文件 | 角色 | 风险 | 为什么 |
| --- | --- | --- | --- |
| `plugin/index.ts` | 手写：段文本骨架 + 4 个派生插槽调用 + 全部注册（section/tool/skill/route） | **高** | 段名/顺序/工具名任一改动都触发共存冲突或提示词漂移；`apply` 里注册顺序决定「冲突时先炸哪个」 |
| `plugin/tool.ts` | 手写：两个工具的 schema、协议字符串、参数解包 | **高** | 改 schema 会收窄可修复输入；改 `[genui-render]`/`[genui-validation]` 协议字段会让自修与 SKILL.md 的说明对不上 |
| `plugin/fence-feedback.ts` | 手写：触发条件、预算、账本、消息形状、reasoning-only 拦截 | **高** | 唯一会**主动往对话里插消息**的地方；预算或指纹逻辑写错会重复投递/超发；含宿主侧唯一的运行时 `await import('@deepseek-ai/dsh-llm')` |
| `plugin/genui-diagnostic.ts` | 手写逻辑，**输入派生**（读 `COMPONENT_SCHEMAS` 的字段名生成 `allowed=`） | 中 | 组件字段改名后诊断自动跟上；但错误串的正则匹配（`^\.([A-Za-z0-9_-]+): unknown field`）绑死 guard 的措辞 |
| `plugin/inline-content-diagnostic.ts` | **手写 switch**，按组件类型枚举可见文字字段 | **中高** | 新增组件或给组件加文字字段时，不在这里加 `case` 就**静默漏检**（不会报错，只是这条 warning 没了） |
| `plugin/chart-contract.ts` | 薄转发，真正规则在 `client/guard.ts` | 低 | 改这里等于改客户端契约，属跨边界 |
| `plugin/node-shims.d.ts` | 手写 ambient 声明 | 低（但有漂移，见 H2） | 注释声称 `types: []`、无 `@types/node`，与 `tsconfig.json` 实际配置矛盾 |

### 3.2 派生源（提示词与技能参考的唯一上游）

| 文件 | 角色 | 风险 | 为什么 |
| --- | --- | --- | --- |
| `shared/catalog/definitions.ts` | **单一事实源**：组件字段、必填/可选、枚举、别名、嵌套、规则 | **最高** | 改字段名 = 改协议：宿主提示词、`validate_dsh_ui`、客户端校验/修复/渲染全部同时变；AGENTS.md 硬约束 1 管的就是这里 |
| `shared/catalog/docs.ts` | 手写措辞：分组顺序、`summary`、`promptInline`、`quickRef`、`gotcha`、`usage`、多屏说明 | 中 | 只影响模型看到的文字；但**每个 type 必须有 doc**，否则模块加载即抛错 |
| `shared/catalog/derive.ts` | 纯函数生成器 + 一致性断言 | 中 | 改生成格式会同时改系统提示词与技能参考；断言过严会让「加组件」这一步直接失败 |
| `shared/catalog/model.ts` / `index.ts` | 类型与聚合导出 | 低 | — |
| `SKILL.md` | 正文**手写** + 末尾字段参考**派生** | 中 | frontmatter `description` 是模型路由的唯一来源；正文里的行为规则与 `GENUI_SECTION_TEXT` 的 `Rules:` 是**两份手写**，容易漂移 |

### 3.3 协议层（勿动）

| 文件 | 风险 | 说明 |
| --- | --- | --- |
| `shared/fence-language.ts` | **高** | `dsh-ui` 标签规范化（吸收尾部标点、大小写）。改错 = 围栏静默退化成代码块 |
| `shared/fence-repair.ts` | **高** | 两级 JSON 修复：tier-1（引号/尾逗号，流式安全）、tier-2（补括号引号，**仅 settled**）。宿主与客户端共用 |
| `shared/fence-resolve.ts` | **高** | 流式 vs settled 的解析策略入口；tier-2 泄漏到流式会渲染半截围栏 |

### 3.4 跨边界（客户端文件，但宿主半边依赖它们）

| 文件 | 风险 | 说明 |
| --- | --- | --- |
| `client/guard.ts`（`processGenuiSpec` / `isRenderableProcess` / 图表语义校验） | **高** | 宿主的 `render_ui`、`validate_dsh_ui`、自修判定**全部**通过它得到结论。它属客户端（归「码匠」），但语义变更会直接改宿主行为 → 任何改动必须两边一起验收 |
| `client/genui-runtime/schema.ts` | **高** | `COMPONENT_SCHEMAS` 的转出口；`genui-diagnostic.ts` 直接读它 |
| `client/spec.ts` | 中 | 类型来源 |

### 3.5 工程链

| 文件 | 角色 | 风险 | 说明 |
| --- | --- | --- | --- |
| `tsdown.config.ts` | 手写构建编排（8 个 config、CSS 内联、purity gate、loader 包裹） | **高** | 改 banner/footer/externals/entryFileNames 任一项都会让浏览器半边起不来；改 ordering 影响产物可复现性 |
| `package.json` | 身份、engines、exports、scripts、dsh 段 | **高** | `dsh.bundle.patch` / `dsh.client` / `exports["./client"]` 是宿主装载契约；`version` 要与 client 的 `VERSION` 同步 |
| `cordis.patch.yml` | bundle 行（`id`/`name` 唯一） | 中 | 改 `id` 等于新插件，旧配置失效 |
| `market.json` | 市场展示（中英双语、分类、图标） | 低 | 生成 `market/index.json`，CI 校验必须是最新的 |
| `tsconfig.json` / `tsconfig.test.json` / `vitest.config.ts` | 类型与测试边界 | 中 | 测试排除规则一改，产物里就可能混进测试代码 |

---

## 4. 构建与产物的独占规则（自 2026-11-22 起生效）

### 4.0 角色与所有权

**分工变更（与「卡尺」接口文档同口径）：从本轮起，`lib/**` 只有一个生成者与提交者——构建者（扳手）。**
其余切片（渲染层、契约层、设计层）只提交**源码与文档**；`lib/**` 由构建者在合入时统一构建并提交。

为什么必须独占：`lib/` 已入库、被宿主 HMR 每 500 ms 轮询、被 link 安装直接读取；而 `build` 的第一步是
`rm -rf lib`。也就是说，产物生成是**破坏性、非原子**的操作，任何人并发跑都会互相踩（见 §4.8）。

| 动作 | 构建者（扳手） | 其他 Bot |
| --- | --- | --- |
| 改 `src/**` | ✅ | ✅ |
| 跑 `pnpm typecheck` / `pnpm test` | ✅ | ✅（都不写产物） |
| 跑 `pnpm build` / `pnpm check` / 裸 `tsc -p tsconfig.json` / `tsdown` | ✅ **仅我** | ❌ |
| `git add plugins/vt-gen-ui/lib/**` | ✅ | ❌ |
| 提交 `src/**`、`docs/**` | ✅ | ✅（**但 staging 里不能有 `lib/**`**） |
| 合并到 `main` 前统一重建产物 | ✅ | — |

所以其他 Bot 的提交流程是：改源码 → `pnpm typecheck`（+ `pnpm test`）→ `git add` 只加自己改的 `src/**`/`docs/**`
→ 提交。如果发现 `git status` 里出现 `plugins/vt-gen-ui/lib/**` 的变化，**不要提交、不要手改**：
`git checkout -- plugins/vt-gen-ui/lib` 还原，然后告诉构建者「源码就绪，请重建」。

### 4.1 为什么仍然需要一把锁

虽然只有一个人构建，锁还是硬要求：重试、两个终端、后台 job 与前台命令、以及将来交接，都能在几秒内造成并发。
`rm -rf lib` 已经在跑时再启动第二个构建，第二个会读到空目录或半写的 `client.js`。

### R1（硬）同一时刻只允许一个构建：「构建」包含带 emit 的 tsc

以下任一都算构建，**只能由构建者执行，且必须持锁**：

- `pnpm build`、`pnpm check`
- `tsc -p tsconfig.json`（裸跑；`emitDeclarationOnly: true` 会重写 `lib/types/**`）
- `tsdown`（任意 config）
- 任何显式反选 `--noEmit` 的 tsc 调用

不算构建：`pnpm typecheck`（已改为不 emit）、`pnpm test`、`vitest`、`node scripts/check-client-bundles.mjs`。

```sh
# 拿锁（原子，失败即退出，绝不等待重试）
mkdir /Users/mac/Project/DSH/vt-dsh-plugin/.git/vt-build.lock 2>/dev/null \
  && echo "$$ $(date -u +%FT%TZ) $(whoami)" > /Users/mac/Project/DSH/vt-dsh-plugin/.git/vt-build.lock/owner \
  || { echo "BUILD LOCKED:"; cat /Users/mac/Project/DSH/vt-dsh-plugin/.git/vt-build.lock/owner 2>/dev/null; exit 1; }

# 释放（无论成功失败都必须执行）
rm -rf /Users/mac/Project/DSH/vt-dsh-plugin/.git/vt-build.lock
```

锁放 `.git/` 下：不污染工作区、不进版本控制、所有人共享同一路径。锁超过 15 分钟视为失效，
由主 Bot 核查后清理并记录；**不要删别人的锁**。

### R2（硬）构建前先过类型门：树不绿就不构建

```sh
cd /Users/mac/Project/DSH/vt-dsh-plugin/plugins/vt-gen-ui
pnpm typecheck                             # ① 先过类型；红树直接停，不构建
cd ../..
git status --porcelain                     # ② 看清工作区里有谁的在制品
pgrep -fl "tsdown|tsc -p|pnpm" | grep -v pgrep || true   # ③ 没有别人的构建进程
node scripts/check-client-bundles.mjs      # ④ 拼接连通性预检（几秒，不写产物）
```

**树是红的时候不要「顺手修一下」再构建**：红通常来自别的切片的在制改动（本轮实例：catalog 已加 `modal`
类型，渲染层的 `prototype-registry.ts` 还没补对应渲染器），修它就越界了。正确动作是：停手 → 报主 Bot →
由对应 Bot 补完 → 再构建。

③非零**不阻止**构建；`find src -newer lib/index.js` 非零也不阻止——它正是要重建的理由。

### R3（硬）构建后核对四件事

```sh
cd plugins/vt-gen-ui && pnpm build        # 失败即停，不要重试第二次
find lib -iname "*test*" -o -iname "*__tests__*"   # ① 必须 0 命中
# ② 批次一致性：全量构建顺序是 rm → tsc(.d.ts) → tsdown(.js)，
#    所以 lib 里不该有任何文件比 lib/client.js 更新。非空 = 只跑了 tsc 或构建中途断了。
find lib -type f -newer lib/client.js | head
ls -l lib/index.js lib/client.js lib/assets/*.js   # ③ 产物齐全：2 个 js + 6 个资产
cd ../.. && node scripts/check-client-bundles.mjs  # ④ 拼接可用、id/VERSION 与包名一致
```

**① 无测试残留的三层保障**（缺一层就会漏）：`tsconfig.json` 的 `exclude` 排除测试；
tsdown 只从入口出发、测试不被 import；最后用上面那条 `find` 直接查产物。
`lib/client.js` 里 grep 到 `it(` 之类是 minified 标识符，不是测试代码。

**② 是这一轮新加的检查**：改动前 `typecheck` 会 emit，于是 `lib` 里会出现「`.d.ts` 比 `client.js` 新」的混合状态
——看起来什么都没坏，但类型产物描述的是尚未打包的源码。构建者的产物必须**同一批次**生成。

**核对产物差异只用自己的改动解释。** `git status plugins/vt-gen-ui/lib` 里若出现「我没有改对应源码」的产物变化，
先停下来查是谁的改动、要不要等它完成再构建，不要直接提交。

### R4（硬）提交：只有构建者带 `lib/**`，其他 Bot 的 staging 里不能出现它

```sh
# 构建者（扳手）
git add plugins/vt-gen-ui/src/<我改的> plugins/vt-gen-ui/lib plugins/vt-gen-ui/docs/<我改的>
git status --porcelain     # 复核：staged 里没有别人未完成的 src，也没有半批次产物

# 其他 Bot
git add plugins/vt-gen-ui/src/<我改的> plugins/vt-gen-ui/docs/<我改的>   # 绝不 add lib
git status --porcelain plugins/vt-gen-ui/lib   # 必须输出为空
```

- 其他 Bot 若发现 `lib/**` 有变化：**不提交、不手改**，等构建者在合入时统一处理；
  如果那变化来自自己误跑，执行 `git checkout -- plugins/vt-gen-ui/lib` 还原，并告知构建者。
- **永不 `git add -A` / `git commit -a`**：工作区里随时有其他 Bot 的在制品。
  本轮现场：`docs/research/host-token-audit.md`（他人）、`src/client/blocks/modal*.ts`（码匠）、
  `src/shared/catalog/*`（卡尺），以及被他人重构的 `src/plugin/index.ts`——任何一条都能被 `-A` 卷进错误的提交。
- 提交前必须看一遍 `git diff --cached --stat`，确认没有自己没预期的文件。

### R5（硬）产物不手改，构建失败立即恢复

- 禁止手编 `lib/**`（minified，与源码不可对应）。
- `rm -rf lib` 之后任何一步失败，`lib` 已经空了：HMR 会看到 404、link 安装会读到缺失产物。
  **立刻**执行 `git checkout -- plugins/vt-gen-ui/lib` 恢复 HEAD 产物，再排查原因；
  不允许留着空 `lib` 或半批次 `lib` 离开工位。
- 恢复后把失败原因记进交接（本轮实例：`TS2741` — `prototype-registry.ts` 缺 `modal` 渲染器）。

### R6（硬）并行改代码时：进下一次构建的是「构建那一刻的工作区」，不是某个人的分支

构建读的是**当时整棵工作区**（HEAD + 所有未提交改动）。所以：

1. 构建前先 `git status --porcelain` 列出在场的人与文件，必要时报主 Bot 确认「这批改动是否都到了可以打包的状态」。
2. 构建后立刻在交付说明里写清：**这次产物包含哪些人的哪些改动**（按 `src/**` 路径列）。
3. 只打包某一个人的改动时，不要在主目录构建——用 worktree（R7）。
4. 未经确认不在制品不打包：如果某个 `src` 改动仍在中途（例如只有类型没有渲染器），构建会直接红；
   这就是 R2 的绿灯门禁要拦住的情况。
5. 源码就绪的交接信号：对应 Bot 说「源码就绪 + `pnpm typecheck` 通过」→ 构建者构建 → 报产物清单 → 提交。

### R7（硬）并行改源代码用 worktree；主目录只接受「已验证的合并结果」

`create_worktree` 出来的目录各自构建**不会**影响主目录的 `lib/`（link 安装指向主目录）。
代价：worktree 里的产物需要有人合回主目录并重建一次。建议分工：
**并行开发在 worktree，构建与提交独占在主目录，由主 Bot 按 R1 放行。**

### 4.8 并发写产物会具体坏成什么样（本轮已实测两类）

| 竞态 | 结果 | 用户看到 |
| --- | --- | --- |
| **改前**：A 跑 `pnpm typecheck`（会 emit）与 B 跑 `pnpm build` | 类型产物与 bundle 来自两个源码状态 | 无报错，但 `.d.ts` 描述的是尚未打包的代码（本轮实测：`modal*.d.ts` 00:11 vs `client.js` 00:03） |
| **本轮实测**：A 构建到一半（`rm -rf lib` 已执行、tsc 报错退出） | `lib` 为空或只剩一半 | HMR 看到 404；link 安装读到缺失产物，插件加载失败 |
| A 的 `rm -rf lib` 与 B 的 `tsc` 交错 | B 的 `lib/types` 被删一半 | 构建失败，或 `.d.ts` 缺失 |
| A 的 tsdown 与 B 的 tsdown 同时写 `lib/client.js` | 文件被交叉覆盖 | HMR 500 ms 轮询到**半写文件** → 浏览器 `SyntaxError` → 白屏/整个 web boot 失败 |
| 两个 `lib/index.js` 版本混合（index 是新的、client 是旧的） | 宿主契约与渲染器版本不一致 | 工具/renderer 行为错位（例如 spec 字段认识、渲染器不认识） |
| CSS hash 来自两个不同源码状态 | 类名 hash 与样式表不匹配 | 样式错乱，且**改源码重存后仍在**（难排查） |
| 提交时 `git add -A` | 别人的半成品进了 commit | 发布物含未完成代码 |

前两条说明：**独占不是洁癖，是已经发生过的故障**。第一条已通过 `typecheck` 不再 emit 修掉；
第二条只能靠「只有构建者构建 + 失败立刻 `git checkout -- lib`」防住。

---

## 5. 已知隐患（按严重度）

| # | 隐患 | 证据 | 影响 | 建议 |
| --- | --- | --- | --- | --- |
| H1 | **工具链版本浮动**（✅ 2026-11-22 已锁：工具链 `bec4ef8`，资产引擎组同批提交） | `plugins/vt-gen-ui/package.json` devDeps；`pnpm-lock.yaml` | 换机/重装可能换到别的 rolldown，minify 输出变化 → 整包产物大 diff、无法判断「视觉有没有改」 | 已改为精确版本 `tsdown 0.22.14` / `lightningcss 1.33.0` / `typescript 5.9.3`；**资产引擎组已一并钉死**：`three 0.180.0` / `echarts 5.6.0` / `echarts-wordcloud 2.1.0` / `pele 1.13.0`（后两者原本就是精确版本）。lockfile 的 specifier 同步、`version:` 行未变。验收：持锁 `pnpm build` 后 `lib/**` 与 `lib/assets/**` 均**零差异**，即两次锁定都是 no-op。**残留**：`react` / `react-dom`（`^18.3.1`）仍为区间——它们在 `standaloneConfig` 里走 `alwaysBundle`，决定 `lib/assets/standalone-runtime.js` 的字节；要彻底可复现需第三个决策 |
| H2 | **node shim 与 tsconfig 口径矛盾**：shim 注释称 `types: []`、无 `@types/node`，实际 `tsconfig` 有 `types:["node"]` + devDep | `src/plugin/node-shims.d.ts:1-8` vs `tsconfig.json:12-14` | 后来人照错的那份改，会删掉真的类型来源或留下双份声明 | 二选一并删掉另一份（建议留 `@types/node`） |
| H3 | **宿主侧零测试**：`src/plugin/**` 没有任何 `*.test.ts`；`vitest` 里只有 `shared/catalog/catalog.test.ts`，没有 `primitives-stub` 之外的自修/工具契约测试 | `find src/plugin src/shared -name "*.test.*"` | 自修预算、指纹账本、工具协议、参数解包四条最容易回归的逻辑**没有网**；`pnpm build` 通过不代表行为对 | 宿主侧测试是本 Bot 的职责范围，建议补：`planFenceFeedback` 的纯函数表、`specOf` 四种形状、`validate_dsh_ui` 协议字段 |
| H4 | **共享 `lib/` + 单工作区**：产物入库、HMR 轮询、link 安装直读 | `.gitignore` 注释、`git ls-files lib`=129、profile symlink；盘点期间已实测到混合产物（`modal*.d.ts` 00:11 vs `client.js` 00:03） | 提交带入他人在制品；并发构建互相破坏（见 §4.8）；`lib` 批次不一致时行为与源码对不上 | 执行 §4 R1–R5，尤其 R3 的批次一致性检查 |
| H5 | **上游同名三撞** + 技能 `genui` 的 rank 归属未验证 | `index.ts` 的 `genui:fence` 段名、两处 `tools.register`、skill 名 `genui`；`dsh-skill` README | 共存必炸 section；技能名冲突时谁生效**没有结论**（本地文件系统 provider 的 rank 不在本仓库） | 共存切换只走 `plugin_manager` 顺序；要下结论需实测同名技能快照 |
| H6 | **宿主侧唯一运行时跨包依赖**：`await import('@deepseek-ai/dsh-llm')` 取 `EMPTY_RESPONSE_CODE` / `isAgentLoopRequest` | `fence-feedback.ts:341-342`；当前包导出存在（grep 命中） | 宿主升级若改名/移除这两个导出，走 reasoning-only 路径时**运行时报错**（其余路径不受影响） | 升级宿主时把这条列为验收项；或改成本地常量 + 只在需要时降级 |
| H7 | **资产路由只认平铺 `.js`** | `index.ts` 的 `ASSET_FILE_RE` + `serveGenuiAsset` 的 `content-type` | 将来加 wasm/字体/子目录（如 `echarts/xxx.js`）会**静默 404**，表现成「引擎加载失败」而不是配置错误 | 加资产类型时同步改正则 + content-type + 客户端 `loadGenuiAsset` 的 key 映射 |
| H8 | **行为规则两份手写**：`GENUI_SECTION_TEXT` 的 `Rules:` 与 `SKILL.md` 正文各写一套 | `index.ts` 的 `GENUI_SECTION_TEXT` vs `SKILL.md` | 改一处不同步另一处 → 系统提示词与技能说两套话，模型行为分裂；派生只覆盖组件清单/字段，不覆盖规则 | 把「必须一致」的规则收敛到一处（段引用 skill，或 skill 引用段文本）；短期至少在两边加交叉引用注释 |
| H9 | **`inline-content-diagnostic` 是手写 switch**（✅ 2026-11-22 已补完覆盖） | `inline-content-diagnostic.ts`；`src/plugin/__tests__/inline-content-diagnostic.test.ts` | 新增组件文字字段不加 `case` 就静默漏检（`modal` 就是这样漏的）。现补上 7 个容器类型的子树遍历与 26 个可见字段，并把 32 条「断言不报」翻成「断言会报」；断言总数从 33 降为 32，因为原清单里 `nav 子树` 那条本身不成立（`nav.items` 是数据记录，不含节点） | 新增组件时必须在同一提交里加 `case` 与断言；手写 switch 的驱动方式保持不变（查表需要「这段字符串是 prose 还是 token」这一维，契约层没有） |
| H10 | **`typecheck` 曾写产物**（已修） | `package.json` 旧脚本 `tsc -p tsconfig.json`；`tsconfig.json` 的 `emitDeclarationOnly` | 「只做检查」会覆盖共享 `lib/types/**`，与 build 互相踩；这是本轮 `lib` 混合产物的根因 | ✅ 已改为 `--noEmit --emitDeclarationOnly false`，并实测零写入。**注意**：裸跑 `tsc -p tsconfig.json` 仍会 emit，所以它也被算作构建（R1） |
| H11 | **边界事件：`src/plugin/index.ts` 被他人重构** | `git diff`：新增 `ASSET_ROUTE_PATH`/`ASSET_FILE_RE`/`resolveAssetRequest` 导出 | 宿主半边文件被非宿主负责人改动，与本文档的触点清单/行号断言直接冲突；无评审记录时无法判断是协同还是越界 | 已按符号锚点重写本文引用；要求改动方说明意图，后续按 §3 的归属执行 |

---

## 6. 验证方法与未验证项

**本文已实测：** 产物无测试残留（0 命中）、`lib` 入库 129 个文件（其中 121 个 `.d.ts`）、
`STRUCTURED_OUTPUT = 9900`、构建工具实际解析版本（0.22.14 / 1.33.0 / 5.9.3）、`dsh-llm` 两个导出存在、
profile 为 `link:` 安装、peer/dev 依赖计数（20 peer / 70 dev）。

**`typecheck` 不落产物（2026-11-22 实测）：** 改脚本前后各取一次 `lib` 全量指纹
（`find lib -type f -exec stat -f "%m %N" {} \; | sort | md5`），跑完 `pnpm typecheck`（退出码 0）后指纹**逐字节不变**；
单跑 `tsc -p tsconfig.json --noEmit --emitDeclarationOnly false` 与 `tsc -p tsconfig.test.json` 也同样零写入。

**构建形成证据（2026-11-22）：**

- **干净 HEAD worktree 构建通过**：`pnpm build` 退出 0、约 7.5 s，8 个产物齐全，`lib` 内测试残留 0 命中，
  `lib/types` 与 `lib/index.js` 同批次（`find lib -name '*.d.ts' -newer lib/index.js` = 0），
  `node scripts/check-client-bundles.mjs` 报 12 个 client 模块拼接通过（另有 1 个纯 host 插件按设计跳过）。
- **同源重建字节一致（同目录）**：00:24 在主工作区有一次完整重建，产出的 `lib/client.js` 与 HEAD 已提交版本
  **逐字节相同**（`git status` 里该文件无差异），只有 `lib/index.js` 因当时的宿主侧未提交改动而变化。
- **跨目录同样稳定**：worktree（`/tmp`）构建出的 5 个 asset（`pele/three/echarts-core/echarts-full/icons`）
  与仓库内已提交产物 sha256 一致。
- **差异的真实来源不是不可复现**：`lib/index.js` 与 `lib/client.js` 在我那次比对中显出差异，根因是
  **HEAD 在我创建 worktree 之后移动**（`886d38c feat(gen-ui): 确认层与底部面板` 落地，引入了 `modal`），
  与工具链无关。**核对产物前先确认 HEAD 没动**，否则会把源码变化误判成构建不确定性。
- **宿主侧测试已入库**（commit `48a97c2`）：`src/plugin/__tests__/` 下 4 个文件、**122 个用例**
  （tool 32 / fence-feedback 52 / asset-route 26 / plugin-registration 12），`vitest run src/plugin` 全绿；
  覆盖资产路由的纯函数决策、工具协议、自修预算与注册顺序。
- **全量门禁已跑过一次**：同一提交上 `pnpm check` 全绿（typecheck 0 错、`251/251`、build 通过）。
  写文档时工作区里还有渲染/契约的在制改动，全量 `pnpm test` 会随之变红（`modal.test.tsx` 的
  `--proto-scrim` 断言，因为 `Prototype.module.css` 正被改），所以日常门禁仍按
  「`pnpm typecheck` 绿 + `vitest run src/plugin` 绿」执行，全量绿留给构建窗口。

**尚未做（等统一构建窗口）**：工具链版本锁（`tsdown` / `lightningcss` / `typescript` 去 `^`）、
窗口内干净重建、以及按批次提交全量 `lib/**`（见 H1）。

盘点开始时 `lib` 与 HEAD 一致；结束时已观察到混合产物（见 §2.4）——工作区是活的，引用任何「当前状态」前请重新核对。

**未验证（写结论前必须实测，别引用本文当证据）：**

1. 本地文件系统同名 `genui` 技能与本插件 bundled 技能的**实际胜者**（rank 比较结果）。
2. 两个 client 同时挂载时 DOM/slot 层面的真实表现（`data-genui-rendered` 标记、`render_ui` toolview 槽位）。
3. `lib/client.js` 半写状态下 HMR 的具体报错形态（§4.8 是机制推断，未构造竞态复现）。
4. 宿主升级后自修路径的兼容性（H6）。
5. 跨机器/跨目录的逐字节可复现：同目录重建已实测字节一致（`lib/client.js`），跨目录只验证了 5 个 asset；完整结论仍需在不同机器上对比 sha256。

---

## 7. 后续切片建议（按风险与耦合）

归口规则：**谁的文件归谁改，`lib/**` 只由构建者产出**（§4.0）。下表「可动」= 该切片负责人的范围。

| 切片 | 负责人 | 可动的文件 | 不可动的邻接文件 | 前置条件 |
| --- | --- | --- | --- | --- |
| 宿主提示词段文案 | 扳手 | `index.ts` 的 `GENUI_SECTION_TEXT` 手写部分 | `derive.ts`（派生插槽）、`SKILL.md`（避免 H8 加剧） | 段名/order 不变 |
| 工具契约 | 扳手 | `tool.ts` 的协议字段与 schema | `fence-feedback.ts`（读 `status=rendered`）、`client/toolview.tsx`（读 `presentationMeta`） | 三处一起验收 |
| 自修逻辑 | 扳手 | `fence-feedback.ts` | `planFenceFeedback` 的纯函数契约 | 先补 H3 的测试 |
| 资产路由 | 扳手 | `index.ts` 的路由段 | `client/asset-loader.ts`（URL/rev/key 契约） | 两侧一起改 |
| 构建链 / 产物 | 扳手（**唯一构建者**） | `tsdown.config.ts`、`package.json` scripts/devDeps、CI | `scripts/check-client-bundles.mjs`、`market/index.json` | 持锁 + 树绿（R1/R2） |
| 组件与视觉 | 码匠 | `client/blocks/**`、`*.module.css` | `client/guard.ts` 的渲染语义（跨到宿主工具） | `typecheck` + 截图自验 |
| catalog 与校验 | 卡尺 | `shared/catalog/definitions.ts`、`docs.ts`、`client/genui-runtime/**` | `prototype-registry.ts`（新增类型必须同步补渲染器，否则树红） | `typecheck` + 三处一起验 |
| 设计文档与探针 | 画师 | `docs/**` | 任何 `src/**` | — |

**交付给构建者的信号（缺一不可）**：①「源码就绪」；②`pnpm typecheck` 通过；③改动路径清单；
④如果动了 `src/plugin/**`，说明是否需要重启验收。构建者随后持锁构建、核对 R3 四项、提交 `lib/**`。
