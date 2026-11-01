/**
 * Diagram render engine — the HEAVY half. This module imports `pele` (the
 * Obsidian Mermaid renderer) and is bundled ONLY into the lazy asset bundle
 * `lib/assets/pele.js`, loaded on demand by mermaid-lazy when a spec contains a
 * `mermaid` node; the main client bundle stays small.
 *
 * Why Pele instead of mermaid.js: it renders the same Mermaid 12.1 syntax
 * synchronously to SVG with no runtime dependencies, covers every built-in
 * diagram type (the old engine's whitelist blocked mindmap/timeline/sankey/
 * kanban/architecture/…), and — the part that matters for this plugin — it
 * takes its colours from CSS variables (`--pele-*`), so the diagram is themed
 * by the HOST tokens in the stylesheet instead of by a 200-line
 * `themeVariables` mapping that had to be re-run for every render.
 *
 * Colours are therefore NOT touched here: the `.mermaid` rule in
 * GenuiBlock.module.css defines `--pele-*` from `--dsl-g-*` / `--dsw-alias-*`,
 * and a theme flip repaints the SVG without a re-render.
 *
 * The injection point is still the only `dangerouslySetInnerHTML` in GenUI, so
 * `assertSafeSvg` stays as the last line of defence even though pele escapes
 * text and filters links itself.
 * @module dsh-vt-gen-ui/client/diagram-core
 */
import { detectType, render } from 'pele'
import { assertSafeSvg, ensureFlowchartKind, repairMermaidSource } from './mermaid-safe.ts'
import type { DiagramResolvers } from './diagram-types.ts'

/** Monotonic render id: pele prefixes gradient/clip ids per diagram, and two
 * diagrams in one answer must not share them. No entropy, no collisions. */
let renderSeq = 0

interface RenderOptions {
  idPrefix: string
  responsive: boolean
  fontSize: number
  fontFamily: string
  maxWidth?: number
  math?: NonNullable<DiagramResolvers['math']>
  icons?: NonNullable<DiagramResolvers['icons']>
}

/** Options shared by every attempt: the font pele measures with is the font the
 * diagram will be displayed in, and `maxWidth` is the real reading column, so a
 * wide flowchart can switch to a vertical layout instead of overflowing. */
function renderOptions(target: HTMLElement | undefined, resolvers: DiagramResolvers | undefined): RenderOptions {
  const doc = globalThis.document
  const fallback = doc === undefined ? 'sans-serif' : getComputedStyle(doc.body).fontFamily
  const fontFamily = target === undefined ? fallback : getComputedStyle(target).fontFamily
  const width = target?.clientWidth ?? 0
  const options: RenderOptions = {
    idPrefix: `genui-pele-${renderSeq++}-`,
    responsive: true,
    fontSize: 13,
    fontFamily,
  }
  if (width > 0) options.maxWidth = width
  // Passed through to pele: KaTeX typesetting for label math, and the plugin's
  // icon catalogue for `fa:…` references. Undefined keeps pele's fallbacks.
  if (resolvers?.math !== undefined) options.math = resolvers.math
  if (resolvers?.icons !== undefined) options.icons = resolvers.icons
  return options
}

/** True when pele knows how to parse this source. `detectType` throws on an
 * empty body, so absence of a type is treated as "not renderable here". */
function knownKind(source: string): boolean {
  try {
    return detectType(source) !== null
  } catch {
    return false
  }
}

/**
 * Render Mermaid source to an SVG string.
 * @param code - the mermaid diagram source (Mermaid 12.1 syntax).
 * @param target - final diagram element whose inherited font and width are used.
 * @returns the rendered SVG markup (verified free of script/event handlers).
 * @throws when pele cannot parse the source, or the output fails the
 *   sanitization check — the caller then shows its raw-source fallback.
 */
export async function renderMermaid(code: string, target?: HTMLElement, resolvers?: DiagramResolvers): Promise<string> {
  let source = code.trim()
  // Model-authored sources routinely omit the mandatory declaration line
  // (`A --> B` with no leading `graph TD`). Prepend it when the body is clearly
  // a flowchart; genuinely unclassifiable input is left for pele to reject.
  if (!knownKind(source)) {
    const lenient = ensureFlowchartKind(source)
    if (lenient !== source) source = lenient
  }

  const options = renderOptions(target, resolvers)
  const draw = (text: string): string => {
    const { svg } = render(text, options)
    assertSafeSvg(svg)
    return svg
  }

  try {
    return draw(source)
  } catch (error) {
    // One retry with the label-repair pass: a repaired source that renders
    // beats a syntax-error fallback for the same content.
    const repaired = repairMermaidSource(source)
    if (repaired !== source) return draw(repaired)
    throw error
  }
}
