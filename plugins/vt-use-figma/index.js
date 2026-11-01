/**
 * dsh-vt-use-figma — host half.
 *
 * Two jobs, both about teaching the model rather than doing Figma work itself:
 *
 * 1. **Routing.** One system-prompt section tells the model that a `figma.com`
 *    link or a Figma request means: check the `mcp__figma__*` tools, open a
 *    session, load the matching official skill, then call the tool. The remote
 *    MCP connection is owned by `dsh-oauth-mcp-client`; nothing here touches it.
 *
 * 2. **Skills.** Figma ships its skills inside the MCP server as `skill://`
 *    resources. DSH's OAuth MCP client does not bridge MCP resources, so a
 *    provider here reads the same skills from the Codex plugin cache **in
 *    place**: no files copied, no user directory written, no redistribution of
 *    Figma-licensed text.
 *
 * Why not copy the skills into this package: their licence is
 * `LicenseRef-Figma-Developer-Terms`, and a copy would drift from the server's
 * version within weeks.
 *
 * Why host-only: there is nothing to draw. The package declares no `dsh.client`
 * and ships no `client.js`; `scripts/check-client-bundles.mjs` skips it.
 *
 * Runtime imports are Node built-ins only, deliberately: an external plugin's
 * node half must not depend on the harness module graph.
 *
 * @module dsh-vt-use-figma
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** Prompt section name. Distinct from `tool:mcp:figma`, which the OAuth MCP client owns. */
const SECTION_NAME = 'figma:routing'

/** Skill provider name; also the plugin id. */
const PROVIDER_NAME = 'dsh-vt-use-figma'

/**
 * Candidate rank. Mirrors `CUSTOM_RANK` in `dsh-skill-filesystem`: a project
 * skill root (100/200) still wins, so a workspace can pin its own copy.
 */
const SKILL_RANK = 300

/** The remote MCP server registers its tools under this prefix. */
const FIGMA_TOOL_PREFIX = 'mcp__figma__'

/** Only Figma's own skill directories are picked up. */
const FIGMA_SKILL_PREFIX = 'figma-'

const STATUS_TOOL_NAME = 'figma_status'

/** Frontmatter fence, capturing the block between the delimiters. */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u

/** One `key: value` frontmatter line. Continuation lines are ignored on purpose. */
const FRONTMATTER_FIELD_RE = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/u

/** Skill-name grammar accepted by `ctx.skills.get()`. */
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

/** Numeric version such as `17.0.0`. Directory names are NOT versions. */
const VERSION_RE = /^\d+(?:\.\d+){0,3}$/u

const INVOCATION = Object.freeze({ modelInvocable: true, userInvocable: true })

