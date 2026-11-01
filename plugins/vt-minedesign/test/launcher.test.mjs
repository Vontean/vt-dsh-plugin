import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { resolveInstall } from '../src/install.js'

/** Absolute path of the launcher under test. */
const LAUNCHER = fileURLToPath(new URL('../bin/mdn-mcp.mjs', import.meta.url))

/** Environment variables this suite manipulates. */
const TOUCHED = ['MINEDESIGN_HOME', 'MINEDESIGN_CLI', 'MINEDESIGN_WORKSPACE', 'PATH']

/** @type {Record<string, string | undefined>} */
const ORIGINAL = Object.fromEntries(TOUCHED.map((key) => [key, process.env[key]]))

/** How long one JSON-RPC round trip against the stub may take. */
const STUB_TIMEOUT_MS = 10_000

/** How long the real MineDesign MCP may take to boot, scan work and answer. */
const REAL_TIMEOUT_MS = 60_000

/** How long a child gets to die on SIGTERM before SIGKILL. */
const KILL_GRACE_MS = 3_000

/** Marker the stub prints on stderr, followed by one JSON summary. */
const STUB_MARKER = 'stub '

/**
 * The fake CLI the offline case installs: an MCP server with two methods.
 *
 * It is a stub, not a mock library: newline-delimited JSON in, newline-delimited
 * JSON out, stdin kept open afterwards. If the launcher does not hand stdio
 * straight through, nothing here can answer — which is exactly the property the
 * test is about. It also reports what it was launched with, on stderr, because
 * that is the only channel free of protocol traffic.
 */
const STUB_SOURCE = `import { createInterface } from 'node:readline'

const summary = {
  argv: process.argv.slice(2),
  electronRunAsNode: process.env.ELECTRON_RUN_AS_NODE ?? null,
}
process.stderr.write('${STUB_MARKER}' + JSON.stringify(summary) + '\\n')

const send = (message) => {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\\n')
}

const tools = [
  { name: 'stub_alpha', description: 'first stub tool', inputSchema: { type: 'object' } },
  { name: 'stub_beta', description: 'second stub tool', inputSchema: { type: 'object' } },
]

const lines = createInterface({ input: process.stdin })

lines.on('line', (line) => {
  if (line.trim() === '') return
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  if (message.method === 'initialize') {
    send({
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'stub-minedesign', version: '0.0.0' },
      },
    })
  } else if (message.method === 'tools/list') {
    send({ id: message.id, result: { tools } })
  }
})

// Keep stdin open, exactly like a real stdio server: closing it is the client's call.
lines.on('close', () => process.exit(0))
`

/**
 * Replace the environment this process, and every child it spawns, sees.
 * @param {Record<string, string | undefined>} next - values to install; undefined deletes.
 */
