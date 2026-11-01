import type { GenuiEChart } from './spec.ts';
export declare const CORE_PRESETS: ReadonlySet<string>;
/** 依照 renderer 共用的 preset 规则选择 ECharts 资源。 */
export declare function echartEngineFor(node: GenuiEChart): 'echarts-core' | 'echarts-full';
