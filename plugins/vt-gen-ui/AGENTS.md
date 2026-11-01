# dsh-vt-gen-ui

DSH 生成式 UI 插件的**视觉重做版**。fork 自 `@changfenhuang/dsh-genui@0.14.0`（MIT）：
保留全部协议与工程能力，只重做视觉层。

**一句话边界：`src/client/**` 的视觉部分是我们的，其余是上游契约，动之前先看 `docs/recon/schema.md` §7.1。**

## 文件路由

| 要做的事 | 先读 |
| --- | --- |
| 搞清楚这插件到底能做什么 | `docs/CAPABILITY-MAP.md` |
| 改某个组件的字段、默认值、渲染位置 | `docs/recon/schema.md`（50 个 type 的字段表 + 行号） |
| 改颜色/字号/间距/圆角/阴影/动画 | `DESIGN.md`（token 与验收判据）→ `docs/recon/visual.md`（现状诊断） |
| 写/查 `mermaid` 图型源码 | `docs/MERMAID-EXAMPLES.md`（32 类可抄样例 + 语法坑，每条都实跑过） |
| 动构建、打包、安装、切换插件 | `docs/recon/scaffold.md` §4–§6 |
| 判断某个字段名能不能改 | `docs/recon/schema.md` §7.1「必须原样保留」 |
| 判断某处样式好不好改（A/B/C 档） | `docs/recon/visual.md` §4「改造面分档」 |

## 硬约束

1. **协议不可改**：围栏标签 `dsh-ui`、50 个 `type` 名、必填字段名、`action` payload 形状、
   持久化键公式、资源上限数量级、安全过滤正则。改了等于让 SKILL.md / 系统提示 / 历史会话全量失效。
2. **颜色只来自宿主 token**（`--dsw-alias-*` / `--dsw-static-*`），不写死 HEX；每处样式都必须深浅色双主题成立。
3. **不得与上游插件同时启用**：两者都注册 system prompt 段 `genui:fence` 与 `render_ui` 工具，
   第二个 `apply` 会直接抛错。切换顺序：**先禁旧，再装新**；回滚反序。
4. **`prefers-reduced-motion` 必须保留**。
5. **不改本机 profile 的 `package.json` / `cordis.patch.yml`**：安装与开关走 `plugin_manager`。
6. **client 半边必须是单文件**（`lib/client.js`，`window.__ModuleLoader__.load` 包裹）；
   CSS Modules 由构建期内联，类名 hash → 换皮只能改源码重建，不能外部覆写。

## 改动循环

```sh
pnpm build        # rm -rf lib && tsc + tsdown → lib/index.js / lib/client.js / lib/assets/*
```

- **视觉层改动**：保存 → 构建 → 浏览器 0.5 s 内热替换，不用重启、不用刷新。
- **host 半边改动**（`src/plugin/`）：需要重启宿主应用。
- 装好之后，console 里出现 `[genui] client active; fence-channel=dom` 表示 client 已激活。

**改完样式先自己看一眼**（不要只看代码就交付）：

```sh
pnpm build && bash tools/visual/shot.sh   # → /tmp/vt-gen-ui-preview/{light,dark}.png
```

`tools/visual/preview.html` 用插件自带的 standalone runtime 渲染一份固定 fixture
（callout / table / steps / stat / card / list / progress / keyvalue / code），
不依赖宿主会话，浅色深色各一张。新的视觉效果定稿后把截图存进 `docs/visual/` 作基线。

## 目录

```
src/plugin/   host 半边：system prompt 段、render_ui / validate_dsh_ui 工具、回合内自修、资产路由、技能注册
src/shared/   围栏语言识别、JSON 两级修复、围栏解析（协议层，勿动）
src/client/   浏览器渲染器：DOM 围栏观察、spec 解析/归一化/校验、50 个组件、面板、导出、i18n
  └ blocks/   组件实现（视觉改造的主战场）
SKILL.md      模型看的语法手册（与协议同源，改字段必须同步改它）
docs/         侦察与能力文档
```

## 环境

- node 22.22.0（宿主运行时是 node 24，二者都能跑）；pnpm 10.33.2。
- 宿主桌面版 0.2.1-rc.5；PATH 上的 `dsh` 是旧版 0.1.5-rc.1，**不要用它做版本判断**。
- 上游源码只读参考：`~/.dsh/profiles/desktop/node_modules/@changfenhuang/dsh-genui`。
- 许可：MIT。`LICENSE` 与 `THIRD_PARTY_NOTICES.md`（含 OpenAI 图标段）必须保留。
