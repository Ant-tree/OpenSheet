import { useEffect, useState } from 'react'
import Toolbar from './components/Toolbar'
import FormulaBar from './components/FormulaBar'
import Grid from './components/Grid'
import ChartLayer from './components/ChartLayer'
import SheetTabs from './components/SheetTabs'
import FindReplace from './components/FindReplace'
import CondFormatPanel from './components/CondFormatPanel'
import ChartPanel from './components/ChartPanel'
import DataValidationPanel from './components/DataValidationPanel'
import Toast from './components/Toast'
import { useStore } from './store/useStore'
import type { SerializedDoc } from './store/useStore'
import { loadDraft, saveDraft } from './lib/recentFiles'
import { iterateSelection } from './lib/utils'
import {
  exportWorkbook,
  saveToHandle,
  saveWorkbookAs,
  saveWorkbookToPath,
  isTauri,
} from './lib/fileIO'
import { t as translate, useLangStore, useT } from './i18n'
import { useThemeStore, type Theme } from './theme'
import { useZoomStore, MIN_ZOOM, MAX_ZOOM } from './zoom'

export default function App() {
  const t = useT()
  const [findMode, setFindMode] = useState<'find' | 'replace' | null>(null)
  const [showCond, setShowCond] = useState(false)
  const [showChart, setShowChart] = useState(false)
  const [showValidation, setShowValidation] = useState(false)
  const lang = useLangStore((s) => s.lang)
  const setLang = useLangStore((s) => s.setLang)
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const zoom = useZoomStore((s) => s.zoom)
  const zoomIn = useZoomStore((s) => s.zoomIn)
  const zoomOut = useZoomStore((s) => s.zoomOut)
  const resetZoom = useZoomStore((s) => s.resetZoom)
  const selection = useStore((s) => s.selection)
  const fileName = useStore((s) => s.fileName)
  useStore((s) => s.rev)

  // Aggregate numeric stats over the current selection (Excel-style status bar).
  const { count, sum, avg, min, max } = (() => {
    const get = useStore.getState().getComputed
    let count = 0
    let sum = 0
    let min = Infinity
    let max = -Infinity
    for (const ref of iterateSelection(selection)) {
      const v = get(ref.row, ref.col)
      if (typeof v === 'number') {
        count++
        sum += v
        if (v < min) min = v
        if (v > max) max = v
      }
    }
    return { count, sum, avg: count ? sum / count : 0, min, max }
  })()

  // Ctrl/Cmd+B / I / U formatting shortcuts.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd/Ctrl+S saves the workbook instead of letting the browser save the
      // page HTML. This works even while editing a cell.
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        const store = useStore.getState()
        const onErr = (err: Error) =>
          alert(translate('saveFail', useLangStore.getState().lang) + err.message)
        if (store.fileHandle) {
          // Chromium: save in place through the File System Access handle.
          saveToHandle(store.hf, store.sheets, store.fileHandle, store.charts).catch(onErr)
        } else if (isTauri()) {
          // Desktop app: save in place to the known path, else prompt (and
          // remember it). Never a silent download to ~/Downloads.
          void (async () => {
            try {
              if (store.filePath) {
                const fmt = store.filePath.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx'
                try {
                  await saveWorkbookToPath(store.hf, store.sheets, store.filePath, fmt, store.charts)
                  return
                } catch {
                  /* command missing (older build) — fall through to the dialog */
                }
              }
              const res = await saveWorkbookAs(store.hf, store.sheets, store.fileName, 'xlsx', store.charts)
              if (res) {
                useStore.setState({ fileName: res.name })
                if (res.path) useStore.getState().setFilePath(res.path)
              }
            } catch (err) {
              onErr(err as Error)
            }
          })()
        } else {
          exportWorkbook(store.hf, store.sheets, store.fileName, 'xlsx', store.charts).catch(onErr)
        }
        return
      }

      // Find / replace (override the browser's Ctrl+F / Ctrl+H).
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'h')) {
        e.preventDefault()
        setFindMode(e.key === 'h' ? 'replace' : 'find')
        return
      }

      // Zoom the grid (Ctrl/Cmd with + / - / 0). Works everywhere, even mid-edit.
      if (e.metaKey || e.ctrlKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault()
          useZoomStore.getState().zoomIn()
          return
        }
        if (e.key === '-' || e.key === '_') {
          e.preventDefault()
          useZoomStore.getState().zoomOut()
          return
        }
        if (e.key === '0') {
          e.preventDefault()
          useZoomStore.getState().resetZoom()
          return
        }
      }

      // Switch between sheet tabs (Ctrl/Cmd + PageUp / PageDown, Excel-style).
      if ((e.metaKey || e.ctrlKey) && (e.key === 'PageUp' || e.key === 'PageDown')) {
        e.preventDefault()
        useStore.getState().moveActiveSheet(e.key === 'PageDown' ? 1 : -1)
        return
      }

      // The active cell hosts a persistent input; allow formatting shortcuts
      // there, but not in other text inputs (e.g. the formula bar).
      const el = document.activeElement
      const isCellEditor = el instanceof HTMLInputElement && el.classList.contains('cell-input')
      const inOtherInput =
        (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && !isCellEditor
      if (inOtherInput) return
      if (!(e.metaKey || e.ctrlKey)) return
      const store = useStore.getState()

      // Undo / redo — but not while typing in a cell (let the input's native undo win).
      const kl = e.key.toLowerCase()
      if (!store.editing && (kl === 'z' || kl === 'y')) {
        e.preventDefault()
        if (kl === 'y' || e.shiftKey) store.redo()
        else store.undo()
        return
      }

      // Fill down / right over the selection (Excel Ctrl+D / Ctrl+R).
      if (!store.editing && kl === 'd') {
        e.preventDefault()
        store.fillDown()
        return
      }
      if (!store.editing && kl === 'r') {
        e.preventDefault()
        store.fillRight()
        return
      }

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

  // Autosave to IndexedDB and recover the last session on load.
  useEffect(() => {
    loadDraft<SerializedDoc>()
      .then((d) => {
        if (d) useStore.getState().restoreState(d)
      })
      .catch(() => {})
    let timer: number
    let lastRev = useStore.getState().rev
    const unsub = useStore.subscribe((state) => {
      if (state.rev === lastRev) return
      lastRev = state.rev
      clearTimeout(timer)
      timer = window.setTimeout(() => saveDraft(useStore.getState().serializeState()), 1200)
    })
    return () => {
      clearTimeout(timer)
      unsub()
    }
  }, [])

  // Copy / cut / paste over the selection (skip while editing text or in the
  // formula bar so their native clipboard behaviour still works).
  useEffect(() => {
    const skip = () => {
      const store = useStore.getState()
      if (store.editing) return true
      const el = document.activeElement
      return el instanceof HTMLInputElement && el.classList.contains('formula-input')
    }
    const onCopy = (e: ClipboardEvent) => {
      if (skip()) return
      e.preventDefault()
      e.clipboardData?.setData('text/plain', useStore.getState().copySelection())
    }
    const onCut = (e: ClipboardEvent) => {
      if (skip()) return
      e.preventDefault()
      e.clipboardData?.setData('text/plain', useStore.getState().cutSelection())
    }
    const onPaste = (e: ClipboardEvent) => {
      if (skip()) return
      e.preventDefault()
      useStore.getState().pasteText(e.clipboardData?.getData('text/plain') ?? '')
    }
    document.addEventListener('copy', onCopy)
    document.addEventListener('cut', onCut)
    document.addEventListener('paste', onPaste)
    return () => {
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('cut', onCut)
      document.removeEventListener('paste', onPaste)
    }
  }, [])

  return (
    <div className="app">
      <Toolbar
        onOpenFind={() => setFindMode((m) => (m ? null : 'replace'))}
        onOpenCondFormat={() => setShowCond((v) => !v)}
        onOpenChart={() => setShowChart(true)}
        onOpenValidation={() => setShowValidation((v) => !v)}
      />
      <FormulaBar />
      {findMode && <FindReplace mode={findMode} onClose={() => setFindMode(null)} />}
      {showCond && <CondFormatPanel onClose={() => setShowCond(false)} />}
      {showChart && <ChartPanel onClose={() => setShowChart(false)} />}
      {showValidation && <DataValidationPanel onClose={() => setShowValidation(false)} />}
      <div className="grid-area">
        <Grid />
        <ChartLayer />
      </div>
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
            <span>
              {t('statusMin')}: {formatStat(min)}
            </span>
            <span>
              {t('statusMax')}: {formatStat(max)}
            </span>
          </>
        )}
        <div className="zoom-control">
          <button
            className="zoom-btn"
            title={t('zoomOut')}
            onClick={zoomOut}
            disabled={zoom <= MIN_ZOOM}
          >
            −
          </button>
          <button className="zoom-label" title={t('zoomReset')} onClick={resetZoom}>
            {Math.round(zoom * 100)}%
          </button>
          <button
            className="zoom-btn"
            title={t('zoomIn')}
            onClick={zoomIn}
            disabled={zoom >= MAX_ZOOM}
          >
            +
          </button>
        </div>
        <select
          className="lang-select"
          title={t('theme')}
          value={theme}
          onChange={(e) => setTheme(e.target.value as Theme)}
        >
          <option value="auto">{t('themeAuto')}</option>
          <option value="light">{t('themeLight')}</option>
          <option value="dark">{t('themeDark')}</option>
        </select>
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
      <Toast />
    </div>
  )
}

function formatStat(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 4 })
}
