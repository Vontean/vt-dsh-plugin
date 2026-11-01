# DSH composer 模型选择器架构与第三方插件接入面调研

> 调研对象：DeepSeek Harness（DSH）**0.2.1-rc.5** 桌面应用内的 Web 客户端（`/Applications/DeepSeek Harness.app`，只读）。
> 目标：为「把 composer 模型 chip 改成 MCX 两级面板（先展开当前模型 + 思考强度滑条，点模型名再展开模型列表）」提供可直接驱动实现的架构事实。
> 交互规格（面板长什么样、动画参数、键位、滑条几何）见同目录 [`mcx-model-slider.md`](./mcx-model-slider.md)；**本文只回答 DSH 侧的问题**：DOM/CSS、槽位、插件装载、design token、模型 API、可改造路径、本地验证。
> 证据写法：`文件:行号`。被引用的包是从 `app.asar` 解压出来的构建产物，**行号对应当前这一版构建**；单行 minified bundle 用 `@字节偏移` 标注（见 §0.2）。

---

## 0. 文档定位与证据约定

### 0.1 结论可信度与取证据方式

- 全部结论来自**打包产物的源码**（`app.asar` 内 `dsh/node_modules/@deepseek-ai/*` 的 `lib/client.js`，未压缩，源码以 region 形式内联），不是猜测，也没有抓取用户正在运行的 GUI（`http://127.0.0.1:59544` 需要 auth token，且不应干扰用户会话）。
- 官方 README（随包发布的 `README.zh.md`）用于交叉印证行为描述；当 README 与代码冲突时以代码为准，并在正文标注（例：§2.2 的「点击直接打开模型列表」）。
- 未做任何写入：`app.asar` 只读，本文只写 `docs/research/`。

### 0.2 解压与引用约定

`app.asar` 内路径前缀是 `dsh/node_modules/@deepseek-ai/<pkg>/...`。按需解压：

```bash
# 文件索引
node /tmp/dsh-asar/list.mjs "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar"   # 生成 /tmp/dsh-asar/index.json
# 按包前缀解压
node /tmp/dsh-asar/extract.mjs /tmp/dsh-src \
  dsh/node_modules/@deepseek-ai/dsh-client-ui-model-selection/ \
  dsh/node_modules/@deepseek-ai/dsh-client-modules/
```

本文别名表（`别名:行号`）：

| 别名 | 绝对路径（解压产物） | 说明 |
|---|---|---|
| `MS` | `/tmp/dsh-src/dsh/node_modules/@deepseek-ai/dsh-client-ui-model-selection/lib/client.js` | composer 模型位 + `/model` 弹窗（核心） |
| `MS-IDX` | 同包 `lib/index.js` | host 半边（空 `apply`） |
| `CONV` | `/tmp/dsh-src2/dsh/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js` | composer 卡片、槽位声明 |
| `REN` | `/tmp/dsh-src/dsh/node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/client.js` | SlotRegistry、outlet、组件 props 装配 |
| `THEME` | `/tmp/dsh-src2/dsh/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js` | 全局 token 样式表、`ctx.theme` 服务 |
| `THEME-HOST` | 同包 `lib/index.js` | 首屏 palette 引导脚本 |
| `LAYOUT` | `/tmp/dsh-src3/dsh/node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js` | ThemePresenter（写 `data-ds-dark-theme`） |
| `SHELL` | `/tmp/dsh-src3/dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-BXV-oxvX.js` | 外壳：`__ModuleLoader__`、静态模块表、ui-slots/ui-primitives 实现（**单行**，用 `@偏移`） |
| `SHELL-CSS` | 同目录 `index-BNyAYEM7.css` | 基础组件 CSS（**单行**，用 `@偏移`） |
| `MODULES` | `/tmp/dsh-src/dsh/node_modules/@deepseek-ai/dsh-client-modules/README.zh.md` | 客户端 bundle 机制权威说明 |
| `SC` | `/tmp/dsh-src2/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/index.js` | host 侧 session 控制器（`modelCatalog`/`selectModel`） |
| `REMOTES` | `/tmp/dsh-src2/dsh/node_modules/@deepseek-ai/dsh-api-remotes/lib/client.js` | RPC schema（`session/modelCatalog`、`session/selectModel`） |
| `LABEL` | `/tmp/dsh-src/dsh/node_modules/@deepseek-ai/dsh-client-ui-deepseek-model-label-1017/lib/client.js` | 官方 slot 使用范例（1017 角标） |
| `CLI-README` | `/tmp/dsh-src5/dsh/node_modules/@deepseek-ai/dsh/README.zh.md` | 0.2.1-rc.5 CLI 语义（profile / DSH_HOME / plugin） |
| `PM-README` | `/tmp/dsh-src4/dsh/node_modules/@deepseek-ai/dsh-plugin-manager/README.zh.md` | 插件安装 / `installBundle` |
| `ENH` | `<repo>/plugins/vt-uiux-enhancer/client.js` | 第三方参考：CSS 注入与主题 token 覆盖 |
| `CONV-DOC` | `<repo>/docs/plugin-conventions.md` | 本仓库插件硬约定 |

> 版本一致性检查：`SC/MS` 等包 `package.json` 均为 `0.2.1-rc.5`；应用内 CLI `--version` 输出 `0.2.1-rc.5`；而 PATH 上的全局 `dsh` 是 **0.1.5-rc.1**（另一套包），本地验证必须用应用内置 CLI（§8.1）。

---

## 1. 结论先行（推荐方案）

### 1.1 推荐：方案 A —— 整控替换 `conversation.input.model` 槽位

`conversation.input.model` 是一个**普通 `single` / `scope: session` 槽位**（声明处 `CONV:20120-20123`，渲染处 `CONV:19278`），DSH 的槽位核心允许**在更低 priority 上注册以遮蔽同格占用者**（`SHELL@485026` 起 `SlotCore.register`；`single` 的胜者是 `entriesOfSlot(key)[0]`，`REN:1173-1174`）。因此第三方插件可以：

1. `ctx.slots.inject('conversation.input.model', () => ctx.slots.register({ name: 'conversation.input.model', priority: -1, locale: ns, inject: (sessionId) => ... }, MyModelChip))`
2. 官方 `ModelSelect` 仍然注册、仍然活着，但不再渲染；`/model` 命令弹窗不受影响。
3. 自己的组件从**同一个** `ctx.modelDirectories` 拿目录与提交（`MS:987-1045`），因此与 `/model`、官方选择器完全同源、天然一致。
4. 面板结构完全自持：root = 「当前模型 + 思考强度滑条」，点模型名 → 模型列表（MCX 规格直接照 [`mcx-model-slider.md`](./mcx-model-slider.md) 实现）。

**代价（必须写进方案）**：替换父槽位后，官方 `conversation.input.model.label` 子槽位（trigger/menu/option 三处名称装饰，如 1017 角标）**不会再被渲染**——子槽位由官方 registration 的 `children` 声明（`MS:1906-1910`），我们的 registration 既不能重复声明同名子槽位（会抛 "already declared"，`SHELL@485026`），也无权 `renderSlot` 别人的子槽位（`REN:342-360` 只允许渲染自己 `children` 声明的 key）。如果必须保留角标类装饰，走 §8.4 的 A2。

### 1.2 排序与一句话理由

| 排名 | 方案 | 可行性 | 一句话理由 |
|---|---|---|---|
| **1** | **A. 整控替换 `conversation.input.model`** | 高 | 官方为此留了槽位；数据面（目录/提交）是公开服务；结构完全自持，无 DOM hack |
| 2 | A2. 官方 seat 用 CSS 隐藏 + 在 `conversation.input.right` 里放自己的 chip | 中高 | 不动官方组件、不抢槽位；代价是多一个隐藏节点与一条 CSS 选择器契约 |
| 3 | B. DOM 级拦截 trigger click + 自绘浮层 | 中 | 技术可行（sessionId 可从 `[data-conversation-session]` 读到）；但事件、焦点、aria 全要自己兜，且和官方状态机打架 |
| 4 | C. 仅 CSS 换皮 | **不可行** | CSS 改不了「点击后进入哪一层」和「推理等级行 → 滑条」这两件事，最多做 A 的视觉补充 |

### 1.3 现状与目标的差距（先看这一节，避免重复造轮子）

rc.5 的官方实现**已经是两级菜单**，只是形态与 MCX 不同：

| | rc.5 现状 | MCX 目标 |
|---|---|---|
| 点击 chip 后的第一层 | root 菜单 = 两行 cell：`模型 <当前值> ›`、`推理等级 <当前值> ›`（`MS:1535-1572`） | 一个面板：**当前模型名 + 思考强度滑条** |
| 第二层 | 点任一行下钻到「模型列表」或「推理等级列表」（`MS:1574`、`MS:1686`） | 只有「点模型名」才下钻到模型列表；强度用滑条就地改 |
| 强度交互 | 离散列表（`reasoning.efforts` 生成 N 行，`MS:1206-1219`、`MS:1686-1715`） | 连续感的档位滑轨（离散档位 + 拖动预览） |
| 列表形态 | 顶部搜索（>4 模型才出现，`MS:1187`）+ provider 分组吸顶标题（`MS:1636`） | 同左 + 底边锚定高度动画（见 mcx 文档 §3.2） |
| 触发器 | `模型名 · 强度`，caption 色（`MS:1516-1521`、`1459-1463`） | 「两种状态」chip（见 mcx 文档 §9） |

