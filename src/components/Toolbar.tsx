import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store/useStore'
import type { BorderPreset } from '../store/useStore'
import {
  readWorkbookFile,
  exportWorkbook,
  pickAndReadWorkbook,
  openWorkbookTauri,
  openWorkbookAndroid,
  readWorkbookFromPath,
  readWorkbookFromUri,
  isTauri,
  saveToHandle,
  saveWorkbookAs,
  saveWorkbookToPath,
  saveWorkbookViaSaf,
  supportsFileSystemAccess,
} from '../lib/fileIO'
import {
  isNativePlatform,
  nativePlatform,
  shareFileNative,
  type NativeSaveResult,
} from '../lib/nativeSave'
import { showToast } from '../lib/toast'
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
import { useSettingsStore } from '../settings'
import type { HAlign } from '../types'
import Icon from './Icon'

const CAN_SAVE_IN_PLACE = supportsFileSystemAccess()
// Recent files re-read the file fresh from disk, which needs a persistent
// reference: a path (desktop) or a SAF content URI (Android). Web and iOS have
// neither, so the feature is hidden there.
const SUPPORTS_RECENT = isTauri() || nativePlatform() === 'android'

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
  onOpenFind,
  onOpenCondFormat,
  onOpenChart,
  onOpenValidation,
  onOpenShortcuts,
}: {
  onOpenFind: () => void
  onOpenCondFormat: () => void
  onOpenChart: () => void
  onOpenValidation: () => void
  onOpenShortcuts: () => void
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
  const startFormatPainter = useStore((s) => s.startFormatPainter)
  const painterActive = useStore((s) => s.formatPainter !== null)
  const autoSave = useSettingsStore((s) => s.autoSave)
  const toggleAutoSave = useSettingsStore((s) => s.toggleAutoSave)
  const setFreeze = useStore((s) => s.setFreeze)
  const loadWorkbook = useStore((s) => s.loadWorkbook)
  const newWorkbook = useStore((s) => s.newWorkbook)
  const setFileHandle = useStore((s) => s.setFileHandle)
  const setFilePath = useStore((s) => s.setFilePath)
  const getFormat = useStore((s) => s.getFormat)
  const selection = useStore((s) => s.selection)
  useStore((s) => s.rev) // subscribe so active-state buttons re-render
  const fileHandle = useStore((s) => s.fileHandle)
  const filePath = useStore((s) => s.filePath)
  // "Save" (write back to the open file): Chromium via a handle, desktop via a path.
  const canSaveInPlace = CAN_SAVE_IN_PLACE || isTauri()
  const hasTarget = !!fileHandle || !!filePath

  const active = getFormat(selection.focus.row, selection.focus.col)

  // In-app "Save As" name dialog. Used instead of window.prompt so naming works
  // even where the WebView has no JS prompt dialog (notably Android WebView).
  const [nameModal, setNameModal] = useState<{ suggested: string } | null>(null)
  const nameResolver = useRef<((v: string | null) => void) | null>(null)
  const promptFileName = (suggested: string) =>
    new Promise<string | null>((resolve) => {
      nameResolver.current = resolve
      setNameModal({ suggested })
    })
  const resolveNameModal = (value: string | null) => {
    setNameModal(null)
    const r = nameResolver.current
    nameResolver.current = null
    r?.(value)
  }

  // After a native save, confirm where the file landed and offer to share it.
  const [savedModal, setSavedModal] = useState<NativeSaveResult | null>(null)

  const toggle = (kProp: 'bold' | 'italic' | 'underline') =>
    applyFormat({ [kProp]: !active?.[kProp] })

  const setAlign = (align: HAlign) => applyFormat({ align })

  // Open: use the File System Access picker when available (so we can save back
  // in place), otherwise fall back to a plain file input (download-only).
  const openFile = async () => {
    if (isTauri()) {
      // Desktop app: native Open dialog by path, so the file can be reopened
      // fresh on the next launch (picking up edits from another editor).
      try {
        const res = await openWorkbookTauri()
        if (!res) return
        loadWorkbook(res.wb.sheets, res.wb.fileName)
        setFileHandle(null)
        setFilePath(res.path)
        addRecentFile(res.wb.fileName, res.bytes, { path: res.path })
      } catch (err) {
        alert(t('readFail') + (err as Error).message)
      }
      return
    }
    if (nativePlatform() === 'android') {
      // Android: SAF open with a persisted URI, so Recent re-reads the file fresh.
      try {
        const res = await openWorkbookAndroid()
        if (!res) return
        loadWorkbook(res.wb.sheets, res.wb.fileName)
        setFileHandle(null)
        setFilePath(null)
        addRecentFile(res.wb.fileName, res.bytes, { uri: res.uri })
      } catch (err) {
        alert(t('readFail') + (err as Error).message)
      }
      return
    }
    if (CAN_SAVE_IN_PLACE) {
      try {
        const result = await pickAndReadWorkbook()
        if (!result) return
        loadWorkbook(result.wb.sheets, result.wb.fileName)
        setFileHandle(result.handle)
        setFilePath(null)
        // Web has no Recent-files support (no persistent reference to re-read).
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
      const wb = await readWorkbookFile(file)
      loadWorkbook(wb.sheets, wb.fileName)
      setFileHandle(null)
      setFilePath(null)
    } catch (err) {
      alert(t('readFail') + (err as Error).message)
    }
    e.target.value = ''
  }

  // Reopen a recent file, re-reading it fresh from disk (desktop: by path). Falls
  // back to the stored byte snapshot if the fresh read fails (file moved/deleted).
  const openRecent = async (f: RecentFile) => {
    try {
      let wb
      if (f.path && isTauri()) {
        wb = await readWorkbookFromPath(f.path)
      } else if (f.uri && nativePlatform() === 'android') {
        wb = await readWorkbookFromUri(f.uri, f.name)
      }
      if (!wb) {
        wb = await readWorkbookFile(new File([f.bytes], f.name))
      }
      loadWorkbook(wb.sheets, wb.fileName)
      setFileHandle(null)
      setFilePath(f.path ?? null)
      addRecentFile(f.name, f.bytes, { path: f.path, uri: f.uri }) // bump recency
    } catch (err) {
      alert(t('readFail') + (err as Error).message)
    }
  }

  const saveInPlace = async () => {
    const { hf, sheets, fileHandle, filePath, charts } = useStore.getState()
    try {
      if (fileHandle) {
        // Chromium: write back through the File System Access handle.
        await saveToHandle(hf, sheets, fileHandle, charts)
      } else if (isTauri() && filePath) {
        // Desktop app: write back to the known path.
        const fmt = filePath.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx'
        await saveWorkbookToPath(hf, sheets, filePath, fmt, charts)
      }
    } catch (err) {
      alert(t('saveFail') + (err as Error).message)
    }
  }

  // Android: try the system "Save As" dialog (SAF) so the user picks the folder.
  // Returns true when it handled the save (saved or cancelled); false to fall back.
  const trySafSave = async (format: 'xlsx' | 'csv', name: string): Promise<boolean> => {
    if (nativePlatform() !== 'android') return false
    const { hf, sheets, charts } = useStore.getState()
    const outcome = await saveWorkbookViaSaf(hf, sheets, name, format, charts)
    if (outcome === 'unavailable') return false
    if (outcome === 'saved') showToast(t('savedToast'))
    return true // saved or cancelled — don't fall through
  }

  const save = async (format: 'xlsx' | 'csv') => {
    const { hf, sheets, fileName, charts } = useStore.getState()
    try {
      if (await trySafSave(format, fileName)) return
      const saved = await exportWorkbook(hf, sheets, fileName, format, charts)
      if (saved) setSavedModal(saved) // native app: confirm location + offer share
    } catch (err) {
      alert(t('saveFail') + (err as Error).message)
    }
  }

  // Save As: pick a new name/location. On Chromium the new handle becomes the
  // in-place target (so later ⌘S saves there); elsewhere it downloads a copy.
  const saveAs = async () => {
    const { hf, sheets, fileName, charts } = useStore.getState()
    const suggested = `${fileName.replace(/\.(xlsx|csv)$/i, '')}.xlsx`
    try {
      // Android: the SAF dialog handles naming + location itself.
      if (await trySafSave('xlsx', fileName)) return
      // Native apps: drive the flow here so the in-app name modal always shows,
      // independent of saveWorkbookAs's desktop-dialog branching.
      if (isNativePlatform()) {
        const chosen = await promptFileName(suggested)
        if (chosen === null) return // cancelled
        const name = chosen.trim() || suggested
        const saved = await exportWorkbook(hf, sheets, name, 'xlsx', charts)
        useStore.setState({ fileName: `${name.replace(/\.(xlsx|csv)$/i, '')}.xlsx` })
        if (saved) setSavedModal(saved) // confirm location + offer share
        return
      }
      const res = await saveWorkbookAs(hf, sheets, fileName, 'xlsx', charts, promptFileName)
      if (!res) return // user cancelled
      useStore.setState({ fileName: res.name, fileHandle: res.handle })
      setFilePath(res.path ?? null) // desktop: remember the path for in-place Cmd+S
      if (res.saved) setSavedModal(res.saved)
    } catch (err) {
      alert(t('saveFail') + (err as Error).message)
    }
  }

  const newFile = () => {
    if (confirm(t('newFileConfirm'))) {
      newWorkbook()
      setFileHandle(null)
      setFilePath(null)
    }
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
        {SUPPORTS_RECENT && (
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
        )}
        <Dropdown
          title={t('save')}
          trigger={
            <>
              <Icon name="save" />
              {t('save')}
            </>
          }
        >
          {canSaveInPlace && (
            <button
              className="menu-item"
              onClick={saveInPlace}
              disabled={!hasTarget}
              title={hasTarget ? undefined : t('saveInPlaceHint')}
            >
              <span className="menu-label">
                <Icon name="save" />
                {t('saveInPlace')}
              </span>
              <span className="menu-hint">⌘S</span>
            </button>
          )}
          {canSaveInPlace && (
            <button
              className="menu-item"
              role="menuitemcheckbox"
              aria-checked={autoSave}
              onClick={(e) => {
                // Keep the menu open so the toggle state is visible.
                e.stopPropagation()
                toggleAutoSave()
                showToast(t(useSettingsStore.getState().autoSave ? 'autoSaveOn' : 'autoSaveOff'))
              }}
              title={t('autoSaveHint')}
            >
              <span className="menu-label">
                <span className={`menu-check${autoSave ? ' on' : ''}`}>{autoSave ? '✓' : ''}</span>
                {t('autoSave')}
              </span>
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
        <button
          className={`tbtn icon-btn${painterActive ? ' active' : ''}`}
          title={t('formatPainter')}
          aria-label={t('formatPainter')}
          aria-pressed={painterActive}
          onClick={startFormatPainter}
        >
          <Icon name="format-painter" />
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
        <button className="tbtn" title={t('findReplace')} onClick={onOpenFind}>
          <Icon name="search" />
          {t('find')}
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

      <div className="group">
        <button
          className="tbtn"
          title={t('keyboardShortcuts')}
          aria-label={t('keyboardShortcuts')}
          onClick={onOpenShortcuts}
        >
          <Icon name="help" />
        </button>
      </div>
      {nameModal && (
        <SaveAsDialog
          suggested={nameModal.suggested}
          label={t('saveAsPrompt')}
          okLabel={t('saveAsOk')}
          cancelLabel={t('saveAsCancel')}
          onConfirm={(v) => resolveNameModal(v)}
          onCancel={() => resolveNameModal(null)}
        />
      )}
      {savedModal && (
        <SavedDialog
          result={savedModal}
          title={t('savedTitle')}
          locationLabel={t('savedLocation')}
          body={t('savedBody')}
          shareLabel={t('savedShare')}
          closeLabel={t('close')}
          onClose={() => setSavedModal(null)}
        />
      )}
    </div>
  )
}

/** Confirmation shown after a native save: where the file went + a Share button. */
function SavedDialog({
  result,
  title,
  locationLabel,
  body,
  shareLabel,
  closeLabel,
  onClose,
}: {
  result: NativeSaveResult
  title: string
  locationLabel: string
  body: string
  shareLabel: string
  closeLabel: string
  onClose: () => void
}) {
  const [sharing, setSharing] = useState(false)
  // Human-readable on-device path (strip the file:// scheme, decode %20 etc.).
  let path = result.uri
  try {
    path = decodeURIComponent(result.uri.replace(/^file:\/\//, ''))
  } catch {
    /* keep the raw uri if it isn't decodable */
  }
  const share = async () => {
    setSharing(true)
    try {
      await shareFileNative(result)
    } catch {
      /* surfaced by the platform; ignore here */
    } finally {
      setSharing(false)
    }
  }
  return createPortal(
    <div className="saveas-overlay">
      <div className="saveas-modal">
        <div className="saved-title">{title}</div>
        <div className="saveas-label">{locationLabel}</div>
        <div className="saved-path">{path}</div>
        <div className="saveas-label">{body}</div>
        <div className="saveas-actions">
          <button className="saveas-btn" onClick={onClose}>
            {closeLabel}
          </button>
          <button className="saveas-btn primary" onClick={share} disabled={sharing}>
            {shareLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Modal asking for a file name (in-app, so it works without a WebView JS prompt). */
function SaveAsDialog({
  suggested,
  label,
  okLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  suggested: string
  label: string
  okLabel: string
  cancelLabel: string
  onConfirm: (name: string) => void
  onCancel: () => void
}) {
  const [val, setVal] = useState(suggested)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    // Preselect the base name (before the extension) for a quick rename.
    const dot = el.value.lastIndexOf('.')
    el.setSelectionRange(0, dot > 0 ? dot : el.value.length)
  }, [])
  const confirm = () => onConfirm(val)
  return createPortal(
    <div className="saveas-overlay">
      <div className="saveas-modal">
        <label className="saveas-label">{label}</label>
        <input
          ref={inputRef}
          className="saveas-input"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') {
              e.preventDefault()
              confirm()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onCancel()
            }
          }}
        />
        <div className="saveas-actions">
          <button className="saveas-btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="saveas-btn primary" onClick={confirm}>
            {okLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
