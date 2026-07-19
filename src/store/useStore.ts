import { create } from 'zustand'
import { HyperFormula } from 'hyperformula'
import type { BorderSide, CellFormat, MergeRange, Selection, SheetMeta } from '../types'
import {
  iterateSelection,
  key,
  replaceCaseInsensitive,
  selectionBounds,
  shiftFormulaRefs,
  shiftFormulaRowRefs,
} from '../lib/utils'
import { detectLang, t } from '../i18n'

export type BorderPreset = 'all' | 'outer' | 'top' | 'bottom' | 'left' | 'right' | 'none'

type CellValue = string | number | boolean | null

/** A point-in-time snapshot of editable state, for undo/redo. */
interface Snapshot {
  sheets: SheetMeta[]
  contents: Record<number, CellValue[][]>
  selection: Selection
}

/** Copied block, kept in-module so pasting can restore formats too. */
let clipboard: { rows: string[][]; formats: (CellFormat | undefined)[][] } | null = null

export const MAX_ROWS = 200
export const MAX_COLS = 52 // A .. AZ
export const DEFAULT_COL_WIDTH = 96
export const DEFAULT_ROW_HEIGHT = 24
export const HEADER_WIDTH = 48

interface StoreState {
  hf: HyperFormula
  sheets: SheetMeta[]
  activeSheetId: number
  selection: Selection
  editing: { row: number; col: number } | null
  fileName: string
  /** Writable handle to the opened file (File System Access API), when available. */
  fileHandle: FileSystemFileHandle | null
  /** Bumped on every mutation to trigger re-renders. */
  rev: number
  /** Undo/redo history of editable-state snapshots. */
  past: Snapshot[]
  future: Snapshot[]

  // --- derived getters (read the live HyperFormula state) ---
  getRaw: (row: number, col: number) => string
  getComputed: (row: number, col: number) => unknown
  getFormat: (row: number, col: number) => CellFormat | undefined
  activeSheet: () => SheetMeta

  // --- mutations ---
  setCellContent: (row: number, col: number, raw: string) => void
  setSelection: (sel: Selection) => void
  setEditing: (cell: { row: number; col: number } | null) => void
  moveSelection: (dRow: number, dCol: number, extend: boolean) => void

  applyFormat: (patch: Partial<CellFormat>) => void
  applyBorders: (preset: BorderPreset) => void
  clearSelectedContents: () => void

  mergeSelection: () => void
  unmergeSelection: () => void
  sortSelection: (ascending: boolean) => void

  setColWidth: (col: number, width: number) => void
  setRowHeight: (row: number, height: number) => void

  insertRows: (at: number, count?: number) => void
  deleteRows: (at: number, count?: number) => void
  insertCols: (at: number, count?: number) => void
  deleteCols: (at: number, count?: number) => void
  setFreeze: (rows: number, cols: number) => void

  undo: () => void
  redo: () => void
  /** Copy the selection to the internal clipboard; returns TSV for the system clipboard. */
  copySelection: () => string
  cutSelection: () => string
  pasteText: (text: string) => void
  /** TSV of the last in-app copy, for pasting when the system clipboard is unavailable. */
  internalClipboardText: () => string | null
  /** Replace every occurrence of `find` with `repl` across the active sheet; returns match count. */
  replaceAll: (find: string, repl: string) => number
  /** Auto-fill: extend the `src` block over `tgt` (series for numbers, else copy). */
  fillRange: (src: MergeRange, tgt: MergeRange) => void

  setFileHandle: (handle: FileSystemFileHandle | null) => void

  addSheet: () => void
  removeSheet: (id: number) => void
  renameSheet: (id: number, name: string) => void
  setActiveSheet: (id: number) => void

  loadWorkbook: (
    sheets: {
      name: string
      rows: (string | number | boolean | null)[][]
      merges?: MergeRange[]
      formats?: Record<string, CellFormat>
      colWidths?: Record<number, number>
      rowHeights?: Record<number, number>
      frozenRows?: number
      frozenCols?: number
    }[],
    fileName: string,
  ) => void
}

function bump(set: (fn: (s: StoreState) => Partial<StoreState>) => void) {
  set((s) => ({ rev: s.rev + 1 }))
}

