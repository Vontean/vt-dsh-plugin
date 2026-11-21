#!/usr/bin/env node
/**
 * 几何审计：用本机 Chrome（与 shot.sh 同一份）真实排版，检查视觉规则是否成立。
 *
 * 为什么必须在 Chrome 里跑：vitest 跑 jsdom，jsdom 没有排版引擎，
 * `getBoundingClientRect()` 恒为 0，几何断言在单测里永远“通过”。
 *
 * 版本说明：本文件的首个提交（`a2f339c`）**含口径上调，不止分层** ——
 * 除了把审计对象从手写页换到 runtime 页，还加了 `padding-not-G`（四向 padding
 * 严格 = G）与 `spacing-not-whitelist`（§14 G9）两条新判定。提交描述只写了分层，
 * 这里补记，便于回溯那次是什么变了。历史不改写。
 *
 * 审计对象按 §12.6 分层：手写探针（`structures.html`、
 * `prototype.html`）表达的是设计意图，不经过渲染器，量它等于量画师的简化画法，
 * 抓不到组件的真实输出（图标字段有没有 svg、页面框有没有真的贴住内容）。
 * 手写页只在“结构不变量”类断言落地后才有用武之地；当前四条都是渲染产物类，
 * 因此对手写页直接跳过并说明原因，不拿画法当实现结论。
 *
 * 四条断言：
 *   A. padding-not-G（§12.3 / §14 G1–G6）：
 *      `pageBody` 的 computed padding 四向必须**严格等于** G（宽容器 24，页面框宽 ≤600 时 16）。
 *      不是「> 0」：只抓贴边抓不到「写了 20 / 32」这种错值。G 由页面框宽度算出，
 *      不读 `--proto-gutter`，否则等于拿变量校验自己。
 *      距离同时逐面量并记录（`gaps`），作为 G1/G2/G4/G5 的观测形态与「量过」的证据。
 *      距离 ≤ 0 时，该元素必须显式声明对应的 `data-bleed` 方向
 *      （top→block-start、bottom→block-end、左右→inline），否则判 content-touches-frame。
 *      豁免因此有据可查，而不是审计替实现解释「它碰巧是首元素」。
 *   D. spacing-not-whitelist（§14 G9）：页面框子树内 margin / padding 计算值
 *      必须 ∈ {0,4,8,12,16,24}；负值只允许贴边抵消用的 -16 / -24（§12.3）。
 *   B. double-line（§14 L1）：任意两个元素的边框落在同一坐标（±1px）且线段重叠
 *      超过 1px → 同一位置画了两条线。不看 DOM 亲缘关系：视觉上贴在一起就是贴在一起。
 *   C. icon-not-svg：图标字段（`media` / `icon` 槽位）必须渲染成 <svg>。
 *      渲染成文字或空占位都算违规 —— 这就是「图标被当文字渲染」那类真实故障。
 *
 * 用法：
 *   node tools/visual/audit-geometry.mjs                  # 默认三个 runtime 页
 *   node tools/visual/audit-geometry.mjs verify5          # 指定 fixture
 *   node tools/visual/audit-geometry.mjs structures       # 手写页：无适用断言
 *   node tools/visual/audit-geometry.mjs --json           # 机器可读
 *
 * 退出码：0 无违规；1 有违规；2 环境/启动失败。
 */
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/**
 * fixture 登记表。`kind` 决定选择器与适用的断言集合：
 * - `runtime`：走 `standalone-runtime.js` 真渲染，DOM 由组件决定，能测实现；
 * - `sketch`：手写静态页，表达设计意图，三条断言都不适用（§12.6）。
 */
const FIXTURES = {
  'verify-structures': { kind: 'runtime' },
  verify5: { kind: 'runtime' },
  'verify-geometry': { kind: 'runtime' },
  structures: { kind: 'sketch' },
  prototype: { kind: 'sketch' },
}
const DEFAULT_PAGES = ['verify-structures', 'verify5', 'verify-geometry', 'structures', 'prototype']

