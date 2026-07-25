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
  const duplicateSheet = useStore((s) => s.duplicateSheet)
  const moveSheet = useStore((s) => s.moveSheet)

  // Rename via an in-app modal (not window.prompt): the Tauri desktop WebView and
  // the Android WebView don't support window.prompt, so a double-click there did
  // nothing. This modal works on every platform, touch included.
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null)
  // Per-tab actions live in a single ⋯ dropdown so the tab body stays a reliable
  // click/drag target (three inline icons pushed the tab's center onto an icon).
  const [menu, setMenu] = useState<{ id: number; x: number; y: number } | null>(null)

  // Drag-to-reorder. Uses Pointer Events (mouse + touch + pen in one path); the
  // tabs carry `touch-action: none` (CSS) so a horizontal drag on a tab is a
  // reorder, not a strip scroll (a tap still fires click → switch sheet). We
  // reorder live as the pointer crosses each tab's midpoint.
  const scrollRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; pointerId: number; startX: number; moved: boolean } | null>(null)
  const justDragged = useRef(false)
  const [dragId, setDragId] = useState<number | null>(null)

  const onTabPointerDown = (e: React.PointerEvent, id: number) => {
    // Let the ⋯ menu button handle its own clicks.
    if ((e.target as HTMLElement).closest('.tab-menu-btn')) return
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
  const menuSheet = menu && sheets.find((s) => s.id === menu.id)

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
            onContextMenu={(e) => {
              // Desktop convention: right-click opens the tab menu at the cursor.
              // (Touch has no right-click — the ⋯ button covers it there.)
              e.preventDefault()
              setMenu({ id: s.id, x: e.clientX, y: e.clientY })
            }}
            onPointerDown={(e) => onTabPointerDown(e, s.id)}
            onPointerMove={onTabPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            title={t('renameHint')}
          >
            <span className="sheet-tab-name">{s.name}</span>
            <button
              className="tab-menu-btn"
              title={t('sheetOptions')}
              aria-label={t('sheetOptions')}
              onClick={(e) => {
                e.stopPropagation()
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setMenu((cur) => (cur?.id === s.id ? null : { id: s.id, x: r.right, y: r.bottom }))
              }}
            >
              ⋯
            </button>
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
      {menu && menuSheet && (
        <TabMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: t('renameSheetTitle'),
              onClick: () => setRenaming({ id: menuSheet.id, name: menuSheet.name }),
            },
            {
              label: t('duplicateSheet'),
              onClick: () => duplicateSheet(menuSheet.id),
            },
            ...(multi
              ? [
                  {
                    label: t('deleteSheet'),
                    danger: true,
                    onClick: () => {
                      if (confirm(t('deleteSheetConfirm').replace('{name}', menuSheet.name)))
                        removeSheet(menuSheet.id)
                    },
                  },
                ]
              : []),
          ]}
        />
      )}
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

/** Small dropdown of per-tab actions, anchored under the ⋯ button. */
function TabMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number
  y: number
  items: { label: string; danger?: boolean; onClick: () => void }[]
  onClose: () => void
}) {
  useEffect(() => {
    const close = () => onClose()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
    }
  }, [onClose])
  const left = Math.min(x, window.innerWidth - 160)
  const top = Math.min(y, window.innerHeight - 20 - items.length * 34)
  return createPortal(
    <div
      className="dropdown-menu tab-menu"
      style={{ top, left }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {items.map((it) => (
        <button
          key={it.label}
          className={`menu-item${it.danger ? ' danger' : ''}`}
          onClick={() => {
            it.onClick()
            onClose()
          }}
        >
          {it.label}
        </button>
      ))}
    </div>,
    document.body,
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
