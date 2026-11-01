/** Runtime metadata shared by GenUI normalization and diagnostics. */
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
/** Canonical enum domains shared by schema validation and repair. */
export declare const TEXT_SIZES: readonly ["display", "h1", "h2", "h3", "body", "muted", "caption"];
export declare const TEXT_ALIGNS: readonly ["left", "center", "right"];
export declare const BUTTON_TONES: readonly ["primary", "danger", "success", "ghost"];
export declare const BADGE_TONES: readonly ["success", "warn", "danger", "accent"];
export declare const INPUT_TYPES: readonly ["text", "email", "password", "color"];
export declare const CALLOUT_TONES: readonly ["info", "success", "warning", "error"];
export declare const CHART_KINDS: readonly ["bars", "line", "donut"];
export declare const PLOT_KINDS: readonly ["line", "area", "scatter"];
export declare const MEDIA_ASPECT_RATIOS: readonly ["16:9", "4:3", "1:1", "9:16"];
export declare const MESH_SHAPES: readonly ["box", "sphere", "cone", "cylinder", "torus"];
export declare const FILE_TYPES: readonly ["file", "dir"];
export declare const DIAGRAM_KINDS: readonly ["architecture", "it-state", "flowchart", "sequence", "state", "er", "timeline", "swimlane", "quadrant", "radar", "loop", "nested", "tree", "org-chart", "layers", "venn", "pyramid", "bar", "line", "gantt", "scatter", "high-level", "process", "medallion", "data-flow", "dp-integration", "dp-security-matrix"];
export declare const DIAGRAM_NODE_TYPES: readonly ["focal", "backend", "store", "external", "input", "optional", "security"];
export declare const DIAGRAM_VARIANTS: readonly ["light", "dark", "editorial"];
export declare const DIAGRAM_EDGE_KINDS: readonly ["solid", "dashed", "accent", "link"];
export declare const DIAGRAM_ROUTES: readonly ["auto", "orthogonal", "straight"];
export declare const ECHART_PRESETS: readonly ["bar", "line", "area", "pie", "scatter", "radar", "gauge", "funnel", "treemap", "sankey", "graph", "heatmap", "bigline", "wordCloud"];
/** Oversized single-number stat (one per fence as the visual anchor). */
export declare const STAT_SIZES: readonly ["hero"];
/** Progress shapes: a track (default) or a circular gauge. */
export declare const PROGRESS_VARIANTS: readonly ["bar", "ring"];
/** Semantic card surfaces. */
export declare const CARD_TONES: readonly ["info", "success", "warning", "danger"];
/** Text run tones (semantic colour without a badge). */
export declare const TEXT_TONES: readonly ["danger", "success", "warning", "info", "muted"];
/** Arrow directions. */
export declare const ARROW_DIRS: readonly ["down", "right"];
/** Row main-axis alignment values. */
export declare const ROW_JUSTIFY: readonly ["start", "center", "end", "between"];
/** Block-row paint modes: filled cells, or outlined cells for bit grids. */
export declare const BLOCKS_VARIANTS: readonly ["fill", "outline", "plain"];
/** 单格强调的语义档位。 */
export declare const BLOCK_CELL_TONES: readonly ["accent", "success", "warning", "danger", "muted"];
/** Icon tones: the four semantic roles plus neutral/muted text colours. */
export declare const ICON_TONES: readonly ["default", "muted", "info", "success", "warning", "danger"];
/** Hero cover tones. */
export declare const HERO_TONES: readonly ["accent", "success", "warning", "danger"];
/** Table cell renderers (`table.types`, one entry per column). */
export declare const TABLE_CELL_TYPES: readonly ["text", "num", "delta", "bar", "badge", "spark", "ring", "index", "group"];
/** Root GenUI specification metadata used by diagnostics. */
export declare const GENUI_SPEC_SCHEMA: ComponentSchema;
/** Backwards-friendly short alias for the root specification schema. */
export declare const SPEC_SCHEMA: ComponentSchema;
/**
 * Native component field metadata.
 *
 * This is intentionally explicit rather than inferred from TypeScript
 * interfaces: the registry is also consumed at runtime by normalization and
 * diagnostics, where erased interfaces are unavailable.
 */
export declare const COMPONENT_SCHEMAS: Readonly<Record<string, ComponentSchema>>;
export declare const GENUI_NATIVE_TYPES: ReadonlySet<string>;
