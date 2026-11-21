/**
 * Fence-feedback loop contract (issue #160): the turn-end self-repair.
 *
 * Three layers, tested separately because they fail differently:
 * - pure planners (`planFenceFeedback`, correction text, message shape) — the
 *   budget and dedup rules are the whole safety story, so they are asserted
 *   directly from a table of cases;
 * - registration wiring (`installFenceFeedback`) — which session events feed
 *   the state, and that a subagent or an outstanding render never gets steered;
 * - the reasoning-only stream gate — a GenUI turn that ends with thinking but
 *   no body must hand the host a retryable error instead of a silent stop.
 *
 * Nothing here touches a live host: the context is a hand-rolled event bus and
 * the llm gate is injected, because `isAgentLoopRequest` answers from a WeakSet
 * of real requests.
 */
import { describe, expect, test } from 'vitest'
import {
  MAX_CORRECTIONS_PER_TURN, createFeedbackMessage, extractDshUiFences, fenceCorrectionText,
  fenceFailures, fenceFingerprint, installFenceFeedback, missingBodyCorrectionText,
  planFenceFeedback, retryReasoningOnlyGenuiStream,
} from '../fence-feedback.ts'
import type { ReasoningOnlyGate } from '../fence-feedback.ts'

/* ---------------- fixtures ---------------- */

/** Wrap a fence BODY the way the model writes it. */
function fence(body: string): string {
  return `\`\`\`dsh-ui\n${body}\n\`\`\``
}

const GOOD_BODY = '{"items":[{"type":"text","content":"hi"}]}'
const GOOD = fence(GOOD_BODY)
/** Unrepairable JSON: tier-1 and tier-2 both fail, so the fence stays a code block. */
const BROKEN_BODY = '{"items":[{"type":"text","content":1e}'
const BROKEN = fence(BROKEN_BODY)
/** Structurally invalid: the table node is dropped, which is also unrenderable. */
const DROPPED_BODY = '{"items":[{"type":"table"}]}'
const DROPPED = fence(DROPPED_BODY)
/** A third distinct failure, for the per-turn budget case. */
const BAD_CHART_BODY = '{"items":[{"type":"chart","kind":"pie","data":[{"label":"a","value":1}]}]}'
const BAD_CHART = fence(BAD_CHART_BODY)

function fail(body: string): { index: number; fingerprint: string; detail: string } {
  const failure = fenceFailures(fence(body))[0]
  if (failure === undefined) throw new Error(`fixture is not a fence failure: ${body}`)
  return failure
}

/* ---------------- pure: fence extraction ---------------- */

describe('extractDshUiFences', () => {
  test('finds a fence with its 1-based index and closed flag', () => {
    const fences = extractDshUiFences(`before\n${GOOD}\nafter`)
    expect(fences).toHaveLength(1)
    expect(fences[0]).toMatchObject({ index: 1, closed: true })
    expect(fences[0]?.raw).toBe('{"items":[{"type":"text","content":"hi"}]}')
  })

  test('keeps document order across several fences', () => {
    const fences = extractDshUiFences([GOOD, BROKEN, GOOD].join('\n\ntext\n\n'))
    expect(fences.map(fence => fence.index)).toEqual([1, 2, 3])
  })

  test('ignores other fence languages, including look-alike labels', () => {
    expect(extractDshUiFences('```dsh-ui-dark\n{}\n```')).toEqual([])
    expect(extractDshUiFences('```json\n{"items":[]}\n```')).toEqual([])
  })

  test('absorbs trailing punctuation on the label (a real model habit)', () => {
    expect(extractDshUiFences('```dsh-ui>\n{}\n```')).toHaveLength(1)
  })

  test('does not treat a four-space-indented fence as a fence', () => {
    expect(extractDshUiFences('    ```dsh-ui\n{}\n    ```')).toEqual([])
  })

  test('reports an unterminated fence as unclosed', () => {
    const fences = extractDshUiFences('```dsh-ui\n{"items":[]}')
    expect(fences).toEqual([{ raw: '{"items":[]}', closed: false, index: 1 }])
  })

  test('caps how many fences one reply can make it inspect', () => {
    expect(extractDshUiFences(Array.from({ length: 45 }, () => GOOD).join('\n'))).toHaveLength(40)
  })
})

