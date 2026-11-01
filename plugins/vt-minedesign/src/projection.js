/**
 * Turn MineDesign MCP results into text the model can actually read.
 *
 * Why this module exists: the MineDesign editor is delivered as an MCP App
 * (`ui://minedesign/editor.html`), and the useful payload lives in
 * `structuredContent`. DSH's MCP client bridges tools only: it renders
 * `content` and drops `structuredContent`. Every MineDesign tool except the
 * `design_check` family returns an *empty* `content`, so without this layer the
 * model sees "(returned no model-visible content)" and, worst of all, never
 * sees the editor URL that makes this whole integration useful.
 *
 * Contract: a pure projection. It reads the result it is given, returns at most
 * one text block, and never throws — a projection bug must not break a tool
 * call. It never mutates `result`, never writes state (callers record editor
 * sessions themselves), and never touches another MCP server's tools.
 *
 * Size discipline: one block is capped at {@link MAX_BYTES}. `minedesign_shell`
 * ships the whole ~100 KB editor shell in `html`; only its byte count is
 * reported, never its text.
 *
 * Runtime imports are Node built-ins only — in fact there are none: `Buffer` is
 * a Node global. An external plugin's host half must not depend on the harness
 * module graph.
 *
 * @module dsh-vt-minedesign/src/projection
 */

/** Only tools of the local MineDesign MCP server are projected. */
const TOOL_PREFIX = 'mcp__minedesign__'

/**
 * Hard cap for one appended block, in bytes.
 *
 * One call can add at most this much context. `content` blocks from the server
 * are left as they are; this only bounds what this module adds.
 */
const MAX_BYTES = 4096

/**
 * Cap for the embedded JSON summary, in bytes, so the human-readable head of a
 * block always survives. Leaves headroom below {@link MAX_BYTES}.
 */
const SUMMARY_BYTES = 3072

/**
 * Cap for an HTTP proxy body, in bytes. The final {@link MAX_BYTES} cap still
 * applies as a safety net.
 */
const BODY_BYTES = 3500

/**
 * Truncation notice. Kept readable on purpose: the model must know that what it
 * sees is a prefix, not the whole payload.
 * @param {number} total - original size in bytes.
 * @returns {string} the notice.
 */
function truncationNotice(total) {
  return `\n…（已截断，原文 ${String(total)} 字节）`
}

/**
 * Tools whose results are already model-visible JSON text. They are listed
 * explicitly so "we chose not to touch this" stays a decision, not an omission.
 */
const LEFT_ALONE = new Set([
  'design_check',
  'design_system_check',
  'design_import_asset',
  'design_system_import_asset',
])

/* ------------------------------------------------------------------ */
/* total helpers (none throw)                                          */
/* ------------------------------------------------------------------ */

/**
 * @param {string} value - any text.
 * @returns {number} its UTF-8 size in bytes.
 */
function bytesOf(value) {
  return Buffer.byteLength(value, 'utf8')
}

/**
 * @param {unknown} value - candidate.
 * @returns {string | null} a trimmed non-empty string, or null.
 */
function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/**
 * @param {unknown} value - candidate list.
 * @returns {unknown[]} the array itself, or an empty list.
 */
function listOf(value) {
  return Array.isArray(value) ? value : []
}

/**
 * Render a primitive as display text.
 * @param {unknown} value - string, number, or boolean.
 * @returns {string | null} display text, or null when the value is not a primitive.
 */
function scalar(value) {
  if (typeof value === 'string') return text(value)
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return String(value)
  return null
}

/**
 * Keep the longest prefix of a string that fits in a byte budget.
 *
 * Iterates code points, never code units, so a surrogate pair or a multi-byte
 * CJK character is never split in half.
 *
 * @param {string} value - source text.
 * @param {number} maxBytes - byte budget.
 * @returns {string} a well-formed prefix within the budget.
 */
function headBytes(value, maxBytes) {
  if (maxBytes <= 0) return ''
  let used = 0
  let out = ''
  for (const character of value) {
    const cost = bytesOf(character)
    if (used + cost > maxBytes) break
    out += character
    used += cost
  }
  return out
}

/**
 * Clip text to a byte budget, appending a readable notice when anything was cut.
 * @param {string} value - source text.
 * @param {number} maxBytes - byte budget for the result.
 * @returns {string} text of at most `maxBytes` bytes.
 */
