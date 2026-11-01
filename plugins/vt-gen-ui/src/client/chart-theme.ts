/**
 * Chart theme: the ONE place that decides how a chart looks.
 *
 * Four renderers draw charts in this plugin — the native SVG `chart`, the
 * `echart` (ECharts canvas), the `plot` function plotter and mermaid diagrams —
 * and before this module each of them picked its own colours, its own grey for
 * grid lines and its own idea of how big a tick label is. Two charts on one
 * screen therefore read as two products, and the categorical palette borrowed
 * the host's SUCCESS / WARNING / ERROR hues, so a four-series chart looked like
 * a status board.
 *
 * The rules encoded here:
 *
 * 1. **One hue for categories.** Series colours come from `--dsl-g-data-1..6`
 *    (a lightness ramp of the accent, declared in GenuiBlock.module.css, theme
 *    aware). Categories differ by lightness, never by hue.
 * 2. **One grey for structure.** Grid, axis rule and tick label come from
 *    `--dsl-g-chart-*`, so every chart family draws the same grey at the same
 *    weight against the same page.
 * 3. **Canvas consumers get literals.** SVG/DOM can paint `var(--x)` directly;
 *    ECharts paints to a canvas and mermaid measures text, so those two need a
 *    RESOLVED colour string. `dataColors()` and `chartInk()` do that resolution
 *    once, through a real element, so a host theme change is picked up on the
 *    next render instead of being frozen in a JS constant.
 * @module dsh-vt-gen-ui/client/chart-theme
 */

/** Shared geometry and type for every chart family. Keeping these in one place
 *  is what makes a bar chart and a mermaid diagram look drawn by one hand. */
export const CHART_METRICS = {
  /** Plot height fallback; the authoritative value is --dsl-g-chart-height. */
  height: 176,
  /** Corner radius of a bar: 4px, the same control radius family as buttons. */
  barRadius: 4,
  /** Series stroke: 1.6px reads as a drawn line, 2px reads as a highlight. */
  stroke: 1.6,
  /** Peak dot on a line series and symbol size in ECharts. */
  dot: 3,
  /** Grid line width — hairlines only, never a second axis. */
  gridWidth: 1,
  /** Tick label / legend fallback; authoritative value is --dsl-g-chart-font. */
  fontData: 11,
  fontMeta: 12,
} as const

/** Structural ink every chart family draws with. */
export interface ChartInk {
  /** Vertical/horizontal grid rules. */
  grid: string
  /** The axis rule itself (one step stronger than the grid). */
  axis: string
  /** Tick labels. */
  label: string
  /** Legend text: one step stronger than a tick label. */
  legend: string
  /** Area fill under a line series. */
  plot: string
  /** Accent, for the "this is the number" mark. */
  accent: string
}

/** Read one host theme token, resolved from the element first (custom
 *  properties inherit, so any node inside `body` sees the host sheet) and
 *  falling back to body / root for detached renders. */
export function readHostToken(name: string, fallback: string, el?: HTMLElement | null): string {
  if (typeof document === 'undefined') return fallback
  const hosts: Array<Element | null> = [el ?? null, document.body, document.documentElement]
  for (const host of hosts) {
    if (host === null) continue
    const value = getComputedStyle(host).getPropertyValue(name).trim()
    if (value !== '') return value
  }
  return fallback
}

/**
 * Resolve any CSS colour expression (`var()`, `color-mix()`, `oklch()`) to an
 * `rgb()`/`rgba()` string a canvas renderer can parse.
 *
 * Custom properties are NOT resolved by getComputedStyle — they come back as the
 * specified text, so `color-mix(in srgb, …)` must be handed to a real element
 * and read back as a computed `color`. Canvas is the final step because it
 * converts the modern colour spaces to sRGB, which ECharts and mermaid accept.
 */
export function resolveCssColor(raw: string): string | null {
  if (typeof document === 'undefined' || document.body === null) return null
  const value = raw.trim()
  if (value === '') return null

  const probe = document.createElement('span')
  probe.style.setProperty('color', value, 'important')
  if (probe.style.color === '') return null
  probe.style.setProperty('display', 'none', 'important')
  document.body.appendChild(probe)
  let color: string
  try {
    color = getComputedStyle(probe).color
  } finally {
    probe.remove()
  }
  if (/^rgba?\([\d.,\s]+\)$/i.test(color)) return color

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const context = canvas.getContext('2d')
  if (context === null) return null
  context.fillStyle = '#010203'
  const initialFillStyle = context.fillStyle
  context.fillStyle = color
  if (context.fillStyle === initialFillStyle) return null
  try {
    context.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
    return `rgba(${r}, ${g}, ${b}, ${(a ?? 255) / 255})`
  } catch {
    return null
  }
}

/** Categorical ramp token for a series index — for SVG/DOM consumers that can
 *  paint a `var()` directly. */
export function dataColorVar(index: number): string {
  return `var(--dsl-g-data-${(index % 6) + 1})`
}

/** Categorical ramp as RESOLVED literals — for canvas consumers (ECharts,
 *  mermaid) that cannot read a `var()`. */
export function dataColors(count: number, el?: HTMLElement | null): string[] {
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const token = `--dsl-g-data-${(i % 6) + 1}`
    const fallback = FALLBACK_RAMP[(i % 6) + 1]!
    const resolved = resolveCssColor(readHostToken(token, fallback, el))
    out.push(resolved ?? fallback)
  }
  return out
}

/** Last-resort ramp, used only when no DOM exists to resolve the tokens. */
const FALLBACK_RAMP: Readonly<Record<number, string>> = {
  1: 'rgb(65, 118, 230)',
  2: 'rgb(111, 152, 236)',
  3: 'rgb(143, 176, 241)',
  4: 'rgb(175, 200, 246)',
  5: 'rgb(201, 219, 250)',
  6: 'rgb(221, 233, 253)',
}

/** Structural ink, resolved for canvas consumers. */
export function chartInk(el?: HTMLElement | null): ChartInk {
  const resolve = (name: string, fallback: string): string =>
    resolveCssColor(readHostToken(name, fallback, el)) ?? fallback
  return {
    grid: resolve('--dsl-g-chart-grid', 'rgba(0, 0, 0, 0.06)'),
    axis: resolve('--dsl-g-chart-axis', 'rgba(0, 0, 0, 0.12)'),
    label: resolve('--dsl-g-chart-label', 'rgb(129, 133, 140)'),
    legend: resolve('--dsl-g-chart-legend', 'rgb(97, 102, 107)'),
    plot: resolve('--dsl-g-chart-plot', 'rgba(65, 118, 230, 0.14)'),
    accent: resolve('--dsl-g-accent', 'rgb(65, 118, 230)'),
  }
}

/** Plot height in px, from the theme token (falls back to CHART_METRICS). */
export function chartHeight(el?: HTMLElement | null): number {
  const parsed = Number.parseFloat(readHostToken('--dsl-g-chart-height', `${CHART_METRICS.height}px`, el))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : CHART_METRICS.height
}

/** Tick-label size in px, from the theme token (falls back to CHART_METRICS). */
export function chartFont(el?: HTMLElement | null): number {
  const parsed = Number.parseFloat(readHostToken('--dsl-g-chart-font', `${CHART_METRICS.fontData}px`, el))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : CHART_METRICS.fontData
}
