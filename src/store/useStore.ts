import { create } from 'zustand'
import { HyperFormula } from 'hyperformula'
import type { BorderSide, CellFormat, MergeRange, Selection, SheetMeta } from '../types'
import { iterateSelection, key, selectionBounds, shiftFormulaRowRefs } from '../lib/utils'
import { detectLang, t } from '../i18n'

export type BorderPreset = 'all' | 'outer' | 'top' | 'bottom' | 'left' | 'right' | 'none'

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
    { id, name, formats: {}, merges: [], colWidths: {}, rowHeights: {} },
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
      const merge: MergeRange = { top: b.top, left: b.left, bottom: b.bottom, right: b.right }
      // Drop any existing merges that overlap the new one.
      const merges = sheet.merges.filter((m) => !overlaps(m, merge))
      merges.push(merge)
      updateSheet(set, get, sheet.id, { merges })
      bump(set)
    },

    unmergeSelection() {
      const sheet = get().activeSheet()
      const b = selectionBounds(get().selection)
      const sel: MergeRange = { top: b.top, left: b.left, bottom: b.bottom, right: b.right }
      const merges = sheet.merges.filter((m) => !overlaps(m, sel))
      updateSheet(set, get, sheet.id, { merges })
      bump(set)
    },

    sortSelection(ascending) {
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
        sheets: [...sheets, { id, name, formats: {}, merges: [], colWidths: {}, rowHeights: {} }],
        activeSheetId: id,
        selection: { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } },
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
      })
    },
  }
})

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

function cmp(a: unknown, b: unknown): number {
  const aEmpty = a === null || a === undefined || a === ''
  const bEmpty = b === null || b === undefined || b === ''
  if (aEmpty && bEmpty) return 0
  if (aEmpty) return 1 // empties sink to the bottom
  if (bEmpty) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'ko')
}