官网 README 说「点击后直接打开模型列表」只适用于**尚未选定模型**的情况：`show()` 里 `setPane(currentChoice === void 0 ? "model" : "root")`（`MS:1320-1329`，判空见 `1152-1204`）。既定模型时点击进入的是 root 面板，即上表第一行。

结论：**目标不是「从零实现选择器」，而是「替换 root 面板的呈现并把强度改成滑条」**。方案 A 的组件可以直接照抄官方 `ModelSelect` 的状态机骨架（`MS:1152-1470`）再改 root 面板，风险与工作量都可控。

---

## 2. composer 模型控件的 DOM 结构与 CSS

### 2.1 组件层级（渲染后，会话已就绪时）

```html
<div data-composer-card>                                  <!-- CONV:19188，composer 卡片（弹层锚点） -->
  <div class="InputBar_row ...">                          <!-- CONV:19237，container-type:inline-size -->
    <div class="InputBar_trailing">
      <div class="InputBar_standardControls">             <!-- CONV:19276 -->
        <div data-slot="conversation.input.right" style="display:contents"></div>   <!-- REN:1122-1126 -->
        <div data-slot="conversation.input.model" style="display:contents">        <!-- 官方 seat 的 outlet -->
          <div class="htuFrW_root">                        <!-- MS:1478-1481 -->
            <button class="htuFrW_trigger"                  <!-- MS:1490-1525 -->
                    type="button"
                    aria-label="选择模型，当前 X，推理等级 Y"    <!-- MS:1460-1463 -->
                    aria-haspopup="menu"
                    aria-expanded="false|true"
                    aria-controls=":r1:-menu"                <!-- 打开时 -->
                    aria-busy="false|true"
                    title="X · Y"
                    [data-selection-focus]>                  <!-- 选中后抑制焦点环 -->
              <svg class="htuFrW_triggerIcon"/>              <!-- 窄容器时才显示 -->
              <span class="htuFrW_triggerLabel">
                <span data-provider-id="deepseek-official" data-model-id="deepseek-flash">…</span>
              </span>
              <span class="htuFrW_triggerEffort">中</span>
              <svg class="htuFrW_chevron|htuFrW_chevronOpen"/>  <!-- busy 时换成 StateDot -->
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

- 「窄容器退化」由 CSS 容器查询驱动：`.row[data-model-compact]` 打开 `--dsh-composer-model-text-display:none` / `--dsh-composer-model-icon-display:block`（`CONV:18901` 内 `.JZLxKW_row[data-model-compact]{…}`），属性由测宽代码切换（`CONV:18872-18877`）；`htuFrW_triggerIcon`/`triggerLabel`/`triggerEffort` 读这两个变量（`MS:1060`）。**替换组件时必须自己实现或放弃这一行为**（官方是运行时测宽，不是纯 CSS）。
- outlet 包装元素由渲染器统一生成：`div`（或声明 `inline: true` 时的 `span`）+ `data-slot="<key>"` + `style="display:contents"`（`REN:1122-1126`）。**这是最稳的 DOM 钩子**，不随构建哈希变化。
- 官方 seat 还用到 `[data-composer-card]` 作为 Toast 锚点：`anchor: rootRef.current?.closest("[data-composer-card]")`（`MS:1720-1726`）。

### 2.2 浮层（菜单）结构与渲染位置

```html
<!-- 追加到 document.body（MS:1526 + MS:1719 document.body） -->
<div id=":r1:-menu" class="htuFrW_menu" role="menu|group"
     aria-label="模型与推理等级" aria-busy="false"
     data-menu-material="translucent"                     <!-- MenuSurface 根（SHELL@649190） -->
     style="position:fixed; left:…px; top:…px">           <!-- 内联坐标（MS:1298-1314） -->
  <div aria-hidden="true" class="_material_ri079_21"></div> <!-- 背景材质层（SHELL-CSS@16590） -->

  <!-- pane = root（有已选模型时） -->
  <button role="menuitem" class="htuFrW_cell">              <!-- MS:1535-1546 模型 -->
    <span class="htuFrW_cellLabel">模型</span>
    <span class="htuFrW_cellValue"><span data-provider-id data-model-id>…</span></span>
    <svg class="htuFrW_cellChevron">                        <!-- MS:1550 -->
  </button>
  <button role="menuitem" class="htuFrW_cell">…推理等级…</button>   <!-- MS:1553-1570 -->

  <!-- pane = model -->
  <div class="htuFrW_searchRow">                            <!-- MS:1574-1622，>4 个模型才出现 -->
    <Input class="htuFrW_search" role="searchbox" aria-activedescendant=":r1:-model-N"/>
    <button class="htuFrW_searchClear" aria-label="清除搜索"/>
  </div>
  <div id=":r1:-models" class="htuFrW_groups scrollable" role="menu" aria-label="模型">  <!-- MS:1625-1632 -->
    <section role="group" aria-labelledby=… data-menu-group>            <!-- MenuGroup，SHELL@657338 -->
      <span data-menu-group-start/><div data-menu-group-heading>DeepSeek 账号</div>
      <button role="menuitemradio" aria-checked class="htuFrW_option htuFrW_modelOption [htuFrW_selected] [htuFrW_optionActive]"
              id=":r1:-model-0" tabindex="-1|0" title="…" data-highlighted>  <!-- MS:1642-1680 -->
        <span class="htuFrW_optionCopy"><span class="htuFrW_modelName">…</span></span>
        <span class="htuFrW_check">✓ | StateDot</span>
      </button>
    </section>
  </div>

  <!-- pane = effort -->
  <button role="menuitemradio" class="htuFrW_option [htuFrW_selected]">…</button>   <!-- MS:1698-1716 -->
</div>

<!-- MenuSurface 自己再 portal 一个背景垫片到 body，用 CSS anchor positioning 对齐（SHELL@649190 起 j1 组件） -->
<div data-menu-backing aria-hidden="true" class="_backing_ri079_2"
     style="--dsh-menu-anchor:--dsh-menu-r1"></div>
