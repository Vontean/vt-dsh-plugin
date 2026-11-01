#!/usr/bin/env node
/**
 * stdio MCP entry point for dsh-vt-minedesign.
 *
 * The MCP client spawns this file instead of MineDesign's own CLI, because the
 * launch spec MineDesign records for itself names the node binary of the day it
 * was written: switch node versions and it is gone. This file resolves the
 * install at run time (`src/install.js` is the only discovery implementation)
 * and hands its stdio to the child, so the MCP wire protocol is untouched —
 * this process is a pipe, nothing more.
 *
 * It writes nothing to stdout, because that stream carries JSON-RPC. A missing
 * install produces exactly one stderr line and exit code 1; the MCP client
 * records that line and leaves the rest of the harness booting normally.
 *
 * @module dsh-vt-minedesign/bin/mdn-mcp
 */

import { spawn } from 'node:child_process'
import { resolveInstall } from '../src/install.js'

/** Prefix that makes this plugin's diagnostics greppable in a host log. */
const PREFIX = '[dsh-vt-minedesign]'

/** Signals forwarded to the child: the child owns shutdown, not this file. */
const FORWARDED_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP']

/**
 * Report one reason on stderr and leave with a failure code.
 *
 * Deliberately not an exception: this runs before any MCP handshake exists, so
 * a stack trace would only be noise in the host's log.
 *
 * @param {string} reason - one line, without the prefix.
 * @returns {never} never returns.
 */
function fail(reason) {
  process.stderr.write(`${PREFIX} ${reason}\n`)
  process.exit(1)
}

/**
 * @param {unknown} error - anything thrown or emitted.
 * @returns {string} a one-line message.
 */
function messageOf(error) {
  if (error instanceof Error) return error.message
  return String(error)
}

let resolved
try {
  resolved = resolveInstall()
} catch (error) {
  // The resolver is written not to throw. Still, a broken checkout must not
  // print a stack trace into the MCP log.
  fail(`could not resolve the MineDesign install: ${messageOf(error)}`)
}

if (!resolved.ok) fail(resolved.reason)

const { install } = resolved

// ELECTRON_RUN_AS_NODE makes the host's Electron binary behave as plain node,
// so the child runs under whichever runtime is alive right now. The recorded
// env goes last: MineDesign owns its own variables.
const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...(install.launch.env ?? {}) }

let child
try {
  child = spawn(install.launch.command, install.launch.args, { stdio: 'inherit', env })
} catch (error) {
  fail(`could not start MineDesign MCP (${install.cli}): ${messageOf(error)}`)
}

// A spawn failure (ENOENT, EACCES, a broken interpreter) arrives as an event,
// not a throw. Same one-line contract as every other failure.
child.on('error', (error) => {
  fail(`could not start MineDesign MCP (${install.cli}): ${messageOf(error)}`)
})

for (const signal of FORWARDED_SIGNALS) {
  process.on(signal, () => {
    // The child may be gone already; a failed kill is not itself a failure.
    try {
      child.kill(signal)
    } catch {
      // ignore: the exit handler below decides the outcome
    }
  })
}

child.on('exit', (code, signal) => {
  if (signal !== null) {
    // Mirror the child's death by the same signal: a client distinguishes
    // "exited with a code" from "was killed", and so does a shell.
    process.removeAllListeners(signal)
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
