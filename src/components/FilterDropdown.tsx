import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n'

/** Per-column value picker for AutoFilter, anchored near the clicked header. */
export default function FilterDropdown({
  col,
  x,
  y,
  onClose,
}: {
  col: number
  x: number
  y: number
  onClose: () => void
}) {
  const t = useT()
  const values = useMemo(() => useStore.getState().columnValues(col), [col])
  const existing = useStore.getState().columnFilters[col]
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(existing ?? values),
  )

  const allChecked = checked.size === values.length
  const toggle = (v: string) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return next
    })
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(values))

  const apply = () => {
    useStore.getState().setColumnFilter(col, allChecked ? null : [...checked])
    onClose()
  }
  const clear = () => {
    useStore.getState().setColumnFilter(col, null)
    onClose()
  }

  return (
    <div
      className="filter-pop"
      style={{ top: Math.min(y, window.innerHeight - 320), left: Math.min(x, window.innerWidth - 220) }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <label className="filter-item filter-all">
        <input type="checkbox" checked={allChecked} onChange={toggleAll} />
        <span>{t('filterSelectAll')}</span>
      </label>
      <div className="filter-list">
        {values.map((v) => (
          <label key={v} className="filter-item">
            <input type="checkbox" checked={checked.has(v)} onChange={() => toggle(v)} />
            <span>{v === '' ? '—' : v}</span>
          </label>
        ))}
      </div>
      <div className="filter-actions">
        <button className="tbtn find-btn" onClick={apply}>
          {t('filterOk')}
        </button>
        <button className="tbtn find-btn" onClick={clear}>
          {t('filterClear')}
        </button>
      </div>
    </div>
  )
}
