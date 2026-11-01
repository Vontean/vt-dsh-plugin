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

## KaTeX / Pele / ECharts / three.js

Those engines are built from their own packages under their own licenses into
the `lib/assets/*.js` bundles; no engine source is vendored into this
repository.
