import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { cellRefToA1 } from '../lib/utils'
import { useT } from '../i18n'

export default function FormulaBar() {
  const t = useT()
  const selection = useStore((s) => s.selection)
  const rev = useStore((s) => s.rev)
  const setCellContent = useStore((s) => s.setCellContent)
  const getRaw = useStore((s) => s.getRaw)

  const { row, col } = selection.focus
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)

  // Sync from the active cell whenever selection or data changes (unless the
  // user is actively typing in the formula bar).
  useEffect(() => {
    if (!focused) setValue(getRaw(row, col))
  }, [row, col, rev, focused, getRaw])

  const commit = () => {
    setCellContent(row, col, value)
    setFocused(false)
  }

  return (
    <div className="formula-bar">
      <div className="name-box">{cellRefToA1(selection.focus)}</div>
      <div className="fx">fx</div>
      <input
        className="formula-input"
        value={value}
        placeholder={t('formulaPlaceholder')}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
            ;(e.target as HTMLInputElement).blur()
          } else if (e.key === 'Escape') {
            setValue(getRaw(row, col))
            setFocused(false)
            ;(e.target as HTMLInputElement).blur()
          }
        }}
      />
    </div>
  )
}
