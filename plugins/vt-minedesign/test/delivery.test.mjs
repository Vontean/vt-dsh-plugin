import test from 'node:test'
import assert from 'node:assert/strict'
import { createDelivery } from '../src/delivery.js'

/**
 * A session controller stand-in that records the one call it receives.
 * @param {(request: any, signal: any) => Promise<any>} [behaviour] - what `prompt` does.
 */
function controller(behaviour = async () => undefined) {
  const calls = []
  return {
    calls,
    prompt: async (request, signal) => {
      calls.push({ request, signal })
      return behaviour(request, signal)
    },
  }
}

test('delivers the text as a queued user prompt and records the attempt', async () => {
  const host = controller()
  const delivery = createDelivery({ resolveController: () => host })

  const outcome = await delivery.deliver({ sessionId: 'session-1', text: '把背景换成白色' })

  assert.deepEqual(outcome, { ok: true })
  assert.equal(delivery.state.attempts, 1)
  assert.equal(delivery.state.lastSessionId, 'session-1')
  assert.equal(delivery.state.lastError, null)

  const [{ request, signal }] = host.calls
  assert.equal(request.sessionId, 'session-1')
  // `mode: 'queue'` is the composer's own behaviour; `requestId` makes a retry idempotent.
  assert.equal(request.mode, 'queue')
  assert.match(request.requestId, /^[0-9a-f-]{36}$/u)
  assert.deepEqual(request.content, [{ type: 'text', text: '把背景换成白色' }])
  // A Host-side call must supply the signal a Remote call would have injected.
  assert.equal(typeof signal?.throwIfAborted, 'function')
})

test('reports a missing controller instead of throwing', async () => {
  const delivery = createDelivery({ resolveController: () => undefined })

  const outcome = await delivery.deliver({ sessionId: 'session-1', text: 'hi' })

  assert.equal(outcome.ok, false)
  assert.match(outcome.reason, /session controller unavailable/u)
  assert.equal(delivery.state.lastError, outcome.reason)
})

test('keeps the controller’s own reason so the panel can show it', async () => {
  const host = controller(async () => {
    throw new Error('no adapter serves provider "deepseek"')
  })
  const delivery = createDelivery({ resolveController: () => host })

  const outcome = await delivery.deliver({ sessionId: 'session-1', text: 'hi' })

  assert.equal(outcome.ok, false)
  assert.equal(delivery.state.lastError, 'no adapter serves provider "deepseek"')
})

test('clears a previous error on the next attempt', async () => {
  let fail = true
  const host = controller(async () => {
    if (fail) throw new Error('boom')
  })
  const delivery = createDelivery({ resolveController: () => host })

  await delivery.deliver({ sessionId: 'session-1', text: 'one' })
  assert.equal(delivery.state.lastError, 'boom')

  fail = false
  await delivery.deliver({ sessionId: 'session-1', text: 'two' })
  assert.equal(delivery.state.lastError, null)
  assert.equal(delivery.state.attempts, 2)
})
