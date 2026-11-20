/**
 * Corner geometry: pair full-round radii with `corner-shape: round`.
 *
 * DSH smooths every corner from its shell stylesheet:
 *   @supports (corner-shape: superellipse(1.5)) {
 *     :root { --dsw-corner-shape: superellipse(1.5) }
 *     *, ::before, ::after { corner-shape: var(--dsw-corner-shape) }
 *   }
 * That superellipse reads as a squircle on rounded rectangles, which is the
 * host's signature look and stays inherited here. It stops being correct once
 * a radius is half the box: a 7px dot turned into a rounded square, avatars and
 * switch knobs lost their circle, pills flattened at both ends. The design
 * spec wants a true circle/pill there, so those rules must reset the shape.
 *
 * Two invariants, both silent when broken (the deformation is subtle at 1x):
 * 1. every `border-radius: 50%` / `999px` rule also declares
 *    `corner-shape: round` in the same block;
 * 2. the plugin never declares a non-round corner shape of its own — rects and
 *    cards keep following whatever the host sets.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../src/client/styles.ts', import.meta.url), 'utf8')
/** Comments would otherwise be captured as part of the following selector. */
const css = source.replace(/\/\*[\s\S]*?\*\//g, '')

/** Innermost rule blocks: `selector { declarations }` (skips @media/@supports wrappers). */
function rules(css: string): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = []
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ selector: match[1]!.trim(), body: match[2]! })
  }
  return out
}

const FULL_ROUND = /border-radius:\s*(?:50%|999px)\s*(?:;|$)/

describe('corner geometry', () => {
  it('pairs every full-round radius with corner-shape: round', () => {
    const unpaired = rules(css)
      .filter(rule => FULL_ROUND.test(rule.body))
      .filter(rule => !/corner-shape:\s*round/.test(rule.body))
      .map(rule => rule.selector)
    expect(unpaired).toEqual([])
  })

  it('lets the host smooth rounded rectangles (no own superellipse/squircle)', () => {
    expect(css).not.toMatch(/corner-shape:\s*(?:squircle|superellipse)/)
  })

  it('covers the full-round rules the board actually renders', () => {
    // Guards against the regex above silently matching nothing after a refactor.
    const fullRound = rules(css).filter(rule => FULL_ROUND.test(rule.body))
    expect(fullRound.length).toBeGreaterThanOrEqual(10)
    for (const selector of ['.dsh-atb-dot', '.dsh-atb-exec-dot', '.dsh-atb-statuspill', '.dsh-atb-chip']) {
      expect(fullRound.some(rule => rule.selector.split(',').map(s => s.trim()).includes(selector))).toBe(true)
    }
  })
})
