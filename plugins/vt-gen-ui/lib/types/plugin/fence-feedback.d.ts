/**
 * Fence feedback loop (issue #160): a reply whose ```dsh-ui fence the guard
 * cannot render should not stay broken for the reader. The host's
 * `agent/turn-stopping` boundary lets a plugin steer input into the SAME turn —
 * the machine re-reads its inbox and runs another step instead of closing
 * (see the `dsh-agent` runtime contract) — so the model can resend a corrected
 * fence while the user is still looking at the raw JSON.
 *
 * The loop is deliberately narrow, matching the contract agreed on the issue:
 * - **默认开启。** 插件配置中的 `fenceFeedback: false` 可以关闭回合转向。
 * - **修正上限。** 每个 turn 最多发送两条 correction；render failure 和 delivery reminder 共用上限，
 *   每个 fence body 在当前回合中最多修正一次，新回合可重新修正。
 * - **仅含 reasoning 的恢复。** 已验证的 GenUI 回合若只以 reasoning block 结束，使用宿主的
 *   `EMPTY_RESPONSE` retry policy。
 * - **Never for subagents.** A child session's fence belongs to a parent reply.
 * - **Shared fence matching.** GenUI labels use the renderer's case/punctuation
 *   normalization. Unrelated labels such as ` ```dsh-ui-dark `, indented prose,
 *   and mentions of the name are never rewritten.
 * - **Accounted before sending.** The fingerprint is recorded before `steer`,
 *   so a re-entrant boundary cannot deliver the same correction twice.
 * - **Cancellation-aware.** An aborted turn or a missing session is left alone.
 *
 * 检查会复用 renderer 在回合结束后的流程，包括 JSON 修复和坏节点清理；
 * 已经可以渲染的最终回复不会收到修正请求。
 * @module dsh-vt-gen-ui/plugin/fence-feedback
 */
import type { Context } from '@deepseek-ai/cordis';
import type { UserMessage } from '@deepseek-ai/dsh-session';
/** Plugin name recorded on every message this loop steers. */
export declare const FEEDBACK_PLUGIN_NAME = "dsh-vt-gen-ui";
/** Source kind persisted by this plugin in Session format v4. */
export declare const FEEDBACK_SOURCE_KIND: "plugin:dsh-vt-gen-ui";
/**
 * 同一个 turn 内 fence-feedback correction 的共享上限。
 * Render failure 和 nothing-delivered reminder 共用该 budget；各自的 ledger 独立阻止重复修正。
 */
export declare const MAX_CORRECTIONS_PER_TURN = 2;
/** One ```dsh-ui fence found in an assistant reply. */
export interface ExtractedFence {
    /** Raw body between the fences (no delimiters). */
    readonly raw: string;
    /** False when the reply ended before the closing fence. */
    readonly closed: boolean;
    /** 1-based position among this reply's fences. */
    readonly index: number;
}
/**
 * Extract every ```dsh-ui fence from one assistant reply.
 *
 * @param text - the assistant message text.
 * @returns the fences in document order (at most {@link MAX_FENCES}).
 */
export declare function extractDshUiFences(text: string): ExtractedFence[];
/** Stable, log-safe identity of one fence body (same body → same fingerprint). */
export declare function fenceFingerprint(raw: string): string;
/** One fence the guard refuses to render, with its model-facing reason. */
export interface FenceFailure {
    readonly index: number;
    readonly fingerprint: string;
    /** Actionable diagnosis, in the same wording the validator tool uses. */
    readonly detail: string;
}
/**
 * Validate every fence in a reply the way the DOM channel would render it.
 *
 * @param text - the assistant message text.
 * @returns the fences that would stay a raw code block, in document order.
 */
export declare function fenceFailures(text: string): FenceFailure[];
/**
 * Build the correction input for a reply with unrenderable fences.
 *
 * @param failures - fences {@link fenceFailures} rejected.
 * @returns the message text to steer into the running turn.
 */
