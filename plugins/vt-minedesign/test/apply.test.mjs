import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, inject, name as pluginName } from '../index.js'
import { PANEL_ROUTE } from '../src/panel.js'

/** The panel reports the package version; read it instead of pinning a literal that breaks every release. */
const PLUGIN_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version


/** Environment variables this suite manipulates. */
const TOUCHED = ['MINEDESIGN_HOME', 'MINEDESIGN_CLI', 'MINEDESIGN_WORKSPACE', 'PATH']

/** @type {Record<string, string | undefined>} */
const ORIGINAL = Object.fromEntries(TOUCHED.map((key) => [key, process.env[key]]))

/**
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
 * Build a full stand-in for an installed MineDesign: package root, CLI, skills.
 * @param {string} [parent] - directory to build inside.
 * @returns {{ root: string, cli: string, skillsDir: string, workspace: string, dataDir: string }} fixture paths.
 */
function mineDesignFixture(parent = mkdtempSync(join(tmpdir(), 'vt-minedesign-apply-'))) {
  const root = join(parent, 'package')
  const skillsDir = join(root, 'skills')
  const workspace = join(parent, 'work')
  mkdirSync(join(root, 'dist'), { recursive: true })
  mkdirSync(workspace)
  mkdirSync(join(skillsDir, 'design'), { recursive: true })
  mkdirSync(join(skillsDir, 'design-system'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@vontean/minedesign', version: '0.1.2' }))
  const cli = join(root, 'dist', 'cli.mjs')
  writeFileSync(cli, '// fixture cli\n')
  writeFileSync(join(skillsDir, 'design', 'SKILL.md'), '---\nname: design\ndescription: "make a design"\n---\n\n# design\nuse it\n')
  writeFileSync(
    join(skillsDir, 'design-system', 'SKILL.md'),
    '---\nname: design-system\ndescription: "make a design system"\n---\n\n# design-system\nuse it\n',
  )
  return { root, cli, skillsDir, workspace, dataDir: join(parent, 'empty-home') }
}

/**
 * Minimal Cordis context stand-in recording every registration.
 * @param {{ tools?: string[] }} [options] - tool names the registry will report.
 */
function createHarness(options = {}) {
  const state = {
    section: /** @type {any} */ (null),
    provider: /** @type {any} */ (null),
    tool: /** @type {any} */ (null),
    hooks: /** @type {any[]} */ ([]),
    route: /** @type {any} */ (null),
    effects: /** @type {any[]} */ ([]),
    invalidations: 0,
  }
  const visibleTools = options.tools ?? []

  const ctx = {
    systemPrompt: {
      getSectionOrder: (sectionName) => (sectionName === 'MCP_SERVERS' ? 3100 : -1),
      section: (section) => {
        state.section = section
        return () => {}
      },
    },
    inject: (_services, callback) => callback(ctx),
    skills: {
      registerProvider: (factory) => {
        state.provider = factory({
          invalidate: () => {
            state.invalidations += 1
          },
          signal: AbortSignal.abort(),
        })
        return () => {}
      },
    },
    tools: {
      register: (definition) => {
        state.tool = definition
        return () => {}
      },
      schemas: () => [...visibleTools.map((toolName) => ({ name: toolName })), { name: 'minedesign_status' }],
    },
    on: (event, handler) => {
      if (event === 'tools/post-execute') state.hooks.push(handler)
      return () => {}
    },
    effect: (factory) => {
      const dispose = factory()
      state.effects.push(dispose)
      return dispose
    },
    get: (serviceName) => (serviceName === 'tools' ? ctx.tools : undefined),
    webServer: {
      register: (route) => {
        state.route = route
        return () => { state.route = null }
      },
    },
  }

  return { ctx, state }
}

/**
 * Config that points at the fixture without touching environment discovery.
 * @param {ReturnType<typeof mineDesignFixture>} fixture - fixture paths.
 * @returns {Record<string, unknown>} plugin config.
 */
function fixtureConfig(fixture) {
  return { skillsDir: fixture.skillsDir, workspace: fixture.workspace, launch: { command: process.execPath, args: [fixture.cli] } }
}

test('exports the package identity and keeps systemPrompt as the only hard injection', () => {
  assert.equal(pluginName, 'dsh-vt-minedesign')
  assert.deepEqual(inject, ['systemPrompt'])
})

test('registers the routing section at the host MCP_SERVERS placement', () => {
  const fixture = mineDesignFixture()
  setEnv({ MINEDESIGN_HOME: fixture.dataDir, MINEDESIGN_CLI: undefined, PATH: '/nonexistent' })
  const { ctx, state } = createHarness()
  apply(ctx, fixtureConfig(fixture))

  assert.equal(state.section.name, 'minedesign:routing')
  assert.equal(state.section.order, 3100)
  assert.equal(state.section.interpolate, false)

  const text = state.section.text()
  assert.match(text, /mcp__minedesign__/u)
  assert.match(text, /minedesign-design-system/u)
  assert.match(text, /__deck\/events/u)
  assert.match(text, /0\.1\.2/u)
})

test('the section degrades to install instructions when MineDesign is absent', () => {
  const parent = mkdtempSync(join(tmpdir(), 'vt-minedesign-absent-'))
  setEnv({ MINEDESIGN_HOME: join(parent, 'empty'), MINEDESIGN_CLI: undefined, PATH: '/nonexistent' })
  const { ctx, state } = createHarness()
  apply(ctx, {})

  const text = state.section.text()
  assert.match(text, /本机没找到可用的 MineDesign/u)
  assert.doesNotMatch(text, /技能就绪/u)
})

test('the provider lists both prefixed skills and returns adapted bodies', async () => {
  const fixture = mineDesignFixture()
  setEnv({ MINEDESIGN_HOME: fixture.dataDir, MINEDESIGN_CLI: undefined, PATH: '/nonexistent' })
  const { ctx, state } = createHarness()
  apply(ctx, fixtureConfig(fixture))

  const candidates = await state.provider.list({})
  assert.deepEqual(candidates.map((candidate) => candidate.name), ['minedesign-design', 'minedesign-design-system'])
  assert.equal(state.provider.name, 'dsh-vt-minedesign')

  const definition = await state.provider.get(candidates[0], {})
  assert.equal(definition.name, 'minedesign-design')
  assert.match(definition.content, /^# design/u)
  assert.match(definition.content, /DSH 适配/u)
  assert.equal(definition.resourceBase.kind, 'directory')
})

test('skillPrefix can be emptied to restore MineDesign’s own names', async () => {
  const fixture = mineDesignFixture()
  setEnv({ MINEDESIGN_HOME: fixture.dataDir, MINEDESIGN_CLI: undefined, PATH: '/nonexistent' })
  const { ctx, state } = createHarness()
  apply(ctx, { ...fixtureConfig(fixture), skillPrefix: '' })

  const candidates = await state.provider.list({})
  assert.deepEqual(candidates.map((candidate) => candidate.name), ['design', 'design-system'])
})

test('minedesign_status reports a connected session with its tools and skills', async () => {
  const fixture = mineDesignFixture()
  setEnv({ MINEDESIGN_HOME: fixture.dataDir, MINEDESIGN_CLI: undefined, PATH: '/nonexistent' })
  const { ctx, state } = createHarness({
    tools: ['mcp__minedesign__minedesign_open', 'mcp__minedesign__design_check', 'mcp__figma__use_figma'],
  })
  apply(ctx, fixtureConfig(fixture))

  const status = await state.tool.execute({})
  assert.equal(state.tool.name, 'minedesign_status')
  assert.equal(status.mcpConnected, true)
  // Only this server's tools; the Figma tool must not leak into the count.
  assert.deepEqual(status.tools, ['mcp__minedesign__design_check', 'mcp__minedesign__minedesign_open'])
  assert.equal(status.install.ok, true)
  assert.equal(status.install.origin, 'config')
  assert.equal(status.skills.count, 2)
  assert.equal(status.skills.dir, fixture.skillsDir)
  assert.deepEqual(status.hints, [])
})

test('minedesign_status offers a pasteable entry when the install exists but no tool is registered', async () => {
  const fixture = mineDesignFixture()
  setEnv({ MINEDESIGN_HOME: fixture.dataDir, MINEDESIGN_CLI: undefined, PATH: '/nonexistent' })
  const { ctx, state } = createHarness()
  apply(ctx, fixtureConfig(fixture))

  const status = await state.tool.execute({})
  assert.equal(status.mcpConnected, false)
  assert.equal(status.hints.length, 1)
  assert.match(status.hints[0], /mcp-minedesign/u)
  // The snippet must carry this machine's real paths, not a loader expression.
  assert.match(status.hints[0], new RegExp(fixture.cli.replaceAll('\\', '\\\\'), 'u'))
})

test('minedesign_status explains a missing install and a missing skills directory', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'vt-minedesign-status-missing-'))
  setEnv({ MINEDESIGN_HOME: join(parent, 'empty'), MINEDESIGN_CLI: undefined, PATH: '/nonexistent' })
  const { ctx, state } = createHarness()
  apply(ctx, {})

  const status = await state.tool.execute({})
  assert.equal(status.install.ok, false)
  assert.match(status.install.reason, /MineDesign not found/u)
  assert.equal(status.skills.count, 0)
  assert.equal(status.hints.length, 2)
  assert.match(status.hints[1], /plugin install/u)
})

