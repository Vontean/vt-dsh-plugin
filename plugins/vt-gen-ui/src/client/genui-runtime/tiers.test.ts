/**
 * Three-tier end-to-end contract (decision F, `docs/specs/module-interfaces.md`
 * §4.5): one fixture per tier, asserted only through the pipeline's public
 * exits — never through internal functions or call order.
 *
 * The tier judgement reads stable error codes (`errorDetails[].code`), not
 * message prefixes: that is decision E, exercised here so wording can change
 * without silently changing what gets rescued, dropped, or degraded.
 */
import { describe, expect, test } from 'vitest'
import { isRenderableProcess, processGenuiSpec } from '../guard.ts'
import { resolveFenceSpec } from '../../shared/fence-resolve.ts'

describe('tier 1 — rescued', () => {
  test('a normalize-repairable field renders with an alias diagnostic and no drop', () => {
    const result = processGenuiSpec({ items: [{ type: 'callout', text: '注意' }] })

    expect(result.errorDetails).toEqual([])
    expect(result.warnings.some(warning => warning.kind === 'alias')).toBe(true)
    expect(result.warnings.some(warning => warning.kind === 'dropped')).toBe(false)
    expect(isRenderableProcess(result)).toBe(true)

    const callout = result.repaired?.items[0] as { type: string, content?: string } | undefined
    expect(callout?.type).toBe('callout')
    expect(callout?.content).toBe('注意')
  })
})

describe('tier 2 — partially dropped', () => {
  test('an intentional drop is diagnosed, renderable, and does not inflate the ledger', () => {
    const result = processGenuiSpec({
      items: [{
        type: 'modal', title: '外层', open: true,
        items: [
          { type: 'text', content: '外层正文' },
          // Nested modal: repair drops it on purpose. If the declared ledger
          // counted it, the drop would become `dropped-nodes` and degrade the
          // whole fence — the slice-4 pitfall this tier locks down.
          { type: 'modal', title: '内层', open: true, items: [{ type: 'text', content: '内层正文' }] },
        ],
      }],
    })

    expect(result.errorDetails).toEqual([])
    expect(result.warnings.some(warning => warning.code === 'nested-modal')).toBe(true)
    expect(isRenderableProcess(result)).toBe(true)

    const outer = result.repaired?.items[0] as { items: unknown[] } | undefined
    expect(outer?.items).toHaveLength(1)
    // Counts agree: the intentional drop is in neither side of the ledger.
    expect(result.declaredNativeCount).toBe(result.renderedNativeCount)
    expect(result.renderedNativeCount).toBe(2)
  })
})

describe('tier 3 — degraded to a code block', () => {
  test('an unrescuable body resolves to no spec and carries stable error codes', () => {
    const raw = JSON.stringify({ items: [{ type: 'callout' }] })
    const result = processGenuiSpec(JSON.parse(raw))

    // Judgement is on codes, never on message text.
    expect(result.errorDetails.map(detail => detail.code)).toContain('invalid-schema')
    expect(isRenderableProcess(result)).toBe(false)
    // The public exit the renderer uses: null means "keep the code block".
    expect(resolveFenceSpec(raw, { settled: true })).toBeNull()
  })

  test('the budget tail cut is the opposite case: codes say intentional, so it renders', () => {
    const items = Array.from({ length: 205 }, (_, index) => ({ type: 'text', content: `节点 ${index}` }))
    const result = processGenuiSpec({ items })

    expect(result.errorDetails.every(detail =>
      detail.code === 'budget-nodes' || detail.code === 'dropped-nodes')).toBe(true)
    expect(isRenderableProcess(result)).toBe(true)
    expect(result.repaired?.items).toHaveLength(200)
  })
})
