/**
 * MineDesign's two design skills, exposed to DSH without copying them.
 *
 * MineDesign ships `skills/design/` and `skills/design-system/` for Codex. Two
 * of the assumptions in those files do not hold in DSH: there is no Space
 * (`space_list` does not exist) and no design-card UI inside the thread. Both
 * skills already end with a `## MineDesign Codex 适配` section, so upstream has
 * converged the environment differences into one overridable layer; this module
 * appends the DSH counterpart of that layer in memory.
 *
 * The upstream text is read at call time and never written anywhere: no copy
 * lands in this package, the upstream files stay untouched, and an upstream
 * upgrade changes the body without touching this code.
 *
 * @module dsh-vt-minedesign/src/skills
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Provider name; also the plugin id. */
const PROVIDER_NAME = 'dsh-vt-minedesign'

/** Candidate rank. Mirrors `CUSTOM_RANK`: a project skill root still wins. */
const SKILL_RANK = 300

/** Skill-name prefix applied by default, so upstream `design` cannot collide. */
const DEFAULT_PREFIX = 'minedesign-'

/** File every skill directory must contain. */
const SKILL_FILE = 'SKILL.md'

/** Frontmatter fence, capturing the block between the delimiters. */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u

/** One `key: value` frontmatter line. Continuation lines are ignored on purpose. */
const FRONTMATTER_FIELD_RE = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/u

/** Skill-name grammar accepted by `ctx.skills.get()`. */
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

const INVOCATION = Object.freeze({ modelInvocable: true, userInvocable: true })

/**
 * Directory name → default skill name.
 *
 * Only the two shipped skills are mapped; any future skill directory falls back
 * to `<prefix><directory>`, so upstream can add one without a code change here.
 */
export const SKILL_NAME_MAP = Object.freeze({
  design: 'minedesign-design',
  'design-system': 'minedesign-design-system',
})

/**
 * The DSH counterpart of upstream's `## MineDesign Codex 适配` section.
 *
 * Kept as one string because the semantics matter and it is asserted verbatim
 * in tests: Space is gone, the design card is gone, `editorUrl` is the delivery,
 * and event paths must carry the `__deck/events` suffix (probed on a real
 * machine: subscribing to the work directory itself is rejected).
 */
const DSH_ADAPTATION = `## DSH 适配（优先于上方「Codex 适配」与原始流程）

- 运行环境是 DeepSeek Harness，不是 Codex。**没有 Space、\`space_list\` 不存在**：跳过 Space 相关步骤，只在工作目录和用户指定的目录里找。
- **没有「设计稿卡片」**。校验通过（设计稿用 \`design_check\`，设计系统用 \`design_system_check\`）后调 \`minedesign_open_document\`（设计稿用 \`design\`，设计系统用 \`design-system\`），工具结果里的 \`editorUrl\` 就是编辑器地址。
- 作品会显示在右侧栏的 **MineDesign 面板**里（本插件注册的侧栏 tab，带顶部栏），不需要你手动打开界面。若面板没有出现，让用户从右侧栏入口列表点 MineDesign，或把 \`editorUrl\` 作为 Markdown 链接交给用户。**绝不编造链接。**
- 用户在编辑器里的改动与标注用 \`minedesign_events\` 读取：\`path\` 传 \`<editorPath>__deck/events\`（形如 \`/design/<grant>/__deck/events\`），**不要传作品目录**——传作品目录会报「不允许订阅的路径」，这是真机实测结论。
- 文件一律用 DSH 的 read/write/edit，不要用 shell 重定向写作品文件。`

/* ------------------------------------------------------------------ */
/* small helpers (all total, none throw)                               */
/* ------------------------------------------------------------------ */

