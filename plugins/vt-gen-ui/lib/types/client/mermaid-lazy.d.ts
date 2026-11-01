export { assertSafeSvg, ensureFlowchartKind, repairMermaidSource } from './mermaid-safe.ts';
/**
 * Render mermaid source to an SVG string (engine loaded on demand).
 * @param code - the mermaid diagram source.
 * @param options - abort signal for queued or superseded work.
 * @returns the rendered SVG markup (verified free of script/event handlers).
 * @throws when the asset cannot load, the kind is not whitelisted, rendering
 *   fails, or the output fails the sanitization check.
 */
export declare function renderMermaid(code: string, options?: {
    signal?: AbortSignal;
    target?: HTMLElement;
}): Promise<string>;
