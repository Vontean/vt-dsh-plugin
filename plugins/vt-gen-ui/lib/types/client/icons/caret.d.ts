/**
 * The block's only caret: a filled triangle pointing right, drawn in a 16×16
 * box whose ink is centred on (8, 8).
 *
 * Why not the `▸` character: a glyph is placed by its font's ascent/descent and
 * its ink sits off-centre in the em box, so once the container is 10px wide —
 * or the mark is rotated 90° — the triangle lands a couple of px off the box
 * centre. The file tree, the accordion, the table detail rows and the chart
 * groups all rotate this mark, so they all share one definition.
 */
export declare function CaretGlyph({ size }: {
    size?: number;
}): import("react").JSX.Element;
