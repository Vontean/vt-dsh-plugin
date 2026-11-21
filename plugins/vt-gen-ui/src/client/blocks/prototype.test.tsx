/**
 * Prototype components: role, accessible name/wiring, and the `data-*` state
 * contract that the style layer consumes. Rendering goes through `renderNode`
 * so the catalog → registry → dispatcher path is exercised, not just the
 * component functions.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { renderNode } from './render-node.tsx'
import { FieldGroupNode, ListRowNode, NavNode, PageNode, wrapPrototypeRoot } from './prototype.tsx'
import type { RenderPrototypeChildren } from './prototype.tsx'
import { PROTOTYPE_RENDERERS } from './prototype-registry.ts'
import { PROTOTYPE_TYPES } from '../../shared/catalog/index.ts'

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
})

describe('nav', () => {
  test('bottom tabs expose tablist/tab roles and one active tab', () => {
    const root = render(<NavNode path="items[0]" renderChildren={renderChildren} node={{
      type: 'nav',
      variant: 'tabs',
      items: [{ label: '概览', active: true }, { label: '详情' }],
    }} />)
    const nav = root.querySelector('nav[data-genui="nav"]')!
    expect(nav.getAttribute('data-orientation')).toBe('tabs')
    expect(nav.getAttribute('aria-label')).toBe('导航')
    expect(nav.querySelector('[role="tablist"]')).not.toBeNull()
    const tabs = [...nav.querySelectorAll('[role="tab"]')]
    expect(tabs).toHaveLength(2)
    expect(tabs.filter(tab => tab.getAttribute('data-active') === 'true')).toHaveLength(1)
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true')
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('false')
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
