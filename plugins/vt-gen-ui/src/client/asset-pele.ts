/**
 * Pele asset-bundle entry: registers the diagram engine on
 * `window.__VtGenuiAssets__.pele`. Built as a standalone IIFE into
 * `lib/assets/pele.js` and served by the plugin's node-half route; loaded on
 * demand by mermaid-lazy only when a spec contains a `mermaid` node.
 * @module dsh-vt-gen-ui/client/asset-pele
 */
import { renderMermaid } from './diagram-core.ts'
import { assertSafeSvg, repairMermaidSource } from './mermaid-safe.ts'

const win = globalThis as unknown as { __VtGenuiAssets__?: Record<string, unknown> }
const assets = win.__VtGenuiAssets__ ?? (win.__VtGenuiAssets__ = {})
assets.pele = { assertSafeSvg, repairMermaidSource, renderMermaid }
