/**
 * Localized labels required by the DSH UI primitives.
 *
 * The primitives take their chrome as plain label objects, so these are built
 * PER RENDER from the active locale (`labelsOf*()`) rather than frozen at
 * module load — a language switch must reach a diff or JSON tree that is
 * already on screen.
 */
import type { DiffBlockLabels, JsonTreeLabels } from './primitive-adapter.ts';
/** Chrome labels for an inline GenUI diff block, in the active locale. */
export declare function diffBlockLabels(): DiffBlockLabels;
/** Copy labels for a code block rendered inside a GenUI fence or node. */
export declare function codeBlockLabels(): {
    copyLabel: string;
    copiedLabel: string;
};
/** Chrome labels for an inline GenUI JSON tree, in the active locale. */
export declare function jsonTreeLabels(): JsonTreeLabels;
