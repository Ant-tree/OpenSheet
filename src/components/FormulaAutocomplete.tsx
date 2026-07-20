import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { argHint, funcTokenAt, matchFunctions } from '../lib/formula'

interface Options {
  inputRef: RefObject<HTMLInputElement>
  value: string
  /** Only compute while this input is the active formula editor. */
  active: boolean
  /** Replace the input's value and place the caret. */
  apply: (nextValue: string, caret: number) => void
}

interface PopState {
  items: string[]
  idx: number
  hint: string | null
  tokenStart: number
  top: number
  left: number
}

const EMPTY: PopState = { items: [], idx: 0, hint: null, tokenStart: -1, top: 0, left: 0 }

/**
 * Function-name autocomplete + argument hint for a formula input. Returns a
 * popup node to render, a keydown handler (returns true when it consumed the
 * event), and a `reposition` callback to call on caret moves.
 */
export function useFormulaAutocomplete({ inputRef, value, active, apply }: Options) {
  const [pop, setPop] = useState<PopState>(EMPTY)
  const popRef = useRef(pop)
  popRef.current = pop

  const recompute = useCallback(() => {
    const el = inputRef.current
    if (!el || !active || !value.startsWith('=')) {
      setPop(EMPTY)
      return
    }
    const caret = el.selectionStart ?? value.length
    const tok = funcTokenAt(value, caret)
    const items = tok ? matchFunctions(tok.word) : []
    const hint = items.length ? null : argHint(value, caret)
    if (!items.length && !hint) {
      setPop(EMPTY)
      return
    }
    const r = el.getBoundingClientRect()
    setPop((prev) => ({
      items,
      idx: items.length ? Math.min(prev.idx, items.length - 1) : 0,
      hint,
      tokenStart: tok?.start ?? -1,
      top: Math.min(r.bottom, window.innerHeight - 8),
      left: Math.min(r.left, window.innerWidth - 240),
    }))
  }, [inputRef, value, active])

  useEffect(() => {
    recompute()
  }, [recompute])

  const applyName = useCallback(
    (name: string) => {
      const el = inputRef.current
      if (!el) return
      const caret = el.selectionStart ?? value.length
      const tok = funcTokenAt(value, caret)
      const start = tok ? tok.start : caret
      const insert = name + '('
      const next = value.slice(0, start) + insert + value.slice(caret)
      apply(next, start + insert.length)
      setPop(EMPTY)
    },
    [inputRef, value, apply],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      const p = popRef.current
      if (!p.items.length) return false
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setPop((s) => ({ ...s, idx: (s.idx + 1) % s.items.length }))
          return true
        case 'ArrowUp':
          e.preventDefault()
          setPop((s) => ({ ...s, idx: (s.idx - 1 + s.items.length) % s.items.length }))
          return true
        case 'Enter':
        case 'Tab':
          e.preventDefault()
          applyName(p.items[p.idx])
          return true
        case 'Escape':
          e.preventDefault()
          setPop(EMPTY)
          return true
        default:
          return false
      }
    },
    [applyName],
  )

  const node =
    pop.items.length || pop.hint ? (
      <div className="fx-pop" style={{ top: pop.top, left: pop.left }}>
        {pop.items.length ? (
          pop.items.map((name, i) => (
            <div
              key={name}
              className={`fx-item${i === pop.idx ? ' active' : ''}`}
              // Keep the input focused so selecting doesn't commit the edit.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyName(name)}
            >
              <span className="fx-fn">{name}</span>
            </div>
          ))
        ) : (
          <div className="fx-hint">{pop.hint}</div>
        )}
      </div>
    ) : null

  return { node, onKeyDown, reposition: recompute }
}
