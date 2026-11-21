/**
 * Catalog derivations: the model-facing prompt sections, the full component
 * reference appended to the genui skill, and the prototype render type list.
 *
 * Everything here is derived from `definitions.ts` (fields/required/enums) and
 * `docs.ts` (grouping/summary/gotchas). `assertCatalogCoherence()` runs at
 * module load: a schema without a doc, a doc without a schema, or a type missing
 * from the prompt order throws instead of shipping a half-generated prompt.
 */
import { COMPONENT_SCHEMAS, GENUI_SPEC_SCHEMA, PROTOTYPE_TYPES } from './definitions.ts'
import type { PrototypeType } from './definitions.ts'
import type { ComponentSchema } from './model.ts'
import { CATALOG_CATEGORIES, CATALOG_DOCS, SCREEN_SPEC_DOC } from './docs.ts'
import { CATALOG_RULES } from './rules.ts'
import type { CatalogCategory, CatalogDoc } from './docs.ts'

export { PROTOTYPE_TYPES }
export type { PrototypeType }

function assertCatalogCoherence(): void {
  const ordered = CATALOG_CATEGORIES.flatMap(category => category.types)
  const seen = new Set<string>()
  for (const type of ordered) {
    if (seen.has(type)) throw new Error(`catalog: '${type}' appears twice in CATALOG_CATEGORIES`)
    seen.add(type)
    if (!Object.hasOwn(COMPONENT_SCHEMAS, type)) throw new Error(`catalog: '${type}' has no schema`)
    if (!Object.hasOwn(CATALOG_DOCS, type)) throw new Error(`catalog: '${type}' has no doc`)
  }
  for (const type of Object.keys(COMPONENT_SCHEMAS)) {
    if (!seen.has(type)) throw new Error(`catalog: schema '${type}' is missing from CATALOG_CATEGORIES`)
  }
  for (const type of Object.keys(COMPONENT_SCHEMAS)) {
    const schema = COMPONENT_SCHEMAS[type]
    if (schema === undefined || !Object.hasOwn(schema.fields, 'goto')) {
      throw new Error(`catalog: '${type}' lacks the cross-cutting 'goto' field`)
    }
  }
  if (!Object.hasOwn(GENUI_SPEC_SCHEMA.fields, 'screens') || !Object.hasOwn(GENUI_SPEC_SCHEMA.fields, 'initial')) {
    throw new Error("catalog: spec root lacks 'screens'/'initial'")
  }
  for (const type of Object.keys(CATALOG_DOCS)) {
    if (!Object.hasOwn(COMPONENT_SCHEMAS, type)) throw new Error(`catalog: doc '${type}' has no schema`)
    if (!seen.has(type)) throw new Error(`catalog: doc '${type}' is missing from CATALOG_CATEGORIES`)
  }
}

assertCatalogCoherence()

/** Every type in prompt order. */
export const CATALOG_TYPES: readonly string[] = CATALOG_CATEGORIES.flatMap(category => category.types)

function docOf(type: string): CatalogDoc {
  const doc = CATALOG_DOCS[type]
  if (doc === undefined) throw new Error(`catalog: missing doc for '${type}'`)
  return doc
}

function categoriesOf(type: string): CatalogCategory {
  const category = CATALOG_CATEGORIES.find(candidate => candidate.types.includes(type))
  if (category === undefined) throw new Error(`catalog: '${type}' has no category`)
  return category
}

/**
 * The system prompt's "Allowed type values" list: one line per category.
 * New catalog entries appear here automatically.
 */
export function componentListPrompt(): string {
  return CATALOG_CATEGORIES.map(category => {
    const names = category.types
      .map(type => `${type}${docOf(type).promptInline ?? ''}`)
      .join(' · ')
    return `- ${category.label}: ${names}${category.tail ?? ''}`
  }).join('\n')
}

/**
 * The system prompt's field quick reference: only components whose required
 * shape is easy to get wrong carry a `quickRef` in the catalog.
 */
