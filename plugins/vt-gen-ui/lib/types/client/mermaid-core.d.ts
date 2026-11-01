/**
 * Render mermaid source to an SVG string.
 * @param code - the mermaid diagram source.
 * @param target - final diagram element whose inherited font is used for layout.
 * @returns the rendered SVG markup (verified free of script/event handlers).
 * @throws when the kind is not whitelisted, rendering fails, or the output
 *   fails the sanitization check.
 */
export declare function renderMermaid(code: string, target?: HTMLElement): Promise<string>;