/** The routing section. Kept stable across assemblies; state is appended below. */
const ROUTING_TEXT = `## Figma（远程 MCP + 官方技能）

触发：用户消息含 figma.com 链接（\`/design/\` \`/file/\` \`/board/\` \`/slides/\`，或带 \`node-id=\`），或要求 Figma 相关产出（设计稿→代码、设计走查、在 Figma 里画或改、Code Connect、Slides、FigJam）。命中后按下面执行；不要凭记忆或截图猜 Figma 文件内容。

1) 先看自己的工具表里有没有 \`mcp__figma__\` 开头的工具。没有就说明这个会话没连上 Figma MCP：直接告诉用户，并给出设置路径 Settings → Plugins → MCP Connections（添加连接后完成 OAuth 授权）。不要伪造设计数据，也不要用截图替代真实设计上下文。需要机器可读的自检结果时调 \`figma_status\`。
2) 先建会话再读写：第一次读或改某个文件前调 \`create_session({fileKey, description})\`；之后每个针对该文件的 Figma 工具调用都要带上返回的 \`sessionId\`（即使 fileKey 不同也要带）。\`fileKey\` / \`nodeId\` 从 URL 取：\`figma.com/design/<fileKey>/<name>?node-id=1-2\` → nodeId \`1:2\`。URL 没有 \`node-id\` 时向用户要一个选好节点的链接，不要猜文件名或节点 id。
3) 先加载技能再调工具（官方强制，顺序不能反；用 \`skill\` 工具按名字加载）：
   - \`get_design_context\` → \`figma-design-to-code\`
   - \`use_figma\` → \`figma-use\`（再按上下文叠加 \`figma-use-slides\` / \`figma-use-figjam\` / \`figma-use-motion\` / \`figma-generate-design\` / \`figma-generate-library\`）
   - \`create_new_file\` → \`figma-create-new-file\`
   - \`generate_diagram\` → \`figma-generate-diagram\`
   - \`create_shader\` / \`update_shader\` → \`figma-shaders\`
   - \`create_generative_plugin\` / \`update_generative_plugin\` → \`figma-generative-plugins\`
   - \`send_code_to_figma\` → \`figma-code-workflows\`
   - Code Connect → \`figma-code-connect\`；规范 / PRD 文档 → \`figma-spec\`
   - SwiftUI / iOS 双向翻译 → \`figma-swiftui\`；动效落地成代码 → \`figma-implement-motion\`
   这些技能写着具体调用契约与已知坑；跳过它们会让调用失败或产出质量明显变差。
4) 资产要真：需要图片、图标、插画时用 \`download_assets\` 取原始资源，不要凭感觉重画。
5) 先读后写：目标不确定就先 \`get_metadata\` 或取浅层 \`get_design_context\` 确认节点，再取完整上下文或写入；写入后读回核对。
6) 汇报：给带 \`node-id\` 的文件链接与改动的节点 id，不要贴回整段巨型返回值。`

/** Shown instead of the mapping table when no skill directory was found. */
const SKILLS_MISSING_TEXT = `\n\n⚠ 本机没找到 Figma 技能目录，上面表里的技能暂时加载不了。\`mcp__figma__\` 只读工具仍然可用；遇到需要技能的工具（尤其 \`use_figma\` 与 \`get_design_context\`）时，先告诉用户按插件 README 安装：把 \`figma-*/SKILL.md\` 放进 \`~/.dsh/skills/\`，或用本插件的 \`skillsDir\` 配置指向已有目录。不要假装加载过技能。`

/* ------------------------------------------------------------------ */
/* small helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Warn once per message without letting a broken skill file abort discovery.
 * @param {string} message - diagnostic text.
 */
function warn(message) {
  try {
    console.warn(`[${PROVIDER_NAME}] ${message}`)
  } catch {
    /* console unavailable */
  }
}

/**
 * Read a directory, returning an empty list on any failure.
 * @param {string} directory - absolute path.
 * @returns {string[]} sorted entry names, dotfiles removed.
 */
function safeReaddir(directory) {
  try {
    return readdirSync(directory)
      .filter((entry) => !entry.startsWith('.'))
      .sort()
  } catch {
    return []
  }
}

/**
 * Strip one layer of matching YAML quotes.
 * @param {string} value - raw scalar.
 * @returns {string} unquoted scalar.
 */
function unquote(value) {
  if (value.length < 2) return value
  const first = value[0]
  const last = value[value.length - 1]
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) return value.slice(1, -1)
  return value
}

/**
 * Parse a SKILL.md frontmatter block.
 *
 * Every Figma skill description is a single-line scalar (verified against the
 * 16 shipped skills, longest 975 characters), so continuation lines are
 * skipped rather than folded. This keeps the plugin dependency-free.
 *
 * @param {string} raw - complete file text.
 * @returns {{ fields: Record<string, string>, body: string } | null} parsed parts, or null.
 */
export function parseFrontmatter(raw) {
  const match = FRONTMATTER_RE.exec(raw)
  if (match === null) return null
  /** @type {Record<string, string>} */
  const fields = {}
  for (const line of match[1].split(/\r?\n/u)) {
    const field = FRONTMATTER_FIELD_RE.exec(line)
    if (field === null) continue
    fields[field[1]] = unquote(field[2].trim())
  }
  return { fields, body: raw.slice(match[0].length).replace(/^\r?\n/u, '') }
}

