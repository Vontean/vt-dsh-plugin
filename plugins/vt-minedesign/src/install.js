/**
 * Resolve the MineDesign install that is already on this machine.
 *
 * Nothing here is MineDesign-specific in the protocol sense: this module only
 * answers "where is it, how do I launch it, where does it keep work, where are
 * its skills". Every caller (launcher, projection, status) reads the same
 * {@link Install} object, so there is exactly one discovery implementation.
 *
 * Why resolve instead of hard-code: MineDesign records its own launch spec in
 * `~/.minedesign/marketplace/plugins/minedesign/.mcp.json` (`mdn plugin install`
 * writes it), and that file is authoritative about the package root and the
 * work directory. Reading it means this package ships no user path at all: no
 * absolute home directory, no assumed node location.
 *
 * Resolution order, first usable candidate wins:
 *
 *   1. explicit `config.launch` (a human debugging the wiring);
 *   2. `MINEDESIGN_CLI` (a per-shell override, e.g. a checkout under test);
 *   3. `<dataDir>/marketplace/plugins/minedesign/.mcp.json` (the normal case);
 *   4. `mdn` on `PATH` (MineDesign installed but never registered a plugin).
 *
 * The module never throws: a machine without MineDesign yields
 * `{ ok: false, reason }` and the status tool explains it. A throwing resolver
 * would take the harness host down at load time for an optional integration.
 *
 * @module dsh-vt-minedesign/src/install
 */

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, delimiter, join, resolve } from 'node:path'

/** Package name of the npm-installed MineDesign, used to recognise a package root. */
const PACKAGE_NAME = '@vontean/minedesign'

/** Registered Codex plugin directory inside the data directory. */
const PLUGIN_DIR = join('marketplace', 'plugins', 'minedesign')

/** Data directory name under the user's home. */
const DATA_DIR_NAME = '.minedesign'

/** Default work directory name under the user's home. */
const WORKSPACE_NAME = 'MineDesign'

/** CLI executable name looked up on `PATH`. */
const CLI_NAME = 'mdn'

/** How many ancestors to inspect when turning a CLI path into a package root. */
const ROOT_SEARCH_DEPTH = 4

/**
 * @typedef {{ command: string, args: string[], env?: Record<string, string> }} LaunchSpec
 *
 * @typedef {object} Install
 * @property {string} root - package root holding `dist/`, `skills/` and `package.json`.
 * @property {string | null} version - declared MineDesign version.
 * @property {string} dataDir - `MINEDESIGN_HOME` or `~/.minedesign`.
 * @property {string} workspace - absolute work directory.
 * @property {string | null} skillsDir - directory holding `design/` and `design-system/`.
 * @property {string} cli - absolute path of the MCP entry point (`dist/cli.mjs`).
 * @property {LaunchSpec} launch - normalized launch spec the launcher spawns.
 * @property {'config' | 'mcp-json' | 'path'} origin - which candidate won.
 *
 * @typedef {{ ok: true, install: Install } | { ok: false, reason: string }} InstallResult
 */

/* ------------------------------------------------------------------ */
/* filesystem helpers (all total, none throw)                          */
/* ------------------------------------------------------------------ */

/**
 * Read and parse a JSON file.
 * @param {string} file - absolute path.
 * @returns {any | null} parsed value, or null on any failure.
 */
function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/**
 * @param {string} file - absolute path.
 * @returns {boolean} whether the path exists and is a regular file.
 */
function isFile(file) {
  try {
    return statSync(file).isFile()
  } catch {
    return false
  }
}

/**
 * @param {string} file - absolute path.
 * @returns {boolean} whether the path exists and is a directory.
 */
function isDirectory(file) {
  try {
    return statSync(file).isDirectory()
  } catch {
    return false
  }
}

/**
 * Resolve a path to its real location, keeping the original when that fails.
 * @param {string} file - absolute path.
 * @returns {string} real path, or the input.
 */
function real(file) {
  try {
    return realpathSync(file)
  } catch {
    return file
  }
}

/**
 * @param {unknown} value - candidate.
 * @returns {string | null} a trimmed non-empty string, or null.
 */
function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/* ------------------------------------------------------------------ */
/* candidate extraction                                               */
/* ------------------------------------------------------------------ */

/**
 * Pick the script path out of an argv tail.
 *
 * `.mcp.json` stores `[<cli.mjs>, 'mcp', '--workspace', <dir>]`; a hand-written
 * `launch.args` may add flags. The first JavaScript entry is the CLI.
 *
 * @param {unknown[]} args - argv without the executable.
 * @returns {string | null} absolute-looking script path, or null.
 */
