/**
 * three.js asset-bundle entry: registers the scene renderer on
 * `window.__VtGenuiAssets__.three`. Built as a standalone IIFE into
 * `lib/assets/three.js` and served by the plugin's node-half route; loaded on
 * demand by scene3d-lazy.
 * @module dsh-vt-gen-ui/client/asset-three
 */
import { mountScene } from './scene3d-core.ts'

const win = globalThis as unknown as { __VtGenuiAssets__?: Record<string, unknown> }
const assets = win.__VtGenuiAssets__ ?? (win.__VtGenuiAssets__ = {})
assets.three = { mountScene }