function buildInitial(): { hf: HyperFormula; sheets: SheetMeta[]; activeSheetId: number } {
  const hf = HyperFormula.buildEmpty({ licenseKey: 'gpl-v3' })
  const name = 'Sheet1'
  hf.addSheet(name)
  const id = hf.getSheetId(name)!
  const sheets: SheetMeta[] = [
    { id, name, formats: {}, merges: [], colWidths: {}, rowHeights: {}, frozenRows: 0, frozenCols: 0 },
  ]
  return { hf, sheets, activeSheetId: id }
}

export const useStore = create<StoreState>((set, get) => {
  const initial = buildInitial()

  return {
    hf: initial.hf,
    sheets: initial.sheets,
    activeSheetId: initial.activeSheetId,
    selection: { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } },
    editing: null,
    fileName: t('defaultFileName', detectLang()),
    fileHandle: null,
    rev: 0,
    past: [],
    future: [],

    activeSheet() {
      const s = get()
      return s.sheets.find((sh) => sh.id === s.activeSheetId)!
    },

    getRaw(row, col) {
      const { hf, activeSheetId } = get()
      const v = hf.getCellSerialized({ sheet: activeSheetId, row, col })
      return v === null || v === undefined ? '' : String(v)
    },

    getComputed(row, col) {
      const { hf, activeSheetId } = get()
      return hf.getCellValue({ sheet: activeSheetId, row, col })
    },

    getFormat(row, col) {
      return get().activeSheet().formats[key(row, col)]
    },

    setCellContent(row, col, raw) {
      pushUndo(set, get)
      const { hf, activeSheetId } = get()
      const content = raw === '' ? null : raw
      hf.setCellContents({ sheet: activeSheetId, row, col }, content)
      bump(set)
    },

    setSelection(selection) {
      set({ selection })
    },

    setEditing(editing) {
      set({ editing })
    },

    moveSelection(dRow, dCol, extend) {
      const { selection } = get()
      const focus = {
        row: Math.max(0, Math.min(MAX_ROWS - 1, selection.focus.row + dRow)),
        col: Math.max(0, Math.min(MAX_COLS - 1, selection.focus.col + dCol)),
      }
      set({
        selection: extend ? { anchor: selection.anchor, focus } : { anchor: focus, focus },
        editing: null,
      })
    },

    applyFormat(patch) {
      pushUndo(set, get)
      const { selection } = get()
      const sheet = get().activeSheet()
      const formats = { ...sheet.formats }
      for (const ref of iterateSelection(selection)) {
        const k = key(ref.row, ref.col)
        formats[k] = { ...formats[k], ...patch }
      }
      updateSheet(set, get, sheet.id, { formats })
      bump(set)
    },

    applyBorders(preset) {
      pushUndo(set, get)
      const sheet = get().activeSheet()
      const b = selectionBounds(get().selection)
      const THIN: BorderSide = { style: 'thin', color: '#000000' }
      const formats = { ...sheet.formats }
      for (let r = b.top; r <= b.bottom; r++) {
        for (let c = b.left; c <= b.right; c++) {
          const k = key(r, c)
          const cur = formats[k] ?? {}
          let borders: NonNullable<CellFormat['borders']> = { ...(cur.borders ?? {}) }
          if (preset === 'none') {
            borders = {}
          } else if (preset === 'all') {
            borders = { top: THIN, right: THIN, bottom: THIN, left: THIN }
          } else if (preset === 'outer') {
            if (r === b.top) borders.top = THIN
            if (r === b.bottom) borders.bottom = THIN
            if (c === b.left) borders.left = THIN
            if (c === b.right) borders.right = THIN
          } else if (preset === 'top' && r === b.top) {
            borders.top = THIN
          } else if (preset === 'bottom' && r === b.bottom) {
            borders.bottom = THIN
          } else if (preset === 'left' && c === b.left) {
            borders.left = THIN
          } else if (preset === 'right' && c === b.right) {
            borders.right = THIN
          }
          const next: CellFormat = { ...cur }
          if (Object.keys(borders).length) next.borders = borders
          else delete next.borders
          formats[k] = next
        }
      }
      updateSheet(set, get, sheet.id, { formats })
      bump(set)
    },

    clearSelectedContents() {
      pushUndo(set, get)
      const { hf, activeSheetId, selection } = get()
      for (const ref of iterateSelection(selection)) {
        hf.setCellContents({ sheet: activeSheetId, row: ref.row, col: ref.col }, null)
      }
      bump(set)
    },

    mergeSelection() {
      const sheet = get().activeSheet()
      const b = selectionBounds(get().selection)
      if (b.top === b.bottom && b.left === b.right) return
      pushUndo(set, get)
      const merge: MergeRange = { top: b.top, left: b.left, bottom: b.bottom, right: b.right }
      // Drop any existing merges that overlap the new one.
      const merges = sheet.merges.filter((m) => !overlaps(m, merge))
      merges.push(merge)
      updateSheet(set, get, sheet.id, { merges })
      bump(set)
    },

    unmergeSelection() {
      pushUndo(set, get)
      const sheet = get().activeSheet()
      const b = selectionBounds(get().selection)
      const sel: MergeRange = { top: b.top, left: b.left, bottom: b.bottom, right: b.right }
      const merges = sheet.merges.filter((m) => !overlaps(m, sel))
      updateSheet(set, get, sheet.id, { merges })
      bump(set)
    },

    sortSelection(ascending) {
      pushUndo(set, get)
      const { hf, activeSheetId, selection } = get()
      const sheet = get().activeSheet()
      const b = selectionBounds(selection)
      const sortCol = b.left

      // Snapshot the block: raw contents + formats per row (remembering the
      // original row so relative formula references can be re-based on write).
      const rows: {
        origRow: number
        cells: (string | null)[]
        formats: (CellFormat | undefined)[]
        sortVal: unknown
      }[] = []
      for (let r = b.top; r <= b.bottom; r++) {
        const cells: (string | null)[] = []
        const formats: (CellFormat | undefined)[] = []
        for (let c = b.left; c <= b.right; c++) {
          const raw = hf.getCellSerialized({ sheet: activeSheetId, row: r, col: c })
          cells.push(raw === null || raw === undefined ? null : String(raw))
          formats.push(sheet.formats[key(r, c)])
        }
        rows.push({
          origRow: r,
          cells,
          formats,
          sortVal: hf.getCellValue({ sheet: activeSheetId, row: r, col: sortCol }),
        })
      }

      rows.sort((x, y) => cmp(x.sortVal, y.sortVal) * (ascending ? 1 : -1))

      // Write the sorted block back, shifting relative row references in any
      // formulas by how far their row moved (Excel-style sort semantics).
      const formats = { ...sheet.formats }
      rows.forEach((rowData, i) => {
        const r = b.top + i
        const delta = r - rowData.origRow
        rowData.cells.forEach((raw, j) => {
          const c = b.left + j
          const content = raw && raw.startsWith('=') ? shiftFormulaRowRefs(raw, delta) : raw
          hf.setCellContents({ sheet: activeSheetId, row: r, col: c }, content)
          const k = key(r, c)
          if (rowData.formats[j]) formats[k] = rowData.formats[j]!
          else delete formats[k]
        })
      })
      updateSheet(set, get, sheet.id, { formats })
      bump(set)
    },

    setColWidth(col, width) {
      const sheet = get().activeSheet()
      updateSheet(set, get, sheet.id, {
        colWidths: { ...sheet.colWidths, [col]: Math.max(24, width) },
      })
    },

    setRowHeight(row, height) {
      const sheet = get().activeSheet()
      updateSheet(set, get, sheet.id, {
        rowHeights: { ...sheet.rowHeights, [row]: Math.max(16, height) },
      })
    },

    insertRows(at, count = 1) {
      pushUndo(set, get)
      const sheet = get().activeSheet()
      get().hf.addRows(sheet.id, [at, count])
      const map = (i: number) => (i >= at ? i + count : i)
      updateSheet(set, get, sheet.id, {
        formats: shiftFormats(sheet.formats, 'row', map),
        rowHeights: shiftSizes(sheet.rowHeights, map),
        merges: shiftMergesInsert(sheet.merges, 'row', at, count),
      })
      bump(set)
    },

    deleteRows(at, count = 1) {
      pushUndo(set, get)
      const sheet = get().activeSheet()
      get().hf.removeRows(sheet.id, [at, count])
      const map = (i: number) => (i < at ? i : i < at + count ? null : i - count)
      updateSheet(set, get, sheet.id, {
        formats: shiftFormats(sheet.formats, 'row', map),
        rowHeights: shiftSizes(sheet.rowHeights, map),
        merges: shiftMergesDelete(sheet.merges, 'row', at, count),
      })
      bump(set)
    },

    insertCols(at, count = 1) {
      pushUndo(set, get)
      const sheet = get().activeSheet()
      get().hf.addColumns(sheet.id, [at, count])
      const map = (i: number) => (i >= at ? i + count : i)
      updateSheet(set, get, sheet.id, {
        formats: shiftFormats(sheet.formats, 'col', map),
        colWidths: shiftSizes(sheet.colWidths, map),
        merges: shiftMergesInsert(sheet.merges, 'col', at, count),
      })
      bump(set)
    },

    deleteCols(at, count = 1) {
      pushUndo(set, get)
      const sheet = get().activeSheet()
      get().hf.removeColumns(sheet.id, [at, count])
      const map = (i: number) => (i < at ? i : i < at + count ? null : i - count)
      updateSheet(set, get, sheet.id, {
        formats: shiftFormats(sheet.formats, 'col', map),
        colWidths: shiftSizes(sheet.colWidths, map),
        merges: shiftMergesDelete(sheet.merges, 'col', at, count),
      })
      bump(set)
    },

    setFreeze(rows, cols) {
      const sheet = get().activeSheet()
      updateSheet(set, get, sheet.id, {
        frozenRows: Math.max(0, Math.min(rows, MAX_ROWS - 1)),
        frozenCols: Math.max(0, Math.min(cols, MAX_COLS - 1)),
      })
      bump(set)
    },

    setFileHandle(handle) {
      set({ fileHandle: handle })
    },

    addSheet() {
      const { hf, sheets } = get()
      let n = sheets.length + 1
      let name = `Sheet${n}`
      while (hf.doesSheetExist(name)) name = `Sheet${++n}`
      hf.addSheet(name)
      const id = hf.getSheetId(name)!
      set({
        sheets: [...sheets, { id, name, formats: {}, merges: [], colWidths: {}, rowHeights: {}, frozenRows: 0, frozenCols: 0 }],
        activeSheetId: id,
        selection: { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } },
        past: [],
        future: [],
      })
      bump(set)
    },

    removeSheet(id) {
      const { hf, sheets } = get()
      if (sheets.length <= 1) return
      const meta = sheets.find((s) => s.id === id)!
      hf.removeSheet(id)
      const remaining = sheets.filter((s) => s.id !== id)
      set({
        sheets: remaining,
        activeSheetId: get().activeSheetId === id ? remaining[0].id : get().activeSheetId,
        past: [],
        future: [],
      })
      void meta
      bump(set)
    },

    renameSheet(id, name) {
      const { hf, sheets } = get()
      const trimmed = name.trim()
      if (!trimmed || hf.doesSheetExist(trimmed)) return
      hf.renameSheet(id, trimmed)
      set({ sheets: sheets.map((s) => (s.id === id ? { ...s, name: trimmed } : s)) })
      bump(set)
    },

    setActiveSheet(id) {
      set({
        activeSheetId: id,
        selection: { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } },
        editing: null,
      })
    },

    loadWorkbook(imported, fileName) {
      // Rebuild HyperFormula from scratch with the imported sheets.
      const sheetsData: Record<string, (string | number | boolean | null)[][]> = {}
      for (const s of imported) sheetsData[s.name] = s.rows
      const hf = HyperFormula.buildFromSheets(sheetsData, { licenseKey: 'gpl-v3' })

      const metas: SheetMeta[] = imported.map((s) => ({
        id: hf.getSheetId(s.name)!,
        name: s.name,
        formats: s.formats ?? {},
        merges: s.merges ?? [],
        colWidths: s.colWidths ?? {},
        rowHeights: s.rowHeights ?? {},
        frozenRows: s.frozenRows ?? 0,
        frozenCols: s.frozenCols ?? 0,
      }))

      set({
        hf,
        sheets: metas,
        activeSheetId: metas[0].id,
        selection: { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } },
        editing: null,
        fileName,
        fileHandle: null,
        rev: get().rev + 1,
        past: [],
        future: [],
      })
    },

    undo() {
      const { past, hf } = get()
      if (!past.length) return
      const current = captureSnapshot(get)
      const snap = past[past.length - 1]
      for (const s of snap.sheets) hf.setSheetContent(s.id, snap.contents[s.id])
      set((st) => ({
        sheets: snap.sheets.map(cloneMeta),
        selection: snap.selection,
        editing: null,
        past: st.past.slice(0, -1),
        future: [...st.future, current],
        rev: st.rev + 1,
      }))
    },

    redo() {
      const { future, hf } = get()
      if (!future.length) return
      const current = captureSnapshot(get)
      const snap = future[future.length - 1]
      for (const s of snap.sheets) hf.setSheetContent(s.id, snap.contents[s.id])
      set((st) => ({
        sheets: snap.sheets.map(cloneMeta),
        selection: snap.selection,
        editing: null,
        future: st.future.slice(0, -1),
        past: [...st.past, current],
        rev: st.rev + 1,
      }))
    },

    copySelection() {
      const { hf, activeSheetId } = get()
      const sheet = get().activeSheet()
      const b = selectionBounds(get().selection)
      const rows: string[][] = []
      const formats: (CellFormat | undefined)[][] = []
      for (let r = b.top; r <= b.bottom; r++) {
        const rowV: string[] = []
        const rowF: (CellFormat | undefined)[] = []
        for (let c = b.left; c <= b.right; c++) {
          const raw = hf.getCellSerialized({ sheet: activeSheetId, row: r, col: c })
          rowV.push(raw === null || raw === undefined ? '' : String(raw))
          rowF.push(sheet.formats[key(r, c)])
        }
        rows.push(rowV)
        formats.push(rowF)
      }
      clipboard = { rows, formats }
      return rows.map((r) => r.join('\t')).join('\n')
    },

    cutSelection() {
      const tsv = get().copySelection()
      get().clearSelectedContents()
      return tsv
    },

    internalClipboardText() {
      return clipboard ? clipboard.rows.map((r) => r.join('\t')).join('\n') : null
    },

    fillRange(src, tgt) {
      const { hf, activeSheetId } = get()
      const sheet = get().activeSheet()
      const vertical = tgt.top < src.top || tgt.bottom > src.bottom
      const srcH = src.bottom - src.top + 1
      const srcW = src.right - src.left + 1
      const readRaw = (r: number, c: number) => {
        const v = hf.getCellSerialized({ sheet: activeSheetId, row: r, col: c })
        return v === null || v === undefined ? null : String(v)
      }
      const setRaw = (r: number, c: number, val: string | number | null) =>
        hf.setCellContents({ sheet: activeSheetId, row: r, col: c }, val)
      const formats = { ...sheet.formats }
      const applyFmt = (tr: number, tc: number, sr: number, sc: number) => {
        const f = sheet.formats[key(sr, sc)]
        if (f) formats[key(tr, tc)] = { ...f }
        else delete formats[key(tr, tc)]
      }
      const mod = (n: number, m: number) => ((n % m) + m) % m
      pushUndo(set, get)

      const fillLine = (
        srcVals: (string | null)[],
        targets: number[],
        loStart: number,
        hiStart: number,
        at: (i: number) => { r: number; c: number; sIdx: number },
        dRC: (i: number, sIdx: number) => [number, number],
      ) => {
        const allNum =
          srcVals.length > 0 && srcVals.every((v) => v !== null && v !== '' && !isNaN(Number(v)))
        const nums = allNum ? srcVals.map(Number) : []
        const step = nums.length > 1 ? (nums[nums.length - 1] - nums[0]) / (nums.length - 1) : 0
        for (const i of targets) {
          const { r, c, sIdx } = at(i)
          if (allNum) {
            const val = i > hiStart ? nums[nums.length - 1] + step * (i - hiStart) : nums[0] - step * (loStart - i)
            setRaw(r, c, val)
          } else {
            const raw = srcVals[sIdx]
            const [dR, dC] = dRC(i, sIdx)
            const val = raw && raw.startsWith('=') ? '=' + shiftFormulaRefs(raw.slice(1), dR, dC) : raw
            setRaw(r, c, val)
          }
        }
      }

      if (vertical) {
        for (let c = src.left; c <= src.right; c++) {
          const srcVals: (string | null)[] = []
          for (let r = src.top; r <= src.bottom; r++) srcVals.push(readRaw(r, c))
          const targets: number[] = []
          for (let r = tgt.top; r <= tgt.bottom; r++) if (r < src.top || r > src.bottom) targets.push(r)
          fillLine(
            srcVals,
            targets,
            src.top,
            src.bottom,
            (r) => {
              const sIdx = mod(r - src.top, srcH)
              applyFmt(r, c, src.top + sIdx, c)
              return { r, c, sIdx }
            },
            (r, sIdx) => [r - (src.top + sIdx), 0],
          )
        }
      } else {
        for (let r = src.top; r <= src.bottom; r++) {
          const srcVals: (string | null)[] = []
          for (let c = src.left; c <= src.right; c++) srcVals.push(readRaw(r, c))
          const targets: number[] = []
          for (let c = tgt.left; c <= tgt.right; c++) if (c < src.left || c > src.right) targets.push(c)
          fillLine(
            srcVals,
            targets,
            src.left,
            src.right,
            (c) => {
              const sIdx = mod(c - src.left, srcW)
              applyFmt(r, c, r, src.left + sIdx)
              return { r, c, sIdx }
            },
            (c, sIdx) => [0, c - (src.left + sIdx)],
          )
        }
      }
      updateSheet(set, get, sheet.id, { formats })
      bump(set)
    },

    replaceAll(find, repl) {
      if (!find) return 0
      const { hf, activeSheetId } = get()
      const dims = hf.getSheetDimensions(activeSheetId)
      const lower = find.toLowerCase()
      const hits: { row: number; col: number; next: string }[] = []
      for (let r = 0; r < dims.height; r++) {
        for (let c = 0; c < dims.width; c++) {
          const raw = hf.getCellSerialized({ sheet: activeSheetId, row: r, col: c })
          if (raw === null || raw === undefined) continue
          const str = String(raw)
          if (str.toLowerCase().includes(lower)) {
            hits.push({ row: r, col: c, next: replaceCaseInsensitive(str, find, repl) })
          }
        }
      }
      if (!hits.length) return 0
      pushUndo(set, get)
      for (const h of hits) {
        hf.setCellContents(
          { sheet: activeSheetId, row: h.row, col: h.col },
          h.next === '' ? null : h.next,
        )
      }
      bump(set)
      return hits.length
    },

    pasteText(text) {
      if (!text) return
      const lines = text.replace(/\r\n?/g, '\n').split('\n')
      if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
      const cells = lines.map((line) => line.split('\t'))
      const pastedTsv = cells.map((r) => r.join('\t')).join('\n')
      const internal =
        clipboard && clipboard.rows.map((r) => r.join('\t')).join('\n') === pastedTsv
          ? clipboard
          : null

      pushUndo(set, get)
      const { hf, activeSheetId } = get()
      const sheet = get().activeSheet()
      const { row, col } = get().selection.focus
      const formats = { ...sheet.formats }
      let maxR = row
      let maxC = col
      cells.forEach((line, i) => {
        line.forEach((val, j) => {
          const r = row + i
          const c = col + j
          if (r >= MAX_ROWS || c >= MAX_COLS) return
          hf.setCellContents({ sheet: activeSheetId, row: r, col: c }, val === '' ? null : val)
          if (internal) {
            const f = internal.formats[i]?.[j]
            if (f) formats[key(r, c)] = { ...f }
            else delete formats[key(r, c)]
          }
          maxR = Math.max(maxR, r)
          maxC = Math.max(maxC, c)
        })
      })
      if (internal) updateSheet(set, get, sheet.id, { formats })
      set({ selection: { anchor: { row, col }, focus: { row: maxR, col: maxC } } })
      bump(set)
    },
  }
})

