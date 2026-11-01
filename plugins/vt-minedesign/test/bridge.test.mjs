import test from 'node:test'
import assert from 'node:assert/strict'
import { createAppBridge, BRIDGED_TOOLS } from '../src/bridge.js'

/**
 * @param {Record<string, any>} replies - action → payload the companion returns.
 * @returns {{ bridge: ReturnType<typeof createAppBridge>, calls: { action: string, body: any }[] }} wiring.
 */
function harness(replies = {}) {
  const calls = []
  const companion = {
    appUrl: () => 'http://localhost:1/app/x/',
    async api(action, body) {
      calls.push({ action, body })
      return replies[action] ?? null
    },
  }
  const documents = [{ id: 'doc-1', title: 'SAYIT', kind: 'design', path: '/work/sayit', editorUrl: 'http://127.0.0.1:1/design/g/' }]
  return { bridge: createAppBridge({ companion, documents: () => documents }), calls }
}

test('bridges open_document onto the app API and lifts the document field', async () => {
  const record = { id: 'doc-1', title: 'SAYIT', kind: 'design' }
  const { bridge, calls } = harness({ open: record })

  const result = await bridge('minedesign_open_document', { path: '/work/sayit', kind: 'design' })
  assert.deepEqual(calls[0], { action: 'open', body: { path: '/work/sayit', kind: 'design' } })
  assert.deepEqual(result.structuredContent, { document: record })
  assert.equal(result.isError, undefined)
})

test('serves the document list for minedesign_open without touching the app', async () => {
  const { bridge, calls } = harness()
  const result = await bridge('minedesign_open', {})
  assert.equal(calls.length, 0)
  assert.equal(result.structuredContent.documents.length, 1)
})

test('bridges annotations with the field the shell reads', async () => {
  const { bridge } = harness({ annotations: [{ id: 'a1', text: 'hi' }] })
  const result = await bridge('minedesign_annotations', { id: 'doc-1' })
  assert.deepEqual(result.structuredContent, { annotations: [{ id: 'a1', text: 'hi' }] })
})

test('refuses tools it does not map instead of guessing a shape', async () => {
  const { bridge, calls } = harness()
  const result = await bridge('design_check', { path: '/work/sayit' })
  assert.equal(result.isError, true)
  assert.match(result.content[0].text, /not bridged/u)
  assert.equal(calls.length, 0)
})

test('reports a failed operation as an error result', async () => {
  const { bridge } = harness({ about: { error: { code: 'x', message: 'upstream down' } } })
  const result = await bridge('minedesign_about', {})
  assert.equal(result.isError, true)
  assert.match(result.content[0].text, /upstream down/u)
})

test('a null payload (app unreachable) becomes an error, never a crash', async () => {
  const { bridge } = harness()
  const result = await bridge('minedesign_settings', {})
  assert.equal(result.isError, true)
})

test('accepts missing or malformed arguments', async () => {
  const { bridge, calls } = harness({ about: { version: '0.1.2' } })
  const result = await bridge('minedesign_about', null)
  assert.equal(result.isError, undefined)
  assert.deepEqual(calls[0].body, {})
})

test('every bridged tool has a companion action', () => {
  assert.ok(BRIDGED_TOOLS.includes('minedesign_open_document'))
  assert.ok(BRIDGED_TOOLS.includes('minedesign_events'))
  assert.ok(!BRIDGED_TOOLS.includes('design_check'), 'checks are MCP-only')
})
