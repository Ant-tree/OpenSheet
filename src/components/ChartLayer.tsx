import { useRef } from 'react'
import { useStore } from '../store/useStore'
import { chartToSvgString } from '../lib/chartRender'
import { useT } from '../i18n'
import Icon from './Icon'

const BAR_H = 26

/**
 * Renders charts inserted onto the active sheet as floating, draggable cards
 * over the grid. The same SVG is rasterized on `.xlsx` export, so what you see
 * matches the saved image.
 */
export default function ChartLayer() {
  const t = useT()
  const activeSheetId = useStore((s) => s.activeSheetId)
  const charts = useStore((s) => s.charts[activeSheetId]) ?? []
  const moveChart = useStore((s) => s.moveChart)
  const removeChart = useStore((s) => s.removeChart)
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null)

  const onPointerDown = (e: React.PointerEvent, id: string, x: number, y: number) => {
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { id, dx: e.clientX - x, dy: e.clientY - y }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    moveChart(drag.current.id, Math.max(0, e.clientX - drag.current.dx), Math.max(0, e.clientY - drag.current.dy))
  }
  const onPointerUp = () => {
    drag.current = null
  }

  if (!charts.length) return null

  return (
    <div className="chart-layer">
      {charts.map((c) => (
        <div
          key={c.id}
          className="chart-card"
          style={{ left: c.x, top: c.y, width: c.width, height: c.height }}
        >
          <div
            className="chart-card-bar"
            onPointerDown={(e) => onPointerDown(e, c.id, c.x, c.y)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <span className="chart-card-grip" />
            <button
              className="chart-card-del"
              title={t('chartDelete')}
              onClick={() => removeChart(c.id)}
            >
              <Icon name="close" />
            </button>
          </div>
          <div
            className="chart-card-body"
            dangerouslySetInnerHTML={{
              __html: chartToSvgString(c.data, c.kind, c.width, c.height - BAR_H),
            }}
          />
        </div>
      ))}
    </div>
  )
}
