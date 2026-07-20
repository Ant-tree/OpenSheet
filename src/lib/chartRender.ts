import type { ChartData, ChartKind } from '../types'
import { selectionBounds } from './utils'
import { useStore } from '../store/useStore'

export const CHART_COLORS = [
  '#1a73e8',
  '#34a853',
  '#fbbc04',
  '#ea4335',
  '#a142f4',
  '#00acc1',
  '#ff7043',
  '#9e9d24',
]

const isNum = (v: unknown): v is number => typeof v === 'number' && isFinite(v)

/**
 * Interpret the current selection as chart data. The leftmost column is used as
 * category labels when it holds text; the top row as series names when it holds
 * text. Everything else is read as numeric series (non-numbers count as 0).
 */
export function computeChartData(): ChartData | null {
  const s = useStore.getState()
  const b = selectionBounds(s.selection)
  const val = (r: number, c: number) => s.getComputed(r, c)

  const rows: number[] = []
  for (let r = b.top; r <= b.bottom; r++) rows.push(r)
  const cols: number[] = []
  for (let c = b.left; c <= b.right; c++) cols.push(c)

  const leftHasText =
    cols.length > 1 &&
    rows.some((r) => {
      const v = val(r, b.left)
      return v != null && v !== '' && !isNum(v)
    })
  const labelCol = leftHasText ? b.left : null
  const seriesCols = cols.filter((c) => c !== labelCol)

  const topHasNumber = seriesCols.some((c) => isNum(val(b.top, c)))
  const hasHeaderRow = rows.length > 1 && !topHasNumber
  const dataRows = rows.filter((r) => !(hasHeaderRow && r === b.top))

  if (!seriesCols.length || !dataRows.length) return null
  const anyNumber = dataRows.some((r) => seriesCols.some((c) => isNum(val(r, c))))
  if (!anyNumber) return null

  const categories = dataRows.map((r, i) => {
    if (labelCol != null) {
      const v = val(r, labelCol)
      return v == null || v === '' ? String(i + 1) : String(v)
    }
    return String(i + 1)
  })

  const series = seriesCols.map((c, si) => ({
    name: hasHeaderRow ? String(val(b.top, c) ?? `Series ${si + 1}`) : `Series ${si + 1}`,
    values: dataRows.map((r) => {
      const v = val(r, c)
      return isNum(v) ? v : 0
    }),
  }))

  return { categories, series }
}

const fmt = (n: number) =>
  Math.abs(n) >= 1000 || Number.isInteger(n)
    ? n.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : n.toLocaleString(undefined, { maximumFractionDigits: 3 })

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min]
  const step = (max - min) / count
  return Array.from({ length: count + 1 }, (_, i) => min + step * i)
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Render a chart as a self-contained SVG string with inline colors (no CSS
 * classes or variables), so it can be shown in the grid and rasterized to a PNG
 * for `.xlsx` export identically. Includes a legend at the bottom.
 */
