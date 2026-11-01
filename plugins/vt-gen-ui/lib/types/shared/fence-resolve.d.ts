/**
 * 使用浏览器 renderer 与 Node 侧最终回复反馈守卫共用的流程解析 dsh-ui 围栏正文。
 * @module dsh-vt-gen-ui/shared/fence-resolve
 */
import { type GenuiProcessResult } from '../client/guard.ts';
import type { GenuiSpec } from '../client/spec.ts';
/** 控制是否允许采用结构化 JSON 修复的选项。 */
export interface FenceResolveOptions {
    /** 回合结束后的回复允许使用 tier-2 补全修复。 */
    readonly settled: boolean;
}
/** 一次围栏候选正文经过规格守卫后的结果。 */
export interface FenceResolution {
    /** 参与本次规格处理的解析值；没有可解析值时为 null。 */
    readonly value: unknown | null;
    /** 规格守卫输出的诊断；没有可解析值时为 null。 */
    readonly processed: GenuiProcessResult | null;
    /** 可渲染的 spec；无法渲染时为 null。 */
    readonly spec: GenuiSpec | null;
}
/**
 * 使用 renderer 的统一流程解析原始 dsh-ui 正文。
 *
 * 流式生成期间可以使用 tier-1 修复。tier-2 补全修复只允许用于回合结束后的回复，
 * 防止未完成的正文提前渲染。
 *
 * @param raw - dsh-ui 围栏标记之间的原始正文。
 * @param options - 流式或回合结束后的解析策略。
 * @returns 通过规格守卫的渲染 spec；正文无法渲染时返回 null。
 */
export declare function resolveFence(raw: string, options: FenceResolveOptions): FenceResolution;
/**
 * 只返回统一围栏解析流程的可渲染 spec。
 *
 * @param raw - dsh-ui 围栏标记之间的原始正文。
 * @param options - 流式或回合结束后的解析策略。
 * @returns 通过规格守卫的渲染 spec；正文无法渲染时返回 null。
 */
export declare function resolveFenceSpec(raw: string, options: FenceResolveOptions): GenuiSpec | null;
