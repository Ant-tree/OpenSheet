import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  useStore,
  MAX_ROWS,
  MAX_COLS,
  DEFAULT_COL_WIDTH,
  DEFAULT_ROW_HEIGHT,
  HEADER_WIDTH,
} from '../store/useStore'
import { borderCss, displayValue, strongerBorder } from '../lib/format'
import { colToLetter, isInSelection, key, selectionBounds } from '../lib/utils'
import type { BorderSide, CellBorders, CellFormat, MergeRange } from '../types'
import ContextMenu from './ContextMenu'

/**
 * Compute the borders to actually paint for a rendered cell (a normal cell, or
 * a merge anchor spanning `merge`). Each cell owns its bottom & right edges,
 * merging in the touching neighbour's border so a shared line is drawn exactly
 * once (no doubling). Top & left are only painted at the grid's outer edge —
 * interior top/left segments are painted by the neighbour above/left. For a
 * merged region we take the union of the constituent cells' outer borders, so
 * borders stored on merge-covered cells (e.g. the right/bottom of a header box)
 * are not lost.
 */
function resolveBorders(
  formats: Record<string, CellFormat>,
  merge: MergeRange | undefined,
  r: number,
  c: number,
): CellBorders {
  const t = merge ? merge.top : r
  const b = merge ? merge.bottom : r
  const l = merge ? merge.left : c
  const rt = merge ? merge.right : c
  const B = (rr: number, cc: number) => formats[key(rr, cc)]?.borders
  let ownTop: BorderSide | undefined
  let ownBottom: BorderSide | undefined
  let ownLeft: BorderSide | undefined
  let ownRight: BorderSide | undefined
  for (let cc = l; cc <= rt; cc++) {
    ownTop = strongerBorder(ownTop, B(t, cc)?.top)
    ownBottom = strongerBorder(ownBottom, B(b, cc)?.bottom)
  }
  for (let rr = t; rr <= b; rr++) {
    ownLeft = strongerBorder(ownLeft, B(rr, l)?.left)
    ownRight = strongerBorder(ownRight, B(rr, rt)?.right)
  }
  let bottom = ownBottom
  let right = ownRight
  for (let cc = l; cc <= rt; cc++) bottom = strongerBorder(bottom, B(b + 1, cc)?.top)
  for (let rr = t; rr <= b; rr++) right = strongerBorder(right, B(rr, rt + 1)?.left)
  return {
    top: t === 0 ? ownTop : undefined,
    left: l === 0 ? ownLeft : undefined,
    bottom,
    right,
  }
}