export function chartToSvgString(data: ChartData, kind: ChartKind, W: number, H: number): string {
  const legendH = 26
  // Wide left margin so multi-digit y-axis labels (e.g. "1,800") aren't clipped.
  const PAD = { l: 60, r: 16, t: 16, b: 40 + legendH }
  const plotW = W - PAD.l - PAD.r
  const plotH = H - PAD.t - PAD.b
  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
  )
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`)

  const legendItems =
    kind === 'pie'
      ? data.categories.map((c, i) => ({ name: c, color: CHART_COLORS[i % CHART_COLORS.length] }))
      : data.series.map((s, i) => ({ name: s.name, color: CHART_COLORS[i % CHART_COLORS.length] }))

  if (kind === 'pie') {
    const values = data.series[0].values.map((v) => Math.max(0, v))
    const total = values.reduce((a, b) => a + b, 0) || 1
    const cx = PAD.l + plotW / 2
    const cy = PAD.t + plotH / 2
    const rad = Math.min(plotW, plotH) / 2 - 4
    let angle = -Math.PI / 2
    values.forEach((v, i) => {
      const frac = v / total
      const a0 = angle
      const a1 = angle + frac * Math.PI * 2
      angle = a1
      const large = a1 - a0 > Math.PI ? 1 : 0
      const x0 = cx + rad * Math.cos(a0)
      const y0 = cy + rad * Math.sin(a0)
      const x1 = cx + rad * Math.cos(a1)
      const y1 = cy + rad * Math.sin(a1)
      const d = `M ${cx} ${cy} L ${x0} ${y0} A ${rad} ${rad} 0 ${large} 1 ${x1} ${y1} Z`
      parts.push(
        `<path d="${d}" fill="${CHART_COLORS[i % CHART_COLORS.length]}" stroke="#ffffff" stroke-width="1"/>`,
      )
    })
  } else {
    const all = data.series.flatMap((s) => s.values)
    const yMax = Math.max(0, ...all)
    const yMin = Math.min(0, ...all)
    const span = yMax - yMin || 1
    const y = (v: number) => PAD.t + plotH - ((v - yMin) / span) * plotH
    const n = data.categories.length
    const bandW = plotW / n
    const ticks = niceTicks(yMin, yMax)
    const labelEvery = Math.ceil(n / 12)

    for (const tv of ticks) {
      parts.push(
        `<line x1="${PAD.l}" y1="${y(tv)}" x2="${W - PAD.r}" y2="${y(tv)}" stroke="#e0e0e0" stroke-width="1"/>`,
      )
      parts.push(
        `<text x="${PAD.l - 6}" y="${y(tv) + 4}" fill="#5f6368" font-size="11" font-family="sans-serif" text-anchor="end">${esc(fmt(tv))}</text>`,
      )
    }
    parts.push(
      `<line x1="${PAD.l}" y1="${y(0)}" x2="${W - PAD.r}" y2="${y(0)}" stroke="#9aa0a6" stroke-width="1"/>`,
    )
    data.categories.forEach((cat, i) => {
      if (i % labelEvery !== 0) return
      const label = cat.length > 8 ? cat.slice(0, 7) + '…' : cat
      parts.push(
        `<text x="${PAD.l + bandW * (i + 0.5)}" y="${H - PAD.b + 16}" fill="#5f6368" font-size="11" font-family="sans-serif" text-anchor="middle">${esc(label)}</text>`,
      )
    })

    if (kind === 'bar') {
      data.series.forEach((s, si) => {
        s.values.forEach((v, i) => {
          const bw = (bandW * 0.8) / data.series.length
          const x = PAD.l + bandW * (i + 0.1) + bw * si
          const top = y(Math.max(0, v))
          const h = Math.abs(y(v) - y(0))
          parts.push(
            `<rect x="${x}" y="${top}" width="${Math.max(1, bw - 1)}" height="${h}" fill="${CHART_COLORS[si % CHART_COLORS.length]}"/>`,
          )
        })
      })
    } else {
      data.series.forEach((s, si) => {
        const pts = s.values.map((v, i) => `${PAD.l + bandW * (i + 0.5)},${y(v)}`).join(' ')
        parts.push(
          `<polyline points="${pts}" fill="none" stroke="${CHART_COLORS[si % CHART_COLORS.length]}" stroke-width="2"/>`,
        )
        s.values.forEach((v, i) => {
          parts.push(
            `<circle cx="${PAD.l + bandW * (i + 0.5)}" cy="${y(v)}" r="2.5" fill="${CHART_COLORS[si % CHART_COLORS.length]}"/>`,
          )
        })
      })
    }
  }

  // Legend row along the bottom.
  let lx = PAD.l
  const ly = H - legendH / 2
  for (const it of legendItems) {
    parts.push(`<rect x="${lx}" y="${ly - 6}" width="12" height="12" rx="2" fill="${it.color}"/>`)
    const label = it.name.length > 14 ? it.name.slice(0, 13) + '…' : it.name
    parts.push(
      `<text x="${lx + 16}" y="${ly + 4}" fill="#3c4043" font-size="11" font-family="sans-serif">${esc(label)}</text>`,
    )
    lx += 16 + Math.min(14, it.name.length) * 7 + 16
    if (lx > W - 60) break
  }

  parts.push('</svg>')
  return parts.join('')
}

/** Rasterize an SVG string to a PNG data URL at device scale (for xlsx export). */
export function svgToPngDataUrl(svg: string, w: number, h: number, scale = 2): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(w * scale)
      canvas.height = Math.round(h * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('no canvas context'))
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('svg render failed'))
    img.src = url
  })
}
