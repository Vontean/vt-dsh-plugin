import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SKILL_NAME_MAP, listSkills, parseFrontmatter, readSkill } from '../src/skills.js'

/** Absolute path of the module under test, for the "no hard-coded home" check. */
const SKILLS_MODULE = fileURLToPath(new URL('../src/skills.js', import.meta.url))

/**
 * A SKILL.md body shaped like MineDesign's: single-line frontmatter scalars,
 * then the upstream text plus the Codex adaptation section.
 *
 * @param {string} name - upstream skill name.
 * @param {string} description - one-line description.
 * @returns {string} file text.
 */
function skillSource(name, description) {
  return [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    'version: 1.0.0',
    '---',
    '',
    `# ${name}`,
    '',
    `upstream body for ${name}`,
    '',
    '## MineDesign Codex 适配（优先于上方原始流程）',
    '',
    '- 上游的 Codex 说明。',
    '',
  ].join('\n')
}

/**
 * Build a `skills/` directory holding the two shipped skills plus a body file
 * that proves relative references still resolve beside SKILL.md.
 *
 * @returns {{ skillsDir: string }} the fixture root.
 */
function skillsFixture() {
  const skillsDir = mkdtempSync(join(tmpdir(), 'vt-minedesign-skills-'))
  for (const name of ['design', 'design-system']) {
    const directory = join(skillsDir, name)
    mkdirSync(join(directory, 'references'), { recursive: true })
    writeFileSync(join(directory, 'SKILL.md'), skillSource(name, `description for ${name}`))
    writeFileSync(join(directory, 'references', 'notes.md'), `notes for ${name}\n`)
  }
  return { skillsDir }
}

/**
 * Run a callback with `console.warn` captured.
 * @param {() => void} run - body to execute.
 * @returns {string[]} captured warning lines.
 */
function captureWarnings(run) {
  const original = console.warn
  /** @type {string[]} */
  const lines = []
  console.warn = (/** @type {unknown} */ message) => {
    lines.push(String(message))
  }
  try {
    run()
  } finally {
    console.warn = original
  }
  return lines
}

/**
 * Remove comments so a path inside a comment cannot mask a real literal.
 * @param {string} code - file text.
 * @returns {string} code with `//` and block comments removed.
 */
function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/(^|[^:\w])\/\/[^\n]*/gu, '$1')
}

/* ------------------------------------------------------------------ */
/* listSkills                                                          */
/* ------------------------------------------------------------------ */

test('listSkills exposes both shipped skills with the DSH prefix', () => {
  const { skillsDir } = skillsFixture()
  const candidates = listSkills({ skillsDir })

  assert.equal(candidates.length, 2)
  assert.deepEqual(candidates.map((candidate) => candidate.name), ['minedesign-design', 'minedesign-design-system'])

  for (const candidate of candidates) {
    const upstream = candidate.name === 'minedesign-design' ? 'design' : 'design-system'
    const directory = join(skillsDir, upstream)

    assert.equal(candidate.provider, 'dsh-vt-minedesign')
    assert.equal(candidate.source, 'custom')
    assert.equal(candidate.rank, 300)
    assert.deepEqual(candidate.invocation, { modelInvocable: true, userInvocable: true })
    assert.equal(candidate.description, `description for ${upstream}`)
    assert.equal(candidate.path, join(directory, 'SKILL.md'))
    assert.equal(candidate.locator, candidate.path)
    assert.deepEqual(candidate.resourceBase, { kind: 'directory', path: directory })
  }
})

test('listSkills is stable across calls', () => {
  const { skillsDir } = skillsFixture()
  assert.deepEqual(listSkills({ skillsDir }), listSkills({ skillsDir }))
})

test('listSkills falls back to the upstream name with an empty prefix', () => {
  const { skillsDir } = skillsFixture()
  assert.deepEqual(listSkills({ skillsDir }, { prefix: '' }).map((candidate) => candidate.name), [
    'design',
    'design-system',
  ])
})

test('listSkills applies a custom prefix literally', () => {
  const { skillsDir } = skillsFixture()
  assert.deepEqual(listSkills({ skillsDir }, { prefix: 'md-' }).map((candidate) => candidate.name), [
    'md-design',
    'md-design-system',
  ])
})

test('listSkills returns [] without a skills directory', () => {
  assert.deepEqual(listSkills({ skillsDir: null }), [])
  assert.deepEqual(listSkills({}), [])
  assert.deepEqual(listSkills(null), [])
  assert.deepEqual(listSkills({ skillsDir: join(tmpdir(), 'vt-minedesign-missing-skills-dir') }), [])
})

