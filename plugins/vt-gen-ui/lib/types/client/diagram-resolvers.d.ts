/** The hand-off shape lives in diagram-types so the asset can import the type
 * without pulling this module (and KaTeX) into its bundle. */
import type { DiagramResolvers } from './diagram-types.ts';
/**
 * Typeset with KaTeX, then measure the result. Pele needs a concrete width and
 * height to reserve space in its layout, and KaTeX has no synchronous
 * measurement API, so the markup is briefly mounted off-screen — one forced
 * layout per formula, and diagrams rarely carry many.
 */
export declare function createMathResolver(): NonNullable<DiagramResolvers['math']>;
/**
 * Map a Pele icon reference onto the plugin's own catalogue. Names arrive in
 * the styles diagram authors use (`fa:fa-car`, `fa-car`, `car`), while the
 * catalogue is PascalCase (`Check`, `Chart`), so the lookup strips the prefix
 * and compares case-insensitively with separators removed. Unknown names
 * return undefined and Pele keeps its text fallback.
 */
export declare function createIconResolver(): NonNullable<DiagramResolvers['icons']>;
/** Both resolvers, built once per module load. */
export declare function createDiagramResolvers(): DiagramResolvers;
