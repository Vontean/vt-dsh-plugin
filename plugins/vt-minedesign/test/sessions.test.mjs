import test from 'node:test'
import assert from 'node:assert/strict'
import { createSessions } from '../src/sessions.js'

/** A `structuredContent` payload shaped like MineDesign's `open_document` result. */
function documentResult(record) {
  return { isError: false, value: { structuredContent: { document: record } } }
}

/** A `structuredContent` payload shaped like MineDesign's `open` result. */
function documentsResult(records) {
  return { isError: false, value: { structuredContent: { documents: records } } }
}

const DOC = {
  id: 'doc-1',
  path: '/work/sayit',
  title: 'SAYIT',
  kind: 'design',
  version: 'local-1',
  editorPath: '/design/grant-1/',
  editorUrl: 'http://127.0.0.1:1/design/grant-1/',
}

test('remembers one opened document and reports it as active', () => {
  const sessions = createSessions()
  const accepted = sessions.remember(documentResult(DOC))

  assert.deepEqual(accepted, [DOC])
  assert.deepEqual(sessions.list(), [DOC])
  assert.equal(sessions.activeUrl(), DOC.editorUrl)
})

test('remembers a list of documents from minedesign_open', () => {
  const sessions = createSessions()
  sessions.remember(documentsResult([DOC, { ...DOC, id: 'doc-2', editorUrl: 'http://127.0.0.1:1/design/g2/' }]))

  assert.equal(sessions.list().length, 2)
  assert.equal(sessions.activeUrl(), 'http://127.0.0.1:1/design/g2/', 'the last one is active')
})

test('drops records without an editor address, and reports only what it kept', () => {
  const sessions = createSessions()
  const accepted = sessions.remember(documentsResult([{ id: 'x', title: 'no url' }, null, 'nope', DOC]))

  assert.deepEqual(accepted, [DOC])
  assert.equal(sessions.list().length, 1)
})

test('re-opening the same document moves it to the front of recency without duplicating', () => {
  const sessions = createSessions()
  const second = { ...DOC, id: 'doc-2', editorUrl: 'http://127.0.0.1:1/design/g2/' }
  sessions.remember(documentsResult([DOC, second]))
  sessions.remember(documentResult(DOC))

  assert.deepEqual(sessions.list().map((session) => session.id), ['doc-2', 'doc-1'])
  assert.equal(sessions.activeUrl(), DOC.editorUrl)
})

test('bounds the registry by dropping the oldest session', () => {
  const sessions = createSessions({ limit: 3 })
  for (let index = 0; index < 5; index += 1) {
    sessions.remember(documentResult({ ...DOC, id: `doc-${index}`, editorUrl: `http://127.0.0.1:1/design/g${index}/` }))
  }

  assert.deepEqual(sessions.list().map((session) => session.id), ['doc-2', 'doc-3', 'doc-4'])
})

test('defaults the kind when MineDesign omits it', () => {
  const sessions = createSessions()
  sessions.remember(documentResult({ id: 'doc-1', editorUrl: 'http://127.0.0.1:1/design/g1/', path: '/work/x' }))

  assert.equal(sessions.list()[0].kind, 'design')
})

test('ignores results from tools that announce no document', () => {
  const sessions = createSessions()
  assert.deepEqual(sessions.remember({ isError: false, value: { structuredContent: { events: [] } } }), [])
  assert.deepEqual(sessions.remember({}), [])
  assert.equal(sessions.activeUrl(), null)
})
