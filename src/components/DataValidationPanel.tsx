import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n'
import Icon from './Icon'

/** Panel to attach / clear a dropdown (list) data-validation on the selection. */
export default function DataValidationPanel({ onClose }: { onClose: () => void }) {
  const t = useT()
  const [text, setText] = useState('')

  const apply = () => {
    const values = text.split(',')
    useStore.getState().addDataValidation(values)
    onClose()
  }
  const clear = () => {
    useStore.getState().clearDataValidations()
    onClose()
  }

  return (
    <div className="find-panel">
      <div className="find-row">
        <input
          className="find-input"
          style={{ width: 240 }}
          placeholder={t('dvPlaceholder')}
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply()
            else if (e.key === 'Escape') onClose()
          }}
        />
        <button className="tbtn find-btn" onClick={apply}>
          {t('dvApply')}
        </button>
        <button className="tbtn find-btn" onClick={clear}>
          {t('dvClear')}
        </button>
        <button className="tbtn" title={t('close')} onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
    </div>
  )
}
