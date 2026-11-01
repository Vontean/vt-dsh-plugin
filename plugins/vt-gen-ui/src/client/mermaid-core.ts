/**
 * Mermaid render engine — the HEAVY half. This module imports mermaid and is
 * bundled ONLY into the lazy asset bundle `lib/assets/mermaid.js`, loaded on
 * demand by the mermaid-lazy loader when a spec contains a `mermaid` node;
 * the main client bundle stays small.
 *
 * Whitelist: only a fixed set of diagram kinds render; anything else throws
 * so the caller shows its fallback — except undeclared flowchart bodies
 * (model-generated sources missing the `graph TD` header line), which get
 * the declaration prepended via ensureFlowchartKind and render normally.
 * mermaid runs client-side with its own sanitizer; we additionally refuse `securityLevel: 'loose'`-style inputs by
 * only initializing with the strict default, AND we re-check the rendered SVG
 * before it is injected (see `assertSafeSvg` in mermaid-safe): the injection
 * point is the only place in GenUI that uses `dangerouslySetInnerHTML`, so
 * the last line of defense lives here, not inside mermaid.
 * @module dsh-vt-gen-ui/client/mermaid-core
 */
import { assertSafeSvg, ensureFlowchartKind, repairMermaidSource } from './mermaid-safe.ts'
import { readMermaidThemeColor } from './mermaid-colors.ts'
import { dataColors } from './chart-theme.ts'

let mermaidPromise: Promise<typeof import('mermaid')> | null = null

/** Monotonic render id (replaces Math.random): no collisions, no entropy. */
let renderSeq = 0