/** 三类检查共用的选择器；按 `kind` 切换，不在断言逻辑里写死类名。 */
const SELECTORS = {
  runtime: {
    page: '[data-genui="page"]',
    body: ':scope > [data-page-body]',
    children: ':scope > [data-page-body] > *',
    screenChrome: '[data-genui-page-frame]', // §12.4 的屏幕外框与角标
    // 三个图标字段（media / nav-icon / empty-icon）都带语义标记，
    // `data-genui-icon-name` 记着被判定的原始值，判定因此不需要字段白名单。
    iconSlots: ['[data-genui-icon-field]'],
  },
  sketch: {
    page: '.pr-page',
    body: ':scope > .pr-page-body',
    children: ':scope > .pr-page-body > *',
    screenChrome: '.pr-frame, .pr-frame-label', // 手写页的屏幕外框与角标
    iconSlots: ['[class*="__media"]', '[class*="__icon"]'],
  },
}

/**
 * 断言按类分档（§12.6）：
 * - 渲染产物类（内容贴框、真实叠线、图标字形、间距取值）：手写页没有实现，
 *   量它等于给设计意图打分 → 只跑 runtime 页，并决定退出码。
 * - 结构不变量类（pageBody padding = G）：两种页都成立 → 手写页也跑，
 *   它的发现记为 fixture 缺口，不进退出码。
 */
const RULES_BY_KIND = {
  runtime: ['padding-not-G', 'content-touches-frame', 'double-line', 'icon-not-svg', 'spacing-not-whitelist'],
  sketch: ['padding-not-G'],
}

/**
 * 图标目录：两半都要，缺一半判定会静默失效。
 * - `lib/assets/icons.js`：按需下载的字形（已构建资产）。
 * - `src/client/icons/icon-names-full.ts`：全部规范名，其中 64 个是随包内联的，
 *   它们**不在** icons.js 里。只读 assets 会把内联名（`Cube` 就是一个）当成“目录外”，
 *   于是「已知名却没出字形」被判成「目录外，允许文字」——真故障不再报警。
 * 目录外的值（头像首字「王」、emoji）按设计允许保持文字。
 */
