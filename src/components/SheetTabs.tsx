import { useStore } from '../store/useStore'

export default function SheetTabs() {
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
            const name = prompt('시트 이름', s.name)
            if (name) renameSheet(s.id, name)
          }}
          title="더블클릭하여 이름 변경"
        >
          {s.name}
          {sheets.length > 1 && (
            <span
              className="close"
              title="시트 삭제"
              onMouseDown={(e) => {
                e.stopPropagation()
                if (confirm(`'${s.name}' 시트를 삭제할까요?`)) removeSheet(s.id)
              }}
            >
              ×
            </span>
          )}
        </div>
      ))}
      <button className="add-sheet" title="시트 추가" onClick={addSheet}>
        +
      </button>
    </div>
  )
}