async function loadMermaid(target?: HTMLElement): Promise<typeof import('mermaid')> {
  mermaidPromise ??= import('mermaid')
  const m = await mermaidPromise
  // Called inside the client queue: initialize for each job so host theme
  // tokens cannot remain frozen at the first diagram's palette.
  const api = m.default
  // Theme the diagram from the HOST tokens instead of a built-in mermaid
  // palette: the stock themes render grey boxes with sharp corners, dark
  // strokes and their own font, which sat next to our components as a
  // visibly foreign object. `base` + themeVariables is the supported way to
  // drive every colour (the dark/light branch is gone with it).
  const colors = new Map<string, string>()
  const token = (name: string, fallback: string): string => {
    const cached = colors.get(name)
    if (cached !== undefined) return cached
    const color = readMermaidThemeColor(name, fallback, target)
    colors.set(name, color)
    return color
  }
  // Accent and its single-hue ramp: diagram categories share one scale rather
  // than borrowing the semantic success/warning/error colours.
  const accent = token('--dsl-g-accent', 'rgba(79,142,247,1)')
  const withAlpha = (color: string, alpha: number): string => {
    const match = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/i.exec(color)
    if (match === null) return color
    return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha.toFixed(2)})`
  }
  // Slices draw from the SAME categorical ramp as the native chart and ECharts
  // (one hue, stepped by lightness), resolved to literals because mermaid needs
  // concrete colours. Two charts side by side now share a palette.
  const ramp = dataColors(6, target)
  const slice = (index: number): string => ramp[index % ramp.length]!

  api.initialize({
    startOnLoad: false,
    // Strict default: mermaid escapes/sanitizes; we never enable htmlLabels.
    securityLevel: 'strict',
    theme: 'base',
    themeVariables: {
      background: 'transparent',
      // Freeze the same font into measurement and the returned SVG: inheriting
      // from body while measuring and from a card while displaying clips labels.
      fontFamily: getComputedStyle(target ?? document.body).fontFamily,
      fontSize: '13px',
      primaryColor: token('--dsw-alias-bg-layer-2', '#2c2c2e'),
      primaryTextColor: token('--dsw-alias-label-primary', '#e6e6e6'),
      // Diagram strokes take the SAME hairline the components use. The old
      // value was border-l2, which drew every node 2-3x heavier than a card in
      // the same answer.
      primaryBorderColor: token('--dsw-alias-border-l1', 'rgba(255,255,255,0.06)'),
      secondaryColor: token('--dsw-alias-bg-layer-2', '#2c2c2e'),
      secondaryTextColor: token('--dsw-alias-label-primary', '#e6e6e6'),
      secondaryBorderColor: token('--dsw-alias-border-l1', 'rgba(255,255,255,0.06)'),
      tertiaryColor: token('--dsw-alias-bg-layer-2', '#2c2c2e'),
      tertiaryTextColor: token('--dsw-alias-label-primary', '#e6e6e6'),
      tertiaryBorderColor: token('--dsw-alias-border-l1', 'rgba(255,255,255,0.06)'),
      mainBkg: token('--dsw-alias-bg-layer-2', '#2c2c2e'),
      nodeBorder: token('--dsw-alias-border-l1', 'rgba(255,255,255,0.06)'),
      nodeTextColor: token('--dsw-alias-label-primary', '#e6e6e6'),
      lineColor: token('--dsw-alias-label-tertiary', '#8a8a92'),
      textColor: token('--dsw-alias-label-primary', '#e6e6e6'),
      edgeLabelBackground: 'transparent',
      clusterBkg: 'transparent',
      clusterBorder: token('--dsw-alias-border-l1', 'rgba(255,255,255,0.06)'),
      titleColor: token('--dsw-alias-label-primary', '#e6e6e6'),

      /* ---- sequence ------------------------------------------------------
         Mermaid's sequence diagram reads its own colour set; without these it
         drew black actors, black signals and black lifelines next to our
         near-black-on-white components — the loudest "foreign object" in the
         whole vocabulary. */
      actorBkg: token('--dsw-alias-bg-layer-2', '#2c2c2e'),
      actorBorder: token('--dsw-alias-border-l1', 'rgba(255,255,255,0.06)'),
      actorTextColor: token('--dsw-alias-label-primary', '#e6e6e6'),
      actorLineColor: token('--dsw-alias-border-l2', 'rgba(255,255,255,0.12)'),
      signalColor: token('--dsw-alias-label-tertiary', '#8a8a92'),
      signalTextColor: token('--dsw-alias-label-primary', '#e6e6e6'),
      labelBoxBkgColor: token('--dsw-alias-bg-layer-2', '#2c2c2e'),
      labelBoxBorderColor: token('--dsw-alias-border-l1', 'rgba(255,255,255,0.06)'),
      labelTextColor: token('--dsw-alias-label-primary', '#e6e6e6'),
      loopTextColor: token('--dsw-alias-label-secondary', '#a1a1aa'),
      noteBkgColor: withAlpha(accent, 0.1),
      noteBorderColor: token('--dsw-alias-border-l1', 'rgba(255,255,255,0.06)'),
      noteTextColor: token('--dsw-alias-label-primary', '#e6e6e6'),
      activationBkgColor: withAlpha(accent, 0.18),
      activationBorderColor: withAlpha(accent, 0.45),
      sequenceNumberColor: token('--dsw-alias-bg-base', '#17171a'),

      /* ---- pie -----------------------------------------------------------
         Un-themed pie slices fell back to mermaid's own white / grey / black
         palette with a 2px black outline: the one diagram that looked like a
         foreign SVG. Slices are a single-hue ramp of the accent so categories
         read as steps of one scale instead of borrowed semantic colours. */
      pie1: slice(0), pie2: slice(1), pie3: slice(2), pie4: slice(3),
      pie5: slice(4), pie6: slice(5), pie7: slice(6), pie8: slice(7),
      pie9: slice(8), pie10: slice(9), pie11: slice(10), pie12: slice(11),
      pieStrokeColor: token('--dsw-alias-bg-base', '#17171a'),
      pieStrokeWidth: '1px',
      pieOuterStrokeWidth: '0px',
      pieTitleTextColor: token('--dsw-alias-label-primary', '#e6e6e6'),
      pieTitleTextSize: '14px',
      pieSectionTextColor: token('--dsw-alias-label-primary', '#e6e6e6'),
      pieSectionTextSize: '12px',
      pieLegendTextColor: token('--dsw-alias-label-secondary', '#a1a1aa'),
      pieLegendTextSize: '12px',

      /* ---- gantt ---------------------------------------------------------
         The gantt drew pastel default bars on a grid that fought the page. */
      gridColor: token('--dsw-alias-border-l1', 'rgba(255,255,255,0.06)'),
      sectionBkgColor: 'transparent',
      sectionBkgColor2: 'transparent',
      altSectionBkgColor: 'transparent',
      taskBkgColor: withAlpha(accent, 0.55),
      taskBorderColor: withAlpha(accent, 0.8),
      taskTextColor: token('--dsw-alias-label-primary', '#e6e6e6'),
      taskTextOutsideColor: token('--dsw-alias-label-secondary', '#a1a1aa'),
      taskTextDarkColor: token('--dsw-alias-label-primary', '#e6e6e6'),
      activeTaskBkgColor: withAlpha(accent, 0.8),
      activeTaskBorderColor: accent,
      doneTaskBkgColor: token('--dsl-g-border', 'rgba(0,0,0,0.06)'),
      doneTaskBorderColor: token('--dsw-alias-border-l2', 'rgba(255,255,255,0.12)'),
      todayLineColor: accent,
      critBkgColor: withAlpha(accent, 0.9),
      critBorderColor: accent,

      /* ---- class / state / ER ------------------------------------------
         These three carry their own variable sets too; without them the boxes
         came out in mermaid's default palette while the flowcharts beside them
         were themed. */
      classText: token('--dsw-alias-label-primary', '#e6e6e6'),
      stateLabelColor: token('--dsw-alias-label-primary', '#e6e6e6'),
      stateBkg: token('--dsw-alias-bg-layer-2', '#2c2c2e'),
      labelBackgroundColor: token('--dsw-alias-bg-base', '#17171a'),
      transitionColor: token('--dsw-alias-label-tertiary', '#8a8a92'),
      transitionLabelColor: token('--dsw-alias-label-secondary', '#a1a1aa'),
      compositeBackground: 'transparent',
      compositeTitleBackground: token('--dsw-alias-bg-layer-2', '#2c2c2e'),
      compositeBorder: token('--dsw-alias-border-l1', 'rgba(255,255,255,0.06)'),
      altBackground: token('--dsw-alias-bg-layer-2', '#2c2c2e'),
      attributeBackgroundColorOdd: 'transparent',
      attributeBackgroundColorEven: token('--dsl-g-zebra', 'rgba(0,0,0,0.03)'),

      /* ---- gitGraph -----------------------------------------------------
         Branch lines fall back to mermaid's own rainbow, which is the loudest
         colour in the vocabulary; they use the shared data ramp instead. */
      git0: slice(0), git1: slice(1), git2: slice(2), git3: slice(3),
      git4: slice(4), git5: slice(5), git6: slice(0), git7: slice(1),
      gitBranchLabel0: token('--dsw-alias-bg-base', '#17171a'),
      gitBranchLabel1: token('--dsw-alias-bg-base', '#17171a'),
      gitBranchLabel2: token('--dsw-alias-bg-base', '#17171a'),
      gitBranchLabel3: token('--dsw-alias-bg-base', '#17171a'),
      gitBranchLabel4: token('--dsw-alias-bg-base', '#17171a'),
      gitBranchLabel5: token('--dsw-alias-bg-base', '#17171a'),
      gitBranchLabel6: token('--dsw-alias-bg-base', '#17171a'),
      gitBranchLabel7: token('--dsw-alias-bg-base', '#17171a'),
      commitLabelColor: token('--dsw-alias-label-primary', '#e6e6e6'),
      commitLabelBackground: token('--dsw-alias-bg-base', '#17171a'),
      tagLabelColor: token('--dsw-alias-label-primary', '#e6e6e6'),
      tagLabelBackground: token('--dsw-alias-bg-layer-2', '#2c2c2e'),
      tagLabelBorder: token('--dsw-alias-border-l1', 'rgba(255,255,255,0.06)'),

      /* ---- journey ------------------------------------------------------ */
      // Journey: mermaid paints BOTH section bands and task bars from fillType*,
      // at full saturation, so the timeline read as two solid blue blocks. The
      // bands become light tint steps; the shape of the journey stays readable.
      // Journey paints section bands AND task bars from fillType*, so too light a
      // tint loses the bars and too strong a tint turns the page into blocks.
      // Alternating mid-tints keep the bars readable and the bands quiet.
      fillType0: withAlpha(accent, 0.3), fillType1: withAlpha(accent, 0.22),
      fillType2: withAlpha(accent, 0.3), fillType3: withAlpha(accent, 0.22),
      fillType4: withAlpha(accent, 0.3), fillType5: withAlpha(accent, 0.22),
      fillType6: withAlpha(accent, 0.3), fillType7: withAlpha(accent, 0.22),
    },
    /**
     * Diagram kinds read their own config blocks; these are the two that were
     * visibly off: gantt packed 10px-wide date ticks (labels overlapped into an
     * unreadable strip), and sequence annotations were set at mermaid's default
     * sizes rather than ours.
     */
    // Gantt lays itself out at roughly 35px per day regardless of container width,
    // so a two-week plan renders at ~300px and a 5-char date tick ("11-01")
    // prints on top of its neighbour. Day-only ticks are the only lever that
    // removes the collision (scaling the SVG scales the overlap with it).
    gantt: { axisFormat: '%m-%d', fontSize: 11, barHeight: 22, barGap: 4, topPadding: 48, useMaxWidth: true },
    sequence: { actorFontSize: 13, messageFontSize: 13, noteFontSize: 12, actorMargin: 60, useMaxWidth: true },
    gitGraph: { rotateCommitLabel: false, showBranches: true },
    themeCSS: [
      // Node geometry: same radius family as the components; hairline stroke.
      '.node rect, .node polygon, .node circle, .node ellipse { rx: 10px; ry: 10px; stroke-width: 1px; }',
      '.cluster rect { rx: 12px; ry: 12px; }',
      '.edgePath .path { stroke-width: 1px; }',
      // Edge labels must sit ON the page, not in a chip. Mermaid defaults
      // .labelBkg to a half-black wash, which is why "是/否/action" rendered as
      // dark blocks with unreadable text over a light page.
      '.edgeLabel, .edgeLabel p, .labelBkg { background: transparent !important; }',
      '.edgeLabel rect, .edgeLabels .label rect { fill: transparent !important; stroke: none !important; }',
      '.pieCircle { stroke-width: 1px; }',
      // gitGraph draws branch lines at 8px and fills commit highlights with a
      // fixed amber — the one hue in the whole vocabulary that nobody chose.
      '.arrow { stroke-width: 3px; }',
      '.commit-highlight0, .commit-highlight1, .commit-highlight2, .commit-highlight3, .commit-highlight4, .commit-highlight5, .commit-highlight6, .commit-highlight7, .commit-highlight8, .commit-highlight9, .commit-highlight10, .commit-highlight11 { opacity: 0; }',
      `.branchLabelBkg { fill: ${token('--dsw-alias-bg-layer-2', '#2c2c2e')}; stroke: ${token('--dsw-alias-border-l1', 'rgba(255,255,255,0.06)')}; stroke-width: 1px; }`,
      `.branch-label0, .branch-label1, .branch-label2, .branch-label3, .branch-label4, .branch-label5, .branch-label6, .branch-label7, .branch-label8, .branch-label9, .branch-label10, .branch-label11 { fill: ${token('--dsw-alias-label-primary', '#e6e6e6')}; }`,
      `.commit-label, .commit-id, .commit-msg { font-size: 11px; fill: ${token('--dsw-alias-label-secondary', '#a1a1aa')}; }`,
      // Journey draws its timeline axis as a bare <line stroke-width="4"> with a
      // black arrow marker; every other diagram scopes its lines more tightly.
      `line { stroke: ${token('--dsw-alias-label-tertiary', '#8a8a92')}; stroke-width: 2px; }`,
      '.task-line { stroke-width: 1px; }',
      // Arrow markers (flowchart / journey) are solid; ER relationship markers are
      // OUTLINES (crow's foot + circle). Filling every marker path turned the ER
      // ends into solid dark blobs, so the two families are styled apart.
      `marker:not(.er) path { fill: ${token('--dsw-alias-label-tertiary', '#8a8a92')}; }`,
      `marker.er path { fill: none; stroke: ${token('--dsw-alias-label-tertiary', '#8a8a92')}; stroke-width: 1px; }`,
      `marker.er circle { fill: ${token('--dsw-alias-bg-base', '#ffffff')}; stroke: ${token('--dsw-alias-label-tertiary', '#8a8a92')}; stroke-width: 1px; }`,
      // class / state / ER / git: same hairline + radius family as the cards.
      '.classGroup rect, .classGroup .label-group, .stateGroup rect, .er.entityBox, .er .attributeBoxOdd, .er .attributeBoxEven { stroke-width: 1px; }',
      '.classGroup rect, .stateGroup rect, .er.entityBox { rx: 10px; ry: 10px; }',
      '.er .attributeBoxOdd, .er .attributeBoxEven { stroke-width: 0; }',
      '.commit-label-bkg { opacity: 1; }',
      '.journey-section .section-type-0, .journey-section .section-type-1, .journey-section .section-type-2, .journey-section .section-type-3, .journey-section .section-type-4, .journey-section .section-type-5, .journey-section .section-type-6, .journey-section .section-type-7 { stroke-width: 0; }',
      '.sectionTitle { font-size: 13px; }',
      // Gantt vertical rules ignore gridColor in mermaid 11 and print black.
      `.grid .tick line { stroke: ${token('--dsw-alias-border-l1', 'rgba(0,0,0,0.06)')}; }`,
      '.grid .tick text { font-size: 10px; }',
      '.label { color: inherit; }',
    ].join(' '),
    // Fail loudly: with suppressErrorRendering false (the default) mermaid
    // renders an "error" diagram on parse/draw failure — the caller then
    // receives a normal-looking SVG whose text is the raw engine error
    // ("Syntax error in text / mermaid version …"), which lands on the page
    // with no exception ever thrown. Suppressing the error diagram makes
    // every failure throw so the caller shows its own fallback instead.
    suppressErrorRendering: true,
  })
  return m
}

/** Diagram kinds allowed through to the renderer. */
const ALLOWED_KINDS = [
  'flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram',
  'gantt', 'pie', 'erDiagram', 'journey', 'gitGraph',
]

/** One render attempt into a private container. mermaid ≥ 11.16 resolves the
 * diagram element via `document.body` while drawing flowcharts
 * (`getDiagramElement`), so a DETACHED container makes every flowchart/graph
 * render throw on an empty d3 selection ("Cannot read properties of null").
 * The container is therefore mounted off-screen for the duration of the
 * render — NOT `display:none`, which zeroes label measurements and makes
 * dagre fail with "Could not find a suitable point" — and removed when done. */
async function renderInto(m: typeof import('mermaid'), id: string, code: string, container: HTMLDivElement): Promise<string> {
  container.style.position = 'fixed'
  container.style.left = '-100000px'
  container.style.top = '0'
  container.style.margin = '0'
  // A detached/auto-width container shrink-wraps, and mermaid sizes the gantt
  // from the container it draws into: the plan came out ~300px wide with the
  // date axis printed on top of itself. Give the measuring container the real
  // reading width so the layout matches where the diagram will live.
  container.style.width = '760px'
  document.body?.appendChild(container)
  try {
    const { svg } = await m.default.render(id, code, container)
    assertSafeSvg(svg)
    return svg
  } finally {
    container.remove()
  }
}

/**
 * Render mermaid source to an SVG string.
 * @param code - the mermaid diagram source.
 * @param target - final diagram element whose inherited font is used for layout.
 * @returns the rendered SVG markup (verified free of script/event handlers).
 * @throws when the kind is not whitelisted, rendering fails, or the output
 *   fails the sanitization check.
 */
export async function renderMermaid(code: string, target?: HTMLElement): Promise<string> {
  let trimmed = code.trim()
  const firstLine = trimmed.split('\n', 1)[0] ?? ''
  let kind = /^([A-Za-z]+)/.exec(firstLine)?.[1] ?? ''
  if (!ALLOWED_KINDS.includes(kind)) {
    // Lenient: model-generated sources frequently omit the mandatory
    // diagram-type declaration line (`A --> B` with no leading
    // `graph TD`). Detect a flowchart body by its edge arrows and prepend
    // the declaration instead of throwing straight to the raw-source
    // fallback; genuinely unclassifiable input still fails as before.
    const lenient = ensureFlowchartKind(trimmed)
    if (lenient !== trimmed) {
      trimmed = lenient
      kind = 'graph'
    }
  }
  if (!ALLOWED_KINDS.includes(kind)) {
    throw new Error(`mermaid kind '${kind}' is not allowed`)
  }
  const m = await loadMermaid(target)
  const container = document.createElement('div')
  try {
    try {
      return await renderInto(m, `genui-mermaid-${renderSeq++}`, trimmed, container)
    } catch (error) {
      // Retry once with the label-repair pass; a repaired source rendering
      // successfully beats a syntax-error fallback for the same content.
      const repaired = repairMermaidSource(trimmed)
      if (repaired !== trimmed) {
        return await renderInto(m, `genui-mermaid-${renderSeq++}`, repaired, container)
      }
      throw error
    }
  } finally {
    container.remove()
  }
}
