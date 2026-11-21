/**
 * Render registry for the prototype components.
 *
 * The catalog decides *which* types exist; this map binds each of them to an
 * implementation. `render-node.tsx` falls back to this map for types outside
 * the legacy 50-way switch, so adding a catalog entry without a renderer
 * leaves the type unrendered (and the coherence test fails) instead of
 * silently dispatching to nothing.
 */
import { type ComponentType } from 'react';
import { type PrototypeType } from '../../shared/catalog/definitions.ts';
import type { GenuiNode } from '../spec.ts';
import type { RenderPrototypeChildren } from './prototype.tsx';
export interface PrototypeDispatchProps {
    readonly node: GenuiNode;
    readonly path: string;
    readonly renderChildren: RenderPrototypeChildren;
    /** Dispatch depth; 0 means a root node of the block/screen. */
    readonly depth?: number;
}
/** Rendered by React (never called directly), so each component keeps its own
 *  hook scope; calling it inline would attach hooks to the dispatcher. */
export type PrototypeRenderer = ComponentType<PrototypeDispatchProps>;
export declare const PROTOTYPE_RENDERERS: Readonly<Record<PrototypeType, PrototypeRenderer>>;
/** True for catalog prototype types; used by tests and diagnostics. */
export declare function isPrototypeType(type: string): type is PrototypeType;