test('the status payload defaults to an empty editor list and reports failures honestly', async () => {
  const fixture = mineDesignFixture()
  setEnv({ MINEDESIGN_HOME: fixture.dataDir, MINEDESIGN_CLI: undefined, PATH: '/nonexistent' })
  const { ctx, state } = createHarness()
  apply(ctx, fixtureConfig(fixture))

  const first = await state.tool.execute({ refresh: true })
  assert.deepEqual(first.editors, [])
  assert.ok(state.invalidations > 0, 'refresh must invalidate the catalog')
})

/**
 * Drive the registered post-execute hook.
 * @param {any[]} hooks - registered hooks.
 * @param {any} exec - tool execution.
 * @param {any} result - tool result.
 * @returns {Promise<any>} the decision.
 */
async function runHook(hooks, exec, result) {
  assert.equal(hooks.length, 1, 'exactly one post-execute hook must be registered')
  return hooks[0](exec, result, () => Promise.resolve({ kind: 'accept', content: result.content }))
}

test('post-execute appends the editor URL and remembers the session', async () => {
  const fixture = mineDesignFixture()
  setEnv({ MINEDESIGN_HOME: fixture.dataDir, MINEDESIGN_CLI: undefined, PATH: '/nonexistent' })
  const { ctx, state } = createHarness()
  apply(ctx, fixtureConfig(fixture))

  const result = {
    isError: false,
    content: [{ type: 'text', text: '作品已在 MineDesign 打开' }],
    value: {
      content: [],
      structuredContent: {
        document: { id: 'abc', path: '/work/demo', title: '演示稿', kind: 'design', editorUrl: 'http://127.0.0.1:1234/design/grant/' },
      },
    },
  }
  const decision = await runHook(state.hooks, { name: 'mcp__minedesign__minedesign_open_document', parent: undefined }, result)

  assert.equal(decision.kind, 'accept')
  assert.equal(decision.content.length, 2)
  assert.match(decision.content[1].text, /http:\/\/127\.0\.0\.1:1234\/design\/grant\//u)

  const status = await state.tool.execute({})
  assert.equal(status.editors.length, 1)
  assert.equal(status.editors[0].title, '演示稿')
})

test('post-execute leaves other servers, nested calls, failures and value projections alone', async () => {
  const fixture = mineDesignFixture()
  setEnv({ MINEDESIGN_HOME: fixture.dataDir, MINEDESIGN_CLI: undefined, PATH: '/nonexistent' })
  const { ctx, state } = createHarness()
  apply(ctx, fixtureConfig(fixture))

  const result = { isError: false, content: [], value: { structuredContent: { documents: [] } } }

  const foreign = await runHook(state.hooks, { name: 'mcp__figma__get_design_context' }, result)
  assert.deepEqual(foreign.content, [])

  const nested = await runHook(state.hooks, { name: 'mcp__minedesign__minedesign_open', parent: 'parent-token' }, result)
  assert.deepEqual(nested.content, [])

  const failed = await runHook(state.hooks, { name: 'mcp__minedesign__minedesign_open', isError: true }, { isError: true, content: [], value: undefined })
  assert.deepEqual(failed.content, [])

  const decision = { kind: 'accept', value: { content: [] } }
  const valueReplace = await state.hooks[0]({ name: 'mcp__minedesign__minedesign_open' }, result, () => Promise.resolve(decision))
  assert.equal(valueReplace, decision)
})

test('projection and routing switches turn each registration off', () => {
  const fixture = mineDesignFixture()
  setEnv({ MINEDESIGN_HOME: fixture.dataDir, MINEDESIGN_CLI: undefined, PATH: '/nonexistent' })

  const off = createHarness()
  apply(off.ctx, { ...fixtureConfig(fixture), routing: false, skills: false, projection: false })
  assert.equal(off.state.section, null)
  assert.equal(off.state.provider, null)
  assert.equal(off.state.hooks.length, 0)
  assert.ok(off.state.tool !== null, 'the status tool stays available')
})

/**
 * Drive the registered panel route once.
 * @param {any} route - registered route definition.
 * @returns {Promise<any>} parsed JSON body.
 */
async function readPanel(route) {
  const chunks = []
  const res = {
    writeHead() {},
    end(body) {
      if (body !== undefined) chunks.push(String(body))
    },
  }
  await route.handler({ method: 'GET', headers: { host: '127.0.0.1:64370' } }, res)
  return JSON.parse(chunks.join(''))
}

test('registers the panel route and serves the sessions it remembers', async () => {
  const fixture = mineDesignFixture()
  setEnv({ MINEDESIGN_HOME: fixture.dataDir, MINEDESIGN_CLI: undefined, PATH: '/nonexistent' })
  const { ctx, state } = createHarness()
  apply(ctx, fixtureConfig(fixture))

  assert.equal(state.route.path, PANEL_ROUTE)
  assert.equal(state.route.kind, 'exact')
  assert.deepEqual((await readPanel(state.route)).editors, [])

  // One editor result flows through post-execute, and the route picks it up.
  const result = {
    isError: false,
    content: [{ type: 'text', text: '作品已在 MineDesign 打开' }],
    value: {
      content: [],
      structuredContent: {
        document: {
          id: 'doc-9',
          path: '/work/demo',
          title: '演示稿',
          kind: 'design',
          version: 'local-1',
          editorPath: '/design/grant-9/',
          editorUrl: 'http://127.0.0.1:5555/design/grant-9/',
        },
      },
    },
  }
  await runHook(state.hooks, { name: 'mcp__minedesign__minedesign_open_document', parent: undefined }, result)

  const panel = await readPanel(state.route)
  assert.equal(panel.editors.length, 1)
  assert.equal(panel.editors[0].title, '演示稿')
  assert.equal(panel.editors[0].editorPath, '/design/grant-9/')
  assert.equal(panel.active, 'http://127.0.0.1:5555/design/grant-9/')
  assert.equal(panel.version, PLUGIN_VERSION)
})

test('panel:false leaves the host route unregistered', () => {
  const fixture = mineDesignFixture()
  setEnv({ MINEDESIGN_HOME: fixture.dataDir, MINEDESIGN_CLI: undefined, PATH: '/nonexistent' })
  const { ctx, state } = createHarness()
  apply(ctx, { ...fixtureConfig(fixture), panel: false })

  assert.equal(state.route, null)
  assert.ok(state.tool !== null, 'the status tool stays available')
})
