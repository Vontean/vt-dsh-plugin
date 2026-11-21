/**
 * GenUI plugin: teaches the model the ```dsh-ui fence syntax for emitting
 * declarative UI components inline in its reply. The browser half renders the
 * fence through GenuiBlock (ui-primitives); this host half only tells the
 * model the language exists, so a session without the plugin simply never
 * emits fences and nothing changes.
 *
 * The section uses the host's centrally allocated structured-output placement.
 * @module dsh-vt-gen-ui
 */

import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import type { SkillProvider } from '@deepseek-ai/dsh-skill'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRenderUiTool, createValidateDshUiTool } from './tool.ts'
import { installFenceFeedback } from './fence-feedback.ts'
import {
  componentListPrompt, composeSkillContent, fieldGotchaPrompt, fieldQuickRefPrompt, prototypeScreensPrompt,
  rulesPrompt,
} from '../shared/catalog/index.ts'

/* ---------------- lazy engine asset route ---------------- */

/**
 * The mermaid/three engines ship as standalone IIFE bundles under
 * `lib/assets/` and are fetched by the client ONLY when a spec needs them.
 * This route serves them from the plugin's own package directory through the
 * host webserver service — the longest-prefix rule lets it win over the
 * generic `/plugins` bundle route, and no host source change is needed. The
 * service is optional at this plugin's start time, so a dependency fiber owns
 * the registration and follows the webserver through late binding, replacement,
 * and plugin reloads.
 */

/** Route prefix under /plugins; anything under it is this plugin's asset. */
export const ASSET_ROUTE_PATH = '/plugins/dsh-vt-gen-ui/assets'

/** Safe flat file names only: no slashes, no traversal, js assets only. */
export const ASSET_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.js$/

/** One request's asset decision; status 200 carries the flat file to serve. */
export type AssetRequestDecision =
  | { readonly status: 200; readonly file: string }
  | { readonly status: 400 | 404 | 405 }

/**
 * Decide which asset file a request addresses.
 *
 * Pure on purpose: the routing rules (method, prefix, flat `.js`-only name,
 * traversal rejection) are the security surface of this route, so they are
 * testable without a server or build output.
 *
 * @param method - request method (only GET/HEAD are served).
 * @param rawUrl - raw request URL, decoded before matching.
 * @returns the file to serve, or the status the route answers.
 */
export function resolveAssetRequest(method: string | undefined, rawUrl: string | undefined): AssetRequestDecision {
  if (method !== 'GET' && method !== 'HEAD') return { status: 405 }
  let pathname: string
  try {
    pathname = decodeURIComponent(new URL(rawUrl ?? '/', 'http://x').pathname)
  } catch {
    return { status: 400 }
  }
  if (!pathname.startsWith(`${ASSET_ROUTE_PATH}/`)) return { status: 404 }
  const file = pathname.slice(ASSET_ROUTE_PATH.length + 1)
  return ASSET_FILE_RE.test(file) ? { status: 200, file } : { status: 404 }
}

/** Read one asset by flat file name from this package's lib/assets directory. */
function readPackageAsset(file: string): Promise<Buffer> {
  // lib/index.js → ./assets/ = <pkg>/lib/assets/ (the tsdown asset outDir).
  const dir = fileURLToPath(new URL('./assets/', import.meta.url))
  return readFile(join(dir, file))
}

/**
 * Build the asset route handler.
 *
 * The reader is injectable so the route's observable contract — status codes,
 * headers, and the missing-asset degradation — is testable without the
 * package's build output on disk.
 *
 * @param read - reads one flat asset file name.
 * @returns the HTTP handler registered on the host webserver.
 */
export function createAssetHandler(
  read: (file: string) => Promise<Buffer>,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    const decision = resolveAssetRequest(req.method, req.url)
    if (decision.status !== 200) {
      res.writeHead(decision.status)
      res.end()
      return
    }
    try {
      const body = await read(decision.file)
      res.writeHead(200, {
        'content-type': 'text/javascript; charset=utf-8',
        'cache-control': 'no-cache',
      })
      res.end(body)
    } catch {
      // Missing asset (old build) — a loud 404; the client shows its fallback.
      res.writeHead(404)
      res.end()
    }
  }
}

/** The handler itself (registered via the optional webServer probe). */
const serveGenuiAsset = createAssetHandler(readPackageAsset)

