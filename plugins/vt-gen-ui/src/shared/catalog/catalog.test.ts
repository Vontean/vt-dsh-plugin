/**
 * Catalog seam: the prompt, the validation schema, and the render registry must
 * describe the same set of components. These tests are the regression net for
 * "SKILL.md says one thing, validator does another".
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { COMPONENT_SCHEMAS, GENUI_NATIVE_TYPES, GENUI_SPEC_SCHEMA } from '../../client/genui-runtime/schema.ts'
import {
  CATALOG_DOCS, CATALOG_TYPES, PROTOTYPE_TYPES, catalogReferenceMarkdown,
  componentListPrompt, composeSkillContent, fieldGotchaPrompt, fieldQuickRefPrompt, prototypeScreensPrompt,
} from './index.ts'

const here = import.meta.dirname
/** Baseline captured from the 50-type schema before the catalog refactor. */
interface BaselineDefinition {
  readonly required: readonly string[]
  readonly fields: Record<string, string>
}

const baseline = JSON.parse(readFileSync(
  resolve(here, '../../client/genui-runtime/__fixtures__/component-schemas.json'),
  'utf8',
)) as Record<string, BaselineDefinition>

describe('catalog coherence', () => {
  test('every schema type is in the prompt order exactly once', () => {
    expect(new Set(CATALOG_TYPES).size).toBe(CATALOG_TYPES.length)
    expect(new Set(CATALOG_TYPES)).toEqual(new Set(Object.keys(COMPONENT_SCHEMAS)))
    expect(new Set(CATALOG_TYPES)).toEqual(new Set(Object.keys(CATALOG_DOCS)))
  })

  test('every prototype type is schema-backed and prompt-visible', () => {
    expect([...PROTOTYPE_TYPES]).toHaveLength(7)
    for (const type of PROTOTYPE_TYPES) {
      expect(GENUI_NATIVE_TYPES.has(type)).toBe(true)
      expect(CATALOG_TYPES).toContain(type)
      expect(componentListPrompt()).toContain(type)
    }
  })

  test('pre-existing definitions keep their type names, required fields and field types', () => {
    expect(Object.keys(baseline)).toHaveLength(50)
    for (const [type, base] of Object.entries(baseline)) {
      const now = COMPONENT_SCHEMAS[type]
      expect(now, type).toBeDefined()
      // Required fields: names and order are the protocol the model writes.
      expect(now!.required, `${type}.required`).toEqual(base.required)
      // Every field that already existed keeps its kind; a changed kind is breaking.
      for (const [field, kind] of Object.entries(base.fields)) {
        expect(now!.fields[field], `${type}.${field}`).toBe(kind)
      }
      // New fields are additive ONLY as optional fields.
      for (const field of Object.keys(now!.fields)) {
        if (Object.hasOwn(base.fields, field)) continue
        expect(now!.required, `${type}.${field} must be optional`).not.toContain(field)
      }
    }
  })

  test('additive optional fields are exactly the documented ledger', () => {
    const added = new Set<string>()
    for (const [type, base] of Object.entries(baseline)) {
      for (const field of Object.keys(COMPONENT_SCHEMAS[type]!.fields)) {
        if (!Object.hasOwn(base.fields, field)) added.add(field)
      }
    }
    // Additive changes update this ledger deliberately, keeping them reviewable.
    expect([...added].sort()).toEqual(['goto'])
  })
})

describe('generated prompt', () => {
  test('component list names every catalog type', () => {
    const list = componentListPrompt()
    for (const type of CATALOG_TYPES) expect(list).toContain(type)
    expect(list.split('\n')).toHaveLength(5)
  })

  test('field quick reference mentions every required field it promises', () => {
    const quickRef = fieldQuickRefPrompt()
    const quickTypes = Object.entries(CATALOG_DOCS).filter(([, doc]) => doc.quickRef !== undefined)
    expect(quickTypes.length).toBeGreaterThan(0)
    for (const [type] of quickTypes) {
      const definition = COMPONENT_SCHEMAS[type]
      expect(definition, type).toBeDefined()
      for (const field of definition!.required) {
        expect(quickRef, `${type}.${field}`).toContain(field)
      }
    }
  })

  test('the gotcha paragraph names its types with backticks', () => {
    const gotchas = fieldGotchaPrompt()
    const gotchaTypes = Object.entries(CATALOG_DOCS).filter(([, doc]) => doc.gotcha !== undefined)
    expect(gotchaTypes.length).toBeGreaterThan(0)
    for (const [type] of gotchaTypes) expect(gotchas, type).toContain(`\`${type}\``)
  })

  test('the prompt advertises the screen machine and the goto hint', () => {
    expect(prototypeScreensPrompt()).toContain('screens')
    expect(prototypeScreensPrompt()).toContain('initial')
    expect(prototypeScreensPrompt()).toContain('goto')
    expect(catalogReferenceMarkdown()).toContain('多屏原型')
  })

  test('every component accepts the cross-cutting goto field', () => {
    for (const type of CATALOG_TYPES) {
      expect(COMPONENT_SCHEMAS[type]!.fields.goto, type).toBe('string')
    }
  })

  test('reference markdown covers every type with its required fields', () => {
    const reference = catalogReferenceMarkdown()
    expect(reference).toContain('由 catalog 生成')
    for (const type of CATALOG_TYPES) {
      expect(reference).toContain(`\`${type}\``)
      for (const field of COMPONENT_SCHEMAS[type]!.required) {
        expect(reference, `${type}.${field}`).toContain(`\`${field}\``)
      }
    }
  })

  test('skill body gets the generated reference appended', () => {
    const composed = composeSkillContent('## 编排指南\n\n范例……')
    expect(composed.startsWith('## 编排指南')).toBe(true)
    expect(composed).toContain('## 组件字段参考（由 catalog 生成，勿手改）')
    expect(composed).toContain('`field-group`')
  })

  test('root schema accepts screens/initial and still requires items or screens', () => {
    expect(GENUI_SPEC_SCHEMA.fields.screens).toBe('object')
    expect(GENUI_SPEC_SCHEMA.fields.initial).toBe('string')
    expect(GENUI_SPEC_SCHEMA.oneOfRequired).toEqual([['items', 'screens']])
  })
})
