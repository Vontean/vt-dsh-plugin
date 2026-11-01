/**
 * The editor sessions this host has seen opened.
 *
 * Both halves of the panel need this, and they need different slices of it: the
 * status tool lists sessions, the panel snapshot needs the most recent URL, the
 * app bridge needs paths, and the companion app needs to be told what to open.
 * They all read the same registry rather than re-parsing `structuredContent` at
 * each call site — that parsing, the recency order, and the bound are the
 * implementation this module hides.
 *
 * @module dsh-vt-minedesign/src/sessions
 */

/** Default bound: a long session must not grow without limit. */
const DEFAULT_LIMIT = 20

/**
 * @typedef {object} EditorSession
 * @property {string} id - MineDesign's document id (`hash(kind:path)`, stable across processes).
 * @property {string} path - document directory.
 * @property {string} kind - `design` or `design-system`.
 * @property {string} title - display title.
 * @property {string} editorUrl - the editor page for this session.
 * @property {string} [version] - document version at open time.
 * @property {string} [editorPath] - relay path, for `minedesign_events`.
 */

/**
 * Every document a tool result announced, in payload order.
 *
 * MineDesign returns `{ documents: [...] }` for `minedesign_open` and
 * `{ document: {...} }` for `minedesign_open_document`; both carry the same
 * record shape.
 *
 * @param {{ value?: unknown }} result - tool result.
 * @returns {Record<string, unknown>[]} raw document records, unusable ones dropped.
 */
function announcedDocuments(result) {
  const payload = result?.value?.structuredContent
  if (payload === null || typeof payload !== 'object') return []
  const records = []
  if (Array.isArray(payload.documents)) records.push(...payload.documents)
  if (payload.document !== null && typeof payload.document === 'object') records.push(payload.document)
  return records.filter((record) => record !== null && typeof record === 'object')
}

/**
 * Narrow one raw record into the session shape, or null when it has no address.
 * @param {Record<string, unknown>} record - raw document record.
 * @returns {EditorSession | null} session, or null when unusable.
 */
function toSession(record) {
  const editorUrl = typeof record.editorUrl === 'string' ? record.editorUrl : ''
  if (editorUrl === '') return null
  const id = typeof record.id === 'string' && record.id !== '' ? record.id : editorUrl
  return {
    id: typeof record.id === 'string' ? record.id : id,
    path: typeof record.path === 'string' ? record.path : '',
    kind: typeof record.kind === 'string' && record.kind !== '' ? record.kind : 'design',
    title: typeof record.title === 'string' ? record.title : '',
    editorUrl,
    ...typeof record.version === 'string' ? { version: record.version } : {},
    ...typeof record.editorPath === 'string' ? { editorPath: record.editorPath } : {},
  }
}

/**
 * Create the session registry for one plugin registration.
 *
 * @param {{ limit?: number }} [options] - bound on remembered sessions.
 * @returns {{
 *   remember: (result: { value?: unknown }) => EditorSession[],
 *   list: () => EditorSession[],
 *   activeUrl: () => string | null,
 * }} registry; `remember` returns the sessions it accepted so callers can mirror them.
 */
export function createSessions({ limit = DEFAULT_LIMIT } = {}) {
  /** @type {Map<string, EditorSession>} */
  const byId = new Map()

  return {
    remember(result) {
      /** @type {EditorSession[]} */
      const accepted = []
      for (const record of announcedDocuments(result)) {
        const session = toSession(record)
        if (session === null) continue
        // Re-inserting moves the entry to the end, which is what "most recent"
        // means to both the panel and the status tool.
        byId.delete(session.id)
        byId.set(session.id, session)
        accepted.push(session)
      }
      while (byId.size > limit) {
        const oldest = byId.keys().next()
        if (oldest.done === true) break
        byId.delete(oldest.value)
      }
      return accepted
    },

    list() {
      return [...byId.values()]
    },

    activeUrl() {
      const all = [...byId.values()]
      return all.length === 0 ? null : all[all.length - 1].editorUrl
    },
  }
}
