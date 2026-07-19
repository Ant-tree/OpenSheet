import { useState } from 'react'
import { useStore } from '../store/useStore'
import { selectionBounds } from '../lib/utils'
import { useT } from '../i18n'
import type { CondFormatOp } from '../types'
import Icon from './Icon'

const OPS: { op: CondFormatOp; labelKey: 'condGreater' | 'condLess' | 'condBetween' | 'condEqual' | 'condContains' }[] = [
  { op: 'greaterThan', labelKey: 'condGreater' },
  { op: 'lessThan', labelKey: 'condLess' },
  { op: 'between', labelKey: 'condBetween' },
  { op: 'equal', labelKey: 'condEqual' },
  { op: 'textContains', labelKey: 'condContains' },
]

/** Panel to add/clear conditional-formatting rules for the current selection. */
export default function CondFormatPanel({ onClose }: { onClose: () => void }) {
  const t = useT()
  const [op, setOp] = useState<CondFormatOp>('greaterThan')
  const [value1, setValue1] = useState('')
  const [value2, setValue2] = useState('')
  const [bgColor, setBgColor] = useState('#ffe08a')

  const apply = () => {
    if (!value1.trim()) return
    const b = selectionBounds(useStore.getState().selection)
    useStore.getState().addCondFormat({
      range: { top: b.top, left: b.left, bottom: b.bottom, right: b.right },
      op,
      value1: value1.trim(),
      value2: op === 'between' ? value2.trim() : undefined,
      bgColor,
    })
  }

  return (
    <div className="find-panel">
      <div className="find-row">
        <select
          className="find-input"
          style={{ width: 150 }}
          value={op}
          onChange={(e) => setOp(e.target.value as CondFormatOp)}
        >
          {OPS.map((o) => (
            <option key={o.op} value={o.op}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>
        <input
          className="find-input"
          style={{ width: 90 }}
          placeholder={t('condValue')}
          value={value1}
          onChange={(e) => setValue1(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply()
            else if (e.key === 'Escape') onClose()
          }}
        />
        {op === 'between' && (
          <>
            <span className="find-count" style={{ minWidth: 0 }}>
              {t('condAnd')}
            </span>
            <input
              className="find-input"
              style={{ width: 90 }}
              placeholder={t('condValue')}
              value={value2}
              onChange={(e) => setValue2(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') apply()
                else if (e.key === 'Escape') onClose()
              }}
            />
          </>
        )}
        <label className="color-field" title={t('condHighlight')}>
          <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
        </label>
        <button className="tbtn find-btn" onClick={apply}>
          {t('condApply')}
        </button>
        <button className="tbtn find-btn" onClick={() => useStore.getState().clearCondFormats()}>
          {t('condClear')}
        </button>
        <button className="tbtn" title={t('close')} onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
    </div>
  )
}
