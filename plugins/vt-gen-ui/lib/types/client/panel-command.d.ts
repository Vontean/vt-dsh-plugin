/**
 * /panel slash command + the default panel spec.
 *
 * The session panel dock is an always-present seat, but it only becomes
 * visible once a spec has been published — both existing publish paths
 * (render_ui tool result, panel:true fence) are model-driven. The /panel
 * command gives a deterministic, client-side entry point:
 * - `/panel` — publishes the default spec and requests the dock to expand
 *   instantly, with zero model round-trip;
 * - `/panel clear` (off/close) — empties the panel so the dock retracts;
 * - `/panel <instruction>` — shows the default spec for immediate feedback,
 *   then relays the instruction to the model, which replaces the panel with
 *   content tailored to the request (panel:true fence).
 * Panel updates afterwards still flow through the model (say "update the
 * panel", or re-run render_ui) or through another /panel.
 */
import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { GenuiSpec } from './spec.ts';
type PanelInputTriggerSource = InputTriggerSource & {
    matchClaim: (session: Parameters<InputTriggerSource['onPick']>[0]['session'], token: string, signal: AbortSignal) => Promise<ReturnType<typeof panelClaim> | undefined>;
};
/**
 * Default panel content published by `/panel`: the component overview.
 *
 * Built PER CALL so the panel opens in whatever language is active now,
 * rather than the one that happened to be active at module load.
 */
export declare function defaultPanelSpec(): GenuiSpec;
/**
 * Build the command claim for one session (span CAS is handled by the input).
 * `sendInstruction` relays a /panel instruction to the model when the user
 * typed more than a bare command — otherwise the instruction would be
 * swallowed (the draft is cleared on submit) and the panel would never leave
 * its default content.
 */
declare function panelClaim(sessionId: SessionId, sendInstruction: (sessionId: SessionId, instruction: string) => void): {
    name: string;
    token: string;
    hint: string;
    submit: (args: string, _actx: ClientContext) => Promise<{
        kind: "success";
    }>;
};
/**
 * The /panel source. Menu group `genui` under the '/' trigger; the panel
 * candidate claims the line so both the menu pick and a bare `/panel` enter
 * resolve to the same command. `matchEnter` is implemented so the command
 * works without opening the menu (leading-token adjudication), and it also
 * catches `/panel clear` style args.
 */
export declare function createPanelSlashSource(sendInstruction: (sessionId: SessionId, instruction: string) => void): PanelInputTriggerSource;
export {};
