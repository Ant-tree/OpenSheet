import { useEffect } from 'react'
import Toolbar from './components/Toolbar'
import FormulaBar from './components/FormulaBar'
import Grid from './components/Grid'
import SheetTabs from './components/SheetTabs'
import { useStore } from './store/useStore'
import { iterateSelection } from './lib/utils'
import { exportWorkbook, saveToHandle } from './lib/fileIO'
import { useLangStore, useT } from './i18n'

export default function App() {
  const t = useT()
  const lang = useLangStore((s) => s.lang)
  const setLang = useLangStore((s) => s.setLang)
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
      // Cmd/Ctrl+S saves the workbook instead of letting the browser save the
      // page HTML. This works even while editing a cell.
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        const store = useStore.getState()
        if (store.fileHandle) {
          saveToHandle(store.hf, store.sheets, store.fileHandle).catch((err) =>
            alert('저장하지 못했습니다: ' + (err as Error).message),
          )
        } else {
          exportWorkbook(store.hf, store.sheets, store.fileName, 'xlsx').catch((err) =>
            alert('저장하지 못했습니다: ' + (err as Error).message),
          )
        }
        return
      }

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
            <span>
              {t('statusCount')}: {count}
            </span>
            <span>
              {t('statusSum')}: {formatStat(sum)}
            </span>
            <span>
              {t('statusAvg')}: {formatStat(avg)}
            </span>
          </>
        )}
        <select
          className="lang-select"
          title={t('language')}
          value={lang}
          onChange={(e) => setLang(e.target.value as 'en' | 'ko')}
        >
          <option value="en">English</option>
          <option value="ko">한국어</option>
        </select>
      </div>
    </div>
  )
}

function formatStat(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 4 })
}
