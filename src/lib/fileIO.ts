import ExcelJS from 'exceljs'
import type { HyperFormula } from 'hyperformula'
import type { BorderSide, CellBorders, CellFormat, HAlign, MergeRange, SheetMeta } from '../types'
import { t, useLangStore } from '../i18n'
import { strongerBorder } from './format'

export interface ImportedSheet {
  name: string
  rows: (string | number | boolean | null)[][]
  merges: MergeRange[]
  /** Per-cell formatting keyed by "row,col" (0-based). */
  formats: Record<string, CellFormat>
  /** Custom column widths in px, keyed by col index. */
  colWidths: Record<number, number>
  /** Custom row heights in px, keyed by row index. */
  rowHeights: Record<number, number>
  frozenRows: number
  frozenCols: number
}

export interface ImportedWorkbook {
  fileName: string
  sheets: ImportedSheet[]
}

// --- unit conversion between the app (px) and Excel's own units ---
const DAY_MS = 24 * 60 * 60 * 1000
const EXCEL_EPOCH = Date.UTC(1899, 11, 30) // 1899-12-30, per Excel's 1900 leap bug
// Excel column width is measured in "characters" (~7px each for the default font).
const charToPx = (w: number) => Math.round(w * 7 + 5)
const pxToChar = (px: number) => (px - 5) / 7
// Excel row height is in points; the app lays out in px (96dpi).
const ptToPx = (pt: number) => Math.round((pt * 96) / 72)
const pxToPt = (px: number) => (px * 72) / 96

function dateToSerial(d: Date): number {
  return (d.getTime() - EXCEL_EPOCH) / DAY_MS
}

/** Default Office theme palette, indexed as the xlsx `theme` attribute references it. */
const THEME_COLORS = [
  'FFFFFF', // 0 lt1 / background1
  '000000', // 1 dk1 / text1
  'E7E6E6', // 2 lt2 / background2
  '44546A', // 3 dk2 / text2
  '4472C4', // 4 accent1
  'ED7D31', // 5 accent2
  'A5A5A5', // 6 accent3
  'FFC000', // 7 accent4
  '5B9BD5', // 8 accent5
  '70AD47', // 9 accent6
  '0563C1', // 10 hyperlink
  '954F72', // 11 followedHyperlink
]

/** Legacy 56-entry indexed color palette (the common Excel default). */
const INDEXED_COLORS: Record<number, string> = {
  0: '000000', 1: 'FFFFFF', 2: 'FF0000', 3: '00FF00', 4: '0000FF', 5: 'FFFF00',
  6: 'FF00FF', 7: '00FFFF', 8: '000000', 9: 'FFFFFF', 10: 'FF0000', 11: '00FF00',
  12: '0000FF', 13: 'FFFF00', 14: 'FF00FF', 15: '00FFFF', 16: '800000', 17: '008000',
  18: '000080', 19: '808000', 20: '800080', 21: '008080', 22: 'C0C0C0', 23: '808080',
  24: '9999FF', 25: '993366', 26: 'FFFFCC', 27: 'CCFFFF', 28: '660066', 29: 'FF8080',
  30: '0066CC', 31: 'CCCCFF', 32: '000080', 33: 'FF00FF', 34: 'FFFF00', 35: '00FFFF',
  36: '800080', 37: '800000', 38: '008080', 39: '0000FF', 40: '00CCFF', 41: 'CCFFFF',
  42: 'CCFFCC', 43: 'FFFF99', 44: '99CCFF', 45: 'FF99CC', 46: 'CC99FF', 47: 'FFCC99',
  48: '3366FF', 49: '33CCCC', 50: '99CC00', 51: 'FFCC00', 52: 'FF9900', 53: 'FF6600',
  54: '666699', 55: '969696', 56: '003366', 57: '339966', 58: '003300', 59: '333300',
  60: '993300', 61: '993366', 62: '333399', 63: '333333',
  64: '000000', 65: 'FFFFFF',
}