/* ---------------- pure: failure detection ---------------- */

describe('fenceFailures', () => {
  test('a renderable fence is not a failure', () => {
    expect(fenceFailures(GOOD)).toEqual([])
  })

  test('an unclosed fence that still renders is not a failure (#288)', () => {
    expect(fenceFailures('```dsh-ui\n{"items":[{"type":"text","content":"hi"}]}')).toEqual([])
  })

  test('unrepairable JSON reports the failed repair', () => {
    const [failure] = fenceFailures(BROKEN)
    expect(failure?.detail).toContain('error=invalid_json')
    expect(failure?.detail).toContain('repair=failed')
  })

  test('an unclosed AND unrenderable fence reports the missing closer', () => {
    const [failure] = fenceFailures('```dsh-ui\n{"items":[{"type":"text","content":1e}')
    expect(failure?.detail).toContain('error=unterminated_fence')
    expect(failure?.detail).toContain('required=closing_fence')
  })

  test('a dropped node reports declared/rendered counts and the missing fields', () => {
    const [failure] = fenceFailures(DROPPED)
    expect(failure?.detail).toContain('declared=1')
    expect(failure?.detail).toContain('dropped=1')
    expect(failure?.detail).toContain('node=items[0]')
    expect(failure?.detail).toContain('field=columns')
  })
})

describe('fence identity', () => {
  test('the fingerprint ignores surrounding whitespace and is 12 hex chars', () => {
    expect(fenceFingerprint(' {"a":1} ')).toBe(fenceFingerprint('{"a":1}'))
    expect(fenceFingerprint('{"a":1}')).toMatch(/^[0-9a-f]{12}$/)
  })

  test('different bodies get different fingerprints', () => {
    expect(fenceFingerprint('{"a":1}')).not.toBe(fenceFingerprint('{"a":2}'))
  })
})

/* ---------------- pure: correction message ---------------- */

describe('correction text shape', () => {
  test('render failure lists every fence with its fingerprint and marker', () => {
    const failures = fenceFailures(`${BROKEN}\n\n${DROPPED}`)
    const text = fenceCorrectionText(failures)
    expect(text.startsWith('[genui-fence-repair #')).toBe(true)
    expect(text).toContain(`fences=${failures.length}`)
    expect(text).toContain('status=render_failed')
    expect(text).toContain('next=resend_corrected_fence_only')
    expect(text).toContain('repeat_rendered_content=false')
    expect(text).toContain('reply_language=conversation')
    for (const failure of failures) {
      expect(text).toContain(`fingerprint=${failure.fingerprint}`)
      expect(text).toContain(`fence=${failure.index}`)
    }
  })

  test('the delivery reminder names the turn and asks for a body fence', () => {
    const text = missingBodyCorrectionText(7)
    expect(text).toContain('[genui-fence-repair #turn-7]')
    expect(text).toContain('status=nothing_delivered')
    expect(text).toContain('next=emit_fence_in_body')
    expect(text).toContain('render_ui')
    expect(text).not.toContain('第 2 次提醒')
  })

  test('a repeated delivery reminder says so, and drops render_ui when the tool is off', () => {
    const text = missingBodyCorrectionText(7, 2, false)
    expect(text).toContain('第 2 次提醒')
    expect(text).not.toContain('render_ui')
  })
})

describe('createFeedbackMessage', () => {
  test('session format v4 attributes the notice to the plugin source kind', () => {
    const message = createFeedbackMessage('body', 4)
    expect(message.role).toBe('user')
    expect(message.source).toMatchObject({ kind: 'plugin:dsh-vt-gen-ui', form: 'notice' })
    expect(message.content).toEqual([{ type: 'text', text: 'body' }])
    expect(Object.isFrozen(message)).toBe(true)
    expect(Object.isFrozen(message.content)).toBe(true)
  })

  test('older session formats use the legacy plugin source shape', () => {
    expect(createFeedbackMessage('body', 3).source).toMatchObject({ kind: 'plugin', plugin: 'dsh-vt-gen-ui', form: 'notice' })
  })

  test('every message carries its own id', () => {
    expect(createFeedbackMessage('a', 4).id).not.toBe(createFeedbackMessage('a', 4).id)
  })
})

