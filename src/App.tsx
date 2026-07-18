import { useEffect } from 'react'
import Toolbar from './components/Toolbar'
import FormulaBar from './components/FormulaBar'
import Grid from './components/Grid'
import SheetTabs from './components/SheetTabs'
import { useStore } from './store/useStore'
import { iterateSelection } from './lib/utils'

export default function App() {
  const selection = useStore((s) => s.selection)
  const fileName = useStore((s) => s.fileName)
  useStore((s) => s.rev)

  // Aggregate numeric stats over the current selection (Excel-style status bar).
  const { count, sum, avg } = (() => {
    const get = useStore.getState().getComputed
    let count = 0
    let sum = 0
    for (const ref of iterateSelection(selection)) {
      const v = get(ref.row, ref.col)
      if (typeof v === 'number') {
        count++
        sum += v
      }
    }
    return { count, sum, avg: count ? sum / count : 0 }
  })()

  // Ctrl/Cmd+B / I / U formatting shortcuts.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = document.activeElement
      const inInput = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      if (inInput) return
      if (!(e.metaKey || e.ctrlKey)) return
      const store = useStore.getState()
      const active = store.getFormat(selection.focus.row, selection.focus.col)
      if (e.key === 'b') {
        e.preventDefault()
        store.applyFormat({ bold: !active?.bold })
      } else if (e.key === 'i') {
        e.preventDefault()
        store.applyFormat({ italic: !active?.italic })
      } else if (e.key === 'u') {
        e.preventDefault()
        store.applyFormat({ underline: !active?.underline })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selection])

  return (
    <div className="app">
      <Toolbar />
      <FormulaBar />
      <Grid />
      <SheetTabs />
      <div className="status-bar">
        <span>{fileName}</span>
        <span className="spacer" />
        {count > 0 && (
          <>
            <span>개수: {count}</span>
            <span>합계: {formatStat(sum)}</span>
            <span>평균: {formatStat(avg)}</span>
          </>
        )}
      </div>
    </div>
  )
}

function formatStat(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 4 })
}
