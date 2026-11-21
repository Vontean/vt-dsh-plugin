/**
 * Host tool contracts: `render_ui` and `validate_dsh_ui`.
 *
 * These lock the model-facing protocol strings (`status=`, `error=`, `next=`,
 * `warning=`) and the argument-unpacking shapes the tool-call bridge has been
 * observed to deliver. A change here is a change to what the model is told,
 * so every assertion is on the literal protocol, not on an implementation
 * detail.
 *
 * The transport facts behind the unpacking cases (double-encoded `arguments`
 * wrapper, bare JSON string) were observed live; see `src/plugin/tool.ts`.
 */
import { describe, expect, test } from 'vitest'
import { createRenderUiTool, createValidateDshUiTool } from '../tool.ts'

const SPEC = { items: [{ type: 'text', content: 'hi' }] } as const

function linesOf(value: unknown): string[] {
  return String(value).split('\n')
}

function expectProtocol(value: unknown, expected: readonly string[]): void {
  const lines = linesOf(value)
  for (const line of expected) expect(lines).toContain(line)
}

function specJson(spec: unknown = SPEC): string {
  return JSON.stringify(spec)
}

/** Run a tool the way the host does: arguments plus a run context. */
function call(tool: { execute(args: unknown, exec: never): Promise<unknown> }, args: unknown): Promise<unknown> {
  return tool.execute(args, {} as never)
}

describe('render_ui: argument unpacking', () => {
  const tool = createRenderUiTool()

  // Every shape below must reach the SAME spec; the bridge (not the model)
  // picks the shape.
  const shapes: ReadonlyArray<readonly [string, unknown]> = [
    ['authored { spec: object }', { spec: SPEC }],
    ['{ spec: "<json>" }', { spec: specJson() }],
    ['{ arguments: "<json>" }', { arguments: specJson({ spec: SPEC }) }],
    ['{ arguments: object }', { arguments: { spec: SPEC } }],
    ['nested wrapper layers', { arguments: specJson({ spec: specJson({ spec: SPEC }) }) }],
    ['bare JSON string root', specJson()],
  ]

  test.each(shapes)('%s reaches the same protocol', async (_name, args) => {
    const out = await call(tool, args)
    expectProtocol(out, ['[genui-render]', 'status=rendered', 'rendered=1', 'action_feedback=[genui-action]', 'reply_language=conversation'])
  })

  test('a literal title is echoed, absent title is omitted', async () => {
    const titled = await call(tool, { spec: { title: 'T', items: SPEC.items } })
    expect(linesOf(titled)).toContain('title="T"')
    const untitled = await call(tool, { spec: SPEC })
    expect(linesOf(untitled).some(line => line.startsWith('title='))).toBe(false)
  })

  test('unknown component fields surface as stable warning lines', async () => {
    const out = await call(tool, { spec: { items: [{ type: 'text', content: 'a', bogus: 1 }] } })
    expectProtocol(out, ['status=rendered', 'warning=unknown_field path="items[0].bogus" detail="items[0].bogus: unknown field for \'text\'"'])
  })
})

describe('render_ui: failure behaviour', () => {
  const tool = createRenderUiTool()

  test.each([
    ['unparseable string', { spec: '{"items":[' }],
    ['empty object root', { spec: {} }],
    ['no spec key at all', {}],
  ])('%s returns status=invalid instead of throwing', async (_name, args) => {
    const out = await call(tool, args)
    expectProtocol(out, ['[genui-render]', 'status=invalid', 'error=invalid_spec', 'required=items', 'next=fix_and_retry', 'reply_language=conversation'])
  })

  test.each([
    ['a non-object root', { spec: [1] }],
    ['a dropped required node', { spec: { items: [{ type: 'text', content: 'a' }, { type: 'table' }] } }],
    ['an unsupported chart variant', { spec: { items: [{ type: 'chart', kind: 'pie', data: [{ label: 'a', value: 1 }] }] } }],
  ])('%s throws a diagnosable error', async (_name, args) => {
    await expect(call(tool, args)).rejects.toThrow(/render_ui spec invalid/)
  })
})

describe('render_ui: presentation surface', () => {
  const tool = createRenderUiTool()

  test('presentationMeta carries the repaired spec for the browser toolview', () => {
    const meta = tool.output?.presentationMeta?.({ spec: { items: SPEC.items } }, {} as never)
    expect(meta).toEqual({ items: SPEC.items })
  })

  test('presentationMeta is null when nothing can render', () => {
    expect(tool.output?.presentationMeta?.({ spec: 'nope' }, {} as never)).toBeNull()
  })

  test('the tool-row card is titled after the spec, or omitted when unrenderable', () => {
    expect(tool.presentCall?.({ spec: { title: 'T', items: SPEC.items } })).toEqual({ card: 'generic', title: '渲染 UI：T', kind: 'other' })
    expect(tool.presentCall?.({ spec: { items: SPEC.items } })).toEqual({ card: 'generic', title: '渲染 UI：未命名', kind: 'other' })
    expect(tool.presentResult?.({ spec: [] }, {} as never)).toBeUndefined()
  })

  test('the output renders the model-facing summary as one text block', () => {
    const blocks = tool.output?.render?.({}, 'summary')
    expect(blocks).toEqual([{ type: 'text', text: 'summary' }])
  })
})