/** Apply an OOXML tint (-1..1) to a hex color, working in HSL luminance space. */
function applyTint(hex: string, tint: number): string {
  if (!tint) return hex
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  let l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  let nr = l
  let ng = l
  let nb = l
  if (s !== 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    nr = hue2rgb(p, q, h + 1 / 3)
    ng = hue2rgb(p, q, h)
    nb = hue2rgb(p, q, h - 1 / 3)
  }
  const toHex = (x: number) =>
    Math.round(Math.min(1, Math.max(0, x)) * 255)
      .toString(16)
      .padStart(2, '0')
  return toHex(nr) + toHex(ng) + toHex(nb)
}

/** The shape of an exceljs color, including fields missing from its public types. */
type XlsxColor = { argb?: string; theme?: number; indexed?: number; tint?: number }

/** Resolve an exceljs color (argb | theme+tint | indexed) to "#rrggbb". */
function resolveColor(color: XlsxColor | undefined): string | undefined {
  if (!color) return undefined
  let hex: string | undefined
  if (color.argb) {
    hex = color.argb.length === 8 ? color.argb.slice(2) : color.argb
  } else if (typeof color.theme === 'number') {
    hex = THEME_COLORS[color.theme]
  } else if (typeof color.indexed === 'number') {
    hex = INDEXED_COLORS[color.indexed]
  }
  if (!hex) return undefined
  if (typeof color.tint === 'number') hex = applyTint(hex, color.tint)
  return '#' + hex.toLowerCase()
}

function hexToArgb(hex: string): string {
  return 'FF' + hex.replace(/^#/, '').toUpperCase()
}

/**
 * Parse an .xlsx or .csv File into per-sheet values, formulas, merges, and
 * styling (fonts, colors, number formats, column widths, row heights).
 * Formula cells are preserved as "=..." strings so HyperFormula recomputes them.
 */
export async function readWorkbookFile(file: File): Promise<ImportedWorkbook> {
  const lower = file.name.toLowerCase()

  if (lower.endsWith('.csv')) {
    const text = await file.text()
    return { fileName: file.name, sheets: [csvToSheet(file.name, text)] }
  }
  if (lower.endsWith('.xls')) {
    throw new Error(t('errXls', useLangStore.getState().lang))
  }

  const buf = await file.arrayBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)

  const sheets: ImportedSheet[] = []
  wb.eachSheet((ws) => {
    const rows: (string | number | boolean | null)[][] = []
    const formats: Record<string, CellFormat> = {}
    const colWidths: Record<number, number> = {}
    const rowHeights: Record<number, number> = {}

    const rowCount = ws.rowCount
    const colCount = ws.columnCount

    for (let r = 1; r <= rowCount; r++) {
      const row: (string | number | boolean | null)[] = []
      for (let c = 1; c <= colCount; c++) {
        const cell = ws.getCell(r, c)
        row.push(cellToInput(cell))
        const fmt = readCellFormat(cell)
        if (fmt) formats[`${r - 1},${c - 1}`] = fmt
      }
      rows.push(row)
      const rh = ws.getRow(r).height
      if (typeof rh === 'number') rowHeights[r - 1] = ptToPx(rh)
    }

    for (let c = 1; c <= colCount; c++) {
      const cw = ws.getColumn(c).width
      if (typeof cw === 'number') colWidths[c - 1] = charToPx(cw)
    }

    const merges: MergeRange[] = readMerges(ws)

    const view = (ws.views ?? [])[0] as { state?: string; xSplit?: number; ySplit?: number } | undefined
    const frozen = view?.state === 'frozen'
    const frozenRows = frozen ? view?.ySplit ?? 0 : 0
    const frozenCols = frozen ? view?.xSplit ?? 0 : 0

    sheets.push({ name: ws.name, rows, merges, formats, colWidths, rowHeights, frozenRows, frozenCols })
  })

  return { fileName: file.name, sheets }
}

