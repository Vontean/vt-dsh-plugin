/**
 * Modal behaviour contract (`prototype-channel.md` + visual rules §6.8).
 *
 * The rules are behavioural, not visual:
 * - a user-opened panel moves focus into it;
 * - Tab / Shift+Tab cycle inside the panel and never escape to the page;
 * - the background is `inert` while it is an active modal;
 * - the page does not scroll while it is an active modal;
 * - Escape and the scrim close it (unless `dismissible: false`);
 * - focus returns to whatever opened it, or to the page root when that element
 *   is gone — never lost to `document.body`.
 *
 * `interactive` separates the two states a modal can be in:
 * - user-opened (true): the full contract above;
 * - `open: true` from the spec (false): a picture of the state. It must NOT
 *   steal focus, inert or freeze the surrounding conversation, because it was
 *   not the reader who opened it.
 *
 * Deliberately free of field definitions: it takes `open` / `onClose` so the
 * node layer can drive it however the contract layer decides.
 */
import { type RefObject } from 'react';
/**
 * Tab-order candidates inside a panel. Deliberately uses ancestor checks
 * instead of layout measurement: jsdom has no layout, and `inert` /
 * `aria-hidden` are exactly the signals the contract cares about.
 */
export declare function focusableWithin(root: HTMLElement): HTMLElement[];
/**
 * Mark everything OUTSIDE the modal as inert by walking up from the modal's
 * own root and inerting the siblings of the ancestor path — the modal's
 * ancestors stay live because they contain it. Stops at the block root
 * (`data-genui=""`), so the rest of the conversation is never disabled.
 *
 * `modalRoot` must be the modal's outermost element, not the panel: the panel's
 * parent is already inside the modal, and stopping there would leave the whole
 * page interactive.
 *
 * Returns a restore function; idempotent so unmount after close is safe.
 */
export declare function inertBackgroundOf(modalRoot: HTMLElement): () => void;
/**
 * Last-resort focus target when the opener is gone: the page the modal was
 * drawn on, else the block root. `document.body` is never returned — dropping
 * focus on the body loses the keyboard user's place entirely.
 */
export declare function focusFallbackRoot(panel: HTMLElement): HTMLElement | null;
export interface ModalBehaviorOptions {
    readonly open: boolean;
    readonly onClose: () => void;
    /** The panel that receives initial focus and traps Tab. */
    readonly panelRef: RefObject<HTMLElement | null>;
    /**
     * The modal's outermost element (scrim), used as the inert boundary root.
     * Defaults to `panelRef.current` for callers whose panel is the root.
     */
    readonly rootRef?: RefObject<HTMLElement | null>;
    /**
     * Element to return focus to. Defaults to whatever was focused when the
     * panel opened (normally the trigger).
     */
    readonly returnFocusTo?: RefObject<HTMLElement | null>;
    /**
     * True for a user-opened panel (full contract). False for `open: true` in a
     * spec, which is a static picture: no focus move, no inert, no scroll lock.
     */
    readonly interactive?: boolean;
    /** Escape / scrim dismissal. Defaults to true. */
    readonly dismissible?: boolean;
}
/**
 * Wire the modal behaviour contract to an `open` flag. Effects only run while
 * open, so a closed modal costs nothing and never steals focus.
 */
export declare function useModalBehavior({ open, onClose, panelRef, rootRef, returnFocusTo, interactive, dismissible, }: ModalBehaviorOptions): void;
