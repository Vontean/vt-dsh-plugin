/**
 * i18n runtime — the single source of user-facing text for the browser half.
 *
 * Every string the USER reads (panel chrome, primitive labels, template
 * center, achievements, component chrome, in-page error text) resolves
 * through `t(key)` instead of being written into the component. Two
 * dictionaries ship: `en` and `zh`.
 *
 * Locale resolution, in priority order:
 *  1. An explicit {@link setLocale} call — the host locale bridge uses this
 *     to mirror the DSH language preference.
 *  2. The browser's ordered language list (`navigator.languages`).
 *  3. {@link FALLBACK_LOCALE} (English).
 *
 * English is also the per-key fallback: a key missing from the active
 * dictionary resolves against `en` before degrading to the key itself, so a
 * partially translated dictionary can never blank out the UI.
 *
 * MODEL-FACING text is deliberately NOT routed through here. The `[genui-action]`
 * prompts and the fence vocabulary injected into the system prompt are a
 * protocol between the plugin and the model, not chrome the user reads;
 * translating them would change model behaviour rather than the UI language.
 */
import { EN } from './en.ts';
/** Locale ids this package ships dictionaries for. */
export type LocaleId = 'en' | 'zh';
/** The locale used when nothing else resolves, and the per-key fallback. */
export declare const FALLBACK_LOCALE: LocaleId;
/** Locale ids in display order. */
export declare const LOCALE_IDS: readonly LocaleId[];
/** A flat dictionary: key → template string with `{name}` placeholders. */
export type LocaleDict = Record<string, string>;
/** Key domain of the shipped dictionaries (English is the complete set). */
export type GenuiTextKey = keyof typeof EN;
/** Narrow an arbitrary BCP 47-ish tag onto a shipped locale, or undefined. */
export declare function normalizeLocale(tag: string | undefined | null): LocaleId | undefined;
/** Resolve the browser's preferred shipped locale, else the fallback. */
export declare function detectLocale(): LocaleId;
/** The active locale id. */
export declare function getLocale(): LocaleId;
/**
 * Snapshot for `useSyncExternalStore`: bumped on every locale change, so a
 * component reading text through {@link t} re-renders when the user switches
 * language. Stable between changes (uSES-safe).
 */
export declare function getLocaleRevision(): number;
/** Subscribe to locale changes. Returns an idempotent unsubscribe. */
export declare function subscribeLocale(fn: () => void): () => void;
/**
 * Switch the active locale. Unknown or unshipped tags are ignored (the UI
 * keeps whatever it had rather than blanking out). Re-setting the current
 * locale is a no-op: republishing would churn every subscriber for nothing.
 */
export declare function setLocale(tag: string | LocaleId): void;
/**
 * Translate a key in the active locale.
 *
 * Lookup chain: active dictionary → English → the key itself. Returning the
 * key (rather than an empty string) keeps an untranslated surface diagnosable
 * in a screenshot instead of silently blank.
 */
export declare function t(key: GenuiTextKey | string, params?: Record<string, unknown>): string;
/** Read a full dictionary (the host locale bridge registers these). */
export declare function dictOf(id: LocaleId): LocaleDict;
