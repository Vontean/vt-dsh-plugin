import { type GenuiArtifactV1 } from './types.ts';
/** 校验 artifact 格式并重新执行当前 GenUI 规范化流程。 */
export declare function parseGenuiArtifact(value: unknown): GenuiArtifactV1 | null;
