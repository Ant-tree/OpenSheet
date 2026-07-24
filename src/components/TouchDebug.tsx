import { DEBUG_TOUCH, useTouchDebug } from '../lib/touchDebug'

// TEMPORARY: a fixed overlay that prints the most recent touch events so header
// resize can be diagnosed on a real device. Tap it to clear. Remove with the
// touchDebug module once fixed.
export default function TouchDebug() {
  const lines = useTouchDebug((s) => s.lines)
  if (!DEBUG_TOUCH) return null
  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        background: 'rgba(0,0,0,0.82)',
        color: '#3f6',
        font: '11px/1.35 ui-monospace, Menlo, monospace',
        padding: '4px 8px',
        maxHeight: '30vh',
        overflow: 'hidden',
        whiteSpace: 'pre-wrap',
        // Display-only: never intercept taps (otherwise it blocks the UI behind it).
        pointerEvents: 'none',
      }}
    >
      {lines.length ? lines.join('\n') : 'touch debug — drag a row/column header'}
    </div>
  )
}
