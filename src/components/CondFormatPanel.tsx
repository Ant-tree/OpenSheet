import { useState } from 'react'
import { useStore } from '../store/useStore'
import { selectionBounds } from '../lib/utils'
import { useT } from '../i18n'
import type { CondFormatKind, CondFormatOp } from '../types'
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
  const [kind, setKind] = useState<CondFormatKind>('cell')
  const [op, setOp] = useState<CondFormatOp>('greaterThan')
  const [value1, setValue1] = useState('')
  const [value2, setValue2] = useState('')
  const [bgColor, setBgColor] = useState('#ffe08a')
  const [minColor, setMinColor] = useState('#f8696b')
  const [maxColor, setMaxColor] = useState('#63be7b')
  const [barColor, setBarColor] = useState('#5b9bd5')

  const apply = () => {
    const b = selectionBounds(useStore.getState().selection)
    const range = { top: b.top, left: b.left, bottom: b.bottom, right: b.right }
    if (kind === 'colorScale') {
      useStore.getState().addCondFormat({ range, kind, minColor, maxColor })
    } else if (kind === 'dataBar') {
      useStore.getState().addCondFormat({ range, kind, barColor })
    } else {
      if (!value1.trim()) return
      useStore.getState().addCondFormat({
        range,
        op,
        value1: value1.trim(),
        value2: op === 'between' ? value2.trim() : undefined,
        bgColor,
      })
    }
  }

  return (
    <div className="find-panel">
      <div className="find-row">
        <select
          className="find-input"
          style={{ width: 120 }}
          value={kind}
          onChange={(e) => setKind(e.target.value as CondFormatKind)}
        >
          <option value="cell">{t('condKindCell')}</option>
          <option value="colorScale">{t('condKindColorScale')}</option>
          <option value="dataBar">{t('condKindDataBar')}</option>
        </select>

        {kind === 'cell' && (
          <>
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
          </>
        )}

        {kind === 'colorScale' && (
          <>
            <label className="color-field" title={t('condMinColor')}>
              <input type="color" value={minColor} onChange={(e) => setMinColor(e.target.value)} />
            </label>
            <span className="find-count" style={{ minWidth: 0 }}>
              →
            </span>
            <label className="color-field" title={t('condMaxColor')}>
              <input type="color" value={maxColor} onChange={(e) => setMaxColor(e.target.value)} />
            </label>
          </>
        )}

        {kind === 'dataBar' && (
          <label className="color-field" title={t('condBarColor')}>
            <input type="color" value={barColor} onChange={(e) => setBarColor(e.target.value)} />
          </label>
        )}

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
