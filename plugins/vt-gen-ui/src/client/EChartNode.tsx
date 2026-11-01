/**
 * ECharts node: renders a full ECharts chart from a declarative option
 * object. The echarts engine is lazy-loaded (lib/assets/echarts.js) only when
 * an `echart` node appears — the main client bundle never carries the engine.
 *
 * The `option` field accepts a standard ECharts `EChartsCoreOption`. For
 * simple use cases the `preset` + `data` shorthand builds the option
 * automatically: `preset: 'bar' | 'line' | 'pie' | 'scatter' | 'area'` maps
 * to a themed option template that reads the same `data`/`series` shape as
 * the `chart` node, so a model can upgrade a `chart` to ECharts by changing
 * `type` to `echart` and adding `preset`.
 * @module dsh-vt-gen-ui/client/EChartNode
 */
import { renderInline } from './inline.ts'
import { useEffect, useRef, useState } from 'react'
import css from './GenuiBlock.module.css'
import { createChart as lazyCreateChart, type EChartsInstance } from './echarts-lazy.ts'
import { echartEngineFor } from './echarts-engine.ts'
import { CHART_METRICS, chartFont, chartHeight, chartInk, dataColors, resolveCssColor, type ChartInk } from './chart-theme.ts'
import type { GenuiEChart } from './spec.ts'

/**
 * Read a host theme token, resolved from the ELEMENT first (custom properties
 * inherit, so any node inside `body` sees the host sheet) and falling back to
 * body/root for detached renders.
 */
function readToken(name: string, fallback: string, el?: HTMLElement | null): string {
  const hosts: Array<Element | null> = [el ?? null, typeof document === 'undefined' ? null : document.body, typeof document === 'undefined' ? null : document.documentElement]
  for (const host of hosts) {
    if (host === null) continue
    const value = getComputedStyle(host).getPropertyValue(name).trim()
    if (value !== '') return value
  }
  return fallback
}

/**
 * Canvas height per preset. The shared 176px plot height is right for the
 * simple shapes — it is what the native chart and the plot use, and a row of
 * them lines up. Flows, hierarchies and maps need room to breathe, so those
 * presets keep a taller default; an explicit `height` still wins.
 */
const PRESET_HEIGHT: Readonly<Record<string, number>> = {
  bar: 176, line: 176, area: 176, scatter: 176, gauge: 176, pie: 220, bigline: 220,
  heatmap: 240, radar: 260, funnel: 260, wordCloud: 260, treemap: 300, sankey: 300, graph: 300,
}

