export interface GenuiDiagnostic {
    readonly kind: 'alias' | 'unknown-field' | 'truncated';
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
