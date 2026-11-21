/**
 * Plugin registration surface: what `apply()` installs into a host.
 *
 * The section name, its centrally allocated order, the derived prompt blocks and
 * the skill provider's identity/rank are all cross-plugin contracts: a second
 * plugin registering `genui:fence`, `render_ui` or the skill `genui` fails at
 * activation, and a changed order silently moves the section in every prompt.
 * The host context is a hand-rolled recorder — no host runtime is mounted.
 */
import { describe, expect, test } from 'vitest'
import {
  ASSET_ROUTE_PATH, GENUI_SECTION_TEXT, apply, bundledSkillProvider, composeGenuiSkillContent,
} from '../index.ts'

interface SectionRecord {
  readonly name: string
  readonly order: number
  readonly text: string
}

function recorder(config?: { fenceFeedback?: boolean; renderUiTool?: boolean }) {
  const sections: SectionRecord[] = []
  const orderNames: string[] = []
  const injections: Array<{ readonly deps: readonly string[]; readonly callback: (ctx: never) => void }> = []
  const ctx = {
    systemPrompt: {
      getSectionOrder(name: string) {
        orderNames.push(name)
        return 9900
      },
      section(section: SectionRecord) {
        sections.push(section)
        return () => undefined
      },
    },
    on() {
      return () => undefined
    },
    inject(deps: readonly string[], callback: (ctx: never) => void) {
      injections.push({ deps, callback })
      return () => undefined
    },
    reflect: { get: () => undefined },
    logger: { warn: () => undefined },
  }
  apply(ctx as never, config)
  /** Run the first injection registered for one service name. */
  function withService<T>(service: string, subContext: unknown): T | undefined {
    const injection = injections.find(entry => entry.deps[0] === service)
    if (injection === undefined) return undefined
    injection.callback(subContext as never)
    return undefined
  }
  return { sections, orderNames, injections, withService }
}

/** Collect what a `tools` dependency fiber registers, running its effect body. */
function toolsContext() {
  const registered: Array<{ name: string }> = []
  const subContext = {
    tools: {
      register(definition: { name: string }) {
        registered.push(definition)
        return () => undefined
      },
    },
    effect(generator: () => Generator<unknown, void, unknown>) {
      const iterator = generator()
      let step = iterator.next()
      while (!step.done) step = iterator.next()
    },
  }
  return { subContext, registered }
}

function skillsContext() {
  const providers: Array<() => unknown> = []
  return {
    subContext: { skills: { registerProvider(factory: () => unknown) { providers.push(factory); return () => undefined } } },
    providers,
  }
}

function webServerContext() {
  const routes: Array<{ kind?: string; path?: string; handler?: unknown }> = []
  const subContext = {
    reflect: {
      get: (name: string) => name === 'webServer'
        ? { register: (route: { kind?: string; path?: string; handler?: unknown }) => { routes.push(route); return () => undefined } }
        : undefined,
    },
    effect(action: () => unknown) { action() },
  }
  return { subContext, routes }
}

describe('system prompt section', () => {
  test('registers exactly one section named genui:fence', () => {
    const { sections } = recorder()
    expect(sections).toHaveLength(1)
    expect(sections[0]?.name).toBe('genui:fence')
  })

  test('takes the centrally allocated STRUCTURED_OUTPUT order', () => {
    const { orderNames, sections } = recorder()
    expect(orderNames).toEqual(['STRUCTURED_OUTPUT'])
    expect(sections[0]?.order).toBe(9900)
  })

  test('the section text is the exported one, with the derived blocks in place', () => {
    const { sections } = recorder()
    const text = sections[0]?.text ?? ''
    expect(text).toBe(GENUI_SECTION_TEXT)
    expect(text).toContain('- 布局: text · row · col · grid')
    expect(text).toContain('**字段速查**')
    expect(text).toContain('**字段名写错 = 该组件被丢弃**')
    expect(text).toContain('**多屏原型**')
    expect(text).toContain('render_ui 工具把同一 spec 渲染为工具行卡片')
  })

  test('disabling render_ui removes exactly its guidance line', () => {
    const on = recorder().sections[0]?.text ?? ''
    const off = recorder({ renderUiTool: false }).sections[0]?.text ?? ''
    expect(off).not.toContain('render_ui 工具把同一 spec 渲染为工具行卡片')
    expect(on.replace('- Tool channel: render_ui 工具把同一 spec 渲染为工具行卡片；围栏用于回答内联 UI。\n', '')).toBe(off)
  })
})

