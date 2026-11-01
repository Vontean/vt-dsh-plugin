import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { resolveInstall } from '../src/install.js'

/** Environment variables this suite manipulates. */
const TOUCHED = ['MINEDESIGN_HOME', 'MINEDESIGN_CLI', 'MINEDESIGN_WORKSPACE', 'PATH']

/** @type {Record<string, string | undefined>} */
const ORIGINAL = Object.fromEntries(TOUCHED.map((key) => [key, process.env[key]]))

/**
 * Replace the environment for one test and remember the original.
 * @param {Record<string, string | undefined>} next - values to install; undefined deletes.
 */
function setEnv(next) {
  for (const key of TOUCHED) {
    const value = next[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

test.afterEach(() => {
  setEnv(ORIGINAL)
})

/**
 * Compare paths after resolving symlinks: on macOS `/var` is `/private/var`, and
 * the resolver realpaths whatever it recognises as a package root.
 * @param {string} path - any absolute path.
 * @returns {string} its real path.
 */
function rp(path) {
  return realpathSync(path)
}

/**
 * Build a directory shaped like an installed MineDesign package.
 *
 * The shape is what every other module consumes: `dist/cli.mjs` to launch,
 * `package.json` for the version, `skills/` for the two skills.
 *
 * @param {string} parent - directory to create the package inside.
 * @param {string} [version] - declared version.
 * @returns {{ root: string, cli: string }} the package root and its CLI path.
 */
function packageFixture(parent, version = '0.1.2') {
  const root = join(parent, 'package')
  mkdirSync(join(root, 'dist'), { recursive: true })
  mkdirSync(join(root, 'skills', 'design', 'references'), { recursive: true })
  mkdirSync(join(root, 'skills', 'design-system', 'references'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@vontean/minedesign', version }))
  const cli = join(root, 'dist', 'cli.mjs')
  writeFileSync(cli, '// fixture cli\n')
  writeFileSync(join(root, 'skills', 'design', 'SKILL.md'), '---\nname: design\ndescription: "make a design"\n---\n\n# design\n')
  writeFileSync(
    join(root, 'skills', 'design-system', 'SKILL.md'),
    '---\nname: design-system\ndescription: "make a design system"\n---\n\n# design-system\n',
  )
  return { root, cli }
}

/**
 * Build a `~/.minedesign`-shaped directory.
 * @param {object} options - fixture options.
 * @param {string} options.cli - CLI path recorded in `.mcp.json`.
 * @param {string} [options.registration] - `plugin install` style registration.
 * @param {string} [options.workspace] - recorded work directory.
 * @returns {string} the data directory.
 */
function dataDirFixture(options) {
  const dataDir = mkdtempSync(join(tmpdir(), 'vt-minedesign-home-'))
  const pluginDir = join(dataDir, 'marketplace', 'plugins', 'minedesign')
  mkdirSync(pluginDir, { recursive: true })
  writeFileSync(
    join(pluginDir, '.mcp.json'),
    JSON.stringify({
      mcpServers: {
        minedesign: {
          command: '/nonexistent/old-node',
          args: [options.cli, 'mcp', '--workspace', options.workspace ?? join(dataDir, 'work')],
          env: { MINEDESIGN_PLUGIN_VERSION: '0.1.2' },
        },
      },
    }),
  )
  if (options.workspace !== undefined) {
    writeFileSync(join(dataDir, 'install.json'), JSON.stringify({ workspace: options.workspace }))
  }
  if (options.registration !== 'none') {
    const skills = join(pluginDir, 'skills')
    mkdirSync(join(skills, 'design'), { recursive: true })
    writeFileSync(join(skills, 'design', 'SKILL.md'), '---\nname: design\ndescription: "make a design"\n---\n\n# design\n')
  }
  return dataDir
}

test('resolves the install from the .mcp.json MineDesign registered for itself', () => {
  const parent = mkdtempSync(join(tmpdir(), 'vt-minedesign-mcpjson-'))
  const { root, cli } = packageFixture(parent)
  const workspace = join(parent, 'work')
  mkdirSync(workspace)
  const dataDir = dataDirFixture({ cli, workspace })
  setEnv({ MINEDESIGN_HOME: dataDir, MINEDESIGN_CLI: undefined, MINEDESIGN_WORKSPACE: undefined, PATH: '/nonexistent' })

  const resolved = resolveInstall()
  assert.equal(resolved.ok, true)
  const { install } = resolved
  assert.equal(install.origin, 'mcp-json')
  assert.equal(install.root, rp(root))
  assert.equal(install.version, '0.1.2')
  assert.equal(install.cli, rp(cli))
  assert.equal(install.workspace, workspace)
  assert.equal(install.skillsDir, join(dataDir, 'marketplace', 'plugins', 'minedesign', 'skills'))
  // The recorded node path is stale by design; the running binary is used instead.
  assert.equal(install.launch.command, process.execPath)
  assert.deepEqual(install.launch.args, [rp(cli), 'mcp', '--workspace', workspace])
  assert.deepEqual(install.launch.env, { MINEDESIGN_PLUGIN_VERSION: '0.1.2' })
})

test('resolves an explicit launch config and keeps extra flags', () => {
  const parent = mkdtempSync(join(tmpdir(), 'vt-minedesign-config-'))
  const { root, cli } = packageFixture(parent)
  const workspace = join(parent, 'work')
  mkdirSync(workspace)
  setEnv({ MINEDESIGN_HOME: join(parent, 'empty-home'), MINEDESIGN_CLI: undefined, PATH: '/nonexistent' })

  const resolved = resolveInstall({
    workspace,
    launch: { command: process.execPath, args: [cli, 'mcp', '--port', '0', '--workspace', '/ignored'] },
  })
  assert.equal(resolved.ok, true)
  assert.equal(resolved.install.origin, 'config')
  assert.equal(resolved.install.root, rp(root))
  // The workspace is rebound to the resolved value; everything else survives.
  assert.deepEqual(resolved.install.launch.args, [rp(cli), 'mcp', '--port', '0', '--workspace', workspace])
})

test('resolves mdn on PATH when nothing is registered', () => {
  const parent = mkdtempSync(join(tmpdir(), 'vt-minedesign-path-'))
  const { root, cli } = packageFixture(parent)
  const bin = join(parent, 'bin')
  mkdirSync(bin)
  // A global install puts a `bin/mdn` symlink next to the package.
  symlinkSync(cli, join(bin, 'mdn'))
  setEnv({ MINEDESIGN_HOME: join(parent, 'empty-home'), MINEDESIGN_CLI: undefined, PATH: bin + delimiter + '/nonexistent' })

  const resolved = resolveInstall()
  assert.equal(resolved.ok, true)
  assert.equal(resolved.install.origin, 'path')
  assert.equal(resolved.install.root, rp(root))
  assert.equal(resolved.install.cli, rp(cli))
})

test('MINEDESIGN_CLI wins over the recorded registration', () => {
  const parent = mkdtempSync(join(tmpdir(), 'vt-minedesign-env-'))
  const { cli } = packageFixture(parent)
  const other = join(parent, 'other')
  mkdirSync(join(other, 'dist'), { recursive: true })
  writeFileSync(join(other, 'package.json'), JSON.stringify({ name: '@vontean/minedesign', version: '9.9.9' }))
  writeFileSync(join(other, 'dist', 'cli.mjs'), '// other cli\n')
  const dataDir = dataDirFixture({ cli })
  setEnv({
    MINEDESIGN_HOME: dataDir,
    MINEDESIGN_CLI: join(other, 'dist', 'cli.mjs'),
    MINEDESIGN_WORKSPACE: undefined,
    PATH: '/nonexistent',
  })

  const resolved = resolveInstall()
  assert.equal(resolved.ok, true)
  assert.equal(resolved.install.origin, 'config')
  assert.equal(resolved.install.version, '9.9.9')
})

test('reports a reason instead of throwing when MineDesign is absent', () => {
  const parent = mkdtempSync(join(tmpdir(), 'vt-minedesign-none-'))
  setEnv({ MINEDESIGN_HOME: join(parent, 'empty-home'), MINEDESIGN_CLI: undefined, PATH: '/nonexistent' })

  const resolved = resolveInstall()
  assert.equal(resolved.ok, false)
  assert.match(resolved.reason, /MineDesign not found/u)
  assert.match(resolved.reason, /plugin install/u)
})

test('honours a configured workspace even before it exists, and ignores a stale one', () => {
  const parent = mkdtempSync(join(tmpdir(), 'vt-minedesign-ws-'))
  const { cli } = packageFixture(parent)
  const dataDir = dataDirFixture({ cli, workspace: join(parent, 'gone') })
  const wanted = join(parent, 'wanted')
  setEnv({ MINEDESIGN_HOME: dataDir, MINEDESIGN_CLI: undefined, MINEDESIGN_WORKSPACE: undefined, PATH: '/nonexistent' })

  // Explicit config wins even when the directory is not there yet.
  assert.equal(resolveInstall({ workspace: wanted }).install.workspace, wanted)

  // Without config, a stale recorded workspace falls back to the default.
  writeFileSync(join(dataDir, 'install.json'), JSON.stringify({ workspace: join(parent, 'gone') }))
  assert.match(resolveInstall().install.workspace, /MineDesign$/u)
})

test('reads the workspace from install.json when nothing else sets it', () => {
  const parent = mkdtempSync(join(tmpdir(), 'vt-minedesign-installjson-'))
  const { cli } = packageFixture(parent)
  const dataDir = dataDirFixture({ cli, workspace: join(parent, 'recorded') })
  const workspace = join(parent, 'recorded')
  mkdirSync(workspace)
  writeFileSync(join(dataDir, 'install.json'), JSON.stringify({ workspace }))
  setEnv({ MINEDESIGN_HOME: dataDir, MINEDESIGN_CLI: undefined, MINEDESIGN_WORKSPACE: undefined, PATH: '/nonexistent' })

  const resolved = resolveInstall()
  assert.equal(resolved.ok, true)
  assert.equal(resolved.install.workspace, workspace)
})

test('honours an explicit skillsDir', () => {
  const parent = mkdtempSync(join(tmpdir(), 'vt-minedesign-skills-'))
  const { cli } = packageFixture(parent)
  const dataDir = dataDirFixture({ cli, registration: 'none' })
  const skills = join(parent, 'my-skills')
  mkdirSync(join(skills, 'design'), { recursive: true })
  setEnv({ MINEDESIGN_HOME: dataDir, MINEDESIGN_CLI: undefined, PATH: '/nonexistent' })

  const resolved = resolveInstall({ skillsDir: skills })
  assert.equal(resolved.ok, true)
  assert.equal(resolved.install.skillsDir, skills)
})

test('ships no hard-coded user path in executable code', () => {
  const source = readFileSync(new URL('../src/install.js', import.meta.url), 'utf8')
  // Prose may name the conventional locations; only code must stay portable.
  const code = source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '')
  assert.doesNotMatch(code, /\/Users\//u)
  assert.doesNotMatch(code, /\/home\//u)
  assert.doesNotMatch(code, /['"`]~\//u)
})
