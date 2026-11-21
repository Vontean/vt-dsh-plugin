/**
 * Modal behaviour contract — one test per rule from `prototype-channel.md`:
 * focus in, Tab cycling, background inert, scroll lock, Escape, focus return,
 * dialog semantics, and "narrow container does not swap dialog for sheet".
 *
 * These run against the real `ModalFrame`, so the behavioural wiring is the
 * one that ships, not a re-implementation.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, useRef, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ModalFrame } from './modal.tsx'

// React 18: effects flushed inside act() require this flag.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Harness({
  open, onClose = () => {}, variant, interactive = true, dismissible = true, withTrigger = true,
}: {
  open: boolean
  onClose?: () => void
  variant?: 'dialog' | 'sheet'
  interactive?: boolean
  dismissible?: boolean
  withTrigger?: boolean
}): ReactElement {
  const trigger = useRef<HTMLButtonElement | null>(null)
  return (
    <div data-genui="">
      {withTrigger && <button ref={trigger} id="trigger" type="button">打开弹层</button>}
      <p id="background">背景内容</p>
      <ModalFrame
        open={open}
        onClose={onClose}
        interactive={interactive}
        dismissible={dismissible}
        {...(variant === undefined ? {} : { variant })}
        titleId="modal-title"
        title="删除这个任务？"
        {...(withTrigger ? { returnFocusTo: trigger } : {})}
        actions={(
          <>
            <button id="cancel" type="button">取消</button>
            <button id="confirm" type="button">删除</button>
          </>
        )}
      >
        <p id="modal-text">删除后无法恢复，关联的 3 条记录会同时移除。</p>
      </ModalFrame>
    </div>
  )
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  document.body.style.overflow = ''
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.style.overflow = ''
})

const render = (element: ReactElement): void => {
  act(() => root.render(element))
}

const press = (key: string, shiftKey = false): void => {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }))
  })
}

const overlayOf = (): HTMLElement => container.querySelector('[data-genui="modal"]') as HTMLElement

describe('dialog semantics', () => {
  test('open panel is a labelled modal dialog', () => {
    render(<Harness open />)
    const overlay = overlayOf()
    expect(overlay.getAttribute('data-open')).toBe('true')
    expect(overlay.hasAttribute('inert')).toBe(false)
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const labelId = dialog.getAttribute('aria-labelledby')!
    expect(container.querySelector(`[id="${labelId}"]`)!.textContent).toBe('删除这个任务？')
    expect(container.querySelector('#modal-text')).not.toBeNull()
  })

  test('a closed modal is inert and cannot be clicked', () => {
    render(<Harness open={false} />)
    const overlay = overlayOf()
    expect(overlay.getAttribute('data-open')).toBe('false')
    expect(overlay.hasAttribute('inert')).toBe(true)
  })

  test('sheet is a variant of the same modal, not a separate role', () => {
    render(<Harness open variant="sheet" />)
    expect(overlayOf().getAttribute('data-variant')).toBe('sheet')
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
  })
})

describe('focus contract', () => {
  test('opening moves focus to the first control in the panel', () => {
    render(<Harness open={false} />)
    const trigger = container.querySelector('#trigger') as HTMLElement
    act(() => trigger.focus())
    expect(document.activeElement).toBe(trigger)

    render(<Harness open />)
    expect(document.activeElement).toBe(container.querySelector('#cancel'))
  })

  test('Tab from the last control wraps to the first', () => {
    render(<Harness open />)
    const cancel = container.querySelector('#cancel') as HTMLElement
    const confirm = container.querySelector('#confirm') as HTMLElement
    act(() => confirm.focus())
    press('Tab')
    expect(document.activeElement).toBe(cancel)
  })

  test('Shift+Tab from the first control wraps to the last', () => {
    render(<Harness open />)
    const cancel = container.querySelector('#cancel') as HTMLElement
    const confirm = container.querySelector('#confirm') as HTMLElement
    act(() => cancel.focus())
    press('Tab', true)
    expect(document.activeElement).toBe(confirm)
  })

  test('closing returns focus to whatever opened the panel', () => {
    render(<Harness open={false} />)
    const trigger = container.querySelector('#trigger') as HTMLElement
    act(() => trigger.focus())
    render(<Harness open />)
    expect(document.activeElement).toBe(container.querySelector('#cancel'))
    render(<Harness open={false} />)
    expect(document.activeElement).toBe(trigger)
  })
})

describe('dismissal and page isolation', () => {
  test('Escape closes', () => {
    const onClose = vi.fn()
    render(<Harness open onClose={onClose} />)
    press('Escape')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('the scrim closes, a click inside the panel does not', () => {
    const onClose = vi.fn()
    render(<Harness open onClose={onClose} />)
    act(() => (container.querySelector('#modal-text') as HTMLElement).click())
    expect(onClose).not.toHaveBeenCalled()
    act(() => overlayOf().click())
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('the background is inert while open and restored after close', () => {
    render(<Harness open />)
    const trigger = container.querySelector('#trigger') as HTMLElement
    const background = container.querySelector('#background') as HTMLElement
    expect(trigger.hasAttribute('inert')).toBe(true)
    expect(background.hasAttribute('inert')).toBe(true)
    // The modal's own subtree must stay live.
    expect((container.querySelector('[role="dialog"]') as HTMLElement).hasAttribute('inert')).toBe(false)

    render(<Harness open={false} />)
    expect(trigger.hasAttribute('inert')).toBe(false)
    expect(background.hasAttribute('inert')).toBe(false)
  })

  test('the page cannot scroll while open, and recovers its previous value', () => {
    document.body.style.overflow = 'auto'
    render(<Harness open />)
    expect(document.body.style.overflow).toBe('hidden')
    render(<Harness open={false} />)
    expect(document.body.style.overflow).toBe('auto')
  })
})

describe('static open: a picture of the state, not an interaction', () => {
  test('open: true does not steal focus', () => {
    render(<Harness open={false} interactive={false} />)
    const trigger = container.querySelector('#trigger') as HTMLElement
    act(() => trigger.focus())
    render(<Harness open interactive={false} />)
    // The reader did not open this panel; moving their focus would be a lie.
    expect(document.activeElement).toBe(trigger)
  })

  test('open: true does not inert the page or lock scrolling', () => {
    render(<Harness open interactive={false} />)
    const trigger = container.querySelector('#trigger') as HTMLElement
    expect(trigger.hasAttribute('inert')).toBe(false)
    expect(document.body.style.overflow).toBe('')
  })

  test('Escape is not hijacked by a static open panel', () => {
    const onClose = vi.fn()
    render(<Harness open interactive={false} onClose={onClose} />)
    press('Escape')
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('dismissible: false', () => {
  test('Escape and the scrim do nothing; the action row is the only exit', () => {
    const onClose = vi.fn()
    render(<Harness open dismissible={false} onClose={onClose} />)
    press('Escape')
    act(() => overlayOf().click())
    expect(onClose).not.toHaveBeenCalled()
    // The action row is rendered and still able to close (asserted at the
    // node level in modal-node.test.tsx).
    expect(container.querySelectorAll('[role="dialog"] button')).toHaveLength(2)
  })
})

describe('focus return fallback', () => {
  test('when the trigger is gone, focus lands on the page root — never on body', () => {
    render(<Harness open withTrigger={false} />)
    // No trigger and no opener: initial focus went into the panel.
    expect(document.activeElement).toBe(container.querySelector('#cancel'))
    render(<Harness open={false} withTrigger={false} />)
    const root = container.querySelector('[data-genui=""]') as HTMLElement
    expect(document.activeElement).toBe(root)
    expect(document.activeElement).not.toBe(document.body)
  })
})

describe('visual contract (§6.8)', () => {
  const cssSource = readFileSync(resolve(import.meta.dirname, 'Prototype.module.css'), 'utf8')
  const modalSection = (): string =>
    cssSource.slice(cssSource.indexOf('/* ---- modal'), cssSource.indexOf('/* ---- container queries'))
  const stripComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '')

  test('the scrim comes from the host mask token, not a hand-picked percentage', () => {
    // The host owns the two theme values (24% light / 50% dark); a fixed
    // percentage over-darkens light mode and cannot follow the theme.
    expect(cssSource).toContain('--proto-scrim: var(--dsw-alias-bg-mask-1)')
    expect(cssSource).not.toMatch(/--proto-scrim:[^;]*color-mix/)
    expect(cssSource).not.toMatch(/--proto-scrim:[^;]*label-primary/)
  })

  test('the overlay never uses position: fixed', () => {
    expect(stripComments(modalSection())).not.toContain('position: fixed')
    expect(stripComments(modalSection())).toContain('position: absolute')
    expect(stripComments(modalSection())).toContain('z-index: 10')
  })

  test('the panel has a shadow and no outline', () => {
    const panel = stripComments(modalSection())
    expect(panel).toContain('var(--dsl-g-shadow-float)')
    // Border + shadow never stack (§2.4).
    expect(panel).not.toMatch(/\.modalPanel\s*\{[^}]*border:\s*1px/)
  })

  test('dialog and sheet keep their own geometry', () => {
    const panel = stripComments(modalSection())
    expect(panel).toContain('width: min(360px, 100%)')
    expect(panel).toContain('padding: 24px')
    expect(panel).toContain('border-radius: var(--proto-radius-page) var(--proto-radius-page) 0 0')
    expect(panel).toContain('align-items: flex-end')
  })

  test('motion uses the existing fast duration and eases out', () => {
    const panel = stripComments(modalSection())
    expect(panel).toContain('var(--dsl-g-dur-fast) var(--dsl-g-ease-out)')
    expect(panel).not.toContain('position: fixed')
    expect(panel).not.toContain('scale(')
  })

  test('reduced motion shows and hides instantly', () => {
    const section = stripComments(modalSection())
    const reduced = section.slice(section.indexOf('prefers-reduced-motion'))
    expect(reduced).toContain('transition: none')
    expect(reduced).toContain('transform: none')
  })

  test('a narrow container tightens the dialog but does not turn it into a sheet', () => {
    const section = stripComments(modalSection())
    const narrow = section.slice(section.indexOf('@container proto-page (max-width: 600px)'))
    expect(narrow).toContain('padding: 16px')
    // Centring is inherited from .modalOverlay and must not be re-declared
    // here: swapping the form would turn two proposals into one component.
    expect(narrow).not.toContain('align-items')
    expect(narrow).not.toContain('border-radius')
  })
})
