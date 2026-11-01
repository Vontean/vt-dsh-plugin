/**
 * templates.ts — template center data.
 *
 * Each template = a natural-language `instruction` (inserted into the
 * composer on "try it", so the model generates the matching interface via the
 * genui skill) + a VALID `demo` spec (rendered directly by GenuiBlock in the
 * preview, so the user sees the result before deciding). Fields track the
 * real schema in spec.ts / guard.ts (tests/templates.spec.ts validates each
 * one with validateGenuiSpec).
 *
 * Templates double as documentation: they cover layout, data, charts,
 * interaction, quizzes and the advanced families.
 *
 * All display text resolves through the i18n dictionaries, so the list is
 * built PER CALL from the active locale rather than frozen at module load.
 */
import type { GenuiSpec } from './spec.ts';
/** Stable, locale-independent category ids. */
export declare const TEMPLATE_CATEGORIES: readonly ["dashboard", "data", "flow", "chart", "interactive", "quiz", "advanced"];
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];
/** Dictionary key carrying a category's display name. */
export declare function categoryLabelKey(category: TemplateCategory | 'all'): string;
export interface GenuiTemplate {
    id: string;
    /** Stable id; the display name comes from {@link categoryLabelKey}. */
    category: TemplateCategory;
    name: string;
    description: string;
    /** Natural-language instruction inserted into the composer on "try it". */
    instruction: string;
    /** Valid preview spec (≤200 nodes, ≤8 levels deep). */
    demo: GenuiSpec;
}
/**
 * Build the template list in the ACTIVE locale.
 *
 * A function rather than a constant: the user can switch language at runtime,
 * and a module-level array would pin whatever locale happened to be active
 * when the bundle first loaded.
 */
export declare function genuiTemplates(): readonly GenuiTemplate[];
