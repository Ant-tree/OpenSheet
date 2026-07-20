import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  useStore,
  MAX_ROWS,
  MAX_COLS,
  DEFAULT_COL_WIDTH,
  DEFAULT_ROW_HEIGHT,
  HEADER_WIDTH,
} from '../store/useStore'
import { borderCss, displayValue, strongerBorder } from '../lib/format'
import { condStyleFor } from '../lib/condFormat'
import { colToLetter, isInSelection, key, selectionBounds } from '../lib/utils'
import type { BorderSide, CellBorders, CellFormat, MergeRange } from '../types'
import ContextMenu from './ContextMenu'
import { useFormulaAutocomplete } from './FormulaAutocomplete'
import FilterDropdown from './FilterDropdown'

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
  const rev = useStore((s) => s.rev) // subscribe so the grid re-renders on every data change
  const selection = useStore((s) => s.selection)
  const editing = useStore((s) => s.editing)
  const activeSheetId = useStore((s) => s.activeSheetId)
  const sheets = useStore((s) => s.sheets)
  const sheet = useMemo(() => sheets.find((x) => x.id === activeSheetId)!, [sheets, activeSheetId])

  // AutoFilter view state.
  const filterHeaderRow = useStore((s) => s.filterHeaderRow)
  const filterCols = useStore((s) => s.filterCols)
  const columnFilters = useStore((s) => s.columnFilters)
  const hiddenRows = useMemo(
    () => useStore.getState().hiddenRows(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rev, filterHeaderRow, columnFilters],
  )
  const [filterOpen, setFilterOpen] = useState<{ col: number; x: number; y: number } | null>(null)

  // Data-validation dropdown for the active cell.
  const activeValidation = useMemo(() => {
    const { row, col } = selection.focus
    for (let i = sheet.dataValidations.length - 1; i >= 0; i--) {
      const v = sheet.dataValidations[i]
      const R = v.range
      if (row >= R.top && row <= R.bottom && col >= R.left && col <= R.right) return v.values
    }
    return undefined
  }, [sheet.dataValidations, selection.focus])
  const [dvOpen, setDvOpen] = useState<{ x: number; y: number } | null>(null)

  // ----- row virtualization -----
  // Rows have a fixed height (see .grid td in styles.css), so we can window the
  // visible slice cheaply and pad the rest with spacer rows. Filtering removes
  // rows from `visibleRows`, so windowing works over the *visible* order.
  const [viewport, setViewport] = useState({ top: 0, height: 600 })
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => setViewport({ top: el.scrollTop, height: el.clientHeight })
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [])
  const visibleRows = useMemo(() => {
    const arr: number[] = []
    for (let r = 0; r < MAX_ROWS; r++) if (!hiddenRows.has(r)) arr.push(r)
    return arr
  }, [hiddenRows])
  const renderVisualIndices = useMemo(() => {
    const RH = DEFAULT_ROW_HEIGHT
    const overscan = 8
    const firstI = Math.max(0, Math.floor(viewport.top / RH) - overscan)
    const lastI = Math.min(
      visibleRows.length - 1,
      Math.ceil((viewport.top + viewport.height) / RH) + overscan,
    )
    const nFrozen = sheet.frozenRows ?? 0
    const set = new Set<number>()
    for (let i = 0; i < nFrozen && i < visibleRows.length; i++) set.add(i) // frozen rows always
    for (let i = firstI; i <= lastI; i++) set.add(i)
    // keep the active cell mounted (no filter → visual index == row index)
    const activeI =
      hiddenRows.size === 0 ? selection.focus.row : visibleRows.indexOf(selection.focus.row)
    if (activeI >= 0 && activeI < visibleRows.length) set.add(activeI)
    return [...set].sort((a, b) => a - b)
  }, [viewport, visibleRows, sheet.frozenRows, selection.focus.row])

  // Per-cell content (value text, number flag, and content-derived style: format,
  // conditional formatting, borders). This depends only on the document, never on
  // the selection, so we memoize it per `rev` — selection-only re-renders (e.g. a
  // drag) then reuse the cache instead of recomputing every visible cell.
  const contentCache = useRef(new Map<string, { text: string; isNum: boolean; contentStyle: React.CSSProperties }>())
  const contentRev = useRef(-1)
  if (contentRev.current !== rev) {
    contentRev.current = rev
    contentCache.current.clear()
  }
  const cellContent = (r: number, c: number, k: string, merge: MergeRange | undefined) => {
    const cached = contentCache.current.get(k)
    if (cached) return cached
    const fmt = sheet.formats[k]
    const computed = useStore.getState().getComputed(r, c)
    const text = displayValue(computed, fmt)
    const isNum = typeof computed === 'number'
    const contentStyle: React.CSSProperties = {}
    if (fmt) {
      if (fmt.bold) contentStyle.fontWeight = 700
      if (fmt.italic) contentStyle.fontStyle = 'italic'
      if (fmt.underline) contentStyle.textDecoration = 'underline'
      if (fmt.color) contentStyle.color = fmt.color
      if (fmt.bgColor) contentStyle.background = fmt.bgColor
      if (fmt.align) contentStyle.textAlign = fmt.align
      if (fmt.valign) contentStyle.verticalAlign = fmt.valign
      if (fmt.wrap) contentStyle.whiteSpace = 'normal'
    }
    if (sheet.condFormats.length) {
      const cf = condStyleFor(sheet.condFormats, r, c, computed)
      if (cf.bgColor) contentStyle.background = cf.bgColor
      if (cf.color) contentStyle.color = cf.color
    }
    const bd = resolveBorders(sheet.formats, merge, r, c)
    if (bd.top) contentStyle.borderTop = borderCss(bd.top)
    if (bd.left) contentStyle.borderLeft = borderCss(bd.left)
    if (bd.bottom) contentStyle.borderBottom = borderCss(bd.bottom)
    if (bd.right) contentStyle.borderRight = borderCss(bd.right)
    const res = { text, isNum, contentStyle }
    contentCache.current.set(k, res)
    return res
  }

  const setSelection = useStore((s) => s.setSelection)
  const setEditing = useStore((s) => s.setEditing)
  const moveSelection = useStore((s) => s.moveSelection)
  const setCellContent = useStore((s) => s.setCellContent)
  const clearSelectedContents = useStore((s) => s.clearSelectedContents)
  const setColWidth = useStore((s) => s.setColWidth)

  const dragging = useRef(false)
  // The edit text lives in a ref, and the cell <input> is uncontrolled, so
  // typing doesn't re-render the grid — only committing (which bumps `rev`) does.
  const editValueRef = useRef('')
  const pendingInit = useRef<string | null>(null)
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
  // Coalesce drag updates to one per animation frame so fast pointer moves don't
  // trigger a grid re-render per crossed cell.
  const dragRaf = useRef<number | null>(null)
  const dragPending = useRef<(() => void) | null>(null)
  const scheduleDrag = useCallback((fn: () => void) => {
    dragPending.current = fn
    if (dragRaf.current != null) return
    dragRaf.current = requestAnimationFrame(() => {
      dragRaf.current = null
      const f = dragPending.current
      dragPending.current = null
      f?.()
    })
  }, [])
  useEffect(() => () => {
    if (dragRaf.current != null) cancelAnimationFrame(dragRaf.current)
  }, [])

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

  const clearInput = () => {
    editValueRef.current = ''
    if (inputRef.current) inputRef.current.value = ''
  }

  const enterEdit = useCallback(
    (row: number, col: number) => {
      // Seed the uncontrolled input once it mounts for the editing cell.
      pendingInit.current = useStore.getState().getRaw(row, col)
      setEditing({ row, col })
    },
    [setEditing],
  )

  const commitEdit = useCallback(
    (move: 'down' | 'right' | 'none') => {
      const ed = useStore.getState().editing
      if (!ed) return
      setCellContent(ed.row, ed.col, editValueRef.current)
      setEditing(null)
      clearInput()
      pointAnchor.current = null
      refRange.current = null
      if (move === 'down') moveSelection(1, 0, false)
      else if (move === 'right') moveSelection(0, 1, false)
    },
    [setCellContent, setEditing, moveSelection],
  )

  const cancelEdit = useCallback(() => {
    setEditing(null)
    clearInput()
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
    editValueRef.current = next
    input.value = next
    const caret = start + ref.length
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (el) {
        el.focus({ preventScroll: true })
        el.setSelectionRange(caret, caret)
      }
    })
  }

  // Formula function-name autocomplete + argument hint for the cell editor.
  const ac = useFormulaAutocomplete({
    inputRef,
    active: !!editing,
    apply: (next, caret) => {
      refRange.current = null
      editValueRef.current = next
      if (inputRef.current) inputRef.current.value = next
      requestAnimationFrame(() => {
        const el = inputRef.current
        if (el) {
          el.focus({ preventScroll: true })
          el.setSelectionRange(caret, caret)
        }
      })
    },
  })

  // The active cell always hosts a focused input — even when not editing — so it
  // captures the first keystroke, including IME composition (Korean). Starting
  // an edit from a keydown on a non-editable element breaks that composition.
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    // Seed the uncontrolled input's value when an edit starts (double-click /
    // Enter / F2). First-keystroke edits have no pending value (already typed).
    if (editing && pendingInit.current != null) {
      el.value = pendingInit.current
      editValueRef.current = pendingInit.current
      pendingInit.current = null
    }
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
      pendingInit.current = null // the char is already in the input
      setEditing({ row: selection.focus.row, col: selection.focus.col })
    }
    // The user typed, so any auto-inserted reference is now committed text.
    refRange.current = null
    editValueRef.current = e.target.value
    ac.reposition() // refresh the autocomplete popup (no grid re-render for plain text)
  }

  const onEditorKeyDown = (e: React.KeyboardEvent) => {
    if (composingRef.current || e.nativeEvent.isComposing) return // don't disturb IME
    if (ac.onKeyDown(e)) return // autocomplete popup consumed the key
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
      scheduleDrag(() => setFillTarget(tgt))
      return
    }
    if (pointAnchor.current) {
      insertRef(rangeA1(pointAnchor.current, { row, col })) // drag to extend the referenced range
      return
    }
    if (dragging.current) {
      scheduleDrag(() =>
        setSelection({ anchor: useStore.getState().selection.anchor, focus: { row, col } }),
      )
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

  // Freeze panes: sticky offsets (px) for the first N frozen rows / columns.
  const frozenRows = sheet.frozenRows ?? 0
  const frozenCols = sheet.frozenCols ?? 0
  const rowTop = useMemo(() => {
    const arr = [DEFAULT_ROW_HEIGHT] // below the sticky column-header row
    for (let r = 0; r < frozenRows; r++) arr.push(arr[r] + (sheet.rowHeights[r] ?? DEFAULT_ROW_HEIGHT))
    return arr
  }, [sheet.rowHeights, frozenRows])
  const colLeft = useMemo(() => {
    const arr = [HEADER_WIDTH] // right of the sticky row-number column
    for (let c = 0; c < frozenCols; c++) arr.push(arr[c] + (sheet.colWidths[c] ?? DEFAULT_COL_WIDTH))
    return arr
  }, [sheet.colWidths, frozenCols])

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
                style={
                  c < frozenCols
                    ? {
                        left: colLeft[c],
                        zIndex: 4,
                        borderRight: c === frozenCols - 1 ? '2px solid #9aa4b2' : undefined,
                      }
                    : undefined
                }
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
          {(() => {
            const RH = DEFAULT_ROW_HEIGHT
            const body: ReactNode[] = []
            let prevI = -1
            const spacer = (h: number, k: string) =>
              h > 0 &&
              body.push(
                <tr key={k} className="v-spacer" aria-hidden="true">
                  <td colSpan={MAX_COLS + 1} style={{ height: h, padding: 0, border: 'none' }} />
                </tr>,
              )
            for (const vi of renderVisualIndices) {
              spacer((vi - prevI - 1) * RH, `sp-${vi}`)
              prevI = vi
              const r = visibleRows[vi]
              body.push(
            <tr key={r}>
              <th
                className={`rowhead${r >= bounds.top && r <= bounds.bottom ? ' sel' : ''}`}
                style={
                  r < frozenRows
                    ? {
                        top: rowTop[r],
                        zIndex: 4,
                        borderBottom: r === frozenRows - 1 ? '2px solid #9aa4b2' : undefined,
                      }
                    : undefined
                }
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
                const note = sheet.notes[k]
                const isFilterHeader = filterHeaderRow === r && filterCols.includes(c)
                const hasColFilter = !!columnFilters[c]
                const content = cellContent(r, c, k, merge)
                const text = content.text
                const isNum = content.isNum
                const style: React.CSSProperties = { ...content.contentStyle }
                if (isFillCorner || note || isFilterHeader) style.position = 'relative'
                const frozenR = r < frozenRows
                const frozenC = c < frozenCols
                if (frozenR || frozenC) {
                  style.position = 'sticky'
                  if (frozenR) style.top = rowTop[r]
                  if (frozenC) style.left = colLeft[c]
                  style.zIndex = frozenR && frozenC ? 3 : 1
                  style.background = fmt?.bgColor ?? 'var(--cell-bg)'
                  if (r === frozenRows - 1) style.borderBottom = '2px solid #9aa4b2'
                  if (c === frozenCols - 1) style.borderRight = '2px solid #9aa4b2'
                }

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
                        {!isEditing && (
                          <span
                            className="cell-text"
                            style={fmt?.wrap ? { whiteSpace: 'normal' } : undefined}
                          >
                            {text}
                          </span>
                        )}
                        <input
                          ref={inputRef}
                          className={`cell-input${isEditing ? ' editing' : ''}`}
                          onChange={onEditorChange}
                          onKeyDown={onEditorKeyDown}
                          onSelect={ac.reposition}
                          onCompositionStart={onCompositionStart}
                          onCompositionEnd={onCompositionEnd}
                          onBlur={() => commitEdit('none')}
                        />
                        {activeValidation && !isEditing && (
                          <button
                            className="dv-caret"
                            title={activeValidation.join(', ')}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                              setDvOpen((cur) => (cur ? null : { x: rect.left, y: rect.bottom }))
                            }}
                          >
                            ▾
                          </button>
                        )}
                      </>
                    ) : (
                      text
                    )}
                    {note && <span className="note-marker" title={note} />}
                    {isFilterHeader && (
                      <button
                        className={`filter-caret${hasColFilter ? ' active' : ''}`}
                        title="Filter"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                          setFilterOpen((cur) =>
                            cur?.col === c ? null : { col: c, x: rect.left, y: rect.bottom },
                          )
                        }}
                      >
                        ▾
                      </button>
                    )}
                    {isFillCorner && (
                      <div className="fill-handle" onMouseDown={onFillStart} />
                    )}
                  </td>
                )
              })}
            </tr>,
              )
            }
            spacer((visibleRows.length - 1 - prevI) * RH, 'sp-tail')
            return body
          })()}
        </tbody>
      </table>
      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)} />
      )}
      {filterOpen && (
        <>
          <div className="menu-backdrop" onMouseDown={() => setFilterOpen(null)} />
          <FilterDropdown
            col={filterOpen.col}
            x={filterOpen.x}
            y={filterOpen.y}
            onClose={() => setFilterOpen(null)}
          />
        </>
      )}
      {dvOpen && activeValidation && (
        <>
          <div className="menu-backdrop" onMouseDown={() => setDvOpen(null)} />
          <div
            className="dv-pop"
            style={{
              top: Math.min(dvOpen.y, window.innerHeight - 8),
              left: Math.min(dvOpen.x, window.innerWidth - 160),
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {activeValidation.map((v) => (
              <div
                key={v}
                className="dv-item"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setCellContent(selection.focus.row, selection.focus.col, v)
                  setDvOpen(null)
                }}
              >
                {v}
              </div>
            ))}
          </div>
        </>
      )}
      {ac.node}
    </div>
  )
}
