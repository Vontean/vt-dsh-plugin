/**
 * Rule set (H8): the system prompt's Rules block is rendered from
 * `CATALOG_RULES`, so a rule is edited once and both renderings follow.
 *
 * The golden freezes the *rendered* block, not the source text: it is the
 * prompt behavior reviewers approved, and it is the only thing that must not
 * drift silently.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { CATALOG_RULES, rulesPrompt } from './index.ts'

const golden = readFileSync(
  resolve(import.meta.dirname, '__fixtures__/rules.golden.txt'),
  'utf8',
).replace(/\n$/u, '')

const toolLine = CATALOG_RULES.find(rule => rule.requiresTool === true)?.section

describe('rules render byte-stable', () => {
  test('the default block matches the approved golden', () => {
    // rulesPrompt renders the whole block, header included.
    expect(rulesPrompt()).toBe(golden)
  })

  test('renderUiTool:false drops exactly the tool-channel rule', () => {
    expect(toolLine).toBeDefined()
    expect(rulesPrompt({ renderUiTool: false })).toBe(golden.replace(`\n- ${toolLine}`, ''))
  })

  test('header, one bullet per rule, no trailing newline', () => {
    const lines = rulesPrompt().split('\n')
    expect(lines[0]).toBe('Rules:')
    expect(lines.slice(1)).toHaveLength(CATALOG_RULES.length)
    for (const line of lines.slice(1)) expect(line.startsWith('- ')).toBe(true)
    expect(rulesPrompt().endsWith('\n')).toBe(false)
  })

  test('rule ids are unique and keep prompt order', () => {
    const ids = CATALOG_RULES.map(rule => rule.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual([
      'language', 'json-strict', 'block-markdown', 'scale', 'local-first-actions',
      'durable-state', 'quiz-mode', 'secrets-ban', 'tool-channel', 'fence-placement', 'panel',
    ])
  })
})
