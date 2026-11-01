import type { GenuiCheckbox } from '../spec.ts';
import type { AnswersState, GenuiBlockProps } from './state.ts';
/**
 * Checkbox with two backwards-compatible modes:
 *
 * - no `group`: legacy local toggle + optional per-click action;
 * - with `group`: local-only multi-select state collected by a sibling submit.
 *
 * A persisted group key wins over `checked`, including an explicit empty
 * array. This lets a user clear every default-checked option without those
 * defaults reappearing after refresh.
 */
export declare function CheckboxNode({ node, onAction, answers }: {
    node: GenuiCheckbox;
    onAction?: GenuiBlockProps['onAction'];
    answers?: AnswersState | undefined;
}): import("react").JSX.Element;
