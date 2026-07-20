import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { computeChartData, CHART_COLORS as COLORS } from '../lib/chartRender'
import type { ChartData } from '../types'
import { useT } from '../i18n'
import Icon from './Icon'

type ChartType = 'bar' | 'line' | 'pie'

const W = 540
const H = 340
const PAD = { l: 48, r: 16, t: 16, b: 56 }
const plotW = W - PAD.l - PAD.r
const plotH = H - PAD.t - PAD.b

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min]
  const step = (max - min) / count
  return Array.from({ length: count + 1 }, (_, i) => min + step * i)
}

const fmt = (n: number) =>
  Math.abs(n) >= 1000 || Number.isInteger(n)
    ? n.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : n.toLocaleString(undefined, { maximumFractionDigits: 3 })

function AxisChart({ data, type }: { data: ChartData; type: 'bar' | 'line' }) {
  const all = data.series.flatMap((s) => s.values)
  const yMax = Math.max(0, ...all)
  const yMin = Math.min(0, ...all)
  const span = yMax - yMin || 1
  const y = (v: number) => PAD.t + plotH - ((v - yMin) / span) * plotH
  const n = data.categories.length
  const bandW = plotW / n
  const ticks = niceTicks(yMin, yMax)
  const labelEvery = Math.ceil(n / 12) // avoid overcrowding the x axis

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img">
      {/* y grid + labels */}
      {ticks.map((tv, i) => (
        <g key={i}>
          <line x1={PAD.l} y1={y(tv)} x2={W - PAD.r} y2={y(tv)} className="chart-grid" />
          <text x={PAD.l - 6} y={y(tv) + 4} className="chart-axis-text" textAnchor="end">
            {fmt(tv)}
          </text>
        </g>
      ))}
      {/* zero baseline */}
      <line x1={PAD.l} y1={y(0)} x2={W - PAD.r} y2={y(0)} className="chart-axis" />
      {/* x labels */}
      {data.categories.map((cat, i) =>
        i % labelEvery === 0 ? (
          <text
            key={i}
            x={PAD.l + bandW * (i + 0.5)}
            y={H - PAD.b + 16}
            className="chart-axis-text"
            textAnchor="middle"
          >
            {cat.length > 8 ? cat.slice(0, 7) + '…' : cat}
          </text>
        ) : null,
      )}
      {/* series */}
      {type === 'bar'
        ? data.series.map((s, si) =>
            s.values.map((v, i) => {
              const bw = (bandW * 0.8) / data.series.length
              const x = PAD.l + bandW * (i + 0.1) + bw * si
              const top = y(Math.max(0, v))
              const h = Math.abs(y(v) - y(0))
              return (
                <rect
                  key={`${si}-${i}`}
                  x={x}
                  y={top}
                  width={Math.max(1, bw - 1)}
                  height={h}
                  fill={COLORS[si % COLORS.length]}
                />
              )
            }),
          )
        : data.series.map((s, si) => {
            const pts = s.values
              .map((v, i) => `${PAD.l + bandW * (i + 0.5)},${y(v)}`)
              .join(' ')
            return (
              <g key={si}>
                <polyline points={pts} fill="none" stroke={COLORS[si % COLORS.length]} strokeWidth={2} />
                {s.values.map((v, i) => (
                  <circle
                    key={i}
                    cx={PAD.l + bandW * (i + 0.5)}
                    cy={y(v)}
                    r={2.5}
                    fill={COLORS[si % COLORS.length]}
                  />
                ))}
              </g>
            )
          })}
    </svg>
  )
}

function PieChart({ data }: { data: ChartData }) {
  // Pie shows the first series across the categories.
  const values = data.series[0].values.map((v) => Math.max(0, v))
  const total = values.reduce((a, b) => a + b, 0) || 1
  const cx = PAD.l + plotW / 2
  const cy = PAD.t + plotH / 2
  const rad = Math.min(plotW, plotH) / 2 - 4
  let angle = -Math.PI / 2
  const slices = values.map((v, i) => {
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
    return { d, color: COLORS[i % COLORS.length], pct: frac }
  })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img">
      {slices.map((s, i) => (
        <path key={i} d={s.d} fill={s.color} stroke="var(--cell-bg)" strokeWidth={1} />
      ))}
    </svg>
  )
}

export default function ChartPanel({ onClose }: { onClose: () => void }) {
  const t = useT()
  const [type, setType] = useState<ChartType>('bar')
  const addChart = useStore((s) => s.addChart)
  // Capture the data once when the panel opens (selection at open time).
  const data = useMemo(() => computeChartData(), [])

  const insert = () => {
    if (!data) return
    const existing = Object.values(useStore.getState().charts).flat().length
    const offset = (existing % 6) * 24
    addChart({
      kind: type,
      x: 40 + offset,
      y: 40 + offset,
      width: 440,
      height: 300,
      data,
    })
    onClose()
  }

  const legendItems =
    data && type === 'pie'
      ? data.categories.map((c, i) => ({ name: c, color: COLORS[i % COLORS.length] }))
      : data
        ? data.series.map((s, i) => ({ name: s.name, color: COLORS[i % COLORS.length] }))
        : []

  return (
    <div className="chart-overlay" onMouseDown={onClose}>
      <div className="chart-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="chart-head">
          <div className="chart-types">
            {(['bar', 'line', 'pie'] as ChartType[]).map((ty) => (
              <button
                key={ty}
                className={`tbtn${type === ty ? ' active' : ''}`}
                onClick={() => setType(ty)}
              >
                {t(ty === 'bar' ? 'chartBar' : ty === 'line' ? 'chartLine' : 'chartPie')}
              </button>
            ))}
          </div>
          <div className="chart-actions">
            <button className="tbtn primary" onClick={insert} disabled={!data}>
              {t('chartInsert')}
            </button>
            <button className="tbtn" title={t('close')} onClick={onClose}>
              <Icon name="close" />
            </button>
          </div>
        </div>
        {data ? (
          <>
            {type === 'pie' ? <PieChart data={data} /> : <AxisChart data={data} type={type} />}
            <div className="chart-legend">
              {legendItems.map((it, i) => (
                <span key={i} className="chart-legend-item">
                  <span className="chart-swatch" style={{ background: it.color }} />
                  {it.name}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="chart-empty">{t('chartNoData')}</div>
        )}
      </div>
    </div>
  )
}
