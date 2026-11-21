export interface GenuiDiagnostic {
    readonly kind: 'alias' | 'unknown-field' | 'truncated' | 'dropped';
    readonly path: string;
    readonly message: string;
    readonly type?: string;
    readonly field?: string;
    readonly canonical?: string;
}
/**
 * Diagnose unknown direct fields on native nodes.
 *
 * Unknown types are intentionally skipped so custom renderers retain their
 * opaque extension payloads. Native unknown fields are warnings, not errors.
 *
 * @param value - Canonical or raw GenUI value.
 * @returns Stable field diagnostics in tree order.
 */
export declare function diagnoseUnknownGenuiFields(value: unknown): GenuiDiagnostic[];
/**
 * Report modals nested inside a modal. Repair drops them (a focus trap inside
 * a focus trap is unreachable), so without this diagnostic the model would
 * never learn that half its panel vanished.
 */
export declare function diagnoseNestedModals(value: unknown): GenuiDiagnostic[];
