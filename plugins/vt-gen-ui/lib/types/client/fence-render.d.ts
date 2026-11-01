/**
 * The dsh-ui fence render pipeline used by the DOM observer and renderer tests.
 * An unrepairable body returns `null` so the stock code block stays visible,
 * with {@link FenceDiagnostic} mounted above it (issue #158).
 */
import { type Key, type ReactNode } from 'react';
import type { GenuiSpec } from './spec.ts';
/** Settled fence source identity (data shape, host-independent). */
export interface GenuiFenceSource {
    /** Stable structural id, e.g. `['assistant', seq, block, fence]` or `dom:<anchor>:<i>`. */
    readonly id: string;
    /** Three-part order: [messageSeq, textBlockIndex, fenceIndex]. */
    readonly order: readonly [number, number, number];
}
/** Context a fence renderer receives beside the raw source and React key. */
export interface GenuiFenceContext {
    /** Owning session route; absent outside a session-scoped render. */
    readonly sessionId?: string;
    /** Present only for settled/interrupted renders with a stable identity. */
    readonly source?: GenuiFenceSource;
}
/**
 * Fallback for a ```dsh-ui fence whose body has no finished component yet.
 * Two very different situations land here and they must not be conflated:
 *
 * 1. **Streaming partial** — the reply is still being written and the JSON
 *    simply is not complete. The host marks the streaming message with
 *    `[data-streaming]` on the AssistantMarkdown root, which is an ancestor
 *    of every fence. While that marker is present, a plain code block is the
 *    correct rendering (partial JSON must never look like an error).
 *
 * 2. **Settled defect** — the message is finished but the body still does
 *    not parse as JSON (a malformed fence like a missing `}`) or violates the
 *    native chart contract. This used to fail silently: the fence degraded to
 *    a code block with no hint, and the author had no way to know the UI never
 *    rendered. Once the streaming marker is gone, surface a compact diagnostic
 *    so the defect is visible instead of silent.
 */
/**
 * Explain why a ```dsh-ui body cannot render, as the one-line message both
 * channels show. Returns null when there is nothing to report (the body is
 * renderable, or it is an empty/streaming half).
 *
 * @param raw - the raw fence body.
 * @param options - whether settled-only structural repair may be used.
 * @returns the diagnostic text, or null.
 */
export declare function describeFenceFailure(raw: string, options?: {
    settled?: boolean;
}): string | null;
/**
 * The visible diagnostic for a settled, unrenderable ```dsh-ui body.
 *
 * The DOM channel renders this above the host's stock code block. A
 * fence that keeps degrading to raw JSON must say why it degraded — the
 * console-only path left the defect invisible (issues #158/#172).
 *
 * @param raw - the raw fence body.
 * @returns the alert strip, or null when the body has nothing to report.
 */
export declare function FenceDiagnostic({ raw, settled }: {
    raw: string;
    settled?: boolean;
}): ReactNode;
/**
 * Resolve a raw fence body to a guarded spec.
 *
 * - Tier-1 repair (quote escape + trailing commas): safe at any time —
 *   adopted only when the whole body parses, so a still-growing streaming
 *   half keeps falling back to the code block, never flashing a banner.
 * - Tier-2 completion (missing quotes/brackets): settled renders only —
 *   `context.source` exists exclusively once the message finished, so
 *   streaming halves are never completed early.
 * - Native chart semantics are checked before repair on every candidate so
 *   aliases, empty collections, or line/donut series cannot repair into a
 *   default/blank chart.
 */
export declare function resolveGenuiSpec(raw: string, context?: GenuiFenceContext): GenuiSpec | null;
/**
 * The resolved fence render for the DOM channel: `null` when the body is
 * unrepairable (the stock code block stays visible), otherwise the panel
 * publisher (`panel:true`; renders nothing in the flow — mounted as an empty
 * root so the taken-over block is hidden) or the inline GenuiBlock tree.
 * Shared verbatim by both channels.
 */
export declare function renderResolvedFenceNode(raw: string, key: Key, context?: GenuiFenceContext): ReactNode | null;
/**
 * Render a complete fence body for renderer-level tests.
 */
export declare function renderGenuiFence(raw: string, key: Key, context?: GenuiFenceContext): ReactNode;
