import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  useStore,
  MAX_ROWS,
  MAX_COLS,
  DEFAULT_COL_WIDTH,
  DEFAULT_ROW_HEIGHT,
  HEADER_WIDTH,
} from '../store/useStore'
import { displayValue } from '../lib/format'
import { colToLetter, isInSelection, key, selectionBounds } from '../lib/utils'
import type { MergeRange } from '../types'

export default function Grid() {
  useStore((s) => s.rev) // subscribe so the grid re-renders on every data change
  const selection = useStore((s) => s.selection)
  const editing = useStore((s) => s.editing)
  const activeSheetId = useStore((s) => s.activeSheetId)
  const sheets = useStore((s) => s.sheets)
  const sheet = useMemo(() => sheets.find((x) => x.id === activeSheetId)!, [sheets, activeSheetId])

  const setSelection = useStore((s) => s.setSelection)
  const setEditing = useStore((s) => s.setEditing)
  const moveSelection = useStore((s) => s.moveSelection)
  const setCellContent = useStore((s) => s.setCellContent)
  const clearSelectedContents = useStore((s) => s.clearSelectedContents)
  const setColWidth = useStore((s) => s.setColWidth)

  const dragging = useRef(false)
  const [editBuffer, setEditBuffer] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Build lookup of merge coverage for the active sheet.
  const { covered, anchorOf } = useMemo(() => {
    const covered = new Set<string>()
    const anchorOf = new Map<string, MergeRange>()
    for (const m of sheet.merges) {
      anchorOf.set(key(m.top, m.left), m)
      for (let r = m.top; r <= m.bottom; r++) {
        for (let c = m.left; c <= m.right; c++) {
          if (r === m.top && c === m.left) continue
          covered.add(key(r, c))
        }
      }
    }
    return { covered, anchorOf }
  }, [sheet.merges])

  const startEditing = useCallback(
    (row: number, col: number, initial?: string) => {
      const raw = initial ?? useStore.getState().getRaw(row, col)
      setEditBuffer(raw)
      setEditing({ row, col })
    },
    [setEditing],
  )

  const commitEdit = useCallback(
    (move: 'down' | 'right' | 'none') => {
      if (!editing) return
      setCellContent(editing.row, editing.col, editBuffer)
      setEditing(null)
      if (move === 'down') moveSelection(1, 0, false)
      else if (move === 'right') moveSelection(0, 1, false)
    },
    [editing, editBuffer, setCellContent, setEditing, moveSelection],
  )

  useLayoutEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      const len = inputRef.current.value.length
      inputRef.current.setSelectionRange(len, len)
    }
  }, [editing])

  // ----- keyboard navigation on the grid container -----
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (editing) return // the input handles its own keys
      const { key: k } = e
      if (k === 'ArrowUp') {
        e.preventDefault()
        moveSelection(-1, 0, e.shiftKey)
      } else if (k === 'ArrowDown') {
        e.preventDefault()
        moveSelection(1, 0, e.shiftKey)
      } else if (k === 'ArrowLeft') {
        e.preventDefault()
        moveSelection(0, -1, e.shiftKey)
      } else if (k === 'ArrowRight' || k === 'Tab') {
        e.preventDefault()
        moveSelection(0, k === 'Tab' && e.shiftKey ? -1 : 1, k === 'Tab' ? false : e.shiftKey)
      } else if (k === 'Enter') {
        e.preventDefault()
        startEditing(selection.focus.row, selection.focus.col)
      } else if (k === 'F2') {
        e.preventDefault()
        startEditing(selection.focus.row, selection.focus.col)
      } else if (k === 'Delete' || k === 'Backspace') {
        e.preventDefault()
        clearSelectedContents()
      } else if (k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Printable character starts editing, replacing the cell.
        startEditing(selection.focus.row, selection.focus.col, k)
      }
    },
    [editing, moveSelection, startEditing, selection, clearSelectedContents],
  )

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitEdit('down')
    } else if (e.key === 'Tab') {
      e.preventDefault()
      commitEdit('right')
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setEditing(null)
    }
  }

  // ----- mouse selection -----
  const onCellMouseDown = (row: number, col: number, e: React.MouseEvent) => {
    if (editing) commitEdit('none')
    if (e.shiftKey) {
      setSelection({ anchor: selection.anchor, focus: { row, col } })
    } else {
      setSelection({ anchor: { row, col }, focus: { row, col } })
    }
    dragging.current = true
  }
  const onCellMouseEnter = (row: number, col: number) => {
    if (dragging.current) {
      setSelection({ anchor: useStore.getState().selection.anchor, focus: { row, col } })
    }
  }
  useEffect(() => {
    const up = () => (dragging.current = false)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  // ----- column resize -----
  const resizeState = useRef<{ col: number; startX: number; startW: number } | null>(null)
  const onResizeDown = (col: number, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    resizeState.current = {
      col,
      startX: e.clientX,
      startW: sheet.colWidths[col] ?? DEFAULT_COL_WIDTH,
    }
    const move = (ev: MouseEvent) => {
      if (!resizeState.current) return
      const dx = ev.clientX - resizeState.current.startX
      setColWidth(resizeState.current.col, resizeState.current.startW + dx)
    }
    const up = () => {
      resizeState.current = null
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const bounds = selectionBounds(selection)
  const colWidth = (c: number) => sheet.colWidths[c] ?? DEFAULT_COL_WIDTH
  const totalWidth = useMemo(() => {
    let w = HEADER_WIDTH
    for (let c = 0; c < MAX_COLS; c++) w += sheet.colWidths[c] ?? DEFAULT_COL_WIDTH
    return w
  }, [sheet.colWidths])

  // Keep the active cell scrolled into view on keyboard navigation. We compute
  // this manually because native scrollIntoView ignores the sticky header/row
  // offsets and would hide cells behind them.
  useEffect(() => {
    const container = scrollRef.current
    const el = container?.querySelector<HTMLElement>('.cell.active')
    if (!container || !el) return
    const c = container.getBoundingClientRect()
    const e = el.getBoundingClientRect()
    if (e.top < c.top + DEFAULT_ROW_HEIGHT) container.scrollTop -= c.top + DEFAULT_ROW_HEIGHT - e.top
    else if (e.bottom > c.bottom) container.scrollTop += e.bottom - c.bottom
    if (e.left < c.left + HEADER_WIDTH) container.scrollLeft -= c.left + HEADER_WIDTH - e.left
    else if (e.right > c.right) container.scrollLeft += e.right - c.right
  }, [selection.focus.row, selection.focus.col])

  return (
    <div className="grid-scroll" ref={scrollRef} tabIndex={0} onKeyDown={onKeyDown}>
      <table className="grid" style={{ width: totalWidth }}>
        <colgroup>
          <col style={{ width: HEADER_WIDTH }} />
          {Array.from({ length: MAX_COLS }, (_, c) => (
            <col key={c} style={{ width: colWidth(c) }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="corner" />
            {Array.from({ length: MAX_COLS }, (_, c) => (
              <th
                key={c}
                className={`colhead${c >= bounds.left && c <= bounds.right ? ' sel' : ''}`}
                onMouseDown={() =>
                  setSelection({
                    anchor: { row: 0, col: c },
                    focus: { row: MAX_ROWS - 1, col: c },
                  })
                }
              >
                <div className="colhead-wrap">
                  {colToLetter(c)}
                  <div className="col-resize" onMouseDown={(e) => onResizeDown(c, e)} />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: MAX_ROWS }, (_, r) => (
            <tr key={r}>
              <th
                className={`rowhead${r >= bounds.top && r <= bounds.bottom ? ' sel' : ''}`}
                onMouseDown={() =>
                  setSelection({
                    anchor: { row: r, col: 0 },
                    focus: { row: r, col: MAX_COLS - 1 },
                  })
                }
              >
                {r + 1}
              </th>
              {Array.from({ length: MAX_COLS }, (_, c) => {
                const k = key(r, c)
                if (covered.has(k)) return null
                const merge = anchorOf.get(k)
                const isEditing = editing?.row === r && editing?.col === c
                const isActive = selection.focus.row === r && selection.focus.col === c
                const selected = isInSelection(r, c, selection)
                const fmt = sheet.formats[k]
                const computed = useStore.getState().getComputed(r, c)
                const text = displayValue(computed, fmt)
                const isNum = typeof computed === 'number'

                const style: React.CSSProperties = {}
                if (fmt) {
                  if (fmt.bold) style.fontWeight = 700
                  if (fmt.italic) style.fontStyle = 'italic'
                  if (fmt.underline) style.textDecoration = 'underline'
                  if (fmt.color) style.color = fmt.color
                  if (fmt.bgColor) style.background = fmt.bgColor
                  if (fmt.align) style.textAlign = fmt.align
                }

                return (
                  <td
                    key={c}
                    rowSpan={merge ? merge.bottom - merge.top + 1 : undefined}
                    colSpan={merge ? merge.right - merge.left + 1 : undefined}
                    className={`cell${selected ? ' selected' : ''}${isActive ? ' active' : ''}${
                      isNum && !fmt?.align ? ' num' : ''
                    }`}
                    style={style}
                    onMouseDown={(e) => onCellMouseDown(r, c, e)}
                    onMouseEnter={() => onCellMouseEnter(r, c)}
                    onDoubleClick={() => startEditing(r, c)}
                  >
                    {isEditing ? (
                      <input
                        ref={inputRef}
                        className="cell-input"
                        value={editBuffer}
                        onChange={(e) => setEditBuffer(e.target.value)}
                        onKeyDown={onInputKeyDown}
                        onBlur={() => commitEdit('none')}
                      />
                    ) : (
                      text
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
