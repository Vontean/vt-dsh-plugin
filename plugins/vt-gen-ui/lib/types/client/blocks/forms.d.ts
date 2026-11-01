import type { RadioSubmissionMember } from '../submission-registry.ts';
import type { AnswersState, GenuiBlockProps } from './state.ts';
import type { GenuiInput, GenuiRadio, GenuiSelect, GenuiSlider, GenuiSubmit, GenuiSwitch, GenuiTextarea } from '../spec.ts';
export declare function RadioNode({ node, onAction, answers }: {
    node: GenuiRadio;
    onAction?: GenuiBlockProps['onAction'];
    answers?: AnswersState | undefined;
}): import("react").JSX.Element;
/** 根据静态 radio member 获取正确选项的标签。 */
export declare function correctLabelOf(m: RadioSubmissionMember): string | undefined;
/** 汇总当前 block 的表单状态，并根据 resolver 的结果提交或本地判卷。 */
export declare function SubmitNode({ node, onAction, answers }: {
    node: GenuiSubmit;
    onAction?: GenuiBlockProps['onAction'];
    answers?: AnswersState | undefined;
}): import("react").JSX.Element;
/** Switch: toggle with local state. */
export declare function SwitchNode({ node, onAction }: {
    node: GenuiSwitch;
    onAction?: GenuiBlockProps['onAction'];
}): import("react").JSX.Element;
/** Slider: range input for numeric form values (v2.9). Field-aligned: with an
 * `id` the value persists across refresh and joins the sibling submit's
 * `fields` collection (stored as the numeric string); a model-provided
 * default registers at mount; a restored durable value wins. Dragging fires
 * the action (block-level debounce collapses the drag into one delivery). */
export declare function SliderNode({ node, onAction, answers }: {
    node: GenuiSlider;
    onAction?: GenuiBlockProps['onAction'];
    answers?: AnswersState | undefined;
}): import("react").JSX.Element;
/** Reuse the DSH main input's three-layer IME protection (verified in the
 *  host InputBar): composition start arms a ref, composition end clears it
 *  10ms later (Safari sends the closing keydown BEFORE compositionend), and
 *  every submit keydown re-checks the ref, the native `isComposing` flag,
 *  and `keyCode === 229`. A Chinese selection Enter must never submit. */
export declare function useImeComposing(): {
    isComposing: () => boolean;
    onCompositionStart: () => void;
    onCompositionEnd: () => void;
};
export declare function isImeSubmitKeydown(e: React.KeyboardEvent): boolean;
/** Select: single choice from a dropdown, field-aligned (v2.8). With an `id`
 * the chosen option persists across refresh and joins the sibling submit's
 * `fields` collection; a model-provided `selected` default registers at
 * mount; a restored durable value wins over both. Without any default a
 * placeholder option shows — nothing is silently pre-registered (same
 * philosophy as radio). */
export declare function SelectNode({ node, onAction, answers }: {
    node: GenuiSelect;
    onAction?: GenuiBlockProps['onAction'];
    answers?: AnswersState | undefined;
}): import("react").JSX.Element;
/** Input: single-line field. Controlled (value tracked for persistence and
 *  submit collection when `id` is set). With `action`: Enter submits
 *  immediately (`{type:'input', value, submit:true}`), blur sends too —
 *  the user never has to click elsewhere for the value to reach the model.
 *  Enter during IME composition never submits. `inputType: 'password'`
 *  stays masked; its value is never persisted and never joins submit
 *  collection (secrets stay out of localStorage), while its own `action`
 *  still delivers on explicit user submit. */
export declare function InputNode({ node, onAction, answers }: {
    node: GenuiInput;
    onAction?: GenuiBlockProps['onAction'];
    answers?: AnswersState | undefined;
}): import("react").JSX.Element;
/** Textarea: multi-line input; with `action`, blurring sends the value and
 *  Ctrl/Cmd+Enter submits immediately. Controlled when `id` is set (durable
 *  value + submit collection). Ctrl/Cmd+Enter during IME composition never
 *  submits. */
export declare function TextareaNode({ node, onAction, answers }: {
    node: GenuiTextarea;
    onAction?: GenuiBlockProps['onAction'];
    answers?: AnswersState | undefined;
}): import("react").JSX.Element;
/** Accordion: collapsible sections with local open state. Headings and
 * bodies are wired via useId (`aria-controls`/`aria-labelledby`). */
