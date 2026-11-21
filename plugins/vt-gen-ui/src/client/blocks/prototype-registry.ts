/**
 * Render registry for the prototype components.
 *
 * The catalog decides *which* types exist; this map binds each of them to an
 * implementation. `render-node.tsx` falls back to this map for types outside
 * the legacy 50-way switch, so adding a catalog entry without a renderer
 * leaves the type unrendered (and the coherence test fails) instead of
 * silently dispatching to nothing.
 */
import { createElement, type ComponentType } from 'react'
import { PROTOTYPE_TYPES, type PrototypeType } from '../../shared/catalog/definitions.ts'
import type { GenuiNode } from '../spec.ts'
import { EmptyNode, FieldGroupNode, ListRowNode, LoadingNode, NavNode, PageNode, SplitNode } from './prototype.tsx'
import { ModalNode } from './modal.tsx'
import type { PrototypeRenderProps, RenderPrototypeChildren } from './prototype.tsx'

export interface PrototypeDispatchProps {
  readonly node: GenuiNode
  readonly path: string
  readonly renderChildren: RenderPrototypeChildren
  /** Dispatch depth; 0 means a root node of the block/screen. */
  readonly depth?: number
}

/** Rendered by React (never called directly), so each component keeps its own
 *  hook scope; calling it inline would attach hooks to the dispatcher. */
export type PrototypeRenderer = ComponentType<PrototypeDispatchProps>

/** Erase the per-node generic: dispatch has already chosen the type. */
function bind<N>(component: (props: PrototypeRenderProps<N>) => unknown): PrototypeRenderer {
  const Bound = (props: PrototypeDispatchProps) =>
    createElement(component as unknown as ComponentType<PrototypeRenderProps<N>>, props as unknown as PrototypeRenderProps<N>)
  Bound.displayName = `Prototype(${component.name})`
  return Bound
}

export const PROTOTYPE_RENDERERS: Readonly<Record<PrototypeType, PrototypeRenderer>> = {
  page: bind(PageNode),
  nav: bind(NavNode),
  'list-row': bind(ListRowNode),
  'field-group': bind(FieldGroupNode),
  empty: bind(EmptyNode),
  loading: bind(LoadingNode),
  split: bind(SplitNode),
  modal: bind(ModalNode),
}

/** True for catalog prototype types; used by tests and diagnostics. */
export function isPrototypeType(type: string): type is PrototypeType {
  return (PROTOTYPE_TYPES as readonly string[]).includes(type)
}
