/** Shared rich text for GenUI labels and content. Data values stay unchanged. */
import { type ReactNode } from 'react';
export declare function hasInlineMarkup(text: string): boolean;
/** Render safe phrasing content, usable in headings, buttons and labels too. */
export declare function renderInline(text: string, allowLinks?: boolean | 'file', depth?: number): ReactNode;
