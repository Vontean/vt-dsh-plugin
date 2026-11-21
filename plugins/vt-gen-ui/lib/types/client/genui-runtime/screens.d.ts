/**
 * Prototype screen state machine (slice 2): pure functions for reading a
 * `screens` map and moving between screens.
 *
 * Kept free of React and storage so the rules are testable in isolation:
 * - `initial` wins when it names a declared screen, else the first key;
 * - `goto` pushes the current screen onto a bounded back stack;
 * - back pops that stack;
 * - an invalid target never moves the machine (a typo must not blank the UI);
 * - degradation (`screenMachine: false`) renders the initial screen only.
 */
import type { GenuiNode, GenuiSpec } from '../spec.ts';
/** Bounded back stack: enough to retrace a flow, never unbounded. */
export declare const SCREEN_STACK_LIMIT = 20;
/** Declared screens with a resolved initial screen id. */
export interface ScreenModel {
    readonly screens: Readonly<Record<string, readonly GenuiNode[]>>;
    /** Screen ids in declaration order. */
    readonly order: readonly string[];
    readonly initial: string;
}
export interface ScreenState {
    readonly current: string;
    /** Previously visited screens, oldest first. */
    readonly stack: readonly string[];
}
/** Persisted screen fields (subset of the block's durable state). */
export interface PersistedScreen {
    readonly screen?: string;
    readonly stack?: readonly string[];
}
/**
 * Read the screen map from a spec. Returns null for every legacy spec (no
 * `screens`), which keeps the non-screen rendering path byte-identical.
 */
export declare function readScreenModel(spec: Pick<GenuiSpec, 'screens' | 'initial'> & {
    readonly items?: readonly GenuiNode[];
}): ScreenModel | null;
/** Restore a persisted screen/stack, falling back to the initial screen. */
export declare function initialScreenState(model: ScreenModel, persisted?: PersistedScreen | null): ScreenState;
/** The node list for the current screen (initial items when state is stale). */
export declare function screenItems(model: ScreenModel, state: ScreenState): readonly GenuiNode[];
/** `goto`: switch screens and remember where we came from. */
export declare function goToScreen(model: ScreenModel, state: ScreenState, target: string): ScreenState;
/** Back: pop the previous screen; a no-op at the root. */
export declare function goBackScreen(state: ScreenState): ScreenState;
/**
 * Degraded rendering: when the state machine is unavailable, render the
 * initial screen only (the documented fallback for older renderers/caches).
 */
export declare function degradedScreenItems(model: ScreenModel): readonly GenuiNode[];
