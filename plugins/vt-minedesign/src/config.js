/**
 * The plugin's configuration surface.
 *
 * One module owns the answer to "which switches exist and what is their
 * default", so `index.js` never contains a default and the README's table has a
 * single source to mirror. Unknown keys are ignored rather than rejected,
 * matching every other plugin in this repository.
 *
 * @module dsh-vt-minedesign/src/config
 */

/** Default skill prefix; an empty prefix restores MineDesign's own skill names. */
const DEFAULT_SKILL_PREFIX = 'minedesign-'

/**
 * @typedef {object} Settings
 * @property {boolean} routing - register the system-prompt section.
 * @property {boolean} skills - expose MineDesign's two skills.
 * @property {boolean} projection - enrich `mcp__minedesign__*` results.
 * @property {boolean} panel - register the side-panel tab and its host route.
 * @property {boolean} autoOpen - open the panel when a new document appears.
 * @property {boolean} entryButton - add the conversation-header shortcut.
 * @property {string} skillPrefix - prefix for the exposed skill names.
 * @property {string | null} skillsDir - explicit skills directory.
 * @property {string | null} workspace - explicit work directory.
 * @property {unknown} launch - explicit launch override (debugging only).
 */

/**
 * Normalize the loader-supplied config.
 *
 * @param {unknown} config - raw plugin config.
 * @returns {Settings} resolved settings.
 */
export function normalizeConfig(config) {
  const raw = config !== null && typeof config === 'object' ? config : {}
  const text = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)
  return {
    routing: raw.routing !== false,
    skills: raw.skills !== false,
    projection: raw.projection !== false,
    // A headless deployment, or a user who only wants the MCP tools, can drop
    // the whole browser half.
    panel: raw.panel !== false,
    autoOpen: raw.autoOpen !== false,
    entryButton: raw.entryButton !== false,
    // An empty string is meaningful here, so it is not trimmed away.
    skillPrefix: typeof raw.skillPrefix === 'string' ? raw.skillPrefix : DEFAULT_SKILL_PREFIX,
    skillsDir: text(raw.skillsDir),
    workspace: text(raw.workspace),
    launch: raw.launch ?? null,
  }
}