/** A1 reference for a single cell, or a range if two corners differ. */
function rangeA1(a: { row: number; col: number }, b: { row: number; col: number }): string {
  const cell = (r: number, c: number) => `${colToLetter(c)}${r + 1}`
  const top = Math.min(a.row, b.row)
  const bottom = Math.max(a.row, b.row)
  const left = Math.min(a.col, b.col)
  const right = Math.max(a.col, b.col)
  return top === bottom && left === right
    ? cell(top, left)
    : `${cell(top, left)}:${cell(bottom, right)}`
}

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
  // Formula "point mode": while editing a =formula, clicking/dragging cells
  // inserts their A1 reference instead of moving the selection.
  const pointAnchor = useRef<{ row: number; col: number } | null>(null)
  const refRange = useRef<{ start: number; end: number } | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const longPress = useRef<number | null>(null)
  // Fill handle (auto-fill by dragging the selection's bottom-right corner).
  const [fillTarget, setFillTarget] = useState<MergeRange | null>(null)
  const filling = useRef(false)
  const fillSource = useRef<MergeRange | null>(null)
  const fillTargetRef = useRef<MergeRange | null>(null)

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

  const composingRef = useRef(false)

  const enterEdit = useCallback(
    (row: number, col: number) => {
      setEditBuffer(useStore.getState().getRaw(row, col))
      setEditing({ row, col })
    },
    [setEditing],
  )

  const commitEdit = useCallback(
    (move: 'down' | 'right' | 'none') => {
      const ed = useStore.getState().editing
      if (!ed) return
      setCellContent(ed.row, ed.col, editBuffer)
      setEditing(null)
      setEditBuffer('')
      pointAnchor.current = null
      refRange.current = null
      if (move === 'down') moveSelection(1, 0, false)
      else if (move === 'right') moveSelection(0, 1, false)
    },
    [editBuffer, setCellContent, setEditing, moveSelection],
  )

  const cancelEdit = useCallback(() => {
    setEditing(null)
    setEditBuffer('')
    pointAnchor.current = null
    refRange.current = null
  }, [setEditing])

  // True when the active input holds a formula (=…) and is ready to take a ref.
  const inFormulaEdit = () =>
    !!useStore.getState().editing && (inputRef.current?.value ?? '').trimStart().startsWith('=')

  // Insert (or, if we just placed one, replace) a cell/range reference at the caret.
  const insertRef = (ref: string) => {
    const input = inputRef.current
    if (!input) return
    const buf = input.value
    let start: number
    let end: number
    if (refRange.current) {
      start = refRange.current.start
      end = refRange.current.end
    } else {
      start = input.selectionStart ?? buf.length
      end = input.selectionEnd ?? start
    }
    const next = buf.slice(0, start) + ref + buf.slice(end)
    refRange.current = { start, end: start + ref.length }
    setEditBuffer(next)
    const caret = start + ref.length
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (el) {
        el.focus({ preventScroll: true })
        el.setSelectionRange(caret, caret)
      }
    })
  }

  // The active cell always hosts a focused input — even when not editing — so it
  // captures the first keystroke, including IME composition (Korean). Starting
  // an edit from a keydown on a non-editable element breaks that composition.
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus({ preventScroll: true })
    if (editing) {
      const len = el.value.length
      el.setSelectionRange(len, len)
    }
  }, [editing, selection.focus.row, selection.focus.col])

  // ----- keyboard handling on the active-cell input -----
  // Typing when not editing flows into onChange (which starts the edit), so the
  // browser/IME inserts the character naturally — no duplication, IME-safe.
  const onEditorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!useStore.getState().editing) {
      setEditing({ row: selection.focus.row, col: selection.focus.col })
    }
    // The user typed, so any auto-inserted reference is now committed text.
    refRange.current = null
    setEditBuffer(e.target.value)
  }

  const onEditorKeyDown = (e: React.KeyboardEvent) => {
    if (composingRef.current || e.nativeEvent.isComposing) return // don't disturb IME
    const isEditing = !!useStore.getState().editing
    const k = e.key
    if (isEditing) {
      if (k === 'Enter') {
        e.preventDefault()
        commitEdit('down')
      } else if (k === 'Tab') {
        e.preventDefault()
        commitEdit('right')
      } else if (k === 'Escape') {
        e.preventDefault()
        cancelEdit()
      }
      return // arrows etc. move the text caret while editing
    }
    // Navigation mode (input is empty; printable keys fall through to onChange).
    if (k === 'ArrowUp') {
      e.preventDefault()
      moveSelection(-1, 0, e.shiftKey)
    } else if (k === 'ArrowDown') {
      e.preventDefault()
      moveSelection(1, 0, e.shiftKey)
    } else if (k === 'ArrowLeft') {
      e.preventDefault()
      moveSelection(0, -1, e.shiftKey)
    } else if (k === 'ArrowRight') {
      e.preventDefault()
      moveSelection(0, 1, e.shiftKey)
    } else if (k === 'Tab') {
      e.preventDefault()
      moveSelection(0, e.shiftKey ? -1 : 1, false)
    } else if (k === 'Enter' || k === 'F2') {
      e.preventDefault()
      enterEdit(selection.focus.row, selection.focus.col)
    } else if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault()
      clearSelectedContents()
    }
  }

  const onCompositionStart = () => {
    composingRef.current = true
    if (!useStore.getState().editing) {
      setEditing({ row: selection.focus.row, col: selection.focus.col })
    }
  }
  const onCompositionEnd = () => {
    composingRef.current = false
  }

  // ----- mouse selection -----
  const onCellMouseDown = (row: number, col: number, e: React.MouseEvent) => {
    // Clicking inside the cell currently being edited: let the input place its
    // text caret (don't commit or re-select).
    if (editing?.row === row && editing?.col === col) return
    // Formula point mode: while editing a =formula, clicking a cell inserts its
    // reference into the formula instead of moving the selection.
    if (inFormulaEdit()) {
      e.preventDefault()
      pointAnchor.current = { row, col }
      dragging.current = true
      insertRef(rangeA1({ row, col }, { row, col }))
      return
    }
    // Clicking a non-input target (a cell body) would move focus to <body> and
    // steal it from the active-cell input that owns keyboard navigation. Prevent
    // that; still allow caret placement when clicking inside the edit input.
    if (!(e.target instanceof HTMLInputElement)) e.preventDefault()
    if (editing) commitEdit('none')
    if (e.shiftKey) {
      setSelection({ anchor: selection.anchor, focus: { row, col } })
    } else {
      setSelection({ anchor: { row, col }, focus: { row, col } })
    }
    dragging.current = true
    // Focus follows the active cell's input via a layout effect on selection.
  }
  const onFillStart = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const b = selectionBounds(useStore.getState().selection)
    fillSource.current = b
    fillTargetRef.current = b
    filling.current = true
    setFillTarget(b)
  }
  const onCellMouseEnter = (row: number, col: number) => {
    if (filling.current && fillSource.current) {
      const src = fillSource.current
      const dRow = row < src.top ? row - src.top : row > src.bottom ? row - src.bottom : 0
      const dCol = col < src.left ? col - src.left : col > src.right ? col - src.right : 0
      const tgt: MergeRange =
        Math.abs(dRow) >= Math.abs(dCol)
          ? { top: Math.min(src.top, row), bottom: Math.max(src.bottom, row), left: src.left, right: src.right }
          : { top: src.top, bottom: src.bottom, left: Math.min(src.left, col), right: Math.max(src.right, col) }
      fillTargetRef.current = tgt
      setFillTarget(tgt)
      return
    }
    if (pointAnchor.current) {
      insertRef(rangeA1(pointAnchor.current, { row, col })) // drag to extend the referenced range
      return
    }
    if (dragging.current) {
      setSelection({ anchor: useStore.getState().selection.anchor, focus: { row, col } })
    }
  }
  useEffect(() => {
    const up = () => {
      if (filling.current) {
        const src = fillSource.current
        const tgt = fillTargetRef.current
        if (
          src &&
          tgt &&
          (tgt.top !== src.top ||
            tgt.bottom !== src.bottom ||
            tgt.left !== src.left ||
            tgt.right !== src.right)
        ) {
          useStore.getState().fillRange(src, tgt)
          useStore.getState().setSelection({
            anchor: { row: tgt.top, col: tgt.left },
            focus: { row: tgt.bottom, col: tgt.right },
          })
        }
        filling.current = false
        fillSource.current = null
        fillTargetRef.current = null
        setFillTarget(null)
      }
      dragging.current = false
      pointAnchor.current = null // end the drag; the ref stays replaceable until a keystroke
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  // ----- context menu (right-click / long-press) -----
  const openContext = (row: number, col: number, x: number, y: number) => {
    if (!isInSelection(row, col, useStore.getState().selection)) {
      setSelection({ anchor: { row, col }, focus: { row, col } })
    }
    setCtxMenu({ x, y })
  }
  const onCellContextMenu = (row: number, col: number, e: React.MouseEvent) => {
    e.preventDefault()
    openContext(row, col, e.clientX, e.clientY)
  }
  const cancelLongPress = () => {
    if (longPress.current) {
      clearTimeout(longPress.current)
      longPress.current = null
    }
  }
  const onTouchStart = (e: React.TouchEvent) => {
    const td = (e.target as HTMLElement).closest('td[data-r]')
    if (!td) return
    const row = Number(td.getAttribute('data-r'))
    const col = Number(td.getAttribute('data-c'))
    const touch = e.touches[0]
    cancelLongPress()
    longPress.current = window.setTimeout(() => openContext(row, col, touch.clientX, touch.clientY), 500)
  }

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
    <div
      className="grid-scroll"
      ref={scrollRef}
      onTouchStart={onTouchStart}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
    >
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
                const inFill =
                  !!fillTarget &&
                  r >= fillTarget.top &&
                  r <= fillTarget.bottom &&
                  c >= fillTarget.left &&
                  c <= fillTarget.right &&
                  !selected
                const isFillCorner = !isEditing && r === bounds.bottom && c === bounds.right
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
                {
                  const bd = resolveBorders(sheet.formats, merge, r, c)
                  if (bd.top) style.borderTop = borderCss(bd.top)
                  if (bd.left) style.borderLeft = borderCss(bd.left)
                  if (bd.bottom) style.borderBottom = borderCss(bd.bottom)
                  if (bd.right) style.borderRight = borderCss(bd.right)
                }
                if (isFillCorner) style.position = 'relative'

                return (
                  <td
                    key={c}
                    rowSpan={merge ? merge.bottom - merge.top + 1 : undefined}
                    colSpan={merge ? merge.right - merge.left + 1 : undefined}
                    className={`cell${selected ? ' selected' : ''}${isActive ? ' active' : ''}${
                      inFill ? ' fill-preview' : ''
                    }${isNum && !fmt?.align ? ' num' : ''}`}
                    style={style}
                    data-r={r}
                    data-c={c}
                    onMouseDown={(e) => onCellMouseDown(r, c, e)}
                    onMouseEnter={() => onCellMouseEnter(r, c)}
                    onDoubleClick={() => enterEdit(r, c)}
                    onContextMenu={(e) => onCellContextMenu(r, c, e)}
                  >
                    {isActive ? (
                      <>
                        {!isEditing && <span className="cell-text">{text}</span>}
                        <input
                          ref={inputRef}
                          className={`cell-input${isEditing ? ' editing' : ''}`}
                          value={isEditing ? editBuffer : ''}
                          onChange={onEditorChange}
                          onKeyDown={onEditorKeyDown}
                          onCompositionStart={onCompositionStart}
                          onCompositionEnd={onCompositionEnd}
                          onBlur={() => commitEdit('none')}
                        />
                      </>
                    ) : (
                      text
                    )}
                    {isFillCorner && (
                      <div className="fill-handle" onMouseDown={onFillStart} />
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)} />
      )}
    </div>
  )
}