function cloneMeta(m: SheetMeta): SheetMeta {
  return {
    id: m.id,
    name: m.name,
    formats: structuredClone(m.formats),
    merges: m.merges.map((x) => ({ ...x })),
    colWidths: { ...m.colWidths },
    rowHeights: { ...m.rowHeights },
    frozenRows: m.frozenRows,
    frozenCols: m.frozenCols,
  }
}

function captureSnapshot(get: () => StoreState): Snapshot {
  const { hf, sheets, selection } = get()
  const contents: Record<number, CellValue[][]> = {}
  for (const s of sheets) contents[s.id] = hf.getSheetSerialized(s.id) as CellValue[][]
  return { sheets: sheets.map(cloneMeta), contents, selection }
}

/** Record the current state so the next mutation can be undone. */
function pushUndo(
  set: (fn: (s: StoreState) => Partial<StoreState>) => void,
  get: () => StoreState,
) {
  const snap = captureSnapshot(get)
  set((s) => ({ past: [...s.past, snap].slice(-100), future: [] }))
}

function updateSheet(
  set: (partial: Partial<StoreState>) => void,
  get: () => StoreState,
  id: number,
  patch: Partial<SheetMeta>,
) {
  set({ sheets: get().sheets.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
}

function overlaps(a: MergeRange, b: MergeRange): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)
}

