/**
 * The HTTP route that feeds the side-panel tab.
 *
 * The browser half cannot ask the MCP server anything: the editor address only
 * ever appears inside an MCP tool result, which the host projects. So the host
 * owns one tiny read-only route, and the panel polls it. That is the whole seam
 * between the two halves — one JSON document, no RPC framework, no shared
 * module.
 *
 * Trust: the route is loopback-only and browser SOP already prevents another
 * origin from reading it, but the same Host/Origin checks the rest of the app
 * applies are cheap, so this route applies them too and answers 403 instead of
 * relying on the browser alone.
 *
 * @module dsh-vt-minedesign/src/panel
 */

/** Path the browser half polls. Fixed in both halves; changing it is a breaking change. */
export const PANEL_ROUTE = '/vt-minedesign/sessions'

/** Response body cap: 20 sessions of a few hundred bytes never approaches it. */
const MAX_BODY_BYTES = 64 * 1024

/**
 * @typedef {object} PanelSnapshot
 * @property {string} version - plugin version.
 * @property {{ id: string, title: string, kind: string, path: string, editorUrl: string, version?: string }[]} editors
 * @property {string | null} active - the most recently opened editor address.
 * @property {boolean} mcpConnected - whether `mcp__minedesign__*` tools exist.
 * @property {string | null} [appUrl] - the companion application URL when it is up.
 * @property {{ attempts: number, lastError: string | null, lastSessionId: string | null } | null} [delivery]
 *   last "Send to chat" outcomes, for diagnosis.
 * @property {{ autoOpen: boolean, entryButton: boolean }} [options] - behaviour the browser half reads.
 * @property {{ ok: boolean, version?: string | null, origin?: string, workspace?: string, reason?: string }} install
 */

/**
 * Whether the request came from this loopback app.
 *
 * Mirrors the app's own browser-trust rule: the Host must be loopback, and an
 * attached Origin (sent on same-origin POSTs and cross-origin GETs) must match
 * that Host. A request that fails this is refused before it reads any state.
 *
 * @param {import('node:http').IncomingMessage} request - incoming request.
 * @returns {boolean} whether the request is trusted.
 */
function isTrusted(request) {
  const authority = String(request.headers.host ?? '')
  const host = authority.split(':')[0]
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]') return false

  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === authority
  } catch {
    return false
  }
}

/**
 * Read a small request body as UTF-8 text.
 *
 * Bounded on purpose: the only client of this route is our own panel.
 *
 * @param {import('node:http').IncomingMessage} request - request to drain.
 * @returns {Promise<string>} body text.
 */
function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > 256 * 1024) {
        reject(new Error('body too large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', (error) => reject(error))
  })
}

/**
 * Write one JSON response.
 * @param {import('node:http').ServerResponse} response - response to own.
 * @param {number} status - HTTP status.
 * @param {unknown} body - JSON-serializable payload.
 * @param {boolean} [headOnly] - omit the body for HEAD.
 */
