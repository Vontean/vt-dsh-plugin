# AGENTS.md · plugins/vt-minedesign

改这个插件前读 [DESIGN.md](DESIGN.md)：模块接口、三条不变量的来由、降级策略、决策记录。
本文件只放硬约束与交付判据。

## 硬约束

1. **双半边，各自封闭。** host 半边（`index.js`、`src/*`、`bin/*`）只用 Node 内置模块与本包
   `src/`；web 半边（`client.js`）只用 `package.json` 里 `dsh.client.inject` 列出的 client 包与
   浏览器 API。两边不互相 import，也不共享模块。
2. **一条缝 `PANEL_ROUTE`。** `GET` 返回会话快照；`POST` 只收两种体：`{ tool, args }` 给工具桥
   （`src/bridge.js`）、`{ action: 'message', sessionId, text }` 给投递（`src/delivery.js`）。路径与
   动词固定，改它必须两边与文档同时改。
3. **伴生进程只服务「给人看的那份界面」。** 由 host 懒启动 `mdn`（非 MCP 模式），URL 取 stdout 的
   `MineDesign: <url>`；插件卸载时 `dispose()`，拿不到 URL 就回退到 `editorUrl`。agent 的读写只走
   MCP 工具与 DSH 文件工具，不借这个进程操作文件。
4. **图标只用于标识 MineDesign 本身。** 动 `icon.svg` / `assets/*` / `client.js` 内联图标时，
   同步 `THIRD_PARTY_NOTICES.md` 与 `LICENSES/`。
5. **不写死用户路径。** 任何真实用户绝对路径（home 目录、用户名）都不进包内代码与资产，运行时解析。

## 自检

```bash
node --check index.js
node --check client.js
node --test test/*.test.mjs
node ../../scripts/check-client-bundles.mjs
cd ../.. && pnpm market
```

## 交付前

- 配置键只写在 `src/config.js`（默认值）与 README 的表格（说明）两处；加键或改默认值时两处同改。
- 行为变了就同步 DESIGN.md 的模块表、降级策略或决策记录——它是维护者的单一事实源。
- **web 半边必须在真实页面里验收**：右侧栏入口有 MineDesign、`open_document` 后面板自动出现、
  面板里能操作、`Send to chat` 能在对话里出现一条用户消息。bundle 校验通过只说明能加载。
- 改面板通道时，`test/panel.test.mjs` 的响应矩阵要跟着全绿：`200` / `400` / `403` / `405` /
  `500` / `502` / `503`。
