/**
 * Shared fence-body JSON repair — pure string functions, no DOM, no I/O.
 * Used by BOTH the client fence renderer (tier-1/tier-2 auto-repair before
 * rendering) and the node-side validate_dsh_ui tool (which returns the
 * repaired JSON to the model instead of making it re-author the fix).
 *
 * Two tiers, deliberately gated differently by the callers:
 * - Tier-1 (`repairFenceJson`): heals the most common model JSON typos that
 *   do NOT change the body's structure — unescaped half-width quotes inside
 *   string values and trailing commas. Safe at any time (streaming included),
 *   adopted only when the WHOLE body parses afterwards.
 * - Tier-2 (`completeFenceJson`): heals structural incompleteness — missing
 *   closing quotes/brackets — by appending the missing terminators, and
 *   skips mismatched closers (a `]` mistyped as `}`, duplicated terminators).
 *   SETTLED MESSAGES ONLY: a streaming half must never be adopted as a
 *   finished prefix.
 * @module dsh-vt-gen-ui/shared/fence-repair
 */
/** A fence body counts as complete when it parses as a whole JSON value. */
export declare function isCompleteJson(raw: string): boolean;
/** Short human-readable reason for a body that fails whole-JSON parsing, or
 * null when it parses. Positions come from the host's JSON.parse error. */
export declare function describeJsonFailure(raw: string): string | null;
/**
 * Tier-1 repair — SAFE AT ANY TIME (streaming included): heals the most
 * common model JSON typos that do NOT change the body's structure, and only
 * when the whole body parses afterwards (so a still-growing streaming half
 * can never be adopted):
 *
 * 1. Unescaped half-width `"` inside a string value — Chinese text quoted
 *    with ASCII quotes (e.g. `对"别名路径"判定失败`), which makes JSON.parse
 *    fail near that quote with "Expected ',' or ']'...".
 * 2. Trailing commas before `}` / `]` or at end of input.
 * 3. Valueless object keys immediately before a complete key-and-colon pair.
 *
 * A shared grammar-aware scan distinguishes object keys from values and
 * checks the continuation after a potential string terminator. Ambiguous
 * value quotes use bounded backtracking; trailing commas are dropped only
 * outside strings.
 *
 * Returns `{ text, repairs }` on success, or null when nothing needed fixing
 * or the body still does not parse (callers fall through to tier-2 / banner).
 */
export declare function repairFenceJson(raw: string): {
    text: string;
    repairs: number;
} | null;
/**
 * 取**第一个平衡根值**的文本（丢弃其后的杂字符）；没有平衡根时返回 null。
 *
 * 与 {@link completeFenceJson} 里的前缀回退同源，但**只做裁剪、不做结构补全**：
 * 内容识别用它来容忍「合法 JSON + 尾部泄漏文本」（真实样本：模型把自己的工具调用
 * 模板泄漏在 JSON 之后，且围栏没闭合）。根值正好结束在末尾时返回 null —— 那种情况
 * `JSON.parse` 本来就会成功。
 *
 * @param text - 候选正文。
 * @returns 平衡根前缀；无可裁剪内容时 null。
 */
export declare function trimToBalancedRoot(text: string): string | null;
/**
 * Tier-2 repair — SETTLED MESSAGES ONLY (never while streaming): heals
 * structural incompleteness — missing closing quotes/brackets — by appending
 * the missing terminators, and heals stray closers — a `]` mistyped as `}` or
 * a duplicated terminator — by skipping closers that do not match the open
 * stack (they cannot be legal JSON). Callers gate it on settled messages (the
 * client uses the host-provided fence source; the validate tool is by
 * definition pre-emission), so a streaming half can never flash premature UI.
 *
 * One shared scan implementation folds the tier-1 fixes (quote escaping +
 * trailing-comma drops) into structural completion, so bodies with BOTH defects
 * (a trailing comma AND a missing closer) heal in one shot — the old
 * two-phase chain lost tier-1's partial work when its whole-body parse
 * failed, and re-scanning the raw text could not compose the repairs.
 * Adopted only when the completed body parses as whole JSON.
 */
export declare function completeFenceJson(raw: string): {
    text: string;
    repairs: number;
} | null;