/** The fence language description injected into every assembled system prompt.
 *  Deliberately slim: the `genui` skill carries the full component→field
 *  mapping; this section keeps only the contract that must always be
 *  present (fence syntax, type whitelist, and critical behavioral rules).
 *
 *  `renderUiTool` is the section's only conditional input: it decides whether
 *  the `Rules:` block advertises the tool. The block itself comes from the
 *  catalog's derived `rulesPrompt`, so the prompt and SKILL.md render the same
 *  rules from one source (H8) — there is no second copy to strip here. */
export function genuiSectionText(renderUiTool = true): string {
  return `Render UI inside your reply with a fenced \`dsh-ui\` JSON block:

\`\`\`dsh-ui
{"title":"示例","gap":14,"items":[{"type":"text","content":"把这里换成你的组件"}]}
\`\`\`

Allowed \`type\` values; the \`genui\` skill, when available, carries the full content→component mapping and per-component field details:

${componentListPrompt()}

**默认就该出 UI**：出现下列情况至少出一个围栏：
- ≥3 条并列要点 → \`list\`；数字对比 → \`table\`；指标/进度/状态 → \`stat\`/\`progress\`/\`badge\`
- 步骤/时间线 → \`steps\`/\`timeline\`/\`mermaid\`；架构/流程 → \`diagram\` 或 \`mermaid\`；单条风险/结论摘要 → \`callout\`；代码/改动 → \`code\`/\`diff\`/\`json\`
- 行内富文本：支持公式、\`code\`、加粗、高亮、链接；禁用 Markdown table 与 fenced code，改用 table/code/diff/json。
- 默认无卡：卡片用于并排项、数据对象或需底色的风险清单。

**发回答前最后自检一次**：有没有 ≥3 条并列要点、任何对比、任何数字/指标、任何步骤或流程？有就先转成组件。**状态汇报、进度说明、提交与改动清单同样算**。
- 趋势/占比 → \`chart\`（≤8 点）或 \`echart\`；配色跟随主题，语义需要时才用 \`palette\`/\`card.accent\`；grid 子节点用 \`"span":2\` 做宽窄混排；数据多时给 \`table\`/\`list\` 配 \`input\`(id)+\`filter\` 就地筛选。
- 多组件回答先套 skill「编排范式」，别一行一个往下堆；章节分隔 \`divider\` 带 \`label\`。

${fieldQuickRefPrompt()}
**节点规则：** 组件节点必须带字符串 \`type\`，值为组件名；\`file-tree.items[].type\` 表示 \`file\` 或 \`dir\`。

${prototypeScreensPrompt()}

${fieldGotchaPrompt()}

${rulesPrompt({ renderUiTool })}`
}

/**
 * The tool-enabled rendering of the section, kept as a constant.
 *
 * It is the same string `genuiSectionText(true)` produces: the constant exists
 * so callers (and the registration contract test) that only need the default
 * form keep a stable export. Hosts that disable `render_ui` call
 * {@link genuiSectionText} with `false` instead of stripping a line.
 */
export const GENUI_SECTION_TEXT = genuiSectionText(true)

/**
 * Register the GenUI output-language section and the render_ui tool.
 * @param ctx - cordis context.
 */
// `tools` is intentionally NOT injected: the service is optional for this
// plugin — hosts without tool access keep the fence channel working. Cordis
// inject entries are hard requirements, so the registry is probed at runtime
// instead (see apply).
export const name = 'dsh-vt-gen-ui'
export const inject = ['systemPrompt']

const BUNDLED_SKILL_RANK = 600
const BUNDLED_SKILL_PROVIDER = 'dsh-vt-gen-ui'
const BUNDLED_SKILL_INVOCATION = { modelInvocable: true, userInvocable: true } as const

/**
 * The frontmatter field the routing description comes from.
 *
 * A second copy of this sentence in code drifted from SKILL.md unnoticed, and the
 * panel showed the code copy while the model read the same string — so an edit to
 * the skill's own frontmatter changed nothing. The file is the only source.
 */
