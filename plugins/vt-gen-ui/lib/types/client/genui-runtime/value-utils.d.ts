/** Shared primitive sanitizers used by the GenUI guard. */
/** String field: truncate a string to `cap`, or undefined when not a string. */
export declare function str(value: unknown, cap: number): string | undefined;
export declare function color(value: unknown): string | undefined;
/** Keep only http(s) and mailto link targets. */
export declare function safeHref(value: unknown): string | undefined;
/** Keep browser-reachable http(s) or same-origin relative media paths. */
export declare function safeMediaSrc(value: unknown): string | undefined;
/** Finite-number field: clamp into [min, max], or undefined when not finite. */
export declare function num(value: unknown, min: number, max: number): number | undefined;
/** Integer field: clamp into [min, max], or undefined when not a finite number. */
export declare function int(value: unknown, min: number, max: number): number | undefined;
/** Optional enum field: the value when it matches, otherwise undefined. */
export declare function enu<T extends string>(value: unknown, values: readonly T[]): T | undefined;
/** Plain object (not array, not null). */
export declare function obj(value: unknown): Record<string, unknown> | undefined;
/** Preserve an optional field only when its value exists. */
export declare function opt<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>>;