export function fieldQuickRefPrompt(): string {
  const refs = CATALOG_TYPES
    .map(type => ({ type, ref: docOf(type).quickRef }))
    .filter((entry): entry is { type: string; ref: string } => entry.ref !== undefined)
    .map(entry => `\`${entry.type}\` \`${entry.ref}\``)
  return `**字段速查**（完整见 genui skill）：${refs.join(' · ')}`
}

/**
 * The system prompt's "wrong field name" paragraph. Every clause starts with
 * its component type, so the generated text stays scannable.
 */
export function fieldGotchaPrompt(): string {
  const clauses = CATALOG_TYPES.flatMap(type =>
    (docOf(type).gotcha ?? []).map(clause => `\`${type}\` ${clause}`),
  )
  return `**字段名写错 = 该组件被丢弃**（其余组件照常渲染）：${clauses.join('；')}。不确定就调 \`validate_dsh_ui\`。`
}

function fieldList(schema: ComponentSchema, names: readonly string[]): string {
  return names
    .map(name => {
      const values = schema.enums[name]
      const suffix = values === undefined ? '' : `(${values.join('|')})`
      return `\`${name}\`${suffix}`
    })
    .join('、')
}

/**
 * Full component reference appended to the genui skill at runtime. This
 * replaces the hand-written field table that used to live in SKILL.md: it is
 * generated from the same definitions the validator and renderer use.
 */
export function catalogReferenceMarkdown(): string {
  const sections = CATALOG_CATEGORIES.map(category => {
    const lines = category.types.map(type => {
      const doc = docOf(type)
      const schema = COMPONENT_SCHEMAS[type]
      if (schema === undefined) throw new Error(`catalog: missing schema for '${type}'`)
      const optional = Object.keys(schema.fields).filter(field =>
        field !== 'type' && field !== 'span' && !schema.required.includes(field),
      )
      const parts = [`- \`${type}\` — ${doc.summary}`]
      parts.push(schema.required.length === 0
        ? '无必填字段'
        : `必填 ${fieldList(schema, schema.required)}`)
      if (optional.length > 0) parts.push(`可选 ${fieldList(schema, optional)}`)
      if (doc.usage !== undefined) parts.push(`用法：${doc.usage}`)
      return `${parts[0]}。${parts.slice(1).join('；')}。`
    })
    return `### ${category.label}\n${lines.join('\n')}`
  })
  return [
    '## 组件字段参考（由 catalog 生成，勿手改）',
    '',
    '> 本节的类型、必填/可选字段与枚举值来自 `src/shared/catalog/definitions.ts`；',
    '> 修改组件定义后由构建/测试自动反映到这里，不要在本文件手写字段表。',
    '',
    SCREEN_SPEC_DOC.reference,
    '',
    sections.join('\n\n'),
  ].join('\n')
}

/** Which category a type belongs to (used by diagnostics/tests). */
export function catalogCategoryOf(type: PrototypeType): string {
  return categoriesOf(type).label
}

/**
 * Compose the genui skill body: the orchestration guide from SKILL.md plus the
 * generated field reference. SKILL.md intentionally carries no hand-written
 * field table, so this is the only place the reference is attached.
 */
export function composeSkillContent(skillBody: string): string {
  return `${skillBody.trimEnd()}\n\n${catalogReferenceMarkdown()}\n`
}

/** The system prompt paragraph advertising the optional multi-screen machine. */
export function prototypeScreensPrompt(): string {
  return SCREEN_SPEC_DOC.prompt
}

/**
 * The system prompt's complete `Rules:` block, rendered from `CATALOG_RULES`.
 *
 * Prompt behavior depends on this text, so the default rendering is
 * byte-identical to the block it replaced (golden file:
 * `__fixtures__/rules.golden.txt`): `Rules:` header, one `- ` bullet per rule,
 * no trailing newline. `renderUiTool: false` drops the tool-channel rule
 * exactly where the host used to strip it.
 */
export function rulesPrompt(options: { renderUiTool?: boolean } = {}): string {
  const renderUiTool = options.renderUiTool !== false
  const bullets = CATALOG_RULES
    .filter(rule => rule.requiresTool !== true || renderUiTool)
    .map(rule => `- ${rule.section}`)
  return ['Rules:', ...bullets].join('\n')
}
