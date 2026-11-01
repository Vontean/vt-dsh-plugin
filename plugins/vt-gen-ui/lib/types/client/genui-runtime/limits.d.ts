/** Resource limits shared by GenUI repair, validation, and rendering. */
export declare const GENUI_LIMITS: {
    /** Maximum nesting depth of the component tree. */
    readonly maxDepth: 8;
    /** Maximum total nodes across the whole spec. */
    readonly maxNodes: 200;
    /** Maximum length of any plain string field. */
    readonly maxString: 2000;
    /** Maximum length of a `code` body. */
    readonly maxCode: 12000;
    /** Copy preview only; clipboard text keeps the existing maxCode limit. */
    readonly maxCopyPreview: 2000;
    readonly maxCopyPreviewLines: 30;
    /** Maximum length of a mermaid source. */
    readonly maxMermaid: 8000;
    /** Maximum `grid` columns. */
    readonly maxGridCols: 12;
    /** Maximum `tabs` count. */
    readonly maxTabs: 12;
    /** Maximum `accordion` items. */
    readonly maxAccordionItems: 24;
    /** Maximum `list` items. */
    readonly maxListItems: 50;
    /** Maximum `select`/`radio` options. */
    readonly maxOptions: 50;
    /** Maximum `table` rows / columns. */
    readonly maxTableRows: 50;
    readonly maxTableCols: 12;
    /** Maximum `chart` data points per series. */
    readonly maxChartPoints: 60;
    /** Maximum `plot` series and per-series parameters. */
    readonly maxPlotSeries: 8;
    readonly maxPlotParams: 6;
    /** Maximum `scene3d` meshes. */
    readonly maxMeshes: 5;
    /** Maximum `quiz` options. */
    readonly maxQuizOptions: 8;
    /** Maximum `steps` / `timeline` / `breadcrumb` / `keyvalue` entries. */
    readonly maxSteps: 24;
    readonly maxTimelineItems: 24;
    readonly maxBreadcrumbItems: 12;
    readonly maxKeyValuePairs: 24;
    /** Maximum `file-tree` nesting. */
    readonly maxTreeDepth: 6;
    /** Maximum `blocks` figure rows / cells per row. Cells are data, not nodes,
     *  so a wide figure still costs one node against `maxNodes`. */
    readonly maxBlocksRows: 14;
    readonly maxBlocksCells: 16;
    /** Maximum `diagram` nodes / edges / zones / focal accents. */
    readonly maxDiagramNodes: 9;
    readonly maxDiagramEdges: 12;
    readonly maxDiagramZones: 3;
    readonly maxDiagramFocal: 2;
    readonly maxDiagramLabel: 14;
    /** Maximum depth of an `echart` option object. */
    readonly maxEChartOptionDepth: 10;
    /** Maximum length of any single array inside an `echart` option. */
    readonly maxEChartArrayLen: 500;
    /** Maximum entries traversed while sanitizing an `echart` option. */
    readonly maxEChartOptionNodes: 2000;
};