```

要点：

1. **portal 到 `document.body`**：`open && createPortal(<MenuSurface …/>, document.body)`（`MS:1526`、`MS:1719`）。菜单不在 composer 卡片内，因此祖先的 `overflow`/`transform` 不影响它，但 `[data-composer-card]` 的 `contains()` 判断也不成立——官方靠 `menuRef` 显式判断外部点击（`MS:1224-1235`）。
2. **锚定方式是手工 fixed 定位**，不是 popper/floating-ui：
   - 测量 pass：首帧用 `MEASURE_STYLE = {visibility:'hidden', left:0, top:0}` 拿到真实 `offsetWidth/offsetHeight`（`MS:1141-1145`、`MS:1529`）。
   - 定位算法：右对齐触发器右边缘、贴触发器上方 8px，再钳进视口 12px：`x = rect.right - lw`、`y = rect.top - 8 - lh`，`MARGIN = 12`（`MS:1285-1307`）。
   - 跟随：`scroll`（capture）、`resize`、菜单自身 `ResizeObserver` 重新定位（`MS:1308-1314`）。这就是「菜单打开时名称变宽也不会出屏」的实现（README.zh.md:52）。
3. **z-index 1100**（`MS:1060` 中 `.htuFrW_menu{z-index:1100}`）。官方还有一层 `MenuSurface` 的材质与背景垫片：`_surface_ri079_1{anchor-name:var(--dsh-menu-anchor);isolation:isolate}`、`_material_ri079_21{…background:var(--dsw-menu-surface-fill);backdrop-filter:var(--dsw-menu-backdrop-filter)}`、`_backing_ri079_2{position:fixed;position-anchor:…;top:anchor(top);left:anchor(left);…background:var(--dsw-alias-bg-base);z-index:-1}`（`SHELL-CSS@16369/16519/16590`）。macOS 上的「毛玻璃」来自这层 backing，**自绘面板建议直接复用 `MenuSurface` 基元**而不是自己写背景。
4. **吸顶分组标题**：`MenuGroup` 渲染 `section[data-menu-group]` + `span[data-menu-group-start]` + `div[data-menu-group-heading]`（`SHELL@657338-657360`），`observeStickyMenuGroups(viewport)` 用 IntersectionObserver 给标题打 `data-stuck`（`SHELL@657667` 起），样式只在该属性下给 94% 背景（README.zh.md:44）。模型位在 `available/open/pane/filteredGroups` 变化时重建观察器（`MS:1262-1268`）。

### 2.3 CSS Module 类名与「稳定钩子」

CSS Module 类名是**构建期哈希**，当前构建是 `htuFrW_` 前缀（源文件路径见 `MS:1059` 的 `ModelSelect.module.css.mjs` region），`MS:1069-1099` 是完整的「语义名 → 哈希名」映射表。关键语义名：

| 语义 | 当前类名 | 作用 | 证据 |
|---|---|---|---|
| root | `htuFrW_root` | `position:relative` 容器 | `MS:1060` |
| trigger | `htuFrW_trigger` | 28px 高、radius-sm、13px/400、caption 色 | `MS:1060` |
| triggerLabel / triggerEffort / triggerIcon / chevron | 同名后缀 | 文本、强度、窄容器图标、箭头（`transition:transform .12s`） | `MS:1060` |
| menu | `htuFrW_menu` | fixed、`z-index:1100`、`max-width:min(420px,100vw-32px)`、`max-height:min(360px,100vh-96px)`、`elevation-prominent`、`padding:4px` | `MS:1060` |
| cell / cellLabel / cellValue / cellChevron | 同名后缀 | root 面板的行（34px 高、radius-md） | `MS:1060`、`MS:1535-1570` |
| option / modelOption / optionActive / optionCopy / modelName / check / selected | 同名后缀 | 列表行（min-height 34px、13px/400）、勾选位 | `MS:1060`、`MS:1642-1680` |
| groups | `htuFrW_groups` | 滚动区 | `MS:1625-1632` |
| search / searchRow / searchClear / searchWithQuery | 同名后缀 | 搜索 | `MS:1060`、`MS:1574-1622` |
| status / empty / error / warning / retry | 同名后缀 | 加载/错误/失败分组 | `MS:1060`、`MS:1626-1641` |

> **不要用这些哈希类名做长期契约**。同版本内它们稳定，跨构建（应用升级）会变。稳定的 DOM 契约只有：

| 稳定选择器 | 含义 | 证据 |
|---|---|---|
| `[data-slot="conversation.input.model"]` | 模型位 outlet（`display:contents`） | `REN:1122-1126` |
| `[data-slot="conversation.input.right"]` / `…left` | 同一行左右两侧的 list 槽位 | `CONV:19270`、`CONV:19278`、`CONV:20108-20119` |
| `[data-composer-card]` | composer 卡片 | `CONV:19188` |
| `[data-conversation-session="<id>"]` | 该会话根节点，**携带 sessionId** | `CONV:17931`；官方自己也这样读：`CONV:19583-19587` |
| `[data-composer-seat]` | composer 座位（sticky 容器） | `CONV:17923` |
| `[data-menu-material="translucent"]` / `[data-menu-group]` / `[data-menu-group-heading]` / `[data-stuck]` | 菜单基元契约 | `SHELL@649190`、`SHELL@657338` |
| `button[aria-haspopup="menu"][aria-expanded]`（卡片内） | 语义化 trigger 定位（DOM 方案用） | `MS:1494-1503` |

---

## 3. 槽位 API（`ctx.slots`）

### 3.1 服务与核心语义

- `ctx.slots` 是 `@deepseek-ai/dsh-client-ui-renderer` 注册的 Cordis Service，名字就是 `slots`（`REN:1298` 类定义、构造函数 `super(ctx, "slots")`，`REN:1329-1341`）；它把纯核心 `SlotCore`（`SHELL@485026`，作为静态模块 `@deepseek-ai/dsh-client-ui-slots` 暴露）接到 React。
- 公共 API（`REN` 内逐个方法都有 JSDoc）：

| 方法 | 签名要点 | 证据 |
|---|---|---|
| `inject(key, callback)` | 等待某槽位**被声明**后运行 `callback`；声明塌陷→销毁，重新声明→再跑；归属调用者 fiber | `REN:1368-1430` |
| `register(options, Component)` | 注册普通 entry；返回值包在 `ctx.effect` 里，fiber 卸载自动清理 | `REN:1813-1816`、`REN:1603-1623` |
| `registerFactory(options, Component)` | 注册可复用 Factory（本文不需要） | `REN:1817-1819`、`REN:1624-1655` |
| `entries(key)` / `entriesOfSlot(key)` | 原始 entries / 「每格胜者」（按 priority 升序取第一个） | `REN:1542-1560` |
| `spec(key)` / `subscribe(key,fn)` / `getVersion(key)` / `snapshot(root)` | 声明元数据 / 变更订阅 / uSES 版本号 / 只读组合树 | `REN:1562-1601` |

- **注册选项字段**：`name`（必填）、`priority`、`locale`（声明词典命名空间 → 组件拿到 `t`）、`inject`（`(sessionId, actions) => props`）、`children`（声明子槽位）、`store`、`key`/`id`/`order`/`select`（按 kind）、`registrant`。校验与去重规则在 `SHELL@485026` 的 `register` 内：
  - 槽位必须**已被声明**：否则 `throw new Error('slot "X" is not declared (a parent entry's children table must declare it)')`。
  - `single`：**同 priority 只能有一个 registration**，冲突直接抛错，错误文案明确写了「register at a different priority to shadow it (**lowest renders**)」。
  - `keyed`/`list`/`chain` 分别要求 `key`/`id`/`select`。
- **胜者选择**：`single` 走 `host.entriesOfSlot(key)[0]`（`REN:1173-1174`）——即 priority 最小者。因此 `priority: -1` 稳定遮蔽官方的 `0`。
- **`renderSlot` 的授权边界**：组件拿到的 `renderSlot(key, ownerProps, {fallback})` 只允许渲染**自己 `children` 里声明过的 key**（否则 `SlotOwnershipError`，`REN:342-360`），且 registration 必须仍存活（`StaleAuthorizationError`）。这条决定了「替换父槽位 = 失去对子槽位的渲染权」。

### 3.2 组件拿到的 props

渲染器在 outlet 处装配（`REN:766-790`）：`{...kit, ...entry.inject 结果, ...slotInjected.props, ...ownerProps}`，**ownerProps 最后展开（owner 覆盖一切）**。`kit` 的组成（`REN:738-760`）：

- 永远有：`renderFactorySlot`；
- 声明了 `locale`：`t`（绑定该 namespace 的翻译函数，`REN:745-748`；缺失 locale 服务会 fail-loud）；
- 声明了 `store`：`useStore`、`actions`；
- 声明了 `children`：`renderSlot`（有 chain 子槽位时再加 `renderSlotChain`）；有非 root 子槽位时再加 `SessionProvider`；
- root 标准 props（如 `useSessions` 等）来自 `standardProps`。

对照官方 seat 的签名即可验证：`function ModelSelect({ locked, available, directory, load, select, t, renderSlot })`（`MS:1152`）——`locked` 来自 owner（`CONV:19278`，值 `removed || inert || !live`，`CONV:19020`），`available/directory/load/select` 来自它自己的 `inject`（`MS:1911-1921`），`t` 来自 `locale`，`renderSlot` 来自 `children`。

### 3.3 `conversation.input.model` 及其子槽位

声明链：

1. `conversation.composer.bar` 由 conversation 包注册，其 `children` 里声明了 composer 一整排槽位（`CONV:20092-20135`）：
   - `conversation.input.overlay`（list/session）
   - `conversation.input.attachments`（single/session-maybe）
   - `conversation.input.permission`（single/session）、`conversation.input.plan`（single/session）
   - `conversation.input.left`（**list**/session）、`conversation.input.right`（**list**/session）
   - **`conversation.input.model`（single/session）** `CONV:20120-20123`
   - `conversation.input.activity`（single/session）、`conversation.composer.dock`（list/session）
2. 渲染位置（`CONV:19278`）：`renderSlot("conversation.input.model", { locked: modelSeatLocked })`，位于 `standardControls` 内、`conversation.input.right` 之后。
3. `conversation.input.model.label` 是**官方注册 seat 时**声明的子槽位：`children: { "conversation.input.model.label": { kind: "single", scope: "session", inline: true } }`（`MS:1906-1910`）。所以它只在官方 seat 注册存活期间存在。
4. 三处 placement 的调用点都在 `renderModelLabel(provider, model, placement, selected)`（`MS:1464-1473`），owner props = `{ provider: {id,name}, model: <目录条目>, placement, selected }`，fallback 是 `model.name`：
   - `placement: "trigger"`：`MS:1516`（触发器文本）
   - `placement: "menu"`：`MS:1552`（root 面板「当前值」格）
   - `placement: "option"`：`MS:1651`（模型列表每行）
   - 外层还套了 `span[data-provider-id][data-model-id]`（`MS:1465-1466`），供纯 CSS 装饰定位（README.zh.md:54）。
   - 未选中模型时以上三处都不调用 slot，保留内置占位文案（README.zh.md:52）。

### 3.4 插件注册示例（官方 1017 角标，最短可用模板）

```js
// LABEL:57-67 —— 官方 dsh-client-ui-deepseek-model-label-1017 的完整客户端插件体
const inject = ["slots", "locale"];                     // 只依赖槽位服务与词典服务

function apply(ctx) {
  const namespace = "deepseek-model-label-1017";
  ctx.effect(() => ctx.locale.register(namespace, { zh, en }),
             "deepseek-model-label-1017: dictionaries"); // 词典随 fiber 卸载
  ctx.slots.inject("conversation.input.model.label", () =>
    ctx.slots.register({ name: "conversation.input.model.label", locale: namespace },
                       DeepSeekModelLabel));             // 声明出现即注册，消失即注销
}
exports.apply = apply;
exports.inject = inject;
```

组件本体（`LABEL:34-52`）是纯展示：接收 `{ provider, model, t }`，命中条件时渲染 `<span>{model.name} <Tag tone="info">1017</Tag></span>`，否则 `return model.name`。README 明确约束：**必须渲染非交互的内联内容**，点击/搜索/焦点/勾选/无障碍全部由选择器负责（README.zh.md:52）。CSS 也是极简一行，通过 factory 副作用注入（`LABEL:12-22`）。

生命周期要点：

