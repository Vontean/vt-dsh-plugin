/**
 * The `minedesign_status` tool.
 *
 * One read-only call answers "can this session actually do MineDesign work?".
 * That matters because every failure mode of this plugin is silent by design:
 * a missing install, a dead MCP child, or a missing skills directory all leave
 * the harness perfectly healthy, with the model simply unable to see the tools.
 * Without this tool the model would promise design work it cannot deliver.
 *
 * The payload also carries the repair instruction: when the bundle patch could
 * not mount the MCP entry (see DESIGN.md §7), `hints` contains a ready-to-paste
 * configuration block filled with the real absolute paths of this machine.
 *
 * @module dsh-vt-minedesign/src/status
 */

/** Public tool name; also the name the routing prompt tells the model to call. */
const STATUS_TOOL_NAME = 'minedesign_status'

/**
 * @typedef {object} StatusPayload
 * @property {{ ok: true, origin: string, version: string | null, root: string, workspace: string, skillsDir: string | null }
 *   | { ok: false, reason: string }} install - install resolution result.
 * @property {boolean} mcpConnected - whether `mcp__minedesign__*` tools exist in this session.
 * @property {string[]} tools - the visible MineDesign tool names.
 * @property {{ count: number, names: string[], dir: string | null }} skills - exposed skills.
 * @property {{ path: string, kind: string, title: string, editorUrl: string }[]} editors - open editor sessions.
 * @property {string[]} hints - actionable next steps.
 */

/**
 * Build the status tool definition.
 *
 * @param {(refresh: boolean) => StatusPayload} probe - collector bound to one registration.
 * @returns {import('@deepseek-ai/dsh-tools').ToolDefinition} tool definition.
 */
export function createStatusTool(probe) {
  return {
    name: STATUS_TOOL_NAME,
    description:
      'Report whether this session can use MineDesign: where the local install was found, whether the '
      + 'mcp__minedesign__* tools are connected, which design skills are exposed, and which editor URLs are open. '
      + 'Call it before promising design work when that state is unclear, and after installing or repairing MineDesign. '
      + 'Read-only; it never modifies the install or the work directory.',
    parameters: {
      type: 'object',
      properties: {
        refresh: {
          type: 'boolean',
          description: 'Re-resolve the install and re-scan the skills directory before reporting.',
        },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render(_args, value) {
        return [{ type: 'text', text: JSON.stringify(value) }]
      },
    },
    async execute(args) {
      const refresh = args !== null && typeof args === 'object' && args.refresh === true
      return probe(refresh)
    },
  }
}

/**
 * Render a copy-pasteable `cordis.patch.yml` entry for this machine.
 *
 * Used when the bundled `!!js` patch did not evaluate (see DESIGN.md §7): the user
 * deletes the shipped entry and pastes this one, which carries real absolute
 * paths instead of a loader expression. Nothing is written to disk.
 *
 * @param {{ command: string, args: string[], env?: Record<string, string> }} launch - resolved launch spec.
 * @returns {string} YAML fragment.
 */
function pasteableEntry(launch) {
  /** @param {string} value - scalar to quote. */
  const quote = (value) => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
  const env = { ELECTRON_RUN_AS_NODE: '1', ...launch.env }
  const envLines = Object.entries(env).map(([key, value]) => `        ${key}: ${quote(value)}`)
  return [
    '  - id: mcp-minedesign',
    '    name: "@deepseek-ai/dsh-mcp-client"',
    '    config:',
    '      serverName: minedesign',
    '      transport: stdio',
    `      command: ${quote(launch.command)}`,
    '      args:',
    ...launch.args.map((arg) => `        - ${quote(arg)}`),
    '      env:',
    ...envLines,
    '      toolCallTimeoutMs: 120000',
    '      failOnStartupError: false',
  ].join('\n')
}

/**
 * The subset of a resolved install worth showing.
 * @param {{ ok: true, install: Record<string, any> }} resolved - successful resolution.
 * @returns {{ ok: true, origin: any, version: any, root: any, workspace: any, skillsDir: any }} report shape.
 */
function installSummary(resolved) {
  const { install } = resolved
  return {
    ok: true,
    origin: install.origin,
    version: install.version,
    root: install.root,
    workspace: install.workspace,
    skillsDir: install.skillsDir,
  }
}

/**
 * Actionable next steps for every degraded state.
 *
 * Ordered by what the user should fix first, and written as commands they can
 * paste: a status tool that only reports symptoms makes the model invent fixes.
 *
 * @param {object} input - observed state.
 * @param {ReturnType<import('./install.js').resolveInstall>} input.resolved - install resolution.
 * @param {boolean} input.connected - whether `mcp__minedesign__*` tools exist.
 * @param {boolean} input.skillsReady - whether the skills directory produced candidates.
 * @returns {string[]} hint lines, possibly empty.
 */
function statusHints({ resolved, connected, skillsReady }) {
  /** @type {string[]} */
  const hints = []

  if (!connected) {
    if (!resolved.ok) {
      hints.push(
        `MineDesign was not found: ${resolved.reason} `
        + 'Install it with `npx @vontean/minedesign plugin install`, then restart the harness.',
      )
    } else {
      hints.push(
        'The MineDesign install is ready but no mcp__minedesign__* tool is registered in this session: '
        + 'the bundle patch for the MCP entry did not mount. Either restart the harness, or replace the '
        + `"mcp-minedesign" entry in cordis.patch.yml with this block, which uses real absolute paths:\n${pasteableEntry(resolved.install.launch)}`,
      )
    }
  }

  if (!skillsReady) {
    hints.push(
      'No MineDesign skill was found. Run `npx @vontean/minedesign plugin install` so it registers '
      + '`skills/design` and `skills/design-system`, or point this plugin’s `skillsDir` at a skills directory.',
    )
  }

  return hints
}

/**
 * Build the status payload reader.
 *
 * One function per input keeps the probe honest: it reads live state on every
 * call instead of caching a picture that goes stale.
 *
 * @param {object} input - live readers.
 * @param {(refresh: boolean) => any} input.install - install resolution.
 * @param {(refresh: boolean) => { name: string }[]} input.skills - exposed skills.
 * @param {() => string[]} input.tools - visible MineDesign tool names.
 * @param {() => { path: string, kind: string, title: string, editorUrl: string }[]} input.sessions - open editor sessions.
 * @returns {(refresh: boolean) => any} payload reader.
 */
export function createStatusProbe({ install, skills, tools, sessions }) {
  return (refresh) => {
    const resolved = install(refresh)
    const candidates = skills(refresh)
    const names = tools()

    return {
      install: resolved.ok ? installSummary(resolved) : { ok: false, reason: resolved.reason },
      mcpConnected: names.length > 0,
      tools: names,
      skills: {
        count: candidates.length,
        names: candidates.map((candidate) => candidate.name),
        dir: resolved.ok ? resolved.install.skillsDir : null,
      },
      editors: sessions(),
      hints: statusHints({ resolved, connected: names.length > 0, skillsReady: candidates.length > 0 }),
    }
  }
}