/**
 * Compare two numeric versions segment by segment.
 * @param {string} left - version such as `17.0.0`.
 * @param {string} right - version such as `2.0.20`.
 * @returns {number} negative, zero, or positive.
 */
export function compareVersions(left, right) {
  const a = left.split('.')
  const b = right.split('.')
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const x = Number.parseInt(a[index] ?? '0', 10) || 0
    const y = Number.parseInt(b[index] ?? '0', 10) || 0
    if (x !== y) return x - y
  }
  return 0
}

/**
 * Read the plugin version from a Codex plugin manifest.
 *
 * The cache directory name is not the version: `openai-curated-remote/figma/17.0.0`
 * is a version, `openai-curated/figma/1e285826` is a hash. The manifest is the
 * only reliable source.
 *
 * @param {string} manifestPath - path to `.codex-plugin/plugin.json`.
 * @returns {string | null} declared version, or null.
 */
function readPluginVersion(manifestPath) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    return typeof manifest.version === 'string' && VERSION_RE.test(manifest.version) ? manifest.version : null
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* configuration                                                       */
/* ------------------------------------------------------------------ */

/**
 * Normalize the loader-supplied config. No schema library, matching the other
 * plugins in this repository: unknown keys are ignored rather than rejected.
 *
 * @param {unknown} config - raw plugin config.
 * @returns {{ routing: boolean, skills: boolean, codexHome: string, skillsDir: string | null }} resolved config.
 */
function normalizeConfig(config) {
  const raw = config !== null && typeof config === 'object' ? config : {}
  const text = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)
  const codexHome = text(raw.codexHome) ?? text(process.env.CODEX_HOME) ?? join(homedir(), '.codex')
  return {
    routing: raw.routing !== false,
    skills: raw.skills !== false,
    codexHome: resolve(codexHome),
    skillsDir: text(raw.skillsDir) === null ? null : resolve(text(raw.skillsDir)),
  }
}

/* ------------------------------------------------------------------ */
/* skill discovery                                                     */
/* ------------------------------------------------------------------ */

/**
 * @typedef {object} SkillSource
 * @property {string} skillsDir - absolute directory holding the `figma-*` skill folders.
 * @property {string | null} version - plugin version when the source is a Codex cache.
 * @property {string} origin - human-readable origin for status output.
 */

/**
 * Locate the directory that holds the official Figma skills.
 *
 * An explicit `skillsDir` always wins. Otherwise every Codex marketplace cache
 * is scanned (`<codexHome>/plugins/cache/<marketplace>/figma/<build>/`) and the
 * highest manifest version is chosen.
 *
 * @param {ReturnType<typeof normalizeConfig>} config - resolved config.
 * @returns {SkillSource | null} the chosen source, or null when nothing qualifies.
 */
export function resolveSkillSource(config) {
  if (config.skillsDir !== null) {
    return existsSync(config.skillsDir) ? { skillsDir: config.skillsDir, version: null, origin: 'config' } : null
  }

  const cacheRoot = join(config.codexHome, 'plugins', 'cache')
  /** @type {(SkillSource & { version: string }) | null} */
  let best = null

  for (const marketplace of safeReaddir(cacheRoot)) {
    const figmaDir = join(cacheRoot, marketplace, 'figma')
    for (const build of safeReaddir(figmaDir)) {
      const buildDir = join(figmaDir, build)
      const skillsDir = join(buildDir, 'skills')
      const manifestPath = join(buildDir, '.codex-plugin', 'plugin.json')
      if (!existsSync(skillsDir) || !existsSync(manifestPath)) continue
      const version = readPluginVersion(manifestPath)
      if (version === null) continue
      if (best === null || compareVersions(version, best.version) > 0) {
        best = { skillsDir, version, origin: `${marketplace}@${version}` }
      }
    }
  }

  return best
}

