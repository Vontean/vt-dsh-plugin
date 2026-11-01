/**
 * 中文词典 — 与 en.ts 的键集完全一致（类型强制：缺键/多键都是编译错误）。
 *
 * 这些文案原本硬编码在组件里；此处保留原有措辞，仅把它们搬进词典，
 * 因此中文用户看到的界面与 0.11.0 之前逐字相同。
 */
import type { EN } from './en.ts';
export declare const ZH: Record<keyof typeof EN, string>;