function sendJson(response, status, body, headOnly = false) {
  const text = JSON.stringify(body)
  response.writeHead(status, {
    // `charset=utf-8` keeps Chinese titles readable in devtools and curl.
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(headOnly ? undefined : text)
}

/**
 * Build the route definition registered on `ctx.webServer`.
 *
 * Never throws: a broken snapshot becomes a 500 with `{ ok: false, reason }`,
 * because a panel that says "unavailable" beats a route that kills the request.
 *
 * @param {object} options - wiring.
 * @param {() => PanelSnapshot} options.snapshot - snapshot reader bound to the plugin state.
 * @param {(tool: string, args: Record<string, unknown>) => Promise<unknown>} [options.bridge]
 *   MCP Apps tool bridge; POST bodies are forwarded to it.
 * @param {(input: { sessionId: string, text: string }) => Promise<{ ok: boolean, reason?: string }>} [options.deliver]
 *   delivers a message the app sends with `ui/message` ("Send to chat") into a session.
 * @returns {{ kind: 'exact', path: string, handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void> }} route.
 */
export function createSessionRoute({ snapshot, bridge, deliver }) {
  return {
    kind: 'exact',
    path: PANEL_ROUTE,
    async handler(request, response) {
      if (!isTrusted(request)) {
        sendJson(response, 403, { ok: false, reason: 'untrusted request' })
        return
      }
      if (request.method === 'POST') {
        try {
          const body = await readBody(request)
          const parsed = JSON.parse(body)

          // The app's "Send to chat" button: deliver a user message into the
          // session that framed it.
          if (parsed !== null && typeof parsed === 'object' && parsed.action === 'message') {
            if (typeof deliver !== 'function') {
              sendJson(response, 503, { ok: false, reason: 'no session delivery' })
              return
            }
            const text = typeof parsed.text === 'string' ? parsed.text : ''
            const sessionId = typeof parsed.sessionId === 'string' ? parsed.sessionId : ''
            if (text.trim() === '' || sessionId === '') {
              sendJson(response, 400, { ok: false, reason: 'expected { sessionId, text }' })
              return
            }
            const outcome = await deliver({ sessionId, text })
            sendJson(response, outcome.ok === true ? 200 : 502, outcome)
            return
          }

          if (parsed === null || typeof parsed !== 'object' || typeof parsed.tool !== 'string') {
            sendJson(response, 400, { ok: false, reason: 'expected { tool, args } or { action: "message" }' })
            return
          }
          if (typeof bridge !== 'function') {
            sendJson(response, 503, { ok: false, reason: 'no app bridge' })
            return
          }
          const args = parsed.args !== null && typeof parsed.args === 'object' ? parsed.args : {}
          sendJson(response, 200, { ok: true, result: await bridge(parsed.tool, args) })
        } catch (error) {
          sendJson(response, 400, { ok: false, reason: error instanceof Error ? error.message : String(error) })
        }
        return
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' })
        response.end()
        return
      }

      try {
        const state = snapshot()
        const body = {
          ok: true,
          version: state.version,
          editors: Array.isArray(state.editors) ? state.editors : [],
          active: typeof state.active === 'string' ? state.active : null,
          mcpConnected: state.mcpConnected === true,
          delivery: state.delivery ?? null,
          appUrl: typeof state.appUrl === 'string' && state.appUrl !== '' ? state.appUrl : null,
          options: state.options ?? { autoOpen: true, entryButton: true },
          install: state.install,
        }
        if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY_BYTES) {
          // Impossible with the 20-session bound; refuse rather than stream a giant body.
          sendJson(response, 500, { ok: false, reason: 'panel snapshot too large' })
          return
        }
        sendJson(response, 200, body, request.method === 'HEAD')
      } catch (error) {
        sendJson(response, 500, { ok: false, reason: error instanceof Error ? error.message : String(error) })
      }
    },
  }
}

/**
 * Build the panel snapshot reader.
 *
 * The snapshot is a **pure read of live state** with one deliberate exception:
 * the first poll asks the companion app to start, and replays every session the
 * host already remembers into it. Without that replay the app would open on its
 * "no document is open" screen after a restart even though a document is open.
 *
 * @param {object} input - live readers.
 * @param {string} input.version - plugin version reported to the panel.
 * @param {(refresh: boolean) => any} input.install - install resolution.
 * @param {() => string[]} input.tools - visible MineDesign tool names.
 * @param {ReturnType<import('./sessions.js').createSessions>} input.sessions - editor session registry.
 * @param {import('./companion.js').Companion | null} input.companion - app controller, when the panel runs.
 * @param {{ attempts: number, lastError: string | null, lastSessionId: string | null }} input.delivery - "Send to chat" outcomes.
 * @param {{ autoOpen: boolean, entryButton: boolean }} input.options - behaviour the browser half reads.
 * @returns {() => PanelSnapshot} snapshot reader.
 */
export function createPanelSnapshot({ version, install, tools, sessions, companion, delivery, options }) {
  return () => {
    if (companion !== null && companion.appUrl() === null) {
      void companion
        .ensureUrl()
        .then(() => {
          for (const session of sessions.list()) {
            void companion.open(session.path, session.kind).catch(() => false)
          }
        })
        .catch(() => null)
    }

    const resolved = install(false)
    return {
      version,
      editors: sessions.list(),
      active: sessions.activeUrl(),
      mcpConnected: tools().length > 0,
      appUrl: companion === null ? null : companion.appUrl(),
      options,
      delivery,
      install: resolved.ok
        ? {
            ok: true,
            version: resolved.install.version,
            origin: resolved.install.origin,
            workspace: resolved.install.workspace,
          }
        : { ok: false, reason: resolved.reason },
    }
  }
}
