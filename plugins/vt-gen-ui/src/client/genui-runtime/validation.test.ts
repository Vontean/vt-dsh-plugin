/**
 * Failure tiers: repairable aliases are rescued, missing required fields drop
 * the component, unknown fields keep it and warn. These are the three real
 * field-writing failures the guard is expected to distinguish.
 */
import { describe, expect, test } from 'vitest'
import { countGenuiNodes, processGenuiSpec, validateGenuiSpec } from '../guard.ts'

describe('rescue (alias)', () => {
  test('callout text is adopted as content', () => {
    const result = processGenuiSpec({ items: [{ type: 'callout', text: '注意' }] })
    expect(result.errors).toEqual([])
    expect(result.warnings.some(warning => warning.kind === 'alias')).toBe(true)
    expect(result.repaired?.items).toHaveLength(1)
  })

  test('keyvalue label is adopted as key', () => {
    const result = processGenuiSpec({ items: [{ type: 'keyvalue', pairs: [{ label: '版本', value: '1.0' }] }] })
    expect(validateGenuiSpec(result.value).ok).toBe(true)
    expect(result.warnings.some(warning => warning.kind === 'alias')).toBe(true)
    expect(result.repaired?.items[0]).toMatchObject({ pairs: [{ key: '版本', value: '1.0' }] })
  })

  test('list-row name is adopted as title', () => {
    const result = processGenuiSpec({ items: [{ type: 'list-row', name: '未命名' }] })
    expect(result.errors).toEqual([])
    expect(result.repaired?.items[0]).toMatchObject({ type: 'list-row', title: '未命名' })
  })

  test('empty label is adopted as title', () => {
    const result = processGenuiSpec({ items: [{ type: 'empty', label: '没有任务' }] })
    expect(result.errors).toEqual([])
    expect(result.repaired?.items[0]).toMatchObject({ type: 'empty', title: '没有任务' })
  })
})

describe('drop (missing required)', () => {
  test('stat without value is dropped, siblings survive', () => {
    const result = processGenuiSpec({
      items: [{ type: 'stat', label: '仅标签' }, { type: 'badge', label: '保留' }],
    })
    expect(validateGenuiSpec(result.value).ok).toBe(false)
    expect(result.errors.join('\n')).toContain("requires value")
    expect(result.repaired?.items).toEqual([{ type: 'badge', label: '保留' }])
  })

  test('page without items is invalid, like other containers', () => {
    const result = processGenuiSpec({ items: [{ type: 'page', title: '空页' }] })
    expect(validateGenuiSpec(result.value).ok).toBe(false)
    // Repair keeps the container shell (same policy as row/col/card) but the
    // content area is empty; validate_dsh_ui is what reports the defect.
    expect(result.repaired?.items[0]).toMatchObject({ type: 'page', items: [] })
  })

  test('nav with string items is dropped', () => {
    const result = processGenuiSpec({ items: [{ type: 'nav', items: ['首页', '设置'] }] })
    expect(result.repaired?.items).toHaveLength(0)
  })

  test('empty without a title is dropped', () => {
    const result = processGenuiSpec({ items: [{ type: 'empty', desc: '只有说明' }] })
    expect(result.repaired?.items).toHaveLength(0)
    expect(validateGenuiSpec(result.value).ok).toBe(false)
  })
})

