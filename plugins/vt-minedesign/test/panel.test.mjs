import test from 'node:test'
import assert from 'node:assert/strict'
import { createSessionRoute, PANEL_ROUTE } from '../src/panel.js'

/**
 * Minimal request stand-in. Only the fields the route reads are present.
 * @param {object} [options] - request shape.
 * @returns {import('node:http').IncomingMessage} fake request.
 */
function request({ method = 'GET', host = '127.0.0.1:64370', origin = undefined } = {}) {
  return /** @type {any} */ ({ method, headers: { host, ...origin === undefined ? {} : { origin } } })
}

/**
 * Request stand-in carrying a JSON body.
 * @param {unknown} payload - JSON body to send.
 * @returns {import('node:http').IncomingMessage} fake request.
 */
function postRequest(payload) {
  return /** @type {any} */ ({
    method: 'POST',
    headers: { host: '127.0.0.1:64370' },
    on(event, handler) {
      if (event === 'data') handler(Buffer.from(JSON.stringify(payload)))
      if (event === 'end') handler()
    },
  })
}

/**
 * Response stub that records what the route wrote.
 * @returns {{ res: any, read: () => { status: number, headers: Record<string, string>, body: string, ended: boolean } }} instrumentation.
 */
function response() {
  const state = { status: 0, headers: /** @type {Record<string, string>} */ ({}), chunks: [], ended: false }
  const res = {
    writeHead(status, headers) {
      state.status = status
      Object.assign(state.headers, headers ?? {})
      return res
    },
    end(body) {
      if (body !== undefined) state.chunks.push(String(body))
      state.ended = true
    },
  }
  return { res, read: () => ({ ...state, body: state.chunks.join('') }) }
}

/** A realistic snapshot, matching what `index.js` builds. */
const SNAPSHOT = {
  version: '1.0.0',
  editors: [
    {
      id: 'doc-1',
      title: '接入检查',
      kind: 'design',
      path: '/work/dsh-plugin-check',
      editorUrl: 'http://127.0.0.1:64379/design/grant-1/',
      version: 'local-abc',
    },
  ],
  active: 'http://127.0.0.1:64379/design/grant-1/',
  mcpConnected: true,
  install: { ok: true, version: '0.1.2', origin: 'mcp-json', workspace: '/work' },
}

test('serves the current editor sessions as JSON', async () => {
  const route = createSessionRoute({ snapshot: () => SNAPSHOT })
  assert.equal(route.kind, 'exact')
  assert.equal(route.path, PANEL_ROUTE)

  const { res, read } = response()
  await route.handler(request(), res)
  const out = read()

  assert.equal(out.status, 200)
  assert.equal(out.headers['Content-Type'], 'application/json; charset=utf-8')
  assert.equal(out.headers['Cache-Control'], 'no-store')

  const body = JSON.parse(out.body)
  assert.equal(body.ok, true)
  assert.equal(body.version, '1.0.0')
  assert.equal(body.editors.length, 1)
  assert.equal(body.editors[0].editorUrl, SNAPSHOT.active)
  assert.equal(body.active, SNAPSHOT.active)
  assert.equal(body.mcpConnected, true)
  assert.equal(body.appUrl, null, 'no companion means the panel frames the editor page')
  assert.equal(body.install.origin, 'mcp-json')
})

test('HEAD answers with headers and no body', async () => {
  const route = createSessionRoute({ snapshot: () => SNAPSHOT })
  const { res, read } = response()
  await route.handler(request({ method: 'HEAD' }), res)
  const out = read()

  assert.equal(out.status, 200)
  assert.equal(out.ended, true)
  assert.equal(out.body, '')
})

test('POST without a bridge is refused, and other methods stay unsupported', async () => {
  const route = createSessionRoute({ snapshot: () => SNAPSHOT })

  const post = response()
  await route.handler(postRequest({ tool: 'minedesign_about', args: {} }), post.res)
  assert.equal(post.read().status, 503, 'no bridge means the app cannot be hosted')

  const put = response()
  await route.handler(request({ method: 'PUT' }), put.res)
  assert.equal(put.read().status, 405)
  assert.equal(put.read().headers.Allow, 'GET, HEAD')
})