- `ctx.effect(fn, label)` 返回 disposer，fiber 卸载时执行（`REN:1822-1825` 把 `register` 包进 effect；`LABEL:61-62` 对词典同理）。
- `ctx.slots.inject(key, cb)` 解决「我的插件比声明者先激活」：声明未出现时挂起，出现后执行；声明塌陷（声明者被禁用）时自动注销我们的 entry（`REN:1368-1430`）。**这是插件加载顺序无关的关键 API**。
- 卸载后组件消失、词典回收、CSS style 标签由模块加载器回收（`MODULES:89`「图更新会在导入消费者前丢弃未归属条目的陈旧 factory、其样式」）。

### 3.5 与本次改造相关的槽位全景

| 槽位 | kind / scope | 用途 | 对 MCX 的价值 | 证据 |
|---|---|---|---|---|
| `conversation.input.model` | single / session | 模型位整控 | **方案 A 的落点** | `CONV:20120`、`CONV:19278` |
| `conversation.input.model.label` | single / session / inline | 三处名称装饰 | 只能装饰、不能改结构 | `MS:1906-1910` |
| `conversation.input.right` | list / session | 模型位左侧 | 方案 A2 的落点（放自己的 chip） | `CONV:20116-20119` |
| `conversation.input.left` | list / session | 工具区右侧 | 备选落点（不推荐，位置错） | `CONV:20108-20111` |
| `conversation.input.overlay` | list / session | 卡片顶部覆盖层 | 不适合放常驻控件 | `CONV:20100-20103` |
| `conversation.composer.dock` | list / session | 卡片底部 dock 行 | 可放进度/提示，不放 chip | `CONV:20128-20132` |
| `conversation.composer.bar` | registration / — | 整个 composer 卡片体 | 不替换（太重） | `CONV:20092` |
| `conversation.composer` | **chain** / session | composer 外层链式槽位 | 链式可「包裹」整个 composer，但需重绘整个卡片，成本过高；仅记录为最后手段 | `CONV:17911`（`renderSlotChain` 调用）、`CONV:19945` |

> **没有**「菜单级」槽位：root 面板/cell/列表全部是 `ModelSelect` 组件内部 JSX。所以「只替换菜单」在 rc.5 不可能，只能整控替换或 DOM 介入。

---

## 4. 第三方 client bundle 的加载机制

### 4.1 bundle 形状

每个插件的 `client.js` 都是一个 `window.__ModuleLoader__.load({ id, factory })` 调用，**只注册 factory，不执行副作用**：

```js
// MS:1-8（官方包同样形状）
window.__ModuleLoader__.load({
  id: "@deepseek-ai/dsh-client-ui-model-selection",
  factory: (require) => {
    var module = { exports: {} }; var exports = module.exports;
    let primitives = require("@deepseek-ai/dsh-client-ui-primitives");  // 平台静态模块
    let cordis = require("@deepseek-ai/cordis");
    let store = require("@deepseek-ai/dsh-client-store");
    let react = require("react");
    let react_dom = require("react-dom");
    …
    exports.apply = apply; exports.inject = inject;
    return module.exports;
  }
});
```

- 惰性：执行 bundle 只登记 factory，`factory(require)` 在首次物化时运行，**CSS 注入等副作用也在 factory 闭包内**（`MODULES:73`）。
- 组合：外壳把多个插件拼进同一个 `<script>`（`plugins/??a/client.js,b/client.js`），因此**顶层是共享作用域**——`CONV-DOC` §2.1 已把这条写成硬约定（顶层只能有一个 `load` 调用，常量必须放进 factory）。
- `require` 解析顺序：平台 seed 表 → 已物化记录 → 启动图 row → 已注册 factory；否则抛错（`MODULES:73`）。

### 4.2 平台静态模块表（可 `require` 的裸模块白名单）

外壳初始化一张冻结表（`OZ()`，`SHELL@917644`，内容在 `SHELL@917830` 起）：

| 模块 | 说明 |
|---|---|
| `react` / `react/jsx-runtime` / `react-dom` / `react-dom/client` | 同一份 React 实例 |
| `@deepseek-ai/cordis` | 插件框架（`Service`/`ctx.effect`/`ctx.inject`…） |
| `zod` | 校验 |
| `@tanstack/react-virtual` | 虚拟列表 |
| `@deepseek-ai/dsh-client-store` | `createSnapshotStore` / `defineStore`（uSES 友好） |
| `@deepseek-ai/dsh-client-ui-slots` | 槽位纯核心（`SlotCore` 等，`SHELL@494151`） |
| `@deepseek-ai/dsh-client-ui-primitives` | 基元组件库（见 §4.3） |
| `@deepseek-ai/dsh-client-ui-dockkit` | dock 基元 |

除此之外的 `@deepseek-ai/dsh-client-*` 模块必须写进 `package.json` 的 `dsh.client.inject`，并由宿主把它们作为动态 row 提供（`MODULES:34`、`MODULES:51`）；`dsh.client.external` 只用于**基座之外**的额外精确请求。类型 import 会被擦除，不产生请求。

### 4.3 自绘面板可直接复用的基元（`@deepseek-ai/dsh-client-ui-primitives`）

从导出的符号表（`SHELL@865xxx` 起的 export 对象）可确认本次改造需要的都在：

- 菜单：`Menu`、`MenuSurface`、`MenuGroup`、`MenuItemButton`
- 表单与控制：`Input`、`Switch`、`SegmentedControl`、`SegmentedTabs`、`settingsNumberField`、`Tooltip`
- 浮层与定位：`useAnchoredPosition`、`useDismissOnOutsidePointer`、`useModalLayer`、`useAnchoredMaxHeight`
- 列表/视觉：`Toast`、`Tag`、`StateDot`、`TextShimmer`、`observeStickyMenuGroups`、`rankByName`、`focusWithoutRing`
- 图标：`IconChevronDownOutlineRegular`、`IconChevronRightOutlineRegular`、`IconCheckOutlineRegular`、`IconDataOutlineRegular`、`IconCloseFillRegular`、`IconSlidersTwoOutlineRegular` …

> ⚠️ **没有 Slider 基元**（导出表里只有 `IconSlidersTwo*` 图标）。思考强度滑条必须自绘（`<input type="range">` 或 pointer 拖动 + `role="slider"`），或者复用 `SegmentedControl` 做离散档位。这一点直接影响 MCX 滑条的实现方式。

关键 API 形状（`SHELL`）：

- `useAnchoredPosition({ open, anchorRef, panelRef, side="bottom", align="start", gap, margin })` → `{left, top}`：内置滚动/尺寸变化重算、视口钳制（`SHELL@659701`）。
- `useDismissOnOutsidePointer(anchorRef, open, onClose, panelRef)`：`pointerdown` 捕获、判断两个 ref（`SHELL@660527`）。
- `MenuSurface`（`SHELL@649190`）：`forwardRef`，渲染 `[data-menu-material="translucent"]` 表面 + 把 `[data-menu-backing]` 垫片 portal 到 body，并写 `--dsh-menu-anchor` 供 CSS anchor positioning 使用；`compact` 变体把圆角从 `lg` 降到 `md`。

### 4.4 Cordis 插件接口与「怎么拿到 ctx / slots / theme / locale」

客户端插件导出的形状（`MS:1843-1931`、`LABEL:57-74`）：

```js
exports.inject = ["slots", "locale", "theme", "modelDirectories", …]; // 需要的服务名
exports.apply  = (ctx) => { … };                                      // 激活时调用一次
```

- `ctx` 是插件根上下文；**服务名即 inject 名**：`slots`（`REN:1298`）、`locale`、`theme`（`THEME:2029` `ctx.provide("theme", theme)`）、`commandUi`、`modelDirectories`（`MS:999`）、`sessions`、`remote`/`remote.session`、`uiRenderer`（`REN:1869`）。
- 两种取用法：
  - 顶层声明 `inject: [...]` —— 服务未就绪则整个插件 pending（启动审计会报 "pending (waiting for service …)"，`SHELL@920128` 附近 `IZ()`）。
  - `ctx.inject(["a","b"], (scope) => {…})` —— 局部依赖，作用域内取服务（官方用法：`MS:1864`、`MS:1900`）。
- `ctx.effect(fn, label)` 注册随 fiber 卸载的副作用（注册、词典、样式、监听器）；`ctx.on/emit` 事件；`ctx.provide/get` 提供服务。
- 插件被禁用/卸载时：entry 从 Loader 移除 → fiber dispose → effect 逆序执行 → 槽位 registration、词典、样式一起回收（`MODULES:36`、`MODULES:89`）。

### 4.5 host 半边

- 每个客户端插件包仍需一个 host 入口，即使它没有任何宿主行为——官方注释：`/** Host plugin body — no host-side behavior for this surface plugin. */ function apply() {}`（`MS-IDX:1-11`），原因是要出现在 `cordis.yml`/Loader 里，浏览器半侧通过 `package.json` 的 `dsh.client` 声明被发现（同文件注释）。
- 用户侧启用方式：bundle 的 `cordis.patch.yml` 插入一条 Loader row（本仓库约定见 `CONV-DOC` §1 的 `dsh.bundle.patch`）。
- 因此一个最小可用的第三方模型位插件 = `package.json`（`dsh.client` + `dsh.bundle.patch`）、`index.js`（空 apply）、`client.js`（槽位注册）、`cordis.patch.yml`（插行）、`locale/{zh,en}.json`。

