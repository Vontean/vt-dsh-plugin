import { type GenuiArtifactV1 } from './types.ts';
/** 使用已下载的运行文件生成完整的独立 HTML 文档。 */
export declare function createStandaloneHtmlDocument(artifact: GenuiArtifactV1, bundles: ReadonlyMap<string, Uint8Array>, baseURI?: string): string;
/** 获取独立运行文件及规格实际使用的图形引擎，生成单文件 HTML。 */
export declare function buildStandaloneHtml(rawArtifact: GenuiArtifactV1): Promise<string>;
