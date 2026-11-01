export interface ParsedFileLink {
    path: string;
    line?: number;
}
export type LinkTarget = {
    type: 'external';
    href: string;
} | {
    type: 'file';
    file: ParsedFileLink;
} | {
    type: 'invalid';
};
/** Decode a local file destination and its optional first line fragment. */
export declare function parseFileLink(value: string): ParsedFileLink | undefined;
/** Classify a link destination while preserving the existing external URL policy. */
export declare function classifyLinkTarget(value: unknown): LinkTarget;
