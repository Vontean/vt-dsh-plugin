# Third-party notices

`dsh-vt-mine-models` 本身以 **MIT** 发布，完整许可文本见同目录的 [`LICENSE`](./LICENSE)
（`Copyright (c) 2026 Vontean`）。

运行时不加载任何第三方库，也不访问网络。下面的归属覆盖两类内容：

1. 内联在 `client.js` 里的 12 个厂商标记与 1 个回退图标；
2. 从 MineCodex（MCX）学来的交互流程、动效参数与滑条几何。

---

## MineCodex (MIT) — 交互规格、动效参数、滑条几何与厂商标记集

- 来源：MineCodex（MCX）的 `model-slider` 功能，MIT。本仓库的复刻依据是
  [`docs/research/mcx-model-slider.md`](../../docs/research/mcx-model-slider.md)（对上游源码的只读调研）。
- 取自上游的内容：
  - 两段式层级（点 chip 先出「模型 + 思考强度滑条」，点模型行才下钻到列表）；
  - 底边锚定、向上生长的高度动效，以及 320ms / 200ms / 40ms 的时长与缓动参数；
  - 自绘滑条的几何（轨道 16px、拇指 26px、两端留 13px、刻度 6px）；
  - 品牌 → 模型的「关键字包含匹配、清单顺序即优先级」规则；
  - 12 个厂商标记与 sparkles 回退图标的图形资产。
- 未取自上游的内容：没有链接、打包或改写 MCX 的应用代码；本插件是在 DSH 平台基元
  （`MenuSurface` / `MenuGroup` / `Input` / `rankByName` / `observeStickyMenuGroups`）上的
  独立实现。
- MCX 自身还分发了一份 `THIRD_PARTY_NOTICES.md` 与 `vendor/*-LICENSE`；下面的品牌资产归属
  沿用其原始许可，在此重述。

## 厂商标记 — farion1231/cc-switch v3.19.1 (MIT)

以下 12 个文件随 `cc-switch` v3.19.1 分发（MIT），本插件把它们的图形内联进 `client.js` 的
`ICONS` 表，键名与文件名一致：

`anthropic.svg` · `deepseek.svg` · `gemini.svg` · `grok.svg` · `hunyuan.svg` · `kimi.svg` ·
`minimax.svg` · `muse.svg` · `openai.svg` · `qwen.svg` · `xiaomimimo.svg` · `zhipu.svg`

- 上游：<https://github.com/farion1231/cc-switch>（版本锚点 v3.19.1）。
- 例外：`xiaomimimo.svg` 来自 **simple-icons**（CC0-1.0），cc-switch 只是转载；本插件仍在此署名。
- `zhipu.svg` 在上游就是一个 `viewBox="0 0 96 96"` 的 SVG 包装层，内部是
  `data:image/png;base64,…` 的 PNG favicon。本插件原样保留该结构，因此智谱图标在 16px 下
  是位图缩放，而不是矢量。
- `muse.svg` / `zhipu.svg` 属于「官方标志包装层」，商标归 Meta / 智谱所有；本插件仅将它们在
  模型选择器里用作**厂商识别**，不暗示任何背书关系。其余品牌名与商标同样归各自所有者。

上述 MIT 许可文本适用于本节与上一节的版权行；上游仓库里分发的 `LICENSE` 是权威版本。

## sparkles 回退图标 — Lucide (ISC)

- 资产：`lucide-static` v1.30.0 的 `sparkles.svg`，作为 `FALLBACK_ICON` 内联在 `client.js`。
- 上游：<https://github.com/lucide-icons/lucide>（`lucide-static` v1.30.0）。
- 许可：ISC（其中源自 Feather 的部分为 MIT，见下方文本）。

---

## 许可文本

### MIT

以下 MIT 文本适用于本包（`dsh-vt-mine-models`，版权行见 [`LICENSE`](./LICENSE)）、MineCodex
（`Copyright (c) the MineCodex authors`）与 cc-switch v3.19.1（`Copyright (c) the cc-switch
authors`）：

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### ISC（Lucide）

```
ISC License

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

### CC0-1.0（simple-icons，小米 MiMo 标记）

`xiaomimimo.svg` 来自 [simple-icons](https://github.com/simple-icons/simple-icons)，该仓库以
**CC0-1.0** 发布（公有领域奉献，无署名义务）。本插件为可追溯性保留这条记录，不额外施加限制。
