import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { enrichMineDesignResult } from '../src/projection.js'

/** Same prefix `dsh-mcp-client` gives the local MineDesign server. */
const PREFIX = 'mcp__minedesign__'

/**
 * @param {string} text - any value.
 * @returns {number} its UTF-8 size.
 */
function bytes(text) {
  return Buffer.byteLength(text, 'utf8')
}

/**
 * Call the projection the way `tools/post-execute` will.
 * @param {string} suffix - tool name without the server prefix.
 * @param {unknown} structuredContent - payload the server attached.
 * @param {Record<string, unknown>} [overrides] - replace parts of `result`.
 * @returns {{ type: 'text', text: string }[] | undefined} projection output.
 */
function call(suffix, structuredContent, overrides = {}) {
  return enrichMineDesignResult({
    name: PREFIX + suffix,
    result: { isError: false, value: { structuredContent }, content: [], ...overrides },
  })
}

/**
 * Call and unwrap the single expected text block.
 * @param {string} suffix - tool name without the server prefix.
 * @param {unknown} structuredContent - payload the server attached.
 * @param {Record<string, unknown>} [overrides] - replace parts of `result`.
 * @returns {string} the projection text.
 */
function textOf(suffix, structuredContent, overrides = {}) {
  const blocks = call(suffix, structuredContent, overrides)
  assert.ok(blocks, 'expected a projection block')
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].type, 'text')
  return blocks[0].text
}

/** A realistic `structuredContent.documents[]` entry, copied from a real run. */
const DOCUMENT = {
  id: 'doc-1',
  path: '/work/demo/canvas.json',
  title: '登录页',
  kind: 'design',
  version: 2,
  editorPath: '/design/grant-1/',
  editorUrl: 'http://127.0.0.1:4310/design/grant-1/',
  project: 'demo',
}

/* ------------------------------------------------------------------ */
/* open / open_document: the editor URL is the whole point             */
/* ------------------------------------------------------------------ */

test('minedesign_open: one line per session, each carrying its editorUrl', () => {
  const second = { ...DOCUMENT, id: 'doc-2', title: '海报', editorUrl: 'http://127.0.0.1:4310/design/grant-2/' }
  const text = textOf('minedesign_open', { documents: [DOCUMENT, second] })
  const lines = text.split('\n')
  assert.equal(lines.length, 2)
  assert.equal(lines[0], `当前打开：登录页 — ${DOCUMENT.editorUrl}（id doc-1）`)
  assert.equal(lines[1], `当前打开：海报 — ${second.editorUrl}（id doc-2）`)
})

test('minedesign_open: an empty document list says nothing is open', () => {
  const text = textOf('minedesign_open', { documents: [] })
  assert.match(text, /没有打开的作品/)
})

test('minedesign_open: unusable entries are reported, not called "nothing open"', () => {
  const text = textOf('minedesign_open', { documents: [null, 'oops'] })
  assert.match(text, /无法识别/)
  assert.ok(!text.includes('没有打开的作品'))
})

test('minedesign_open_document: empty content still yields the editorUrl', () => {
  // The handoff notes call this the decisive case: `content` is empty upstream,
  // so without this projection the URL never reaches the model.
  const text = textOf('minedesign_open_document', { document: DOCUMENT }, { content: [] })
  assert.match(text, /^当前打开：登录页 — /)
  assert.ok(text.includes(DOCUMENT.editorUrl))
  // Annotations and prepare_feedback take this id; the model cannot call either
  // tool without it, so the projection must carry it.
  assert.ok(text.includes('id doc-1'))
})

test('minedesign_open_document: a missing editorUrl is flagged, never invented', () => {
  const { editorUrl: _dropped, ...withoutUrl } = DOCUMENT
  const text = textOf('minedesign_open_document', { document: withoutUrl })
  assert.match(text, /没有 editorUrl/)
  assert.ok(text.includes('id doc-1'))
  assert.ok(!text.includes('http'))
})

/* ------------------------------------------------------------------ */
/* editor feedback                                                     */
/* ------------------------------------------------------------------ */

test('minedesign_events: reports change presence, count, cursor, summary', () => {
  const events = [
    { type: 'annotation-created', id: 'a1' },
    { type: 'annotation-updated', id: 'a2' },
  ]
  const text = textOf('minedesign_events', { events, cursor: 12 })
  assert.match(text, /有外部改动/)
  assert.match(text, /2 条/)
  assert.match(text, /cursor 12/)
  assert.ok(text.includes('annotation-created'))
})

test('minedesign_events: no events means no external change', () => {
  const text = textOf('minedesign_events', { events: [], cursor: 0 })
  assert.match(text, /没有外部改动/)
  assert.match(text, /cursor 0/)
})

