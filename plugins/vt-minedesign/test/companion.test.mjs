import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createCompanion } from '../src/companion.js'

const TOKEN = 'a'.repeat(48)
const APP_URL = `http://localhost:52098/app/${TOKEN}/`

/**
 * Fake child process: exposes stdout as an emitter and records kills.
 * @returns {{ child: any, killed: () => boolean }} fake process.
 */
function fakeChild() {
  const stdout = new EventEmitter()
  const child = new EventEmitter()
  child.stdout = stdout
  child.kill = () => {
    child.killed = true
  }
  child.emitUrl = (url) => stdout.emit('data', Buffer.from(`MineDesign: ${url}\n`))
  return { child, killed: () => child.killed === true }
}

/**
 * @param {object} [options] - overrides.
 * @returns {{ companion: import('../src/companion.js').Companion, calls: { requests: any[] }, killed: () => boolean, child: any }} wiring.
 */
function harness(options = {}) {
  const { child, killed } = fakeChild()
  const requests = []
  const companion = createCompanion({
    launch: { command: '/usr/bin/node', args: [], env: {} },
    cli: '/pkg/dist/cli.mjs',
    workspace: '/work',
    timeoutMs: options.timeoutMs ?? 50,
    spawnImpl: () => child,
    fetchImpl: async (url, init) => {
      requests.push({ url, init })
      return { ok: true, status: 200 }
    },
  })
  return { companion, child, killed, calls: { requests } }
}

test('adopts the URL MineDesign prints and reuses one process', async () => {
  const { companion, child } = harness()
  const pending = companion.ensureUrl()
  child.emitUrl(APP_URL)

  assert.equal(await pending, APP_URL)
  assert.equal(companion.appUrl(), APP_URL)
  // A second wait does not spawn again: the URL is cached.
  assert.equal(await companion.ensureUrl(), APP_URL)
})

test('opens a document through the app API once the URL is known', async () => {
  const { companion, child, calls } = harness()
  const pending = companion.ensureUrl()
  child.emitUrl(APP_URL)
  await pending

  const ok = await companion.open('/work/sayit', 'design')
  assert.equal(ok, true)
  assert.equal(calls.requests.length, 1)
  assert.equal(calls.requests[0].url, `http://localhost:52098/api/${TOKEN}/open`)
  assert.deepEqual(JSON.parse(calls.requests[0].init.body), { path: '/work/sayit', kind: 'design' })
})

test('a refused or failed open is reported, never thrown', async () => {
  const failing = createCompanion({
    launch: { command: 'node', args: [] },
    cli: '/cli.mjs',
    workspace: '/work',
    timeoutMs: 10,
    spawnImpl: () => {
      const { child } = fakeChild()
      setImmediate(() => child.emitUrl(APP_URL))
      return child
    },
    fetchImpl: async () => {
      throw new Error('ECONNREFUSED')
    },
  })
  await failing.ensureUrl()
  assert.equal(await failing.open('/work/x'), false)
})

test('no URL within the budget means no app, without throwing', async () => {
  const { companion } = harness({ timeoutMs: 20 })
  assert.equal(await companion.ensureUrl(), null)
  assert.equal(companion.appUrl(), null)
  assert.equal(await companion.open('/work/x'), false)
})

test('a spawn failure degrades to "no app"', async () => {
  const companion = createCompanion({
    launch: { command: 'node', args: [] },
    cli: '/cli.mjs',
    workspace: '/work',
    timeoutMs: 10,
    spawnImpl: () => {
      throw new Error('ENOENT')
    },
  })
  assert.equal(await companion.ensureUrl(), null)
})

test('a dead companion is forgotten so a later request can start a fresh one', async () => {
  const { companion, child } = harness()
  const pending = companion.ensureUrl()
  child.emitUrl(APP_URL)
  await pending
  child.emit('exit', 0)
  assert.equal(companion.appUrl(), null)
})

test('dispose stops the process and clears the URL', async () => {
  const { companion, child, killed } = harness()
  const pending = companion.ensureUrl()
  child.emitUrl(APP_URL)
  await pending

  companion.dispose()
  assert.equal(killed(), true)
  assert.equal(companion.appUrl(), null)
})
