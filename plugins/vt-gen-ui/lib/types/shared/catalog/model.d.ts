/** Catalog model types: the shape of one component definition.
 *  Moved out of `client/genui-runtime/schema.ts` so the host (prompt
 *  generation) and the client (validation/render) share one definition source. */
export type ComponentFieldKind = 'string' | 'string-or-null' | 'number' | 'boolean' | 'nodes' | 'array' | 'object' | 'unknown';
/** A conditional rule for fields whose presence depends on another field. */
export interface ComponentConditionalRule {
    readonly kind: 'required-if';
    readonly when: {
        readonly field: string;
        readonly equals: unknown;
    };
    readonly required: readonly string[];
    readonly message?: string;
}
/** A field rule that requires at least one member of a field group. */
export interface ComponentOneOfRule {
    readonly kind: 'one-of-required';
    readonly fields: readonly string[];
    readonly message?: string;
}
/** Runtime metadata naming a component-specific semantic validator. */
export interface ComponentValidatorMetadata {
    readonly name: string;
    readonly [key: string]: unknown;
}
/** Runtime schema for an object nested inside a native component field. */
export interface ComponentRecordSchema {
    readonly required: readonly string[];
    readonly fields: Readonly<Record<string, ComponentFieldKind>>;
    readonly enums: Readonly<Record<string, readonly string[]>>;
    readonly nested: Readonly<Record<string, ComponentRecordSchema>>;
    /** Field-name aliases applied to each record before validation/repair. */
    readonly aliases: Readonly<Record<string, string>>;
}
export interface ComponentSchema {
    readonly required: readonly string[];
    readonly fields: Readonly<Record<string, ComponentFieldKind>>;
    readonly enums: Readonly<Record<string, readonly string[]>>;
    /** Explicit optional field kinds; `fields` remains the complete field map. */
    readonly optional: Readonly<Record<string, ComponentFieldKind>>;
    readonly aliases: Readonly<Record<string, string>>;
    /** Written enum values deterministically mapped to canonical ones (field → value → canonical). */
    readonly valueAliases: Readonly<Record<string, Readonly<Record<string, string>>>>;
    readonly oneOfRequired: readonly (readonly string[])[];
    readonly conditionalRequired: readonly ComponentConditionalRule[];
    readonly rules: readonly (ComponentOneOfRule | ComponentConditionalRule)[];
    readonly nested: Readonly<Record<string, ComponentRecordSchema>>;
    readonly validator?: ComponentValidatorMetadata;
}
