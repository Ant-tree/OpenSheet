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
  const moveSheet = useStore((s) => s.moveSheet)

  // Rename via an in-app modal (not window.prompt): the Tauri desktop WebView and
  // the Android WebView don't support window.prompt, so a double-click there did
  // nothing. This modal works on every platform, touch included.
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null)

  // Drag-to-reorder. Uses Pointer Events (mouse + touch + pen in one path); the
  // tabs carry `touch-action: none` (CSS) so a horizontal drag on a tab is a
  // reorder, not a strip scroll (a tap still fires click → switch sheet). We
  // reorder live as the pointer crosses each tab's midpoint.
  const scrollRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; pointerId: number; startX: number; moved: boolean } | null>(null)
  const justDragged = useRef(false)
  const [dragId, setDragId] = useState<number | null>(null)

  const onTabPointerDown = (e: React.PointerEvent, id: number) => {
    // Let the rename/close controls handle their own clicks.
    if ((e.target as HTMLElement).closest('.rename, .close')) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    drag.current = { id, pointerId: e.pointerId, startX: e.clientX, moved: false }
  }

  const onTabPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    if (!d.moved) {
      if (Math.abs(e.clientX - d.startX) < 6) return
      d.moved = true
      setDragId(d.id)
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    }
    // Find the tab whose horizontal midpoint the pointer is past, and move there.
    const tabs = Array.from(scrollRef.current?.querySelectorAll('.sheet-tab') ?? [])
    const order = useStore.getState().sheets
    let target = order.length - 1
    for (let i = 0; i < tabs.length; i++) {
      const r = tabs[i].getBoundingClientRect()
      if (e.clientX < r.left + r.width / 2) {
        target = i
        break
      }
    }
    const curIdx = order.findIndex((s) => s.id === d.id)
    if (curIdx !== -1 && curIdx !== target) moveSheet(d.id, target)
  }

  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    // A drag that moved should not also fire the tab's click (switch sheet).
    justDragged.current = d.moved
    drag.current = null
    setDragId(null)
  }

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
      <div className="sheet-tabs-scroll" ref={scrollRef}>
        {sheets.map((s) => (
          <div
            key={s.id}
            ref={s.id === activeSheetId ? activeRef : undefined}
            className={`sheet-tab${s.id === activeSheetId ? ' active' : ''}${
              s.id === dragId ? ' dragging' : ''
            }`}
            // onClick (not onMouseDown) fires reliably from a touch tap even
            // inside this horizontally-scrollable strip.
            onClick={() => {
              if (justDragged.current) {
                justDragged.current = false
                return
              }
              setActiveSheet(s.id)
            }}
            onDoubleClick={() => setRenaming({ id: s.id, name: s.name })}
            onPointerDown={(e) => onTabPointerDown(e, s.id)}
            onPointerMove={onTabPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
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