function clip(value, maxBytes) {
  const total = bytesOf(value)
  if (total <= maxBytes) return value
  const notice = truncationNotice(total)
  const budget = maxBytes - bytesOf(notice)
  if (budget <= 0) return headBytes(value, maxBytes)
  return headBytes(value, budget) + notice
}

/**
 * Serialize a value as compact JSON and clip it.
 * @param {unknown} value - any JSON-ish value.
 * @param {number} [maxBytes] - byte budget; defaults to {@link SUMMARY_BYTES}.
 * @returns {string} clipped JSON text.
 */
function compact(value, maxBytes = SUMMARY_BYTES) {
  try {
    const json = JSON.stringify(value)
    if (typeof json !== 'string') return String(json)
    return clip(json, maxBytes)
  } catch {
    // Circular structures and BigInt reach this branch; say so instead of throwing.
    return '（无法序列化）'
  }
}

/**
 * Describe a possibly nested field in one short form.
 * @param {unknown} value - field value.
 * @param {number} [maxBytes] - byte budget for the JSON fallback.
 * @returns {string | null} display text, or null when there is nothing to show.
 */
function describe(value, maxBytes = SUMMARY_BYTES) {
  const simple = scalar(value)
  if (simple !== null) return simple
  if (value !== null && typeof value === 'object') return compact(value, maxBytes)
  return null
}

/* ------------------------------------------------------------------ */
/* editor sessions                                                     */
/* ------------------------------------------------------------------ */

/**
 * One line per open editor session. The URL is the reason this module exists,
 * so a missing one is called out rather than silently dropped.
 *
 * @param {unknown} document - `structuredContent.documents[]` entry.
 * @returns {string | null} display line, or null when the entry is not an object.
 */
function documentLine(document) {
  if (document === null || typeof document !== 'object') return null
  const entry = /** @type {Record<string, unknown>} */ (document)
  const title = text(entry.title) ?? text(entry.path) ?? '未命名作品'
  const editorUrl = text(entry.editorUrl)
  // The document id is what `minedesign_annotations` and
  // `minedesign_prepare_feedback` take; upstream only ever hands it to the
  // editor page. Dropping it here would make both tools unusable for the model.
  const id = text(entry.id)
  const idSuffix = id === null ? '' : `（id ${id}）`
  if (editorUrl === null) {
    return `当前打开：${title} — 没有 editorUrl${idSuffix}（不要编造链接，重新调用 minedesign_open_document）`
  }
  return `当前打开：${title} — ${editorUrl}${idSuffix}`
}

/**
 * @param {unknown[]} documents - document list.
 * @returns {string[]} one display line per usable entry.
 */
function documentLines(documents) {
  /** @type {string[]} */
  const lines = []
  for (const document of documents) {
    const line = documentLine(document)
    if (line !== null) lines.push(line)
  }
  return lines
}

/* ------------------------------------------------------------------ */
/* per-tool projection                                                 */
/* ------------------------------------------------------------------ */

/**
 * `minedesign_open` → `{ documents: [...] }`. `content` is empty upstream.
 * @param {Record<string, unknown>} payload - structured content.
 * @returns {string | undefined} projection text.
 */
function projectOpen(payload) {
  const documents = listOf(payload.documents)
  const lines = documentLines(documents)
  if (lines.length > 0) return lines.join('\n')
  if (documents.length === 0) {
    return '没有打开的作品。需要编辑器时调用 minedesign_open_document，它会返回 editorUrl。'
  }
  // Entries existed but none was usable: say so instead of claiming nothing is open.
  return '作品列表格式无法识别（documents 里没有可用条目）。'
}

/**
 * `minedesign_open_document` → `{ document: {...} }`.
 *
 * The original `content` only says the work is open; it does not carry the URL.
 * That URL is the single most valuable field in the whole plugin, so this
 * projection is the one that must never be skipped.
 *
 * @param {Record<string, unknown>} payload - structured content.
 * @returns {string | undefined} projection text.
 */
function projectOpenDocument(payload) {
  const line = documentLine(payload.document)
  if (line === null) {
    return '没有拿到编辑器会话（document 缺失）。需要时重新调用 minedesign_open_document。'
  }
  return line
}

/**
 * `minedesign_events` → `{ events: [...], cursor: n }`.
 *
 * "External change" here means the editor reported events since the cursor;
 * the summary JSON is clipped so a long event log cannot flood the context.
 *
 * @param {Record<string, unknown>} payload - structured content.
 * @returns {string | undefined} projection text.
 */
