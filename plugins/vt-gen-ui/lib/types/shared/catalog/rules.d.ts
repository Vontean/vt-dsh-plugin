/**
 * System-prompt rule set (single source, H8).
 *
 * The section's `Rules:` block is rendered from this list, so the prompt and
 * the skill cannot drift into two descriptions of the same rule. `section` is
 * the exact terse line the model sees; the system prompt renders this block.
 * (The static SKILL.md rules block is out of scope for now: it has no runtime
 * injection point, so single-sourcing it needs a build-time codegen step.)
 *
 * Order is the order the model reads; do not reorder without a prompt review.
 */
export interface CatalogRule {
    readonly id: string;
    /** Exact bullet text for the system prompt's Rules block (backticked
     *  identifiers included). Rendered with a leading "- ". */
    readonly section: string;
    /** Only rendered when the render_ui tool is registered. */
    readonly requiresTool?: boolean;
}
export declare const CATALOG_RULES: readonly CatalogRule[];