---

## 5. design token 与主题

### 5.1 token 的来源文件

`ui-theme` 把 8 张全局样式表挂在 `<head>`（`THEME:1431-1455` 的 `STYLES` 数组 + `installThemeStyles`），全部是 `body`/`:root` 级 CSS 变量：

| 表 | 内容 | 证据 |
|---|---|---|
| `base.css` | 字体栈、`--ds-ease-in-out`、`--ds-transition-duration{,-fast(-.1s),-slow(-.3s)}`、`--dsw-radius-xs/sm/md/lg/xl/panel`(4/8/12/16/20/28) | `THEME:1407` |
| `corner-shape.css` | `--dsw-corner-shape: superellipse(1.5)`（macOS 连续圆角） | `THEME:1410` |
| `design-platform.css` | 静态色阶 `--dsw-static-*` + 语义层 `--dsw-alias-*`/`--dsw-specific-*`，亮色在 `body`，暗色整块在 `body[data-ds-dark-theme]` | `THEME:1413` |
| `focus.css` | `--dsw-focus-ring-width:2px`、`--dsw-focus-ring-color`；指针模态下抑制焦点环 `html[data-input-modality=pointer]` | `THEME:1416` |
| `scrollbar.css` | `--dsh-scrollbar-*` | `THEME:1422` |
| `gradient-shadow-text.css` | `--dsw-shadow-lv1/2/3`、`--dsw-elevation-stroke/-panel/-prominent/-soft`、`--dsw-menu-backdrop-filter`、`--dsw-font-*` 排版尺度 | `THEME:1425` |
| `onboarding.css` / `shiki.css` | 场景专用 | `THEME:1419`、`THEME:1428` |

### 5.2 菜单/浮层/动效相关 token（自绘面板直接用这些）

| 用途 | token | 值/来源 |
|---|---|---|
| 浮层背景（毛玻璃） | `--dsw-menu-surface-fill` | 亮 `#f8f9fa94` / 暗 `#43454a73`；darwin 覆盖为 `#f8f9faf0`、`#303136f0`（`THEME:1413` 末尾 `html[data-platform=darwin]`） |
| 毛玻璃模糊 | `--dsw-menu-backdrop-filter` | `blur(40px) saturate(150%)`（`THEME:1425`） |
| 浮层描边（0.5px） | `--dsw-elevation-stroke-color` → `--dsw-elevation-stroke` | `0 0 0 .5px <color>`；菜单打开时改用 `--dsw-alias-border-l1`（模型位自己这么设：`MS:1060` 的 `.htuFrW_menu`） |
| 阴影档位 | `--dsw-elevation-soft` / `-panel` / `-prominent` | 模型菜单用 `prominent`（`MS:1060`）；composer 卡片用 `soft`（`CONV:18901`） |
| 圆角 | `--dsw-radius-md`(12) 行 / `--dsw-radius-lg`(16) 浮层 / `--dsw-radius-panel`(28) 卡片 | `THEME:1407`；`MenuSurface` compact 用 `md`（`SHELL-CSS@16422`） |
| 吸顶分组标题底 | `--dsw-alias-menu-group-header-fill` | 亮 `#f8f9faf0` / 暗 `#303136f0`（`THEME:1413`） |
| 文本色 | `--dsw-alias-label-primary/-secondary/-tertiary/-caption/-dimmed` | 模型名 400 字重、`font-size:13px`（`MS:1060`） |
| 图标色 | `--dsw-alias-menu-icon` | 下钻箭头用它（`MS:1060` 的 `.htuFrW_cellChevron`） |
| hover | `--dsw-alias-interactive-bg-hover` | 行 hover / 触发按钮 hover（`MS:1060`） |
| 焦点环 | `--dsw-focus-ring-color`、`--dsw-focus-ring-width` | `MS:1060` 的 `trigger:focus-visible` |
| 滚动条 | `--dsh-scrollbar-thumb` / `-hover` | 菜单内被重指到 `--dsw-alias-scrollbar-bg-l2`（`MS:1060`） |
| 动效 | `--ds-transition-duration`(.2s) / `-fast`(.1s) / `--ds-ease-in-out` | `THEME:1407`；官方 chevron 旋转写死 `.12s`（`MS:1060`） |

### 5.3 亮/暗切换机制

1. **首屏（脚本前）**：宿主在 index 里注入 `<style>` 上色 + 内联脚本设置 palette，避免白闪：
   ```js
   document.documentElement.dataset.dsThemeSource = preference   // light|dark|system
   document.body.toggleAttribute('data-ds-dark-theme', dark)
   document.body.style.setProperty('--dsh-content-font-size', '14px') // 字号/字体也在这里
   ```
   证据：`THEME-HOST:130-160`（`bootThemeStyle` / `bootThemeBodyScript`）。
2. **运行期**：`ThemePresenter.apply(snapshot)` 写 `documentElement.style.colorScheme`、`data-ds-theme-source`、`body[data-ds-dark-theme]`、字号/字体变量，并在最后替换 `active.tokens` 的变量（`LAYOUT:505-575`）。
3. **主题服务**：`ctx.theme` 提供 `getTheme()`（快照）、`setTheme()`、`theme/change` 事件、`overrideTokens(source, tokens)`（`THEME:1835-1855`）。
4. **插件正确姿势**：需要改 token 时调用 `ctx.theme.overrideTokens(source, { '--token': { light, dark } })`，返回 disposer；层按 seq 叠加，同 source 再调用会替换该层（`THEME:1835-1855`）。参考实现 `ENH:1308`（`applyTokens`）与 `ENH:3122`（`inject: ['theme']`）。
5. **判暗的稳定选择器**：`body[data-ds-dark-theme]`（不要用 `.dark` 类名）。另有 `html[data-platform=darwin]`、`html[data-input-modality=pointer]`、`[data-dsh-automatic-focus]`（`THEME:1407`、`THEME:1416`）。

### 5.4 插件注入 CSS 的安全模式（照 `vt-uiux-enhancer` 抄）

1. **单例 style 标签 + 加载器可识别标记**：
   ```js
   const tag = document.createElement('style');
   tag.dataset.plugin = PLUGIN_ID;
   tag.dataset.pluginCss = `${PLUGIN_ID}/vt-interface.css`;   // ENS:1791-1797
   document.head.appendChild(tag);
   // dispose() { tag.remove(); }                             // ENS:1803-1805
   ```
   与 DSH 自己的 CSS Module 注入同构（`MS:1061-1074`、`LABEL:12-22`），加载器卸载时会回收（`MODULES:89`）。
2. **不要抄哈希类名**，用 §2.3 的稳定属性做选择器；确实必须怼组件样式时，用 `:where()` 降优先级 + 只改视觉属性（`ENH:1308-1330` 的注释解释了为什么有些变量必须 `body, body *` + `!important`：DSH 把部分 token 同时声明在 `body` 和 `body *` 上，只写 `body` 不会被继承覆盖）。
3. 亮暗成对写：`body[data-ds-dark-theme]` 分支（`ENH:1315-1329`）。
4. 修改官方 CSS Module 类名规则会随升级失效，属于「一次升级即碎」的技术债；把这类补丁集中在**一个**文件、并让失败可降级（enhancer 的整体 `try/catch` + 诊断面板，`ENH:3127-3134` 是好的防御模板）。

---

## 6. 模型目录与选择 API

### 6.1 三个服务/接口的分工

| 层 | 名字 | 说明 | 证据 |
|---|---|---|---|
| 客户端服务 | `ctx.modelDirectories`（`ModelDirectoryResolver`） | 每会话共享目录控制器；`/model` 弹窗与 composer 共用 | `MS:987-1045` |
| 目录数据 | `ctx.remote.session.modelCatalog()` | Host 侧一次性返回「按 provider 分组的可用模型 + 默认选择 + 失败分组」 | `MS:752`、`SC:392-394` |
| 提交选择 | `ctx.remote.session.selectModel({sessionId, provider, model, reasoningEffort?})` | Host 侧写入会话选择 | `MS:861-900`、`SC:368-370` |

- 服务名与依赖：`class ModelDirectoryResolver extends Service { static inject = ["sessions","remote","remote.session"]; constructor(ctx){ super(ctx,"modelDirectories") … } }`（`MS:987-1000`）。
- 每会话惰性解析：`directoryFor(sessionId)` 需要 `sessions.scope(sessionId)` 与 `sessions.binding(sessionId)`，找不到会 **fail loud**（`MS:1025-1032`）；目录随会话作用域 dispose（`MS:1036-1043`）。
- 已寻址的 subagent 会话**不提供**选择入口（`available = sessions.subagentAddress(sessionId) === undefined`，`MS:1912-1916`；`assertAvailable` 抛错见 `MS:869-870`）。

### 6.2 目录数据形状（Host 契约）

`session/modelCatalog` 的返回 schema（`REMOTES:14353-14380`）：

```jsonc
{
  "default": { "provider": "deepseek-official", "model": "deepseek-flash", "reasoningEffort": "medium" },
  "routableProviders": ["deepseek-official", "deepseek-account"],
  "groups": [
    { "id": "deepseek-official", "name": "DeepSeek",
      "models": [
        { "id": "deepseek-flash", "name": "DeepSeek-V4.1-Flash", "description": "…",
          "reasoning": { "efforts": [ { "id": "low", "name": "低", "description": "…" }, … ],
                         "defaultEffort": "medium" } }        // reasoning 可缺省
      ] },
    { "id": "deepseek-account", "name": "DeepSeek Account", "models": [ … ] }
  ],
  "failures": [ { "id": "some-provider", "name": "…", "message": "…" } ]   // 加载失败但列出来、不可选
}
```