describe('validate_dsh_ui: verdicts', () => {
  const tool = createValidateDshUiTool()

  test('a clean spec is valid and tells the model to emit it', async () => {
    const out = await call(tool, { spec: specJson() })
    expectProtocol(out, ['[genui-validation]', 'status=valid', 'rendered=1', 'next=emit_fence', 'reply_language=conversation'])
  })

  test('the spec object form validates exactly like its JSON text', async () => {
    expect(String(await call(tool, { spec: SPEC }))).toBe(String(await call(tool, { spec: specJson() })))
  })

  test.each([
    ['a missing argument', {}],
    ['blank text', { spec: '   ' }],
  ])('%s reports missing_spec', async (_name, args) => {
    expectProtocol(await call(tool, args), ['status=invalid', 'error=missing_spec', 'next=provide_spec'])
  })

  test('a repairable body returns the FIXED json instead of asking for a rewrite', async () => {
    const out = await call(tool, { spec: '{"items":[{"type":"text","content":"hi"},]}' })
    expectProtocol(out, ['status=invalid', 'error=invalid_json', 'repair=applied', 'next=emit_repaired_fence'])
    expect(String(out)).toContain('repaired_json:\n```\n{"items":[{"type":"text","content":"hi"}]}\n```')
  })

  test('a repairable body with unbalanced braces reports the delta and the action', async () => {
    const out = await call(tool, { spec: '{"items":[{"type":"text","content":"hi"}' })
    expectProtocol(out, ['repair=applied', 'brace_delta=1', 'brace_action=add:1', 'bracket_delta=1', 'bracket_action=add:1'])
  })

  test('an unrepairable body falls back to the likely-cause list', async () => {
    const out = await call(tool, { spec: '{"items": [{"type": "text", "content": 1e}' })
    expectProtocol(out, ['status=invalid', 'error=invalid_json', 'repair=failed', 'likely_causes=unbalanced_delimiters,unescaped_quote,trailing_comma,unterminated_string', 'next=fix_and_revalidate'])
    expect(String(out)).not.toContain('repaired_json')
  })

  test('an unknown field is a warning that still demands another validation', async () => {
    const out = await call(tool, { spec: specJson({ items: [{ type: 'text', content: 'a', bogus: 1 }] }) })
    expectProtocol(out, ['status=valid', 'next=fix_and_revalidate'])
    expect(String(out)).toContain('warning=unknown_field path="items[0].bogus"')
  })

  test('block-level markdown maps to the replacement component', async () => {
    const mdTable = { items: [{ type: 'text', content: '|a|b|\n|---|---|\n|1|2|' }] }
    expectProtocol(await call(tool, { spec: specJson(mdTable) }), [
      'warning=block_markdown path=items[0].content kind=markdown_table replacement=table', 'next=fix_and_revalidate',
    ])
  })

  test('an unsupported chart variant is reported before the generic path', async () => {
    const out = await call(tool, { spec: specJson({ items: [{ type: 'chart', kind: 'pie', data: [{ label: 'a', value: 1 }] }] }) })
    expectProtocol(out, ['status=invalid', 'error=invalid_chart_fields', 'next=fix_and_revalidate'])
    expect(String(out)).toContain('diagnostic="items[0].kind must be bars, line, or donut"')
  })

  test('a dropped node is reported with its path, type and missing fields', async () => {
    const out = await call(tool, { spec: specJson({ items: [{ type: 'text', content: 'a' }, { type: 'table' }] }) })
    expectProtocol(out, ['status=invalid', 'declared=2', 'rendered=1', 'dropped=1', 'node=items[1]', 'type=table', 'next=fix_and_revalidate'])
    expect(String(out)).toContain('error=missing_required_field\nfield=columns')
  })

  test('a structurally invalid root explains itself instead of throwing', async () => {
    expectProtocol(await call(tool, { spec: '[1,2]' }), ['status=invalid', 'error=invalid_spec', 'next=fix_and_revalidate'])
  })

  test('never throws, whatever the argument shape', async () => {
    for (const args of [null, 42, [], { spec: null }, { spec: '{{{' }] as const) {
      await expect(call(tool, args)).resolves.toBeTypeOf('string')
    }
  })
})

describe('validate_dsh_ui: presentation surface', () => {
  const tool = createValidateDshUiTool()

  test('the card title is fixed and the summary is a single text block', () => {
    expect(tool.presentCall?.({})).toEqual({ card: 'generic', title: '验证 dsh-ui 围栏', kind: 'other' })
    expect(tool.presentResult?.(undefined, {} as never)).toEqual({ card: 'generic', title: '验证 dsh-ui 围栏' })
    expect(tool.output?.render?.({}, 'verdict')).toEqual([{ type: 'text', text: 'verdict' }])
  })
})
