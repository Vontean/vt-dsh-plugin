import type { GenuiBlockProps } from './blocks/state.ts';
export declare const GENUI_ACTION_DEBOUNCE_MS = 300;
/**
 * Render a GenUI spec as an inline block. `stateKey` is also the durable
 * component identity. A streaming instance adopts its first durable key so
 * inputs and pending actions survive settling. Leaving an existing durable
 * key remounts, keeping different blocks' interaction state isolated.
 */
export declare const GenuiBlock: import("react").NamedExoticComponent<GenuiBlockProps>;
