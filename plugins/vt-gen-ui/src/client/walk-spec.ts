import type { GenuiNode, GenuiSpec } from './spec.ts'
import { GENUI_LIMITS } from './genui-runtime/index.ts'
import { isTableDetailReachable, tableRowsForDetails } from './table-details.ts'

/** 遍历完整 GenUI 组件树，并提供每个组件在 spec 中的路径。 */
export function walkGenuiNodes(spec: GenuiSpec, visitor: (node: GenuiNode, path: string) => void): void {
  const walk = (nodes: GenuiNode[], path: string, depth: number): void => {
    if (depth > GENUI_LIMITS.maxDepth) return
    nodes.forEach((node, index) => visit(node, `${path}[${index}]`, depth))
  }
  const visit = (node: GenuiNode, at: string, depth: number): void => {
    if (depth > GENUI_LIMITS.maxDepth) return
    visitor(node, at)
    if (depth >= GENUI_LIMITS.maxDepth) return
    switch (node.type) {
      case 'row':
      case 'col':
      case 'grid':
      case 'card':
      case 'field-group':
        walk(node.items, `${at}.items`, depth + 1)
        break
      case 'page':
        walk(node.items, `${at}.items`, depth + 1)
        if (node.actions !== undefined) walk(node.actions, `${at}.actions`, depth + 1)
        break
      case 'list-row':
      case 'empty':
        if (node.actions !== undefined) walk(node.actions, `${at}.actions`, depth + 1)
        break
      case 'split':
        walk(node.items, `${at}.items`, depth + 1)
        break
      case 'modal':
        if (node.items !== undefined) walk(node.items, `${at}.items`, depth + 1)
        if (node.actions !== undefined) walk(node.actions, `${at}.actions`, depth + 1)
        break
      case 'tabs':
        node.tabs.forEach((tab, tabIndex) => walk(tab.items, `${at}.tabs[${tabIndex}].items`, depth + 1))
        break
      case 'accordion':
        node.items.forEach((item, itemIndex) => walk(item.items, `${at}.items[${itemIndex}].items`, depth + 1))
        break
      case 'list':
        node.items.forEach((item, itemIndex) => {
          if (item !== null && typeof item === 'object' && 'type' in item) visit(item, `${at}.items[${itemIndex}]`, depth + 1)
        })
        break
      case 'table':
        node.details?.slice(0, tableRowsForDetails(node).length).forEach((detail, rowIndex) => {
          if (detail !== null && isTableDetailReachable(node, rowIndex)) {
            walk(detail, `${at}.details[${rowIndex}]`, depth + 1)
          }
        })
        break
    }
  }
  // Legacy specs walk `items`; screen-based specs walk every screen so
  // submission keys and diagnostics stay global across screens.
  if (Array.isArray(spec.items)) walk(spec.items, 'items', 0)
  if (spec.screens !== undefined) {
    for (const [screenId, nodes] of Object.entries(spec.screens)) {
      if (Array.isArray(nodes)) walk(nodes, `screens.${screenId}`, 0)
    }
  }
}
