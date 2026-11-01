/**
 * Shared types for the resolver hand-off between the client bundle (which owns
 * KaTeX and the icon catalogue) and the lazy Pele asset (which calls them while
 * laying a diagram out). Types only — importing this module costs nothing at
 * runtime, and it keeps the asset from importing client code.
 * @module dsh-vt-gen-ui/client/diagram-types
 */

/** Typeset markup plus the box Pele should reserve for it. */
export interface DiagramMathMarkup {
  html: string
  width: number
  height: number
}

export interface DiagramResolvers {
  /** Typeset TeX found in labels; return undefined to keep the raw source. */
  math?: (tex: string, size: number) => DiagramMathMarkup | undefined
  /** Return SVG markup for an icon reference such as `fa:fa-car`. */
  icons?: (name: string) => string | undefined
}
