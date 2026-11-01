import type { GenuiSpec } from '../client/spec.ts';
export interface InlineContentWarning {
    path: string;
    kind: 'fenced_code' | 'markdown_table';
    replacement: 'code' | 'table';
}
/** 按组件结构检查需要块级内容诊断的 canonical 显示字段。 */
export declare function collectInlineContentWarnings(spec: GenuiSpec): InlineContentWarning[];
