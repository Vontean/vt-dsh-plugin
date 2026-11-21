/**
 * Prototype-channel components (slice 1): `page`, `nav`, `list-row`,
 * `field-group`.
 *
 * They are page-structure primitives for low-fidelity, in-conversation
 * prototypes. Visual rules stay neutral on purpose (the visual pass is a
 * separate task): structure and semantics first, colours only from host
 * tokens, and every interaction/visual state lives in `data-*` attributes so
 * the style layer can consume attributes instead of joined class names.
 *
 * Part names follow shadcn/ui: `list-row` borrows Item (media / content /
 * title / description / actions), `field-group` borrows Field (group / label /
 * description / error with `role="alert"`). No runtime dependency is added.
 */
import { type ReactNode } from 'react';
import type { GenuiFieldGroup, GenuiListRow, GenuiNav, GenuiNode, GenuiPage } from '../spec.ts';
/** Children are rendered by the dispatcher, never imported (avoids a cycle). */
export type RenderPrototypeChildren = (nodes: readonly GenuiNode[], basePath: string) => ReactNode;
export interface PrototypeRenderProps<N> {
    readonly node: N;
    readonly path: string;
    readonly renderChildren: RenderPrototypeChildren;
}
/**
 * Outer container of a prototype: names `proto-root` (§5.3) so layout that can
 * sit outside a `page` — a root-level nav now, `split` later — can query the
 * root width instead of silently falling back to the viewport. The dispatcher
 * wraps top-level prototype nodes with it.
 */
export declare function PrototypeRoot({ children }: {
    readonly children: ReactNode;
}): ReactNode;
/**
 * Wrap a dispatched prototype node in the root container when it sits at the
 * top level of the block. Nested nodes inherit the existing root.
 */
export declare function wrapPrototypeRoot(rendered: ReactNode, depth: number, key: number): ReactNode;
/** `page`: optional title bar + content area; the root of a prototype screen. */
export declare function PageNode({ node, path, renderChildren }: PrototypeRenderProps<GenuiPage>): ReactNode;
/**
 * `nav`: a navigation *sketch*. Clicking only moves the visual selection —
 * it carries no route and never sends an action. The current item is marked
 * with `data-active` (and `aria-current` / `aria-selected` for AT).
 */
export declare function NavNode({ node }: PrototypeRenderProps<GenuiNav>): ReactNode;
/**
 * `list-row`: one compact object — media slot, title, description, meta and a
 * tail action area. The whole row exposes a single accessible name so a
 * screen reader announces "who / what / when" as one item instead of three
 * unrelated text runs.
 */
export declare function ListRowNode({ node, path, renderChildren }: PrototypeRenderProps<GenuiListRow>): ReactNode;
/**
 * `field-group`: label + control + description + error. Borrows the Field
 * part split. The error is an alert (`role="alert"`), and its id joins
 * `aria-describedby` on the group; `data-invalid` / `data-state` carry the
 * state for CSS instead of conditional class names.
 */
export declare function FieldGroupNode({ node, path, renderChildren }: PrototypeRenderProps<GenuiFieldGroup>): ReactNode;
