/**
 * Catalog derivations: the model-facing prompt sections, the full component
 * reference appended to the genui skill, and the prototype render type list.
 *
 * Everything here is derived from `definitions.ts` (fields/required/enums) and
 * `docs.ts` (grouping/summary/gotchas). `assertCatalogCoherence()` runs at
 * module load: a schema without a doc, a doc without a schema, or a type missing
 * from the prompt order throws instead of shipping a half-generated prompt.
 */
import { PROTOTYPE_TYPES } from './definitions.ts';
import type { PrototypeType } from './definitions.ts';
export { PROTOTYPE_TYPES };
export type { PrototypeType };
/** Every type in prompt order. */
export declare const CATALOG_TYPES: readonly string[];
/**
 * The system prompt's "Allowed type values" list: one line per category.
 * New catalog entries appear here automatically.
 */
export declare function componentListPrompt(): string;
/**
 * The system prompt's field quick reference: only components whose required
 * shape is easy to get wrong carry a `quickRef` in the catalog.
 */
export declare function fieldQuickRefPrompt(): string;
/**
 * The system prompt's "wrong field name" paragraph. Every clause starts with
 * its component type, so the generated text stays scannable.
 */
export declare function fieldGotchaPrompt(): string;
/**
 * Full component reference appended to the genui skill at runtime. This
 * replaces the hand-written field table that used to live in SKILL.md: it is
 * generated from the same definitions the validator and renderer use.
 */
export declare function catalogReferenceMarkdown(): string;
/** Which category a type belongs to (used by diagnostics/tests). */
export declare function catalogCategoryOf(type: PrototypeType): string;
/**
 * Compose the genui skill body: the orchestration guide from SKILL.md plus the
 * generated field reference. SKILL.md intentionally carries no hand-written
 * field table, so this is the only place the reference is attached.
 */
export declare function composeSkillContent(skillBody: string): string;
/** The system prompt paragraph advertising the optional multi-screen machine. */
export declare function prototypeScreensPrompt(): string;
/**
 * The system prompt's complete `Rules:` block, rendered from `CATALOG_RULES`.
 *
 * Prompt behavior depends on this text, so the default rendering is
 * byte-identical to the block it replaced (golden file:
 * `__fixtures__/rules.golden.txt`): `Rules:` header, one `- ` bullet per rule,
 * no trailing newline. `renderUiTool: false` drops the tool-channel rule
 * exactly where the host used to strip it.
 */
export declare function rulesPrompt(options?: {
    renderUiTool?: boolean;
}): string;
