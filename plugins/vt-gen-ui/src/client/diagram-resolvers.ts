/**
 * Resolvers Pele calls while laying out a diagram: inline math and custom
 * icons. Both live in the CLIENT bundle and are handed to the lazy engine as
 * arguments, so the 0.7 MB `lib/assets/pele.js` does not have to carry a second
 * copy of KaTeX or of the icon catalogue.
 * @module dsh-vt-gen-ui/client/diagram-resolvers
 */
import katex from 'katex'
import { ICONS } from './icons/icon-data.ts'
import type { BundledIcon, IconShape } from './icons/icon-data.ts'

/** The hand-off shape lives in diagram-types so the asset can import the type
 * without pulling this module (and KaTeX) into its bundle. */
import type { DiagramResolvers } from './diagram-types.ts'

const KATEX_OPTIONS = {
  // Same settings as inline math in the prose (inline.ts), so a formula inside
  // a diagram and the same formula in a paragraph typeset identically.
  throwOnError: false,
  trust: false,
  maxExpand: 1000,
  maxSize: 20,
  output: 'htmlAndMathml',
} as const

/**
 * Typeset with KaTeX, then measure the result. Pele needs a concrete width and
 * height to reserve space in its layout, and KaTeX has no synchronous
 * measurement API, so the markup is briefly mounted off-screen — one forced
 * layout per formula, and diagrams rarely carry many.
 */
export function createMathResolver(): NonNullable<DiagramResolvers['math']> {
  return (tex, size) => {
    let html: string
    try {
      html = katex.renderToString(tex, { ...KATEX_OPTIONS, displayMode: false })
    } catch {
      // A formula pele should show as TeX beats one that breaks the diagram.
      return undefined
    }
    const doc = globalThis.document
    if (doc === undefined) return undefined
    const probe = doc.createElement('span')
    probe.style.cssText = `position:fixed;left:-100000px;top:0;display:inline-block;white-space:nowrap;font-size:${size}px;line-height:1.2`
    probe.innerHTML = html
    doc.body.appendChild(probe)
    let width = 0
    let height = 0
    try {
      const rect = probe.getBoundingClientRect()
      width = rect.width
      height = rect.height
    } finally {
      probe.remove()
    }
    if (width === 0) {
      // No layout (detached document, print context): estimate so the label is
      // still placed rather than collapsing to zero width.
      width = Math.max(size, tex.length * size * 0.5)
      height = size * 1.4
    }
    return { html, width, height }
  }
}

/** camelCase → kebab-case for SVG attribute names (fillRule → fill-rule). */
function svgAttrName(name: string): string {
  return name.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)
}

function serializeAttrs(attrs: Record<string, unknown>): string {
  return Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${svgAttrName(key)}="${String(value)}"`)
    .join(' ')
}

function serializeShape(shape: IconShape): string {
  return `<${shape.tag} ${serializeAttrs(shape.attrs as Record<string, unknown>)} />`
}

function serializeIcon(icon: BundledIcon): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.viewBox}" width="1em" height="1em" ${serializeAttrs(icon.attrs as Record<string, unknown>)} aria-hidden="true">${icon.shapes.map(serializeShape).join('')}</svg>`
}

/**
 * Map a Pele icon reference onto the plugin's own catalogue. Names arrive in
 * the styles diagram authors use (`fa:fa-car`, `fa-car`, `car`), while the
 * catalogue is PascalCase (`Check`, `Chart`), so the lookup strips the prefix
 * and compares case-insensitively with separators removed. Unknown names
 * return undefined and Pele keeps its text fallback.
 */
export function createIconResolver(): NonNullable<DiagramResolvers['icons']> {
  const lookup = new Map<string, BundledIcon>()
  for (const [name, icon] of Object.entries(ICONS)) {
    lookup.set(name.toLowerCase(), icon)
    lookup.set(name.toLowerCase().replace(/[^a-z0-9]/g, ''), icon)
  }
  return (raw) => {
    // Pele hands the reference over verbatim, so `fa:fa-bolt` (the FontAwesome
    // spelling Mermaid authors use) carries TWO prefixes: strip them in a loop,
    // then fall back to a separator-free comparison.
    const cleaned = raw.trim().toLowerCase()
    const candidates = new Set<string>([cleaned, cleaned.replace(/[^a-z0-9]/g, '')])
    let rest = cleaned
    while (/^fa[-:]/.test(rest)) {
      rest = rest.replace(/^fa[-:]/, '')
      candidates.add(rest)
      candidates.add(rest.replace(/[^a-z0-9]/g, ''))
    }
    for (const candidate of candidates) {
      const icon = lookup.get(candidate)
      if (icon !== undefined) return serializeIcon(icon)
    }
    return undefined
  }
}

/** Both resolvers, built once per module load. */
export function createDiagramResolvers(): DiagramResolvers {
  return { math: createMathResolver(), icons: createIconResolver() }
}