test('minedesign_annotations: count plus the annotation text as JSON', () => {
  const text = textOf('minedesign_annotations', {
    annotations: [{ id: 'a1', text: '标题字号偏小', target: '/work/demo/login.dc.html' }],
  })
  assert.match(text, /1 条/)
  assert.ok(text.includes('标题字号偏小'))
})

test('minedesign_prepare_feedback: version, count, staleness, annotations', () => {
  const text = textOf('minedesign_prepare_feedback', {
    version: 3,
    annotations: [{ id: 'a1', text: '间距改成 16' }],
    stale: false,
  })
  assert.match(text, /版本 3/)
  assert.match(text, /1 条标注/)
  assert.match(text, /已过期：否/)
  assert.ok(text.includes('间距改成 16'))
})

test('minedesign_prepare_feedback: stale=true reads as expired', () => {
  const text = textOf('minedesign_prepare_feedback', { version: 1, annotations: [], stale: true })
  assert.match(text, /已过期：是/)
})

/* ------------------------------------------------------------------ */
/* small status payloads                                               */
/* ------------------------------------------------------------------ */

test('minedesign_about: version, update status, job state, language', () => {
  const text = textOf('minedesign_about', {
    version: '0.1.2',
    status: { state: 'up-to-date' },
    job: { state: 'idle' },
    settings: { language: 'zh-CN' },
  })
  assert.match(text, /版本：0\.1\.2/)
  assert.match(text, /up-to-date/)
  assert.match(text, /更新任务：idle/)
  assert.match(text, /界面语言：zh-CN/)
})

test('minedesign_settings: language is shown', () => {
  assert.match(textOf('minedesign_settings', { language: 'zh-CN' }), /界面语言：zh-CN/)
})

test('minedesign_settings: an error is shown instead of silence', () => {
  assert.match(textOf('minedesign_settings', { error: 'permission denied' }), /错误：permission denied/)
})

test('minedesign_settings: nothing recognisable yields undefined', () => {
  assert.equal(call('minedesign_settings', {}), undefined)
})

/* ------------------------------------------------------------------ */
/* the 100 KB shell must never enter the context                       */
/* ------------------------------------------------------------------ */

test('minedesign_shell: build and byte size only, never the html', () => {
  const html = '<!doctype html>' + 'y'.repeat(100_000) + '</html>'
  const text = textOf('minedesign_shell', { build: 'df9a3c1', html })
  assert.match(text, /build df9a3c1/)
  assert.ok(text.includes(`${String(bytes(html))} 字节`))
  assert.ok(!text.includes('y'.repeat(20)), 'html body must not leak into the text')
  assert.ok(bytes(text) < 4096)
})

test('minedesign_shell: html alone still reports a size; nothing at all is undefined', () => {
  assert.match(textOf('minedesign_shell', { html: '<p>hi</p>' }), new RegExp(`html ${String(bytes('<p>hi</p>'))} 字节`))
  assert.equal(call('minedesign_shell', {}), undefined)
})

/* ------------------------------------------------------------------ */
/* proxy, reload, update                                               */
/* ------------------------------------------------------------------ */

test('minedesign_http: status fields plus a truncated body', () => {
  const text = textOf('minedesign_http', { status: 200, contentType: 'application/json', body: 'x'.repeat(200_000) })
  assert.match(text, /status 200/)
  assert.match(text, /正文/)
  assert.match(text, /已截断/)
  assert.ok(bytes(text) <= 4096)
})

test('minedesign_http: a bodyless response still shows the status', () => {
  const text = textOf('minedesign_http', { status: 204, ok: true })
  assert.match(text, /status 204/)
  assert.match(text, /ok true/)
})

test('minedesign_reload: reloaded documents keep their editor lines', () => {
  const text = textOf('minedesign_reload', { documents: [DOCUMENT] })
  assert.match(text, /重新加载：1 份作品/)
  assert.ok(text.includes(DOCUMENT.editorUrl))
})

test('minedesign_reload: an empty list is reported, not dropped', () => {
  assert.match(textOf('minedesign_reload', { documents: [] }), /没有打开的作品/)
})

test('minedesign_update: the payload is shown as compact JSON', () => {
  const text = textOf('minedesign_update', { version: '0.1.3', settings: { language: 'zh' } })
  assert.ok(text.includes('"version":"0.1.3"'))
  assert.ok(text.includes('"language":"zh"'))
})

/* ------------------------------------------------------------------ */
/* tools that are already model-visible                                */
/* ------------------------------------------------------------------ */

test('design checks and asset imports are left exactly as they are', () => {
  for (const suffix of ['design_check', 'design_system_check', 'design_import_asset', 'design_system_import_asset']) {
    assert.equal(call(suffix, { ok: true, issues: [] }), undefined, suffix)
  }
})

