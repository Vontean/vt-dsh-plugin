import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readSkillCandidates, resolveSkillSource } from '../index.js'

/**
 * Write one fake Codex plugin build.
 * @param {string} codexHome - fake CODEX_HOME.
 * @param {{ marketplace: string, build: string, version: string, skills: Record<string, string> }} spec - build description.
 * @returns {string} the build directory.
 */
function writeBuild(codexHome, spec) {
  const buildDir = join(codexHome, 'plugins', 'cache', spec.marketplace, 'figma', spec.build)
  mkdirSync(join(buildDir, '.codex-plugin'), { recursive: true })
  writeFileSync(join(buildDir, '.codex-plugin', 'plugin.json'), JSON.stringify({ name: 'figma', version: spec.version }))
  for (const [skillName, description] of Object.entries(spec.skills)) {
    const directory = join(buildDir, 'skills', skillName)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'SKILL.md'), ['---', `name: ${skillName}`, `description: "${description}"`, '---', '', `# ${skillName}`, 'body'].join('\n'))
  }
  mkdirSync(join(buildDir, 'skills'), { recursive: true })
  return buildDir
}

/** @returns {string} a fresh temporary directory. */
function tempHome() {
  return mkdtempSync(join(tmpdir(), 'vt-use-figma-'))
}

/**
 * Config shaped like `normalizeConfig()` output.
 * @param {{ codexHome: string, skillsDir?: string | null }} overrides - resolved fields.
 */
function config(overrides) {
  return { routing: true, skills: true, codexHome: overrides.codexHome, skillsDir: overrides.skillsDir ?? null }
}

test('resolveSkillSource picks the highest manifest version across marketplaces', () => {
  const home = tempHome()
  writeBuild(home, { marketplace: 'openai-curated', build: '1e285826', version: '2.0.20', skills: { 'figma-use': 'old' } })
  writeBuild(home, { marketplace: 'openai-curated-remote', build: '17.0.0', version: '17.0.0', skills: { 'figma-use': 'new' } })

  const source = resolveSkillSource(config({ codexHome: home }))
  assert.ok(source !== null)
  assert.equal(source.version, '17.0.0')
  assert.equal(source.origin, 'openai-curated-remote@17.0.0')
  assert.ok(source.skillsDir.endsWith(join('openai-curated-remote', 'figma', '17.0.0', 'skills')))
})

test('resolveSkillSource trusts the manifest version, not the directory name', () => {
  const home = tempHome()
  writeBuild(home, { marketplace: 'openai-curated', build: '1e285826', version: '2.0.20', skills: { 'figma-use': 'x' } })

  const source = resolveSkillSource(config({ codexHome: home }))
  assert.equal(source?.version, '2.0.20')
  assert.ok(source?.skillsDir.includes('1e285826'))
})

test('resolveSkillSource returns null when nothing is installed', () => {
  assert.equal(resolveSkillSource(config({ codexHome: tempHome() })), null)
})

test('an explicit skillsDir wins over the Codex cache', () => {
  const home = tempHome()
  writeBuild(home, { marketplace: 'openai-curated-remote', build: '17.0.0', version: '17.0.0', skills: { 'figma-use': 'cache' } })
  const explicit = tempHome()

  const source = resolveSkillSource(config({ codexHome: home, skillsDir: explicit }))
  assert.equal(source?.origin, 'config')
  assert.equal(source?.skillsDir, explicit)
  assert.equal(resolveSkillSource(config({ codexHome: home, skillsDir: join(explicit, 'missing') })), null)
})

test('readSkillCandidates reads Figma skills only and keeps resourceBase', () => {
  const home = tempHome()
  const build = writeBuild(home, {
    marketplace: 'openai-curated-remote',
    build: '17.0.0',
    version: '17.0.0',
    skills: { 'figma-use': 'use it', 'figma-design-to-code': 'code it' },
  })
  // A non-Figma skill in the same root must be ignored.
  mkdirSync(join(build, 'skills', 'other-skill'), { recursive: true })
  writeFileSync(join(build, 'skills', 'other-skill', 'SKILL.md'), '---\nname: other-skill\ndescription: no\n---\nbody')

  const source = resolveSkillSource(config({ codexHome: home }))
  const candidates = readSkillCandidates(source)
  assert.deepEqual(candidates.map((candidate) => candidate.name), ['figma-design-to-code', 'figma-use'])
  assert.equal(candidates[0].rank, 300)
  assert.equal(candidates[0].source, 'custom')
  assert.equal(candidates[0].provider, 'dsh-vt-use-figma')
  assert.deepEqual(candidates[0].invocation, { modelInvocable: true, userInvocable: true })
  assert.equal(candidates[0].resourceBase.kind, 'directory')
  assert.ok(candidates[0].path.endsWith('SKILL.md'))
})

test('readSkillCandidates skips broken skills instead of failing the catalog', () => {
  const home = tempHome()
  const build = writeBuild(home, { marketplace: 'openai-curated-remote', build: '17.0.0', version: '17.0.0', skills: { 'figma-use': 'ok' } })
  mkdirSync(join(build, 'skills', 'figma-broken'), { recursive: true })
  writeFileSync(join(build, 'skills', 'figma-broken', 'SKILL.md'), '# no frontmatter here\n')

  const candidates = readSkillCandidates(resolveSkillSource(config({ codexHome: home })))
  assert.deepEqual(candidates.map((candidate) => candidate.name), ['figma-use'])
})

test('readSkillCandidates returns an empty array for a missing source', () => {
  assert.deepEqual(readSkillCandidates({ skillsDir: join(tempHome(), 'nope'), version: null, origin: 'config' }), [])
})
