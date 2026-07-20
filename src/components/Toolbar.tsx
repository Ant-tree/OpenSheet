import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store/useStore'
import type { BorderPreset } from '../store/useStore'
import {
  readWorkbookFile,
  exportWorkbook,
  pickAndReadWorkbook,
  saveToHandle,
  saveWorkbookAs,
  supportsFileSystemAccess,
} from '../lib/fileIO'
import { printPage } from '../lib/print'
import {
  NUMBER_FORMAT_PRESETS,
  asCurrency,
  asPercent,
  decreaseDecimals,
  increaseDecimals,
  toPresetToken,
} from '../lib/format'
import {
  addRecentFile,
  clearRecentFiles,
  listRecentFiles,
  relativeTime,
  type RecentFile,
} from '../lib/recentFiles'
import { useLangStore, useT } from '../i18n'
import type { HAlign } from '../types'
import Icon from './Icon'

const CAN_SAVE_IN_PLACE = supportsFileSystemAccess()

/** A small click-away dropdown: a trigger button plus a menu of items. */
function Dropdown({
  trigger,
  title,
  children,
}: {
  trigger: React.ReactNode
  title?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: Event) => {
      const target = e.target as Node
      if (btnRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    // pointerdown covers both mouse and touch (iOS WKWebView).
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])
  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: r.left })
    }
    setOpen((o) => !o)
  }
  return (
    <div className="dropdown">
      <button ref={btnRef} className="tbtn" title={title} onClick={toggle}>
        {trigger}
        <Icon name="chevron-down" className="caret" />
      </button>
      {/* Portal to <body> so the menu escapes the toolbar's overflow/scroll
          layer — otherwise iOS WKWebView clips the fixed menu inside it. */}
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            className="dropdown-menu"
            style={{ top: pos.top, left: pos.left }}
            onClick={() => setOpen(false)}
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  )
}

/** Loads and lists recent files inside the Recent dropdown (fetches on open). */
function RecentList({ onPick }: { onPick: (f: RecentFile) => void }) {
  const t = useT()
  const lang = useLangStore((s) => s.lang)
  const [items, setItems] = useState<RecentFile[] | null>(null)
  useEffect(() => {
    listRecentFiles().then(setItems)
  }, [])
  if (items && !items.length) return <div className="menu-empty">{t('noRecent')}</div>
  return (
    <>
      {(items ?? []).map((f) => (
        <button key={f.id} className="menu-item" onClick={() => onPick(f)}>
          <span className="menu-label recent-name">{f.name}</span>
          <span className="menu-hint">{relativeTime(f.savedAt, lang)}</span>
        </button>
      ))}
      {items && items.length > 0 && (
        <button className="menu-item" onClick={() => clearRecentFiles()}>
          {t('clearRecent')}
        </button>
      )}
    </>
  )
}

const BORDER_ITEMS: [BorderPreset, string][] = [
  ['all', 'border-all'],
  ['outer', 'border-outer'],
  ['top', 'border-top'],
  ['bottom', 'border-bottom'],
  ['left', 'border-left'],
  ['right', 'border-right'],
  ['none', 'border-none'],
]
const BORDER_LABEL_KEYS = {
  all: 'borderAll',
  outer: 'borderOuter',
  top: 'borderTop',
  bottom: 'borderBottom',
  left: 'borderLeft',
  right: 'borderRight',
  none: 'borderNone',
} as const