/* ---------------- pure: the planner's bounds ---------------- */

describe('planFenceFeedback', () => {
  const base = { text: BROKEN, turn: 3, correctedSpec: new Set<string>(), aborted: false }

  test('steers a correction for an un-corrected failure', () => {
    const plan = planFenceFeedback(base)
    expect(plan?.kind).toBe('render')
    expect(plan?.fingerprints).toEqual([fail(BROKEN_BODY).fingerprint])
    expect(plan?.turn).toBe(3)
  })

  test('is silent on an aborted turn', () => {
    expect(planFenceFeedback({ ...base, aborted: true })).toBeNull()
  })

  test('is silent once the shared per-turn budget is spent', () => {
    expect(planFenceFeedback({ ...base, correctionsTurn: 3, correctionsThisTurn: MAX_CORRECTIONS_PER_TURN })).toBeNull()
  })

  test('a budget recorded for an EARLIER turn does not count', () => {
    expect(planFenceFeedback({ ...base, correctionsTurn: 2, correctionsThisTurn: MAX_CORRECTIONS_PER_TURN })?.kind).toBe('render')
  })

  test('per-fence dedup: an already corrected body is skipped', () => {
    expect(planFenceFeedback({ ...base, correctedSpec: new Set([fail(BROKEN_BODY).fingerprint]) })).toBeNull()
  })

  test('dedup keeps a DIFFERENT failure in the same reply', () => {
    const text = `${BROKEN}\n\n${DROPPED}`
    const plan = planFenceFeedback({ ...base, text, correctedSpec: new Set([fail(BROKEN_BODY).fingerprint]) })
    expect(plan?.fingerprints).toEqual([fail(DROPPED_BODY).fingerprint])
  })

  test('a broken fence takes precedence over the delivery reminder', () => {
    expect(planFenceFeedback({ ...base, validatedThisTurn: true, deliveredThisTurn: false })?.kind).toBe('render')
  })

  test('validated but nothing delivered produces a delivery reminder', () => {
    const plan = planFenceFeedback({ ...base, text: '', validatedThisTurn: true, deliveredThisTurn: false })
    expect(plan?.kind).toBe('delivery')
    expect(plan?.text).toContain('[genui-fence-repair #turn-3]')
  })

  test('a delivered body suppresses the delivery reminder', () => {
    expect(planFenceFeedback({ ...base, text: '', validatedThisTurn: true, deliveredThisTurn: true })).toBeNull()
  })

  test('a turn already reminded is not reminded twice', () => {
    const plan = planFenceFeedback({
      ...base, text: '', validatedThisTurn: true, deliveredThisTurn: false, deliveryRemindedTurns: new Set([3]),
    })
    expect(plan).toBeNull()
  })

  test('a turn that never validated a spec is not a GenUI turn', () => {
    expect(planFenceFeedback({ ...base, text: '', validatedThisTurn: false })).toBeNull()
  })
})

/* ---------------- registration wiring ---------------- */

interface FakeSession {
  readonly id: string
  readonly header: { readonly parentSession: string | undefined; readonly version: number }
  snapshotEvents(): unknown[]
}

function session(id = 's1', parentSession: string | undefined = undefined): FakeSession {
  return { id, header: { parentSession, version: 4 }, snapshotEvents: () => [] }
}