function cellToInput(cell: ExcelJS.Cell): string | number | boolean | null {
  const v = cell.value
  if (v === null || v === undefined) return null
  if (v instanceof Date) return dateToSerial(v)
  if (typeof v === 'object') {
    const o = v as {
      formula?: string
      sharedFormula?: string
      result?: unknown
      richText?: { text: string }[]
      text?: string
      error?: string
      hyperlink?: string
    }
    // Master formula cell: keep the formula so HyperFormula recomputes it.
    if (o.formula) return '=' + o.formula
    // Shared-formula dependents carry no translated formula — keep the value.
    if (o.sharedFormula !== undefined) return normalizeResult(o.result)
    if (o.richText) return o.richText.map((rt) => rt.text).join('')
    if (o.error) return o.error
    if (o.text !== undefined) return o.text // hyperlink display text
    return null
  }
  return v as string | number | boolean
}

function normalizeResult(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return dateToSerial(v)
  if (typeof v === 'object') return (v as { error?: string }).error ?? null
  return v as string | number | boolean
}

function readCellFormat(cell: ExcelJS.Cell): CellFormat | undefined {
  const fmt: CellFormat = {}
  const font = cell.font
  if (font) {
    if (font.bold) fmt.bold = true
    if (font.italic) fmt.italic = true
    if (font.underline) fmt.underline = true
    const color = resolveColor(font.color)
    if (color) fmt.color = color
  }

  const fill = cell.fill
  if (fill && fill.type === 'pattern' && fill.pattern === 'solid') {
    const bg = resolveColor(fill.fgColor)
    if (bg) fmt.bgColor = bg
  }

  const h = cell.alignment?.horizontal
  if (h === 'left' || h === 'center' || h === 'right') fmt.align = h as HAlign

  const numFmt = cell.numFmt
  if (numFmt && numFmt !== 'General') fmt.numberFormat = numFmt
  else if (cell.value instanceof Date) fmt.numberFormat = 'yyyy-mm-dd'

  const borders = readBorders(cell.border)
  if (borders) fmt.borders = borders

  return Object.keys(fmt).length ? fmt : undefined
}

function readBorders(border: Partial<ExcelJS.Borders> | undefined): CellBorders | undefined {
  if (!border) return undefined
  const out: CellBorders = {}
  const side = (b: Partial<ExcelJS.Border> | undefined): BorderSide | undefined => {
    if (!b || !b.style) return undefined
    return { style: b.style, color: resolveColor(b.color) ?? '#000000' }
  }
  const top = side(border.top)
  const right = side(border.right)
  const bottom = side(border.bottom)
  const left = side(border.left)
  if (top) out.top = top
  if (right) out.right = right
  if (bottom) out.bottom = bottom
  if (left) out.left = left
  return Object.keys(out).length ? out : undefined
}

function readMerges(ws: ExcelJS.Worksheet): MergeRange[] {
  // exceljs exposes merged ranges as A1-notation strings on the model.
  const raw = (ws.model as { merges?: string[] }).merges ?? []
  const merges: MergeRange[] = []
  for (const range of raw) {
    const [start, end] = range.split(':')
    const s = decodeA1(start)
    const e = decodeA1(end ?? start)
    if (s && e) {
      merges.push({
        top: Math.min(s.row, e.row),
        left: Math.min(s.col, e.col),
        bottom: Math.max(s.row, e.row),
        right: Math.max(s.col, e.col),
      })
    }
  }
  return merges
}

/** Decode "AB12" into 0-based {row, col}. */
function decodeA1(a1: string): { row: number; col: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(a1.trim().toUpperCase())
  if (!m) return null
  let col = 0
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
  return { row: parseInt(m[2], 10) - 1, col: col - 1 }
}

function csvToSheet(fileName: string, text: string): ImportedSheet {
  const rows = parseCsv(text).map((row) =>
    row.map((cell): string | number | boolean | null => {
      if (cell === '') return null
      const n = Number(cell)
      return cell.trim() !== '' && !Number.isNaN(n) ? n : cell
    }),
  )
  const name = fileName.replace(/\.csv$/i, '') || 'Sheet1'
  return {
    name: name.slice(0, 31),
    rows,
    merges: [],
    formats: {},
    colWidths: {},
    rowHeights: {},
    frozenRows: 0,
    frozenCols: 0,
  }
}

/** Minimal RFC-4180-ish CSV parser handling quoted fields and embedded newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\r') {
      // handled by the \n branch
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/**
 * Build a SheetJS/exceljs workbook from the current HyperFormula state and
 * per-cell formatting, then trigger a download. For .xlsx we write real formula
 * cells (with cached values) plus styling; for .csv we write computed values.
 */
