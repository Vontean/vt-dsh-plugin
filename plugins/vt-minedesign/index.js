/**
 * dsh-vt-minedesign — the composition root.
 *
 * This file only decides *what is registered, in what order, and with which
 * live readers*. Every behaviour lives one import away:
 *
 * | Concern | Module |
 * |---|---|
 * | configuration defaults | `src/config.js` |
 * | where MineDesign is and how to launch it | `src/install.js` |
 * | the two design skills, read in place | `src/skills.js` |
 * | model-visible projection of tool results | `src/projection.js` |
 * | the routing prompt text | `src/routing.js` |
 * | the `minedesign_status` tool and its hints | `src/status.js` |
 * | remembered editor sessions | `src/sessions.js` |
 * | the panel's HTTP face and snapshot | `src/panel.js` |
 * | the companion app process (the real UI) | `src/companion.js` |
 * | MCP Apps tool calls from that UI | `src/bridge.js` |
 * | "Send to chat" delivery into a session | `src/delivery.js` |
 * | process launcher for the MCP child | `bin/mdn-mcp.mjs` |
 *
 * Two invariants hold the design together:
 *
 * 1. **Host and browser talk through exactly one route** (`PANEL_ROUTE`): `GET`
 *    is the snapshot, `POST` is the App's tool bridge and its messages. Both
 *    halves change together or not at all.
 * 2. **Nothing here writes a user directory.** Skills are read in place, the
 *    companion is told what to open over HTTP, and state stays in memory.
 *
 * Runtime imports are Node built-ins plus this package's own modules: an
 * external plugin's host half must not depend on the harness module graph.
 *
 * @module dsh-vt-minedesign
 */

import { readFileSync } from 'node:fs'

import { createAppBridge } from './src/bridge.js'
import { createCompanion } from './src/companion.js'
import { normalizeConfig } from './src/config.js'
import { createDelivery } from './src/delivery.js'
import { resolveInstall } from './src/install.js'
import { createPanelSnapshot, createSessionRoute, PANEL_ROUTE } from './src/panel.js'
import { enrichMineDesignResult } from './src/projection.js'
import { routingText } from './src/routing.js'
import { createSessions } from './src/sessions.js'
import { listSkills, readSkill } from './src/skills.js'
import { createStatusProbe, createStatusTool } from './src/status.js'

/** Skill provider name; also the package name. */
const PROVIDER_NAME = 'dsh-vt-minedesign'

/** Prompt section name. The MCP client owns `tool:mcp:minedesign`; this one is prose. */
const SECTION_NAME = 'minedesign:routing'

/** Tools registered by the MCP client under `serverName: minedesign`. */
const TOOL_PREFIX = 'mcp__minedesign__'