function harness(options: { enabled?: boolean; renderUiTool?: boolean } = {}) {
  const handlers = new Map<string, Array<(...args: never[]) => unknown>>()
  const warnings: string[] = []
  const ctx = {
    on(name: string, fn: (...args: never[]) => unknown) {
      const list = handlers.get(name) ?? []
      list.push(fn)
      handlers.set(name, list)
      return () => undefined
    },
    inject() {
      return () => undefined
    },
    reflect: { get: () => undefined },
    logger: { warn: (message: string) => warnings.push(message) },
  }
  installFenceFeedback(ctx as never, options.enabled ?? true, options.renderUiTool ?? true)
  const emit = (name: string, ...args: unknown[]): unknown => {
    let result: unknown
    for (const fn of handlers.get(name) ?? []) result = (fn as unknown as (...a: unknown[]) => unknown)(...args)
    return result
  }
  return { emit, warnings }
}

function turnStart(turn: number): unknown {
  return { type: 'turn/start', data: { turn } }
}

function assistant(fences: string): unknown {
  return { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: fences }] } } }
}

function assistantReasoning(): unknown {
  return { type: 'assistant/message', data: { message: { content: [{ type: 'reasoning', text: 'thinking…' }] } } }
}

function toolCall(name: string, callId: string): unknown {
  return { type: 'tool/call', data: { name, callId } }
}

function toolResult(callId: string, status: 'rendered' | 'invalid'): unknown {
  return {
    type: 'tool/result',
    data: { message: { toolCallId: callId, isError: false, content: [{ type: 'text', text: `[genui-render]\nstatus=${status}` }] } },
  }
}

function boundarySink(target: FakeSession) {
  const steered: Array<{ role: string; content: unknown; source: unknown }> = []
  const agent = { session: target, steer: (message: never) => { steered.push(message as never) } }
  return { steered, agent, emit: (emit: (name: string, ...args: unknown[]) => void, turn: number, aborted = false) =>
    emit('agent/turn-stopping', { agent, turn, signal: { aborted } }) }
}

