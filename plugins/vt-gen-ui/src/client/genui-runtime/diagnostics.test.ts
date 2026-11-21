/**
 * Prototype contract diagnostics (slice 5): the five codes in
 * `docs/specs/module-interfaces.md` §5. Every case asserts the same three
 * things — the diagnostic fires, repair keeps the tree renderable, and the
 * whole-fence tier never degrades because of it.
 */
import { describe, expect, test } from 'vitest'
import { isRenderableProcess, processGenuiSpec, validateGenuiSpec } from '../guard.ts'
import { GENUI_LIMITS } from './limits.ts'
import { COMPONENT_SCHEMAS, DIAGRAM_KINDS, ECHART_PRESETS } from './schema.ts'
import * as spec from '../spec.ts'
import { catalogReferenceMarkdown } from '../../shared/catalog/index.ts'

function codesOf(warnings: readonly { code?: string }[]): string[] {
  return warnings.flatMap(warning => (warning.code === undefined ? [] : [warning.code]))
}

/** The fence-level promise: a diagnosed spec still renders. */
function expectDoesNotBlock(result: ReturnType<typeof processGenuiSpec>): void {
  expect(result.errors).toEqual([])
  expect(isRenderableProcess(result)).toBe(true)
}

describe('D1 unknown-goto-target', () => {
  test('a goto naming an undeclared screen is deleted, the node survives', () => {
    const result = processGenuiSpec({
      screens: {
        home: [{ type: 'button', label: '详情', goto: 'detail' }],
        list: [{ type: 'text', content: '列表' }],
      },
    })
    expectDoesNotBlock(result)
    expect(codesOf(result.warnings)).toContain('unknown-goto-target')
    const button = result.repaired?.screens?.home?.[0] as { goto?: string } | undefined
    expect(button?.goto).toBeUndefined()
    expect(button).toBeDefined()
  })

  test('a declared target is kept without a diagnostic', () => {
    const result = processGenuiSpec({
      screens: {
        home: [{ type: 'button', label: '详情', goto: 'detail' }],
        detail: [{ type: 'text', content: '详情' }],
      },
    })
    expect(codesOf(result.warnings)).not.toContain('unknown-goto-target')
    const button = result.repaired?.screens?.home?.[0] as { goto?: string } | undefined
    expect(button?.goto).toBe('detail')
  })

  test('legacy specs without screens keep goto untouched and silent', () => {
    const result = processGenuiSpec({ items: [{ type: 'button', label: 'x', goto: 'detail' }] })
    expect(codesOf(result.warnings)).not.toContain('unknown-goto-target')
    const button = result.repaired?.items[0] as { goto?: string } | undefined
    expect(button?.goto).toBe('detail')
  })
})

describe('D2 modal-unreachable', () => {
  test('a modal with neither trigger nor open is dropped and diagnosed', () => {
    const result = processGenuiSpec({ items: [{ type: 'modal', title: '弹层' }] })
    expectDoesNotBlock(result)
    expect(codesOf(result.warnings)).toContain('modal-unreachable')
    expect(result.repaired?.items).toHaveLength(0)
  })

  test('either trigger or open keeps the modal', () => {
    for (const modal of [
      { type: 'modal', title: 'A', trigger: '打开' },
      { type: 'modal', title: 'B', open: true },
    ]) {
      const result = processGenuiSpec({ items: [modal] })
      expect(codesOf(result.warnings), JSON.stringify(modal)).not.toContain('modal-unreachable')
      expect(result.repaired?.items, JSON.stringify(modal)).toHaveLength(1)
    }
  })
})

describe('D3 nested-modal', () => {
  test('an inner modal is dropped with its code and the fence stays renderable', () => {
    const result = processGenuiSpec({
      items: [{
        type: 'modal', title: '外层', trigger: '打开',
        items: [
          { type: 'text', content: '正文' },
          { type: 'modal', title: '内层', open: true, items: [{ type: 'text', content: 'x' }] },
        ],
      }],
    })
    expectDoesNotBlock(result)
    expect(codesOf(result.warnings)).toContain('nested-modal')
    const outer = result.repaired?.items[0] as { items: unknown[] }
    expect(outer.items).toHaveLength(1)
  })
})