function frontmatterField(front: string, key: string): string | undefined {
  const line = new RegExp('^\\s*' + key + '\\s*:\\s*(.+?)\\s*$', 'mu').exec(front)
  return line?.[1]?.replace(/^['"]|['"]$/gu, '')
}

/**
 * Skill content = the orchestration guide in SKILL.md + the generated field
 * reference. SKILL.md deliberately carries no hand-written field table anymore;
 * appending the catalog derivation keeps the skill complete while leaving one
 * definition source (issue: prompt/schema drift).
 */
export function composeGenuiSkillContent(skillBody: string): string {
  return composeSkillContent(skillBody)
}

/** Register through the provider path so source=bundled also gets bundled precedence. */
export function bundledSkillProvider(): SkillProvider {
  const moduleDirectory = dirname(fileURLToPath(new URL(import.meta.url)))
  const path = basename(moduleDirectory) === 'plugin'
    ? resolve(moduleDirectory, '../../SKILL.md')
    : resolve(moduleDirectory, '../SKILL.md')
  const raw = readFileSync(path, 'utf8')
  const end = raw.indexOf('\n---\n', 4)
  if (!raw.startsWith('---\n') || end < 0) throw new Error('genui SKILL.md has invalid frontmatter')
  const description = frontmatterField(raw.slice(4, end), 'description')
  if (description === undefined) throw new Error('genui SKILL.md frontmatter has no description')
  return {
    name: BUNDLED_SKILL_PROVIDER,
    list: () => Promise.resolve([{
      name: 'genui',
      description,
      invocation: BUNDLED_SKILL_INVOCATION,
      source: 'bundled',
      provider: BUNDLED_SKILL_PROVIDER,
      path,
      resourceBase: { kind: 'directory', path: dirname(path) },
      rank: BUNDLED_SKILL_RANK,
      locator: path,
    }]),
    get: () => Promise.resolve({
      name: 'genui',
      description,
      invocation: BUNDLED_SKILL_INVOCATION,
      source: 'bundled',
      provider: BUNDLED_SKILL_PROVIDER,
      path,
      resourceBase: { kind: 'directory', path: dirname(path) },
      content: composeGenuiSkillContent(raw.slice(end + 5)),
    }),
  }
}

/**
 * Plugin config as the host passes it (unvalidated: the node half deliberately
 * imports no schema library, so a profile can set these keys directly).
 */
export interface GenuiPluginConfig {
  /**
   * 在最终 dsh-ui 围栏无法渲染的回合中请求模型发送一次修正版（issue #160）。
   * 默认开启，设置为 false 可以关闭同回合围栏修正。GenUI 回合的 reasoning-only 响应仍会交给宿主重试策略处理。
   * 每回合和每个围栏正文最多请求一次，子代理不触发，每次修正请求会消耗模型步数。
   */
  fenceFeedback?: boolean

  /**
   * 是否注册 render_ui 模型工具。默认开启，设置为 false 时关闭；不影响 validate_dsh_ui 和 dsh-ui 围栏渲染。
   */
  renderUiTool?: boolean
}

export function apply(ctx: Context, config?: GenuiPluginConfig): void {
  const renderUiToolEnabled = config?.renderUiTool !== false
  ctx.systemPrompt.section({
    name: 'genui:fence',
    order: ctx.systemPrompt.getSectionOrder('STRUCTURED_OUTPUT'),
    text: genuiSectionText(renderUiToolEnabled),
  })
  installFenceFeedback(ctx, config?.fenceFeedback !== false, renderUiToolEnabled)
  // Hosts without tool access keep the fence channel. The dependency fiber
  // starts whenever tools becomes available and unloads its registrations
  // before either the service or this plugin is replaced.
  ctx.inject(['tools'], (toolsCtx) => {
    toolsCtx.effect(function* () {
      if (renderUiToolEnabled) {
        yield toolsCtx.tools.register(createRenderUiTool())
      }
      yield toolsCtx.tools.register(createValidateDshUiTool())
    }, 'dsh-genui: model tools')
  })

  ctx.inject(['skills'], (skillCtx) => {
    skillCtx.skills.registerProvider(() => bundledSkillProvider())
  })

  // webServer.register returns a raw disposer, so an explicit effect binds the
  // route to the dependency fiber instead of leaving it in the host route table.
  ctx.inject(['webServer'], (webCtx) => {
    const webServer = webCtx.reflect.get('webServer') as { register(route: unknown): () => void }
    webCtx.effect(
      () => webServer.register({ kind: 'prefix', path: ASSET_ROUTE_PATH, handler: serveGenuiAsset }),
      'dsh-genui: asset route',
    )
  })
}
