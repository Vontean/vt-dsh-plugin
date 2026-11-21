/**
 * GenUI plugin: teaches the model the ```dsh-ui fence syntax for emitting
 * declarative UI components inline in its reply. The browser half renders the
 * fence through GenuiBlock (ui-primitives); this host half only tells the
 * model the language exists, so a session without the plugin simply never
 * emits fences and nothing changes.
 *
 * The section uses the host's centrally allocated structured-output placement.
 * @module dsh-vt-gen-ui
 */
import { Context } from '@deepseek-ai/cordis';
/** The fence language description injected into every assembled system prompt.
 *  Deliberately slim: the `genui` skill carries the full component→field
 *  mapping; this section keeps only the contract that must always be
 *  present (fence syntax, type whitelist, and critical behavioral rules). */
export declare const GENUI_SECTION_TEXT: string;
/**
 * Register the GenUI output-language section and the render_ui tool.
 * @param ctx - cordis context.
 */
export declare const name = "dsh-vt-gen-ui";
export declare const inject: string[];
/**
 * Skill content = the orchestration guide in SKILL.md + the generated field
 * reference. SKILL.md deliberately carries no hand-written field table anymore;
 * appending the catalog derivation keeps the skill complete while leaving one
 * definition source (issue: prompt/schema drift).
 */
export declare function composeGenuiSkillContent(skillBody: string): string;
/**
 * Plugin config as the host passes it (unvalidated: the node half deliberately
 * imports no schema library, so a profile can set these keys directly).
 */
export interface GenuiPluginConfig {
    /**
     * 在最终 dsh-ui 围栏无法渲染的回合中请求模型发送一次修正版（issue #160）。
     * 默认开启，设置为 false 可以关闭同回合围栏修正。GenUI 回合的 reasoning-only 响应仍会交给宿主重试策略处理。
     * 每回合和每个围栏正文最多请求一次，子代理不触发，每次修正请求会消耗模型步数。
     */
    fenceFeedback?: boolean;
    /**
     * 是否注册 render_ui 模型工具。默认开启，设置为 false 时关闭；不影响 validate_dsh_ui 和 dsh-ui 围栏渲染。
     */
    renderUiTool?: boolean;
}
export declare function apply(ctx: Context, config?: GenuiPluginConfig): void;
