import type { ReactNode } from 'react';
import type { GenuiChart, GenuiTable } from '../spec.ts';
export declare const CHART_COLORS: string[];
/**
 * Sortable numeric value of a cell. Human-written table cells are rarely
 * plain numbers, so the sort accepts the usual decorations:
 * `1,234` / `1，234`（千分位）、`1.2k`/`3M`/`5b`、`3.5万`/`2亿`、`0.3%`、
 * `¥99`/`$12`。A cell that cannot be read as a number returns NaN and the
 * row falls back to the text comparison — mixed columns sort deterministically
 * (numbers first, then text).
 */
export declare function parseSortableNumber(v: unknown): number;
/** Markdown table text for the 复制 Markdown chip (pipes escaped). */
export declare function tableToMarkdown(columns: string[], rows: Array<Array<string | number>>): string;
/** RFC 4180 CSV text for the 复制 CSV chip. */
export declare function tableToCsv(rows: Array<Array<string | number>>): string;
export declare const TableNode: import("react").NamedExoticComponent<{
    node: GenuiTable;
    /** Live value of `node.filter`: substring-match rows locally. */
    filterValue?: string | undefined;
    /** Live value of `node.sortField`: a column header to sort by. */
    sortValue?: string | undefined;
    /** Renders a row's detail nodes. Supplied by render-node so the table never
     *  has to import the renderer back (import cycle). The details lookup index
     *  identifies the occurrence even when rows are sorted or arrays are reused. */
    renderDetail?: ((items: NonNullable<GenuiTable["details"]>[number] & object[], detailIndex: number) => ReactNode) | undefined;
}>;
/** 计算数字用普通或指数形式表示时所需的小数位数。 */
export declare function fractionDigits(value: number): number;
/** 按参与计算的原始数值精度格式化图表合计。 */
export declare function formatChartValue(value: number, maxFractionDigits: number): string;
/** Chart: bars (default), line (trend), or donut (share); multi-series bars via `series`. */
export declare const ChartNode: import("react").NamedExoticComponent<{
    chart: GenuiChart;
    /** Live value of the control bound via `chart.filter`; keeps matching
     *  categories only (label substring), so a chart is explorable locally. */
    filterValue?: string | undefined;
}>;
/** Bars: one column per datum (grouped bars when `series` is present).
 *  Single-series bars render against a true zero line, so negative values
 *  draw downward instead of clamping to zero height. */
export declare const BarsNode: import("react").NamedExoticComponent<{
    chart: GenuiChart;
}>;
/** Line: responsive polyline with an area wash, nice y ticks and sampled x
 *  labels drawn in SVG at their real size. */
export declare const LineChartNode: import("react").NamedExoticComponent<{
    chart: GenuiChart;
}>;
/** Donut: share of total with a center total and a legend that shows each
 *  slice's value AND percentage (the old legend was unstyled text). */
export declare const DonutNode: import("react").NamedExoticComponent<{
    chart: GenuiChart;
}>;
