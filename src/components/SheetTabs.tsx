import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store/useStore'
import { useT } from '../i18n'
import Icon from './Icon'

export default function SheetTabs() {
  const t = useT()
  const sheets = useStore((s) => s.sheets)
  const activeSheetId = useStore((s) => s.activeSheetId)
  const setActiveSheet = useStore((s) => s.setActiveSheet)
  const moveActiveSheet = useStore((s) => s.moveActiveSheet)
  const addSheet = useStore((s) => s.addSheet)
  const removeSheet = useStore((s) => s.removeSheet)
  const renameSheet = useStore((s) => s.renameSheet)

  // Rename via an in-app modal (not window.prompt): the Tauri desktop WebView and
  // the Android WebView don't support window.prompt, so a double-click there did
  // nothing. This modal works on every platform, touch included.
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null)

  // The tab strip scrolls horizontally when there are many sheets. Whenever the
  // active sheet changes, bring its tab into view so it never sits hidden
  // outside the scroll area.
  const activeRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeSheetId, sheets.length])

  const multi = sheets.length > 1

  return (
    <div className="sheet-tabs">
      {/* Always-visible prev/next controls: the one reliable way to switch
          sheets on every platform (mobile has no keyboard; browsers swallow
          Ctrl+PageUp/PageDown for their own tab switching). */}
      <button
        className="tab-nav"
        title={t('prevSheet')}
        onClick={() => moveActiveSheet(-1)}
        disabled={!multi}
      >
        ‹
      </button>
      <div className="sheet-tabs-scroll">
        {sheets.map((s) => (
          <div
            key={s.id}
            ref={s.id === activeSheetId ? activeRef : undefined}
            className={`sheet-tab${s.id === activeSheetId ? ' active' : ''}`}
            // onClick (not onMouseDown) fires reliably from a touch tap even
            // inside this horizontally-scrollable strip.
            onClick={() => setActiveSheet(s.id)}
            onDoubleClick={() => setRenaming({ id: s.id, name: s.name })}
            title={t('renameHint')}
          >
            {s.name}
            <span
              className="rename"
              title={t('renameSheetTitle')}
              onClick={(e) => {
                e.stopPropagation()
                setRenaming({ id: s.id, name: s.name })
              }}
            >
              <Icon name="edit" />
            </span>
            {multi && (
              <span
                className="close"
                title={t('deleteSheet')}
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(t('deleteSheetConfirm').replace('{name}', s.name))) removeSheet(s.id)
                }}
              >
                <Icon name="close" />
              </span>
            )}
          </div>
        ))}
        <button className="add-sheet" title={t('addSheet')} onClick={addSheet}>
          <Icon name="plus" />
        </button>
      </div>
      <button
        className="tab-nav"
        title={t('nextSheet')}
        onClick={() => moveActiveSheet(1)}
        disabled={!multi}
      >
        ›
      </button>
      {renaming && (
        <RenameDialog
          initial={renaming.name}
          label={t('renameSheetTitle')}
          okLabel={t('saveAsOk')}
          cancelLabel={t('saveAsCancel')}
          onConfirm={(name) => {
            const trimmed = name.trim()
            if (trimmed) renameSheet(renaming.id, trimmed)
            setRenaming(null)
          }}
          onCancel={() => setRenaming(null)}
        />
      )}
    </div>
  )
}

/** In-app rename modal, styled like the Save-As dialog. Used instead of
 *  window.prompt so renaming works in the Tauri/Android WebViews too. */
function RenameDialog({
  initial,
  label,
  okLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  initial: string
  label: string
  okLabel: string
  cancelLabel: string
  onConfirm: (name: string) => void
  onCancel: () => void
}) {
  const [val, setVal] = useState(initial)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [])
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
              onConfirm(val)
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
          <button className="saveas-btn primary" onClick={() => onConfirm(val)}>
            {okLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