/** Read a px-valued font token as a number for ECharts textStyle fields. */
function readFontSize(name: string, fallback: number, el?: HTMLElement | null): number {
  const parsed = Number.parseFloat(readToken(name, '', el))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/** Resolve the host accent and label colors for ECharts theming. */
function themeColors(el?: HTMLElement | null): {
  accent: string
  labelPrimary: string
  labelSecondary: string
  labelTertiary: string
  border: string
  bgLayer1: string
  ink: ChartInk
  fontData: number
  fontMeta: number
  fontDisplay: number
} {
  // EVERY colour must be resolved to a literal: the host defines tokens as
  // `var(--dsw-static-…)`, and getComputedStyle hands the specified text back
  // unresolved. ECharts paints to a canvas, so a `var()` string is not a colour
  // — it silently fell back to ECharts' own default (#333), which is why chart
  // labels were near-invisible in dark mode.
  const color = (name: string, fallback: string): string =>
    resolveCssColor(readToken(name, fallback, el)) ?? fallback
  return {
    accent: color('--dsw-alias-state-business-primary', '#4f8ef7'),
    labelPrimary: color('--dsw-alias-label-primary', '#e6e6e6'),
    labelSecondary: color('--dsw-alias-label-secondary', '#a0a0a0'),
    labelTertiary: color('--dsw-alias-label-tertiary', '#6b6b6b'),
    border: color('--dsw-alias-border-l1', 'rgba(255,255,255,0.12)'),
    bgLayer1: color('--dsw-alias-bg-layer-1', '#1a1a1e'),
    ink: chartInk(el),
    // The --dsl-g-* scale is declared on the .block/.panel roots; the chart
    // container inherits it. Detached renders fall back to these literals.
    fontData: chartFont(el),
    fontMeta: readFontSize('--dsl-g-font-meta', 12.5, el),
    fontDisplay: readFontSize('--dsl-g-font-display', 28, el),
  }
}

/** Build a full ECharts option from a preset + the simple data/series shape.
 *  `el` is the chart's own container: theme tokens are resolved against it so
 *  host colours are found wherever the host defines them. */
function presetOption(node: GenuiEChart, el?: HTMLElement | null): Record<string, unknown> {
  const t = themeColors(el)
  // Each palette slot carries its own fallback hue: if the host lacks the
  // static tokens, series must still be distinguishable (the old code fell
  // back to the accent for every slot, so every chart came out one colour).
  // Same categorical ramp as every other chart family (see chart-theme.ts).
  // ECharts paints to a canvas, so the tokens are resolved to literals here.
  const colors = node.palette !== undefined && node.palette.length > 0
    ? [...node.palette]
    : dataColors(8, el)
  const data = node.data ?? []
  const series = node.series

  // Shared tooltip base: renderMode 'richText' prevents ECharts from writing
  // tooltip content via innerHTML — labels/formatters are model output and
  // must never reach the HTML parser.
  const tt = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    renderMode: 'richText',
    backgroundColor: t.bgLayer1,
    borderColor: t.ink.grid,
    textStyle: { color: t.labelPrimary },
    ...extra,
  })

  const base = {
    color: colors,
    textStyle: { color: t.labelSecondary, fontFamily: 'inherit' },
    backgroundColor: 'transparent',
    grid: { left: 48, right: 16, top: 24, bottom: 32 },
    tooltip: tt({ trigger: 'item' }),
  }

  switch (node.preset) {
    case 'wordCloud': {
      return {
        ...base,
        series: [{
          type: 'wordCloud',
          sizeRange: [16, 64],
          rotationRange: [0, 0],
          gridSize: 8,
          // ECharts needs a real family list; 'inherit' is not one and collapsed
          // the layout. Read the text stack off the chart container.
          textStyle: { fontFamily: typeof document === 'undefined' ? 'sans-serif' : getComputedStyle(el ?? document.body).fontFamily },
          // Word clouds scale by size, not by shade: the lightest ramp steps were
          // unreadable on the page, so only the first four steps are used.
          data: data.map((d, i) => ({ name: d.label, value: d.value, textStyle: { color: colors[i % 4]! } })),
        }],
      }
    }
    case 'pie': {
      return {
        ...base,
        tooltip: tt({ trigger: 'item', formatter: '{b}: {c} ({d}%)' }),
        legend: { bottom: 0, textStyle: { color: t.ink.legend, fontSize: t.fontMeta } },
        series: [{
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: CHART_METRICS.barRadius, borderColor: t.bgLayer1, borderWidth: 2 },
          label: { color: t.labelSecondary, fontSize: t.fontData },
          data: data.map(d => ({ name: d.label, value: d.value })),
        }],
      }
    }
    case 'scatter': {
      // xAxis is 'category' so string labels (e.g. 「一月」) render correctly;
      // the previous `type: 'value'` xAxis could not plot non-numeric labels.
      return {
        ...base,
        tooltip: tt({ trigger: 'item' }),
        xAxis: { type: 'category', data: data.map(d => d.label), axisLine: { lineStyle: { color: t.ink.axis } }, axisLabel: { color: t.ink.label, fontSize: t.fontData }, splitLine: { lineStyle: { color: t.ink.grid } } },
        yAxis: { type: 'value', splitNumber: 4, axisLine: { lineStyle: { color: t.ink.axis } }, axisLabel: { color: t.ink.label, fontSize: t.fontData }, splitLine: { lineStyle: { color: t.ink.grid } } },
        series: [{
          type: 'scatter',
          symbolSize: CHART_METRICS.dot * 2,
          data: data.map(d => d.value),
        }],
      }
    }
    case 'area': {
      return {
        ...base,
        tooltip: tt({ trigger: 'axis' }),
        xAxis: { type: 'category', data: data.map(d => d.label), axisLine: { lineStyle: { color: t.ink.axis } }, axisLabel: { color: t.ink.label, fontSize: t.fontData } },
        yAxis: { type: 'value', splitNumber: 4, axisLine: { lineStyle: { color: t.ink.axis } }, axisLabel: { color: t.ink.label, fontSize: t.fontData }, splitLine: { lineStyle: { color: t.ink.grid } } },
        series: (series ?? [{ label: '', data }]).map((s, i) => ({
          name: s.label,
          type: 'line',
          smooth: true,
          areaStyle: { opacity: 0.15 },
          data: s.data.map(d => d.value),
          ...optItemStyleColor(s.color, i, series),
        })),
        legend: series !== undefined ? { bottom: 0, textStyle: { color: t.ink.legend, fontSize: t.fontMeta } } : undefined,
      }
    }
    case 'line': {
      return {
        ...base,
        tooltip: tt({ trigger: 'axis' }),
        xAxis: { type: 'category', data: data.map(d => d.label), axisLine: { lineStyle: { color: t.ink.axis } }, axisLabel: { color: t.ink.label, fontSize: t.fontData } },
        yAxis: { type: 'value', splitNumber: 4, axisLine: { lineStyle: { color: t.ink.axis } }, axisLabel: { color: t.ink.label, fontSize: t.fontData }, splitLine: { lineStyle: { color: t.ink.grid } } },
        series: (series ?? [{ label: '', data }]).map((s, i) => ({
          name: s.label,
          type: 'line',
          smooth: true,
          showSymbol: true,
          symbolSize: 6,
          data: s.data.map(d => d.value),
          ...optItemStyleColor(s.color, i, series),
          ...optLineDash(i, series),
        })),
        legend: series !== undefined ? { bottom: 0, textStyle: { color: t.ink.legend, fontSize: t.fontMeta } } : undefined,
      }
    }
    case 'radar': {
      // Indicators come from the first series' labels; each series is one
      // polygon. `data` alone is treated as a single unnamed series.
      const entries = series ?? [{ label: '', data }]
      const indicators = (entries[0]?.data ?? []).map(d => ({ name: d.label, max: undefined as number | undefined }))
      const max = Math.max(...entries.flatMap(e => e.data.map(d => Number(d.value) || 0)), 1)
      return {
        ...base,
        tooltip: tt({ trigger: 'item' }),
        legend: { bottom: 0, textStyle: { color: t.ink.legend, fontSize: t.fontMeta } },
        radar: {
          indicator: indicators.map(i => ({ name: i.name, max: Math.ceil(max * 1.1) })),
          splitLine: { lineStyle: { color: t.ink.grid } },
          splitArea: { show: false },
          axisLine: { lineStyle: { color: t.ink.axis } },
          axisName: { color: t.ink.label },
        },
        series: [{
          type: 'radar',
          symbolSize: 5,
          areaStyle: { opacity: 0.12 },
          data: entries.map((e, i) => ({
            name: e.label,
            value: e.data.map(d => Number(d.value) || 0),
            ...optItemStyleColor(e.color, i, series),
          })),
        }],
      }
    }
    case 'gauge': {
      // One gauge per datum (usually a single KPI).
      return {
        ...base,
        tooltip: tt({ trigger: 'item' }),
        series: data.slice(0, 4).map((d, i) => ({
          type: 'gauge',
          startAngle: 210,
          endAngle: -30,
          min: 0,
          max: Math.max(Number(d.value) || 0, 100),
          // Tuned for the shared 176px plot height: the old 82% radius and 58%
          // centre pushed the arc past the canvas and clipped its bottom.
          center: data.length > 1 ? [`${(i + 0.5) * (100 / Math.min(data.length, 4))}%`, '66%'] : ['50%', '66%'],
          radius: data.length > 1 ? '54%' : '72%',
          progress: { show: true, width: 10 },
          axisLine: { lineStyle: { width: 10, color: [[1, t.ink.grid]] } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          pointer: { show: false },
          title: { offsetCenter: [0, '32%'], color: t.ink.label, fontSize: t.fontData },
          detail: { valueAnimation: true, fontSize: t.fontDisplay, offsetCenter: [0, '2%'], formatter: '{value}', color: t.labelPrimary },
          data: [{ value: Number(d.value) || 0, name: d.label }],
        })),
      }
    }
    case 'funnel': {
      return {
        ...base,
        tooltip: tt({ trigger: 'item', formatter: '{b}: {c}' }),
        legend: { bottom: 0, textStyle: { color: t.ink.legend, fontSize: t.fontMeta } },
        series: [{
          type: 'funnel',
          left: '8%',
          width: '84%',
          top: 16,
          bottom: 40,
          gap: 2,
          label: { position: 'inside', color: '#fff', formatter: '{b} {c}' },
          itemStyle: { borderWidth: 0 },
          data: data.map(d => ({ name: d.label, value: Number(d.value) || 0 })),
        }],
      }
    }
    case 'treemap': {
      return {
        ...base,
        tooltip: tt({ trigger: 'item', formatter: '{b}: {c}' }),
        series: [{
          type: 'treemap',
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          upperLabel: { show: false },
          label: { color: t.labelPrimary },
          itemStyle: { borderColor: t.bgLayer1, borderWidth: 2, gapWidth: 2 },
          data: data.map(d => ({ name: d.label, value: Number(d.value) || 0 })),
        }],
      }
    }
    case 'sankey': {
      const links = node.links ?? []
      const names = data.length > 0
        ? data.map(d => d.label)
        : [...new Set(links.flatMap(l => [l.from, l.to]))]
      return {
        ...base,
        tooltip: tt({ trigger: 'item' }),
        series: [{
          type: 'sankey',
          // Room for the node labels: at 8px the right-column names were cut by
          // the canvas edge, which reads as a broken chart.
          left: 64,
          right: 64,
          top: 16,
          bottom: 16,
          nodeGap: 12,
          lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.32 },
          label: { color: t.labelSecondary, fontSize: t.fontData },
          emphasis: { focus: 'adjacency' },
          data: names.map(name => ({ name })),
          links: links.map(l => ({ source: l.from, target: l.to, value: l.value ?? 1 })),
        }],
      }
    }
    case 'graph': {
      const links = node.links ?? []
      const names = data.length > 0
        ? data.map(d => d.label)
        : [...new Set(links.flatMap(l => [l.from, l.to]))]
      // Node size follows its degree, so hubs read as hubs without extra data.
      const degree = new Map<string, number>()
      for (const l of links) {
        degree.set(l.from, (degree.get(l.from) ?? 0) + 1)
        degree.set(l.to, (degree.get(l.to) ?? 0) + 1)
      }
      return {
        ...base,
        tooltip: tt({ trigger: 'item' }),
        series: [{
          type: 'graph',
          layout: 'force',
          roam: true,
          // Labels sit OUTSIDE the node: a 12px label cannot fit inside a 24px
          // circle, so it was clipped to a few characters.
          label: { show: true, position: 'bottom', distance: 4, color: t.labelPrimary, fontSize: t.fontData },
          force: { repulsion: 260, edgeLength: 90 },
          // A 4% grid grey left the edges invisible; edges are structure, not background.
          lineStyle: { color: t.ink.axis, width: 1.2, curveness: 0.1 },
          emphasis: { focus: 'adjacency' },
          data: names.map(name => ({ name, symbolSize: 14 + (degree.get(name) ?? 0) * 4 })),
          links: links.map(l => ({ source: l.from, target: l.to })),
        }],
      }
    }
    case 'heatmap': {
      // Rows come from `series` (one row per entry), columns from the first
      // row's labels — the same shape the other presets use.
      const rows = series ?? [{ label: '', data }]
      const cols = (rows[0]?.data ?? []).map(d => d.label)
      const values = rows.flatMap((row, y) => row.data.map((d, x) => [x, y, Number(d.value) || 0]))
      const max = Math.max(...values.map(v => v[2] as number), 1)
      return {
        ...base,
        tooltip: tt({ trigger: 'item', position: 'top' }),
        grid: { left: 64, right: 16, top: 16, bottom: 48 },
        xAxis: { type: 'category', data: cols, splitArea: { show: false }, axisLabel: { color: t.ink.label, fontSize: t.fontData }, axisLine: { lineStyle: { color: t.ink.axis } } },
        yAxis: { type: 'category', data: rows.map(r => r.label), splitArea: { show: false }, axisLabel: { color: t.ink.label, fontSize: t.fontData }, axisLine: { lineStyle: { color: t.ink.axis } } },
        visualMap: { min: 0, max, calculable: true, orient: 'horizontal', left: 'center', bottom: 0, textStyle: { color: t.ink.legend, fontSize: t.fontMeta } },
        series: [{ type: 'heatmap', data: values, label: { show: values.length <= 60, color: t.labelPrimary }, itemStyle: { borderColor: t.bgLayer1, borderWidth: 2 } }],
      }
    }
    case 'bigline': {
      // Long series: symbols off, area wash, inside + slider zoom.
      return {
        ...base,
        tooltip: tt({ trigger: 'axis' }),
        grid: { left: 48, right: 20, top: 24, bottom: 56 },
        dataZoom: [
          { type: 'inside', start: 0, end: 45 },
          { type: 'slider', height: 16, bottom: 8, borderColor: t.ink.grid, textStyle: { color: t.ink.legend, fontSize: t.fontMeta } },
        ],
        xAxis: { type: 'category', boundaryGap: false, data: data.map(d => d.label), axisLabel: { color: t.ink.label, fontSize: t.fontData }, axisLine: { lineStyle: { color: t.ink.axis } } },
        yAxis: { type: 'value', axisLabel: { color: t.ink.label, fontSize: t.fontData }, splitLine: { lineStyle: { color: t.ink.grid } } },
        series: (series ?? [{ label: '', data }]).map((s2, i) => ({
          name: s2.label,
          type: 'line',
          smooth: true,
          showSymbol: false,
          areaStyle: { opacity: 0.12 },
          data: s2.data.map(d => d.value),
          ...optItemStyleColor(s2.color, i, series),
        })),
        legend: series !== undefined ? { bottom: 26, textStyle: { color: t.ink.legend, fontSize: t.fontMeta } } : undefined,
      }
    }
    default: {
      // 'bar' or unspecified
      return {
        ...base,
        tooltip: tt({ trigger: 'axis', axisPointer: { type: 'shadow' } }),
        xAxis: { type: 'category', data: data.map(d => d.label), axisLine: { lineStyle: { color: t.ink.axis } }, axisLabel: { color: t.ink.label, fontSize: t.fontData } },
        yAxis: { type: 'value', splitNumber: 4, axisLine: { lineStyle: { color: t.ink.axis } }, axisLabel: { color: t.ink.label, fontSize: t.fontData }, splitLine: { lineStyle: { color: t.ink.grid } } },
        series: (series ?? [{ label: '', data }]).map(s => ({
          name: s.label,
          type: 'bar',
          barMaxWidth: 40,
          itemStyle: { borderRadius: [4, 4, 2, 2], ...(s.color !== undefined ? { color: s.color } : {}) },
          data: s.data.map(d => d.value),
        })),
        legend: series !== undefined ? { bottom: 0, textStyle: { color: t.ink.legend, fontSize: t.fontMeta } } : undefined,
      }
    }
  }
}

