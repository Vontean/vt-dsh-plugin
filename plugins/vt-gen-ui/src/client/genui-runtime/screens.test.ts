/**
 * Prototype screen state machine: pure rules plus the guard/parse contract.
 * The machine is local-first — no action, no model round trip — so its safety
 * (invalid targets never blank the UI, back stack stays bounded) is tested
 * directly here.
 */
import { describe, expect, test } from 'vitest'
import { GENUI_LIMITS } from './limits.ts'
import {
  SCREEN_STACK_LIMIT, degradedScreenItems, goBackScreen, goToScreen, initialScreenState,
  readScreenModel, screenItems,
} from './screens.ts'
import { processGenuiSpec, repairGenuiSpec, validateGenuiSpec } from '../guard.ts'
import { parseGenuiSpec } from '../spec.ts'

const home = [{ type: 'text' as const, content: '首页' }]
const detail = [{ type: 'text' as const, content: '详情' }]

describe('screen model', () => {
  test('legacy specs have no model', () => {
    expect(readScreenModel({ items: [] })).toBeNull()
    expect(readScreenModel({ items: [], screens: [] as never })).toBeNull()
  })

  test('initial wins when declared, otherwise the first screen', () => {
    const model = readScreenModel({ screens: { home, detail }, initial: 'detail' })!
    expect(model.initial).toBe('detail')
    expect(readScreenModel({ screens: { home, detail } })!.initial).toBe('home')
    expect(readScreenModel({ screens: { home, detail }, initial: 'nope' })!.initial).toBe('home')
  })

  test('persisted state restores and drops unknown ids', () => {
    const model = readScreenModel({ screens: { home, detail } })!
    const state = initialScreenState(model, { screen: 'detail', stack: ['ghost', 'home'] })
    expect(state).toEqual({ current: 'detail', stack: ['home'] })
    expect(initialScreenState(model, { screen: 'ghost' }).current).toBe('home')
  })

  test('goto pushes history and ignores unknown or current targets', () => {
    const model = readScreenModel({ screens: { home, detail } })!
    const state = initialScreenState(model)
    const moved = goToScreen(model, state, 'detail')
    expect(moved).toEqual({ current: 'detail', stack: ['home'] })
    expect(goToScreen(model, moved, 'nope')).toBe(moved)
    expect(goToScreen(model, moved, 'detail')).toBe(moved)
    expect(screenItems(model, moved)).toBe(detail)
  })

  test('back pops the stack and is a no-op at the root', () => {
    const model = readScreenModel({ screens: { home, detail } })!
    const moved = goToScreen(model, initialScreenState(model), 'detail')
    expect(goBackScreen(moved)).toEqual({ current: 'home', stack: [] })
    expect(goBackScreen({ current: 'home', stack: [] })).toEqual({ current: 'home', stack: [] })
  })

  test('the back stack is bounded', () => {
    const model = readScreenModel({ screens: { home, detail } })!
    let state = initialScreenState(model)
    for (let i = 0; i < 40; i += 1) state = goToScreen(model, state, i % 2 === 0 ? 'detail' : 'home')
    expect(state.stack.length).toBeLessThanOrEqual(SCREEN_STACK_LIMIT)
  })

  test('degraded mode renders the initial screen only', () => {
    const model = readScreenModel({ screens: { home, detail }, initial: 'detail' })!
    expect(degradedScreenItems(model)).toBe(detail)
  })
})

describe('parse and guard', () => {
  test('a screens-only root parses into a spec', () => {
    const spec = parseGenuiSpec(JSON.stringify({ screens: { home, detail }, initial: 'detail' }))
    expect(spec).not.toBeNull()
    expect(spec!.screens).toEqual({ home, detail })
    expect(spec!.initial).toBe('detail')
  })

  test('screen specs validate and repair keeps goto on any node', () => {
    const raw = {
      screens: {
        home: [{ type: 'text', content: '首页', goto: 'detail' }],
        detail: [{ type: 'button', label: '回去', goto: 'home', action: 'noop' }],
      },
      initial: 'home',
    }
    expect(validateGenuiSpec(raw).ok).toBe(true)
    const repaired = repairGenuiSpec(raw)!
    expect((repaired.screens?.home?.[0] as { goto?: string } | undefined)?.goto).toBe('detail')
    expect((repaired.screens?.detail?.[0] as { goto?: string } | undefined)?.goto).toBe('home')
  })

  test('a non-string goto is rejected', () => {
    const result = validateGenuiSpec({ screens: { home: [{ type: 'button', label: 'x', goto: 42 }] } })
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toContain('goto')
  })

  test('screen count is capped by design, not by an error', () => {
    const screens: Record<string, unknown[]> = {}
    for (let i = 0; i <= GENUI_LIMITS.maxScreens; i += 1) screens[`s${i}`] = [{ type: 'text', content: 'x' }]
    // 按设计截断：超出的屏被丢，围栏照常渲染，所以校验不得把它算成 error，
    // 否则正常的长原型会整块退回代码块（契约 D4）。
    const validation = validateGenuiSpec({ screens })
    expect(validation.ok).toBe(true)
    const processed = processGenuiSpec({ screens })
    expect(processed.repaired?.screens).toBeDefined()
    expect(Object.keys(processed.repaired!.screens!).length).toBe(GENUI_LIMITS.maxScreens)
    expect(processed.warnings.some(warning =>
      warning.kind === 'truncated' && warning.code === 'screen-budget',
    )).toBe(true)
  })

  test('unknown fields inside a screen are diagnosed', () => {
    const result = processGenuiSpec({
      screens: { home: [{ type: 'text', content: '正文', bodyy: 'x' }] },
    })
    expect(result.warnings.some(warning => warning.kind === 'unknown-field' && warning.field === 'bodyy')).toBe(true)
  })
})
