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
export declare const CHART_METRICS: {
    /** Plot height fallback; the authoritative value is --dsl-g-chart-height. */
    readonly height: 176;
    /** Corner radius of a bar: 4px, the same control radius family as buttons. */
    readonly barRadius: 4;
    /** Series stroke: 1.6px reads as a drawn line, 2px reads as a highlight. */
    readonly stroke: 1.6;
    /** Peak dot on a line series and symbol size in ECharts. */
    readonly dot: 3;
    /** Grid line width — hairlines only, never a second axis. */
    readonly gridWidth: 1;
    /** Tick label / legend fallback; authoritative value is --dsl-g-chart-font. */
    readonly fontData: 11;
    readonly fontMeta: 12;
};
/** Structural ink every chart family draws with. */
export interface ChartInk {
    /** Vertical/horizontal grid rules. */
    grid: string;
    /** The axis rule itself (one step stronger than the grid). */
    axis: string;
    /** Tick labels. */
    label: string;
    /** Legend text: one step stronger than a tick label. */
    legend: string;
    /** Area fill under a line series. */
    plot: string;
    /** Accent, for the "this is the number" mark. */
    accent: string;
}
/** Read one host theme token, resolved from the element first (custom
 *  properties inherit, so any node inside `body` sees the host sheet) and
 *  falling back to body / root for detached renders. */
export declare function readHostToken(name: string, fallback: string, el?: HTMLElement | null): string;
/**
 * Resolve any CSS colour expression (`var()`, `color-mix()`, `oklch()`) to an
 * `rgb()`/`rgba()` string a canvas renderer can parse.
 *
 * Custom properties are NOT resolved by getComputedStyle — they come back as the
 * specified text, so `color-mix(in srgb, …)` must be handed to a real element
 * and read back as a computed `color`. Canvas is the final step because it
 * converts the modern colour spaces to sRGB, which ECharts and mermaid accept.
 */
export declare function resolveCssColor(raw: string): string | null;
/** Categorical ramp token for a series index — for SVG/DOM consumers that can
 *  paint a `var()` directly. */
export declare function dataColorVar(index: number): string;
/** Categorical ramp as RESOLVED literals — for canvas consumers (ECharts,
 *  mermaid) that cannot read a `var()`. */
export declare function dataColors(count: number, el?: HTMLElement | null): string[];
/** Structural ink, resolved for canvas consumers. */
export declare function chartInk(el?: HTMLElement | null): ChartInk;
/** Plot height in px, from the theme token (falls back to CHART_METRICS). */
export declare function chartHeight(el?: HTMLElement | null): number;
/** Tick-label size in px, from the theme token (falls back to CHART_METRICS). */
export declare function chartFont(el?: HTMLElement | null): number;
