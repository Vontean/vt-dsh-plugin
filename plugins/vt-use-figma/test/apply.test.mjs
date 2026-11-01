import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../index.js'

/**
 * Build a skills-only directory that stands in for an installed Figma plugin.
 * @param {Record<string, string>} skills - skill name to description.
 * @returns {string} the directory holding the skill folders.
 */
function skillsFixture(skills) {
  const root = mkdtempSync(join(tmpdir(), 'vt-use-figma-skills-'))
  for (const [skillName, description] of Object.entries(skills)) {
    const directory = join(root, skillName)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'SKILL.md'), ['---', `name: ${skillName}`, `description: "${description}"`, '---', '', `# ${skillName}`, `body of ${skillName}`].join('\n'))
  }
  return root
}

/** @returns {string} a temporary directory with no skills in it. */
function emptyHome() {
  return mkdtempSync(join(tmpdir(), 'vt-use-figma-empty-'))
}

/**
 * Minimal Cordis context stand-in: records what the plugin registers.
 * @param {{ figmaTools?: string[] }} [options] - visible MCP tool names.
 */
function createHarness(options = {}) {
  const state = {
    section: /** @type {any} */ (null),
    provider: /** @type {any} */ (null),
    tool: /** @type {any} */ (null),
    invalidations: 0,
    schemaCalls: 0,
  }
  const visibleTools = options.figmaTools ?? []

  const ctx = {
    systemPrompt: {
      getSectionOrder: (name) => (name === 'MCP_SERVERS' ? 3100 : -1),
      section: (section) => {
        state.section = section
        return () => {}
      },
    },
    inject: (_services, callback) => {
      callback(ctx)
    },
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
      schemas: () => {
        state.schemaCalls += 1
        return [...visibleTools.map((name) => ({ name })), { name: 'figma_status' }]
      },
    },
  }

  return { ctx, state }
}

test('apply registers the routing section at the host MCP_SERVERS placement', () => {
  const { ctx, state } = createHarness()
  apply(ctx, { skillsDir: skillsFixture({ 'figma-use': 'load me' }) })

  assert.equal(state.section.name, 'figma:routing')
  assert.equal(state.section.order, 3100)
  assert.equal(state.section.interpolate, false)

  const text = state.section.text()
  assert.match(text, /figma-design-to-code/u)
  assert.match(text, /use_figma/u)
  assert.match(text, /技能已就绪：1 个 figma-\* 技能/u)
})

test('the section degrades to install instructions when no skills exist', () => {
  const { ctx, state } = createHarness()
  apply(ctx, { codexHome: emptyHome() })

  const text = state.section.text()
  assert.match(text, /没找到 Figma 技能目录/u)
  assert.doesNotMatch(text, /技能已就绪/u)
})

test('the provider lists candidates and returns bodies without frontmatter', async () => {
  const { ctx, state } = createHarness()
  apply(ctx, { skillsDir: skillsFixture({ 'figma-use': 'load me', 'figma-spec': 'read specs' }) })

  const candidates = await state.provider.list({})
  assert.deepEqual(candidates.map((candidate) => candidate.name), ['figma-spec', 'figma-use'])
  assert.equal(state.provider.name, 'dsh-vt-use-figma')

  const definition = await state.provider.get(candidates[1], {})
  assert.equal(definition.name, 'figma-use')
  assert.equal(definition.content.trim(), '# figma-use\nbody of figma-use')
  assert.equal(definition.resourceBase.kind, 'directory')
})

test('the provider returns undefined for a skill file that vanished', async () => {
  const { ctx, state } = createHarness()
  apply(ctx, { skillsDir: skillsFixture({ 'figma-use': 'load me' }) })

  const [candidate] = await state.provider.list({})
  const missing = { ...candidate, path: join(emptyHome(), 'gone', 'SKILL.md') }
  assert.equal(await state.provider.get(missing, {}), undefined)
})

test('figma_status reports a missing connection and missing skills', async () => {
  const { ctx, state } = createHarness()
  apply(ctx, { codexHome: emptyHome() })

  const status = await state.tool.execute({})
  assert.equal(state.tool.name, 'figma_status')
  assert.equal(status.mcpConnected, false)
  assert.deepEqual(status.figmaTools, [])
  assert.equal(status.skills.available, false)
  assert.equal(status.hints.length, 2)
  assert.match(status.hints[0], /MCP Connections/u)
})

test('figma_status detects the remote tools and counts skills', async () => {
  const { ctx, state } = createHarness({ figmaTools: ['mcp__figma__use_figma', 'mcp__figma__get_design_context'] })
  apply(ctx, { skillsDir: skillsFixture({ 'figma-use': 'load me', 'figma-spec': 'read specs' }) })

  const status = await state.tool.execute({})
  assert.equal(status.mcpConnected, true)
  assert.deepEqual(status.figmaTools, ['mcp__figma__get_design_context', 'mcp__figma__use_figma'])
  assert.equal(status.skills.count, 2)
  assert.equal(status.skills.origin, 'config')
  assert.equal(status.hints.length, 0)
})

test('refresh re-scans the directory and invalidates the catalog', async () => {
  const { ctx, state } = createHarness()
  const directory = skillsFixture({ 'figma-use': 'load me' })
  apply(ctx, { skillsDir: directory })

  assert.equal((await state.tool.execute({})).skills.count, 1)

  // A skill appearing later is invisible until refresh asks for it.
  mkdirSync(join(directory, 'figma-spec'), { recursive: true })
  writeFileSync(join(directory, 'figma-spec', 'SKILL.md'), '---\nname: figma-spec\ndescription: "read specs"\n---\nbody')

  assert.equal((await state.tool.execute({})).skills.count, 1)
  assert.equal((await state.tool.execute({ refresh: true })).skills.count, 2)
  assert.ok(state.invalidations > 0)
})

test('routing and skills switches turn each registration off', () => {
  const off = createHarness()
  apply(off.ctx, { routing: false, skills: false, skillsDir: skillsFixture({ 'figma-use': 'load me' }) })
  assert.equal(off.state.section, null)
  assert.equal(off.state.provider, null)
  assert.ok(off.state.tool !== null, 'the status tool stays available')

  const sectionOnly = createHarness()
  apply(sectionOnly.ctx, { skills: false, skillsDir: skillsFixture({ 'figma-use': 'load me' }) })
  assert.ok(sectionOnly.state.section !== null)
  assert.equal(sectionOnly.state.provider, null)
})
