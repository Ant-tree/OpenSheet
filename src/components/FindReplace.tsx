import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { replaceCaseInsensitive } from '../lib/utils'
import { useT } from '../i18n'
import Icon from './Icon'

function collectMatches(q: string): { row: number; col: number }[] {
  const s = useStore.getState()
  const dims = s.hf.getSheetDimensions(s.activeSheetId)
  const lower = q.toLowerCase()
  const res: { row: number; col: number }[] = []
  for (let r = 0; r < dims.height; r++) {
    for (let c = 0; c < dims.width; c++) {
      const raw = s.getRaw(r, c)
      if (raw && raw.toLowerCase().includes(lower)) res.push({ row: r, col: c })
    }
  }
  return res
}

export default function FindReplace({
  mode,
  onClose,
}: {
  mode: 'find' | 'replace'
  onClose: () => void
}) {
  const t = useT()
  const [find, setFind] = useState('')
  const [repl, setRepl] = useState('')
  const [count, setCount] = useState<number | null>(null)
  const findRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    findRef.current?.focus()
    findRef.current?.select()
  }, [])

  const step = (dir: 1 | -1) => {
    if (!find) {
      setCount(null)
      return
    }
    const s = useStore.getState()
    const ms = collectMatches(find)
    setCount(ms.length)
    if (!ms.length) return
    const cur = s.selection.focus
    let target: { row: number; col: number }
    if (dir > 0) {
      target =
        ms.find((m) => m.row > cur.row || (m.row === cur.row && m.col > cur.col)) ?? ms[0]
    } else {
      const before = ms.filter((m) => m.row < cur.row || (m.row === cur.row && m.col < cur.col))
      target = before.length ? before[before.length - 1] : ms[ms.length - 1]
    }
    s.setSelection({ anchor: target, focus: target })
  }

  const replaceOne = () => {
    const s = useStore.getState()
    const { row, col } = s.selection.focus
    const raw = s.getRaw(row, col)
    if (find && raw.toLowerCase().includes(find.toLowerCase())) {
      s.setCellContent(row, col, replaceCaseInsensitive(raw, find, repl))
    }
    step(1)
  }

  const replaceAll = () => setCount(useStore.getState().replaceAll(find, repl))

  const countLabel =
    count === null ? '' : count === 0 ? t('noMatch') : t('matchCount').replace('{n}', String(count))

  return (
    <div className="find-panel">
      <div className="find-row">
        <input
          ref={findRef}
          className="find-input"
          placeholder={t('findPlaceholder')}
          value={find}
          onChange={(e) => {
            setFind(e.target.value)
            setCount(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              step(e.shiftKey ? -1 : 1)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
        />
        <span className="find-count">{countLabel}</span>
        <button className="tbtn" title={t('findPrev')} onClick={() => step(-1)}>
          ↑
        </button>
        <button className="tbtn" title={t('findNext')} onClick={() => step(1)}>
          ↓
        </button>
        <button className="tbtn" title={t('close')} onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {mode === 'replace' && (
        <div className="find-row">
          <input
            className="find-input"
            placeholder={t('replacePlaceholder')}
            value={repl}
            onChange={(e) => setRepl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                replaceOne()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
              }
            }}
          />
          <button className="tbtn find-btn" onClick={replaceOne}>
            {t('replaceOne')}
          </button>
          <button className="tbtn find-btn" onClick={replaceAll}>
            {t('replaceAll')}
          </button>
        </div>
      )}
    </div>
  )
}
