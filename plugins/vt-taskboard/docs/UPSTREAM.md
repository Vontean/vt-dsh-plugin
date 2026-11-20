# 与上游的对应关系（维护备忘）

本目录是 `dsh-taskboard` 0.10.0 的 fork。上游仍在迭代，这里记录改名映射，方便日后同步上游改动。

## 身份映射

| 位置 | 上游 | 本包 |
| --- | --- | --- |
| npm 包名 | `dsh-taskboard` | `dsh-vt-taskboard` |
| 面板 id | `dsh-taskboard` | `dsh-vt-taskboard` |
| 客户端模块 id | `dsh-taskboard` | `dsh-vt-taskboard` |
| HTTP 路由前缀 | `/dsh-taskboard` | `/dsh-vt-taskboard` |
| 台账文件 | `dsh-taskboard.json` | `dsh-vt-taskboard.json` |
| 模板文件 | `dsh-taskboard-templates.json` | `dsh-vt-taskboard-templates.json` |
| 附件目录 | `dsh-taskboard-assets/` | `dsh-vt-taskboard-assets/` |
| 数据目录引导文件 | `dsh-taskboard-storage.json` | `dsh-vt-taskboard-storage.json` |
| `localStorage` 键 | `dsh-taskboard-*` | `dsh-vt-taskboard-*` |
| 样式元素 id | `dsh-taskboard-styles` | `dsh-vt-taskboard-styles` |

**没有改名**的部分（刻意保留，便于与上游对照与合并）：

- `taskboard_*` agent 工具名与系统提示段名——这是 agent 侧协议，改名会破坏既有用法与文档。
- CSS 类名前缀 `dsh-atb-`——它是「agent task board」的缩写，不含包名；改名只会制造无意义的 diff。

## 本地改动清单（同步上游时优先复查）

1. `src/client/styles.ts`：整套视觉层（`--vtb-*` 令牌 + 组件规则）。
2. `src/client/icons.tsx`：新增的线性图标集。
3. 表现层组件：`TaskBoard.tsx`、`TaskCard.tsx`、`TaskDetail.tsx`、`TaskFormModal.tsx`、
   `SettingsModal.tsx`、`ImportModal.tsx`、`TemplateManager.tsx`、`AlertModal.tsx`
   —— 主要是 emoji → `<Icon>`、工具栏两行结构、卡片交付概览压缩。
4. `src/client/i18n/{zh,en,ru}.ts`：去除装饰性 emoji、新增少量短标签键
   （`board.action.more`、`card.deliv.filesShort`、`card.deliv.acceptShort`、`detail.chip.holderSuffix` 被移除）。
5. `tests/sticky-group-head.spec.ts`、`tests/client.spec.ts`：随视觉改动同步的两处断言。

## 同步上游的建议流程

```bash
git remote add upstream https://github.com/cloader/dsh-taskboard.git
git fetch upstream
git diff upstream/main -- src/host src/shared   # 先看功能层
```

功能层（`src/host/`、`src/shared/`）应尽量保持与上游一致，冲突集中在客户端表现层。
合入后重新 `npm run build` 并提交 `lib/`（本仓库约定产物入库）。
