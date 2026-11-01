/** 保存 repair 所需的原始 table 字段。 */
export interface TableDetailSource {
    columns?: unknown;
    rows?: unknown;
    data?: unknown;
    types?: unknown;
}
/** 保存 repair 后的 table 列和行。 */
export interface PreparedTableRows {
    columns: string[];
    rows: Array<Array<string | number>>;
}
/** 使用 table repair 相同的转换规则处理列和行。 */
export declare function prepareTableRows(table: TableDetailSource): PreparedTableRows | null;
/** 返回 repair 后可显示详情的 table 行。 */
export declare function tableRowsForDetails<Row = unknown>(table: TableDetailSource): Row[];
/** 按照 table renderer 的规则识别分组标题行。 */
export declare function isTableGroupHeaderRow(row: unknown, types: unknown): boolean;
/** 判断详情索引对应的行是否可展开并显示。 */
export declare function isTableDetailReachable(table: TableDetailSource, rowIndex: number): boolean;
