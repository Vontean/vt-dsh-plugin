/**
 * Prototype-channel components: `page`, `nav`, `list-row`, `field-group`
 * (slice 1) plus `empty`, `loading`, `split` (slice 3).
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
import type { GenuiEmpty, GenuiFieldGroup, GenuiListRow, GenuiLoading, GenuiNav, GenuiNode, GenuiPage, GenuiSplit } from '../spec.ts';
/** Children are rendered by the dispatcher, never imported (avoids a cycle). */
export type RenderPrototypeChildren = (nodes: readonly GenuiNode[], basePath: string) => ReactNode;
export interface PrototypeRenderProps<N> {
    readonly node: N;
    readonly path: string;
    readonly renderChildren: RenderPrototypeChildren;
    /** Dispatch depth; 0 means a root node of the block/screen. */
    readonly depth?: number;
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
export declare function PageNode({ node, path, renderChildren, depth }: PrototypeRenderProps<GenuiPage>): ReactNode;
/**
 * `nav`: a navigation *sketch*. Clicking only moves the visual selection —
 * it carries no route and never sends an action.
 *
 * All three shapes are PAGE navigation, so the current item is
 * `aria-current="page"`; the former `role="tab"`/`aria-selected` made screen
 * readers announce bottom tabs as a tab widget, which they are not.
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
/**
 * `empty`: a real empty state. No dashed frame — that is the "structure not
 * decided" signal, and using it here makes reviewers skip the state as
 * unfinished instead of discussing it.
 */
export declare function EmptyNode({ node, path, renderChildren }: PrototypeRenderProps<GenuiEmpty>): ReactNode;
/**
 * `loading`: skeleton placeholder. The width sequence is dealt here, not
 * written by the model — a `width` field would be a second source of truth
 * for a purely visual decision.
 */
export declare function LoadingNode({ node }: PrototypeRenderProps<GenuiLoading>): ReactNode;
/**
 * `split`: two panes at a fixed ratio. It paints no surface and no padding of
 * its own — the boundary belongs to the `page` each pane carries, and the
 * optional divider is the single exception (`divider: true`).
 */
export declare function SplitNode({ node, path, renderChildren }: PrototypeRenderProps<GenuiSplit>): ReactNode;
