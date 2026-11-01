import type { GenuiBlocks } from '../spec.ts';
/**
 * Contrast-aware ink for opaque literal fills; theme ink for contextual fills.
 *
 * Uses WCAG relative luminance, not a naive RGB average: the average reads
 * mid-tone blues (#339cff) as "dark" and prints white on a surface that
 * actually needs ink on it.
 */
export declare function readableOn(color: string | undefined): string;
export declare const BlocksNode: import("react").NamedExoticComponent<{
    node: GenuiBlocks;
}>;
