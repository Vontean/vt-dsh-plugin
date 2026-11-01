import type { GenuiSpec } from './spec.ts';
interface CopyPreviewState {
    readonly expanded: ReadonlySet<string>;
    readonly toggle: (path: string) => void;
}
export declare const CopyPreviewContext: import("react").Context<CopyPreviewState | undefined>;
/** Reply-local state, including temporarily unmounted tab/accordion children.
 * GenuiBlock's existing identity owns its lifetime; nothing is persisted. */
export declare function useCopyPreviewState(spec: GenuiSpec): CopyPreviewState;
export {};
