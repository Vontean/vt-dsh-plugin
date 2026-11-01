/**
 * Streaming placeholder for a `dsh-ui` fence whose body is still arriving.
 *
 * The surface is a dot matrix whose radius and alpha are driven by two blobs
 * travelling along their own paths — the "dot wave" loading field from the
 * quick-visualize `chart-loading` asset, ported here: a streaming block should
 * read as texture, not as a stack of grey bars.
 *
 * Kept from the original: 12px dot pitch at 1x (divided by dpr), 30fps cap, the
 * edge mask + low base opacity, a single static frame under
 * `prefers-reduced-motion`, and no work while the document is hidden.
 * @module dsh-vt-gen-ui/client/stream-skeleton
 */
import { useEffect, useRef } from 'react'
import css from './GenuiBlock.module.css'

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))
const smooth = (v: number): number => v * v * (3 - 2 * v)
const cubic = (v: number): number => (v < 0.5 ? 4 * v * v * v : 1 - ((-2 * v + 2) ** 3) / 2)
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
const random = (a: number, b: number): number => lerp(a, b, Math.random())
/** Ping-pong 0→1→0 so a blob never snaps back to its start. */
const cycle = (t: number): number => {
  const p = t % 1
  return p < 0.5 ? p * 2 : 2 - p * 2
}

interface Wave {
  /** Value at time `t` (ms), oscillating between the two random bounds. */
  step: (t: number) => number
}

/** One travelling coordinate: ping-pong between `from` and `to` bounds. */
function makeWave(
  from: readonly [number, number],
  to: readonly [number, number],
  baseDuration: number,
  ease: (v: number) => number,
): Wave {
  const a = random(from[0], from[1])
  const b = random(to[0], to[1])
  // Every blob gets its own period, so the field never repeats a recognizable
  // pattern; the 1.2 factor is the original's channel count.
  const duration = baseDuration * 1.2 * random(1, 1.35)
  const phase = Math.random()
  return { step: (t: number) => lerp(a, b, ease(cycle(t / duration + phase))) }
}

interface Geometry {
  width: number
  height: number
  dpr: number
  spacing: number
  cols: number
  rows: number
}

export function StreamSkeleton() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const mounted = canvasRef.current
    if (mounted === null) return
    const context = mounted.getContext('2d')
    if (context === null) return
    // Typed locals: TypeScript drops the null narrowing above once a value is
    // read inside a hoisted function body, and paint()/resize() both are.
    const canvas: HTMLCanvasElement = mounted
    const ctx: CanvasRenderingContext2D = context

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    // Two blobs sweep the field; two more only animate the dot radius envelope.
    const blobAx = makeWave([0.1, 0.32], [0.68, 0.9], 4500, cubic)
    const blobAy = makeWave([0.1, 0.32], [0.68, 0.9], 6330, smooth)
    const blobBx = makeWave([0.68, 0.9], [0.1, 0.32], 5600, cubic)
    const blobBy = makeWave([0.68, 0.9], [0.1, 0.32], 5750, smooth)
    const radiusA = makeWave([0.42, 0.52], [0.62, 0.75], 3600, smooth)
    const radiusB = makeWave([0.5, 0.62], [0.74, 0.9], 2400, smooth)

    let frame = 0
    let last = 0
    let started = 0
    let stopped = false
    let geometry: Geometry | null = null

    function schedule(): void {
      if (!stopped && frame === 0 && !document.hidden) frame = window.requestAnimationFrame(paint)
    }

    function paint(now: number): void {
      frame = 0
      if (stopped || document.hidden) return
      // The field is texture: 30fps is plenty and keeps streaming cheap.
      if (!reduced.matches && now - last < 1000 / 30) {
        schedule()
        return
      }
      last = now
      if (started === 0) started = now
      const t = reduced.matches ? 0 : now - started
      const g = geometry
      if (g === null || g.width === 0 || g.height === 0) return

      const ax = blobAx.step(t)
      const ay = blobAy.step(t)
      const bx = blobBx.step(t)
      const by = blobBy.step(t)
      const ra = 0.78 * radiusA.step(t)
      const rb = 0.78 * radiusB.step(t)

      ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0)
      ctx.clearRect(0, 0, g.width, g.height)
      ctx.fillStyle = window.getComputedStyle(canvas).color

      const radius = Math.max(0.8, g.spacing * 0.075)
      const originX = (g.width - (g.cols - 1) * g.spacing) / 2
      const originY = (g.height - (g.rows - 1) * g.spacing) / 2
      for (let row = 0; row < g.rows; row += 1) {
        const ny = g.rows === 1 ? 0.5 : row / (g.rows - 1)
        for (let col = 0; col < g.cols; col += 1) {
          const nx = g.cols === 1 ? 0.5 : col / (g.cols - 1)
          // Two soft discs, summed and gamma-shaped: the wave crest is where
          // both blobs overlap, which is what makes it read as motion.
          const alpha = Math.pow(
            clamp01(
              (1 - smooth(clamp01(Math.hypot(nx - ax, ny - ay) / ra))) * 1.2
              + (1 - smooth(clamp01(Math.hypot(nx - bx, ny - by) / rb))) * 0.82,
            ),
            1.18,
          )
          if (alpha <= 0.03) continue
          ctx.globalAlpha = alpha
          ctx.beginPath()
          ctx.arc(originX + col * g.spacing, originY + row * g.spacing, radius, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
      if (!reduced.matches) schedule()
    }

    function resize(): void {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.max(1, window.devicePixelRatio || 1)
      const spacing = Math.max(1, 12 / dpr)
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      geometry = {
        width: rect.width,
        height: rect.height,
        dpr,
        spacing,
        cols: Math.max(1, Math.floor(rect.width / spacing)),
        rows: Math.max(1, Math.floor(rect.height / spacing)),
      }
      schedule()
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    function onVisibility(): void {
      if (document.hidden) {
        window.cancelAnimationFrame(frame)
        frame = 0
        return
      }
      schedule()
    }
    function onMotionPreference(): void {
      window.cancelAnimationFrame(frame)
      frame = 0
      schedule()
    }
    document.addEventListener('visibilitychange', onVisibility)
    reduced.addEventListener('change', onMotionPreference)

    return () => {
      stopped = true
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      reduced.removeEventListener('change', onMotionPreference)
    }
  }, [])

  return (
    <div className={css.skeleton} role="status" aria-label="正在生成界面">
      <canvas className={css.skeletonField} ref={canvasRef} aria-hidden="true" />
    </div>
  )
}