function projectEvents(payload) {
  const events = listOf(payload.events)
  const cursor = scalar(payload.cursor)
  const tail = cursor === null ? '' : `，cursor ${cursor}`
  const head = events.length === 0
    ? `MineDesign 事件：没有外部改动${tail}`
    : `MineDesign 事件：有外部改动（${String(events.length)} 条${tail}）`
  return `${head}\n摘要：${compact(events)}`
}

/**
 * `minedesign_annotations` → `{ annotations: [...] }`.
 * @param {Record<string, unknown>} payload - structured content.
 * @returns {string | undefined} projection text.
 */
function projectAnnotations(payload) {
  const annotations = listOf(payload.annotations)
  return `MineDesign 标注：${String(annotations.length)} 条\n摘要：${compact(annotations)}`
}

/**
 * `minedesign_prepare_feedback` → `{ version, annotations, stale }`.
 * @param {Record<string, unknown>} payload - structured content.
 * @returns {string | undefined} projection text.
 */
function projectPrepareFeedback(payload) {
  const annotations = listOf(payload.annotations)
  /** @type {string[]} */
  const parts = []
  const version = scalar(payload.version)
  if (version !== null) parts.push(`版本 ${version}`)
  parts.push(`${String(annotations.length)} 条标注`)
  if (typeof payload.stale === 'boolean') parts.push(`已过期：${payload.stale ? '是' : '否'}`)
  return `MineDesign 反馈准备：${parts.join('，')}\n摘要：${compact(annotations)}`
}

/**
 * `minedesign_about` → `{ version, status, job: { state }, settings: { language } }`.
 * @param {Record<string, unknown>} payload - structured content.
 * @returns {string | undefined} projection text.
 */
function projectAbout(payload) {
  /** @type {string[]} */
  const lines = []
  const version = scalar(payload.version)
  if (version !== null) lines.push(`- 版本：${version}`)
  const status = describe(payload.status)
  if (status !== null) lines.push(`- 更新状态：${status}`)
  const job = payload.job
  if (job !== null && typeof job === 'object') {
    const state = scalar(/** @type {Record<string, unknown>} */ (job).state)
    if (state !== null) lines.push(`- 更新任务：${state}`)
  }
  const settings = payload.settings
  if (settings !== null && typeof settings === 'object') {
    const language = scalar(/** @type {Record<string, unknown>} */ (settings).language)
    if (language !== null) lines.push(`- 界面语言：${language}`)
  }
  if (lines.length === 0) return undefined
  return `MineDesign 状态\n${lines.join('\n')}`
}

/**
 * `minedesign_settings` → `{ language }` or `{ error }`.
 * @param {Record<string, unknown>} payload - structured content.
 * @returns {string | undefined} projection text.
 */
function projectSettings(payload) {
  /** @type {string[]} */
  const lines = []
  const language = scalar(payload.language)
  if (language !== null) lines.push(`- 界面语言：${language}`)
  const error = describe(payload.error)
  if (error !== null) lines.push(`- 错误：${error}`)
  if (lines.length === 0) return undefined
  return `MineDesign 设置\n${lines.join('\n')}`
}

/**
 * `minedesign_shell` → `{ build, html }`.
 *
 * `html` is the whole editor shell, upwards of 100 KB. It must never enter the
 * context: a single shell response would burn more context than the rest of the
 * session. Report the build id and the payload size instead.
 *
 * @param {Record<string, unknown>} payload - structured content.
 * @returns {string | undefined} projection text.
 */
function projectShell(payload) {
  const build = scalar(payload.build)
  const html = payload.html
  const size = typeof html === 'string' ? bytesOf(html) : null
  if (build === null && size === null) return undefined
  const parts = [build === null ? 'build 未知' : `build ${build}`]
  parts.push(size === null ? 'html 缺失' : `html ${String(size)} 字节（整份外壳未载入上下文）`)
  return `MineDesign 编辑器外壳：${parts.join('，')}`
}

/** Top-level fields of a proxy response that are small and worth showing. */
const HTTP_FIELDS = ['status', 'statusCode', 'ok', 'method', 'url', 'contentType']

/** Ordered candidates for the proxy response body. */
const HTTP_BODY_FIELDS = ['body', 'text', 'content', 'data']

/**
 * `minedesign_http` → a proxied response, potentially huge.
 *
 * Only status-sized fields plus a clipped body are reported; the body is what
 * the caller asked for, so it is kept first and truncated, never dropped.
 *
 * @param {Record<string, unknown>} payload - structured content.
 * @returns {string | undefined} projection text.
 */
