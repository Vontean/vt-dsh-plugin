/**
 * Model-facing catalog metadata: how each component is grouped in the prompt,
 * how it is one-line described, and the gotchas worth repeating.
 *
 * Kept beside `definitions.ts` because the prompt, the validation schema, and
 * the render registry must all agree on the same set of types — `derive.ts`
 * asserts that agreement at module load, so adding a schema without a doc (or
 * the reverse) fails loudly instead of silently drifting.
 */
export type CatalogCategoryKey = 'layout' | 'display' | 'chart' | 'interactive' | 'advanced';
export interface CatalogCategory {
    readonly key: CatalogCategoryKey;
    /** Prompt label, e.g. 布局. */
    readonly label: string;
    /** Types in prompt order. Every schema type appears exactly once. */
    readonly types: readonly string[];
    /** Text appended after the last type of the group. */
    readonly tail?: string;
}
export interface CatalogDoc {
    readonly category: CatalogCategoryKey;
    /** One sentence the model sees in the generated component reference. */
    readonly summary: string;
    /** Appended after the type name in the system prompt's component list. */
    readonly promptInline?: string;
    /** Compact required-field shape used by the field quick reference. */
    readonly quickRef?: string;
    /** Clauses in the system prompt's "wrong field name" paragraph (type name is prepended). */
    readonly gotcha?: readonly string[];
    /** Extra usage hint for the generated skill reference. */
    readonly usage?: string;
}
/** Prompt grouping. Order is the order the model reads; keep it stable. */
export declare const CATALOG_CATEGORIES: readonly CatalogCategory[];
export declare const CATALOG_DOCS: Readonly<Record<string, CatalogDoc>>;
/**
 * Root-level multi-screen contract. It is not a component: `screens` /
 * `initial` live on the spec root, and `goto` is a cross-cutting node hint.
 * Kept in the catalog so the prompt, the generated reference and the guard
 * assertions describe the same contract.
 */
export declare const SCREEN_SPEC_DOC: {
    readonly prompt: "**多屏原型**（可选）：spec 根可写 `{\"screens\":{\"home\":[...],\"detail\":[...]},\"initial\":\"home\"}` 代替 `items`；可交互节点（当前为 `button`）加 `\"goto\":\"detail\"` 在本地切屏，不发 action、不请求模型。块头部出现「返回」；未声明的屏 id 被忽略，表单值与当前屏随块持久化。并排比较方案时给顶层 `page` 写 `label`（≤12 字）作角标，优先于自动「屏 N · 标题」。";
    readonly reference: "### 多屏原型（根级字段，不是组件）\n\n- 根字段 `screens`（屏 id → 节点数组，最多 12 屏）与 `initial`（起始屏，缺省取第一个声明的屏）；与 `items` 二选一。\n- 公共节点字段 `span`（grid 占列）和 `goto`（切屏目标）对所有 type 都可写；`goto` 目前由 `button` 触发，其他节点携带但不动作。\n- 切屏是本地状态机：不发 action、不请求模型；「返回」回上一屏，栈深 20，未声明的目标忽略。";
};
