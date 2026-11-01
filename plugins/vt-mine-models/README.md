# dsh-vt-mine-models · 模型选择器（MineCodex 风格）

把输入框里的模型选择换成 MineCodex 的**两段式面板**：点开先看到当前模型与**思考强度滑条**，
点模型名再展开**带厂商图标的模型列表**。数据仍走 DSH 自己的模型目录，和 `/model` 同源。

## 它改了什么

- **接管输入框的模型位**。插件以 `priority: -1` 注册进 `conversation.input.model` 槽位，
  遮蔽官方 `ModelSelect`（官方注册优先级是 `0`，槽位规则是 lowest renders）。chip 还在同一个
  位置、同一套尺寸上，窄容器下的文字隐藏也沿用宿主变量，只是点开后看到的是本插件的面板。
  **禁用或卸载插件即完全恢复官方选择器，没有残留**：官方注册一直都在；插件不改官方组件的
  DOM、不写配置，注入的 `<style>` 随模块卸载一起回收。
- **第一段是思考强度面板**（点 chip 后先出现这个，不是模型列表）：
  - 顶部居中一行当前档位名，用强调蓝（`state-business-primary`）；
  - 中间一行「厂商图标 + 模型名 + 右 chevron」，点击它才进入模型列表；
  - 底部一条自绘滑条，档位来自该模型的 `reasoning.efforts`；模型只声明了 provider 默认档时，
    第一档显示为 `Default`。只有一档时显示「当前模型没有可调的思考强度」，不画假滑条。
- **第二段是模型列表**：点模型行进入。列表**覆盖在面板上、底边锚定向上生长**，按 provider
  分组（DeepSeek 账号 → DeepSeek 官方 → 目录顺序），组标题吸顶；模型**超过 4 个**时顶部出现
  搜索框（匹配 + 前缀优先排序，无结果显示空状态）；当前模型带勾选，提交中的模型行显示 pending
  点并禁用，避免重复点击。
- **滑条交互**：拖动时实时预览（`requestAnimationFrame` 合并高频事件），**松手才提交**；
  方向键 / `Home` / `End` 调整档位；提交成功后**面板保持打开**，方便继续调。
- **列表选择模型后关闭面板**，焦点回到 chip。失败（含 `session/writer-held` 会话被占用）时
  在面板内显示错误条并给出可关闭/重试的入口，不静默失败；某个 provider 分组加载失败时
  列表里显示警告条 + 重试。
- **逐层退出**：`Escape`（或列表左上返回按钮）从列表回到强度面板，再按 `Escape` 关闭回 chip；
  列表里选中模型直接关闭。
- **厂商图标**：12 个品牌标记（Anthropic、DeepSeek、Gemini、Grok、混元、Kimi、MiniMax、
  Meta Muse、OpenAI、Qwen、小米 MiMo、智谱），按 provider id + 模型 id + 模型名做小写包含匹配，
  顺序即优先级；未命中用 sparkles 兜底。
- **动效照 MineCodex**：容器高度 320ms、pane 内容 200ms + 10px 位移；`prefers-reduced-motion`
  下所有动画与过渡归零。关闭是瞬时的，原因见 [`DESIGN.md`](DESIGN.md) 的「已知取舍」。
- **没有**这些：Fast / service tier、重置为默认模型、收藏。DSH 没有对应概念，本插件不造
  假状态，也不写任何本地存储。

## 安装

插件装进某个 profile 后**必须重启 dsh**，刷新页面不生效。

### 插件市场（推荐，有更新提示）

在「插件 → 发现 → 添加索引源」里填入市场索引地址：

```
https://vontean.github.io/vt-dsh-plugin/index.json
```

市场属于实验特性：第一次使用要先在插件页开启 **Custom plugin markets**。索引地址必须是 https，
不能带 query 或 fragment。添加后在「界面与外观」分类里找到「模型选择器」点安装；有新版时市场
会显示「有更新」，更新动作等于卸载再安装。

### npm

```bash
dsh plugin --profile <profile> add dsh-vt-mine-models@1.0.0
```

npm 通道要等该版本真的发布到 npm 之后可用（用 `npm view dsh-vt-mine-models@1.0.0` 能查到即可）。
还没发到 npm 时，请用市场索引或 Release tarball：三条通道发出去的是同一份构建。

### Release tarball