describe('degrade (wrong field name)', () => {
  test('unknown field warns but keeps the component', () => {
    const result = processGenuiSpec({
      items: [{ type: 'list-row', title: '行标题', tile: '不该有' }],
    })
    expect(validateGenuiSpec(result.value).ok).toBe(true)
    expect(result.warnings.some(warning => warning.kind === 'unknown-field' && warning.field === 'tile')).toBe(true)
    expect(result.repaired?.items).toHaveLength(1)
  })

  test('unknown type is reported and never counted as a native node', () => {
    const result = processGenuiSpec({ items: [{ type: 'mystery', label: 'x' }] })
    // processGenuiSpec filters the custom-renderer error for the render gate;
    // the validator keeps it, which is what diagnostics and the tool report.
    expect(validateGenuiSpec(result.value).errors.join('\n')).toContain('unknown type')
    expect(result.renderedNativeCount).toBe(0)
  })

  test('unknown fields inside a page are still diagnosed', () => {
    const result = processGenuiSpec({
      items: [{ type: 'page', items: [{ type: 'text', content: '正文', bodyy: 'x' }] }],
    })
    expect(result.warnings.some(warning => warning.kind === 'unknown-field' && warning.field === 'bodyy')).toBe(true)
  })
})

describe('prototype states and layout (slice 3)', () => {
  test('split keeps its container shell and repairs its panes', () => {
    const result = processGenuiSpec({
      items: [{ type: 'split', items: [{ type: 'empty', title: '没有任务' }, { type: 'text', content: '正文' }] }],
    })
    expect(result.errors).toEqual([])
    const split = result.repaired?.items[0] as { items: unknown[] } | undefined
    expect(split?.items).toHaveLength(2)
  })

  test('split ratio outside the three allowed values is dropped, not kept', () => {
    const result = processGenuiSpec({
      items: [{ type: 'split', ratio: '3:2', items: [{ type: 'text', content: 'A' }] }],
    })
    expect(result.repaired?.items[0]).toMatchObject({ type: 'split' })
    expect((result.repaired?.items[0] as { ratio?: string }).ratio).toBeUndefined()
    const ok = processGenuiSpec({
      items: [{ type: 'split', ratio: '2:1', items: [{ type: 'text', content: 'A' }] }],
    })
    expect(ok.repaired?.items[0]).toMatchObject({ type: 'split', ratio: '2:1' })
  })

  test('loading lines clamp into 1..3', () => {
    const many = processGenuiSpec({ items: [{ type: 'loading', lines: 9 }] })
    expect(many.repaired?.items[0]).toMatchObject({ type: 'loading', lines: 3 })
    const none = processGenuiSpec({ items: [{ type: 'loading', lines: 0 }] })
    expect(none.repaired?.items[0]).toMatchObject({ type: 'loading', lines: 1 })
  })

  test('unknown fields inside empty actions are still diagnosed', () => {
    const result = processGenuiSpec({
      items: [{ type: 'empty', title: '空', actions: [{ type: 'button', label: '新建', bogus: 1 }] }],
    })
    expect(result.warnings.some(warning => warning.kind === 'unknown-field' && warning.field === 'bogus')).toBe(true)
  })

  test('the node budget counts split panes and empty actions', () => {
    expect(countGenuiNodes({
      items: [
        { type: 'split', items: [{ type: 'text', content: 'A' }, { type: 'text', content: 'B' }] },
        { type: 'empty', title: '空', actions: [{ type: 'button', label: '新建' }] },
      ],
    })).toBe(5)
  })
})

