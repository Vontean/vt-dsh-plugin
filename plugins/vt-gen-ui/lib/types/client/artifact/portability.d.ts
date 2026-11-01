import type { GenuiSpec } from '../spec.ts';
import type { GenuiPortabilityReport } from './types.ts';
/** 扫描嵌套 GenUI 节点，选择运行资源并列出独立页面限制。 */
export declare function analyzeGenuiPortability(spec: GenuiSpec): GenuiPortabilityReport;