function projectHttp(payload) {
  /** @type {string[]} */
  const facts = []
  for (const key of HTTP_FIELDS) {
    const value = scalar(payload[key])
    if (value !== null) facts.push(`${key} ${value}`)
  }

  /** @type {string | null} */
  let body = null
  for (const key of HTTP_BODY_FIELDS) {
    const value = payload[key]
    if (typeof value === 'string') {
      body = value
      break
    }
    if (value !== null && typeof value === 'object') {
      body = compact(value, BODY_BYTES)
      break
    }
  }

  const head = facts.length === 0
    ? 'MineDesign 代理响应'
    : `MineDesign 代理响应：${facts.join('，')}`
  if (body === null) return `${head}\n${compact(payload)}`
  return `${head}\n正文（${String(bytesOf(body))} 字节）：${clip(body, BODY_BYTES)}`
}

/**
 * `minedesign_reload` → `{ documents }`.
 * @param {Record<string, unknown>} payload - structured content.
 * @returns {string | undefined} projection text.
 */
function projectReload(payload) {
  const documents = listOf(payload.documents)
  const lines = documentLines(documents)
  if (lines.length === 0) {
    return documents.length === 0
      ? 'MineDesign 重新加载：没有打开的作品'
      : 'MineDesign 重新加载：作品列表格式无法识别'
  }
  return [`MineDesign 重新加载：${String(lines.length)} 份作品`, ...lines].join('\n')
}

/**
 * `minedesign_update` → `{ ...update, settings }`. The update payload is not
 * pinned down upstream, so show it as compact JSON instead of guessing fields.
 * @param {Record<string, unknown>} payload - structured content.
 * @returns {string | undefined} projection text.
 */
function projectUpdate(payload) {
  return `MineDesign 更新：${compact(payload)}`
}

/** Tool name suffix (after {@link TOOL_PREFIX}) to projection. */
const PROJECTORS = {
  minedesign_open: projectOpen,
  minedesign_open_document: projectOpenDocument,
  minedesign_events: projectEvents,
  minedesign_annotations: projectAnnotations,
  minedesign_prepare_feedback: projectPrepareFeedback,
  minedesign_about: projectAbout,
  minedesign_settings: projectSettings,
  minedesign_shell: projectShell,
  minedesign_http: projectHttp,
  minedesign_reload: projectReload,
  minedesign_update: projectUpdate,
}

/* ------------------------------------------------------------------ */
/* entry point                                                         */
/* ------------------------------------------------------------------ */

/**
 * Project a MineDesign tool result into one model-visible text block.
 *
 * Returns `undefined` — meaning "leave the result exactly as it is" — for:
 * anything that is not a MineDesign tool, failed results (`isError`), results
 * without an object `structuredContent`, tools whose JSON text is already
 * visible, and unknown tools under the prefix.
 *
 * A failed result is never enriched: its own error text is the truth, and
 * papering over it would hide a real failure from the model.
 *
 * @param {{ name?: unknown, result?: unknown }} [input] - tool name and post-execute result.
 * @returns {{ type: 'text', text: string }[] | undefined} appended content, or undefined.
 */
export function enrichMineDesignResult(input) {
  try {
    const { name, result } = input ?? {}
    if (typeof name !== 'string' || !name.startsWith(TOOL_PREFIX)) return undefined
    if (result === null || typeof result !== 'object') return undefined

    const outcome = /** @type {{ isError?: unknown, value?: unknown }} */ (result)
    if (outcome.isError === true) return undefined

    const value = outcome.value
    if (value === null || typeof value !== 'object') return undefined
    const payload = /** @type {{ structuredContent?: unknown }} */ (value).structuredContent
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return undefined

    const suffix = name.slice(TOOL_PREFIX.length)
    if (LEFT_ALONE.has(suffix)) return undefined
    if (!Object.hasOwn(PROJECTORS, suffix)) return undefined

    /** @type {(payload: Record<string, unknown>) => string | undefined} */
    const project = PROJECTORS[/** @type {keyof typeof PROJECTORS} */ (suffix)]
    const body = project(/** @type {Record<string, unknown>} */ (payload))
    if (typeof body !== 'string' || body.trim() === '') return undefined

    return [{ type: 'text', text: clip(body, MAX_BYTES) }]
  } catch {
    // A projection must never break a tool call: any surprise means "leave it".
    return undefined
  }
}
