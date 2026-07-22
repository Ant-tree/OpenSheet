import { useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n'
import Icon from './Icon'

export default function SheetTabs() {
  const t = useT()
  const sheets = useStore((s) => s.sheets)
  const activeSheetId = useStore((s) => s.activeSheetId)
  const setActiveSheet = useStore((s) => s.setActiveSheet)
  const addSheet = useStore((s) => s.addSheet)
  const removeSheet = useStore((s) => s.removeSheet)
  const renameSheet = useStore((s) => s.renameSheet)

  // The tab bar scrolls horizontally when there are many sheets. Switching to a
  // sheet whose tab sits outside the visible area (e.g. via Ctrl+PageUp/Down)
  // must bring that tab into view, otherwise the active tab seems to vanish.
  const activeRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeSheetId, sheets.length])

  return (
    <div className="sheet-tabs">
      {sheets.map((s) => (
        <div
          key={s.id}
          ref={s.id === activeSheetId ? activeRef : undefined}
          className={`sheet-tab${s.id === activeSheetId ? ' active' : ''}`}
          onMouseDown={() => setActiveSheet(s.id)}
          onDoubleClick={() => {
            const name = prompt(t('renameHint'), s.name)
            if (name) renameSheet(s.id, name)
          }}
          title={t('renameHint')}
        >
          {s.name}
          {sheets.length > 1 && (
            <span
              className="close"
              title={t('deleteSheet')}
              onMouseDown={(e) => {
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
  )
}