/** Plugin version, read once so the panel can state it without a build step. */
const PLUGIN_VERSION = (() => {
  try {
    return JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
})()

export const name = PROVIDER_NAME

/** The prompt section is the only hard dependency; skills, tools and the web server are optional. */
export const inject = ['systemPrompt']

/**
 * Register everything this plugin contributes.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - cordis context.
 * @param {unknown} [config] - loader config (`src/config.js` lists the keys).
 */
export function apply(ctx, config) {
  const settings = normalizeConfig(config)
  const sessions = createSessions()

  // ── memoized discovery ──────────────────────────────────────────────
  // Both halves read the same two answers, and both can ask for a refresh;
  // memoizing here keeps that a property of the registration rather than of
  // each caller.
  /** @type {ReturnType<typeof resolveInstall> | null} */
  let resolved = null
  /** @type {any[] | null} */
  let catalog = null
  /** @type {{ invalidate: () => void } | null} */
  let registration = null

  /** @param {boolean} refresh - drop the memo. */
  function invalidate(refresh) {
    if (!refresh) return
    resolved = null
    catalog = null
    registration?.invalidate()
  }

  /** @param {boolean} refresh - drop the memo first. */
  function installOf(refresh) {
    invalidate(refresh)
    resolved ??= resolveInstall({
      workspace: settings.workspace ?? undefined,
      skillsDir: settings.skillsDir ?? undefined,
      launch: settings.launch ?? undefined,
    })
    return resolved
  }

  /** @param {boolean} refresh - drop the memo first. */
  function catalogOf(refresh) {
    invalidate(refresh)
    if (catalog === null) {
      const current = installOf(false)
      catalog = current.ok ? listSkills(current.install, { prefix: settings.skillPrefix }) : []
    }
    return catalog
  }

  /** MineDesign tools visible in this process. */
  function toolNames() {
    try {
      const registry = ctx.get('tools')
      if (registry === undefined || registry === null) return []
      return registry
        .schemas()
        .map((schema) => schema.name)
        .filter((toolName) => toolName.startsWith(TOOL_PREFIX))
        .sort()
    } catch {
      // The registry is not ready or not present: an empty list is honest.
      return []
    }
  }

  // ── the browser half's two dependencies ─────────────────────────────
  // Created eagerly, spawned lazily: a harness that never opens the panel pays
  // nothing for the companion process.
  const panelInstall = settings.panel ? installOf(false) : null
  const companion = panelInstall !== null && panelInstall.ok
    ? createCompanion({
        launch: panelInstall.install.launch,
        cli: panelInstall.install.cli,
        workspace: panelInstall.install.workspace,
      })
    : null
  const delivery = createDelivery({ resolveController: () => ctx.get('sessionController') })

  if (companion !== null) {
    ctx.effect(() => () => companion.dispose(), 'dsh-vt-minedesign: companion app')
  }

  // ── registrations ───────────────────────────────────────────────────
  if (settings.panel) {
    const bridge = companion === null ? undefined : createAppBridge({ companion, documents: () => sessions.list() })
    const snapshot = createPanelSnapshot({
      version: PLUGIN_VERSION,
      install: installOf,
      tools: toolNames,
      sessions,
      companion,
      delivery: delivery.state,
      options: { autoOpen: settings.autoOpen, entryButton: settings.entryButton },
    })

    // `webServer` is absent in a headless deployment: the panel never appears
    // there, and every other registration keeps working.
    ctx.inject(['webServer'], (webCtx) => {
      // The route's own `isTrusted` only fences Host/Origin, so any local process could
      // read the snapshot and POST a message into a session. Prefer the Host's
      // authoritative admission (`connection`), which also requires an authenticated
      // live Peer — the same check the sibling plugin routes use. Absent service (older
      // host, headless) keeps the fence only, so this never regresses to "nothing works".
      const admit = (request) => {
        const connection = webCtx.get('connection')
        if (connection === undefined || connection === null) return true
        return connection.requestRejection(request) === undefined
      }
      webCtx.effect(
        () =>
          webCtx.webServer.register(
            createSessionRoute({ snapshot, bridge, deliver: delivery.deliver, admit }),
          ),
        `dsh-vt-minedesign: ${PANEL_ROUTE}`,
      )
    })
  }

  if (settings.routing) {
    ctx.systemPrompt.section({
      name: SECTION_NAME,
      // The host's centrally allocated placement for MCP server guidance.
      order: ctx.systemPrompt.getSectionOrder('MCP_SERVERS'),
      // Model prose, not a template: `{{...}}` interpolation would rewrite the examples.
      interpolate: false,
      text: () => routingText(installOf(false), catalogOf(false)),
    })
  }

  if (settings.skills) {
    ctx.inject(['skills'], (skillCtx) => {
      skillCtx.skills.registerProvider((control) => {
        registration = control
        return {
          name: PROVIDER_NAME,
          list: () => Promise.resolve(catalogOf(false)),
          get: (candidate) => Promise.resolve(readSkill(candidate, { adapt: true })),
        }
      })
    })
  }

  ctx.inject(['tools'], (toolsCtx) => {
    const probe = createStatusProbe({
      install: installOf,
      skills: catalogOf,
      tools: toolNames,
      sessions: () => sessions.list(),
    })
    toolsCtx.tools.register(createStatusTool(probe))
  })

  if (settings.projection) {
    ctx.on('tools/post-execute', async (exec, result, next) => {
      const decision = await next()

      // Only a successful `accept` that projects `content` can carry an
      // addition: a `value` projection is exclusive with `content`, and a
      // blocked or failed call must keep the harness's own story.
      if (decision.kind !== 'accept' || exec.parent !== undefined || decision.value !== undefined) return decision

      // Remember (and mirror) whatever document this result announced. Non
      // document tools simply yield nothing.
      const opened = sessions.remember(result)
      if (companion !== null) {
        for (const session of opened) {
          void companion.open(session.path, session.kind).catch(() => false)
        }
      }

      const extra = enrichMineDesignResult({ name: exec.name, result })
      if (extra === undefined) return decision
      return {
        kind: 'accept',
        content: [...(decision.content ?? result.content ?? []), ...extra],
        ...decision.additionalContexts !== undefined ? { additionalContexts: decision.additionalContexts } : {},
      }
    })
  }
}
