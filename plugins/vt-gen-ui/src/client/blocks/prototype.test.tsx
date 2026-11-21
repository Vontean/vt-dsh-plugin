/**
 * Prototype components: role, accessible name/wiring, and the `data-*` state
 * contract that the style layer consumes. Rendering goes through `renderNode`
 * so the catalog → registry → dispatcher path is exercised, not just the
 * component functions.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { renderNode } from './render-node.tsx'
import {
  EmptyNode, FieldGroupNode, ListRowNode, LoadingNode, NavNode, PageNode, SplitNode, wrapPrototypeRoot,
} from './prototype.tsx'
import type { RenderPrototypeChildren } from './prototype.tsx'
import { PROTOTYPE_RENDERERS } from './prototype-registry.ts'
import { PROTOTYPE_TYPES } from '../../shared/catalog/index.ts'
import { ScreenNavigationContext } from '../screen-navigation.tsx'
import type { GenuiSplit } from '../spec.ts'
import { getLocale, setLocale, type LocaleId } from '../i18n/index.ts'

// The default locale comes from `navigator.languages`, which differs between
// machines. Pin it: the accessible names asserted below are chrome text.
let restoreLocale: LocaleId
beforeAll(() => {
  restoreLocale = getLocale()
  setLocale('zh')
})
afterAll(() => setLocale(restoreLocale))

/** Children are the dispatcher's job; the stub only proves they are rendered. */
const renderChildren: RenderPrototypeChildren = nodes => (
  <>{nodes.map((child, index) => (
    <span key={index} data-stub={child.type}>
      {'content' in child && typeof child.content === 'string' ? child.content : child.type}
    </span>
  ))}</>
)

function render(element: React.ReactElement): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(element)
  return container
}

describe('catalog registry', () => {
  test('every prototype type has a renderer and vice versa', () => {
    expect(Object.keys(PROTOTYPE_RENDERERS).sort()).toEqual([...PROTOTYPE_TYPES].sort())
  })
})

describe('dispatcher', () => {
  test('renderNode reaches the catalog registry for prototype types', () => {
    const html = renderToStaticMarkup(
      <>{renderNode({ type: 'page', title: '派发', items: [{ type: 'text', content: '正文' }] }, 0, undefined)}</>,
    )
    expect(html).toContain('data-genui="page"')
    expect(html).toContain('data-genui="prototype-root"')
    expect(html).toContain('正文')
  })
})

describe('page', () => {
  test('renders a labelled page with title bar, actions and content', () => {
    const root = render(<PageNode path="items[0]" renderChildren={renderChildren} node={{
      type: 'page',
      title: '账户设置',
      subtitle: '管理你的资料',
      actions: [{ type: 'button', label: '编辑' }],
      items: [{ type: 'text', content: '页面正文' }],
    }} />)
    const page = root.querySelector('[data-genui="page"]')!
    expect(page.tagName).toBe('SECTION')
    expect(page.getAttribute('data-orientation')).toBe('vertical')
    const heading = page.querySelector('h2')!
    expect(heading.textContent).toBe('账户设置')
    expect(page.getAttribute('aria-labelledby')).toBe(heading.id)
    expect(page.textContent).toContain('管理你的资料')
    expect(page.querySelector('[data-stub="button"]')!.textContent).toBe('button')
    expect(page.textContent).toContain('页面正文')
  })

  test('omits the title bar when no title fields are present', () => {
    const root = render(<PageNode path="items[0]" renderChildren={renderChildren} node={{
      type: 'page', items: [{ type: 'text', content: '只有内容' }],
    }} />)
    expect(root.querySelector('[data-genui="page"] header')).toBeNull()
  })

  test('only the outermost page draws the dashed sketch frame', () => {
    // §12.4 B2: the dashed edge marks "this is a simulated screen". A nested
    // page is a region inside that screen and must stay solid.
    const outer = render(<PageNode path="items[0]" renderChildren={renderChildren} node={{
      type: 'page', title: '外层', items: [],
    }} />)
    expect(outer.querySelector('[data-genui="page"]')!.getAttribute('data-frame')).toBe('dashed')
    const inner = render(<PageNode depth={1} path="items[0].items[0]" renderChildren={renderChildren} node={{
      type: 'page', title: '内层', items: [],
    }} />)
    expect(inner.querySelector('[data-genui="page"]')!.getAttribute('data-frame')).toBe('solid')
  })

  test('the content column carries the page inset hook', () => {
    // The probe page and the style contract both look this up; keep the hook.
    const root = render(<PageNode path="items[0]" renderChildren={renderChildren} node={{
      type: 'page', items: [{ type: 'text', content: '正文' }],
    }} />)
    expect(root.querySelector('[data-page-body]')).not.toBeNull()
  })
})