export default function Toolbar({
  onOpenCondFormat,
  onOpenChart,
  onOpenValidation,
}: {
  onOpenCondFormat: () => void
  onOpenChart: () => void
  onOpenValidation: () => void
}) {
  const t = useT()
  const fileRef = useRef<HTMLInputElement>(null)
  const applyFormat = useStore((s) => s.applyFormat)
  const mergeSelection = useStore((s) => s.mergeSelection)
  const unmergeSelection = useStore((s) => s.unmergeSelection)
  const sortSelection = useStore((s) => s.sortSelection)
  const toggleFilter = useStore((s) => s.toggleFilter)
  const filterActive = useStore((s) => s.filterHeaderRow !== null)
  const applyBorders = useStore((s) => s.applyBorders)
  const setFreeze = useStore((s) => s.setFreeze)
  const loadWorkbook = useStore((s) => s.loadWorkbook)
  const newWorkbook = useStore((s) => s.newWorkbook)
  const setFileHandle = useStore((s) => s.setFileHandle)
  const getFormat = useStore((s) => s.getFormat)
  const selection = useStore((s) => s.selection)
  useStore((s) => s.rev) // subscribe so active-state buttons re-render
  const fileHandle = useStore((s) => s.fileHandle)

  const active = getFormat(selection.focus.row, selection.focus.col)

  const toggle = (kProp: 'bold' | 'italic' | 'underline') =>
    applyFormat({ [kProp]: !active?.[kProp] })

  const setAlign = (align: HAlign) => applyFormat({ align })

  // Open: use the File System Access picker when available (so we can save back
  // in place), otherwise fall back to a plain file input (download-only).
  const openFile = async () => {
    if (CAN_SAVE_IN_PLACE) {
      try {
        const result = await pickAndReadWorkbook()
        if (!result) return
        loadWorkbook(result.wb.sheets, result.wb.fileName)
        setFileHandle(result.handle)
        addRecentFile(result.wb.fileName, result.bytes)
      } catch (err) {
        alert(t('readFail') + (err as Error).message)
      }
    } else {
      fileRef.current?.click()
    }
  }

  const onInputFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const bytes = await file.arrayBuffer()
      const wb = await readWorkbookFile(file)
      loadWorkbook(wb.sheets, wb.fileName)
      addRecentFile(wb.fileName, bytes)
    } catch (err) {
      alert(t('readFail') + (err as Error).message)
    }
    e.target.value = ''
  }

  // Reopen a file from the recent list (stored bytes; no live handle).
  const openRecent = async (f: RecentFile) => {
    try {
      const file = new File([f.bytes], f.name)
      const wb = await readWorkbookFile(file)
      loadWorkbook(wb.sheets, wb.fileName)
      setFileHandle(null)
      addRecentFile(f.name, f.bytes) // bump recency
    } catch (err) {
      alert(t('readFail') + (err as Error).message)
    }
  }

  const saveInPlace = async () => {
    const { hf, sheets, fileHandle } = useStore.getState()
    if (!fileHandle) return
    try {
      await saveToHandle(hf, sheets, fileHandle)
    } catch (err) {
      alert(t('saveFail') + (err as Error).message)
    }
  }

  const save = async (format: 'xlsx' | 'csv') => {
    const { hf, sheets, fileName } = useStore.getState()
    try {
      await exportWorkbook(hf, sheets, fileName, format)
    } catch (err) {
      alert(t('saveFail') + (err as Error).message)
    }
  }

  // Save As: pick a new name/location. On Chromium the new handle becomes the
  // in-place target (so later ⌘S saves there); elsewhere it downloads a copy.
  const saveAs = async () => {
    const { hf, sheets, fileName } = useStore.getState()
    try {
      const handle = await saveWorkbookAs(hf, sheets, fileName, 'xlsx')
      if (handle === undefined) return // user cancelled
      if (handle) {
        useStore.setState({ fileName: handle.name, fileHandle: handle })
      }
    } catch (err) {
      alert(t('saveFail') + (err as Error).message)
    }
  }

  const newFile = () => {
    if (confirm(t('newFileConfirm'))) newWorkbook()
  }

  return (
    <div className="toolbar">
      <div className="group">
        <button className="tbtn" title={t('newFile')} onClick={newFile}>
          <Icon name="new" />
          {t('newFile')}
        </button>
        <button className="tbtn primary" onClick={openFile}>
          <Icon name="open" />
          {t('open')}
        </button>
        <Dropdown
          title={t('recent')}
          trigger={
            <>
              <Icon name="recent" />
              {t('recent')}
            </>
          }
        >
          <RecentList onPick={openRecent} />
        </Dropdown>
        <Dropdown
          title={t('save')}
          trigger={
            <>
              <Icon name="save" />
              {t('save')}
            </>
          }
        >
          {CAN_SAVE_IN_PLACE && (
            <button
              className="menu-item"
              onClick={saveInPlace}
              disabled={!fileHandle}
              title={fileHandle ? undefined : t('saveInPlaceHint')}
            >
              <span className="menu-label">
                <Icon name="save" />
                {t('saveInPlace')}
              </span>
              <span className="menu-hint">⌘S</span>
            </button>
          )}
          <button className="menu-item" onClick={saveAs}>
            {t('saveAs')}
          </button>
          <button className="menu-item" onClick={() => save('xlsx')}>
            {t('saveXlsx')}
          </button>
          <button className="menu-item" onClick={() => save('csv')}>
            {t('saveCsv')}
          </button>
          <div className="menu-sep" />
          <button className="menu-item" onClick={printPage}>
            <span className="menu-label">
              <Icon name="print" />
              {t('printPdf')}
            </span>
          </button>
        </Dropdown>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden-file-input"
          onChange={onInputFile}
        />
      </div>

      <div className="group">
        <button
          className={`tbtn icon-btn${active?.bold ? ' active' : ''}`}
          title={t('bold')}
          onClick={() => toggle('bold')}
        >
          <Icon name="bold" />
        </button>
        <button
          className={`tbtn icon-btn${active?.italic ? ' active' : ''}`}
          title={t('italic')}
          onClick={() => toggle('italic')}
        >
          <Icon name="italic" />
        </button>
        <button
          className={`tbtn icon-btn${active?.underline ? ' active' : ''}`}
          title={t('underline')}
          onClick={() => toggle('underline')}
        >
          <Icon name="underline" />
        </button>
      </div>

      <div className="group">
        <button
          className={`tbtn icon-btn${active?.align === 'left' ? ' active' : ''}`}
          title={t('alignLeft')}
          onClick={() => setAlign('left')}
        >
          <Icon name="align-left" />
        </button>
        <button
          className={`tbtn icon-btn${active?.align === 'center' ? ' active' : ''}`}
          title={t('alignCenter')}
          onClick={() => setAlign('center')}
        >
          <Icon name="align-center" />
        </button>
        <button
          className={`tbtn icon-btn${active?.align === 'right' ? ' active' : ''}`}
          title={t('alignRight')}
          onClick={() => setAlign('right')}
        >
          <Icon name="align-right" />
        </button>
      </div>

      <div className="group">
        <button
          className={`tbtn icon-btn${active?.valign === 'top' ? ' active' : ''}`}
          title={t('alignTop')}
          onClick={() => applyFormat({ valign: 'top' })}
        >
          <Icon name="valign-top" />
        </button>
        <button
          className={`tbtn icon-btn${active?.valign === 'middle' ? ' active' : ''}`}
          title={t('alignMiddle')}
          onClick={() => applyFormat({ valign: 'middle' })}
        >
          <Icon name="valign-middle" />
        </button>
        <button
          className={`tbtn icon-btn${active?.valign === 'bottom' ? ' active' : ''}`}
          title={t('alignBottom')}
          onClick={() => applyFormat({ valign: 'bottom' })}
        >
          <Icon name="valign-bottom" />
        </button>
        <button
          className={`tbtn icon-btn${active?.wrap ? ' active' : ''}`}
          title={t('wrapText')}
          onClick={() => applyFormat({ wrap: !active?.wrap })}
        >
          <Icon name="wrap" />
        </button>
      </div>

      <div className="group">
        <label className="color-field" title={t('textColor')}>
          <Icon name="text-color" />
          <input
            type="color"
            value={active?.color ?? '#1f2328'}
            onChange={(e) => applyFormat({ color: e.target.value })}
          />
        </label>
        <label className="color-field" title={t('fillColor')}>
          <Icon name="fill-color" />
          <input
            type="color"
            value={active?.bgColor ?? '#ffffff'}
            onChange={(e) => applyFormat({ bgColor: e.target.value })}
          />
        </label>
      </div>

      <div className="group">
        <select
          title={t('numberFormat')}
          value={toPresetToken(active?.numberFormat)}
          onChange={(e) => applyFormat({ numberFormat: e.target.value })}
        >
          {NUMBER_FORMAT_PRESETS.map((p) => (
            <option key={p.token} value={p.token}>
              {t(p.labelKey)}
            </option>
          ))}
        </select>
        <button
          className="tbtn icon-btn"
          title={t('currencyFmt')}
          onClick={() => applyFormat({ numberFormat: asCurrency(active?.numberFormat) })}
        >
          <Icon name="currency" />
        </button>
        <button
          className="tbtn icon-btn"
          title={t('percentFmt')}
          onClick={() => applyFormat({ numberFormat: asPercent(active?.numberFormat) })}
        >
          <Icon name="percent" />
        </button>
        <button
          className="tbtn icon-btn"
          title={t('decimalInc')}
          onClick={() => applyFormat({ numberFormat: increaseDecimals(active?.numberFormat) })}
        >
          <Icon name="decimal-inc" />
        </button>
        <button
          className="tbtn icon-btn"
          title={t('decimalDec')}
          onClick={() => applyFormat({ numberFormat: decreaseDecimals(active?.numberFormat) })}
        >
          <Icon name="decimal-dec" />
        </button>
      </div>

      <div className="group">
        <Dropdown
          title={t('bordersHint')}
          trigger={
            <>
              <Icon name="borders" />
              {t('borders')}
            </>
          }
        >
          {BORDER_ITEMS.map(([preset, icon]) => (
            <button key={preset} className="menu-item" onClick={() => applyBorders(preset)}>
              <span className="menu-label">
                <Icon name={icon} />
                {t(BORDER_LABEL_KEYS[preset])}
              </span>
            </button>
          ))}
        </Dropdown>
      </div>

      <div className="group">
        <button className="tbtn" title={t('merge')} onClick={mergeSelection}>
          <Icon name="merge" />
          {t('merge')}
        </button>
        <button className="tbtn" title={t('unmerge')} onClick={unmergeSelection}>
          <Icon name="unmerge" />
        </button>
      </div>

      <div className="group">
        <button className="tbtn" title={t('sortAsc')} onClick={() => sortSelection(true)}>
          <Icon name="sort-asc" />
        </button>
        <button className="tbtn" title={t('sortDesc')} onClick={() => sortSelection(false)}>
          <Icon name="sort-desc" />
        </button>
        <button
          className={`tbtn${filterActive ? ' active' : ''}`}
          title={t('filter')}
          onClick={toggleFilter}
        >
          <Icon name="filter" />
          {t('filter')}
        </button>
      </div>

      <div className="group">
        <button className="tbtn" title={t('condFormatHint')} onClick={onOpenCondFormat}>
          <Icon name="cond-format" />
          {t('condFormat')}
        </button>
        <button className="tbtn" title={t('chart')} onClick={onOpenChart}>
          <Icon name="chart" />
          {t('chart')}
        </button>
        <button className="tbtn" title={t('dataValidation')} onClick={onOpenValidation}>
          <Icon name="chevron-down" />
          {t('dataValidation')}
        </button>
      </div>

      <div className="group">
        <Dropdown
          title={t('freeze')}
          trigger={
            <>
              <Icon name="freeze" />
              {t('freeze')}
            </>
          }
        >
          <button
            className="menu-item"
            onClick={() => setFreeze(selection.focus.row, selection.focus.col)}
          >
            {t('freezeToSelection')}
          </button>
          <button className="menu-item" onClick={() => setFreeze(1, 0)}>
            {t('freezeRow')}
          </button>
          <button className="menu-item" onClick={() => setFreeze(0, 1)}>
            {t('freezeCol')}
          </button>
          <button className="menu-item" onClick={() => setFreeze(0, 0)}>
            {t('unfreeze')}
          </button>
        </Dropdown>
      </div>
    </div>
  )
}
