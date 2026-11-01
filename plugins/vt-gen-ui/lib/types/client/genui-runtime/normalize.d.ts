import type { GenuiDiagnostic } from './diagnostics.ts';
/**
 * Normalize a raw GenUI value into canonical field names.
 *
 * Only deterministic aliases and structural aliases are changed. Resource
 * limits, type repair, security filtering, and semantic validation remain in
 * the guard layer. Unknown component types are returned opaque.
 *
 * @param value - Raw GenUI spec or bare native component.
 * @returns Canonical value and stable alias diagnostics.
 */
export declare function normalizeGenuiSpec(value: unknown): {
    value: unknown;
    warnings: GenuiDiagnostic[];
};
