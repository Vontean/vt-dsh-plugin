import type { BlockInteractionState } from '../interaction-store.ts';
import type { GenuiSpec } from '../spec.ts';
import { type CreateGenuiArtifactOptions, type GenuiArtifactV1 } from './types.ts';
/** 创建规范化 artifact，并清除密码默认值及对应的持久化字段。 */
export declare function createGenuiArtifact(spec: GenuiSpec, state?: BlockInteractionState, options?: CreateGenuiArtifactOptions): GenuiArtifactV1;
