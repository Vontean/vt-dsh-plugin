/**
 * Prototype screen state machine: rules, persistence, component behavior, and
 * the guarantee that specs without `screens` behave exactly as before.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, describe, expect, test } from 'vitest'
import { GenuiBlock } from './GenuiBlock.tsx'
import type { GenuiSpec } from './spec.ts'
import {
  clearBlockState, fenceStateKey, loadBlockState, saveBlockState,
} from './interaction-store.ts'
import {
  SCREEN_STACK_LIMIT, degradedScreenItems, goBackScreen, goToScreen,
  initialScreenState, readScreenModel, screenItems,
} from './genui-runtime/screens.ts'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function flowSpec(): GenuiSpec {
  return {
    items: [],
    initial: 'list',
    screens: {
      list: [
        { type: 'text', content: '列表页' },
        { type: 'input', id: 'name', label: '名称' },
        { type: 'button', label: '去详情', goto: 'detail' },
      ],
      detail: [
        { type: 'text', content: '详情页' },
        { type: 'button', label: '去第三屏', goto: 'third' },
      ],
      third: [{ type: 'text', content: '第三屏' }],
    },
  }
}

interface Mounted {
  container: HTMLElement
  root: Root
  unmount(): void
}

function mount(spec: GenuiSpec, props: { stateKey?: string; screenMachine?: boolean; onStateSnapshot?: (state: unknown) => void } = {}): Mounted {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => {
    root.render(<GenuiBlock spec={spec} {...props} />)
  })
  return {
    container,
    root,
    unmount() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find(candidate => candidate.textContent?.includes(text))
  if (button === undefined) throw new Error(`button "${text}" not found`)
  return button as HTMLButtonElement
}

function click(element: HTMLElement): void {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  if (setter === undefined) throw new Error('no value setter')
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  localStorage.clear()
  document.body.innerHTML = ''
})

describe('screen machine rules', () => {
  test('no screens → no state machine', () => {
    expect(readScreenModel({ items: [] })).toBeNull()
    expect(readScreenModel({ items: [], screens: {} })).toBeNull()
    expect(readScreenModel({ items: [], screens: { only: 'nope' } as never })).toBeNull()
  })

  test('initial resolves to `initial`, or the first screen when it is missing/unknown', () => {
    const model = readScreenModel({ items: [], initial: 'b', screens: { a: [], b: [] } })!
    expect(model.initial).toBe('b')
    expect(initialScreenState(model).current).toBe('b')
    const fallback = readScreenModel({ items: [], screens: { a: [], b: [] } })!
    expect(fallback.initial).toBe('a')
    expect(initialScreenState(model, { screen: 'missing' }).current).toBe('b')
  })

  test('goto pushes and switches; back pops; invalid targets are ignored', () => {
    const model = readScreenModel(flowSpec())!
    let state = initialScreenState(model)
    expect(screenItems(model, state).some(node => node.type === 'input')).toBe(true)
    state = goToScreen(model, state, 'detail')
    expect(state).toEqual({ current: 'detail', stack: ['list'] })
    expect(screenItems(model, state)[0]).toMatchObject({ content: '详情页' })
    const unchanged = goToScreen(model, state, 'missing')
    expect(unchanged).toBe(state)
    expect(goToScreen(model, state, 'detail')).toBe(state)
    state = goBackScreen(state)
    expect(state).toEqual({ current: 'list', stack: [] })
    expect(goBackScreen(state)).toBe(state)
  })

  test('the back stack is bounded', () => {
    const model = readScreenModel({ items: [], screens: { a: [], b: [] } })!
    let state = initialScreenState(model)
    for (let i = 0; i < SCREEN_STACK_LIMIT + 5; i++) state = goToScreen(model, state, state.current === 'a' ? 'b' : 'a')
    expect(state.stack.length).toBe(SCREEN_STACK_LIMIT)
  })

  test('degraded rendering exposes the initial screen only', () => {
    const model = readScreenModel(flowSpec())!
    const items = degradedScreenItems(model)
    expect(items.some(node => node.type === 'button' && node.goto === 'detail')).toBe(true)
    expect(items.some(node => node.type === 'text' && node.content === '详情页')).toBe(false)
  })
})

describe('persistence', () => {
  test('screen + stack ride the same content-fingerprint key as field values', () => {
    const raw = '{"screens":{"list":[],"detail":[]}}'
    const key = fenceStateKey('session-1', 3, raw)
    saveBlockState(key, { screen: 'detail', stack: ['list'], fields: { name: '鲸鱼' } })
    expect(loadBlockState(key)).toEqual({ screen: 'detail', stack: ['list'], fields: { name: '鲸鱼' } })

    // Same content → same key (restores); changed content → new key (resets).
    expect(fenceStateKey('session-1', 3, raw)).toBe(key)
    const changed = fenceStateKey('session-1', 3, `${raw} `)
    expect(changed).not.toBe(key)
    expect(loadBlockState(changed)).toBeNull()
    clearBlockState(key)
    expect(loadBlockState(key)).toBeNull()
  })
})

describe('component behavior', () => {
  test('renders the initial screen and hides the back bar', () => {
    const mounted = mount(flowSpec())
    expect(mounted.container.textContent).toContain('列表页')
    expect(mounted.container.textContent).not.toContain('详情页')
    expect(mounted.container.querySelector('[data-genui-screens]')).toBeNull()
    mounted.unmount()
  })

  test('goto switches screens locally and back returns', () => {
    const mounted = mount(flowSpec())
    click(buttonByText(mounted.container, '去详情'))
    expect(mounted.container.textContent).toContain('详情页')
    const backBar = mounted.container.querySelector('[data-genui-screens]')
    expect(backBar).not.toBeNull()
    click(mounted.container.querySelector('[data-genui-screens] button') as HTMLButtonElement)
    expect(mounted.container.textContent).toContain('列表页')
    expect(mounted.container.querySelector('[data-genui-screens]')).toBeNull()
    mounted.unmount()
  })

  test('form values survive screen switches', () => {
    const snapshots: Array<Record<string, unknown>> = []
    const mounted = mount(flowSpec(), { onStateSnapshot: state => snapshots.push(state as Record<string, unknown>) })
    const input = mounted.container.querySelector('input')!
    typeInto(input, '鲸鱼')
    click(buttonByText(mounted.container, '去详情'))
    expect(mounted.container.textContent).toContain('详情页')
    expect(snapshots.at(-1)).toMatchObject({ screen: 'detail', stack: ['list'], fields: { name: '鲸鱼' } })
    click(mounted.container.querySelector('[data-genui-screens] button') as HTMLButtonElement)
    expect(mounted.container.querySelector('input')!.value).toBe('鲸鱼')
    mounted.unmount()
  })

  test('an invalid goto target leaves the screen unchanged', () => {
    const mounted = mount({
      items: [],
      screens: { list: [{ type: 'button', label: '去不存在', goto: 'missing' }] },
    })
    click(buttonByText(mounted.container, '去不存在'))
    expect(mounted.container.textContent).toContain('去不存在')
    expect(mounted.container.querySelector('[data-genui-screens]')).toBeNull()
    mounted.unmount()
  })

  test('degraded mode renders the initial screen only and goto is inert', () => {
    const mounted = mount(flowSpec(), { screenMachine: false })
    expect(mounted.container.textContent).toContain('列表页')
    expect(mounted.container.querySelector('[data-genui-screens]')).toBeNull()
    // Without a navigation provider the goto button has no exit: it stays
    // disabled, exactly like an action-less button before this slice.
    expect(buttonByText(mounted.container, '去详情').disabled).toBe(true)
    click(buttonByText(mounted.container, '去详情'))
    expect(mounted.container.textContent).toContain('列表页')
    expect(mounted.container.textContent).not.toContain('详情页')
    mounted.unmount()
  })

  test('a persisted screen is restored for the same content key', () => {
    const spec = flowSpec()
    const key = fenceStateKey('session-1', 1, JSON.stringify(spec))
    saveBlockState(key, { screen: 'detail', stack: ['list'] })
    const mounted = mount(spec, { stateKey: key })
    expect(mounted.container.textContent).toContain('详情页')
    mounted.unmount()
  })

  test('changed content (new fingerprint) resets to the initial screen', () => {
    const spec = flowSpec()
    const oldKey = fenceStateKey('session-1', 1, JSON.stringify(spec))
    saveBlockState(oldKey, { screen: 'detail', stack: ['list'] })
    const changed: GenuiSpec = {
      ...flowSpec(),
      screens: {
        list: [{ type: 'text', content: '新的列表页' }],
        detail: [{ type: 'text', content: '新的详情页' }],
      },
    }
    const newKey = fenceStateKey('session-1', 1, JSON.stringify(changed))
    expect(loadBlockState(newKey)).toBeNull()
    const mounted = mount(changed, { stateKey: newKey })
    expect(mounted.container.textContent).toContain('新的列表页')
    expect(mounted.container.textContent).not.toContain('新的详情页')
    mounted.unmount()
  })
})

describe('legacy specs (no screens) keep the old behavior', () => {
  const legacy: GenuiSpec = {
    items: [
      { type: 'text', content: '旧版第一段' },
      { type: 'button', label: '没有 action 的按钮' },
      { type: 'callout', content: '旧版提示' },
    ],
  }

  test('renders items in order with no screen chrome', () => {
    const mounted = mount(legacy)
    expect(mounted.container.textContent).toContain('旧版第一段')
    expect(mounted.container.textContent).toContain('旧版提示')
    expect(mounted.container.querySelectorAll('[data-genui] > div > div')).toHaveLength(3)
    expect(mounted.container.querySelector('[data-genui-screens]')).toBeNull()
    // Action-less buttons were disabled before and stay disabled.
    expect(buttonByText(mounted.container, '没有 action 的按钮').disabled).toBe(true)
    mounted.unmount()
  })

  test('durable state keeps the legacy shape (no screen/stack keys)', () => {
    const snapshots: Array<Record<string, unknown>> = []
    const mounted = mount(legacy, { onStateSnapshot: state => snapshots.push(state as Record<string, unknown>) })
    const snapshot = snapshots.at(-1)!
    expect(snapshot).not.toHaveProperty('screen')
    expect(snapshot).not.toHaveProperty('stack')
    mounted.unmount()
  })

  test('screen listeners accept legacy specs without changing them', () => {
    expect(readScreenModel(legacy)).toBeNull()
  })
})
