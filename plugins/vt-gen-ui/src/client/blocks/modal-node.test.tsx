/**
 * `modal` node behaviour: trigger opens without an action round trip, close
 * buttons close before sending, `open: true` is a static picture, and
 * `dismissible: false` leaves the action row as the only exit.
 *
 * Rendered through `renderNode`, so the registry binding and the shared
 * `ButtonNode` close channel are exercised, not a local re-implementation.
 */
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { renderNode } from './render-node.tsx'
import { ModalCloseContext } from '../modal-close.tsx'
import type { GenuiModal, GenuiNode } from '../spec.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type ActionHandler = (action: string, payload: unknown) => void

const modal = (overrides: Partial<GenuiModal> = {}): GenuiModal => ({
  type: 'modal',
  trigger: '删除',
  title: '删除这个任务？',
  items: [{ type: 'text', content: '删除后无法恢复。' }],
  actions: [
    { type: 'button', label: '取消', close: true },
    { type: 'button', label: '删除', close: true, action: 'confirm-delete' },
  ],
  ...overrides,
})

let container: HTMLDivElement
let root: Root
let onAction: ReturnType<typeof vi.fn<ActionHandler>>

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  document.body.style.overflow = ''
  onAction = vi.fn<ActionHandler>()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.style.overflow = ''
})

const render = (element: ReactElement): void => {
  act(() => root.render(element))
}

function Harness({ node, withOutside = false }: { node: GenuiNode; withOutside?: boolean }): ReactElement {
  return (
    <div data-genui="">
      {withOutside && <button id="outside" type="button">外部按钮</button>}
      {renderNode(node, 0, onAction)}
    </div>
  )
}

const overlay = (): HTMLElement => container.querySelector('[data-genui="modal"]') as HTMLElement
const panel = (): HTMLElement => container.querySelector('[role="dialog"]') as HTMLElement
const buttons = (): HTMLElement[] => [...panel().querySelectorAll<HTMLElement>('button')]
const trigger = (): HTMLElement => container.querySelector('.modalTrigger') as HTMLElement
const byLabel = (label: string): HTMLElement =>
  buttons().find(button => button.textContent === label) as HTMLElement

describe('trigger', () => {
  test('is an outlined button that only opens the panel', () => {
    render(<Harness node={modal()} />)
    const button = trigger()
    expect(button.tagName).toBe('BUTTON')
    expect(button.getAttribute('aria-haspopup')).toBe('dialog')
    expect(overlay().getAttribute('data-open')).toBe('false')

    act(() => button.click())
    expect(overlay().getAttribute('data-open')).toBe('true')
    // Opening is local: no message, no model round trip.
    expect(onAction).not.toHaveBeenCalled()
  })

  test('a click moves focus into the panel', () => {
    render(<Harness node={modal()} />)
    act(() => trigger().click())
    expect(document.activeElement).toBe(byLabel('取消'))
  })
})

/** A display-only sketch: `open: true` and no trigger at all. */
const displayOnly = (): GenuiModal => ({
  type: 'modal',
  title: '删除这个任务？',
  open: true,
  items: [{ type: 'text', content: '删除后无法恢复。' }],
  actions: [{ type: 'button', label: '取消', close: true }],
})

describe('static open', () => {
  test('does not steal focus, inert the page or lock scrolling', () => {
    render(<Harness node={displayOnly()} withOutside />)
    const outside = container.querySelector('#outside') as HTMLElement
    act(() => outside.focus())
    render(<Harness node={displayOnly()} withOutside />)
    expect(overlay().getAttribute('data-open')).toBe('true')
    expect(overlay().getAttribute('data-interactive')).toBe('false')
    expect(document.activeElement).toBe(outside)
    expect(outside.hasAttribute('inert')).toBe(false)
    expect(document.body.style.overflow).toBe('')
  })

  test('renders no trigger when the node omits it', () => {
    render(<Harness node={displayOnly()} />)
    expect(trigger()).toBeNull()
  })

  test('still renders as a labelled dialog', () => {
    render(<Harness node={displayOnly()} />)
    const dialog = panel()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(container.querySelector(`[id="${dialog.getAttribute('aria-labelledby')}"]`)!.textContent).toBe('删除这个任务？')
  })
})

describe('close buttons', () => {
  test('a close-only button is enabled and closes the panel', () => {
    render(<Harness node={modal()} />)
    act(() => trigger().click())
    expect(overlay().getAttribute('data-open')).toBe('true')
    const cancel = byLabel('取消')
    expect(cancel.hasAttribute('disabled')).toBe(false)
    act(() => cancel.click())
    expect(overlay().getAttribute('data-open')).toBe('false')
    expect(onAction).not.toHaveBeenCalled()
  })

  test('close and action both run, with no message sent by the trigger', () => {
    render(<Harness node={modal()} />)
    act(() => trigger().click())
    act(() => byLabel('删除').click())
    expect(overlay().getAttribute('data-open')).toBe('false')
    expect(onAction).toHaveBeenCalledWith('confirm-delete', { type: 'button', label: '删除' })
  })

  test('close runs before the action is sent', () => {
    const order: string[] = []
    render(
      <ModalCloseContext.Provider value={{ close: () => order.push('close') }}>
        {renderNode({ type: 'button', label: '确认', close: true, action: 'confirm' }, 0, () => order.push('action'))}
      </ModalCloseContext.Provider>,
    )
    act(() => (container.querySelector('button') as HTMLElement).click())
    // Sending first would describe the panel as still open.
    expect(order).toEqual(['close', 'action'])
  })
})

describe('dismissible: false', () => {
  test('Escape does not close; the action row does', () => {
    render(<Harness node={modal({ dismissible: false })} />)
    act(() => trigger().click())
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })
    expect(overlay().getAttribute('data-open')).toBe('true')
    act(() => overlay().click())
    expect(overlay().getAttribute('data-open')).toBe('true')
    act(() => byLabel('取消').click())
    expect(overlay().getAttribute('data-open')).toBe('false')
  })
})

describe('several modals on one screen', () => {
  test('each trigger opens only its own panel', () => {
    render(
      <div data-genui="">
        {renderNode(modal({ trigger: '删除', title: '删除任务？' }), 0, onAction)}
        {renderNode(modal({ trigger: '归档', title: '归档任务？' }), 1, onAction)}
      </div>,
    )
    const overlays = [...container.querySelectorAll<HTMLElement>('[data-genui="modal"]')]
    expect(overlays).toHaveLength(2)
    const triggerOf = (index: number): HTMLElement =>
      [...container.querySelectorAll<HTMLElement>('.modalTrigger')][index]!
    act(() => triggerOf(1).click())
    expect(overlays[0]!.getAttribute('data-open')).toBe('false')
    expect(overlays[1]!.getAttribute('data-open')).toBe('true')
  })
})

describe('sheet variant', () => {
  test('renders the same dialog role with the sheet shape', () => {
    render(<Harness node={modal({ variant: 'sheet', open: true })} />)
    expect(overlay().getAttribute('data-variant')).toBe('sheet')
    expect(panel().getAttribute('data-variant')).toBe('sheet')
    expect(panel().getAttribute('role')).toBe('dialog')
  })
})