function setEnv(next) {
  for (const key of TOUCHED) {
    const value = next[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

/**
 * Set the resolution inputs for one test while keeping a usable PATH.
 * @param {{ MINEDESIGN_HOME?: string, MINEDESIGN_CLI?: string, MINEDESIGN_WORKSPACE?: string, PATH?: string }} next
 *   overrides; anything omitted falls back to "not set".
 */
function useEnv(next) {
  setEnv({
    PATH: ORIGINAL.PATH,
    MINEDESIGN_HOME: undefined,
    MINEDESIGN_CLI: undefined,
    MINEDESIGN_WORKSPACE: undefined,
    ...next,
  })
}

// Every test starts from a known resolution state rather than from whatever the
// developer's shell exported: a stray MINEDESIGN_CLI would quietly turn the
// "not installed" case into a success.
test.beforeEach(() => {
  useEnv({})
})

test.afterEach(() => {
  setEnv(ORIGINAL)
})

/**
 * Start a server through raw stdio and talk to it with a minimal JSON-RPC client.
 *
 * No SDK on purpose: the launcher's whole job is to hand stdio to a child, so
 * the cheapest honest check is to write newline-delimited JSON into that pipe.
 * The child is spawned with `process.execPath`, not `node`: one case deliberately
 * empties PATH, and an absolute runtime keeps that case about the launcher.
 *
 * @param {string} script - absolute path of the entry point to run.
 * @param {number} timeoutMs - per-request budget.
 * @returns {{
 *   request: (method: string, params?: object) => Promise<any>,
 *   notify: (method: string, params?: object) => void,
 *   waitForExit: (timeoutMs: number) => Promise<{ code: number | null, signal: string | null }>,
 *   close: () => Promise<void>,
 *   stderr: () => string,
 * }} the client.
 */
function startServer(script, timeoutMs) {
  const child = spawn(process.execPath, [script], { stdio: ['pipe', 'pipe', 'pipe'], env: process.env })
  /** @type {Map<number, { resolve: (value: any) => void, reject: (error: Error) => void, timer: NodeJS.Timeout }>} */
  const pending = new Map()
  let nextId = 1
  let stderr = ''
  let closed = false

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })
  child.on('error', (error) => {
    stderr += `[spawn] ${error.message}\n`
  })

  const lines = createInterface({ input: child.stdout })
  lines.on('line', (line) => {
    if (line.trim() === '') return
    let message
    try {
      message = JSON.parse(line)
    } catch {
      return
    }
    if (message.id === undefined) return // server-initiated notification
    const waiting = pending.get(message.id)
    if (waiting === undefined) return
    pending.delete(message.id)
    clearTimeout(waiting.timer)
    if (message.error !== undefined) waiting.reject(new Error(`JSON-RPC error: ${JSON.stringify(message.error)}`))
    else waiting.resolve(message.result)
  })

  child.on('exit', () => {
    closed = true
    lines.close()
    for (const [id, waiting] of pending) {
      clearTimeout(waiting.timer)
      pending.delete(id)
      waiting.reject(new Error(`the server exited before answering request ${id}. stderr:\n${stderr}`))
    }
  })

  /**
   * @param {string} method - JSON-RPC method.
   * @param {object} [params] - method params.
   * @returns {Promise<any>} the response `result`.
   */
  function request(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (closed) {
        reject(new Error(`the server has already exited. stderr:\n${stderr}`))
        return
      }
      const id = nextId
      nextId += 1
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`no answer to ${method} within ${timeoutMs}ms. stderr:\n${stderr}`))
      }, timeoutMs)
      pending.set(id, { resolve, reject, timer })
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    })
  }

  /**
   * @param {string} method - JSON-RPC notification method.
   * @param {object} [params] - method params.
   */
  function notify(method, params = {}) {
    if (closed) return
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`)
  }

  /**
   * Wait for the server's own exit and its complete stderr.
   *
   * `close`, not `exit`: the streams may still hold buffered bytes when the
   * process is already gone, and this case asserts on that text.
   *
   * @param {number} budgetMs - how long to wait before giving up.
   * @returns {Promise<{ code: number | null, signal: string | null }>} how it ended.
   */
  function waitForExit(budgetMs) {
    if (child.exitCode !== null || child.signalCode !== null) {
      return Promise.resolve({ code: child.exitCode, signal: child.signalCode })
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          // already gone
        }
        reject(new Error(`the server was still running after ${budgetMs}ms. stderr:\n${stderr}`))
      }, budgetMs)
      child.once('close', (code, signal) => {
        clearTimeout(timer)
        resolve({ code, signal })
      })
    })
  }

  /**
   * Let the server shut down: SIGTERM, then SIGKILL after a grace period.
   *
   * Never rejects, so a failed assertion cannot leave an orphan behind holding a
   * port or a work directory.
   *
   * @returns {Promise<void>} resolves once the child is gone.
   */
  function close() {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
    return new Promise((resolve) => {
      let settled = false
      /** @type {NodeJS.Timeout | undefined} */
      let force
      const done = () => {
        if (settled) return
        settled = true
        clearTimeout(force)
        resolve()
      }
      child.once('exit', done)
      force = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          // already gone
        }
        done()
      }, KILL_GRACE_MS)
      try {
        child.kill('SIGTERM')
      } catch {
        done()
      }
    })
  }

  return { request, notify, waitForExit, close, stderr: () => stderr }
}

/**
 * Poll until a condition holds.
 * @param {() => boolean} predicate - condition to observe.
 * @param {number} budgetMs - how long to keep trying.
 * @returns {Promise<void>} resolves once the condition holds.
 */
async function waitFor(predicate, budgetMs) {
  const deadline = Date.now() + budgetMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`the condition did not hold within ${budgetMs}ms`)
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

/**
 * Build a directory shaped like an installed MineDesign package.
 *
 * Shape only — that is all the resolver inspects: a `package.json` carrying the
 * real package name (how a package root is recognised) and the CLI the launcher
 * will spawn. No dependency on the real product, no network, no user paths.
 *
 * @param {string} parent - directory to build the fixture inside.
 * @returns {{ root: string, cli: string, workspace: string }} fixture paths.
 */
function stubInstall(parent) {
  const root = join(parent, 'package')
  const workspace = join(parent, 'workspace')
  mkdirSync(join(root, 'dist'), { recursive: true })
  mkdirSync(workspace, { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@vontean/minedesign', version: '0.0.0' }))
  const cli = join(root, 'dist', 'cli.mjs')
  writeFileSync(cli, STUB_SOURCE)
  return { root, cli, workspace }
}

test('hands stdio straight through to the resolved CLI', { timeout: STUB_TIMEOUT_MS * 3 }, async (t) => {
  const parent = mkdtempSync(join(tmpdir(), 'vt-minedesign-launcher-'))
  const { cli, workspace } = stubInstall(parent)
  useEnv({ MINEDESIGN_HOME: join(parent, 'empty-home'), MINEDESIGN_CLI: cli, MINEDESIGN_WORKSPACE: workspace })

  const server = startServer(LAUNCHER, STUB_TIMEOUT_MS)
  t.after(() => server.close())

  const initialized = await server.request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'launcher-test', version: '0' },
  })
  server.notify('notifications/initialized')
  assert.equal(initialized.serverInfo.name, 'stub-minedesign')

  const listed = await server.request('tools/list')
  assert.deepEqual(
    listed.tools.map((tool) => tool.name),
    ['stub_alpha', 'stub_beta'],
  )

  // The contract also covers how the child is started, and the stub reports
  // that on stderr: the workspace flag must arrive and the Electron flag must
  // be set for the child.
  await waitFor(() => server.stderr().includes(STUB_MARKER), 2_000)
  const reported = server.stderr().split('\n').find((line) => line.startsWith(STUB_MARKER))
  const summary = JSON.parse(reported.slice(STUB_MARKER.length))
  assert.equal(summary.electronRunAsNode, '1')
  assert.deepEqual(summary.argv, ['mcp', '--workspace', workspace])
})

test('prints one reason line on stderr and exits 1 when nothing is installed', { timeout: STUB_TIMEOUT_MS * 2 }, async (t) => {
  const parent = mkdtempSync(join(tmpdir(), 'vt-minedesign-missing-'))
  // An empty data directory and no PATH mean no candidate can win.
  useEnv({ MINEDESIGN_HOME: join(parent, 'empty-home'), PATH: '/nonexistent' })

  const server = startServer(LAUNCHER, STUB_TIMEOUT_MS)
  t.after(() => server.close())

  const { code } = await server.waitForExit(8_000)
  assert.equal(code, 1)

  const diagnostics = server.stderr().split('\n').filter((line) => line.startsWith('[dsh-vt-minedesign]'))
  assert.equal(diagnostics.length, 1, `expected exactly one reason line, got:\n${server.stderr()}`)
  assert.match(diagnostics[0], /^\[dsh-vt-minedesign\] MineDesign not found/u)
  // A reason, not a stack trace: the host log must stay readable.
  assert.doesNotMatch(server.stderr(), /^\s+at /mu)
})

test('launches the real MineDesign MCP and lists its 15 tools', { timeout: REAL_TIMEOUT_MS + 15_000 }, async (t) => {
  const resolved = resolveInstall()
  if (!resolved.ok) {
    t.skip(`no MineDesign install on this machine: ${resolved.reason}`)
    return
  }

  const server = startServer(LAUNCHER, REAL_TIMEOUT_MS)
  t.after(() => server.close())

  await server.request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'launcher-test', version: '0' },
  })
  server.notify('notifications/initialized')
  const listed = await server.request('tools/list')

  const names = listed.tools.map((tool) => tool.name)
  assert.equal(names.length, 15, `expected 15 tools, got ${names.length}: ${names.join(', ')}`)
  for (const required of ['minedesign_open', 'minedesign_open_document', 'design_check', 'design_system_check']) {
    assert.ok(names.includes(required), `expected ${required} among: ${names.join(', ')}`)
  }
})

test('ships no hard-coded user path in the launcher', () => {
  const source = readFileSync(new URL('../bin/mdn-mcp.mjs', import.meta.url), 'utf8')
  // Prose may name the conventional locations; code and comments here must stay
  // portable, so the whole file is checked.
  assert.doesNotMatch(source, /\/Users\//u)
  assert.doesNotMatch(source, /\/home\//u)
  assert.doesNotMatch(source, /['"`]~\//u)
})
