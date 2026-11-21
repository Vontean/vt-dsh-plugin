/**
 * Lazy engine asset route: `/plugins/dsh-vt-gen-ui/assets/*`.
 *
 * This route is the security surface of the plugin's own HTTP endpoint — it
 * decides which file on disk a request maps to — and it is also the failure
 * surface: when the route or the build is missing, the client must degrade to a
 * plain-source fallback instead of hanging. Both halves are asserted here: the
 * pure routing decision (method, prefix, flat `.js`-only name, traversal) and
 * the handler's observable contract (status, headers, 404 degradation).
 */
import { describe, expect, test, vi } from 'vitest'
import { ASSET_FILE_RE, ASSET_ROUTE_PATH, createAssetHandler, resolveAssetRequest } from '../index.ts'

/** Capture what the handler writes, with the two members the route uses. */
function responseCapture() {
  const state: { status?: number; headers?: Record<string, string> | undefined; body?: unknown } = {}
  const res = {
    writeHead(status: number, headers?: Record<string, string>) {
      state.status = status
      state.headers = headers
      return res
    },
    end(body?: unknown) {
      state.body = body
    },
  }
  return { res, state }
}

function request(method: string | undefined, url: string | undefined) {
  return { method, url }
}

describe('resolveAssetRequest: path and name rules', () => {
  test('the prefix constant is the route the client requests', () => {
    expect(ASSET_ROUTE_PATH).toBe('/plugins/dsh-vt-gen-ui/assets')
    expect(resolveAssetRequest('GET', `${ASSET_ROUTE_PATH}/mermaid.js`)).toEqual({ status: 200, file: 'mermaid.js' })
  })

  test.each(['GET', 'HEAD'])('%s is served', method => {
    expect(resolveAssetRequest(method, `${ASSET_ROUTE_PATH}/three.js`).status).toBe(200)
  })

  test.each(['POST', 'PUT', 'DELETE', undefined])('%s is rejected with 405', method => {
    expect(resolveAssetRequest(method, `${ASSET_ROUTE_PATH}/three.js`).status).toBe(405)
  })

  test.each([
    ['a different plugin prefix', '/plugins/other/assets/a.js'],
    ['the prefix without a trailing segment', ASSET_ROUTE_PATH],
    ['an unrelated path', '/index.html'],
    ['a bare relative url', '/'],
  ])('%s is not this route (404)', (_label, url) => {
    expect(resolveAssetRequest('GET', url).status).toBe(404)
  })

  test('the cache-busting rev query does not change the file name', () => {
    expect(resolveAssetRequest('GET', `${ASSET_ROUTE_PATH}/echarts-core.js?rev=abc123`)).toEqual({
      status: 200, file: 'echarts-core.js',
    })
  })

  test.each([
    ['a subdirectory', `${ASSET_ROUTE_PATH}/nested/engine.js`],
    ['a non-js extension', `${ASSET_ROUTE_PATH}/theme.css`],
    ['an uppercase extension', `${ASSET_ROUTE_PATH}/engine.JS`],
    ['a leading dot', `${ASSET_ROUTE_PATH}/.hidden.js`],
    ['a traversal segment', `${ASSET_ROUTE_PATH}/../index.js`],
    ['an encoded traversal segment', `${ASSET_ROUTE_PATH}/%2e%2e%2findex.js`],
    ['a leading dash', `${ASSET_ROUTE_PATH}/-engine.js`],
    ['an empty name', `${ASSET_ROUTE_PATH}/`],
  ])('%s is refused with 404', (_label, url) => {
    expect(resolveAssetRequest('GET', url).status).toBe(404)
  })

  test('malformed percent-encoding is a 400, not a crash', () => {
    expect(resolveAssetRequest('GET', `${ASSET_ROUTE_PATH}/%ZZ.js`).status).toBe(400)
  })

  test('the file-name regex is the documented flat .js shape', () => {
    for (const name of ['a.js', 'echarts-full.js', 'icons.js', 'A_1-2.js']) expect(ASSET_FILE_RE.test(name)).toBe(true)
    for (const name of ['a.css', '.js', 'a/b.js', '../a.js', 'a.js.map']) expect(ASSET_FILE_RE.test(name)).toBe(false)
  })
})

describe('createAssetHandler: response contract', () => {
  test('a served asset carries the javascript content type and no-cache header', async () => {
    const body = Buffer.from('console.log(1)')
    const read = vi.fn(async () => body)
    const handler = createAssetHandler(read)
    const { res, state } = responseCapture()
    await handler(request('GET', `${ASSET_ROUTE_PATH}/mermaid.js`) as never, res as never)
    expect(read).toHaveBeenCalledWith('mermaid.js')
    expect(state.status).toBe(200)
    expect(state.headers).toEqual({ 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' })
    expect(state.body).toBe(body)
  })

  test('a missing asset degrades to a loud 404 and never reads outside the directory', async () => {
    const read = vi.fn(async () => { throw new Error('ENOENT') })
    const handler = createAssetHandler(read)
    const { res, state } = responseCapture()
    await handler(request('GET', `${ASSET_ROUTE_PATH}/three.js`) as never, res as never)
    expect(read).toHaveBeenCalledWith('three.js')
    expect(state.status).toBe(404)
    expect(state.body).toBeUndefined()
  })

  test('a rejected method answers 405 without touching the filesystem', async () => {
    const read = vi.fn(async () => Buffer.from(''))
    const handler = createAssetHandler(read)
    const { res, state } = responseCapture()
    await handler(request('POST', `${ASSET_ROUTE_PATH}/three.js`) as never, res as never)
    expect(read).not.toHaveBeenCalled()
    expect(state.status).toBe(405)
  })

  test('a traversal attempt never reaches the reader', async () => {
    const read = vi.fn(async () => Buffer.from(''))
    const handler = createAssetHandler(read)
    const { res, state } = responseCapture()
    await handler(request('GET', `${ASSET_ROUTE_PATH}/../../etc/passwd.js`) as never, res as never)
    expect(read).not.toHaveBeenCalled()
    expect(state.status).toBe(404)
  })
})
