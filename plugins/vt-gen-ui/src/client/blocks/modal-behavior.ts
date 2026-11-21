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
import { useEffect, useRef, type RefObject } from 'react'

/** Elements a browser would put in the tab order. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

/**
 * Tab-order candidates inside a panel. Deliberately uses ancestor checks
 * instead of layout measurement: jsdom has no layout, and `inert` /
 * `aria-hidden` are exactly the signals the contract cares about.
 */
export function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(element => element.closest('[inert]') === null)
    .filter(element => element.closest('[aria-hidden="true"]') === null)
}

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
export function inertBackgroundOf(modalRoot: HTMLElement): () => void {
  const changed: HTMLElement[] = []
  let node: HTMLElement = modalRoot
  while (node.parentElement !== null) {
    const parent = node.parentElement
    for (const sibling of Array.from(parent.children)) {
      if (sibling === node || !(sibling instanceof HTMLElement)) continue
      if (sibling.hasAttribute('inert')) continue
      sibling.setAttribute('inert', '')
      changed.push(sibling)
    }
    // The block root is the prototype's boundary: beyond it lies the
    // conversation, which the modal must never disable. `data-genui` with a
    // type value marks a component, not the block.
    if (parent.getAttribute('data-genui') === '') break
    if (parent === document.body) break
    node = parent
  }
  return () => {
    for (const element of changed) element.removeAttribute('inert')
  }
}

/**
 * Last-resort focus target when the opener is gone: the page the modal was
 * drawn on, else the block root. `document.body` is never returned — dropping
 * focus on the body loses the keyboard user's place entirely.
 */
export function focusFallbackRoot(panel: HTMLElement): HTMLElement | null {
  const root = panel.closest<HTMLElement>('[data-genui="page"]')
    ?? panel.closest<HTMLElement>('[data-genui=""]')
  if (root === null) return null
  if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1')
  return root
}

export interface ModalBehaviorOptions {
  readonly open: boolean
  readonly onClose: () => void
  /** The panel that receives initial focus and traps Tab. */
  readonly panelRef: RefObject<HTMLElement | null>
  /**
   * The modal's outermost element (scrim), used as the inert boundary root.
   * Defaults to `panelRef.current` for callers whose panel is the root.
   */
  readonly rootRef?: RefObject<HTMLElement | null>
  /**
   * Element to return focus to. Defaults to whatever was focused when the
   * panel opened (normally the trigger).
   */
  readonly returnFocusTo?: RefObject<HTMLElement | null>
  /**
   * True for a user-opened panel (full contract). False for `open: true` in a
   * spec, which is a static picture: no focus move, no inert, no scroll lock.
   */
  readonly interactive?: boolean
  /** Escape / scrim dismissal. Defaults to true. */
  readonly dismissible?: boolean
}

/**
 * Wire the modal behaviour contract to an `open` flag. Effects only run while
 * open, so a closed modal costs nothing and never steals focus.
 */
export function useModalBehavior({
  open, onClose, panelRef, rootRef, returnFocusTo, interactive = true, dismissible = true,
}: ModalBehaviorOptions): void {
  // Keep the latest close handler without re-subscribing the key listener on
  // every render (the node layer may pass an inline arrow).
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  // Open/close effect: focus in, inert the background, lock the page scroll,
  // and on close put focus back where it came from.
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (panel === null) return

    // A static `open: true` has no opener to return to: focusing whatever was
    // active before (usually `document.body`) would be wrong.
    const active = document.activeElement
    const opener = interactive
      ? returnFocusTo?.current
        // `document.body` is not an opener: focusing it on close would drop
        // the reader at the top of the page.
        ?? (active instanceof HTMLElement && active !== document.body ? active : null)
      : null
    const restoreBackground = interactive ? inertBackgroundOf(rootRef?.current ?? panel) : () => {}
    const previousOverflow = document.body.style.overflow
    if (interactive) {
      document.body.style.overflow = 'hidden'
      // Auto-focus is not keyboard navigation: focus the first control, else
      // the panel itself. `preventScroll` keeps the page from jumping.
      const initial = focusableWithin(panel)[0] ?? panel
      initial.focus({ preventScroll: true })
    }

    return () => {
      if (interactive) document.body.style.overflow = previousOverflow
      restoreBackground()
      const target = opener?.isConnected === true
        ? opener
        : (panel.contains(document.activeElement) ? focusFallbackRoot(panel) : null)
      if (target !== null) target.focus({ preventScroll: true })
    }
  }, [open, panelRef, rootRef, interactive, returnFocusTo])

  // Keyboard contract while it is an active modal: Escape closes (when
  // dismissible), Tab cycles inside.
  useEffect(() => {
    if (!open || !interactive) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (!dismissible) return
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const panel = panelRef.current
      if (panel === null) return
      const focusables = focusableWithin(panel)
      if (focusables.length === 0) {
        event.preventDefault()
        panel.focus({ preventScroll: true })
        return
      }
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      const active = document.activeElement
      const inside = active instanceof HTMLElement && panel.contains(active)
      if (event.shiftKey) {
        if (!inside || active === first) {
          event.preventDefault()
          last.focus({ preventScroll: true })
        }
      } else if (!inside || active === last) {
        event.preventDefault()
        first.focus({ preventScroll: true })
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, interactive, dismissible, panelRef])
}
