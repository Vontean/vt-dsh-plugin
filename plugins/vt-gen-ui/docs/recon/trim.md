# 裁剪决策（待确认）

> 上游 0.14.0 全量 fork 后，有几个模块属于「保留成本高、与视觉改造无关」。
> 本文件只记录**推荐**，未执行。确认后按右列动作落地。
>
> 关于「是否把上游源码再复制一份到 `docs/reference/`」：**不复制**。上游包在
> `~/.dsh/profiles/desktop/node_modules/@changfenhuang/dsh-genui` 长期可读，
> 本仓库的 `src/` 就是它的 fork，复制一份只会让 diff 变成两份 3 万行噪音。
> 基线用版本号 + 本文锚定即可。

| # | 模块 | 体量 | 保留成本 | 删掉会失去什么 | 推荐 |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/client/standalone/**` + `lib/assets/standalone-runtime.js` | 1.15 MB 产物 | 一个 tsdown config + KaTeX 字体内联插件 | 「导出单文件 HTML」离线可交互；`.genui.json` 不依赖它，可保留 | **保留**（导出的产品价值高，且不影响聊天内观感） |
| 2 | `src/plugin/fence-feedback.ts` | 701 行 | 与 `agent/turn-stopping`、`llm/stream` 两个宿主编排面耦合（需 peer `@deepseek-ai/dsh-llm`） | 回合内自动纠错：围栏坏了会让模型同回合重发一次 | **保留**（这是体感最强的可靠性能力） |
| 3 | `src/client/achievements.ts` + `achievement-toast.tsx` | ≈300 行 | 一个 body 级 toast 栈 | 12 项探索成就 | **保留**（成本低、纯本地；不喜欢可以后续只删 UI） |
| 4 | `src/client/templates.ts` + `TemplateDrawer` | ≈700 行 | 面板内一个抽屉 | 模板中心：11 类场景模板 + 本地预览 | **保留**（对"教用户怎么用"有用，且是纯视觉可改的模块） |
| 5 | `src/client/icons/icon-data-full.ts` | 5715 行 | 编译时间 + 969 KB 懒加载资产 | 749 个扩展图标名 | **保留**（`icon.name` 是模型可见字段，删名字等于改协议） |
| 6 | `scene3d` / `mermaid` / `diagram` | 资产 4.1 MB + 引擎 | 两个 tsdown config + three/mermaid 依赖 | 3D、流程图、架构图 | **保留**（`type` 在协议里，删了模型引用即失效） |
| 7 | `@deepseek-ai/dsh-client-ui-primitives` 运行时依赖 | 跨包 require | 宿主内部包，升级可能变（`practices.md:35` 不建议） | 现在：按钮/输入等控件、`JsonTree` | **改造时逐步摘除**（自带控件），摘干净后从 `EXTERNALS` 移除 —— 与视觉改造同一批做 |

**结论**：本轮不裁剪。裁掉任何一项都会让「协议兼容」或「产品能力」缺一块，
而它们都不是造成「丑」的原因。视觉改造只在 `src/client/blocks/**` + `*.module.css` 里发生。
