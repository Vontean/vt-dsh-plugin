import type { AssistantBlock, ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client';
export interface SourceFence {
    lang: string | null;
    value: string;
    openingLineComplete: boolean;
}
/**
 * 按 Markdown 文档顺序读取所有代码围栏。
 *
 * @param markdown - assistant text block 中的 Markdown 内容
 * @returns Markdown AST 中的代码围栏
 */
export declare function sourceFencesOf(markdown: string): SourceFence[];
/**
 * 只从 assistant 的 text blocks 中读取代码围栏。
 *
 * @param blocks - ChatSnapshot 提供的 assistant 内容块
 * @returns 按内容块顺序排列的代码围栏
 */
export declare function sourceFencesOfAssistant(blocks: readonly AssistantBlock[]): SourceFence[];
/**
 * 根据 assistant node key 和围栏序号读取公开 ChatSnapshot 中的 language。
 *
 * @param chat - 当前会话的 ChatSnapshot
 * @param nodeKey - DOM assistant row 对应的 Chat node key
 * @param index - assistant row 内从零开始的宿主代码块序号
 * @returns 规范化后的 language；null 表示围栏没有 language，undefined 表示 source 不可用
 */
export declare function sourceLanguageAt(chat: ChatSnapshot | undefined, nodeKey: string, index: number): string | null | undefined;