export declare function fenceCorrectionText(failures: readonly FenceFailure[]): string;
/**
 * Create the identified user-role message this loop steers.
 *
 * Mirrors `createUserMessage` from `@deepseek-ai/dsh-llm` (id + role + frozen)
 * without a runtime dependency on that package: the node half of this plugin
 * deliberately imports no `@deepseek-ai/*` values, so a linked or npm-installed
 * copy resolves identically on every host.
 *
 * @param text - the correction text.
 * @param sessionFormatVersion - the format recorded by the active session.
 * @returns a frozen user message attributed to this plugin as a notice.
 */
export declare function createFeedbackMessage(text: string, sessionFormatVersion: number): UserMessage;
/** What the pure planner needs to decide whether a correction may be sent. */
export interface FenceFeedbackPlanInput {
    /** Latest assistant reply text of the current turn. */
    readonly text: string;
    readonly turn: number;
    /** Fence bodies already corrected for a render failure in the current turn. */
    readonly correctedSpec: ReadonlySet<string>;
    /** Turns already given the delivery reminder. */
    readonly deliveryRemindedTurns?: ReadonlySet<number> | undefined;
    /** A `validate_dsh_ui` call happened this turn (formal GenUI signal). */
    readonly validatedThisTurn?: boolean | undefined;
    /** The turn already delivered a body or a successful `render_ui` result. */
    readonly deliveredThisTurn?: boolean | undefined;
    readonly aborted: boolean;
    /** Corrections already steered in this turn (shared hard cap). */
    readonly correctionsThisTurn?: number | undefined;
    /** Turn {@link correctionsThisTurn} counts (stale counts are ignored). */
    readonly correctionsTurn?: number | undefined;
    /** Whether the host has registered the `render_ui` tool. Defaults to enabled. */
    readonly renderUiToolEnabled?: boolean | undefined;
}
/** A correction the caller must account for before steering. */
export interface FenceFeedbackPlan {
    readonly text: string;
    readonly fingerprints: readonly string[];
    readonly turn: number;
    /**
     * `render` corrects a fence that failed to resolve; `delivery` reminds the
     * model that the turn produced nothing formal. They share the per-turn budget
     * but keep separate ledgers.
     */
    readonly kind: 'render' | 'delivery';
}
/**
 * Decide whether this turn boundary should steer a correction — the pure core of
 * the loop, so every bound (per-turn cap, per-fence ledger, cancellation) is
 * testable without a host.
 *
 * The decision is driven by FORMAL events only: fences in the reply body, a
 * `validate_dsh_ui` call, a delivered body text or a successful `render_ui`
 * result. The reasoning block is
 * never read here — a draft inside the thinking block is not proof that the model
 * chose to deliver it, so it must not change any decision.
 *
 * @param input - reply text, turn identity, formal signals, and the accounting.
 * @returns the correction to send, or null when the loop must stay silent.
 */
export declare function planFenceFeedback(input: FenceFeedbackPlanInput): FenceFeedbackPlan | null;
/**
 * Correction for a validated GenUI turn that reached the boundary without any
 * formal delivery.
 *
 * @param turn - turn that reached the boundary.
 * @param attempt - correction number within the shared turn budget.
 * @param renderUiToolEnabled - whether the correction may recommend `render_ui`.
 * @returns the message text to steer into the running turn.
 */
export declare function missingBodyCorrectionText(turn: number, attempt?: number, renderUiToolEnabled?: boolean): string;
/**
 * 注册 GenUI 回合跟踪、宿主重试判定和可选的围栏修正流程。
 *
 * @param ctx - 宿主 Context。
 * @param enabled - 是否启用同回合围栏修正。
 * @param renderUiToolEnabled - 是否已注册 `render_ui` 工具。
 */
export declare function installFenceFeedback(ctx: Context, enabled: boolean, renderUiToolEnabled?: boolean): void;