describe('D4 screen-budget', () => {
  test('screens beyond the cap are dropped whole, as a warning', () => {
    const screens: Record<string, unknown[]> = {}
    for (let i = 0; i <= GENUI_LIMITS.maxScreens; i += 1) screens[`s${i}`] = [{ type: 'text', content: 'x' }]
    const result = processGenuiSpec({ screens })
    expectDoesNotBlock(result)
    expect(codesOf(result.warnings)).toContain('screen-budget')
    expect(Object.keys(result.repaired?.screens ?? {})).toHaveLength(GENUI_LIMITS.maxScreens)
    // The strict validator no longer treats the policy cap as an error.
    expect(validateGenuiSpec({ screens }).ok).toBe(true)
  })

  test('a node-budget tail cut stays renderable instead of degrading the fence', () => {
    const items = Array.from({ length: GENUI_LIMITS.maxNodes + 5 }, (_, i) => ({ type: 'text', content: `节点 ${i}` }))
    const result = processGenuiSpec({ items })
    expect(result.repaired?.items).toHaveLength(GENUI_LIMITS.maxNodes)
    expect(isRenderableProcess(result)).toBe(true)
    expect(codesOf(result.warnings)).toContain('screen-budget')
  })
})

describe('D5 unknown-initial', () => {
  test('an unknown initial is diagnosed and falls back to the first screen', () => {
    const result = processGenuiSpec({
      screens: { home: [{ type: 'text', content: '首页' }], list: [{ type: 'text', content: '列表' }] },
      initial: 'missing',
    })
    expectDoesNotBlock(result)
    const warning = result.warnings.find(candidate => candidate.code === 'unknown-initial')
    expect(warning?.message).toContain('home')
    expect(result.repaired?.initial).toBeUndefined()
  })

  test('a declared initial produces no diagnostic', () => {
    const result = processGenuiSpec({
      screens: { home: [{ type: 'text', content: '首页' }], list: [{ type: 'text', content: '列表' }] },
      initial: 'list',
    })
    expect(codesOf(result.warnings)).not.toContain('unknown-initial')
    expect(result.repaired?.initial).toBe('list')
  })
})

describe('page.label (slice 5)', () => {
  test('is an optional string field, not a required one', () => {
    expect(COMPONENT_SCHEMAS.page?.fields.label).toBe('string')
    expect(COMPONENT_SCHEMAS.page?.required).not.toContain('label')
  })

  test('repair keeps it and validation accepts it', () => {
    const result = processGenuiSpec({
      items: [{ type: 'page', title: 'A', label: '方案一', items: [{ type: 'text', content: 'x' }] }],
    })
    expect(result.errors).toEqual([])
    expect((result.repaired?.items[0] as { label?: string }).label).toBe('方案一')
    expect(validateGenuiSpec(result.value).ok).toBe(true)
  })

  test('the generated reference documents the field', () => {
    const reference = catalogReferenceMarkdown()
    const pageSection = reference.slice(reference.indexOf('`page`'))
    expect(pageSection.slice(0, pageSection.indexOf('\n'))).toContain('`label`')
  })
})

describe('enum single source (decision C)', () => {
  test('spec.ts re-exports the catalog arrays instead of copying them', () => {
    expect(spec.DIAGRAM_KINDS).toBe(DIAGRAM_KINDS)
    expect(spec.DIAGRAM_KINDS).toEqual(COMPONENT_SCHEMAS.diagram?.enums.kind)
    expect([...ECHART_PRESETS]).toEqual(COMPONENT_SCHEMAS.echart?.enums.preset)
  })

  test('every catalog enum value still passes validation', () => {
    for (const kind of DIAGRAM_KINDS) {
      const diagram = { type: 'diagram', kind, nodes: [{ id: 'a', label: 'A' }] }
      expect(validateGenuiSpec({ items: [diagram] }).ok, kind).toBe(true)
    }
    for (const preset of ECHART_PRESETS) {
      const echart = { type: 'echart', preset, data: [{ label: 'A', value: 1 }] }
      expect(validateGenuiSpec({ items: [echart] }).ok, preset).toBe(true)
    }
  })
})
