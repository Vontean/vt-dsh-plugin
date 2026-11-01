import { type Root } from 'react-dom/client';
import type { Context } from '@deepseek-ai/cordis';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import { type FileLinkAvailability } from './file-link-context.tsx';
/** Override the React root factory (tests / tuning). */
export declare function setDomRootFactory(factory: (container: HTMLElement) => Root): void;
/**
 * Resolve source language for the host code surface at its assistant-row ordinal.
 *
 * @param ctx - active plugin context
 * @param block - host Markdown CodeBlock element
 * @returns source language, null for an unlabelled fence, or undefined when unavailable
 */
export declare function sourceLanguageOf(ctx: Context, block: Element): string | null | undefined;
/**
 * Resolve a host CodeBlock's zero-based ordinal among assistant Markdown surfaces.
 *
 * @param row - owning assistant row
 * @param block - host Markdown CodeBlock element
 * @returns source-order ordinal or -1 when the element is not a host code surface
 */
export declare function hostFenceIndexOf(row: Element, block: Element): number;
/**
 * Install the DOM render channel. Returns a disposer that restores every
 * taken-over block and disconnects the observers.
 *
 * @param ctx - the client context (sessions service for the current session).
 * @param sendAction - plugin-owned relay: (sessionId, action, payload) → the
 *   scoped conversation send carrying the `[genui-action]` prompt.
 */
export declare function installDomFenceRenderer(ctx: Context, sendAction: (sessionId: SessionId, action: string, payload: Record<string, unknown>) => void, fileLinkAvailability?: FileLinkAvailability): () => void;
