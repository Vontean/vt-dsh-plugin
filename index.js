/**
 * Host half of dsh-vt-Interface.
 *
 * Carries no behaviour. Every visual change lives in `client.js`, and both
 * verification channels are client-side (the always-on report tokens and the
 * opt-in probe).
 *
 * This module exists because the bundle patch inserts a plugin entry and the
 * Cordis loader imports the package root, so the package must expose `apply`.
 *
 * It previously held an Electron dev bridge: a file watcher that reloaded every
 * window on save, plus a renderer script that wrote measurements to
 * `/tmp/vt-probe.json`. Both were removed rather than kept:
 *
 *   · the client module loader already hot-reloads this package on save, so the
 *     watcher duplicated it (and its own log was never written);
 *   · the renderer script measured the same things `client.js` already measures,
 *     making it a second source of truth for the same facts.
 *
 * A UI patch should ship no background behaviour it does not need.
 */

export function apply() {
  // Intentionally empty: this plugin has no host-side behaviour.
}
