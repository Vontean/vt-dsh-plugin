/** 原型通道诊断的稳定标识：判定读 code，不读 message 文案。 */
export type GenuiDiagnosticCode = 'unknown-goto-target' | 'modal-unreachable' | 'nested-modal' | 'screen-budget' | 'unknown-initial';
export interface GenuiDiagnostic {
    readonly kind: 'alias' | 'unknown-field' | 'truncated' | 'dropped' | 'invalid';
    readonly path: string;
    readonly message: string;
    /** 语义标识。新诊断必须带 code；旧诊断按需补齐。 */
    readonly code?: GenuiDiagnosticCode;
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
/**
 * Report modals that can never open: neither a `trigger` nor `open: true`.
 * Repair drops the dead node; this makes the drop visible instead of silent.
 */
export declare function diagnoseUnreachableModals(value: unknown): GenuiDiagnostic[];
/**
 * Screen contract diagnostics: `goto` pointing at an undeclared screen, more
 * screens than the cap, and an `initial` naming no declared screen.
 *
 * None of these block rendering: repair deletes the dead `goto`, drops trailing
 * screens, and falls back to the first screen respectively.
 */
export declare function diagnoseScreenContract(value: unknown, limits: {
    readonly maxScreens: number;
}): GenuiDiagnostic[];
