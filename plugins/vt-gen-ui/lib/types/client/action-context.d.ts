import type { Context } from 'react';
/** v2 action handler: component action + its collected data. */
export type GenuiActionHandler = (action: string, payload: Record<string, unknown>) => void;
/** Shared action context owned by this plugin. */
export declare const GenuiActionContext: Context<GenuiActionHandler | undefined>;
/** Read the installed action handler, if any. */
export declare function useGenuiAction(): GenuiActionHandler | undefined;
