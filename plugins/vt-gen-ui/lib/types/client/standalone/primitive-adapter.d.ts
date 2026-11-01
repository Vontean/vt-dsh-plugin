import { type ReactNode } from 'react';
export interface DiffBlockLabels {
    copy: string;
    copied: string;
    codeLabel: string;
    wrapLabel: string;
    unwrapLabel: string;
    collapseAria: string;
    expandAria: (hidden: number) => string;
    collapse: string;
    expand: (hidden: number) => string;
    files: (count: number) => string;
}
export interface JsonTreeLabels {
    copyValue: string;
    copyJson: string;
    copyPath: string;
    copyPrettyJson: string;
    copyCompactJson: string;
    copied: string;
    copyFailed: string;
    collapseNode: string;
    expandNode: string;
    copyButtonTitle: (action: string) => string;
}
/** 在独立页面显示可复制的代码内容。 */
export declare function CodeBlock({ code, lang, copyLabel, copiedLabel }: {
    code: string;
    lang?: string;
    copyLabel?: string;
    copiedLabel?: string;
}): ReactNode;
/** 在独立页面以差异文本显示文件变更。 */
export declare function DiffBlock({ diffs }: {
    diffs: Array<{
        path: string;
        oldText?: string;
        newText?: string;
    }>;
    labels?: DiffBlockLabels;
}): ReactNode;
/** 在独立页面显示 JSON，并提供本地折叠控制。 */
export declare function JsonTree({ data, label, copyable, labels }: {
    data: object | unknown[];
    label?: string;
    copyable?: boolean;
    labels?: JsonTreeLabels;
}): ReactNode;
/** 将文本复制到系统剪贴板。 */
export declare function writeClipboard(text: string): Promise<boolean>;