const ICON_ASSET = join(ROOT, 'lib/assets/icons.js')
const ICON_NAMES = join(ROOT, 'src/client/icons/icon-names-full.ts')
const ICON_CATALOGUE = (() => {
  if (!existsSync(ICON_ASSET) || !existsSync(ICON_NAMES)) return null
  const names = new Set()
  for (const match of readFileSync(ICON_ASSET, 'utf8').matchAll(/[,{]([A-Za-z][A-Za-z0-9_]*):\{viewBox:/g)) {
    names.add(match[1])
  }
  const declared = /ICON_NAMES_FULL[^=]*=\s*\[([^\]]*)\]/.exec(readFileSync(ICON_NAMES, 'utf8'))
  if (declared !== null) for (const match of declared[1].matchAll(/"([^"]+)"/g)) names.add(match[1])
  return [...names]
})()

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const pages = args.filter(arg => !arg.startsWith('--'))
const targets = pages.length > 0 ? pages : DEFAULT_PAGES

/* ------------------------------------------------------------------ */
/* Page-side audit: runs inside Chrome, returns a plain JSON report.    */
/* ------------------------------------------------------------------ */

/**
 * 四条断言的页面侧逻辑。故意写成自包含函数（被序列化进页面执行），
 * 除入参外不引用任何外部状态。
 * @param {{ kind: 'runtime' | 'sketch', selectors: object }} config
 */
function auditInPage(config) {
  const TOL = 1 // 判定“同一坐标/贴着”的容差（px）
  const violations = []
  // 未验证的新判定走 warning 通道：只报警，不进退出码。
  // 一条规则要先有「它红过、而红是对的」的记录，才有资格阻断别人。
  const warnings = []
  const notes = []
  const gaps = [] // 每一面的实测间距，用于证明断言量过而不是空跑
  const sel = config.selectors
  // 规则集从驱动侧传入（JSON 不能带 Set），页面内再还原成 Set。
  const rules = new Set(config.rules ?? [])
  const runs = rule => rules.has(rule)

  const rectOf = el => el.getBoundingClientRect()
  const styleOf = el => getComputedStyle(el)
  const num = value => {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  const visible = el => {
    const style = styleOf(el)
    if (style.display === 'none' || style.visibility === 'hidden' || num(style.opacity) === 0) return false
    const rect = rectOf(el)
    return rect.width > 0 && rect.height > 0
  }
  const label = el => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).join('.') : ''
    const type = el.getAttribute('data-genui') ?? ''
    const tag = el.tagName.toLowerCase()
    const name = cls === '' ? tag : `${tag}.${cls}`
    return type === '' ? name : `${name}[${type}]`
  }
  const round = value => Math.round(value * 10) / 10
  // `data-bleed` 是**方向声明**（空格分隔的 token 列表），不是布尔。
  // 每个 0 都必须有一个针对该边的声明支撑：top 认 block-start、bottom 认 block-end、
  // 左右认 inline（也接受 inline-start / inline-end）。没有声明却贴在框上 → 违规。
  const SIDE_DECLARATION = {
    top: ['block-start'],
    bottom: ['block-end'],
    left: ['inline', 'inline-start'],
    right: ['inline', 'inline-end'],
  }
  const declares = (el, side) => {
    const value = el.getAttribute('data-bleed')
    if (value === null || value === 'false') return false
    const tokens = value.split(/\s+/).filter(Boolean)
    return SIDE_DECLARATION[side].some(token => tokens.includes(token))
  }

  /* ---- A. pageBody 四向 padding === G（§12.3 / §14 G1–G6） ---- */
  // G 只由页面框自身宽度算，不读 --proto-gutter：拿 CSS 变量校验 CSS 变量等于自己验自己。
  const gutterFor = width => (width <= 600 ? 16 : 24)
  const PADDING_SIDES = [
    ['top', 'paddingTop', '上'],
    ['right', 'paddingRight', '右'],
    ['bottom', 'paddingBottom', '下'],
    ['left', 'paddingLeft', '左'],
  ]
  let bodies = 0
  const skips = []
  for (const page of document.querySelectorAll(sel.page)) {
    if (!visible(page)) continue
    const frameStyle = styleOf(page)
    const frame = rectOf(page)
    const inner = {
      left: frame.left + num(frameStyle.borderLeftWidth),
      right: frame.right - num(frameStyle.borderRightWidth),
      top: frame.top + num(frameStyle.borderTopWidth),
      bottom: frame.bottom - num(frameStyle.borderBottomWidth),
    }
    const body = page.querySelector(sel.body)
    if (body === null) {
      // 没有 pageBody 就量不到页面级留白：记为覆盖缺口，不当违规。
      skips.push({ page: label(page), reason: 'no-page-body' })
      continue
    }
    if (!visible(body)) {
      skips.push({ page: label(page), reason: 'body-not-visible' })
      continue
    }
    bodies++

    const width = round(frame.width)
    const G = gutterFor(width)
    const bodyStyle = styleOf(body)
    const padding = {}
    const bad = []
    for (const [side, prop, name] of PADDING_SIDES) {
      const value = round(num(bodyStyle[prop]))
      padding[side] = value
      // 0.1px 只是百分比 padding 被布局取整时的余量，不是放宽阈值。
      if (Math.abs(value - G) > 0.1) bad.push({ side, name, value })
    }
    if (bad.length > 0 && runs('padding-not-G')) {
      warnings.push({
        rule: 'padding-not-G',
        target: label(page),
        detail: `pageBody padding ${bad
          .map(entry => `${entry.name} ${entry.value}px`)
          .join('、')}（要求四向都 = ${G}；页面宽 ${width}px）`,
        geometry: { pageWidth: width, G, padding, badSides: bad.map(entry => entry.side) },
      })
    }

    // 距离仍然量并记录：它是 G1/G2/G4/G5 的观测形态，也是「零违规证明量过」的证据。
    // 贴边方向（data-bleed / G3–G5）的距离本来就是 0，只记豁免、不判违规。
    // 定位元素（模态浮层）不参与流式排版：§14 G12 要求浮层四边贴齐页面内框。
    const children = [...body.children].filter(
      child => visible(child) && styleOf(child).position === 'static',
    )
    if (children.length === 0) continue

    // 四边都量，不因为“它是首/末元素”就跳过：跳过等于替实现找理由。
    // 距离 ≤ 0 时再看该元素有没有声明对应的贴边方向；有声明才算设计如此（G3–G5），
    // 没有声明就贴在框上 → 违规，不管它碰巧是不是首/末元素。
    const lastChild = children[children.length - 1]
    const leftMost = children.reduce((a, b) => (rectOf(a).left <= rectOf(b).left ? a : b))
    const rightMost = children.reduce((a, b) => (rectOf(a).right >= rectOf(b).right ? a : b))
    const sides = [
      { side: 'top', gap: rectOf(children[0]).top - inner.top, who: children[0] },
      { side: 'bottom', gap: inner.bottom - rectOf(lastChild).bottom, who: lastChild },
      { side: 'left', gap: rectOf(leftMost).left - inner.left, who: leftMost },
      { side: 'right', gap: inner.right - rectOf(rightMost).right, who: rightMost },
    ]

    for (const { side, gap, who } of sides) {
      gaps.push({ page: label(page), side, gap: round(gap), who: label(who) })
      if (gap > 0) continue
      if (declares(who, side)) {
        notes.push(
          `A 允许 ${side}=${round(gap)}px：${label(who)} 声明 data-bleed 含 ${SIDE_DECLARATION[side][0]}`,
        )
        continue
      }
      if (!runs('content-touches-frame')) continue
      violations.push({
        rule: 'content-touches-frame',
        target: label(page),
        detail: `${side} 边：最近内容 ${label(who)} 距框内沿 ${round(gap)}px，且未声明对应 data-bleed`,
        geometry: { side, gap: round(gap), inner, content: rectOf(who) },
      })
    }
  }

  /* ---- B. 同一坐标不叠两条线 ---- */
  const bordered = [...document.querySelectorAll('body *')].filter(el => {
    if (!visible(el)) return false
    const style = styleOf(el)
    return ['Top', 'Right', 'Bottom', 'Left'].some(side => {
      const width = num(style[`border${side}Width`])
      const kind = style[`border${side}Style`]
      return width > 0 && kind !== 'none'
    })
  })

  const edgesOf = el => {
    const rect = rectOf(el)
    const style = styleOf(el)
    const edges = []
    if (num(style.borderLeftWidth) > 0 && style.borderLeftStyle !== 'none') {
      edges.push({ orientation: 'v', coord: rect.left, from: rect.top, to: rect.bottom })
    }
    if (num(style.borderRightWidth) > 0 && style.borderRightStyle !== 'none') {
      edges.push({ orientation: 'v', coord: rect.right, from: rect.top, to: rect.bottom })
    }
    if (num(style.borderTopWidth) > 0 && style.borderTopStyle !== 'none') {
      edges.push({ orientation: 'h', coord: rect.top, from: rect.left, to: rect.right })
    }
    if (num(style.borderBottomWidth) > 0 && style.borderBottomStyle !== 'none') {
      edges.push({ orientation: 'h', coord: rect.bottom, from: rect.left, to: rect.right })
    }
    return edges
  }

  // 不看亲缘关系：两条线落在同一坐标就是同一位置画了两条线，中间隔着一层 DOM 也一样。
  for (let i = 0; i < bordered.length && runs('double-line'); i++) {
    for (let j = i + 1; j < bordered.length; j++) {
      const a = bordered[i]
      const b = bordered[j]
      for (const edgeA of edgesOf(a)) {
        for (const edgeB of edgesOf(b)) {
          if (edgeA.orientation !== edgeB.orientation) continue
          if (Math.abs(edgeA.coord - edgeB.coord) > TOL) continue
          const overlap = Math.min(edgeA.to, edgeB.to) - Math.max(edgeA.from, edgeB.from)
          if (overlap <= TOL) continue // 只擦到角不算叠线
          violations.push({
            rule: 'double-line',
            target: `${label(a)} ↔ ${label(b)}`,
            detail: `${edgeA.orientation === 'v' ? '竖线' : '横线'} ${
              edgeA.orientation === 'v' ? 'x' : 'y'
            }=${round((edgeA.coord + edgeB.coord) / 2)} 重叠 ${round(overlap)}px`,
            geometry: { a: edgeA, b: edgeB, overlap: round(overlap) },
          })
        }
      }
    }
  }

  /* ---- C. 图标字段：目录内必须是 svg，目录外允许文字 ---- */
  const knownIcons = new Set(config.iconCatalogue ?? [])
  const iconFields = runs('icon-not-svg')
    ? [...document.querySelectorAll(sel.iconSlots.join(', '))].filter(el => {
        if (!visible(el)) return false
        // 骨架屏的占位块不是图标槽位：它按设计就是一块灰底，不该有 svg。
        return !/skel/i.test(String(el.className ?? ''))
      })
    : []
  let iconKnown = 0
  let iconKnownSvg = 0
  let iconUnknown = 0
  for (const field of iconFields) {
    const svg = field.querySelector('svg') ?? (field.tagName.toLowerCase() === 'svg' ? field : null)
    const text = (field.textContent ?? '').trim()
    const name = field.getAttribute('data-genui-icon-name')
    if (name === null || !knownIcons.has(name)) iconUnknown++
    else {
      iconKnown++
      if (svg !== null) iconKnownSvg++
    }
    if (svg !== null) continue
    if (name !== null) {
      // 语义判定：目录里的名字必须画成字形；头像首字、emoji 这类目录外的值
      // 允许保持文字，不需要为它们写字例。
      if (!knownIcons.has(name)) continue
      violations.push({
        rule: 'icon-not-svg',
        target: label(field),
        detail: `name「${name}」是目录图标，却渲染成${text === '' ? '空元素' : `文字「${text.slice(0, 24)}」`}`,
        geometry: { rect: (({ left, top, width, height }) => ({ left, top, width, height }))(rectOf(field)) },
      })
      continue
    }
    // 没有语义标记的旧槽位（手写页）：空占位或文字都算没画图标。
    violations.push({
      rule: 'icon-not-svg',
      target: label(field),
      detail: text === '' ? '空元素：没有 svg' : `渲染成文字：「${text.slice(0, 24)}」`,
      geometry: { rect: (({ left, top, width, height }) => ({ left, top, width, height }))(rectOf(field)) },
    })
  }

  // 图标断言的自证：目录内的名字有几个真的画出了 svg，目录外有几个按设计保留文字。
  // 手写页不跑这条（它没有实现），所以也只有 runtime 页打这行。
  if (runs('icon-not-svg')) {
    notes.push(
      `C 图标槽 ${iconFields.length}：目录内 ${iconKnown}（有 svg ${iconKnownSvg}）、目录外 ${iconUnknown}（允许文字）`,
    )
  }

  /* ---- D. 间距白名单（§14 G9） ---- */
  const SPACING = new Set([0, 4, 8, 12, 16, 24])
  // §12.3 的 data-bleed 用负 margin 抵消 gutter，而 §14 G9 的白名单里没有负值；
  // 这里按「贴边抵消」放行 -16 / -24，其余负值仍算违规。
  const NEGATIVE_BLEED = new Set([-16, -24])
  const SPACING_PROPS = [
    ['paddingTop', 'padding-top'],
    ['paddingRight', 'padding-right'],
    ['paddingBottom', 'padding-bottom'],
    ['paddingLeft', 'padding-left'],
    ['marginTop', 'margin-top'],
    ['marginRight', 'margin-right'],
    ['marginBottom', 'margin-bottom'],
    ['marginLeft', 'margin-left'],
  ]
  let styled = 0
  const spacingSeen = new Set()
  for (const root of runs('spacing-not-whitelist') ? document.querySelectorAll(sel.page) : []) {
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (!visible(el)) continue
      // §12.4 的「屏幕」层（虚线外框 + 角标）不是原型内容：外框的 9px 是给角标让位、
      // 角标的 6px 是它自身内边距，都不属于 §4.3 的间距取值。
      // 只有它确实是当前页面框的后代时才排除——顶层页面的外框是它的祖先，不能连内容一起排除。
      const screenChrome = el.closest(sel.screenChrome)
      if (screenChrome !== null && screenChrome !== root && root.contains(screenChrome)) continue
      // 无障碍隐藏（sr-only）用 `margin:-1px` + 1×1 裁剪把文本移出视口，不是间距取值。
      const visuallyHidden = /visuallyHidden|sr-only|srOnly|screenReader/i.test(
        String(el.className ?? ''),
      )
      if (visuallyHidden) continue
      styled++
      const style = styleOf(el)
      for (const [prop, cssName] of SPACING_PROPS) {
        const raw = style[prop]
        const value = round(num(raw))
        spacingSeen.add(value)
        if (SPACING.has(value) || NEGATIVE_BLEED.has(value)) continue
        warnings.push({
          rule: 'spacing-not-whitelist',
          target: label(el),
          detail: `${cssName} = ${raw}（要求 ∈ {0,4,8,12,16,24}，负值仅允许 -16/-24）`,
          geometry: { page: label(root), prop: cssName, value },
        })
      }
    }
  }

  return {
    url: location.href,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    counts: {
      pages: document.querySelectorAll(sel.page).length,
      bordered: bordered.length,
      bodies,
      skipped: skips.length,
      styled,
      iconFields: iconFields.length,
      sidesMeasured: gaps.length,
    },
    gaps,
    skips,
    notes,
    spacingSeen: [...spacingSeen].sort((a, b) => a - b),
    warnings,
    violations,
  }
}

