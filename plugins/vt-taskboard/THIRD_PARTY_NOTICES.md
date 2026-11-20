# 第三方声明

## dsh-taskboard（Apache-2.0）—— 本包 fork 的上游

`dsh-vt-taskboard` 是 [`dsh-taskboard`](https://github.com/cloader/dsh-taskboard) 0.10.0 的 fork：

- 上游许可证：Apache License 2.0（`Copyright 2026 cloader`），全文见 [`LICENSE`](./LICENSE)。
- 本包改动范围：包身份与注册 id（`dsh-vt-taskboard`）、面板 id、HTTP 路由前缀
  （`/dsh-vt-taskboard`）、数据文件名、`localStorage` 键、界面文案（去除装饰性 emoji）、
  以及整套视觉层（`src/client/styles.ts`、`src/client/icons.tsx` 与相关组件的表现层）。
- 功能面（`taskboard_*` 工具、宿主调度、worktree 隔离、模板、i18n、外部同步）与上游对齐；
  这些代码的著作权仍归上游作者，按 Apache-2.0 使用与分发。

Apache-2.0 要求保留版权与许可声明，并在修改文件中注明变更；本仓库以 `git` 历史记录
每一处改动，各源文件顶部保留上游原始注释。分发本包时必须同时附带 [`LICENSE`](./LICENSE)
与本文件。

### 不要与上游同时启用

两个包注册同名的 `taskboard_*` agent 工具和同名的系统提示段。同时启用会造成工具重名与提示段冲突，
请只保留其中一个（本包与上游的看板数据文件也已分开命名，互不读取）。

## Lucide（ISC）—— 图标几何

`src/client/icons.tsx` 的图标几何取自 [Lucide](https://lucide.dev)（ISC License），
只保留本界面实际用到的字形，统一改写为内联 SVG。

```
Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT).
All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```
