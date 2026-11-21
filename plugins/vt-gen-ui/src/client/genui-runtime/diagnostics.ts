/** GenUI runtime diagnostics for aliases and unknown fields. */
import { COMPONENT_SCHEMAS, GENUI_SPEC_SCHEMA } from './schema.ts'
import { isComponentRoot } from '../spec.ts'
import type { ComponentRecordSchema, ComponentSchema } from './schema.ts'
import { isTableDetailReachable } from '../table-details.ts'
import { isReachableModal } from './modal-contract.ts'

/** 原型通道诊断的稳定标识：判定读 code，不读 message 文案。 */
export type GenuiDiagnosticCode =
  | 'unknown-goto-target'
  | 'modal-unreachable'
  | 'nested-modal'
  | 'screen-budget'
  | 'unknown-initial'

export interface GenuiDiagnostic {
  readonly kind: 'alias' | 'unknown-field' | 'truncated' | 'dropped' | 'invalid'
  readonly path: string
  readonly message: string
  /** 语义标识。新诊断必须带 code；旧诊断按需补齐。 */
  readonly code?: GenuiDiagnosticCode
  readonly type?: string
  readonly field?: string
  readonly canonical?: string
}


function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function isNode(value: unknown): value is Record<string, unknown> {
  const candidate = record(value)
  return candidate !== undefined && typeof candidate.type === 'string'
}

function visitNativeNodes(
  value: unknown,
  path: string,
  visit: (node: Record<string, unknown>, path: string, schema: ComponentSchema, inModal: boolean) => void,
  inModal = false,
): void {
  if (!isNode(value)) return
  const type = value.type as string
  const definition = COMPONENT_SCHEMAS[type]
  if (definition === undefined) return
  visit(value, path, definition, inModal)
  // Modal children stay "inside a modal" for the nested-modal check.
  const children = (child: unknown, childPath: string): void =>
    visitNativeNodes(child, childPath, visit, inModal || type === 'modal')
  if ((type === 'row' || type === 'col' || type === 'grid' || type === 'card'
    || type === 'page' || type === 'field-group' || type === 'split') && Array.isArray(value.items)) {
    value.items.forEach((child, index) => children(child, `${path}.items[${index}]`))
    if (type === 'page' && Array.isArray(value.actions)) {
      value.actions.forEach((child, index) => children(child, `${path}.actions[${index}]`))
    }
  } else if (type === 'list-row' && Array.isArray(value.actions)) {
    value.actions.forEach((child, index) => children(child, `${path}.actions[${index}]`))
  } else if (type === 'empty' && Array.isArray(value.actions)) {
    value.actions.forEach((child, index) => children(child, `${path}.actions[${index}]`))
  } else if (type === 'modal') {
    if (Array.isArray(value.items)) {
      value.items.forEach((child, index) => children(child, `${path}.items[${index}]`))
    }
    if (Array.isArray(value.actions)) {
      value.actions.forEach((child, index) => children(child, `${path}.actions[${index}]`))
    }
  } else if (type === 'list' && Array.isArray(value.items)) {
    value.items.forEach((child, index) => children(child, `${path}.items[${index}]`))
  } else if (type === 'tabs' && Array.isArray(value.tabs)) {
    value.tabs.forEach((tab, index) => {
      const holder = record(tab)
      if (holder === undefined) return
      if (Array.isArray(holder.items)) holder.items.forEach((child, childIndex) => children(child, `${path}.tabs[${index}].items[${childIndex}]`))
      else children(holder.items, `${path}.tabs[${index}].items`)
    })
  } else if (type === 'accordion' && Array.isArray(value.items)) {
    value.items.forEach((item, index) => {
      const holder = record(item)
      if (holder?.items !== undefined && Array.isArray(holder.items)) holder.items.forEach((child, childIndex) => children(child, `${path}.items[${index}].items[${childIndex}]`))
    })
  } else if (type === 'table' && Array.isArray(value.details)) {
    const table = { columns: value.columns, rows: value.rows, types: value.types }
    value.details.forEach((detail, rowIndex) => {
      if (Array.isArray(detail) && isTableDetailReachable(table, rowIndex)) {
        detail.forEach((child, childIndex) => children(child, `${path}.details[${rowIndex}][${childIndex}]`))
      }
    })
  }
}

function pushUnknownField(
  warnings: GenuiDiagnostic[],
  path: string,
  field: string,
  type: string,
): void {
  warnings.push({
    kind: 'unknown-field',
    path: `${path}.${field}`,
    message: `${path}.${field}: unknown field for '${type}'`,
    type,
    field,
  })
}