export async function exportWorkbook(
  hf: HyperFormula,
  sheets: SheetMeta[],
  fileName: string,
  format: 'xlsx' | 'csv',
): Promise<void> {
  const buf = await workbookBuffer(hf, sheets, format)
  const base = fileName.replace(/\.(xlsx|csv)$/i, '')
  const type =
    format === 'csv'
      ? 'text/csv;charset=utf-8'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  downloadBlob(new Blob([buf], { type }), `${base}.${format}`)
}

/** Serialize the current state into an xlsx/csv byte buffer. */
export async function workbookBuffer(
  hf: HyperFormula,
  sheets: SheetMeta[],
  format: 'xlsx' | 'csv',
): Promise<ArrayBuffer> {
  const wb = buildWorkbook(hf, sheets, format)
  const buf = format === 'csv' ? await wb.csv.writeBuffer() : await wb.xlsx.writeBuffer()
  return buf as ArrayBuffer
}

/** True when the browser supports the File System Access API (Chrome/Edge). */
export function supportsFileSystemAccess(): boolean {
  return typeof (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker === 'function'
}

/**
 * Open a workbook via the File System Access picker, returning both the parsed
 * workbook and a writable handle so it can later be saved in place.
 */
export async function pickAndReadWorkbook(): Promise<{
  wb: ImportedWorkbook
  handle: FileSystemFileHandle
  bytes: ArrayBuffer
} | null> {
  const picker = (
    window as unknown as {
      showOpenFilePicker: (opts: unknown) => Promise<FileSystemFileHandle[]>
    }
  ).showOpenFilePicker
  let handles: FileSystemFileHandle[]
  try {
    handles = await picker({
      multiple: false,
      types: [
        {
          description: 'Spreadsheets',
          accept: {
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'text/csv': ['.csv'],
          },
        },
      ],
    })
  } catch (err) {
    // User dismissed the picker.
    if ((err as Error).name === 'AbortError') return null
    throw err
  }
  const handle = handles[0]
  const file = await handle.getFile()
  const bytes = await file.arrayBuffer()
  const wb = await readWorkbookFile(file)
  return { wb, handle, bytes }
}

/** Overwrite the file backing `handle` with the current state. */
export async function saveToHandle(
  hf: HyperFormula,
  sheets: SheetMeta[],
  handle: FileSystemFileHandle,
): Promise<void> {
  const format: 'xlsx' | 'csv' = handle.name.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx'
  const buf = await workbookBuffer(hf, sheets, format)
  const writable = await handle.createWritable()
  await writable.write(buf)
  await writable.close()
}

/** Build an exceljs workbook from HyperFormula state + formats (no download). */
export function buildWorkbook(
  hf: HyperFormula,
  sheets: SheetMeta[],
  format: 'xlsx' | 'csv',
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()

  for (const meta of sheets) {
    const ws = wb.addWorksheet(meta.name.slice(0, 31))
    const dims = hf.getSheetDimensions(meta.id)
    const height = Math.max(dims.height, 1)
    const width = Math.max(dims.width, 1)

    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const addr = { sheet: meta.id, row: r, col: c }
        const serialized = hf.getCellSerialized(addr)
        const fmt = meta.formats[`${r},${c}`]
        if ((serialized === null || serialized === undefined || serialized === '') && !fmt) continue

        const cell = ws.getCell(r + 1, c + 1)
        const computed = hf.getCellValue(addr)

        if (format === 'xlsx' && typeof serialized === 'string' && serialized.startsWith('=')) {
          cell.value = { formula: serialized.slice(1), result: toExcelResult(computed) }
        } else if (format === 'csv') {
          cell.value = toCsvValue(computed)
        } else if (serialized !== null && serialized !== undefined && serialized !== '') {
          cell.value = serialized as ExcelJS.CellValue
        }

        if (format === 'xlsx' && fmt) applyFormatToCell(cell, fmt)
      }
    }

    if (format === 'xlsx') {
      for (const [col, px] of Object.entries(meta.colWidths)) {
        ws.getColumn(Number(col) + 1).width = pxToChar(px)
      }
      for (const [row, px] of Object.entries(meta.rowHeights)) {
        ws.getRow(Number(row) + 1).height = pxToPt(px)
      }
      for (const m of meta.merges) {
        ws.mergeCells(m.top + 1, m.left + 1, m.bottom + 1, m.right + 1)
        // Merged cells share the master (top-left) cell's style, so a border
        // stored only on a covered edge cell (e.g. the right/bottom of a header
        // box) would be lost on save. Collapse the region's outer borders into
        // a union and write it onto the master so the whole box survives.
        const union = mergedUnionBorders(meta.formats, m)
        if (union) ws.getCell(m.top + 1, m.left + 1).border = toExcelBorders(union)
      }
      if (meta.frozenRows || meta.frozenCols) {
        ws.views = [{ state: 'frozen', xSplit: meta.frozenCols, ySplit: meta.frozenRows }]
      }
    }
  }

  return wb
}

