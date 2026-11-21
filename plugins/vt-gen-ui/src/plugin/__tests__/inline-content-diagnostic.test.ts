/**
 * `inline-content-diagnostic` 的契约测试。
 *
 * 该模块是**手写 switch**（不是查表）：每个组件类型单独列出哪些字段算“可见文案”，
 * 于是新增组件、或给组件加文字字段时不会报错，只会**静默少一条诊断**（H9）。
 * 本文件把这件事变成可见事实，分两组：
 *
 * 1. `covered`：既有会报的字段 —— 防回归。
 * 2. `previously documented gaps`：曾记录为“不报”、现已补上的字段与子树 ——
 *    它们从“断言不报”翻成“断言会报”，这样补上诊断与更新测试不会只做一半。
 *
 * 补完后的覆盖范围：7 个原型容器类型（page / split / nav / field-group / empty /
 * list-row / modal）现在都遍历子树并检查自己的文案字段；此前漏掉的 26 个可见字段
 * （card.eyebrow、divider.label、blocks.*、diagram.nodes[]、image.caption 等）也已纳入。
 */
import { describe, expect, test } from 'vitest'
import { collectInlineContentWarnings } from '../inline-content-diagnostic.ts'

/** 块级 Markdown 样本：一个两列表格，足以触发 `markdown_table`。 */
const MD_TABLE = 'a|b\n---|---\n1|2'

const warned = (node: unknown): string[] =>
  collectInlineContentWarnings({ items: [node] } as never).map(warning => warning.path)

const warnedAtRootTitle = (): string[] =>
  collectInlineContentWarnings({ items: [], title: MD_TABLE } as never).map(warning => warning.path)

const textChild = () => ({ type: 'text', content: MD_TABLE })

describe('inline content: covered fields', () => {
  const covered: Array<{ name: string; node: unknown; path: string }> = [
    { name: 'text.content', node: { type: 'text', content: MD_TABLE }, path: 'items[0].content' },
    { name: 'spec.title（根级）', node: null, path: 'title' },
    { name: 'callout.title', node: { type: 'callout', title: MD_TABLE, content: 'x' }, path: 'items[0].title' },
    { name: 'callout.content', node: { type: 'callout', title: 't', content: MD_TABLE }, path: 'items[0].content' },
    { name: 'card.title', node: { type: 'card', title: MD_TABLE, items: [] }, path: 'items[0].title' },
    { name: 'card 子节点', node: { type: 'card', title: 't', items: [textChild()] }, path: 'items[0].items[0].content' },
    { name: 'tabs 标签与子节点', node: { type: 'tabs', tabs: [{ label: MD_TABLE, items: [textChild()] }] }, path: 'items[0].tabs[0].label' },
    { name: 'accordion 标题', node: { type: 'accordion', items: [{ title: MD_TABLE, items: [] }] }, path: 'items[0].items[0].title' },
    { name: 'steps.title', node: { type: 'steps', steps: [{ title: MD_TABLE }] }, path: 'items[0].steps[0].title' },
    { name: 'timeline.desc', node: { type: 'timeline', items: [{ title: 't', time: 't', desc: MD_TABLE }] }, path: 'items[0].items[0].desc' },
    { name: 'stat.value', node: { type: 'stat', label: 'l', value: MD_TABLE }, path: 'items[0].value' },
    { name: 'progress.valueLabel', node: { type: 'progress', value: 50, valueLabel: MD_TABLE }, path: 'items[0].valueLabel' },
    { name: 'keyvalue.pairs[].value', node: { type: 'keyvalue', pairs: [{ key: 'k', value: MD_TABLE }] }, path: 'items[0].pairs[0].value' },
    { name: 'hero.subtitle', node: { type: 'hero', title: 't', subtitle: MD_TABLE }, path: 'items[0].subtitle' },
    { name: 'quiz.options[].label', node: { type: 'quiz', question: 'q', options: [{ label: MD_TABLE }] }, path: 'items[0].options[0].label' },
    { name: 'quiz.options[].feedback', node: { type: 'quiz', question: 'q', options: [{ label: 'l', feedback: MD_TABLE }] }, path: 'items[0].options[0].feedback' },
    { name: 'table.columns[]', node: { type: 'table', columns: [MD_TABLE], rows: [['x']] }, path: 'items[0].columns[0]' },
    { name: 'table.rows[][]', node: { type: 'table', columns: ['c'], rows: [[MD_TABLE]] }, path: 'items[0].rows[0][0]' },
    { name: 'list 字符串条目', node: { type: 'list', items: [MD_TABLE] }, path: 'items[0].items[0]' },
    { name: 'list 记录条目', node: { type: 'list', items: [{ title: MD_TABLE, desc: 'd' }] }, path: 'items[0].items[0].title' },
    { name: 'radio 选项', node: { type: 'radio', label: 'l', options: [MD_TABLE] }, path: 'items[0].options[0]' },
    { name: 'image.alt', node: { type: 'image', src: 'x.png', alt: MD_TABLE }, path: 'items[0].alt' },
  ]

  for (const item of covered) {
    test(item.name, () => {
      const paths = item.node === null ? warnedAtRootTitle() : warned(item.node)
      expect(paths).toContain(item.path)
    })
  }
})