function diagnoseRecordFields(
  value: unknown,
  path: string,
  definition: ComponentRecordSchema,
  type: string,
  warnings: GenuiDiagnostic[],
): void {
  const holder = record(value)
  if (holder === undefined) return
  for (const field of Object.keys(holder)) {
    if (field in definition.fields) continue
    pushUnknownField(warnings, path, field, type)
  }
  for (const [field, nested] of Object.entries(definition.nested)) {
    const nestedValue = holder[field]
    if (Array.isArray(nestedValue)) {
      nestedValue.forEach((item, index) => diagnoseRecordFields(item, `${path}.${field}[${index}]`, nested, type, warnings))
    } else if (nestedValue !== undefined) {
      diagnoseRecordFields(nestedValue, `${path}.${field}`, nested, type, warnings)
    }
  }
}

function diagnoseNestedFields(
  node: Record<string, unknown>,
  path: string,
  definition: ComponentSchema,
  warnings: GenuiDiagnostic[],
): void {
  for (const [field, nested] of Object.entries(definition.nested)) {
    const nestedValue = node[field]
    if (Array.isArray(nestedValue)) {
      nestedValue.forEach((item, index) => diagnoseRecordFields(item, `${path}.${field}[${index}]`, nested, node.type as string, warnings))
    } else if (nestedValue !== undefined) {
      diagnoseRecordFields(nestedValue, `${path}.${field}`, nested, node.type as string, warnings)
    }
  }
}

/**
 * Diagnose unknown direct fields on native nodes.
 *
 * Unknown types are intentionally skipped so custom renderers retain their
 * opaque extension payloads. Native unknown fields are warnings, not errors.
 *
 * @param value - Canonical or raw GenUI value.
 * @returns Stable field diagnostics in tree order.
 */
export function diagnoseUnknownGenuiFields(value: unknown): GenuiDiagnostic[] {
  const warnings: GenuiDiagnostic[] = []
  const root = record(value)
  if (root === undefined) return warnings
  const visit = (node: Record<string, unknown>, path: string, definition: ComponentSchema): void => {
    for (const field of Object.keys(node)) {
      if (field === 'type' || field in definition.fields) continue
      pushUnknownField(warnings, path, field, node.type as string)
    }
    diagnoseNestedFields(node, path, definition, warnings)
    if (node.type === 'list' && Array.isArray(node.items)) {
      node.items.forEach((item, index) => {
        if (isNode(item)) return
        const holder = record(item)
        if (holder === undefined) return
        for (const field of Object.keys(holder)) {
          if (field === 'title' || field === 'desc') continue
          const itemPath = `${path}.items[${index}]`
          warnings.push({ kind: 'unknown-field', path: `${itemPath}.${field}`, message: `${itemPath}.${field}: list items render 'title' and 'desc' only — '${field}' is dropped`, type: 'list', field })
        }
      })
    }
  }
  if (Array.isArray(root.items) && !isComponentRoot(root)) {
    for (const field of Object.keys(root)) {
      if (field in GENUI_SPEC_SCHEMA.fields) continue
      pushUnknownField(warnings, 'spec', field, 'spec')
    }
    root.items.forEach((item, index) => visitNativeNodes(item, `items[${index}]`, visit))
  } else if (typeof root.type === 'string') {
    // A bare component root is a documented shorthand, so its `type` belongs
    // to the native node schema rather than the root specification schema —
    // including data components whose `items` is their record list (#172).
    visitNativeNodes(root, 'spec', visit)
  } else {
    for (const field of Object.keys(root)) {
      if (field in GENUI_SPEC_SCHEMA.fields) continue
      pushUnknownField(warnings, 'spec', field, 'spec')
    }
  }
  // Every screen is reachable content: diagnose its nodes too, whether the
  // spec is screens-only or carries a legacy `items` tree as well.
  const screens = record(root.screens)
  if (screens !== undefined && !isComponentRoot(root)) {
    for (const [screenId, nodes] of Object.entries(screens)) {
      if (!Array.isArray(nodes)) continue
      nodes.forEach((item, index) => visitNativeNodes(item, `screens.${screenId}[${index}]`, visit))
    }
  }
  return warnings
}