/**
 * @typedef {object} SkillCandidate
 * @property {string} name - kebab-case skill name from frontmatter.
 * @property {string} description - one-line routing description.
 * @property {string} source - skill source bucket.
 * @property {string} provider - provider name.
 * @property {number} rank - precedence within one layer.
 * @property {string} locator - opaque handle passed back to `get`.
 * @property {string} path - absolute SKILL.md path.
 * @property {{ kind: 'directory', path: string }} resourceBase - base for relative references.
 * @property {{ modelInvocable: boolean, userInvocable: boolean }} invocation - invocation policy.
 */

/**
 * Read every `figma-*` skill under a source directory.
 *
 * A broken or unrecognised file is skipped with a warning: one bad skill must
 * not empty the whole catalog.
 *
 * @param {SkillSource} source - resolved source directory.
 * @returns {SkillCandidate[]} sorted candidates.
 */
export function readSkillCandidates(source) {
  /** @type {SkillCandidate[]} */
  const candidates = []
  /** @type {Set<string>} */
  const seen = new Set()

  for (const entry of safeReaddir(source.skillsDir)) {
    if (!entry.startsWith(FIGMA_SKILL_PREFIX)) continue
    const directory = join(source.skillsDir, entry)
    const file = join(directory, 'SKILL.md')
    if (!existsSync(file)) continue

    let raw
    try {
      raw = readFileSync(file, 'utf8')
    } catch (error) {
      warn(`cannot read ${file}: ${String(error)}`)
      continue
    }

    const parsed = parseFrontmatter(raw)
    if (parsed === null) {
      warn(`skipped ${entry}: no frontmatter`)
      continue
    }

    const skillName = parsed.fields.name ?? entry
    const description = parsed.fields.description ?? ''
    if (!SKILL_NAME_RE.test(skillName)) {
      warn(`skipped ${entry}: invalid skill name "${skillName}"`)
      continue
    }
    if (description === '') {
      warn(`skipped ${entry}: no description`)
      continue
    }
    if (seen.has(skillName)) {
      warn(`skipped ${entry}: duplicate skill name "${skillName}"`)
      continue
    }

    seen.add(skillName)
    candidates.push({
      name: skillName,
      description,
      source: 'custom',
      provider: PROVIDER_NAME,
      rank: SKILL_RANK,
      locator: file,
      path: file,
      resourceBase: { kind: 'directory', path: directory },
      invocation: INVOCATION,
    })
  }

  return candidates
}

/* ------------------------------------------------------------------ */
/* plugin                                                              */
/* ------------------------------------------------------------------ */

export const name = PROVIDER_NAME

/** The prompt section is the only hard dependency; skills and tools are optional services. */
export const inject = ['systemPrompt']

/**
 * Register the routing section, the Figma skill provider, and the status tool.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - cordis context.
 * @param {unknown} [config] - loader config.
 */