- `reasoning` 是**逐模型**的，可能整个缺省（适配器没提供推理元数据）→ 官方就不显示 Effort 行（README.zh.md:44/111；`MS:1205`）。
- `efforts` 的元素是 `{id,name,description?}`；宿主在前端只做展示，**不接受任意输入值**（README.zh.md:111）。

### 6.3 只读拿到「当前模型 / 可用模型 / 每个模型的强度档位」

```js
// 任意带 slots 能力的插件，只要注入 modelDirectories（或直接 ctx.get）
ctx.inject(["modelDirectories"], (scope) => {
  const directory = scope.modelDirectories.directoryFor(sessionId); // 与官方同一个实例
  directory.load();                                                // 拉目录（幂等、共享 in-flight）

  const unsub = directory.store.subscribe(() => {
    const s = directory.store.getSnapshot();
    // s = { current, routable, groups, failures, status, pending, error, retainedEffort }
    //   current: { provider, model, reasoningEffort? } | null   ← 当前选择（Host 投影 + 本地 pending）
    //   groups:  同上面 catalog.groups                          ← 可用模型（含 reasoning.efforts）
    //   failures: 加载失败的分组（列出但不可选）
    //   status:  'idle' | 'loading' | 'selecting' | 'ready' | 'error'
    //   pending:  正在提交的 selection | null（行内 spinner 的依据）
    //   retainedEffort: 目录里已没有该模型时保留的强度名（仅展示）
  });
});
```

- store 形状与语义：`MS:814-828`（初始）、`MS:1000-1050`（`syncInputs` 合成）；`retainedEffort` 见 `MS:1035-1040`。
- 只读不改：完全够用，无需调用 `select`；`load()` 失败要自己 catch（`MS:1868-1873` 官方也只是 `.catch(() => {})`）。
- 目录缓存与刷新：`ModelCatalogDirectory` 在 `llm/adapters-updated`、`settings/document-updated`、`credentials/*` 事件上重拉（`MS:1000-1020`），`connection/reset` 时丢弃投影（`MS:1005-1012`）。**我们的面板只要订阅 store 就自动跟随**。

### 6.4 提交选择（滑条/列表点击都要用它）

```js
const result = await directory.select({ provider, model, reasoningEffort }); // MS:861-900
// 内部：sessions.selectModel({sessionId, provider, model, reasoningEffort?})   // MS:876-882
//      → RPC "session/selectModel"（参数 schema REMOTES:14884-14892，返回 {selected:{…}} REMOTES:14894-14902）
```

- `reasoningEffort` 省略即「用模型默认强度」；`nextEffort` 缺省回落到 `catalog.reasoningFor(selection)?.defaultEffort`（`MS:872-874`）。
- 并发保护：目录内 `generation` 计数器，旧响应不覆盖新结果（`MS:838-841`、`MS:884-886`）。
- 失败呈现：`result.ok === false` 时 store 进入 `status:'error'`，`error` 形如 `"code: message"`（`MS:892-900`）；`session/writer-held` 有专门文案「当前会话已被占用…」（`MS:1426-1431`、`MS:1759`、`MS:1892-1896`）。
- 提交期间：`pending` 非空 → 官方禁用行、把勾选/箭头换成 `StateDot`（`MS:1204-1205`、`MS:1655-1680`、`MS:1523`）。自绘面板必须复刻这个「pending 态」，否则用户会重复点击。

### 6.5 provider 分组与排序

- 排序函数（两处入口共用）：`orderModelProviders(groups)` = `deepseek-account` 第一、`deepseek-official` 第二、其余保持目录原序（`MS:1108-1110`），使用 `toSorted`（不改原数组）。
- 展示名：`deepseek-account` 用本地化词典 `provider.account`（"DeepSeek 账号"），其余用 catalog 的 `name`（`MS:1170-1177`）。
- 分组内模型顺序 = catalog 顺序；搜索排序用 `rankByName`（前缀 > 匹配分 > 目录序，`MS:1187-1192`，基元实现见 primitives）。
- `/model` 弹窗与 composer 共用 `orderModelProviders`（`MS:1801-1827` 的 `optionsOf`）。

---

## 7. 改造方案评估与实现要点

### 7.0 共同前提

- 无论哪个方案，**不要修改 `app.asar`**，也不要把官方包 fork 进仓库（许可证允许但升级会痛苦）。第三方持久化的唯一形态是「本仓库 `plugins/*` 包 + cordis patch 插行」。
- 面板数据一律走 `ctx.modelDirectories`（§6.3/6.4），提交一律走 `directory.select()`。这样与 `/model` 命令、官方 seat、多入口天然一致（README.zh.md:76）。
- 视觉一律用 §5 的 token + `MenuSurface`/`MenuGroup`/`Input` 基元；交互规格（两层面板、底边锚定生长、320ms 回缩、滑条几何、键位）照 [`mcx-model-slider.md`](./mcx-model-slider.md)。

### 7.1 方案 A：整控替换 `conversation.input.model`（推荐）

**可行性：高。** 机制成立的两个关键事实：

1. `single` 槽位允许不同 priority 共存，priority 最小者渲染（`SHELL@485026` 的 `register` + `REN:1173-1174`）。
2. 注册不检查「槽位声明者是谁」，只检查「槽位是否已被声明」（同上）。因此第三方可注册进 conversation 包声明的槽位。

**实现要点**

```js
// client.js 骨架（与官方 MS:1903-1923 同构）
const inject = ["slots", "modelDirectories", "sessions", "locale"];

function apply(ctx) {
  const NS = "vt-model-chip";
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), `${PLUGIN_ID}: dict`);

  ctx.inject(["slots", "modelDirectories", "sessions"], (scope) => {
    const models = scope.modelDirectories;
    const sessions = scope.sessions;

    scope.slots.inject("conversation.input.model", () => scope.slots.register({
      name: "conversation.input.model",
      priority: -1,                 // ← 遮蔽官方 priority 0
      locale: NS,                   // → 组件拿到 t
      inject: (sessionId) => {
        const directory = models.directoryFor(sessionId);
        const available = sessions.subagentAddress(sessionId) === undefined;
        return {
          available,
          directory: directory.store,            // 直接给 store（用 useSyncExternalStore 订阅）
          load: () => { if (available) directory.load().catch(() => {}); },
          select: (sel) => available ? directory.select(sel) : Promise.resolve(undefined),
        };
      },
    }, ModelChip));
  });
}
```

组件侧：

```js
function ModelChip({ locked, available, directory, load, select, t }) {
  const state = useSyncExternalStore(directory.subscribe, directory.getSnapshot);
  const [open, setOpen] = useState(false);
  const [layer, setLayer] = useState("slider");   // 'slider' | 'list'
  const triggerRef = useRef(null), panelRef = useRef(null);
  const pos = useAnchoredPosition({ open, anchorRef: triggerRef, panelRef,
                                    side: "top", align: "end", gap: 8, margin: 12 });
  useDismissOnOutsidePointer(triggerRef, open, () => setOpen(false), panelRef);
  if (!available) return null;                     // 与官方一致（MS:1318）
  …
}
```

必须自己实现清单（照着官方源码抄最快）：

| 项 | 官方参考位置 | 备注 |
|---|---|---|
| 触发器 aria（`aria-label`/`haspopup`/`expanded`/`controls`/`busy`）+ `data-selection-focus` | `MS:1460-1503` | 无障碍名称要含当前模型与强度 |
| root 面板内容 | `MS:1535-1572` | 改成 MCX 的「模型名行 + 滑条」 |
| 模型列表（搜索、分组、吸顶标题、高亮、滚动定位） | `MS:1574-1680`、`MS:1262-1275` | 或直接复用 `MenuGroup`+`rankByName` |
| 键位（Esc/Shift+Tab 退层、↑↓、Enter/Tab、搜索内循环） | `MS:1362-1414` | MCX 版键位以 mcx 文档 §5 为准 |
| pending 态（禁用 + spinner 换勾选） | `MS:1204-1205`、`MS:1655-1680` | |
| 失败（Toast 锚到 `[data-composer-card]` 或面板内错误条） | `MS:1720-1726`、`MS:1626-1641` | |
| 窄容器退化（图标代替文字） | `CONV:18872-18877` + `MS:1060` 的两个 CSS 变量 | 可用 `container-type` + `@container` 纯 CSS 简化 |
| 强度滑条 | **官方没有**，需自绘 | 档位来自 `model.reasoning.efforts`；无 reasoning → 不渲染滑条 |

**风险**

