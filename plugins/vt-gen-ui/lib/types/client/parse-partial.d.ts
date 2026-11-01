/**
 * Partial GenUI spec parsing: extract the components that are already
 * complete from a still-growing ```dsh-ui fence body, so the UI can render
 * top-down as the model writes — each finished component appears the moment
 * its JSON object closes, instead of the whole block waiting for the fence.
 *
 * Strategy (tolerant, white-list-agnostic, BOUNDED):
 * 1. Full parse first (the common settled case) — at most one.
 * 2. ONE left-to-right scan collects the repair candidates: every position
 *    where the prefix is bracket-balanced (trailing comma / fence tail) and
 *    every top-level `items[]` component close (an unfinished trailing
 *    component is dropped by closing the root array/object). Partial candidates
 *    must parse as a spec root; bare components wait for their own root close.
 *    The ring buffer keeps only the longest-direction candidates (≤ MAX_PARTIAL_REPAIR_ATTEMPTS),
 *    so the work is O(n) with a hard parse-attempt cap — a pathological
 *    input can never re-scan prefixes or burn seconds in JSON.parse.
 * 3. Candidates are tried longest first; the first that parses as a GenUI
 *    spec wins. Nothing parses → null (streaming partial, wait for more).
 *
 * The result is only ever a PREFIX of the intended spec, so it is always
 * safe to render: components already present are complete and valid.
 *
 * `ponytail:` the 32-candidate / 33-parse budget is the protection ceiling;
 * only real streaming samples proving a recovery shortfall justify switching
 * to a tokenizing parser.
 */
import { type GenuiSpec } from './spec.ts';
/** Default repair-candidate budget (adjustable; see the design doc). */
export declare const MAX_PARTIAL_REPAIR_ATTEMPTS = 32;
/** Override the repair-candidate budget (tests / tuning). */
export declare function setMaxPartialRepairAttempts(n: number): void;
/** One repair candidate: a balanced prefix of the body ending at `end`,
 *  plus the closing brackets to append (empty when already balanced). */
export interface PartialCandidate {
    end: number;
    closingSuffix: string;
}
/** Single left-to-right pass over the raw body. Tracks the bracket stack
 *  (skipping strings/escapes correctly) and records:
 *  - every position where the prefix is fully balanced (trailing comma or
 *    fence tail) — candidate with an empty closing suffix;
 *  - every top-level `items[]` component close — candidate with the root
 *    array/object closed (an unfinished trailing component is dropped). Nested
 *    object closes are not candidates because their component is still partial.
 *  Candidates are ring-buffered to the attempts budget (the LAST pushes are
 *  the longest), then returned longest-first, deduplicated by end. The scan
 *  stops at the first unbalanced close — earlier balanced prefixes remain
 *  valid candidates.
 *
 * Exposed for tests (the `scannedChars` diagnostic); not exported from the
 * package entry. The parser calls this exactly once per parse.
 */
export declare function collectPartialCandidates(raw: string): {
    candidates: PartialCandidate[];
    scannedChars: number;
};
/**
 * Parse a possibly incomplete genui spec body.
 * @param raw - the fence body as accumulated so far.
 * @returns a spec containing only finished components, or null when nothing
 *   usable has been written yet.
 */
export declare function parsePartialGenuiSpec(raw: string): GenuiSpec | null;
