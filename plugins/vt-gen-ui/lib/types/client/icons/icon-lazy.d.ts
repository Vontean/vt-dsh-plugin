import { type BundledIcon } from './icon-data.ts';
/** Is `name` a real catalogue entry (even if its shapes are not downloaded)? */
export declare function isKnownIcon(name: string): boolean;
/** Resolve a glyph if its shapes are already available, synchronously. */
export declare function resolveIcon(name: string): BundledIcon | undefined;
/**
 * Subscribe to the one-shot full-catalogue load. Used by mounted `icon` nodes
 * to swap their fallback dot for the real glyph.
 * @returns unsubscribe.
 */
export declare function onIconsLoaded(listener: () => void): () => void;
/**
 * Fetch the full catalogue once. A failed load stays failed for the page (the
 * glyphs keep their fallback), matching the asset loader's memoized-rejection
 * contract — retrying on every render would turn a missing route into a
 * request storm.
 */
export declare function ensureIcons(): Promise<void>;