/* ------------------------------------------------------------------ */
/* CDP plumbing (Node 22 has fetch + WebSocket; no dependencies).       */
/* ------------------------------------------------------------------ */

/** One Chrome page driven over DevTools Protocol. */
class ChromePage {
  #ws
  #id = 0
  #pending = new Map()

  static async open(chrome, url, profileDir) {
    const child = spawn(chrome, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
      '--allow-file-access-from-files',
      '--window-size=1280,2000',
      `--user-data-dir=${profileDir}`,
      '--remote-debugging-port=0',
      url,
    ], { stdio: ['ignore', 'ignore', 'pipe'] })

    const page = new ChromePage()
    page.#child = child
    const wsUrl = await page.#waitForDevtools(child)
    // ws://127.0.0.1:PORT/devtools/browser/<id> → http://127.0.0.1:PORT/json/list
    const listUrl = wsUrl.replace(/^ws:/, 'http:').replace(/\/devtools\/browser\/.*$/, '/json/list')
    const target = await page.#waitForPageTarget(listUrl)
    await page.#connect(target.webSocketDebuggerUrl)
    return page
  }

  #child

  #waitForDevtools(child) {
    return new Promise((resolvePromise, rejectPromise) => {
      let buffer = ''
      const timer = setTimeout(() => rejectPromise(new Error('Chrome 没有在 20s 内报告 DevTools 端口')), 20_000)
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', chunk => {
        buffer += chunk
        const match = /DevTools listening on (ws:\/\/\S+)/.exec(buffer)
        if (match === null) return
        clearTimeout(timer)
        resolvePromise(match[1])
      })
      child.on('exit', code => {
        clearTimeout(timer)
        rejectPromise(new Error(`Chrome 提前退出（code ${code}）`))
      })
    })
  }

  async #waitForPageTarget(listUrl) {
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const targets = await (await fetch(listUrl)).json()
        const page = targets.find(entry => entry.type === 'page' && typeof entry.webSocketDebuggerUrl === 'string')
        if (page !== undefined) return page
      } catch {
        // DevTools 端点还没起来，继续等
      }
      await new Promise(r => setTimeout(r, 100))
    }
    throw new Error('找不到可连接的 page target')
  }

  #connect(url) {
    return new Promise((resolvePromise, rejectPromise) => {
      const ws = new WebSocket(url)
      this.#ws = ws
      ws.addEventListener('open', () => resolvePromise())
      ws.addEventListener('error', event => rejectPromise(new Error(`CDP 连接失败：${event.message ?? 'unknown'}`)))
      ws.addEventListener('message', event => {
        const message = JSON.parse(String(event.data))
        if (typeof message.id !== 'number') return // event, not a response
        const pending = this.#pending.get(message.id)
        if (pending === undefined) return
        this.#pending.delete(message.id)
        if (message.error === undefined) pending.resolve(message.result)
        else pending.reject(new Error(message.error.message))
      })
    })
  }

  send(method, params = {}) {
    const id = ++this.#id
    return new Promise((resolvePromise, rejectPromise) => {
      this.#pending.set(id, { resolve: resolvePromise, reject: rejectPromise })
      this.#ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails !== undefined) {
      const details = result.exceptionDetails
      const reason = details.exception?.description ?? details.exception?.value ?? details.text
      throw new Error(`页面内审计抛错：${reason}`)
    }
    return result.result.value
  }

  async waitForLayout() {
    for (let attempt = 0; attempt < 200; attempt++) {
      const state = await this.evaluate('document.readyState')
      if (state === 'complete') {
        // 两帧之后再测量，等字体/图片与容器查询稳定。
        await this.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))')
        return
      }
      await new Promise(r => setTimeout(r, 50))
    }
    throw new Error('页面在 10s 内没有加载完成')
  }

  close() {
    try {
      this.#ws?.close()
    } catch {
      // 忽略关闭期错误
    }
    this.#child?.kill('SIGKILL')
  }
}

