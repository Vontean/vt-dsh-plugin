import type { GenuiNode, GenuiSpec } from './spec.ts';
/** 遍历完整 GenUI 组件树，并提供每个组件在 spec 中的路径。 */
export declare function walkGenuiNodes(spec: GenuiSpec, visitor: (node: GenuiNode, path: string) => void): void;