/** Per-series itemStyle.color override when the preset series declares one
 * (aligns with the `chart` node which respects `series[].color`). */
function optItemStyleColor(color: string | undefined, _i: number, _series: unknown): Record<string, unknown> {
  return color !== undefined ? { itemStyle: { color } } : {}
}

/** Dash the second and later series in a multi-series line preset.
 *  The categorical ramp is one hue, so two lines differ mostly by lightness;
 *  ECharts draws no per-series marker on the line itself, and the same pair of
 *  blues read as one series. The native chart and the plot both dash series 2+,
 *  so this keeps the three families telling the same visual story. */
function optLineDash(i: number, series: unknown): Record<string, unknown> {
  const many = Array.isArray(series) && series.length > 1
  return many && i > 0 ? { lineStyle: { type: [4, 3] } } : {}
}

export function EChartNode({ node }: { node: GenuiEChart }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const instanceRef = useRef<EChartsInstance | null>(null)

  useEffect(() => {
    let alive = true
    const el = ref.current
    if (el === null) return

    // Full `option` wins over preset shorthand.
    const option = node.option ?? presetOption(node, el)

    const engine = echartEngineFor(node) === 'echarts-full' ? 'full' : 'core'
    const height = node.height ?? PRESET_HEIGHT[node.preset ?? 'bar'] ?? chartHeight(el)
    void lazyCreateChart(el, option, { height }, engine).then((inst) => {
      if (!alive) {
        inst.dispose()
        return
      }
      instanceRef.current = inst
      setStatus('ready')
    }).catch(() => {
      if (alive) setStatus('error')
    })

    return () => {
      alive = false
      instanceRef.current?.dispose()
      instanceRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Resize observer: keep the chart responsive.
  useEffect(() => {
    if (status !== 'ready') return
    const el = ref.current
    if (el === null) return
    const ro = new ResizeObserver(() => {
      instanceRef.current?.resize()
    })
    ro.observe(el)
    return () => { ro.disconnect() }
  }, [status])

  // Update option when the node changes (model re-render). `status` is in
  // deps so that when the engine finishes loading (status: 'loading' →
  // 'ready'), this effect re-runs and applies the LATEST option — without
  // it, a spec update that arrived during engine load would be lost forever
  // (the mount effect captured the old option, and this effect would have
  // returned early when status was 'loading' and never re-run).
  useEffect(() => {
    if (status !== 'ready' || instanceRef.current === null) return
    const option = node.option ?? presetOption(node, ref.current)
    instanceRef.current.setOption(option, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, status])

  if (status === 'error') {
    return (
      <div className={css.echartFallback} data-genui-echart>
        <div className={css.echartErr}>ECharts 渲染失败</div>
        {node.title !== undefined && <div className={css.echartHint}>{renderInline(node.title)}</div>}
      </div>
    )
  }

  return (
    <div className={css.echartWrap} data-genui-echart>
      {node.title !== undefined && <div className={css.echartTitle}>{renderInline(node.title)}</div>}
      <div
        ref={ref}
        className={css.echartCanvas}
        style={{ height: `${node.height ?? PRESET_HEIGHT[node.preset ?? 'bar'] ?? chartHeight(ref.current)}px` }}
        role="img"
        aria-label={node.title ?? 'ECharts chart'}
      />
      {status === 'loading' && <div className={css.echartHint}>加载图表…</div>}
    </div>
  )
}