/* ------------------------------------------------------------------ */
/* Driver                                                              */
/* ------------------------------------------------------------------ */

if (!existsSync(CHROME)) {
  console.error(`找不到 Chrome：${CHROME}`)
  process.exit(2)
}

/* ---- 产物指纹：整轮审计必须跑在同一份构建产物上 ---- */
// 今天 64 条假红全部出在被替换掉的旧构建上：审计若不能自证「量的是哪份产物」，
// 任何人拿到的数都不可复核。所以运行前后各取一次 size + mtime，不一致即环境失败。
// 只在开头查一次不够：另一个构建可能在测量中途替换产物。
const PRODUCTS = ['lib/client.js', 'lib/index.js'].map(rel => join(ROOT, rel))

const readProducts = () => {
  const entries = []
  for (const file of PRODUCTS) {
    if (!existsSync(file)) return { missing: relative(ROOT, file), entries }
    const stat = statSync(file)
    entries.push({
      file: relative(ROOT, file),
      size: stat.size,
      mtime: new Date(stat.mtimeMs).toISOString(),
      mtimeMs: stat.mtimeMs,
    })
  }
  return { missing: null, entries }
}

const productsBefore = readProducts()
if (productsBefore.missing !== null) {
  console.error(`缺构建产物：${productsBefore.missing}（先 pnpm build 再审计）`)
  process.exit(2)
}

