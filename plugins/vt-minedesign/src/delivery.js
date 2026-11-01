/**
 * Delivering a message from the panel into a conversation.
 *
 * The panel's "Send to chat" button crosses three interface surfaces before a
 * user message exists: the app's MCP Apps `ui/message`, the plugin's own HTTP
 * route, and the host's session controller. Only the last one is a contract we
 * do not own, and it is narrow (one method, two required fields, a signal), so
 * this module exists to absorb it: `deliver()` takes the one thing the app
 * knows — a session id and some text — and never throws.
 *
 * The record it keeps is deliberately part of the returned face: when delivery
 * fails, the panel payload can report *why* without a log file, which is the
 * difference between a diagnosable bug and a mystery.
 *
 * @module dsh-vt-minedesign/src/delivery
 */

import { randomUUID } from 'node:crypto'

/** How long one delivery may take before it is abandoned. */
const TIMEOUT_MS = 15_000

/**
 * @typedef {object} DeliveryState
 * @property {number} attempts - calls that reached the host (0 means the panel never posted one).
 * @property {string | null} lastError - last failure reason, or null.
 * @property {string | null} lastSessionId - session addressed by the last attempt.
 *
 * @typedef {{ deliver: (input: { sessionId: string, text: string }) => Promise<{ ok: boolean, reason?: string }>, state: DeliveryState }} Delivery
 */

/**
 * Create the delivery face for one plugin registration.
 *
 * @param {{ resolveController: () => any }} options - `resolveController` returns the host session controller, if present.
 * @returns {Delivery} delivery face.
 */
export function createDelivery({ resolveController }) {
  /** @type {DeliveryState} */
  const state = { attempts: 0, lastError: null, lastSessionId: null }

  return {
    state,

    async deliver({ sessionId, text }) {
      state.attempts += 1
      state.lastSessionId = sessionId
      state.lastError = null

      const controller = resolveController()
      if (controller === undefined || controller === null || typeof controller.prompt !== 'function') {
        state.lastError = 'session controller unavailable'
        return { ok: false, reason: state.lastError }
      }

      // `prompt` takes `(request, signal)`. A Remote call gets its signal
      // injected; a Host-side call must supply one, and the body aborts on it.
      const abort = new AbortController()
      const timer = setTimeout(() => abort.abort(), TIMEOUT_MS)
      try {
        await controller.prompt(
          {
            // Both fields are required by the controller's contract: the id
            // keeps retries idempotent, `queue` is the composer's own mode.
            requestId: randomUUID(),
            sessionId,
            mode: 'queue',
            content: [{ type: 'text', text }],
          },
          abort.signal,
        )
        return { ok: true }
      } catch (error) {
        state.lastError = error instanceof Error ? error.message : String(error)
        return { ok: false, reason: state.lastError }
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