test('unknown tools under the MineDesign prefix are not guessed at', () => {
  assert.equal(call('minedesign_future_thing', { anything: true }), undefined)
})

/* ------------------------------------------------------------------ */
/* refusals                                                            */
/* ------------------------------------------------------------------ */

test('another MCP server is untouched', () => {
  const result = { isError: false, value: { structuredContent: { document: DOCUMENT } }, content: [] }
  assert.equal(enrichMineDesignResult({ name: 'mcp__figma__get_design_context', result }), undefined)
  assert.equal(enrichMineDesignResult({ name: 'figma_status', result }), undefined)
})

test('failed results are never papered over', () => {
  assert.equal(call('minedesign_open_document', { document: DOCUMENT }, { isError: true }), undefined)
})

test('results without a usable structuredContent are refused', () => {
  const base = { isError: false, content: [] }
  assert.equal(enrichMineDesignResult({ name: PREFIX + 'minedesign_open', result: base }), undefined)
  assert.equal(enrichMineDesignResult({ name: PREFIX + 'minedesign_open', result: { ...base, value: null } }), undefined)
  assert.equal(
    enrichMineDesignResult({ name: PREFIX + 'minedesign_open', result: { ...base, value: { structuredContent: 'text' } } }),
    undefined,
  )
  assert.equal(
    enrichMineDesignResult({ name: PREFIX + 'minedesign_open', result: { ...base, value: { structuredContent: [DOCUMENT] } } }),
    undefined,
  )
  assert.equal(
    enrichMineDesignResult({ name: PREFIX + 'minedesign_open', result: { ...base, value: { structuredContent: null } } }),
    undefined,
  )
})

test('malformed invocations return undefined instead of throwing', () => {
  for (const input of [undefined, null, {}, { name: PREFIX + 'minedesign_open' }, 'nonsense', 42]) {
    assert.equal(enrichMineDesignResult(input), undefined)
  }
  const bomb = {
    isError: false,
    value: {
      get structuredContent() {
        throw new Error('boom')
      },
    },
  }
  assert.equal(enrichMineDesignResult({ name: PREFIX + 'minedesign_open', result: bomb }), undefined)
})

/* ------------------------------------------------------------------ */
/* size discipline and purity                                          */
/* ------------------------------------------------------------------ */

test('oversized payloads are clipped to 4 KiB with a readable notice', () => {
  const text = textOf('minedesign_events', {
    events: [{ type: 'annotation-created', note: '长'.repeat(60_000) }],
    cursor: 9,
  })
  assert.ok(bytes(text) <= 4096, `got ${String(bytes(text))} bytes`)
  assert.match(text, /已截断/)
  assert.match(text, /有外部改动/)
  // A code-point-aware cut must never leave half a surrogate pair or a U+FFFD.
  assert.equal(text.isWellFormed(), true)
  assert.ok(!text.includes('\uFFFD'))
})

test('a many-document open is still clipped to 4 KiB', () => {
  const documents = Array.from({ length: 200 }, (_, index) => ({
    ...DOCUMENT,
    id: `doc-${String(index)}`,
    title: `作品 ${String(index)}`,
    editorUrl: `http://127.0.0.1:4310/design/grant-${String(index)}/`,
  }))
  const text = textOf('minedesign_open', { documents })
  assert.ok(bytes(text) <= 4096, `got ${String(bytes(text))} bytes`)
  assert.match(text, /已截断/)
})

test('the result is not mutated and repeated calls agree', () => {
  const structuredContent = { documents: [DOCUMENT] }
  const result = { isError: false, value: { structuredContent }, content: [] }
  const before = JSON.stringify(result)
  const first = enrichMineDesignResult({ name: PREFIX + 'minedesign_open', result })
  const second = enrichMineDesignResult({ name: PREFIX + 'minedesign_open', result })
  assert.equal(JSON.stringify(result), before)
  assert.deepEqual(first, second)
})

test('a circular payload does not throw', () => {
  const circular = { documents: [] }
  circular.self = circular
  assert.doesNotThrow(() => call('minedesign_update', circular))
  assert.doesNotThrow(() => call('minedesign_open', circular))
})

/* ------------------------------------------------------------------ */
/* repository rule: no hard-coded user paths                           */
/* ------------------------------------------------------------------ */

test('projection.js contains no absolute user-path literals', () => {
  const source = readFileSync(new URL('../src/projection.js', import.meta.url), 'utf8')
  // Built from parts so this test file does not itself contain the patterns.
  const forbidden = [
    ['', 'Users', ''].join('/'),
    ['', 'home', ''].join('/'),
    `~${'/'}`,
  ]
  for (const needle of forbidden) {
    assert.equal(source.includes(needle), false, `src/projection.js must not contain ${needle}`)
  }
})
