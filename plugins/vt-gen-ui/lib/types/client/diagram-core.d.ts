import type { DiagramResolvers } from './diagram-types.ts';
/**
 * Render Mermaid source to an SVG string.
 * @param code - the mermaid diagram source (Mermaid 12.1 syntax).
 * @param target - final diagram element whose inherited font and width are used.
 * @returns the rendered SVG markup (verified free of script/event handlers).
 * @throws when pele cannot parse the source, or the output fails the
 *   sanitization check — the caller then shows its raw-source fallback.
 */
export declare function renderMermaid(code: string, target?: HTMLElement, resolvers?: DiagramResolvers): Promise<string>;
