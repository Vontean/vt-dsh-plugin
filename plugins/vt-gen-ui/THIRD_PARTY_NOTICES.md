# Third-party notices

## @changfenhuang/dsh-genui (MIT) — the upstream this package is forked from

`dsh-vt-gen-ui` is a fork of [`@changfenhuang/dsh-genui`](https://www.npmjs.com/package/@changfenhuang/dsh-genui)
0.14.0 (MIT, `Copyright (c) 2026 dsh-external`). The protocol, component vocabulary and most of
the host/client code come from upstream; our changes are the package identity
(`dsh-vt-gen-ui`, bundle row id, module id, asset route), the release packaging, and the visual
layer. The MIT license text is the one shipped in [`LICENSE`](./LICENSE); the upstream package and
its license are also readable from the installed profile
(`<profile>/node_modules/@changfenhuang/dsh-genui`).

Upstream and this package must not be enabled at the same time: both register the same system
prompt section, the same tools and a renderer on the same conversation DOM.

## OpenAI Apps SDK UI icons (MIT)

The icon glyphs bundled in `src/client/icons/icon-data.ts` are copied from the
OpenAI Apps SDK UI icon set:

- Source: <https://github.com/openai/apps-sdk-ui>
- Pinned commit: `0f00143c7a639906f1621fe58e1b6be7b5bea46d`
- Upstream path: `src/components/Icon/svg`
- Vendored as: literal SVG geometry and attributes (no upstream component code), curated to 749 glyphs (64 inlined, 685 lazy-loaded); six glyphs with unsupported nested structures are excluded in full and listed in `ICON-NAMES.md`

```
Copyright 2025 OpenAI

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

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

The colour values referenced by the `--dsl-g-*` token layer are *not* copied
from that project: they resolve through the host's `--dsw-alias-*` tokens, and
the literals in `GenuiBlock.module.css` are last-resort fallbacks.

## Pele (MIT) — the Mermaid-compatible diagram engine

`mermaid` nodes are rendered by [`pele`](https://github.com/obsidianmd/pele)
1.13.0 (MIT, `Copyright (c) 2026 Obsidian`) instead of mermaid.js: it parses the
same Mermaid 12.1 syntax and paints from CSS variables. Pele is built into the
lazy asset `lib/assets/pele.js`; no source is vendored into this repository.
Its parsers and grammar files derive from Mermaid (also MIT).

## Bundled engines (built into `lib/`)

The build inlines these packages into the shipped bundles. No source is
vendored into the repository; each package is consumed unmodified from npm at
build time.

| package | version | license | lands in |
| --- | --- | --- | --- |
| `pele` | 1.13.0 | MIT | `lib/assets/pele.js` |
| `katex` | 0.16.47 | MIT | `lib/client.js` |
| `@apache-echarts/echarts` (`echarts`) | 5.6.0 | **Apache-2.0** | `lib/assets/echarts-core.js`, `lib/assets/echarts-full.js` |
| `echarts-wordcloud` | 2.1.0 | ISC | `lib/assets/echarts-full.js` |
| `three` | 0.180.0 | MIT | `lib/assets/three.js` |
| `mermaid` (Mermaid grammar/spec references only) | — | MIT | not bundled since 1.1.0 |
| `mdast-util-from-markdown` | 2.0.3 | MIT | `lib/client.js` |
| `react` / `react-dom` | 18.3.1 | MIT | peer, provided by the host |

### Apache ECharts (Apache-2.0)

The bundled ECharts build is distributed under the Apache License, Version 2.0.
The full license text — including ECharts' own notice about the d3-derived
source files it carries — is vendored at
[`LICENSES/Apache-2.0.txt`](./LICENSES/Apache-2.0.txt).

    Apache ECharts
    Copyright 2017-2025 The Apache Software Foundation

    This product includes software developed at
    The Apache Software Foundation (http://www.apache.org/).

Changes: none. The package is bundled byte-for-byte by the build
(`tsdown.config.ts`, `assetConfig('echarts-*')`); no ECharts source is patched.

### ISC (`echarts-wordcloud`)

    Copyright (c) 2017, ecomfe

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted, provided that the above
    copyright notice and this permission notice appear in all copies.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
    WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
    MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
    SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
    WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
    OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
    CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