describe('nav', () => {
  test('bottom tabs are page navigation, not a tab widget', () => {
    const root = render(<NavNode path="items[0]" renderChildren={renderChildren} node={{
      type: 'nav',
      variant: 'tabs',
      items: [{ label: '概览', active: true }, { label: '详情' }],
    }} />)
    const nav = root.querySelector('nav[data-genui="nav"]')!
    expect(nav.getAttribute('data-orientation')).toBe('tabs')
    // A stable accessible name lets a screen reader announce the landmark.
    expect(nav.getAttribute('aria-label')).toBe('导航')
    // Page navigation: never the tab widget roles, which announce "选项卡".
    expect(nav.querySelector('[role="tablist"]')).toBeNull()
    expect(nav.querySelector('[role="tab"]')).toBeNull()
    const items = [...nav.querySelectorAll('button')]
    expect(items).toHaveLength(2)
    expect(items.filter(item => item.getAttribute('data-active') === 'true')).toHaveLength(1)
    expect(items[0]!.getAttribute('aria-current')).toBe('page')
    expect(items[1]!.getAttribute('aria-current')).toBeNull()
    expect(items[0]!.getAttribute('aria-selected')).toBeNull()
  })

  test('the landmark name can be overridden per nav', () => {
    const root = render(<NavNode path="items[0]" renderChildren={renderChildren} node={{
      type: 'nav', label: '账户分区', items: [{ label: '概览' }],
    }} />)
    expect(root.querySelector('nav')!.getAttribute('aria-label')).toBe('账户分区')
  })

  test('top nav marks the current item with aria-current', () => {
    const root = render(<NavNode path="items[0]" renderChildren={renderChildren} node={{
      type: 'nav', items: [{ label: '首页', active: true }, { label: '设置' }],
    }} />)
    const buttons = [...root.querySelectorAll('button')]
    expect(buttons[0]!.getAttribute('aria-current')).toBe('page')
    expect(buttons[1]!.getAttribute('aria-current')).toBeNull()
    expect(root.querySelector('nav')!.getAttribute('data-orientation')).toBe('top')
  })

  test('bars declare which edges they hug; the side block declares none', () => {
    // §12.3: `data-bleed` is a direction list, not a boolean. The top bar
    // runs edge to edge and hugs the frame top; bottom tabs hug the frame
    // bottom; the side block is a surface inside the gutter.
    const node = { type: 'nav' as const, items: [{ label: '概览' }] }
    const top = render(<NavNode path="items[0]" renderChildren={renderChildren} node={{ ...node, variant: 'top' }} />)
    expect(top.querySelector('nav')!.getAttribute('data-bleed')).toBe('inline block-start')
    const tabs = render(<NavNode path="items[0]" renderChildren={renderChildren} node={{ ...node, variant: 'tabs' }} />)
    expect(tabs.querySelector('nav')!.getAttribute('data-bleed')).toBe('inline block-end')
    const side = render(<NavNode path="items[0]" renderChildren={renderChildren} node={{ ...node, variant: 'side' }} />)
    expect(side.querySelector('nav')!.getAttribute('data-bleed')).toBeNull()
    // The default variant is the top bar, so it must bleed too.
    const fallback = render(<NavNode path="items[0]" renderChildren={renderChildren} node={node} />)
    expect(fallback.querySelector('nav')!.getAttribute('data-bleed')).toBe('inline block-start')
  })

  test('an icon NAME becomes a glyph, not five letters', () => {
    // `Cube` used to print as the word "Cube". A catalogue name is an icon
    // field: it renders an svg and carries the audit hook.
    const root = render(<NavNode path="items[0]" renderChildren={renderChildren} node={{
      type: 'nav', items: [{ label: '资源', icon: 'Cube', active: true }],
    }} />)
    const slot = root.querySelector('[data-genui-icon-field]')!
    expect(slot.getAttribute('data-genui-icon-field')).toBe('nav-icon')
    expect(slot.querySelector('svg')).not.toBeNull()
    // The glyph is decorative next to the label; it must not double-announce.
    expect(slot.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  test('a non-catalogue string stays text', () => {
    // Emoji and initials are legitimate media values; they are not icons and
    // must not be swallowed by the glyph path.
    const root = render(<NavNode path="items[0]" renderChildren={renderChildren} node={{
      type: 'nav', items: [{ label: '收藏', icon: '★' }],
    }} />)
    expect(root.querySelector('[data-genui-icon-field]')).toBeNull()
    expect(root.querySelector('svg')).toBeNull()
    expect(root.querySelector('nav')!.textContent).toContain('★')
  })
})

describe('list-row', () => {
  test('exposes one merged accessible name and a data state', () => {
    const root = render(<ListRowNode path="items[0]" renderChildren={renderChildren} node={{
      type: 'list-row',
      title: '王小鲸',
      desc: '产品设计师',
      meta: '2 小时前',
      actions: [{ type: 'button', label: '查看' }],
    }} />)
    const row = root.querySelector('[data-genui="list-row"]')!
    expect(row.getAttribute('role')).toBe('listitem')
    expect(row.getAttribute('aria-label')).toBe('王小鲸 产品设计师 2 小时前')
    expect(row.getAttribute('data-state')).toBe('interactive')
    expect(row.textContent).toContain('王小鲸')
    expect(row.querySelector('[data-stub="button"]')).not.toBeNull()
  })

  test('a row without actions is not interactive', () => {
    const root = render(<ListRowNode path="items[0]" renderChildren={renderChildren} node={{ type: 'list-row', title: '只读行' }} />)
    expect(root.querySelector('[data-genui="list-row"]')!.getAttribute('data-state')).toBe('default')
  })

  test('data-lines marks the fixed one/two-line row rhythm', () => {
    const two = render(<ListRowNode path="items[0]" renderChildren={renderChildren} node={{
      type: 'list-row', title: '有副文本', desc: '副文本',
    }} />)
    expect(two.querySelector('[data-genui="list-row"]')!.getAttribute('data-lines')).toBe('2')
    const one = render(<ListRowNode path="items[0]" renderChildren={renderChildren} node={{ type: 'list-row', title: '单行' }} />)
    expect(one.querySelector('[data-genui="list-row"]')!.getAttribute('data-lines')).toBe('1')
  })

  test('media accepts a glyph name or literal text', () => {
    // Both shapes are valid sketch values; the difference is resolved once,
    // in `renderIconField`, so the three icon slots cannot drift apart.
    const glyph = render(<ListRowNode path="items[0]" renderChildren={renderChildren} node={{
      type: 'list-row', title: '资源', media: 'Cube',
    }} />)
    const slot = glyph.querySelector('[data-genui-icon-field]')!
    expect(slot.getAttribute('data-genui-icon-field')).toBe('media')
    expect(slot.querySelector('svg')).not.toBeNull()
    expect(glyph.querySelector('[data-genui="list-row"]')!.textContent).not.toContain('Cube')

    const initial = render(<ListRowNode path="items[0]" renderChildren={renderChildren} node={{
      type: 'list-row', title: '王小鲸', media: '王',
    }} />)
    expect(initial.querySelector('[data-genui-icon-field]')).toBeNull()
    expect(initial.querySelector('[data-genui="list-row"]')!.textContent).toContain('王')
  })

  test('rows bleed inline only, so hover and separators span the frame', () => {
    // §12.3: a row cancels the inline gutter (its own padding restores the
    // content edge) but keeps the block gutter above and below.
    const root = render(<ListRowNode path="items[0]" renderChildren={renderChildren} node={{ type: 'list-row', title: '贴边行' }} />)
    expect(root.querySelector('[data-genui="list-row"]')!.getAttribute('data-bleed')).toBe('inline')
  })
})

describe('prototype root', () => {
  test('a top-level prototype node is wrapped in the named root container', () => {
    const root = render(<>{wrapPrototypeRoot(<PageNode path="items[0]" renderChildren={renderChildren} node={{
      type: 'page', title: '屏 1', items: [],
    }} />, 0, 0)}</>)
    const wrapper = root.querySelector('[data-genui="prototype-root"]')!
    expect(wrapper).not.toBeNull()
    expect(wrapper.querySelector(':scope > [data-genui="page"]')).not.toBeNull()
  })

  test('nested prototype nodes are not wrapped again', () => {
    const root = render(<>{wrapPrototypeRoot(<span data-stub="nav" />, 1, 0)}</>)
    expect(root.querySelector('[data-genui="prototype-root"]')).toBeNull()
    expect(root.querySelector('[data-stub="nav"]')).not.toBeNull()
  })
})

describe('field-group', () => {
  test('invalid group wires label, description and alert together', () => {
    const root = render(<FieldGroupNode path="items[0]" renderChildren={renderChildren} node={{
      type: 'field-group',
      label: '邮箱',
      desc: '用于接收通知',
      error: '请输入邮箱',
      required: true,
      items: [{ type: 'input', placeholder: 'you@example.com' }],
    }} />)
    const group = root.querySelector('[data-genui="field-group"]')!
    expect(group.getAttribute('role')).toBe('group')
    expect(group.getAttribute('data-invalid')).toBe('true')
    expect(group.getAttribute('data-state')).toBe('invalid')
    const labelId = group.getAttribute('aria-labelledby')!
    const label = root.querySelector(`[id="${labelId}"]`)!
    expect(label.textContent).toContain('邮箱')
    const alert = group.querySelector('[role="alert"]')!
    expect(alert.textContent).toBe('请输入邮箱')
    const describedBy = group.getAttribute('aria-describedby')!
    expect(describedBy.split(' ')).toContain(alert.id)
    expect(describedBy.split(' ')).toContain(root.querySelector('[class*="fieldDesc"]')!.id)
  })

  test('a valid group has no alert', () => {
    const root = render(<FieldGroupNode path="items[0]" renderChildren={renderChildren} node={{
      type: 'field-group', label: '昵称', items: [{ type: 'input' }],
    }} />)
    const group = root.querySelector('[data-genui="field-group"]')!
    expect(group.getAttribute('data-invalid')).toBe('false')
    expect(group.getAttribute('data-state')).toBe('default')
    expect(root.querySelector('[role="alert"]')).toBeNull()
  })
})

describe('page screen chrome', () => {
  const screen = { go: () => {}, back: () => {}, canGoBack: false, screenId: 'list', screenIndex: 0 }

  test('the screen-root page carries its screen badge outside the frame', () => {
    const root = render(
      <ScreenNavigationContext.Provider value={screen}>
        <PageNode depth={0} path="items[0]" renderChildren={renderChildren} node={{
          type: 'page', title: '收件箱', items: [],
        }} />
      </ScreenNavigationContext.Provider>,
    )
    const frame = root.querySelector('[data-genui-page-frame]')!
    expect(frame.querySelector('[class*="pageLabel"]')!.textContent).toBe('屏 1 · 收件箱')
    // The page clips its own overflow, so the badge must be a sibling — a
    // badge inside the frame would have its lower half cut off.
    expect(root.querySelector('[data-genui="page"] [class*="pageLabel"]')).toBeNull()
  })

  test('a nested page does not repeat the screen label', () => {
    const root = render(
      <ScreenNavigationContext.Provider value={screen}>
        <PageNode depth={1} path="items[0].items[0]" renderChildren={renderChildren} node={{
          type: 'page', title: '方案 A', items: [],
        }} />
      </ScreenNavigationContext.Provider>,
    )
    expect(root.querySelector('[data-genui-page-frame]')).toBeNull()
  })

  test('a custom label replaces the automatic screen number, never adds to it', () => {
    // §12.4: `label` is the comparison badge. "屏 1 · 方案 A" would say two
    // different things at once, so the automatic name is dropped entirely.
    const root = render(
      <ScreenNavigationContext.Provider value={screen}>
        <PageNode depth={0} path="items[0]" renderChildren={renderChildren} node={{
          type: 'page', title: '收件箱', label: '方案 A', items: [],
        }} />
      </ScreenNavigationContext.Provider>,
    )
    const badge = root.querySelector('[data-genui-page-frame] [class*="pageLabel"]')!
    expect(badge.textContent).toBe('方案 A')
  })

  test('a nested page shows a badge only when it carries a label', () => {
    const root = render(
      <ScreenNavigationContext.Provider value={screen}>
        <PageNode depth={1} path="items[0].items[0]" renderChildren={renderChildren} node={{
          type: 'page', title: '并排方案', label: '方案 B', items: [],
        }} />
      </ScreenNavigationContext.Provider>,
    )
    const badge = root.querySelector('[data-genui-page-frame] [class*="pageLabel"]')!
    // Nested pages never get the screen number, label or not.
    expect(badge.textContent).toBe('方案 B')
  })

  test('a blank label falls back to the automatic screen name', () => {
    const root = render(
      <ScreenNavigationContext.Provider value={screen}>
        <PageNode depth={0} path="items[0]" renderChildren={renderChildren} node={{
          type: 'page', title: '收件箱', label: '   ', items: [],
        }} />
      </ScreenNavigationContext.Provider>,
    )
    expect(root.querySelector('[class*="pageLabel"]')!.textContent).toBe('屏 1 · 收件箱')
  })

  test('legacy pages render no screen chrome at all', () => {
    const root = render(<PageNode path="items[0]" renderChildren={renderChildren} node={{
      type: 'page', title: '普通页面', items: [],
    }} />)
    expect(root.querySelector('[data-genui-page-frame]')).toBeNull()
    expect(root.querySelector('[class*="pageLabel"]')).toBeNull()
  })
})

describe('empty', () => {
  test('renders the graphic slot, title, description and actions', () => {
    const root = render(<EmptyNode path="items[0]" renderChildren={renderChildren} node={{
      type: 'empty',
      icon: '🗂',
      title: '还没有任务',
      desc: '创建第一个任务后，这里会列出全部任务。',
      actions: [{ type: 'button', label: '新建任务' }],
    }} />)
    const empty = root.querySelector('[data-genui="empty"]')!
    expect(empty.getAttribute('role')).toBe('group')
    const heading = empty.querySelector('h3')!
    expect(heading.textContent).toBe('还没有任务')
    expect(empty.getAttribute('aria-labelledby')).toBe(heading.id)
    expect(empty.textContent).toContain('创建第一个任务后')
    // The graphic slot is decoration: it must never be the only carrier.
    expect(empty.querySelector('[class*="emptyMedia"]')!.getAttribute('aria-hidden')).toBe('true')
    expect(empty.querySelector('[data-stub="button"]')).not.toBeNull()
  })

  test('the graphic slot renders a glyph name as an svg', () => {
    const root = render(<EmptyNode path="items[0]" renderChildren={renderChildren} node={{
      type: 'empty', icon: 'Cube', title: '还没有资源',
    }} />)
    const slot = root.querySelector('[data-genui-icon-field]')!
    expect(slot.getAttribute('data-genui-icon-field')).toBe('empty-icon')
    expect(slot.querySelector('svg')).not.toBeNull()
    expect(root.textContent).not.toContain('Cube')
  })

  test('a graphic slot is optional', () => {
    const root = render(<EmptyNode path="items[0]" renderChildren={renderChildren} node={{
      type: 'empty', title: '没有结果',
    }} />)
    expect(root.querySelector('[class*="emptyMedia"]')).toBeNull()
    expect(root.querySelector('h3')!.textContent).toBe('没有结果')
  })
})

describe('loading', () => {
  const barsOf = (root: HTMLElement): Array<string | null> =>
    [...root.querySelectorAll('[class*="skeletonBar"]')].map(bar => bar.getAttribute('data-width'))

  test('a three-line block is a busy status with staggered bar widths', () => {
    const root = render(<LoadingNode path="items[0]" renderChildren={renderChildren} node={{ type: 'loading' }} />)
    const loading = root.querySelector('[data-genui="loading"]')!
    expect(loading.getAttribute('role')).toBe('status')
    expect(loading.getAttribute('aria-busy')).toBe('true')
    expect(loading.getAttribute('aria-label')).toBe('加载中')
    expect(loading.getAttribute('data-orientation')).toBe('block')
    expect(root.querySelector('[class*="skeleton"]')!.getAttribute('aria-hidden')).toBe('true')
    expect(barsOf(root)).toEqual(['100', '88', '72'])
  })

  test('bar widths stay in the bucket set and neighbours never match', () => {
    const allowed = ['100', '88', '76', '72', '56']
    for (const lines of [1, 2, 3, 4]) {
      const root = render(<LoadingNode path="items[0]" renderChildren={renderChildren} node={{ type: 'loading', lines }} />)
      const widths = barsOf(root)
      expect(widths.length).toBeGreaterThan(0)
      expect(widths.length).toBeLessThanOrEqual(3)
      for (const width of widths) expect(allowed).toContain(width!)
      for (let i = 1; i < widths.length; i++) expect(widths[i], `lines=${lines}`).not.toBe(widths[i - 1])
    }
  })

  test('a row skeleton is a media tile plus two bars', () => {
    const root = render(<LoadingNode path="items[0]" renderChildren={renderChildren} node={{
      type: 'loading', variant: 'row',
    }} />)
    expect(root.querySelector('[data-genui="loading"]')!.getAttribute('data-orientation')).toBe('row')
    expect(root.querySelector('[class*="skeletonMedia"]')).not.toBeNull()
    expect(barsOf(root)).toEqual(['88', '72'])
  })

  test('the custom label wins over the localised default', () => {
    const root = render(<LoadingNode path="items[0]" renderChildren={renderChildren} node={{
      type: 'loading', label: '正在载入任务',
    }} />)
    expect(root.querySelector('[data-genui="loading"]')!.getAttribute('aria-label')).toBe('正在载入任务')
  })
})

describe('split', () => {
  test('exposes the ratio and one pane per child', () => {
    const root = render(<SplitNode path="items[0]" renderChildren={renderChildren} node={{
      type: 'split',
      ratio: '2:1',
      items: [
        { type: 'page', title: '方案 A', items: [] },
        { type: 'page', title: '方案 B', items: [] },
      ],
    }} />)
    const split = root.querySelector('[data-genui="split"]')!
    expect(split.getAttribute('data-ratio')).toBe('2:1')
    expect(split.querySelectorAll('[class*="splitPane"]')).toHaveLength(2)
  })

  test('the divider is off unless asked for', () => {
    const base: GenuiSplit = { type: 'split', items: [{ type: 'text', content: 'A' }, { type: 'text', content: 'B' }] }
    const plain = render(<SplitNode path="items[0]" renderChildren={renderChildren} node={base} />)
    expect(plain.querySelector('[data-genui="split"]')!.getAttribute('data-divider')).toBe('false')
    expect(plain.querySelector('[data-genui="split"]')!.getAttribute('data-ratio')).toBe('1:1')
    const divided = render(<SplitNode path="items[0]" renderChildren={renderChildren} node={{ ...base, divider: true }} />)
    expect(divided.querySelector('[data-genui="split"]')!.getAttribute('data-divider')).toBe('true')
  })
})

describe('style contract (no draft signals, one line width)', () => {
  const cssSource = readFileSync(resolve(import.meta.dirname, 'Prototype.module.css'), 'utf8')
  // Strip comments: the prose explaining WHY a draft signal is absent would
  // otherwise match the very word the assertion forbids.
  const section = (from: string, to: string): string =>
    cssSource.slice(cssSource.indexOf(from), cssSource.indexOf(to)).replace(/\/\*[\s\S]*?\*\//g, '')

  test('empty and loading never use the dashed "not designed" frame', () => {
    expect(section('/* ---- empty', '/* ---- split')).not.toContain('dashed')
  })

  test('the split divider is opt-in and uses the structural line', () => {
    const split = section('/* ---- split', '/* ---- container queries')
    expect(split).not.toContain('dashed')
    expect(split).toContain("[data-divider='true']")
    expect(split).toContain('var(--proto-line-frame)')
  })

  test('the screen badge sits above the page layer', () => {
    const badge = section('.pageLabel {', '/* ---- empty')
    expect(badge).toContain('z-index: 2')
    expect(section('.page {', '.pageHeader')).toContain('position: relative')
  })

  test('the badge backdrop follows the surface behind its line', () => {
    // §12.4 B3: a nested badge sits on the card surface and would show the
    // conversation base as a wrong-coloured chip if the fallback were used.
    expect(section('.page {', '.pageHeader')).toContain('--proto-badge-bg: var(--proto-surface-card)')
    expect(section('.pageLabel {', '/* ---- empty'))
      .toContain('background: var(--proto-badge-bg, var(--dsw-alias-bg-base))')
    // §12.4 B4: only a framed page reserves the 9px the badge sits in.
    expect(section('.pageFrame {', '.pageLabel {')).toContain('padding-top: 9px')
  })

  test('the page body is the only source of page spacing, on all four sides', () => {
    // §12.3 rule A: one gutter, four sides, and components never add a
    // page-level padding of their own — that is how 24 + 24 happens.
    const body = section('.pageBody {', '/* ---- nav')
    expect(body).toContain('padding: var(--proto-gutter)')
    expect(body).not.toContain('padding-inline')
    // The old name described two sides; it must not come back.
    expect(cssSource).not.toContain('--proto-pad-x')
    // Blocks that used to carry their own page padding now sit flush.
    expect(section('/* ---- empty', '/* ---- split')).not.toContain('padding-block: 24px')
  })

  test('bleed is a direction list with one condition per direction', () => {
    // `inline` always applies; `block-start` / `block-end` only at the
    // first / last child, and the top edge additionally yields to a title
    // bar (§12.3) — miss either condition and a middle nav slides up.
    expect(cssSource).toContain("[data-bleed~='inline']")
    expect(cssSource).toContain("[data-bleed~='block-start']:first-child")
    expect(cssSource).toContain("[data-bleed~='block-end']:last-child")
    expect(cssSource).toContain('.page:has(> .pageHeader) .pageBody > [data-bleed~=\'block-start\']:first-child')
    expect(cssSource).toContain('margin-block-start: 0')
    // The boolean form is gone: every rule must use `~=`.
    expect(cssSource).not.toContain("[data-bleed='true']")
  })

  test('the title bar owns its top gutter and no bottom padding', () => {
    // §12.3: "title → first content" is G, not 16 + G.
    expect(section('.pageHeader {', '.pageHeading')).toContain('padding: var(--proto-gutter) var(--proto-gutter) 0')
  })

  test('a divider never doubles a pane frame', () => {
    // L1/L3: panes that are `page`s already draw a solid frame, so the
    // divider steps aside and the gap returns.
    const divider = section('/* Opt-in divider', '/* ---- modal trigger')
    expect(divider).toContain(":has(> .splitPane > .page)")
    expect(divider).toContain("[data-genui-page-frame] > .page")
    expect(divider).toContain('gap: 16px')
    expect(divider).toContain('border-left: 0')
    expect(divider).toContain('padding-left: 0')
  })

  test('the sketch frame is solid unless the renderer marks the screen root', () => {
    // §12.4 B2: depth is a renderer decision (`data-frame`), not a CSS
    // descendant selector — a split pane is nested but must not go dashed.
    const page = section('.page {', '.pageHeader')
    expect(page).toContain('border: 1px solid var(--proto-line-frame)')
    expect(page).toContain("[data-frame='dashed']")
    expect(page).toContain('border-style: dashed')
  })

  test('controls and buttons use the host line tiers, not the structural one', () => {
    // l4 reads as an input edge, l3 as a button edge; l2 is for containers.
    expect(section('.fieldControl :is', '.fieldControl:focus')).toContain('border-color: var(--proto-line-control)')
    expect(section('.modalTrigger {', '.modalTrigger:hover')).toContain('border: 1px solid var(--proto-line-button)')
    expect(cssSource).toContain('--proto-line-button: var(--dsw-alias-border-l3)')
    expect(cssSource).toContain('--proto-line-control: var(--dsw-alias-border-l4)')
  })
})
