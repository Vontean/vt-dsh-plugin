/**
 * Modal shell (`modal` visual rules §6.8): scrim + panel, dialog or sheet.
 *
 * Two layers live here:
 * - `ModalFrame` is presentational: title, body, action row and dialog/sheet
 *   geometry. It knows nothing about node fields.
 * - `ModalNode` is the catalog binding: it renders the trigger, owns the local
 *   open/close state, and provides the close channel that `button.close`
 *   consumes.
 *
 * Open/close is state driven by node fields — no expressions, no scripts.
 * `open: true` is a static picture (see `modal-behavior.ts`): it does not take
 * focus, inert the page or lock scrolling.
 */
import { type ReactNode } from 'react';
import type { GenuiModal } from '../spec.ts';
import type { PrototypeRenderProps } from './prototype.tsx';
export type ModalVariant = 'dialog' | 'sheet';
export interface ModalFrameProps {
    readonly open: boolean;
    readonly variant?: ModalVariant;
    /** Id of the title element; the caller owns it (the node layer uses useId). */
    readonly titleId: string;
    readonly title: ReactNode;
    readonly children: ReactNode;
    readonly actions?: ReactNode;
    /** Called by Escape and by a click on the scrim (never by clicks inside). */
    readonly onClose: () => void;
    /** Element that opened the modal; focus returns here on close. */
    readonly returnFocusTo?: React.RefObject<HTMLElement | null>;
    /**
     * True when a user opened it. False for `open: true` in a spec, which is a
     * static picture and must not seize focus / inert / scroll.
     */
    readonly interactive?: boolean;
    /** Escape and scrim dismissal. Defaults to true. */
    readonly dismissible?: boolean;
}
export declare function ModalFrame({ open, variant, titleId, title, children, actions, onClose, returnFocusTo, interactive, dismissible, }: ModalFrameProps): ReactNode;
/**
 * `modal`: trigger button + panel. The trigger only opens — it never carries
 * an action, so opening a dialog costs no model round trip. Buttons inside the
 * panel close it with `close: true` (see `ButtonNode`).
 */
export declare function ModalNode({ node, path, renderChildren }: PrototypeRenderProps<GenuiModal>): ReactNode;