/**
 * Warn once per skipped file without letting a broken skill abort discovery.
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
 * MineDesign writes `name` and `description` as single-line scalars (verified
 * against both shipped skills), so continuation lines are skipped rather than
 * folded. This keeps the module dependency-free.
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
 * Name one skill directory gets in DSH.
 *
 * The directory name is the identity, not the frontmatter `name`: the map is
 * keyed by directory, and a renamed frontmatter field must not silently move a
 * skill to another tool name.
 *
 * @param {string} directory - skill directory basename.
 * @param {string} prefix - configured prefix; `''` keeps the upstream name.
 * @returns {string} kebab-case skill name.
 */
function skillNameFor(directory, prefix) {
  if (prefix === '') return directory
  if (prefix === DEFAULT_PREFIX) return SKILL_NAME_MAP[directory] ?? `${prefix}${directory}`
  return `${prefix}${directory}`
}

/* ------------------------------------------------------------------ */
/* skill discovery                                                     */
/* ------------------------------------------------------------------ */

/**
 * @typedef {object} SkillCandidate
 * @property {string} name - kebab-case skill name exposed to DSH.
 * @property {string} description - one-line routing description from frontmatter.
 * @property {string} source - skill source bucket.
 * @property {string} provider - provider name.
 * @property {number} rank - precedence within one layer.
 * @property {string} locator - opaque handle passed back to `readSkill`.
 * @property {string} path - absolute SKILL.md path.
 * @property {{ kind: 'directory', path: string }} resourceBase - base for relative references.
 * @property {{ modelInvocable: boolean, userInvocable: boolean }} invocation - invocation policy.
 */

/**
 * List the MineDesign skills available on this machine.
 *
 * A missing `skillsDir` (MineDesign not installed, or `mdn plugin install`
 * never run) is not an error: the caller registers nothing and the status tool
 * explains it. A malformed individual skill is skipped with one warning, so a
 * single bad file cannot empty the catalog.
 *
 * @param {{ skillsDir?: string | null } | null | undefined} install - resolved install.
 * @param {{ prefix?: string }} [options] - naming options.
 * @returns {SkillCandidate[]} sorted candidates.
 */
export function listSkills(install, { prefix = DEFAULT_PREFIX } = {}) {
  const skillsDir = typeof install?.skillsDir === 'string' && install.skillsDir !== '' ? install.skillsDir : null
  if (skillsDir === null) return []
  const cleaned = typeof prefix === 'string' ? prefix : DEFAULT_PREFIX

  /** @type {SkillCandidate[]} */
  const candidates = []
  /** @type {Set<string>} */
  const seen = new Set()

  for (const entry of safeReaddir(skillsDir)) {
    const directory = join(skillsDir, entry)
    const file = join(directory, SKILL_FILE)
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

    const description = parsed.fields.description ?? ''
    if (description === '') {
      warn(`skipped ${entry}: no description`)
      continue
    }

    const skillName = skillNameFor(entry, cleaned)
    if (!SKILL_NAME_RE.test(skillName)) {
      warn(`skipped ${entry}: invalid skill name "${skillName}"`)
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

  return candidates.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
}

/* ------------------------------------------------------------------ */
/* skill body                                                          */
/* ------------------------------------------------------------------ */

/**
 * Read one candidate's upstream body and append the DSH adaptation.
 *
 * Read-only by construction: the file is opened for reading and the result is
 * a new string. Nothing is written, so the upstream skill keeps being owned by
 * MineDesign and an upstream upgrade is picked up on the next call.
 *
 * @param {{ path?: string, locator?: string } | null | undefined} candidate - from {@link listSkills}.
 * @param {{ adapt?: boolean }} [options] - `adapt: false` returns the raw body.
 * @returns {({ content: string } & Record<string, unknown>) | undefined} the skill, or undefined.
 */
export function readSkill(candidate, { adapt = true } = {}) {
  const file = typeof candidate?.path === 'string' ? candidate.path : candidate?.locator
  if (typeof file !== 'string' || file === '') return undefined

  let raw
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return undefined
  }

  const parsed = parseFrontmatter(raw)
  if (parsed === null) return undefined

  const body = parsed.body.replace(/\s+$/u, '')
  return {
    ...candidate,
    content: adapt ? `${body}\n\n${DSH_ADAPTATION}` : body,
  }
}
