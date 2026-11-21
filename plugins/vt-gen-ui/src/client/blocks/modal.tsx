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
import { useCallback, useId, useRef, useState, type ReactNode } from 'react'
import css from './Prototype.module.css'
import { renderInline } from '../inline.ts'
import { ModalCloseContext } from '../modal-close.tsx'
import type { GenuiModal } from '../spec.ts'
import { useModalBehavior } from './modal-behavior.ts'
import type { PrototypeRenderProps } from './prototype.tsx'

export type ModalVariant = 'dialog' | 'sheet'

export interface ModalFrameProps {
  readonly open: boolean
  readonly variant?: ModalVariant
  /** Id of the title element; the caller owns it (the node layer uses useId). */
  readonly titleId: string
  readonly title: ReactNode
  readonly children: ReactNode
  readonly actions?: ReactNode
  /** Called by Escape and by a click on the scrim (never by clicks inside). */
  readonly onClose: () => void
  /** Element that opened the modal; focus returns here on close. */
  readonly returnFocusTo?: React.RefObject<HTMLElement | null>
  /**
   * True when a user opened it. False for `open: true` in a spec, which is a
   * static picture and must not seize focus / inert / scroll.
   */
  readonly interactive?: boolean
  /** Escape and scrim dismissal. Defaults to true. */
  readonly dismissible?: boolean
}

export function ModalFrame({
  open, variant = 'dialog', titleId, title, children, actions, onClose, returnFocusTo,
  interactive = true, dismissible = true,
}: ModalFrameProps): ReactNode {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  useModalBehavior({
    open, onClose, panelRef, rootRef: overlayRef, interactive, dismissible,
    ...(returnFocusTo === undefined ? {} : { returnFocusTo }),
  })
  // React 18 types do not know the `inert` attribute; spreading a plain record
  // sets it without a boolean-attribute warning.
  const closedProps: Record<string, string> = open ? {} : { inert: '' }
  return (
    <div
      ref={overlayRef}
      className={css.modalOverlay}
      data-genui="modal"
      data-variant={variant}
      data-open={open ? 'true' : 'false'}
      data-interactive={interactive ? 'true' : 'false'}
      data-dismissible={dismissible ? 'true' : 'false'}
      onClick={event => {
        // Only the scrim itself closes: a click that bubbled from the panel
        // must not dismiss the modal, and `dismissible: false` means the
        // action row is the only way out.
        if (dismissible && event.target === event.currentTarget) onClose()
      }}
      {...closedProps}
    >
      <div
        ref={panelRef}
        className={css.modalPanel}
        data-variant={variant}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h3 className={css.modalTitle} id={titleId}>{title}</h3>
        <div className={css.modalBody}>{children}</div>
        {actions !== undefined && <div className={css.modalActions}>{actions}</div>}
      </div>
    </div>
  )
}

/**
 * `modal`: trigger button + panel. The trigger only opens — it never carries
 * an action, so opening a dialog costs no model round trip. Buttons inside the
 * panel close it with `close: true` (see `ButtonNode`).
 */
export function ModalNode({ node, path, renderChildren }: PrototypeRenderProps<GenuiModal>): ReactNode {
  const titleId = useId()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState(node.open === true)
  // Only a click flips this: `open: true` from the spec is a picture of the
  // state and must not behave like an active modal.
  const [interactive, setInteractive] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const openPanel = useCallback(() => {
    setInteractive(true)
    setOpen(true)
  }, [])
  const trigger = node.trigger
  const actions = node.actions !== undefined && node.actions.length > 0
    ? renderChildren(node.actions, `${path}.actions`)
    : undefined
  return (
    <>
      {trigger !== undefined && trigger !== '' && (
        <div className={css.modalTriggerRow}>
          <button
            ref={triggerRef}
            type="button"
            className={css.modalTrigger}
            aria-haspopup="dialog"
            onClick={openPanel}
          >
            {renderInline(trigger, false)}
          </button>
        </div>
      )}
      <ModalCloseContext.Provider value={{ close }}>
        <ModalFrame
          open={open}
          variant={node.variant ?? 'dialog'}
          interactive={interactive}
          dismissible={node.dismissible !== false}
          titleId={titleId}
          title={renderInline(node.title)}
          onClose={close}
          returnFocusTo={triggerRef}
          children={renderChildren(node.items ?? [], `${path}.items`)}
          {...(actions === undefined ? {} : { actions })}
        />
      </ModalCloseContext.Provider>
    </>
  )
}
