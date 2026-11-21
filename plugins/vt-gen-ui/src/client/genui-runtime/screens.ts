/**
 * Prototype screen state machine (slice 2): pure functions for reading a
 * `screens` map and moving between screens.
 *
 * Kept free of React and storage so the rules are testable in isolation:
 * - `initial` wins when it names a declared screen, else the first key;
 * - `goto` pushes the current screen onto a bounded back stack;
 * - back pops that stack;
 * - an invalid target never moves the machine (a typo must not blank the UI);
 * - degradation (`screenMachine: false`) renders the initial screen only.
 */
import type { GenuiNode, GenuiSpec } from '../spec.ts'

/** Bounded back stack: enough to retrace a flow, never unbounded. */
export const SCREEN_STACK_LIMIT = 20

/** Declared screens with a resolved initial screen id. */
export interface ScreenModel {
  readonly screens: Readonly<Record<string, readonly GenuiNode[]>>
  /** Screen ids in declaration order. */
  readonly order: readonly string[]
  readonly initial: string
}

export interface ScreenState {
  readonly current: string
  /** Previously visited screens, oldest first. */
  readonly stack: readonly string[]
}

/** Persisted screen fields (subset of the block's durable state). */
export interface PersistedScreen {
  readonly screen?: string
  readonly stack?: readonly string[]
}

/**
 * Read the screen map from a spec. Returns null for every legacy spec (no
 * `screens`), which keeps the non-screen rendering path byte-identical.
 */
export function readScreenModel(
  // `items` is accepted (and ignored) so callers can pass a whole spec without
  // narrowing first; legacy specs answer null via the missing `screens`.
  spec: Pick<GenuiSpec, 'screens' | 'initial'> & { readonly items?: readonly GenuiNode[] },
): ScreenModel | null {
  const screens = spec.screens
  if (screens === undefined || typeof screens !== 'object' || Array.isArray(screens)) return null
  const order = Object.keys(screens).filter(id => Array.isArray(screens[id]))
  if (order.length === 0) return null
  const initial = spec.initial !== undefined && order.includes(spec.initial)
    ? spec.initial
    : order[0]!
  return { screens, order, initial }
}

/** Restore a persisted screen/stack, falling back to the initial screen. */
export function initialScreenState(model: ScreenModel, persisted?: PersistedScreen | null): ScreenState {
  const current = persisted?.screen !== undefined && model.order.includes(persisted.screen)
    ? persisted.screen
    : model.initial
  const stack = (persisted?.stack ?? [])
    .filter(id => model.order.includes(id))
    .slice(-SCREEN_STACK_LIMIT)
  return { current, stack }
}

/** The node list for the current screen (initial items when state is stale). */
export function screenItems(model: ScreenModel, state: ScreenState): readonly GenuiNode[] {
  return model.screens[state.current] ?? model.screens[model.initial] ?? []
}

/** `goto`: switch screens and remember where we came from. */
export function goToScreen(model: ScreenModel, state: ScreenState, target: string): ScreenState {
  if (!model.order.includes(target) || target === state.current) return state
  return {
    current: target,
    stack: [...state.stack, state.current].slice(-SCREEN_STACK_LIMIT),
  }
}

/** Back: pop the previous screen; a no-op at the root. */
export function goBackScreen(state: ScreenState): ScreenState {
  const previous = state.stack[state.stack.length - 1]
  if (previous === undefined) return state
  return { current: previous, stack: state.stack.slice(0, -1) }
}

/**
 * Degraded rendering: when the state machine is unavailable, render the
 * initial screen only (the documented fallback for older renderers/caches).
 */
export function degradedScreenItems(model: ScreenModel): readonly GenuiNode[] {
  return model.screens[model.initial] ?? []
}