| 风险 | 说明 | 缓解 |
|---|---|---|
| 丢失 `conversation.input.model.label` 装饰 | 官方 1017 角标、未来任何名称装饰都不再出现在 trigger/root/列表（§1.1） | 接受（自绘名称 + 自己的徽标机制）；或走 A2 |
| 依赖官方插件存在 | `modelDirectories` 服务与 `conversation.input.model` 声明都由 ui-model-selection 提供 | 用 `ctx.slots.inject` / `ctx.inject` 挂起等待；插件被禁用时我们自动不渲染，不报错 |
| 版本脆弱 | 槽位名、props 名、`directoryFor` 签名、`single` 遮蔽语义任一变化都会碎 | 只依赖 §2.3/§6 的稳定面；把适配层收敛在单个文件；在 `engines.dsh` 固定 `>=0.2.1-rc.5 <0.3.0` |
| 双份模型选择器实现漂移 | 官方与我们的 pending/失败/刷新语义可能分叉 | 不自建状态机缓存：每次渲染都从 `directory.store` 读；提交只调 `directory.select` |
| 优先级语义若被收紧（未来禁止跨插件遮蔽） | 目前无任何这类限制 | 预置 A2 作为回退（同一组件、只换挂载点与隐藏方式） |

**工作量估算**：3 个文件（`client.js`、`locale`、`cordis.patch.yml`）+ 1 个滑条组件；核心状态机可从官方 `ModelSelect` 移植（约 500 行 JSX/逻辑，砍掉 effort 列表）。

### 7.2 方案 A2：隐藏官方 seat + 在 `conversation.input.right` 放自己的 chip（回退方案）

**可行性：中高。** 不抢槽位、不动官方组件。

- 自己的 chip 注册进 `conversation.input.right`（list/session，`CONV:20116-20119`），渲染位置在官方 seat **左侧**（`CONV:19278` 的顺序）。用 CSS `order` 或绝对定位把它摆到官方位置。
- 隐藏官方 seat：`[data-slot="conversation.input.model"]{display:none !important}`（`display:contents` 上设 `display:none` 生效，且会把官方 trigger 从 a11y 树与 tab 序列里移出，官方组件仍挂载、仍持有 label 子槽位声明）。
- 优点：不需要 priority 遮蔽；`conversation.input.model.label` 仍然存在（第三方名称装饰在列表里照常工作——**但我们的列表是自绘的，用不上**，所以只对「别人也装饰官方 seat」有意义）；官方 state 机继续运行（对无头验证/截图比对有用）。
- 代价/风险：多一个 CSS 选择器契约（`[data-slot]` 由渲染器保证，`REN:1122-1126`，风险低）；同排出现两个模型控件（一个隐藏）容易在 DOM 审计/自动化测试里造成困惑；`conversation.input.right` 是 list 槽位，需要 `id` 才能插入（`SHELL@485026` 的 `register` 对 `list` 强制 `id`）；若官方 seat 未来移出该行，隐藏选择器失效会导致「双 chip」。

### 7.3 方案 B：DOM 级拦截 + 自绘浮层

**可行性：中。** 技术上全部关键点都有稳定钩子：

1. 定位 trigger：`[data-composer-card] button[aria-haspopup="menu"][aria-expanded]`（`CONV:19188` + `MS:1494-1503`）。
2. 拦截点击：`window.addEventListener('click', handler, true)` → `stopPropagation()` + `preventDefault()`，自绘面板；React 18 的事件委托挂在 root container 上，**document capture 阶段先于容器**，所以能吃掉官方 onClick。若要连 `pointerdown`/`keydown(Enter/Space)` 一起拦，要拦三处。
3. 拿 sessionId：`trigger.closest('[data-conversation-session]').dataset.conversationSession`（`CONV:17931`；官方自己就这么读，`CONV:19583-19587`）。
4. 提交：`ctx.modelDirectories.directoryFor(sessionId).select({...})`（不需要原生菜单）。
5. 隐藏原生菜单：不要让它开：拦截成功后官方 `open` state 不会变；但若某条路径漏拦（键盘、程序触发、自动化点击），会出现双菜单 → 需要兜底 `Escape` 或 CSS 隐藏 `[data-menu-material]`。

**风险（按严重度排序）**

| 风险 | 说明 |
|---|---|
| 事件冲突/漏拦 | React 合成事件、键盘（Enter/Space 触发 `click`）、`aria-expanded` 与真实面板不一致 → 屏幕阅读器说谎；双菜单是可见事故 |
| 焦点与键盘 | 官方把焦点管理写在组件里（`MS:1240-1315`、`MS:1415-1418`），拦截后要整份重写，且 `Escape` 会先被官方 `onRootKeyDown` 抢走（`MS:1360-1368`） |
| 稳态语义 | 官方 OnBlur/mousedown 外部关闭逻辑（`MS:1224-1235`）仍挂在 trigger 上，和自绘面板互相干扰 |
| 版本脆弱 | 触发器结构/React 事件系统/属性变化都会让拦截点失效；这是「最脆」的一层 |
| 放弃官方实现资产 | pending、失败重试、搜索焦点、吸顶标题、Toast 全部重写，但**这些在方案 A 里本来也要写**，所以 B 相对 A 没有省工，只多了 hack |

结论：**B 只在 A 不可行时使用**（例如未来 DSH 禁止跨插件遮蔽槽位）。若必须用 B，建议退化到 A2 的混合形态：保留官方 trigger（不拦点击，只是 CSS 隐藏官方菜单不可行），改为「不拦官方、只加自己的入口」——那其实就是 A2。

### 7.4 方案 C：仅 CSS 换皮

**可行子集**：改颜色/圆角/间距、隐藏某些行（`display:none`）、把 root 面板两行视觉重排（`order`/`flex-direction`）、给 trigger 换图标。
**不可能**：把「推理等级下钻列表」变成「就地滑条」；把「点击 chip 打开 root → 再点模型行」改成 MCX 的第一层布局；增加第二级面板的自定义内容（无 DOM 可挂）。
**结论**：不能作为独立方案；只能作为 A/A2 的**视觉收尾**（且用 §5.4 的注入方式）。若排期只允许 CSS，那就等于「不改交互」，不满足需求。

### 7.5 组合建议（落地顺序）

1. **A 的骨架先跑通**：注册 priority `-1`，组件先渲染「模型名 · 强度」静态文本 + 点击打开**空面板**；验证遮蔽生效、官方组件不再渲染、`/model` 仍可用。
2. 接 `directory.store`：面板里显示当前模型、provider 分组列表、搜索；点击行提交 `select()`（此时还没有滑条，用离散按钮先跑通提交链路）。
3. 加滑条：`model.reasoning.efforts` → 档位；拖动预览 + 松手提交（提交用 `select({provider, model, reasoningEffort})`）；无 reasoning 隐藏。
4. 加 MCX 动效与键位（照 mcx 文档 §3/§5）；底边锚定高度动画需要自己在面板上做 `height` 过渡（DSH 无现成基元）。
5. 视觉收尾：token 对齐（§5.2）、暗色、窄容器、focus ring。
6. 若发现遮蔽语义在目标版本变化 → 切 A2（组件不用改，只换挂载点与隐藏规则）。

---

## 8. 本地验证（隔离 profile，不影响用户正在用的 GUI）

### 8.1 先确认用**哪一个** `dsh`

| 入口 | 版本 | 说明 |
|---|---|---|
| `/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh` | **0.2.1-rc.5** | 应用内置 CLI，实际执行 `app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js`；**验证 rc.5 行为必须用它** |
| `dsh`（PATH，`~/.nvm/.../bin/dsh`） | 0.1.5-rc.1 | 全局旧版，解析的是另一套包；用它起服务器验证的是 0.1.5 的 Web 客户端 |

已实测：内置 CLI `--version` → `0.2.1-rc.5`；PATH 的 `dsh --version` → `0.1.5-rc.1`。

### 8.2 隔离手段（三条同时用）

1. **`DSH_HOME` 重定向**：profile 在 `$DSH_HOME/profiles/<name>`（`CLI-README:11`），会话、凭据、storages 都在 `$DSH_HOME` 下。用 `/tmp/...` 完全隔离，不碰 `~/.dsh`。
2. **自定义 profile 名**：`--profile mcx-dev`（不要把 `web`/`desktop` 当试验田；`desktop` 名字被保留，CLI 会拒绝，`CLI-README:20`）。首次用 `--from-default-profile web` 从随附模板复制一份（`CLI-README:12`）。
3. **不抢端口/不抢浏览器**：`--port 0`（系统分配）或一个未用端口；`--no-open` 不打开默认浏览器；绝不要用用户 GUI 的 `59544`。

### 8.3 插件安装落点与机制（本节全部为实测结论）

- profile 目录（`--from-default-profile web` 生成，实测）：`$DSH_HOME/profiles/<name>/` 下 `package.json`、`cordis.patch.yml`、`cordis.yml`、`pnpm-workspace.yaml`；`node_modules/`、`pnpm-lock.yaml` 在首次安装后出现。`package.json` 形如：

  ```json
  { "name": "dsh-profile-mcx-dev", "private": true, "dependencies": {},
    "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"] } } }
  ```

  注意：用户现用的 `~/.dsh/profiles/web/package.json` 额外带 `"patchReload": "live"`；**新建的自定义 profile 默认没有它 → 没有 patch HMR**，改 `cordis.patch.yml` 要重启（或自己加 `patchReload: live`/启用 `dsh-hmr`，`CLI-README:37`）。