function cliFromArgs(args) {
  for (const arg of args) {
    if (typeof arg !== 'string') continue
    if (!/\.(?:mjs|cjs|js)$/u.test(arg)) continue
    return arg
  }
  return null
}

/**
 * Everything after the CLI script in an argv list.
 * @param {string[]} args - argv without the executable.
 * @param {string | null} cli - the script found by {@link cliFromArgs}.
 * @returns {string[]} argv tail.
 */
function tailFromArgs(args, cli) {
  if (cli === null) return args
  const index = args.indexOf(cli)
  return index < 0 ? args : args.slice(index + 1)
}

/**
 * Turn a CLI path into the package root that contains `dist/` and `skills/`.
 *
 * `<root>/dist/cli.mjs` and `<root>/bin/mdn.mjs` both sit one directory below
 * the root, so walking ancestors for the owning `package.json` is stable for
 * both and works when a future layout adds a level.
 *
 * @param {string} cli - absolute CLI path.
 * @returns {string} best-effort package root.
 */
function rootFromCli(cli) {
  let directory = dirname(real(cli))
  for (let depth = 0; depth < ROOT_SEARCH_DEPTH; depth += 1) {
    const manifest = readJson(join(directory, 'package.json'))
    if (manifest !== null && manifest.name === PACKAGE_NAME) return directory
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  // Unknown packaging: the historical layout is still the best guess.
  return dirname(dirname(real(cli)))
}

/**
 * Scan `PATH` for an executable without spawning a shell.
 *
 * @param {string} name - executable name.
 * @param {string} pathValue - raw `PATH` string.
 * @returns {string | null} real path of the first hit, or null.
 */
function findOnPath(name, pathValue) {
  for (const entry of String(pathValue ?? '').split(delimiter)) {
    if (entry === '') continue
    const candidate = join(entry, name)
    if (isFile(candidate)) return real(candidate)
  }
  return null
}

/**
 * Drop the bare subcommand and any `--workspace` pair from an argv tail.
 *
 * The workspace is always rebound to `install.workspace` so one value has one
 * source; everything else the user wrote is preserved after it.
 *
 * @param {string[]} tail - argv tail after the CLI script.
 * @returns {string[]} extra flags.
 */
function extraFlags(tail) {
  /** @type {string[]} */
  const extras = []
  for (let index = 0; index < tail.length; index += 1) {
    const token = tail[index]
    if (token === 'mcp') continue
    if (token === '--workspace') {
      index += 1 // also skip the value
      continue
    }
    if (token.startsWith('--workspace=')) continue
    extras.push(token)
  }
  return extras
}

/* ------------------------------------------------------------------ */
/* install resolution                                                 */
/* ------------------------------------------------------------------ */

/**
 * @param {Record<string, unknown>} config - plugin config.
 * @returns {string} absolute data directory.
 */
function dataDirOf(config) {
  return resolve(text(config.dataDir) ?? text(process.env.MINEDESIGN_HOME) ?? join(homedir(), DATA_DIR_NAME))
}

/**
 * Read the launch spec MineDesign registered for itself.
 * @param {string} dataDir - absolute data directory.
 * @returns {LaunchSpec | null} recorded spec with its env, or null.
 */
function recordedLaunch(dataDir) {
  const file = join(dataDir, PLUGIN_DIR, '.mcp.json')
  const manifest = readJson(file)
  const servers = manifest !== null && typeof manifest === 'object' ? manifest.mcpServers : null
  if (servers === null || typeof servers !== 'object') return null

  const raw = servers.minedesign ?? servers[Object.keys(servers)[0]]
  if (raw === null || typeof raw !== 'object' || !Array.isArray(raw.args)) return null

  const cli = cliFromArgs(raw.args)
  if (cli === null) return null

  /** @type {Record<string, string>} */
  const env = {}
  if (raw.env !== null && typeof raw.env === 'object') {
    for (const [key, value] of Object.entries(raw.env)) {
      if (typeof value === 'string') env[key] = value
    }
  }
  return { command: text(raw.command) ?? process.execPath, args: raw.args.filter((arg) => typeof arg === 'string'), env }
}

/**
 * Choose the work directory.
 *
 * An explicitly configured workspace is honoured as written: the user may be
 * pointing at a directory MineDesign has not created yet. Only *discovered*
 * candidates are existence-checked, because a stale `install.json` must not
 * beat the conventional default.
 *
 * @param {Record<string, unknown>} config - plugin config.
 * @param {string} dataDir - absolute data directory.
 * @returns {string} absolute work directory.
 */
function workspaceOf(config, dataDir) {
  const explicit = text(config.workspace) ?? text(process.env.MINEDESIGN_WORKSPACE)
  if (explicit !== null) return resolve(explicit)

  const recorded = text(readJson(join(dataDir, 'install.json'))?.workspace)
  if (recorded !== null && isDirectory(resolve(recorded))) return resolve(recorded)

  return resolve(join(homedir(), WORKSPACE_NAME))
}

/**
 * Choose the skills directory: explicit config, then the registered plugin, then the package.
 * @param {Record<string, unknown>} config - plugin config.
 * @param {string} dataDir - absolute data directory.
 * @param {string} root - package root.
 * @returns {string | null} absolute skills directory, or null when none exists.
 */
function skillsDirOf(config, dataDir, root) {
  /** @type {string[]} */
  const candidates = []
  const explicit = text(config.skillsDir)
  if (explicit !== null) candidates.push(resolve(explicit))
  candidates.push(join(dataDir, PLUGIN_DIR, 'skills'))
  candidates.push(join(root, 'skills'))
  for (const candidate of candidates) {
    if (isDirectory(candidate)) return candidate
  }
  return null
}

/**
 * Assemble the final result from a resolved CLI path.
 *
 * @param {object} parts - resolved pieces.
 * @param {string} parts.cli - absolute CLI path.
 * @param {string[]} parts.tail - argv tail after the CLI script.
 * @param {string} parts.command - executable to spawn.
 * @param {Record<string, string>} [parts.env] - extra child environment.
 * @param {Install['origin']} parts.origin - winning candidate.
 * @param {Record<string, unknown>} config - plugin config.
 * @param {string} dataDir - absolute data directory.
 * @returns {InstallResult} the install, or a reason it cannot be resolved.
 */
function assemble(parts, config, dataDir) {
  const cli = resolve(real(parts.cli))
  if (!isFile(cli)) {
    return { ok: false, reason: `the resolved MineDesign CLI ${cli} does not exist` }
  }

  const root = rootFromCli(cli)
  const workspace = workspaceOf(config, dataDir)
  const manifest = readJson(join(root, 'package.json'))
  const version = text(manifest?.version)

  return {
    ok: true,
    install: {
      root,
      version,
      dataDir,
      workspace,
      skillsDir: skillsDirOf(config, dataDir, root),
      cli,
      launch: {
        command: parts.command,
        args: [cli, 'mcp', ...extraFlags(parts.tail), '--workspace', workspace],
        ...parts.env !== undefined && Object.keys(parts.env).length > 0 ? { env: parts.env } : {},
      },
      origin: parts.origin,
    },
  }
}

/**
 * Resolve the local MineDesign install.
 *
 * @param {{ workspace?: unknown, skillsDir?: unknown, dataDir?: unknown, launch?: { command?: unknown, args?: unknown } }} [config]
 *   plugin config; every key is optional.
 * @returns {InstallResult} the install, or a human-readable reason it is unusable.
 */
export function resolveInstall(config = {}) {
  const settings = config !== null && typeof config === 'object' ? config : {}
  const dataDir = dataDirOf(settings)

  const explicit = settings.launch
  if (explicit !== null && typeof explicit === 'object') {
    const command = text(explicit.command)
    const args = Array.isArray(explicit.args) ? explicit.args : []
    const cli = cliFromArgs(args)
    // A command that does not exist means the override is broken, not that we
    // should fall back silently: skip straight to the recorded spec instead.
    if (cli !== null && (command === null || isFile(command))) {
      return assemble(
        {
          cli,
          tail: tailFromArgs(args, cli),
          command: command ?? process.execPath,
          origin: 'config',
        },
        settings,
        dataDir,
      )
    }
  }

  const envCli = text(process.env.MINEDESIGN_CLI)
  if (envCli !== null) {
    return assemble({ cli: envCli, tail: [], command: process.execPath, origin: 'config' }, settings, dataDir)
  }

  const recorded = recordedLaunch(dataDir)
  if (recorded !== null) {
    const cli = cliFromArgs(recorded.args)
    return assemble(
      {
        cli: cli ?? recorded.command,
        tail: tailFromArgs(recorded.args, cli),
        // The recorded `command` is the node path of the day it was written.
        // Spawning it breaks after an nvm switch; the running binary is always right.
        command: process.execPath,
        env: recorded.env ?? {},
        origin: 'mcp-json',
      },
      settings,
      dataDir,
    )
  }

  const onPath = findOnPath(CLI_NAME, process.env.PATH)
  if (onPath !== null) {
    return assemble({ cli: onPath, tail: [], command: process.execPath, origin: 'path' }, settings, dataDir)
  }

  return {
    ok: false,
    reason:
      `MineDesign not found: no ${join(dataDir, PLUGIN_DIR, '.mcp.json')}, no ${CLI_NAME} on PATH. `
      + 'Install it with `npx @vontean/minedesign plugin install`, or point this plugin’s `launch.args` at its dist/cli.mjs.',
  }
}