// --- row/column insert/delete: shift metadata keyed by index ---
type IndexMap = (i: number) => number | null

function shiftFormats(
  formats: Record<string, CellFormat>,
  axis: 'row' | 'col',
  map: IndexMap,
): Record<string, CellFormat> {
  const out: Record<string, CellFormat> = {}
  for (const k in formats) {
    const [r, c] = k.split(',').map(Number)
    const nr = axis === 'row' ? map(r) : r
    const nc = axis === 'col' ? map(c) : c
    if (nr === null || nc === null) continue
    out[`${nr},${nc}`] = formats[k]
  }
  return out
}

function shiftSizes(sizes: Record<number, number>, map: IndexMap): Record<number, number> {
  const out: Record<number, number> = {}
  for (const k in sizes) {
    const ni = map(Number(k))
    if (ni !== null) out[ni] = sizes[Number(k)]
  }
  return out
}

function shiftMergesInsert(
  merges: MergeRange[],
  axis: 'row' | 'col',
  at: number,
  count: number,
): MergeRange[] {
  return merges.map((m) => {
    if (axis === 'row') {
      return {
        ...m,
        top: m.top >= at ? m.top + count : m.top,
        bottom: m.bottom >= at ? m.bottom + count : m.bottom,
      }
    }
    return {
      ...m,
      left: m.left >= at ? m.left + count : m.left,
      right: m.right >= at ? m.right + count : m.right,
    }
  })
}

function shiftMergesDelete(
  merges: MergeRange[],
  axis: 'row' | 'col',
  at: number,
  count: number,
): MergeRange[] {
  const out: MergeRange[] = []
  for (const m of merges) {
    const lo = axis === 'row' ? m.top : m.left
    const hi = axis === 'row' ? m.bottom : m.right
    const nlo = lo < at ? lo : lo < at + count ? at : lo - count
    const nhi = hi < at ? hi : hi < at + count ? at - 1 : hi - count
    if (nhi < nlo) continue // range fully removed
    const nm: MergeRange =
      axis === 'row' ? { ...m, top: nlo, bottom: nhi } : { ...m, left: nlo, right: nhi }
    if (nm.top === nm.bottom && nm.left === nm.right) continue // collapsed to a single cell
    out.push(nm)
  }
  return out
}

function cmp(a: unknown, b: unknown): number {
  const aEmpty = a === null || a === undefined || a === ''
  const bEmpty = b === null || b === undefined || b === ''
  if (aEmpty && bEmpty) return 0
  if (aEmpty) return 1 // empties sink to the bottom
  if (bEmpty) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'ko')
}
