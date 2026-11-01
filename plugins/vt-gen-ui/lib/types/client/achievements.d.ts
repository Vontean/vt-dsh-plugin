/**
 * achievements.ts — GenUI exploration trophies.
 *
 * Lightweight local trophies: they count USAGE EVENTS only (fences rendered,
 * panels shown, actions sent back, templates tried) and never read message
 * or interface content. State lives in localStorage and survives across
 * sessions. An unlock enters the toast queue (consumed by achievement-toast),
 * and the panel's trophy tab renders its own page through dsh-ui (dogfooding).
 *
 * The design mirrors dsh-achievements' layered snapshot, with zero host
 * changes: every counter sits on this package's own render/interaction paths
 * (GenuiBlock / TemplateDrawer / GenuiPanel).
 *
 * Trophy NAMES and DESCRIPTIONS resolve from the i18n dictionaries at read
 * time (`ach.<id>.name` / `.desc`); only the ids are persisted, so a language
 * switch never orphans an unlocked trophy.
 */
import type { GenuiSpec } from './spec.ts';
/** Cumulative usage counters (the trophy inputs). */
export interface AchieveState {
    /** Distinct fences rendered. */
    fences: number;
    /** Sessions in which the panel dock appeared. */
    panels: number;
    /** Component action round-trips (after debounce). */
    interactions: number;
    /** Templates tried. */
    templates: number;
    /** Fences containing a chart node (chart/plot/echart). */
    charts: number;
    /** Fences containing an advanced node (scene3d/mermaid/diagram). */
    advanced: number;
}
export declare function emptyState(): AchieveState;
export interface AchievementDef {
    id: string;
    /** Display name in the active locale (read through {@link achievementName}). */
    readonly name: string;
    /** Description in the active locale (read through {@link achievementDesc}). */
    readonly description: string;
    /** Hide name/description until unlocked (easter egg). */
    hidden?: boolean;
    /** Rarity tier. */
    rarity: 'common' | 'rare' | 'legendary';
    check: (s: AchieveState) => boolean;
}
/** Localized display name of a trophy. */
export declare function achievementName(id: string): string;
/** Localized description of a trophy. */
export declare function achievementDesc(id: string): string;
/** Localized rarity badge label. */
export declare function rarityLabel(rarity: AchievementDef['rarity']): string;
export declare const ACHIEVEMENTS: readonly AchievementDef[];
/** Count the relevant node families in a spec (same walk as the guard). */
export declare function countSpecKinds(spec: GenuiSpec): {
    charts: number;
    advanced: number;
};
/** Build the trophy page spec (rendered by dsh-ui): progress stats, the
 *  unlock list, and rarity badges — all in the active locale. */
export declare function buildAchievementsSpec(state: AchieveState, unlocked: Record<string, number>): GenuiSpec;
/** New unlocks for a state (hidden trophies included — rules are thresholds). */
export declare function checkAchievements(state: AchieveState, unlocked: Record<string, number>): AchievementDef[];
