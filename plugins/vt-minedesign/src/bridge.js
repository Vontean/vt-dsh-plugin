/**
 * The host side of the MCP Apps handshake the MineDesign shell expects.
 *
 * MineDesign's application is an MCP App: in `dist/app.js` the bootstrap is
 * literally
 *
 *     if (window.parent !== window) { app = new App(...); await app.connect(); }
 *     client = createServiceClient({ app, apiBase: config.api });
 *
 * so **inside an iframe it always becomes a hosted app** and waits for its
 * parent to answer `ui/initialize`; only a top-level page falls back to the HTTP
 * API. That is why framing the app without a host sits forever on "Connecting to
 * the document".
 *
 * We are not going to become a general MCP host. The shell's own client uses
 * one method, `tools/call`, with the tool names its `OPERATIONS` table declares,
 * and each of those tools has an HTTP twin that the companion already serves
 * (`open` ↔ `minedesign_open_document`, …). So this module is a translation
 * table, not a bridge to the MCP server.
 *
 * Anything unmapped is refused rather than guessed: a tool that silently
 * returns the wrong shape would corrupt the editor's state.
 *
 * @module dsh-vt-minedesign/src/bridge
 */

/**
 * MCP tool → companion HTTP action, mirroring MineDesign's own `OPERATIONS`
 * table (`dist/cli.mjs`). `field` is the key the shell reads out of
 * `structuredContent`, exactly as it does for a real MCP tool result.
 *
 * @type {Record<string, { action: string, field: string | null }>}
 */
const TOOL_MAP = {
  minedesign_open_document: { action: 'open', field: 'document' },
  minedesign_annotations: { action: 'annotations', field: 'annotations' },
  minedesign_prepare_feedback: { action: 'prepare-feedback', field: null },
  minedesign_events: { action: 'events', field: null },
  minedesign_http: { action: 'http', field: null },
  minedesign_about: { action: 'about', field: null },
  minedesign_settings: { action: 'settings', field: null },
  minedesign_update: { action: 'update', field: null },
  minedesign_shell: { action: 'shell', field: null },
}

/**
 * Shape one result the way the MCP Apps client expects it.
 *
 * @param {unknown} payload - value the companion returned.
 * @param {string | null} field - key to lift into `structuredContent`, if any.
 * @returns {{ content: { type: 'text', text: string }[], structuredContent?: unknown }} tool result.
 */
function okResult(payload, field) {
  const text = payload === null || payload === undefined ? '' : JSON.stringify(payload)
  const result = { content: text === '' ? [] : [{ type: 'text', text }] }
  if (field === null) {
    return typeof payload === 'object' && payload !== null ? { ...result, structuredContent: payload } : result
  }
  return { ...result, structuredContent: { [field]: payload } }
}

/**
 * Shape one failure.
 * @param {string} message - reason shown by the shell.
 * @returns {{ isError: true, content: { type: 'text', text: string }[] }} tool result.
 */
function errorResult(message) {
  return { isError: true, content: [{ type: 'text', text: message }] }
}

/**
 * Build the bridge the panel route calls on POST.
 *
 * @param {object} options - wiring.
 * @param {{ api: (action: string, body?: Record<string, unknown>) => Promise<any>, appUrl: () => string | null }} options.companion
 *   the app controller; `api` reaches the app's own HTTP face.
 * @param {() => { id: string, title: string, kind: string, path: string, editorUrl: string }[]} options.documents
 *   the sessions the host remembers, for `minedesign_open`.
 * @returns {(tool: string, args: Record<string, unknown>) => Promise<unknown>} caller.
 */
export function createAppBridge({ companion, documents }) {
  return async function call(tool, args) {
    if (typeof tool !== 'string' || tool === '') return errorResult('missing tool name')
    const input = args !== null && typeof args === 'object' && !Array.isArray(args) ? args : {}

    // The app asks for the document list directly; ours is the authoritative one.
    if (tool === 'minedesign_open') {
      const list = typeof documents === 'function' ? documents() : []
      return { content: [], structuredContent: { documents: list } }
    }

    const mapped = TOOL_MAP[tool]
    if (mapped === undefined) return errorResult(`dsh-vt-minedesign: tool "${tool}" is not bridged`)

    const payload = await companion.api(mapped.action, input)
    if (payload === null) return errorResult(`dsh-vt-minedesign: ${mapped.action} failed`)
    // The companion wraps errors as `{ error: { code, message } }`.
    if (typeof payload === 'object' && payload !== null && 'error' in payload) {
      const detail = /** @type {{ message?: unknown }} */ (payload.error)
      return errorResult(typeof detail.message === 'string' ? detail.message : 'operation failed')
    }
    return okResult(payload, mapped.field)
  }
}

/** Exposed for tests: the bridged tool names. */
export const BRIDGED_TOOLS = Object.freeze(Object.keys(TOOL_MAP))
