import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import type { BorderPreset } from '../store/useStore'
import {
  readWorkbookFile,
  exportWorkbook,
  pickAndReadWorkbook,
  saveToHandle,
  supportsFileSystemAccess,
} from '../lib/fileIO'
import { NUMBER_FORMAT_PRESETS, toPresetToken } from '../lib/format'
import { useT } from '../i18n'
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
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])
  return (
    <div className="dropdown" ref={ref}>
      <button className="tbtn" title={title} onClick={() => setOpen((o) => !o)}>
        {trigger}
        <Icon name="chevron-down" className="caret" />
      </button>
      {open && (
        <div className="dropdown-menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
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

export default function Toolbar() {
  const t = useT()
  const fileRef = useRef<HTMLInputElement>(null)
  const applyFormat = useStore((s) => s.applyFormat)
  const mergeSelection = useStore((s) => s.mergeSelection)
  const unmergeSelection = useStore((s) => s.unmergeSelection)
  const sortSelection = useStore((s) => s.sortSelection)
  const applyBorders = useStore((s) => s.applyBorders)
  const loadWorkbook = useStore((s) => s.loadWorkbook)
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
    } catch (err) {
      alert(t('readFail') + (err as Error).message)
    }
    e.target.value = ''
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

  return (
    <div className="toolbar">
      <div className="group">
        <button className="tbtn primary" onClick={openFile}>
          <Icon name="open" />
          {t('open')}
        </button>
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
          <button className="menu-item" onClick={() => save('xlsx')}>
            {t('saveXlsx')}
          </button>
          <button className="menu-item" onClick={() => save('csv')}>
            {t('saveCsv')}
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
      </div>
    </div>
  )
}