- 安装 = 在 profile 目录里 `pnpm add`（`dsh plugin --profile <name> <pnpm args>` 转发，`CLI-README:18`；应用内置 CLI 用的是自带 pnpm `11.28.5`）。**实测** `add link:<本地插件目录>` 之后：
  - `dependencies` 增加 `"<插件名>": "link:/abs/path"`；
  - `dsh.profile.bundles` **自动追加**该 bundle 名（与 `PM-README:40`「安装新组合包默认启用」一致）；
  - `--dump-config` 里出现该 bundle 的 patch 行（实测 `- id: vt-quote-bar` / `name: dsh-vt-quote-bar`）。
  - 本地目录用 `link:`/`file:` spec（`PM-README:44`）；服务式安装（`installBundle`）还会做版本兼容与构建审批，CLI 路径则以退出码与 pnpm 输出为准。
- 组合顺序（低→高优先级）：`dsh.profile.bundles` 各 bundle 的 patch → profile `cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` → `--patch` 覆盖层（`CLI-README:41-45`）。**开发期用 `--patch` 临时开关行、`--dump-config` 校验，不必改任何共享文件。**

### 8.4 可执行验证序列（已逐步实测，复制即用）

```bash
APP="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
export DSH_HOME=/tmp/dsh-mcx-home          # 隔离 home，绝不指向 ~/.dsh
PLUGIN=<repo>/plugins/vt-mine-models   # 本地插件包目录

# 0) 确认版本（应为 0.2.1-rc.5；PATH 上的 dsh 是 0.1.5-rc.1，别用）
"$APP" --version

# 1) 从随附 web 模板创建一个独立 profile，只 dump 不启动（实测：创建目录并打印组合树）
"$APP" --profile mcx-dev --from-default-profile web --dump-config >/dev/null

# 2) 安装本地插件（实测：写入 link: 依赖 + 自动追加 bundles + 组合树出现该行）
"$APP" plugin --profile mcx-dev add "link:$PLUGIN"

# 3) 不启动，先校验组合树里确实有我们的行
"$APP" --profile mcx-dev --dump-config | grep -n -A4 "vt-model-chip"

# 4) 启动隔离实例（端口 0 让系统分配，--no-open 不动用户浏览器）
"$APP" --profile mcx-dev --port 0 --no-open      # 前台运行，Ctrl-C 结束
#   实测输出一行： dsh web: http://127.0.0.1:<port>/?token=<token>
```

浏览器侧验证（另开终端，用 playwright/CDP 打开上一步的 URL，**不碰用户 59544**）：

```
打开 URL → 进入会话触发 composer → 点模型 chip
① 官方选择器未渲染：[data-slot="conversation.input.model"] 下只有我们的节点（方案 A）
   或官方节点被 display:none（方案 A2）
② 面板 position:fixed 且跟随触发器：滚动会话、改窗口宽度，面板不脱位
③ 交互层级：点模型名进列表、Escape 逐层退出、焦点回到 chip、Tab 不逃出面板
④ 一致性：提交后 chip 文案/无障碍名更新；打开 /model 弹窗看到同一选择
⑤ 暗色/亮色：切换主题后浮层背景、描边、文字色都跟随（§5）
```

**关于模型目录能否加载**：目录依赖 Host 侧的 provider 凭据（`session/modelCatalog` 背后要求 provider 可用）。隔离 `DSH_HOME` 是空的，因此默认只会看到「请选择模型 / 暂无可用模型」。两级验证策略：

- **T1（结构验证，零凭据）**：跑上面 1-4，验证 DOM/槽位/面板/键盘/定位。目录为空也足够验证 ① ② ③。
- **T2（真实目录与提交，需要凭据）**：把宿主凭据复制进隔离 home（**只读源文件，不改用户文件**）：
  ```bash
  mkdir -p /tmp/dsh-mcx-home
  cp ~/.dsh/.credentials.yaml /tmp/dsh-mcx-home/.credentials.yaml   # provider 可用性
  cp ~/.dsh/.env             /tmp/dsh-mcx-home/.env 2>/dev/null      # 如使用 env 型凭据
  # 或直接给隔离进程一个独立 key：
  #   DEEPSEEK_API_KEY=... "$APP" --profile mcx-dev --port 0 --no-open
  ```
  这样会得到真实 catalog（provider 分组、reasoning.efforts），可以验证滑条档位与 `selectModel` 提交。所有写入都落在 `/tmp/dsh-mcx-home/sessions`，与用户会话隔离。

**开发循环**：

- 客户端 bundle 改动：`pnpm run build`（产出 `lib/client.js`）→ 重启隔离实例；或依赖宿主 HMR（`dsh-hmr` 监视 profile manifest/patch，`CLI-README:37`）。注意浏览器侧模块 revision 由 **mtime/ctime/size** 派生（`MODULES:79`），同尺寸重写若 mtime 未变可能不生效 → 改完重启最稳。
- 只改 patch/启用状态：`--dump-config` 立刻能看结果；线上 profile（启用 HMR 时）会热重组。
- 结束清理：`kill` 背景任务，`rm -rf /tmp/dsh-mcx-home`（临时目录，不在仓库里）。

---

## 9. 待确认与已知限制

1. **遮蔽语义的长期保证**：当前实现明确支持「不同 priority 遮蔽」（错误文案与 `entriesOfSlot[0]` 行为），但 README 没把它写成公共契约。建议在插件里把「注册 priority」与「挂载点」收敛为一处配置，便于将来切 A2。
2. **`conversation.input.model.label` 与整控替换互斥**（§1.1）：这是 rc.5 的 slot 所有权模型决定的，不是实现偷懒。
3. **无 Slider 基元**（§4.3）：滑条自绘，需自行保证 `role="slider"`/`aria-valuemin|max|now|text`、方向键步进、`prefers-reduced-motion`。
4. **`reasoning` 可缺省**：无 intensities 的模型必须整块隐藏滑条（不能显示禁用滑条），否则与官方 `/model` 行为不一致。
5. **subagent 会话无选择入口**（§6.1）：自绘组件也要遵守，用 `sessions.subagentAddress(sessionId)` 判断并 `return null`。
6. **多写句柄**：同一会话被其他 DSH 实例持有（如桌面端 + `dsh web`）时提交会失败并提示退出其他实例（`MS:1429`、`MS:1759`）。验证时要避免同时开两个实例操作同一会话。
7. **菜单 z-index 1100** 与 composer 的 sticky/z-index 体系（`CONV:17384` 内 `.composerSeat{z-index:7}`、`:has([data-trigger-menu]){z-index:9}`）：自绘面板若走 portal 需 ≥1100，若走非 portal 需处理 sticky 层叠上下文。
8. **`data-model-compact`** 是 JS 测宽写入的（`CONV:18872-18877`），纯 CSS 容器查询能让 `@container` 生效，但官方逻辑用 row 的可用宽度精确判断，自绘组件建议直接用 `@container` 简化并接受 ±1 档差异。

---

## 10. 证据索引（按主题）

| 主题 | 关键证据 |
|---|---|
| 槽位声明 / 渲染 | `CONV:20092-20135`、`CONV:19278`、`MS:1903-1923` |
| 槽位核心语义（遮蔽/去重/胜者） | `SHELL@485026`（`SlotCore.register`）、`SHELL@494151`（模块导出）、`REN:1173-1174` |
| 组件 props 装配 | `REN:738-760`、`REN:766-790` |
| outlet 包装（`data-slot`） | `REN:1122-1126` |
| 渲染授权（renderSlot 所有权） | `REN:342-360` |
| 触发器 DOM | `MS:1478-1525`、`MS:1459-1463` |
| 菜单 DOM / portal / 定位 | `MS:1526-1571`、`MS:1285-1314`、`MS:1719`、`MS:1141-1145` |
| 模型列表 / 搜索 / 分组 | `MS:1574-1680`、`MS:1187-1192`、`SHELL@657338`、`SHELL@657667` |
| 强度列表 | `MS:1204-1219`、`MS:1686-1716` |
| CSS Module 类名表 | `MS:1060`（CSS 全文，单行）、`MS:1069-1099`（名映射） |
| 菜单基元实现与材质 | `SHELL@649190`、`SHELL-CSS@16369`、`SHELL-CSS@16519`、`SHELL-CSS@16590` |
| 基元清单（含 useAnchoredPosition 等） | `SHELL@865xxx`（export 对象）、`SHELL@659701`、`SHELL@660527` |
| bundle 装载 / 静态模块表 | `MS:1-8`、`SHELL@917644`、`SHELL@917830`、`SHELL@920128`、`MODULES:73`、`MODULES:34`、`MODULES:51` |
| 官方 slot 用法范例 | `LABEL:12-22`、`LABEL:34-52`、`LABEL:57-74`、README.zh.md:50-54 |
| 目录/选择 API | `MS:713-800`、`MS:804-1050`、`MS:987-1045`、`REMOTES:14353-14380`、`REMOTES:14884-14902`、`SC:368-394` |
| token / 主题 | `THEME:1407`、`THEME:1413`、`THEME:1416`、`THEME:1425`、`THEME:1431-1455`、`THEME:1835-1855`、`THEME-HOST:130-160`、`LAYOUT:505-575` |
| 插件 CSS 注入范式 | `ENH:1791-1806`、`ENH:1308-1330`、`ENH:3122-3135` |
| CLI / profile / 安装 | `CLI-README:11-20`、`CLI-README:37-48`、`PM-README:40-52`、`CLI-README` 对应的 0.2.1 帮助输出 |
| 插件包约定（本仓库） | `CONV-DOC` §1/§2.1/§7 |
