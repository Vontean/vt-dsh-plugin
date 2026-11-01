import type { GenuiIcon } from '../spec.ts';
/**
 * Bare glyph, no wrapper and no plate. Other blocks that need an icon inside a
 * fixed-size box (the steps marker) must use this instead of a text glyph:
 * a character is positioned by its font's ascent/descent inside the line box,
 * so `✓` lands a few px off-centre on some font stacks and cannot be fixed
 * without pinning a font. An SVG is centred by geometry, on every stack.
 */
export declare const IconGlyph: import("react").NamedExoticComponent<{
    name: string;
    size: number;
}>;
export declare const IconNode: import("react").NamedExoticComponent<{
    node: GenuiIcon;
}>;
