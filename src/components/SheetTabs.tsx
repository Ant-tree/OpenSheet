import { useEffect, useRef } from 'react'
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
            onDoubleClick={() => {
              const name = prompt(t('renameHint'), s.name)
              if (name) renameSheet(s.id, name)
            }}
            title={t('renameHint')}
          >
            {s.name}
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
    </div>
  )
}
