/**
 * GenUI spec guard: resource limits, structural validation, and deterministic
 * repair for ```dsh-ui fence specs.
 *
 * The renderer path runs every fence body through `repairGenuiSpec` before
 * rendering, so a pathological or hostile spec — deep nesting, thousands of
 * nodes, oversized strings, out-of-range numbers — degrades gracefully instead
 * of stalling the UI. Repair is deterministic and prefix-stable: a component
 * that survives repair of a partial stream keeps its position when later
 * chunks arrive, so streaming re-renders stay consistent.
 *
 * Policy:
 * - Unknown node `type`s pass through untouched (plugin-registered custom
 *   components via `registerGenuiComponent` are opaque to this package).
 * - Known types: required fields must have the right type or the node is
 *   dropped; numbers are clamped into range; strings truncated; arrays
 *   sliced to their caps; containers recursed with a depth budget.
 * - The whole spec carries a node budget; once exhausted, remaining siblings
 *   are elided.
 */
import type { GenuiSpec } from './spec.ts';
import type { GenuiDiagnostic } from './genui-runtime/diagnostics.ts';
/** Result of `validateGenuiSpec`. */
export interface GenuiValidation {
    ok: boolean;
    /** Human-readable problems, empty when `ok`. */
    errors: string[];
}
/**
 * Deterministically repair a raw spec into a renderable GenuiSpec.
 *
 * Alias normalization is performed before the existing resource, type, and
 * security repair rules. The result remains idempotent and keeps the legacy
 * public API used by the fence renderer and client components.
 *
 * @param value - Raw GenUI spec or bare component.
 * @returns Repaired canonical spec, or null for an invalid root.
 */
export declare function repairGenuiSpec(value: unknown): GenuiSpec | null;
/**
 * Count the nodes of a spec tree (every item, descending into tabs /
 * accordion / file-tree / list containers — the same descent
 * `validateGenuiSpec` walks). Shared by the panel fold (node-budget gate)
 * and validation, so the panel never runs a second, divergent traversal.
 * `cap` bounds the walk for hostile inputs; the panel passes
 * `PANEL_LIMITS.maxNodes + 1` to detect overflow without counting the whole
 * tree.
 */
export declare function countGenuiNodes(value: unknown, cap?: number): number;
/** Every white-listed node `type`. Keep in sync with the repairNode switch —
 * validate_dsh_ui uses it to tell declared GenUI nodes apart from unrelated
 * `"type"` strings (e.g. file-tree's `{type:'file'}` children). */
export declare const GENUI_NODE_TYPES: ReadonlySet<string>;
/**
 * Count white-listed nodes declared by a raw spec before repair drops invalid entries.
 * @param value - raw GenUI spec.
 * @param cap - traversal ceiling.
 * @param options - `familyCaps: false` counts beyond per-family policy caps too.
 * @returns declared node count up to the ceiling.
 */
export declare function countDeclaredGenuiNodes(value: unknown, cap?: number, options?: {
    familyCaps?: boolean;
}): number;
/** Count native nodes that survived repair, excluding opaque custom nodes. */
export declare function countRenderedNativeGenuiNodes(value: unknown, cap?: number): number;
/**
 * Return field-level chart errors without changing other repairable component families.
 * @param value - raw GenUI spec.
 * @returns chart semantic errors in tree order.
 */
export declare function validateGenuiChartSemantics(value: unknown): string[];
/**
 * Validate a raw spec value against the white list and limits, collecting
 * human-readable problems. Unlike repair this never mutates: it is a
 * diagnostic for tests and tooling. Unknown `type`s are reported (a plugin
 * custom type is valid only when a renderer is registered — the guard cannot
 * know, so it flags them as warnings).
 *
 * @param value - 未经过别名转换的 GenUI 文档。
 * @returns 完整结构与字段校验结果。
 */
export declare function validateCanonicalGenuiSpec(value: unknown): GenuiValidation;
/**
 * Validate a raw GenUI value after deterministic alias normalization.
 *
 * Validation therefore only sees canonical fields; repairable aliases do not
 * produce false required-field errors. Structural and semantic defects remain
 * errors, while native unknown fields are exposed by the warning diagnostics
 * returned from `processGenuiSpec`.
 *
 * @param value - Raw GenUI spec or bare component.
 * @returns Validation result with human-readable errors.
 */
export declare function validateGenuiSpec(value: unknown): GenuiValidation;
export interface GenuiProcessResult {
    /** Canonical alias-normalized input value. */
    value: unknown;
    /** Alias-normalized value, provided as an explicit descriptive alias. */
    normalized: unknown;
    /** Canonical repaired value consumed by the renderer. */
    repaired: GenuiSpec | null;
    /** Renderer-facing alias for `repaired`. */
    spec: GenuiSpec | null;
    /** Structural and semantic validation errors. */
    errors: string[];
    /** Alias and native unknown-field warnings. */
    warnings: GenuiDiagnostic[];
    /** Native nodes declared in the canonical input, before repair drops. */
    declaredCount: number;
    /** Nodes present in the repaired tree. */
    renderedCount: number;
    /** Native nodes declared before repair, excluding custom payloads. */
    declaredNativeCount: number;
    /** Native nodes present after repair, excluding custom and file-tree data. */
    renderedNativeCount: number;
    /** All rendered component nodes, including opaque custom nodes. */
    renderedTotalCount: number;
}
/**
 * Run the shared canonical GenUI pipeline.
 *
 * The pipeline normalizes aliases, applies the existing deterministic repair
 * and security filters, validates the canonical input, and reports native
 * declarations that disappeared during repair. Custom nodes stay opaque and
 * do not participate in native unknown-field diagnostics.
 *
 * @param value - Raw GenUI spec or bare component.
 * @returns Canonical input, repaired output, diagnostics, and node counts.
 */
export declare function processGenuiSpec(value: unknown): GenuiProcessResult;
/** Return whether the only process errors describe an intentional budget tail cut. */
export declare function isIntentionalBudgetCut(processed: GenuiProcessResult): boolean;
/** Decide whether a repaired spec is safe to expose to any GenUI renderer. */
export declare function isRenderableProcess(processed: GenuiProcessResult): boolean;
/**
 * Best-effort repair for a spec whose strict validation failed: drop the
 * declared nodes the errors point at and re-run the whole pipeline once.
 *
 * The fence channels call this after the strict gate refuses, so ONE bad
 * component no longer degrades the whole fence to a code block — the
 * behaviour the capability map documents ("坏节点静默丢弃…不会拖垮界面") and
 * that validate_dsh_ui keeps diagnosing for the model. Bounded to a single
 * retry: a second failing pass is a genuinely pathological tree and keeps
 * today's full-fence fallback. Chart semantics stay protected the same way —
 * an undrawable chart is DROPPED here, never repaired into a blank canvas.
 */
export declare function partialRepairGenuiSpec(processed: GenuiProcessResult): GenuiSpec | null;
