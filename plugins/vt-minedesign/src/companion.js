/**
 * The companion app process.
 *
 * Why a second MineDesign process exists: the panel should show MineDesign's
 * real application (top bar with the document switcher, zoom, undo/redo, play,
 * and the Properties/Tweaks/Comments side panel), not the bare editor page.
 * That application lives at `http://localhost:<port>/app/<token>/`, and the
 * token is a per-process secret. Reading MineDesign's own source settles it:
 *
 *   - `dist/cli.mjs` prints `MineDesign: ${service.url}` only in its **non-MCP**
 *     mode; in `mcp` mode the same URL is never printed and no MCP tool exposes
 *     it (`minedesign_shell` returns `window.MINEDESIGN_CONFIG` with only
 *     `{ documents, build }`, and the app's own code requires `config.api`,
 *     failing with `Invalid URL` without it);
 *   - so the only supported way to obtain a working app URL is to run the CLI in
 *     that mode and read the line it prints.
 *
 * Therefore: the MCP child keeps serving tools; this companion keeps serving the
 * application the user edits in. Both read the same workspace, and the document
 * id is `hash(kind:path)` — identical in both processes — so annotations and
 * files stay shared.
 *
 * Trade-off, stated plainly: two services watch one workspace. MineDesign's own
 * docs already warn about this for "Codex and MineDesign open at once". We keep
 * the agent writing through DSH file tools and this app as the user's surface,
 * and the panel says so in its docs.
 *
 * This module never throws: no companion means the panel falls back to the bare
 * editor URL it used before.
 *
 * @module dsh-vt-minedesign/src/companion
 */

import { spawn } from 'node:child_process'

/** How long the companion may take to print its URL before we give up for now. */
const DEFAULT_TIMEOUT_MS = 30_000

/** Line prefix MineDesign prints once its server is listening. */
const URL_LINE = /MineDesign: (https?:\/\/\S+)/u

/**
 * @typedef {object} Companion
 * @property {() => string | null} appUrl - the app URL once known.
 * @property {() => Promise<string | null>} ensureUrl - start the process if needed and wait for its URL.
 * @property {(path: string, kind?: string) => Promise<boolean>} open - ask the app to open one document.
 * @property {() => void} dispose - stop the process.
 */

/**
 * Create the companion controller.
 *
 * @param {object} options - wiring.
 * @param {{ command: string, args: string[], env?: Record<string, string> }} options.launch - the MCP launch spec; only its interpreter and env are reused.
 * @param {string} options.cli - MineDesign CLI path (`dist/cli.mjs`).
 * @param {string} options.workspace - work directory to serve.
 * @param {typeof spawn} [options.spawnImpl] - injectable for tests.
 * @param {typeof fetch} [options.fetchImpl] - injectable for tests.
 * @param {number} [options.timeoutMs] - URL wait budget.
 * @returns {Companion} controller.
 */
export function createCompanion({ launch, cli, workspace, spawnImpl = spawn, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  /** @type {import('node:child_process').ChildProcess | null} */
  let child = null
  /** @type {string | null} */
  let url = null
  /** @type {string | null} */
  let origin = null
  /** @type {string | null} */
  let token = null
  /** @type {Promise<string | null> | null} */
  let starting = null
  /** @type {ReturnType<typeof setTimeout> | null} */
  let budget = null
  let disposed = false

  /** @param {string} appUrl - printed URL. */
  const adopt = (appUrl) => {
    url = appUrl
    try {
      origin = new URL(appUrl).origin
      token = /\/app\/([0-9a-z]+)\//iu.exec(appUrl)?.[1] ?? null
    } catch {
      origin = null
      token = null
    }
  }

  /**
   * Start the process and resolve with its URL, or null.
   * @returns {Promise<string | null>} app URL.
   */
  const startOnce = () => {
    if (disposed) return Promise.resolve(null)
    if (child !== null && url !== null) return Promise.resolve(url)
    if (starting !== null) return starting

    starting = new Promise((resolve) => {
      /** @type {import('node:child_process').ChildProcess | null} */
      let proc = null
      let settled = false
      let buffer = ''

      const finish = (value) => {
        if (settled) return
        settled = true
        starting = null
        if (budget !== null) {
          clearTimeout(budget)
          budget = null
        }
        resolve(value)
      }

      try {
        proc = spawnImpl(launch.command, [cli, '--workspace', workspace], {
          stdio: ['ignore', 'pipe', 'ignore'],
          // The same runtime environment the MCP child uses; MineDesign reads
          // MINEDESIGN_* from here.
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...(launch.env ?? {}) },
        })
      } catch {
        finish(null)
        return
      }

      child = proc
      // Deliberately ref'd: the promise must settle even when nothing else keeps
      // the loop alive, and `dispose()` clears it.
      budget = setTimeout(() => finish(url), timeoutMs)

      proc.stdout?.on('data', (chunk) => {
        buffer += String(chunk)
        const match = URL_LINE.exec(buffer)
        if (match === null) return
        adopt(match[1])
        finish(url)
      })
      proc.on('error', () => {
        child = null
        finish(null)
      })
      proc.on('exit', () => {
        // A dead companion means the panel falls back to the editor page; the
        // next request may start a fresh one.
        child = null
        url = null
        origin = null
        token = null
        finish(null)
      })
    })

    return starting
  }

  return {
    appUrl: () => url,

    async ensureUrl() {
      if (url !== null) return url
      return startOnce()
    },

    /**
     * Call one companion HTTP operation (`/api/<token>/<action>`).
     *
     * The shell talks to the MCP host instead of HTTP when it is embedded, so
     * this is what the host-side bridge uses to answer its tool calls.
     *
     * @param {string} action - `open`, `annotations`, `events`, …
     * @param {Record<string, unknown>} body - JSON body (ignored for GET-like actions).
     * @returns {Promise<any>} parsed JSON, or null on any failure.
     */
    async api(action, body = {}) {
      await this.ensureUrl()
      if (origin === null || token === null || typeof action !== 'string' || !/^[a-z-]{1,32}$/u.test(action)) return null
      try {
        const response = await fetchImpl(`${origin}/api/${token}/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body ?? {}),
        })
        if (!response.ok) return null
        return await response.json()
      } catch {
        return null
      }
    },

    /**
     * Mirror one open document into the app, so the shell shows it.
     * @param {string} path - document directory.
     * @param {string} [kind] - `design` or `design-system`.
     * @returns {Promise<boolean>} whether the app accepted it.
     */
    async open(path, kind = 'design') {
      const appUrl = await this.ensureUrl()
      if (appUrl === null || origin === null || token === null || typeof path !== 'string' || path === '') return false
      try {
        const response = await fetchImpl(`${origin}/api/${token}/open`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, kind }),
        })
        return response.ok === true
      } catch {
        return false
      }
    },

    dispose() {
      disposed = true
      if (budget !== null) {
        clearTimeout(budget)
        budget = null
      }
      const proc = child
      child = null
      url = null
      origin = null
      token = null
      try {
        proc?.kill('SIGTERM')
      } catch {
        /* already gone */
      }
    },
  }
}
