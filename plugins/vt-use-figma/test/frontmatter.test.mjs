import test from 'node:test'
import assert from 'node:assert/strict'
import { compareVersions, parseFrontmatter } from '../index.js'

test('parseFrontmatter reads a single-line quoted description', () => {
  const raw = ['---', 'name: figma-use', 'description: "**MANDATORY prerequisite** — load before use_figma."', '---', '', '# body', 'line'].join('\n')
  const parsed = parseFrontmatter(raw)
  assert.ok(parsed !== null)
  assert.equal(parsed.fields.name, 'figma-use')
  assert.equal(parsed.fields.description, '**MANDATORY prerequisite** — load before use_figma.')
  assert.equal(parsed.body, '# body\nline')
})

test('parseFrontmatter keeps colons, backticks and long text in the description', () => {
  const description = `Use when: the user mentions Code Connect, \`use_figma\` or ${'x'.repeat(900)}`
  const raw = ['---', 'name: figma-code-connect', `description: "${description}"`, '---', 'body'].join('\n')
  const parsed = parseFrontmatter(raw)
  assert.ok(parsed !== null)
  assert.equal(parsed.fields.description, description)
  assert.equal(parsed.body, 'body')
})

test('parseFrontmatter accepts unquoted and single-quoted scalars', () => {
  const plain = parseFrontmatter(['---', 'name: figma-spec', 'description: Read a spec first.', '---', 'x'].join('\n'))
  assert.equal(plain?.fields.description, 'Read a spec first.')
  const single = parseFrontmatter(["---", "description: 'quoted value'", '---', 'x'].join('\n'))
  assert.equal(single?.fields.description, 'quoted value')
})

test('parseFrontmatter returns null without a frontmatter fence', () => {
  assert.equal(parseFrontmatter('# just a heading\n'), null)
  assert.equal(parseFrontmatter('---\nname: unterminated\n'), null)
})

test('parseFrontmatter ignores continuation lines instead of folding them', () => {
  const raw = ['---', 'name: figma-x', 'description: first line', '  second line', '---', 'body'].join('\n')
  assert.equal(parseFrontmatter(raw)?.fields.description, 'first line')
})

test('compareVersions orders numeric segments, not strings', () => {
  assert.ok(compareVersions('17.0.0', '2.0.20') > 0)
  assert.ok(compareVersions('2.0.20', '17.0.0') < 0)
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0)
  assert.ok(compareVersions('1.10.0', '1.9.9') > 0)
  assert.equal(compareVersions('1.2', '1.2.0'), 0)
})
