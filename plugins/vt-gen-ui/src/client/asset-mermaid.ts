/**
 * Mermaid asset-bundle entry: registers the mermaid engine on
 * `window.__VtGenuiAssets__.mermaid`. Built as a standalone IIFE into
 * `lib/assets/mermaid.js` and served by the plugin's node-half route; loaded
 * on demand by mermaid-lazy.
 * @module dsh-vt-gen-ui/client/asset-mermaid
 */
import { renderMermaid } from './mermaid-core.ts'
import { assertSafeSvg, repairMermaidSource } from './mermaid-safe.ts'

const win = globalThis as unknown as { __VtGenuiAssets__?: Record<string, unknown> }
const assets = win.__VtGenuiAssets__ ?? (win.__VtGenuiAssets__ = {})
assets.mermaid = { assertSafeSvg, repairMermaidSource, renderMermaid }