describe('installFenceFeedback: steering', () => {
  test('steers one correction for an unrenderable fence, then stays silent', () => {
    const { emit } = harness()
    const target = session()
    const sink = boundarySink(target)
    emit('session/event', target, turnStart(1))
    emit('session/event', target, assistant(BROKEN))
    sink.emit(emit, 1)

    expect(sink.steered).toHaveLength(1)
    const message = sink.steered[0]!
    expect(message.role).toBe('user')
    expect(message.source).toMatchObject({ kind: 'plugin:dsh-vt-gen-ui', form: 'notice' })
    expect(JSON.stringify(message.content)).toContain(`fingerprint=${fail(BROKEN_BODY).fingerprint}`)

    sink.emit(emit, 1)
    expect(sink.steered).toHaveLength(1)
  })

  test('fenceFeedback: false leaves the boundary silent even with a broken fence', () => {
    const { emit } = harness({ enabled: false })
    const target = session()
    const sink = boundarySink(target)
    emit('session/event', target, turnStart(1))
    emit('session/event', target, assistant(BROKEN))
    sink.emit(emit, 1)

    expect(sink.steered).toHaveLength(0)
  })

  test('the per-turn budget stops a third distinct failure', () => {
    const { emit } = harness()
    const target = session()
    const sink = boundarySink(target)
    emit('session/event', target, turnStart(1))

    emit('session/event', target, assistant(BROKEN))
    sink.emit(emit, 1)
    emit('session/event', target, assistant(DROPPED))
    sink.emit(emit, 1)
    emit('session/event', target, assistant(BAD_CHART))
    sink.emit(emit, 1)

    expect(sink.steered).toHaveLength(MAX_CORRECTIONS_PER_TURN)
  })

  test('a new turn starts with a clean ledger and budget', () => {
    const { emit } = harness()
    const target = session()
    const sink = boundarySink(target)

    emit('session/event', target, turnStart(1))
    emit('session/event', target, assistant(BROKEN))
    sink.emit(emit, 1)
    expect(sink.steered).toHaveLength(1)

    emit('session/event', target, turnStart(2))
    emit('session/event', target, assistant(BROKEN))
    sink.emit(emit, 2)
    expect(sink.steered).toHaveLength(2)
  })

  test('a subagent session is never steered', () => {
    const { emit } = harness()
    const child = session('child', 'parent')
    const sink = boundarySink(child)
    emit('session/event', child, turnStart(1))
    emit('session/event', child, assistant(BROKEN))
    sink.emit(emit, 1)
    expect(sink.steered).toHaveLength(0)
  })

  test('an outstanding render_ui result blocks steering until it settles', () => {
    const { emit } = harness()
    const target = session()
    const sink = boundarySink(target)
    emit('session/event', target, turnStart(1))
    emit('session/event', target, toolCall('render_ui', 'c1'))
    sink.emit(emit, 1)
    expect(sink.steered).toHaveLength(0)

    emit('session/event', target, toolResult('c1', 'invalid'))
    sink.emit(emit, 1)
    expect(sink.steered).toHaveLength(0)
  })

  test('validated + reasoning-only delivers one reminder per turn', () => {
    const { emit } = harness()
    const target = session()
    const sink = boundarySink(target)
    emit('session/event', target, turnStart(1))
    emit('session/event', target, toolCall('validate_dsh_ui', 'v1'))
    emit('session/event', target, assistantReasoning())
    sink.emit(emit, 1)

    expect(sink.steered).toHaveLength(1)
    expect(JSON.stringify(sink.steered[0]?.content)).toContain('status=nothing_delivered')

    sink.emit(emit, 1)
    expect(sink.steered).toHaveLength(1)
  })

  test('a delivered body suppresses the reminder', () => {
    const { emit } = harness()
    const target = session()
    const sink = boundarySink(target)
    emit('session/event', target, turnStart(1))
    emit('session/event', target, toolCall('validate_dsh_ui', 'v1'))
    emit('session/event', target, assistant('plenty of prose, no fence'))
    sink.emit(emit, 1)
    expect(sink.steered).toHaveLength(0)
  })

  test('a successful render_ui result counts as delivery', () => {
    const { emit } = harness()
    const target = session()
    const sink = boundarySink(target)
    emit('session/event', target, turnStart(1))
    emit('session/event', target, toolCall('validate_dsh_ui', 'v1'))
    emit('session/event', target, toolCall('render_ui', 'c1'))
    emit('session/event', target, toolResult('c1', 'rendered'))
    sink.emit(emit, 1)
    expect(sink.steered).toHaveLength(0)
  })

  test('the feature switch disables steering entirely', () => {
    const { emit } = harness({ enabled: false })
    const target = session()
    const sink = boundarySink(target)
    emit('session/event', target, turnStart(1))
    emit('session/event', target, assistant(BROKEN))
    sink.emit(emit, 1)
    expect(sink.steered).toHaveLength(0)
  })

  test('a failing steer is logged, never thrown into the boundary', () => {
    const { emit, warnings } = harness()
    const target = session()
    emit('session/event', target, turnStart(1))
    emit('session/event', target, assistant(BROKEN))
    const agent = { session: target, steer: () => { throw new Error('inbox closed') } }
    expect(() => emit('agent/turn-stopping', { agent, turn: 1, signal: { aborted: false } })).not.toThrow()
    expect(warnings.join('\n')).toContain('fence feedback steering failed')
  })
})

describe('installFenceFeedback: stream interception', () => {
  test('non-GenUI sessions pass the stream through untouched', () => {
    const { emit } = harness()
    const sentinel = { passthrough: true }
    const next = () => sentinel
    expect(emit('llm/stream', { sessionId: 'unknown', purpose: undefined }, next)).toBe(sentinel)
  })

  test('subagent sessions pass the stream through untouched', () => {
    const { emit } = harness()
    const child = session('child', 'parent')
    emit('session/event', child, turnStart(1))
    emit('session/event', child, toolCall('validate_dsh_ui', 'v1'))
    const sentinel = { passthrough: true }
    expect(emit('llm/stream', { sessionId: 'child', purpose: undefined }, () => sentinel)).toBe(sentinel)
  })

  test('a GenUI session hands the stream to the reasoning-only gate', () => {
    const { emit } = harness()
    const target = session()
    emit('session/event', target, turnStart(1))
    emit('session/event', target, toolCall('validate_dsh_ui', 'v1'))
    const sentinel = { intercepted: true }
    expect(emit('llm/stream', { sessionId: 's1', purpose: undefined }, () => sentinel)).not.toBe(sentinel)
  })
})

