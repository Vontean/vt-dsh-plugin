/**
 * dsh-genui browser half: the ```dsh-ui fence renderer, the keyed toolview
 * for the `render_ui` tool, and the session panel dock.
 *
 * Fence rendering uses the stock DSH DOM. `dom-fence.ts` observes the
 * conversation DOM, identifies `dsh-ui` blocks and mounts the renderer in
 * plugin-owned React roots. The plugin-owned GenuiActionContext relays
 * `[genui-action]` through the scoped conversation send.
 *
 * The renderer parses the fence body with the partial parser: while the reply
 * streams, every FINISHED component appears the moment its JSON object
 * closes, so the UI assembles top-down before the fence (or reply) completes.
 * A body with no finished component yet falls back to a plain code block.
 * @module dsh-vt-gen-ui/client
 */
import type { Context } from '@deepseek-ai/cordis';
/** Add low-priority prefetch links for the lazy engine assets (mermaid/three).
 * Browser-dependent: some engines ignore `<link rel=prefetch>`; harmless
 * either way — the on-demand loader still covers a cache miss. Exported for
 * tests. */
export declare function prefetchGenuiAssets(): void;
/** Cordis client entry: install the fence renderer on boot, the keyed
 * toolview for the render_ui tool, and the session panel dock; returning the
 * disposers lets cordis tear all registrations down on plugin unload. */
export declare function apply(ctx: Context): () => void;
export declare const inject: string[];
