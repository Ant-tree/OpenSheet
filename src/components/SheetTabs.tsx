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

  return (
    <div className="sheet-tabs">
      {sheets.map((s) => (
        <div
          key={s.id}
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
