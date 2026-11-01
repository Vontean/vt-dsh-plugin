/**
 * GenUI 节点诊断共享逻辑。
 * @module dsh-vt-gen-ui/plugin/genui-diagnostic
 */
import type { GenuiProcessResult } from '../client/guard.ts';
/**
 * 报告被丢弃的组件，并保留模型可以直接修正的字段信息。
 *
 * @param processed - 节点处理结果。
 * @param raw - 节点处理使用的原始值。
 * @returns 可嵌入调用方协议的诊断字段；没有节点被丢弃时返回 undefined。
 */
export declare function droppedNodeFailure(processed: GenuiProcessResult, raw: unknown): string[] | undefined;
