import { type GenuiArtifactV1 } from './types.ts';
/** 过滤文件名中的路径符号、控制字符和危险标点。 */
export declare function sanitizeArtifactFilename(title: string | undefined, extension: '.html' | '.genui.json'): string;
/** 触发浏览器下载并释放临时地址。 */
export declare function downloadBlob(blob: Blob, filename: string): void;
/** 下载规范化 GenUI JSON artifact。 */
export declare function downloadGenuiArtifactJson(artifact: GenuiArtifactV1): void;
/** 生成并下载独立 HTML。 */
export declare function downloadGenuiArtifactHtml(artifact: GenuiArtifactV1): Promise<void>;