/* ---------------- the reasoning-only gate ---------------- */

const GATE: ReasoningOnlyGate = { isAgentLoopRequest: () => true, emptyResponseCode: 'EMPTY_RESPONSE' }

type StreamState = NonNullable<Parameters<typeof retryReasoningOnlyGenuiStream>[2]>

function streamState(overrides: Partial<StreamState> = {}): StreamState {
  return {
    text: '',
    validatedThisTurn: true,
    isSubagent: false,
    deliveredThisTurn: false,
    pendingRenders: new Set<string>(),
    correctedSpec: new Set<string>(),
    deliveryRemindedTurns: new Set<number>(),
    correctionsThisTurn: 0,
    correctionsTurn: undefined,
    currentTurn: 1,
    accountedCorrectionMessageIds: new Set<string>(),
    ...overrides,
  }
}

function chunksOf(reasoning: boolean, stop = true): Array<Record<string, unknown>> {
  return [
    ...(reasoning ? [{ type: 'block-end', block: { type: 'reasoning' } }] : [{ type: 'block-end', block: { type: 'text' } }]),
    { type: 'finish', reason: stop ? { kind: 'stop' } : { kind: 'length' } },
  ]
}

async function collect(
  state: StreamState | undefined,
  chunks: Array<Record<string, unknown>>,
  options: { feedbackEnabled?: boolean; gate?: ReasoningOnlyGate } = {},
): Promise<Array<Record<string, unknown>>> {
  const source = (async function* () { for (const chunk of chunks) yield chunk })()
  const out: Array<Record<string, unknown>> = []
  for await (const chunk of retryReasoningOnlyGenuiStream(
    {} as never, source as never, state, options.feedbackEnabled ?? true, options.gate ?? GATE,
  )) {
    out.push(chunk as never)
  }
  return out
}

describe('reasoning-only gate', () => {
  test('non-agent-loop requests are never touched', async () => {
    const chunks = chunksOf(true)
    expect(await collect(streamState(), chunks, { gate: { ...GATE, isAgentLoopRequest: () => false } })).toEqual(chunks)
  })

  test('a reasoning-only stop passes through while a delivery reminder is still available', async () => {
    expect(await collect(streamState(), chunksOf(true))).toEqual(chunksOf(true))
  })

  test('a reasoning-only stop becomes a retryable empty response once reminded', async () => {
    const out = await collect(streamState({ deliveryRemindedTurns: new Set([1]) }), chunksOf(true))
    expect(out.at(-1)).toEqual({
      type: 'finish',
      reason: { kind: 'error', failure: { message: 'GenUI turn completed with reasoning only and no deliverable response', code: 'EMPTY_RESPONSE' } },
    })
  })

  test('a spent correction budget is the same as no reminder', async () => {
    const out = await collect(streamState({ correctionsTurn: 1, correctionsThisTurn: MAX_CORRECTIONS_PER_TURN }), chunksOf(true))
    expect(out.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error' } })
  })

  test('a response that carried any other block is left alone', async () => {
    const out = await collect(streamState({ deliveryRemindedTurns: new Set([1]) }), chunksOf(false))
    expect(out.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
  })

  test('a non-stop finish reason is left alone', async () => {
    const out = await collect(streamState({ deliveryRemindedTurns: new Set([1]) }), chunksOf(true, false))
    expect(out.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'length' } })
  })

  test('the feature switch keeps the host retry (no reminder is available)', async () => {
    const out = await collect(streamState({ deliveryRemindedTurns: new Set([1]) }), chunksOf(true), { feedbackEnabled: false })
    expect(out.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error' } })
  })

  test('a missing turn state falls back to the host retry', async () => {
    const out = await collect(undefined, chunksOf(true))
    expect(out.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error', failure: { code: 'EMPTY_RESPONSE' } } })
  })
})