describe('model tool registration', () => {
  test('registers both tools when render_ui is enabled', () => {
    const { subContext, registered } = toolsContext()
    recorder().withService('tools', subContext)
    expect(registered.map(tool => tool.name)).toEqual(['render_ui', 'validate_dsh_ui'])
  })

  test('registers only the validator when render_ui is disabled', () => {
    const { subContext, registered } = toolsContext()
    recorder({ renderUiTool: false }).withService('tools', subContext)
    expect(registered.map(tool => tool.name)).toEqual(['validate_dsh_ui'])
  })
})

describe('lazy asset route', () => {
  test('registers the documented prefix route with a handler', () => {
    const { subContext, routes } = webServerContext()
    recorder().withService('webServer', subContext)
    expect(routes).toHaveLength(1)
    expect(routes[0]).toMatchObject({ kind: 'prefix', path: ASSET_ROUTE_PATH })
    expect(typeof routes[0]?.handler).toBe('function')
  })
})

interface SkillEntryView {
  readonly name: string
  readonly description: string
  readonly source?: string
  readonly provider?: string
  readonly rank?: number
  readonly invocation?: unknown
  readonly path?: string
  readonly resourceBase?: unknown
}

/**
 * The provider's `list`/`get` take host lookup options, and `list` may answer an
 * observation instead of candidates. The tests only care about the catalog
 * content, so the view narrows both away.
 */
function skillView() {
  return bundledSkillProvider() as unknown as {
    name: string
    list(options: never): Promise<readonly SkillEntryView[]>
    get(candidate: SkillEntryView, options: never): Promise<{ content?: string }>
  }
}

async function skillEntries(): Promise<readonly SkillEntryView[]> {
  return skillView().list({} as never)
}

async function skillBody(): Promise<{ content?: string }> {
  const [entry] = await skillEntries()
  if (entry === undefined) throw new Error('the provider listed no genui skill')
  return skillView().get(entry, {} as never)
}

describe('skill provider', () => {
  test('apply() registers exactly one provider factory', () => {
    const { subContext, providers } = skillsContext()
    recorder().withService('skills', subContext)
    expect(providers).toHaveLength(1)
  })

  test('the provider owns the genui skill at bundled precedence', async () => {
    expect(skillView().name).toBe('dsh-vt-gen-ui')
    const [entry] = await skillEntries()
    expect(entry).toMatchObject({
      name: 'genui',
      source: 'bundled',
      provider: 'dsh-vt-gen-ui',
      rank: 600,
      invocation: { modelInvocable: true, userInvocable: true },
    })
    expect(entry?.path).toMatch(/SKILL\.md$/)
    expect(entry?.resourceBase).toMatchObject({ kind: 'directory' })
  })

  test('the routing description comes from the skill file, not a code copy', async () => {
    const [entry] = await skillEntries()
    expect(entry?.description).toContain('Render structured interactive UI inline through the dsh-ui fence')
  })

  test('loading the skill appends the generated component reference', async () => {
    const definition = await skillBody()
    expect(definition.content?.trimStart().startsWith('# GenUI')).toBe(true)
    expect(definition.content).toContain('## 组件字段参考（由 catalog 生成，勿手改）')
    expect(definition.content).toContain('`table`')
    expect(definition.content).toContain('`callout`')
    expect(definition.content).not.toContain('name: genui')
  })

  test('composeGenuiSkillContent is the single reference attachment point', () => {
    const composed = composeGenuiSkillContent('# body\n\n')
    expect(composed.startsWith('# body\n\n## 组件字段参考')).toBe(true)
    expect(composed.endsWith('\n')).toBe(true)
  })
})