test('listSkills skips broken skills and keeps the healthy ones', () => {
  const { skillsDir } = skillsFixture()

  // A directory without SKILL.md is not a skill at all: silent.
  mkdirSync(join(skillsDir, 'no-file'))
  // A SKILL.md without frontmatter is broken: warn, then skip.
  mkdirSync(join(skillsDir, 'broken'), { recursive: true })
  writeFileSync(join(skillsDir, 'broken', 'SKILL.md'), '# no frontmatter\n')
  // A skill without a description cannot be routed: warn, then skip.
  mkdirSync(join(skillsDir, 'no-description'), { recursive: true })
  writeFileSync(join(skillsDir, 'no-description', 'SKILL.md'), '---\nname: no-description\n---\n\nbody\n')

  /** @type {import('../src/skills.js').SkillCandidate[]} */
  let candidates = []
  const warnings = captureWarnings(() => {
    candidates = listSkills({ skillsDir })
  })

  assert.deepEqual(candidates.map((candidate) => candidate.name), ['minedesign-design', 'minedesign-design-system'])
  assert.equal(warnings.length, 2)
  assert.match(warnings[0], /broken: no frontmatter/u)
  assert.match(warnings[1], /no-description: no description/u)
})

/* ------------------------------------------------------------------ */
/* readSkill                                                           */
/* ------------------------------------------------------------------ */

test('readSkill appends the DSH adaptation in memory', () => {
  const { skillsDir } = skillsFixture()
  const candidate = listSkills({ skillsDir })[0]
  const skill = readSkill(candidate)

  assert.ok(skill)
  assert.equal(skill.name, 'minedesign-design')
  assert.deepEqual(skill.resourceBase, candidate.resourceBase)
  // Upstream body survives, frontmatter does not leak into the body.
  assert.match(skill.content, /^# design\n/u)
  assert.doesNotMatch(skill.content, /^---/u)
  assert.match(skill.content, /upstream body for design/u)
  // The DSH section is the last heading in the body and sits after the Codex one.
  assert.match(skill.content, /\n## DSH 适配（优先于上方「Codex 适配」与原始流程）\n\n- /u)
  assert.ok(
    skill.content.indexOf('## DSH 适配') > skill.content.indexOf('## MineDesign Codex 适配'),
    'the DSH section must override, not precede, the Codex section',
  )
  assert.equal(skill.content.lastIndexOf('\n## '), skill.content.indexOf('\n## DSH 适配'))
  assert.ok(skill.content.endsWith('不要用 shell 重定向写作品文件。'))
  // The probed detail: events subscribe to the deck path, never the work dir.
  assert.match(skill.content, /__deck\/events/u)
  assert.match(skill.content, /不允许订阅的路径/u)
})

test('readSkill with adapt:false returns only the upstream body', () => {
  const { skillsDir } = skillsFixture()
  const skill = readSkill(listSkills({ skillsDir })[0], { adapt: false })

  assert.ok(skill)
  assert.match(skill.content, /^# design\n/u)
  assert.doesNotMatch(skill.content, /DSH 适配/u)
  assert.doesNotMatch(skill.content, /__deck\/events/u)
  assert.ok(skill.content.endsWith('上游的 Codex 说明。'))
})

test('readSkill returns undefined when the file is gone or unparsable', () => {
  const { skillsDir } = skillsFixture()
  const candidate = listSkills({ skillsDir })[0]
  assert.equal(readSkill({ ...candidate, path: join(skillsDir, 'design', 'missing.md') }), undefined)

  writeFileSync(join(skillsDir, 'design', 'SKILL.md'), '# no frontmatter\n')
  assert.equal(readSkill(candidate), undefined)
  assert.equal(readSkill(undefined), undefined)
})

test('readSkill never writes: upstream file and directory stay untouched', () => {
  const { skillsDir } = skillsFixture()
  const directory = join(skillsDir, 'design')
  const file = join(directory, 'SKILL.md')
  const before = readFileSync(file, 'utf8')
  const entriesBefore = readdirSync(directory).sort()

  readSkill(listSkills({ skillsDir })[0])
  readSkill(listSkills({ skillsDir })[0], { adapt: false })

  assert.equal(readFileSync(file, 'utf8'), before)
  assert.deepEqual(readdirSync(directory).sort(), entriesBefore)
})

/* ------------------------------------------------------------------ */
/* contracts that keep user paths out of the package                   */
/* ------------------------------------------------------------------ */

test('SKILL_NAME_MAP matches the shipped directory names', () => {
  assert.deepEqual({ ...SKILL_NAME_MAP }, {
    design: 'minedesign-design',
    'design-system': 'minedesign-design-system',
  })
})

test('parseFrontmatter keeps single-line scalars and strips the block', () => {
  assert.equal(parseFrontmatter('# no frontmatter\n'), null)
  const parsed = parseFrontmatter('---\nname: design\ndescription: "a design"\n---\n\n# body\n')
  assert.ok(parsed)
  assert.deepEqual(parsed.fields, { name: 'design', description: 'a design' })
  assert.equal(parsed.body, '# body\n')
})

test('src/skills.js hard-codes no user home path', () => {
  const code = stripComments(readFileSync(SKILLS_MODULE, 'utf8'))
  assert.doesNotMatch(code, /\/Users\//u)
  assert.doesNotMatch(code, /\/home\//u)
  assert.doesNotMatch(code, /~\//u)
})