export function apply(ctx, config) {
  const settings = normalizeConfig(config)

  /** Per-registration state: the catalog is resolved once and can be refreshed. */
  const state = {
    /** @type {{ source: SkillSource | null, candidates: SkillCandidate[] } | null} */
    catalog: null,
    /** @type {{ invalidate: () => void } | null} */
    control: null,
  }

  /**
   * Resolve the catalog, memoized for this registration.
   * @param {boolean} refresh - drop the memo and re-scan.
   * @returns {{ source: SkillSource | null, candidates: SkillCandidate[] }} the catalog.
   */
  const catalogOf = (refresh) => {
    if (refresh) {
      state.catalog = null
      if (state.control !== null) state.control.invalidate()
    }
    if (state.catalog === null) {
      const source = resolveSkillSource(settings)
      state.catalog = { source, candidates: source === null ? [] : readSkillCandidates(source) }
    }
    return state.catalog
  }

  if (settings.routing) {
    ctx.systemPrompt.section({
      name: SECTION_NAME,
      // The host's centrally allocated placement for MCP server guidance.
      order: ctx.systemPrompt.getSectionOrder('MCP_SERVERS'),
      // The text is model prose, not a template: strict `{{variable}}` interpolation
      // would either fail or rewrite the examples.
      interpolate: false,
      text: () => {
        const { source, candidates } = catalogOf(false)
        if (candidates.length === 0) return ROUTING_TEXT + SKILLS_MISSING_TEXT
        const origin = source === null ? 'config' : source.origin
        return `${ROUTING_TEXT}\n\n技能已就绪：${String(candidates.length)} 个 figma-* 技能（来源 ${origin}）。`
      },
    })
  }

  if (settings.skills) {
    ctx.inject(['skills'], (skillCtx) => {
      skillCtx.skills.registerProvider((registration) => {
        state.control = registration
        return {
          name: PROVIDER_NAME,
          list: () => Promise.resolve(catalogOf(false).candidates),
          get: (candidate) => {
            const file = typeof candidate.path === 'string' ? candidate.path : candidate.locator
            try {
              const raw = readFileSync(String(file), 'utf8')
              const parsed = parseFrontmatter(raw)
              if (parsed === null) return Promise.resolve(undefined)
              return Promise.resolve({
                name: candidate.name,
                description: candidate.description,
                invocation: candidate.invocation,
                source: candidate.source,
                provider: candidate.provider,
                resourceBase: candidate.resourceBase,
                path: candidate.path,
                content: parsed.body,
              })
            } catch {
              return Promise.resolve(undefined)
            }
          },
        }
      })
    })
  }

  ctx.inject(['tools'], (toolsCtx) => {
    toolsCtx.tools.register(
      createStatusTool((refresh) => {
        const { source, candidates } = catalogOf(refresh)
        /** @type {string[]} */
        let figmaTools = []
        try {
          figmaTools = toolsCtx.tools
            .schemas()
            .map((schema) => schema.name)
            .filter((toolName) => toolName.startsWith(FIGMA_TOOL_PREFIX))
            .sort()
        } catch (error) {
          warn(`cannot read tool schemas: ${String(error)}`)
        }
        return {
          mcpConnected: figmaTools.length > 0,
          figmaTools,
          skills: {
            available: candidates.length > 0,
            count: candidates.length,
            names: candidates.map((candidate) => candidate.name),
            origin: source === null ? null : source.origin,
            version: source === null ? null : source.version,
            dir: source === null ? null : source.skillsDir,
          },
          hints: statusHints(figmaTools.length > 0, candidates.length > 0, settings),
        }
      }),
    )
  })
}

/**
 * Actionable next steps for a missing connection or a missing skill directory.
 * @param {boolean} connected - whether `mcp__figma__*` tools are visible.
 * @param {boolean} skillsReady - whether any Figma skill was found.
 * @param {ReturnType<typeof normalizeConfig>} settings - resolved config.
 * @returns {string[]} hint lines, possibly empty.
 */
function statusHints(connected, skillsReady, settings) {
  /** @type {string[]} */
  const hints = []
  if (!connected) {
    hints.push(
      'Figma MCP is not connected in this session. Configure an OAuth MCP connection (serverName "figma", url https://mcp.figma.com/mcp) and finish the browser authorization: Settings → Plugins → MCP Connections.',
    )
  }
  if (!skillsReady) {
    hints.push(
      `No Figma skills found. Install figma-*/SKILL.md into ~/.dsh/skills/, or set this plugin's skillsDir. Scanned ${settings.codexHome}/plugins/cache.`,
    )
  }
  return hints
}

/**
 * Build the `figma_status` tool definition.
 *
 * Read-only and side-effect free: it reports what the session actually has so
 * the model can avoid promising Figma work it cannot do.
 *
 * @param {(refresh: boolean) => Record<string, unknown>} collect - status collector.
 * @returns {import('@deepseek-ai/dsh-tools').ToolDefinition} tool definition.
 */
function createStatusTool(collect) {
  return {
    name: STATUS_TOOL_NAME,
    description:
      'Report whether the remote Figma MCP tools (mcp__figma__*) are connected in this session and which Figma skills this plugin exposes. '
      + 'Call it before promising Figma work when the connection state is unclear. Read-only; it never calls Figma.',
    parameters: {
      type: 'object',
      properties: {
        refresh: {
          type: 'boolean',
          description: 'Re-scan the Figma skill directory before reporting. Use after installing or upgrading skills.',
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
      return collect(refresh)
    },
  }
}
