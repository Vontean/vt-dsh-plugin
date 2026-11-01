import { t, type LocaleId } from './runtime.ts';
export { detectLocale, dictOf, FALLBACK_LOCALE, getLocale, getLocaleRevision, LOCALE_IDS, normalizeLocale, setLocale, subscribeLocale, t, type GenuiTextKey, type LocaleDict, type LocaleId, } from './runtime.ts';
/**
 * Subscribe a component to locale changes.
 *
 * Returns the translate function itself (stable identity — `t` reads the
 * active locale at call time), so a component calls `const t = useT()` and
 * re-renders whenever the language switches.
 */
export declare function useT(): typeof t;
/**
 * Subscribe to locale changes and return the current revision.
 *
 * `t` keeps a STABLE identity on purpose (so it can ride inject surfaces
 * without breaking memoization), which means it cannot serve as a `useMemo`
 * dependency. Use this revision instead when a memoized value embeds
 * translated text.
 */
export declare function useLocaleRevision(): number;
/** Namespace this package registers its dictionaries under on the host. */
export declare const GENUI_LOCALE_NS = "genui";
/**
 * Bridge this package's locale to the DSH host language preference.
 *
 * Hosts that ship `@deepseek-ai/dsh-client-locale` own the user's language
 * choice; GenUI must follow it rather than keep a second, divergent setting.
 * The bridge:
 *  - publishes both dictionaries into the host registry (so host-side
 *    surfaces can read GenUI keys), and
 *  - mirrors the host's active locale into this runtime, now and on change.
 *
 * Hosts WITHOUT the locale service degrade silently to browser detection —
 * the service is read optionally, never declared in `inject`, because a
 * declared-but-absent service parks the fiber forever and would kill all
 * GenUI rendering when the host has no locale service.
 *
 * @param ctx - client cordis context (read optionally).
 * @returns disposer removing the registrations and the subscription.
 */
export declare function bridgeHostLocale(ctx: {
    get?: (name: string) => unknown;
}): () => void;
/** Current locale id, for non-React call sites. */
export declare function currentLocale(): LocaleId;
