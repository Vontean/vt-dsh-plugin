/**
 * Icon asset-bundle entry: registers the FULL glyph catalogue on
 * `window.__VtGenuiAssets__.icons`.
 *
 * Built as a standalone IIFE into `lib/assets/icons.js` and served by the
 * plugin's node-half route; `icon-lazy` fetches it the first time a spec uses
 * an `icon` name that is not in the 64-glyph inline set. Keeping it here (and
 * not in the client bundle) is what stops ~1 MB of path data from riding
 * along on every conversation load.
 * @module dsh-vt-gen-ui/client/icons/asset-icons
 */
import { ICONS_FULL } from './icon-data-full.ts'

const win = globalThis as unknown as { __VtGenuiAssets__?: Record<string, unknown> }
const assets = win.__VtGenuiAssets__ ?? (win.__VtGenuiAssets__ = {})
assets.icons = ICONS_FULL