/** Visit every declared native node, in items then screens declaration order. */
function visitSpecNodes(
  value: unknown,
  visit: (node: Record<string, unknown>, path: string, schema: ComponentSchema, inModal: boolean) => void,
): void {
  const root = record(value)
  if (root === undefined) return
  if (isComponentRoot(root)) {
    visitNativeNodes(root, 'spec', visit)
    return
  }
  if (Array.isArray(root.items)) {
    root.items.forEach((item, index) => visitNativeNodes(item, `items[${index}]`, visit))
  }
  const screens = record(root.screens)
  if (screens === undefined) return
  for (const [screenId, nodes] of Object.entries(screens)) {
    if (!Array.isArray(nodes)) continue
    nodes.forEach((item, index) => visitNativeNodes(item, `screens.${screenId}[${index}]`, visit))
  }
}

/**
 * Report modals nested inside a modal. Repair drops them (a focus trap inside
 * a focus trap is unreachable), so without this diagnostic the model would
 * never learn that half its panel vanished.
 */
export function diagnoseNestedModals(value: unknown): GenuiDiagnostic[] {
  const warnings: GenuiDiagnostic[] = []
  visitSpecNodes(value, (node, path, _definition, inModal) => {
    if (node.type !== 'modal' || !inModal) return
    warnings.push({
      kind: 'dropped',
      code: 'nested-modal',
      path,
      message: `${path}: 弹层不能嵌套，内层 modal 已丢弃（只保留最外层）`,
      type: 'modal',
    })
  })
  return warnings
}

/**
 * Report modals that can never open: neither a `trigger` nor `open: true`.
 * Repair drops the dead node; this makes the drop visible instead of silent.
 */
export function diagnoseUnreachableModals(value: unknown): GenuiDiagnostic[] {
  const warnings: GenuiDiagnostic[] = []
  visitSpecNodes(value, (node, path) => {
    if (node.type !== 'modal' || isReachableModal(node)) return
    warnings.push({
      kind: 'dropped',
      code: 'modal-unreachable',
      path,
      message: `${path}: modal needs a non-empty 'trigger' or 'open': true`,
      type: 'modal',
      field: 'trigger',
    })
  })
  return warnings
}

/** Declared screens of a spec-like value: ids whose value is a node array. */
function declaredScreens(value: unknown): { entries: string[], nodes: Readonly<Record<string, unknown>> } | null {
  const root = record(value)
  if (root === undefined || isComponentRoot(root)) return null
  const screens = record(root.screens)
  if (screens === undefined) return null
  const entries = Object.keys(screens).filter(id => Array.isArray(screens[id]))
  return entries.length === 0 ? null : { entries, nodes: screens }
}

/**
 * Screen contract diagnostics: `goto` pointing at an undeclared screen, more
 * screens than the cap, and an `initial` naming no declared screen.
 *
 * None of these block rendering: repair deletes the dead `goto`, drops trailing
 * screens, and falls back to the first screen respectively.
 */
export function diagnoseScreenContract(
  value: unknown,
  limits: { readonly maxScreens: number },
): GenuiDiagnostic[] {
  const declared = declaredScreens(value)
  if (declared === null) return []
  const warnings: GenuiDiagnostic[] = []
  const ids = new Set(declared.entries)
  visitSpecNodes(value, (node, path) => {
    const target = typeof node.goto === 'string' ? node.goto.trim() : ''
    if (target === '' || ids.has(target)) return
    warnings.push({
      kind: 'invalid',
      code: 'unknown-goto-target',
      path: `${path}.goto`,
      message: `${path}.goto: unknown screen '${target}' (declared: ${declared.entries.join(', ')})`,
      ...(typeof node.type === 'string' ? { type: node.type } : {}),
      field: 'goto',
      canonical: target,
    })
  })
  if (declared.entries.length > limits.maxScreens) {
    const kept = declared.entries.slice(0, limits.maxScreens)
    const firstDropped = declared.entries[limits.maxScreens]
    warnings.push({
      kind: 'truncated',
      code: 'screen-budget',
      path: 'screens',
      message: `screens: ${declared.entries.length} declared, ${kept.length} kept ('${firstDropped}' onward not rendered)`,
      field: 'screens',
    })
  }
  const root = record(value)
  const initial = root !== undefined && typeof root.initial === 'string' ? root.initial : undefined
  const first = declared.entries[0] ?? ''
  if (initial !== undefined && !ids.has(initial)) {
    warnings.push({
      kind: 'invalid',
      code: 'unknown-initial',
      path: 'initial',
      message: `initial: unknown screen '${initial}', fell back to '${first}'`,
      field: 'initial',
      canonical: first,
    })
  }
  return warnings
}