test('refuses a non-loopback Host and a foreign Origin', async () => {
  const route = createSessionRoute({ snapshot: () => SNAPSHOT })

  const remote = response()
  await route.handler(request({ host: '10.0.0.5:64370' }), remote.res)
  assert.equal(remote.read().status, 403)

  const foreign = response()
  await route.handler(request({ origin: 'http://evil.example' }), foreign.res)
  assert.equal(foreign.read().status, 403)

  const same = response()
  await route.handler(request({ origin: 'http://127.0.0.1:64370' }), same.res)
  assert.equal(same.read().status, 200)
})

test('reports an empty list instead of failing when nothing is open', async () => {
  const route = createSessionRoute({
    snapshot: () => ({ ...SNAPSHOT, editors: [], active: null, mcpConnected: false, install: { ok: false, reason: 'MineDesign not found' } }),
  })
  const { res, read } = response()
  await route.handler(request(), res)
  const body = JSON.parse(read().body)

  assert.equal(body.ok, true)
  assert.deepEqual(body.editors, [])
  assert.equal(body.active, null)
  assert.equal(body.install.ok, false)
  assert.equal(body.mcpConnected, false)
})

test('turns a broken snapshot into a 500 instead of throwing', async () => {
  const route = createSessionRoute({
    snapshot: () => {
      throw new Error('boom')
    },
  })
  const { res, read } = response()
  await route.handler(request(), res)
  const out = read()

  assert.equal(out.status, 500)
  assert.equal(JSON.parse(out.body).ok, false)
  assert.match(JSON.parse(out.body).reason, /boom/u)
})

test('never writes anything to disk and answers from the snapshot alone', async () => {
  let calls = 0
  const route = createSessionRoute({
    snapshot: () => {
      calls += 1
      return SNAPSHOT
    },
  })
  const first = response()
  await route.handler(request(), first.res)
  const second = response()
  await route.handler(request(), second.res)

  assert.equal(calls, 2, 'the route reads live state on every request')
  assert.equal(first.read().body, second.read().body)
})

test('delivers a "Send to chat" message into the session that framed the app', async () => {
  const delivered = []
  const route = createSessionRoute({
    snapshot: () => SNAPSHOT,
    deliver: async (input) => {
      delivered.push(input)
      return { ok: true }
    },
  })
  const { res, read } = response()
  await route.handler(
    postRequest({ action: 'message', sessionId: 's1', text: '把背景换成白色' }),
    res,
  )
  const out = read()

  assert.equal(out.status, 200)
  assert.deepEqual(JSON.parse(out.body), { ok: true })
  assert.deepEqual(delivered, [{ sessionId: 's1', text: '把背景换成白色' }])
})

test('reports a refused delivery instead of pretending it was sent', async () => {
  const route = createSessionRoute({
    snapshot: () => SNAPSHOT,
    deliver: async () => ({ ok: false, reason: 'session controller unavailable' }),
  })
  const { res, read } = response()
  await route.handler(
    postRequest({ action: 'message', sessionId: 's1', text: 'hi' }),
    res,
  )
  assert.equal(read().status, 502)
})

test('needs a session and some text, and a host that can deliver', async () => {
  const route = createSessionRoute({ snapshot: () => SNAPSHOT, deliver: async () => ({ ok: true }) })
  const empty = response()
  await route.handler(
    { method: 'POST', headers: { host: '127.0.0.1:64370' }, on: (event, handler) => {
      if (event === 'data') handler(Buffer.from(JSON.stringify({ action: 'message', sessionId: '', text: '  ' })))
      if (event === 'end') handler()
    } },
    empty.res,
  )
  assert.equal(empty.read().status, 400)

  const noDeliver = createSessionRoute({ snapshot: () => SNAPSHOT })
  const denied = response()
  await noDeliver.handler(
    { method: 'POST', headers: { host: '127.0.0.1:64370' }, on: (event, handler) => {
      if (event === 'data') handler(Buffer.from(JSON.stringify({ action: 'message', sessionId: 's1', text: 'hi' })))
      if (event === 'end') handler()
    } },
    denied.res,
  )
  assert.equal(denied.read().status, 503)
})
