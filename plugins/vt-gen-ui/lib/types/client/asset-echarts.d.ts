/**
 * ECharts FULL asset-bundle entry: the complete engine, fetched only when a
 * spec needs a chart type outside the core set or ships a raw `option`.
 * Registers on `window.__VtGenuiAssets__.echartsFull`. Built as a standalone IIFE into
 * `lib/assets/echarts.js` and served by the plugin's node-half route; loaded
 * on demand by echarts-lazy when a spec contains an `echart` node.
 * @module dsh-vt-gen-ui/client/asset-echarts
 */
import { type EChartsType, type EChartsCoreOption } from 'echarts';
import 'echarts-wordcloud';
/** The engine surface registered by the echarts asset bundle. */
export interface EChartsAssetApi {
    /** Create an ECharts instance on `el`, apply `option`, return the instance. */
    createChart: (el: HTMLElement, option: EChartsCoreOption, opts?: {
        height?: number;
    }) => EChartsType;
}
