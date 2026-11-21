/**
 * Test stub for `@deepseek-ai/dsh-client-ui-primitives`.
 *
 * The host package is a peer of this plugin and pulls host-only dependencies
 * (shiki, simple-icons, anser, …) that are not part of this repo. Unit tests
 * only need the rendering graph to load, so vitest aliases the package here.
 * The stub renders inert placeholders; no test asserts on host component
 * internals.
 */
type AnyProps = Record<string, unknown>

export function CodeBlock(props: AnyProps): JSX.Element {
  return <pre data-stub="code-block">{String(props.code ?? '')}</pre>
}

export function DiffBlock(props: AnyProps): JSX.Element {
  return <div data-stub="diff-block">{String(props.diffs === undefined ? '' : 'diff')}</div>
}

export function JsonTree(props: AnyProps): JSX.Element {
  return <pre data-stub="json-tree">{JSON.stringify(props.value ?? null)}</pre>
}

export async function writeClipboard(): Promise<void> {
  // Tests never assert clipboard side effects.
}

export interface DiffBlockLabels {
  readonly [key: string]: string
}

export interface JsonTreeLabels {
  readonly [key: string]: string
}