const reports = []
let failed = false

for (const page of targets) {
  const fixture = FIXTURES[page]
  if (fixture === undefined) {
    console.error(`未知 fixture：${page}（可用：${Object.keys(FIXTURES).join(' / ')}）`)
    process.exit(2)
  }
  const file = join(ROOT, 'tools/visual', `${page}.html`)
  if (!existsSync(file)) {
    // 别人 checkout 时可能没有某个探针：跳过并说明原因，不让整次审计崩掉（否则进不了 CI）。
    reports.push({
      page,
      kind: fixture.kind,
      skipped: `fixture 不存在：${file}`,
      counts: { pages: 0, bodies: 0, skipped: 0, bordered: 0, iconFields: 0, styled: 0 },
      gaps: [],
      notes: [],
      violations: [],
    })
    continue
  }
  const profileDir = await mkdtemp(join(tmpdir(), 'vt-geometry-'))
  const url = `file://${file}?theme=light`
  const driver = await ChromePage.open(CHROME, url, profileDir)
  try {
    await driver.waitForLayout()
    const report = await driver.evaluate(
      `(${auditInPage.toString()})(${JSON.stringify({
        kind: fixture.kind,
        selectors: SELECTORS[fixture.kind],
        iconCatalogue: ICON_CATALOGUE,
        rules: RULES_BY_KIND[fixture.kind],
      })})`,
    )
    if (fixture.kind === 'runtime') {
      // runtime 页没有 pageBody 是实现的缺陷（页面必须有自己的内容区），不是探针问题。
      for (const skip of report.skips ?? []) {
        report.violations.push({
          rule: 'no-page-body',
          target: skip.page,
          detail: `页面没有内容区（${skip.reason}）`,
        })
      }
    }
    reports.push({ page, kind: fixture.kind, ...report })
    // 退出码只由「实现违规」决定：手写页的发现是 fixture 缺口，不能把默认跑变成噪声。
    if (fixture.kind === 'runtime' && report.violations.length > 0) failed = true
  } finally {
    driver.close()
    await rm(profileDir, { recursive: true, force: true })
  }
}

