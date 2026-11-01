/**
 * 把宿主的围栏语言标记规范化成 GenUI 能识别的写法。
 *
 * @param lang - 宿主 markdown 里的原始 language（可能含尾部标点或大小写差异）
 * @returns 规范化后的语言名；无法规范化时返回输入本身
 */
export declare function normalizeFenceLanguage(lang: string): string;
/**
 * 判断语言标记是否指向 GenUI 围栏。
 *
 * @param lang - 宿主暴露的围栏语言（`null` = 围栏没有语言）
 * @returns 规范化为 `dsh-ui` 时返回 true
 */
export declare function isGenuiFenceLanguage(lang: string | null | undefined): boolean;