/** Union of the outer borders across a merged region's edge cells. */
function mergedUnionBorders(
  formats: Record<string, CellFormat>,
  m: MergeRange,
): CellBorders | undefined {
  const B = (r: number, c: number) => formats[`${r},${c}`]?.borders
  let top: BorderSide | undefined
  let bottom: BorderSide | undefined
  let left: BorderSide | undefined
  let right: BorderSide | undefined
  for (let c = m.left; c <= m.right; c++) {
    top = strongerBorder(top, B(m.top, c)?.top)
    bottom = strongerBorder(bottom, B(m.bottom, c)?.bottom)
  }
  for (let r = m.top; r <= m.bottom; r++) {
    left = strongerBorder(left, B(r, m.left)?.left)
    right = strongerBorder(right, B(r, m.right)?.right)
  }
  const out: CellBorders = {}
  if (top) out.top = top
  if (bottom) out.bottom = bottom
  if (left) out.left = left
  if (right) out.right = right
  return Object.keys(out).length ? out : undefined
}

/** Convert our CellBorders to an exceljs border object. */
function toExcelBorders(borders: CellBorders): Partial<ExcelJS.Borders> {
  const side = (b: BorderSide | undefined): Partial<ExcelJS.Border> | undefined =>
    b
      ? { style: b.style as ExcelJS.BorderStyle, color: { argb: hexToArgb(b.color ?? '#000000') } }
      : undefined
  const border: Partial<ExcelJS.Borders> = {}
  if (borders.top) border.top = side(borders.top)
  if (borders.right) border.right = side(borders.right)
  if (borders.bottom) border.bottom = side(borders.bottom)
  if (borders.left) border.left = side(borders.left)
  return border
}

function applyFormatToCell(cell: ExcelJS.Cell, fmt: CellFormat) {
  if (fmt.bold || fmt.italic || fmt.underline || fmt.color) {
    cell.font = {
      bold: fmt.bold,
      italic: fmt.italic,
      underline: fmt.underline,
      color: fmt.color ? { argb: hexToArgb(fmt.color) } : undefined,
    }
  }
  if (fmt.bgColor) {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: hexToArgb(fmt.bgColor) },
    }
  }
  if (fmt.align) cell.alignment = { horizontal: fmt.align }
  if (fmt.numberFormat && fmt.numberFormat !== 'General') cell.numFmt = fmt.numberFormat
  if (fmt.borders) cell.border = toExcelBorders(fmt.borders)
}

function toExcelResult(computed: unknown): number | string | boolean | { error: ExcelJS.CellErrorValue['error'] } {
  if (computed === null || computed === undefined) return ''
  if (typeof computed === 'object') {
    const e = (computed as { value?: string }).value ?? '#ERROR!'
    return { error: e as ExcelJS.CellErrorValue['error'] }
  }
  return computed as number | string | boolean
}

function toCsvValue(computed: unknown): ExcelJS.CellValue {
  if (computed === null || computed === undefined) return null
  if (typeof computed === 'object') return (computed as { value?: string }).value ?? '#ERROR!'
  return computed as string | number | boolean
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