/* ---- 运行后再取一次：测量期间产物被换掉，这一轮的数字全部作废 ---- */
const productsAfter = readProducts()
const drifted = []
if (productsAfter.missing !== null) {
  drifted.push({ missing: productsAfter.missing })
} else {
  for (let index = 0; index < productsBefore.entries.length; index++) {
    const before = productsBefore.entries[index]
    const after = productsAfter.entries[index]
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) drifted.push({ before, after })
  }
}
if (drifted.length > 0) {
  console.error('审计期间构建产物被替换，本次数字作废（exit 2）')
  for (const drift of drifted) {
    if (drift.missing !== undefined) {
      console.error(`  ${drift.missing}：运行后消失`)
      continue
    }
    console.error(`  ${drift.before.file}`)
    console.error(`    运行前 size=${drift.before.size} mtime=${drift.before.mtime}（mtimeMs=${drift.before.mtimeMs}）`)
    console.error(`    运行后 size=${drift.after.size} mtime=${drift.after.mtime}（mtimeMs=${drift.after.mtimeMs}）`)
  }
  process.exit(2)
}
const fingerprintLine = `产物指纹一致：${productsBefore.entries
  .map(entry => `${entry.file} ${entry.size}B @ ${entry.mtime}`)
  .join('，')}`

if (asJson) {
  // stdout 留给 JSON，环境信息走 stderr。
  console.error(fingerprintLine)
  console.log(JSON.stringify(reports, null, 2))
} else {
  console.log(fingerprintLine)
  const render = report => {
    const { page, counts, violations, warnings, notes, skipped } = report
    if (skipped !== undefined) {
      console.log(`· ${page}：跳过 —— ${skipped}`)
      return
    }
    console.log(
      `· ${page}：pages=${counts.pages} bodies=${counts.bodies} skipped=${counts.skipped} bordered=${counts.bordered} iconFields=${counts.iconFields} styled=${counts.styled}`,
    )
    for (const skip of report.skips ?? []) {
      console.log(`  - 缺口 ${skip.page}：${skip.reason}`)
    }
    // 量过的面数与最小间距一起打出来：零违规要能区分“真的合格”与“没量到”。
    const measured = report.gaps ?? []
    if (measured.length > 0) {
      const minGap = measured.reduce((min, entry) => (entry.gap < min.gap ? entry : min))
      console.log(`  A 已量 ${measured.length} 面，最小间距 ${minGap.gap}px（${minGap.page} · ${minGap.side}）`)
    }
    for (const note of notes) console.log(`  · ${note}`)
    if (violations.length === 0) console.log('  无违规')
    else for (const violation of violations) {
      console.log(`  ✗ [${violation.rule}] ${violation.target} — ${violation.detail}`)
    }
    // warning 必须独立于「有没有违规」打印：零违规但有告警的情形正是它存在的意义。
    // `!` 而不是 `✗`：这是未验证的判定，红了先看是不是它判错。
    for (const warning of warnings ?? []) {
      console.log(`  ! [${warning.rule}] ${warning.target} — ${warning.detail}`)
    }
  }

  const runtimeReports = reports.filter(report => report.kind === 'runtime')
  const sketchReports = reports.filter(report => report.kind === 'sketch')
  const runtimeHits = runtimeReports.reduce((total, report) => total + report.violations.length, 0)
  // 手写页「没有 pageBody」「漏画图标」都是探针自身的缺口，一并计入这一栏。
  const fixtureHits = sketchReports.reduce(
    (total, report) =>
      total
      + report.violations.length
      + (report.warnings?.length ?? 0)
      + (report.skips?.length ?? 0),
    0,
  )

  // 两栏必须分开：手写页漏画图标、探针缺 pageBody 属于 fixture 自身的缺口，
  // 和「实现坏了」挤在一张表里，红就会退化成噪声。
  console.log(`
== 实现违规（runtime，决定退出码）：${runtimeHits} 条 ==`)
  for (const report of runtimeReports) render(report)
  if (runtimeHits === 0) console.log('· 无')

  console.log(`
== fixture 缺口（手写探针，不改退出码）：${fixtureHits} 条 ==`)
  for (const report of sketchReports) render(report)
  if (fixtureHits === 0) console.log('· 无')

  const warningHits = runtimeReports.reduce((total, report) => total + (report.warnings?.length ?? 0), 0)
  console.log(`
== 未验证判定（只报警，不改退出码）：${warningHits} 条 ==`)
  if (warningHits === 0) console.log('· 无')

  console.log(failed ? '\n审计失败：存在实现违规' : '\n审计通过：实现无违规（fixture 缺口单列）')
}

process.exit(failed ? 1 : 0)