describe('modal fields (slice 4)', () => {
  test('a modal survives repair with its state fields', () => {
    const result = processGenuiSpec({
      items: [{
        type: 'modal', trigger: '删除', title: '删除任务？', variant: 'sheet',
        open: true, dismissible: false,
        items: [{ type: 'text', content: '删除后无法恢复。' }],
        actions: [{ type: 'button', label: '取消', close: true }],
      }],
    })
    expect(result.errors).toEqual([])
    expect(result.repaired?.items[0]).toMatchObject({
      type: 'modal', trigger: '删除', variant: 'sheet', open: true, dismissible: false,
    })
    const modal = result.repaired?.items[0] as { actions: Array<{ close?: boolean }> }
    expect(modal.actions[0]?.close).toBe(true)
  })

  test('a modal without a title is dropped', () => {
    const result = processGenuiSpec({ items: [{ type: 'modal', trigger: '打开' }] })
    expect(result.repaired?.items).toHaveLength(0)
    expect(validateGenuiSpec(result.value).ok).toBe(false)
  })

  test('a nested modal is dropped whole and diagnosed, without failing the fence', () => {
    const result = processGenuiSpec({
      items: [{
        type: 'modal', title: '外层',
        items: [
          { type: 'text', content: '外层正文' },
          { type: 'modal', title: '内层', items: [{ type: 'text', content: '不该出现' }] },
        ],
      }],
    })
    // The intentional drop must not look like a repair failure, otherwise the
    // whole fence degrades to a code block.
    expect(result.errors).toEqual([])
    const outer = result.repaired?.items[0] as { items: unknown[] }
    expect(outer.items).toHaveLength(1)
    expect(result.warnings.some(warning =>
      warning.kind === 'dropped' && warning.type === 'modal' && warning.path === 'items[0].items[1]',
    )).toBe(true)
  })

  test('a modal inside a page/row container is still one level deep', () => {
    const result = processGenuiSpec({
      items: [{
        type: 'page', title: '页', items: [
          { type: 'modal', title: '弹层', actions: [{ type: 'button', label: '取消', close: true }] },
        ],
      }],
    })
    expect(result.errors).toEqual([])
    expect(result.warnings.some(warning => warning.kind === 'dropped')).toBe(false)
  })

  test('unknown fields inside a modal body are diagnosed', () => {
    const result = processGenuiSpec({
      items: [{ type: 'modal', title: '弹层', items: [{ type: 'button', label: '好', bogus: 1 }] }],
    })
    expect(result.warnings.some(warning => warning.kind === 'unknown-field' && warning.field === 'bogus')).toBe(true)
  })

  test('the node budget counts modal items and actions', () => {
    expect(countGenuiNodes({
      items: [{
        type: 'modal', title: '弹层',
        items: [{ type: 'text', content: '正文' }],
        actions: [{ type: 'button', label: '取消' }],
      }],
    })).toBe(3)
  })
})

describe('screen state machine fields', () => {
  test('screens-only spec validates and repairs without items', () => {
    const result = processGenuiSpec({
      screens: {
        list: [{ type: 'text', content: '列表' }, { type: 'button', label: '详情', goto: 'detail' }],
        detail: [{ type: 'text', content: '详情' }],
      },
      initial: 'list',
    })
    expect(result.errors).toEqual([])
    expect(result.repaired?.initial).toBe('list')
    expect(result.repaired?.screens?.list).toHaveLength(2)
    expect(result.repaired?.items).toEqual([])
  })

  test('goto survives repair and is not an unknown field', () => {
    const result = processGenuiSpec({
      items: [{ type: 'button', label: '下一步', goto: 'detail' }],
      screens: { detail: [{ type: 'text', content: '详情' }] },
    })
    expect(result.warnings.some(warning => warning.kind === 'unknown-field' && warning.field === 'goto')).toBe(false)
    expect(result.repaired?.items[0]).toMatchObject({ type: 'button', goto: 'detail' })
  })

  test('unknown-field diagnostics still run inside screens', () => {
    const result = processGenuiSpec({
      screens: { list: [{ type: 'text', content: '正文', bodyy: 'x' }] },
    })
    expect(result.warnings.some(warning => warning.kind === 'unknown-field' && warning.field === 'bodyy')).toBe(true)
  })

  test('an invalid initial screen is dropped rather than rendered blank', () => {
    const result = processGenuiSpec({
      screens: { list: [{ type: 'text', content: '列表' }] },
      initial: 'missing',
    })
    expect(result.errors).toEqual([])
    expect(result.repaired?.initial).toBeUndefined()
  })

  test('the node budget counts every screen', () => {
    expect(countGenuiNodes({
      screens: {
        a: [{ type: 'text', content: '1' }, { type: 'text', content: '2' }],
        b: [{ type: 'text', content: '3' }],
      },
    })).toBe(3)
  })
})