/**
 * 曾记录为缺口、现已覆盖的字段。断言「会报」——回归时立刻变红。
 * 分类依据：字段本身是**渲染给人看的文字**（不是 id / tone / src / code / 颜色 / 行为）。
 */
describe('inline content: previously documented gaps (H9, now covered)', () => {
  const gaps: Array<{ name: string; node: unknown; path: string }> = [
    // ---- 7 个此前没有 case 的类型：整棵子树都不遍历 ----
    // nav 没有子节点（items 是数据记录），所以这里没有“子树”条目；
    // 它的两处文案在下方字段清单里（nav.label / nav.items[].label）。
    { name: 'page 子树', node: { type: 'page', title: 't', items: [textChild()] }, path: 'items[0].items[0].content' },
    { name: 'split 子树', node: { type: 'split', ratio: '1:1', items: [textChild()] }, path: 'items[0].items[0].content' },
    { name: 'field-group 子树', node: { type: 'field-group', label: 'l', items: [textChild()] }, path: 'items[0].items[0].content' },
    { name: 'empty 子树', node: { type: 'empty', title: 't', actions: [textChild()] }, path: 'items[0].actions[0].content' },
    { name: 'list-row 子树', node: { type: 'list-row', title: 't', actions: [textChild()] }, path: 'items[0].actions[0].content' },
    { name: 'modal 子树', node: { type: 'modal', title: 't', trigger: 'k', items: [textChild()] }, path: 'items[0].items[0].content' },

    // ---- 既有 case 里此前漏掉的具体字段 ----
    { name: 'card.eyebrow', node: { type: 'card', eyebrow: MD_TABLE, items: [] }, path: 'items[0].eyebrow' },
    { name: 'divider.label', node: { type: 'divider', label: MD_TABLE }, path: 'items[0].label' },
    { name: 'chart.title', node: { type: 'chart', kind: 'bars', data: [{ label: 'a', value: 1 }], title: MD_TABLE }, path: 'items[0].title' },
    { name: 'blocks.title', node: { type: 'blocks', rows: [], title: MD_TABLE }, path: 'items[0].title' },
    { name: 'blocks.caption', node: { type: 'blocks', rows: [], caption: MD_TABLE }, path: 'items[0].caption' },
    { name: 'blocks.rows[].label', node: { type: 'blocks', rows: [{ label: MD_TABLE }] }, path: 'items[0].rows[0].label' },
    { name: 'icon.label', node: { type: 'icon', name: 'star', label: MD_TABLE }, path: 'items[0].label' },
    { name: 'image.caption', node: { type: 'image', src: 'x.png', caption: MD_TABLE }, path: 'items[0].caption' },
    { name: 'list-row.title', node: { type: 'list-row', title: MD_TABLE }, path: 'items[0].title' },
    { name: 'list-row.desc', node: { type: 'list-row', title: 't', desc: MD_TABLE }, path: 'items[0].desc' },
    { name: 'list-row.meta', node: { type: 'list-row', title: 't', meta: MD_TABLE }, path: 'items[0].meta' },
    { name: 'page.title', node: { type: 'page', title: MD_TABLE, items: [] }, path: 'items[0].title' },
    { name: 'page.subtitle', node: { type: 'page', title: 't', subtitle: MD_TABLE, items: [] }, path: 'items[0].subtitle' },
    { name: 'nav.label', node: { type: 'nav', label: MD_TABLE, items: [] }, path: 'items[0].label' },
    { name: 'nav.items[].label', node: { type: 'nav', items: [{ label: MD_TABLE }] }, path: 'items[0].items[0].label' },
    { name: 'field-group.label', node: { type: 'field-group', label: MD_TABLE, items: [] }, path: 'items[0].label' },
    { name: 'field-group.desc', node: { type: 'field-group', label: 'l', desc: MD_TABLE, items: [] }, path: 'items[0].desc' },
    { name: 'field-group.error', node: { type: 'field-group', label: 'l', error: MD_TABLE, items: [] }, path: 'items[0].error' },
    { name: 'empty.title', node: { type: 'empty', title: MD_TABLE }, path: 'items[0].title' },
    { name: 'empty.desc', node: { type: 'empty', title: 't', desc: MD_TABLE }, path: 'items[0].desc' },
    { name: 'loading.label', node: { type: 'loading', label: MD_TABLE }, path: 'items[0].label' },
    { name: 'modal.title', node: { type: 'modal', title: MD_TABLE, trigger: 'k', items: [] }, path: 'items[0].title' },
    { name: 'modal.trigger', node: { type: 'modal', title: 't', trigger: MD_TABLE, items: [] }, path: 'items[0].trigger' },
    { name: 'arrow.label', node: { type: 'arrow', label: MD_TABLE }, path: 'items[0].label' },
    { name: 'diagram.nodes[].label', node: { type: 'diagram', kind: 'architecture', nodes: [{ id: 'a', label: MD_TABLE }] }, path: 'items[0].nodes[0].label' },
    { name: 'diagram.nodes[].sub', node: { type: 'diagram', kind: 'architecture', nodes: [{ id: 'a', label: 'l', sub: MD_TABLE }] }, path: 'items[0].nodes[0].sub' },
  ]

  for (const gap of gaps) {
    test(`${gap.name} 现在会报`, () => {
      expect(warned(gap.node)).toContain(gap.path)
    })
  }
})