到 [Releases](https://github.com/Vontean/vt-dsh-plugin/releases) 下载
`dsh-vt-mine-models-1.0.0.tgz`，然后：

```bash
dsh plugin --profile <profile> add /绝对路径/dsh-vt-mine-models-1.0.0.tgz
```

## 支持的 DSH 版本

`engines.dsh` = `>=0.2.1-rc.5 <0.3.0`。超出范围时 DSH 会在加载前拒绝该插件，不会带着不兼容的
代码跑起来。面板依赖 0.2.1-rc.5 的内部服务与平台基元（`modelDirectories`、`sessions`、
`MenuSurface` / `Input` / `MenuGroup`、`rankByName`、`observeStickyMenuGroups`），
DSH 升级后需要回归一遍，见「已知限制」。

## 安全边界

- 插件代码在**用户进程内**运行，没有沙箱，也没有额外的权限边界；只安装你信任的来源。
- 本插件**不联网、不读写文件、不写 `localStorage`**：Host 半侧（`index.js`）只有空 `apply`，
  没有任何路由与磁盘操作。
- 模型目录与选择提交仍走 DSH 自身的 `modelDirectories`（最终是 `session/modelCatalog` 与
  `session/selectModel`），因此本插件看到的选择和 `/model` 命令、官方选择器完全一致；
  插件被禁用后也不存在需要清理的持久状态。
- 市场索引只指向本仓库发布物（npm 包、Release tarball、commit 固定的 git 子树），不指向第三方来源。

## 已知限制

1. **官方名称装饰失效**：接管父槽位后，官方 `conversation.input.model.label` 子槽位不再渲染，
   依赖它的小装饰（例如 1017 角标）不会出现在 chip、面板或列表里。这是 DSH 槽位所有权模型
   决定的（子槽位只能由声明它的 registration 渲染），不是本插件漏做。
2. **依赖内部分服务与平台模块**：`modelDirectories` 的 store 形状、`MenuSurface` / `Input` /
   `MenuGroup` 的行为、`rankByName` 与 `observeStickyMenuGroups` 的签名任一变化都可能需要跟进。
   `engines.dsh` 已把版本钉在 0.2.1-rc.5 线，但升级后仍需回归。
3. **subagent 会话不显示**：与官方一致，已寻址的 subagent 会话没有模型选择入口（组件返回
   `null`）。主会话与 side chat 正常。
4. **没有 Fast / 重置 / 收藏**：DSH 没有 service tier、也没有「重置为默认」或收藏的数据面，
   本插件不提供这些按钮。
5. **菜单关闭是瞬时的**：DSH 在 macOS 上的菜单材质有一层独立的不透明 backing，做整层淡出会
   闪这层底色，所以关闭沿袭 DSH 其它菜单的瞬时行为。展开/收起两段之间的 320ms 高度动效不受
   影响。

## 开发

| 要做的事 | 先读 |
|---|---|
| 交互流程、动效与尺寸取值、token、已知取舍 | [`DESIGN.md`](DESIGN.md) |
| 图标与第三方许可（厂商商标、Lucide、MineCodex） | [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) |
| MineCodex 的原始交互规格（面板结构、底边锚定、键位） | [`docs/research/mcx-model-slider.md`](../../docs/research/mcx-model-slider.md) |
| DSH 侧槽位、菜单基元、模型目录 API、本地验证方法 | [`docs/research/dsh-model-selector.md`](../../docs/research/dsh-model-selector.md) |
| 包结构、发布与命名硬约定 | [`docs/plugin-conventions.md`](../../docs/plugin-conventions.md) |

实现全部在 `client.js`：样式命名空间是 `vtmm_`，数据只读 `directory.store`、提交只调
`directory.select()`。仓库根另有 `pnpm market`（生成并校验市场索引）与
`node scripts/check-client-bundles.mjs`（客户端 bundle 自检）。

## 验证范围

本地用**隔离 profile + 独立 `dsh web` 实例（0.2.1-rc.5）** 验证过：开合、强度面板 ↔ 列表两段
切换、搜索过滤、`Escape` 逐层退出、滑条键盘改动提交、模型选择提交、亮/暗主题、
`prefers-reduced-motion`，控制台零错误。没有在用户日常使用的桌面端 profile 上逐项实测；
安装后如需回退，禁用或卸载插件即可。
