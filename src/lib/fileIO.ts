import ExcelJS from 'exceljs'
import type { HyperFormula } from 'hyperformula'
import type {
  BorderSide,
  CellBorders,
  CellFormat,
  ChartSpec,
  CondFormatRule,
  DataValidation,
  HAlign,
  MergeRange,
  SheetMeta,
} from '../types'
import { t, useLangStore } from '../i18n'
import { strongerBorder } from './format'
import { opFromExcel, opToExcel } from './condFormat'
import { chartToSvgString, svgToPngDataUrl } from './chartRender'

/** sheet id -> charts inserted on it. */
export type ChartsBySheet = Record<number, ChartSpec[]>

export interface ImportedSheet {
  name: string
  rows: (string | number | boolean | null)[][]
  merges: MergeRange[]
  /** Per-cell formatting keyed by "row,col" (0-based). */
  formats: Record<string, CellFormat>
  /** Per-cell notes keyed by "row,col" (0-based). */
  notes: Record<string, string>
  /** Conditional-formatting rules. */
  condFormats: CondFormatRule[]
  /** List data-validations (dropdown lists). */
  dataValidations: DataValidation[]
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
    const notes: Record<string, string> = {}
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
        const note = readNote(cell)
        if (note) notes[`${r - 1},${c - 1}`] = note
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
    const condFormats: CondFormatRule[] = readCondFormats(ws)
    const dataValidations: DataValidation[] = readDataValidations(ws)

    const view = (ws.views ?? [])[0] as { state?: string; xSplit?: number; ySplit?: number } | undefined
    const frozen = view?.state === 'frozen'
    const frozenRows = frozen ? view?.ySplit ?? 0 : 0
    const frozenCols = frozen ? view?.xSplit ?? 0 : 0

    sheets.push({ name: ws.name, rows, merges, formats, notes, condFormats, dataValidations, colWidths, rowHeights, frozenRows, frozenCols })
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
  const v = cell.alignment?.vertical
  if (v === 'top' || v === 'middle' || v === 'bottom') fmt.valign = v
  if (cell.alignment?.wrapText) fmt.wrap = true

  const numFmt = cell.numFmt
  if (numFmt && numFmt !== 'General') fmt.numberFormat = numFmt
  else if (cell.value instanceof Date) fmt.numberFormat = 'yyyy-mm-dd'

  const borders = readBorders(cell.border)
  if (borders) fmt.borders = borders

  return Object.keys(fmt).length ? fmt : undefined
}

/** Read a cell comment/note as plain text (exceljs stores it as a string or rich-text). */
function readNote(cell: ExcelJS.Cell): string | undefined {
  const note = (cell as unknown as { note?: unknown }).note
  if (!note) return undefined
  if (typeof note === 'string') return note.trim() || undefined
  const texts = (note as { texts?: { text: string }[] }).texts
  if (texts) return texts.map((tn) => tn.text).join('').trim() || undefined
  return undefined
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

/** Decode "AB12" (with optional $ anchors) into 0-based {row, col}. */
function decodeA1(a1: string): { row: number; col: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(a1.replace(/\$/g, '').trim().toUpperCase())
  if (!m) return null
  let col = 0
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
  return { row: parseInt(m[2], 10) - 1, col: col - 1 }
}

/** Decode an A1 range like "A1:C10" (or a single "A1") into a MergeRange. */
function decodeA1Range(ref: string): MergeRange | null {
  const [start, end] = ref.split(':')
  const s = decodeA1(start)
  const e = decodeA1(end ?? start)
  if (!s || !e) return null
  return {
    top: Math.min(s.row, e.row),
    left: Math.min(s.col, e.col),
    bottom: Math.max(s.row, e.row),
    right: Math.max(s.col, e.col),
  }
}

/** exceljs conditional-formatting rule/style shapes (fields absent from its types). */
type XlsxCfRule = {
  type?: string
  operator?: string
  formulae?: unknown[]
  text?: string
  style?: { fill?: { bgColor?: XlsxColor; fgColor?: XlsxColor }; font?: { color?: XlsxColor } }
}

/** Read conditional-formatting rules we understand (cellIs comparisons, text-contains). */
function readCondFormats(ws: ExcelJS.Worksheet): CondFormatRule[] {
  const cfs = (ws as unknown as { conditionalFormattings?: { ref: string; rules: XlsxCfRule[] }[] })
    .conditionalFormattings
  if (!cfs) return []
  const out: CondFormatRule[] = []
  for (const cf of cfs) {
    const range = decodeA1Range(cf.ref?.split(' ')[0] ?? '')
    if (!range) continue
    for (const rule of cf.rules ?? []) {
      const bg = resolveColor(rule.style?.fill?.bgColor ?? rule.style?.fill?.fgColor)
      if (!bg) continue
      const color = resolveColor(rule.style?.font?.color)
      if (rule.type === 'cellIs' && rule.operator) {
        const op = opFromExcel(rule.operator)
        if (!op) continue
        out.push({
          range,
          op,
          value1: String(rule.formulae?.[0] ?? ''),
          value2: rule.formulae?.[1] != null ? String(rule.formulae[1]) : undefined,
          bgColor: bg,
          ...(color ? { color } : {}),
        })
      } else if (rule.type === 'containsText' && rule.text != null) {
        out.push({ range, op: 'textContains', value1: String(rule.text), bgColor: bg, ...(color ? { color } : {}) })
      }
    }
  }
  return out
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
    notes: {},
    condFormats: [],
    dataValidations: [],
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
  charts?: ChartsBySheet,
): Promise<void> {
  const buf = await workbookBuffer(hf, sheets, format, charts)
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
  charts?: ChartsBySheet,
): Promise<ArrayBuffer> {
  const wb = buildWorkbook(hf, sheets, format)
  if (format === 'xlsx' && charts) await embedCharts(wb, hf, sheets, charts)
  const buf = format === 'csv' ? await wb.csv.writeBuffer() : await wb.xlsx.writeBuffer()
  return buf as ArrayBuffer
}

/**
 * Rasterize each inserted chart to a PNG and place it on its worksheet, to the
 * right of the used data range (stacked). CSV has no image support, so charts
 * are only embedded for xlsx.
 */
async function embedCharts(
  wb: ExcelJS.Workbook,
  hf: HyperFormula,
  sheets: SheetMeta[],
  charts: ChartsBySheet,
): Promise<void> {
  const ROW_PX = 20
  for (let i = 0; i < sheets.length; i++) {
    const meta = sheets[i]
    const list = charts[meta.id]
    if (!list?.length) continue
    const ws = wb.getWorksheet(i + 1)
    if (!ws) continue
    const dims = hf.getSheetDimensions(meta.id)
    const anchorCol = Math.max(1, dims.width) + 1 // one column right of the data
    let rowCursor = 0
    for (const c of list) {
      const svg = chartToSvgString(c.data, c.kind, c.width, c.height)
      const dataUrl = await svgToPngDataUrl(svg, c.width, c.height)
      const imageId = wb.addImage({ base64: dataUrl.split(',')[1], extension: 'png' })
      ws.addImage(imageId, {
        tl: { col: anchorCol, row: rowCursor } as ExcelJS.Anchor,
        ext: { width: c.width, height: c.height },
      })
      rowCursor += Math.ceil(c.height / ROW_PX) + 1
    }
  }
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
  charts?: ChartsBySheet,
): Promise<void> {
  const format: 'xlsx' | 'csv' = handle.name.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx'
  const buf = await workbookBuffer(hf, sheets, format, charts)
  const writable = await handle.createWritable()
  await writable.write(buf)
  await writable.close()
}

/** Result of a Save As: the new name to display, plus a writable handle when
 * one is available (Chromium) so ⌘S can keep saving in place. */
export interface SaveAsResult {
  handle: FileSystemFileHandle | null
  name: string
}

/**
 * Save As: let the user choose a new name/location, then write there.
 *
 * - **Tauri desktop app** — native save dialog + write (WKWebView has no
 *   `showSaveFilePicker`).
 * - **Chromium** — File System Access picker; the returned handle lets ⌘S save
 *   in place afterwards.
 * - **Other browsers (Safari/Firefox/mobile)** — prompt for a name and download
 *   with it (no silent default-name download).
 *
 * Returns `undefined` if the user cancels.
 */
export async function saveWorkbookAs(
  hf: HyperFormula,
  sheets: SheetMeta[],
  fileName: string,
  format: 'xlsx' | 'csv',
  charts?: ChartsBySheet,
): Promise<SaveAsResult | undefined> {
  const base = fileName.replace(/\.(xlsx|csv)$/i, '')
  const suggested = `${base}.${format}`
  const basename = (p: string) => p.split(/[\\/]/).pop() || suggested

  // Tauri desktop: native save dialog + write. Falls through to the browser
  // paths if the command isn't present (e.g. an older app build).
  const internals = (
    window as unknown as {
      __TAURI_INTERNALS__?: { invoke: (cmd: string, args?: unknown) => Promise<unknown> }
    }
  ).__TAURI_INTERNALS__
  if (internals && typeof internals.invoke === 'function') {
    try {
      const buf = await workbookBuffer(hf, sheets, format, charts)
      const path = (await internals.invoke('save_workbook_as', {
        defaultName: suggested,
        bytes: Array.from(new Uint8Array(buf)),
      })) as string | null
      if (!path) return undefined // user cancelled the dialog
      return { handle: null, name: basename(path) }
    } catch {
      // Command unavailable — fall back to the browser paths below.
    }
  }

  // Chromium: File System Access picker (returns a reusable writable handle).
  const picker = (
    window as unknown as {
      showSaveFilePicker?: (opts: unknown) => Promise<FileSystemFileHandle>
    }
  ).showSaveFilePicker
  if (typeof picker === 'function') {
    let handle: FileSystemFileHandle
    try {
      handle = await picker({
        suggestedName: suggested,
        types: [
          format === 'csv'
            ? { description: 'CSV', accept: { 'text/csv': ['.csv'] } }
            : {
                description: 'Excel Workbook',
                accept: {
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
                },
              },
        ],
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') return undefined
      throw err
    }
    await saveToHandle(hf, sheets, handle, charts)
    return { handle, name: handle.name }
  }

  // Other browsers: no native "save as" dialog exists — ask for a name so the
  // download isn't always the default filename, then download.
  const lang = useLangStore.getState().lang
  const chosen = window.prompt(t('saveAsPrompt', lang), suggested)
  if (chosen === null) return undefined
  const trimmed = chosen.trim() || suggested
  await exportWorkbook(hf, sheets, trimmed, format, charts)
  return { handle: null, name: `${trimmed.replace(/\.(xlsx|csv)$/i, '')}.${format}` }
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
      for (const [k, text] of Object.entries(meta.notes)) {
        const [r, c] = k.split(',').map(Number)
        ;(ws.getCell(r + 1, c + 1) as unknown as { note: string }).note = text
      }
      writeCondFormats(ws, meta.condFormats)
      writeDataValidations(ws, meta.dataValidations)
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

function encodeCol(col: number): string {
  let s = ''
  let c = col + 1
  while (c > 0) {
    const m = (c - 1) % 26
    s = String.fromCharCode(65 + m) + s
    c = Math.floor((c - 1) / 26)
  }
  return s
}

function encodeA1Range(m: MergeRange): string {
  return `${encodeCol(m.left)}${m.top + 1}:${encodeCol(m.right)}${m.bottom + 1}`
}

/** Write our conditional-formatting rules as exceljs cellIs / containsText rules. */
function writeCondFormats(ws: ExcelJS.Worksheet, rules: CondFormatRule[]) {
  if (!rules.length) return
  let priority = 1
  for (const rule of rules) {
    const ref = encodeA1Range(rule.range)
    const style: Record<string, unknown> = {
      fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: hexToArgb(rule.bgColor) } },
    }
    if (rule.color) style.font = { color: { argb: hexToArgb(rule.color) } }
    let cfRule: Record<string, unknown> | null = null
    if (rule.op === 'textContains') {
      cfRule = { type: 'containsText', operator: 'containsText', text: rule.value1, priority: priority++, style }
    } else {
      const operator = opToExcel(rule.op)
      if (!operator) continue
      const formulae = rule.op === 'between' ? [rule.value1, rule.value2 ?? ''] : [rule.value1]
      cfRule = { type: 'cellIs', operator, formulae, priority: priority++, style }
    }
    ws.addConditionalFormatting({ ref, rules: [cfRule] } as unknown as Parameters<
      ExcelJS.Worksheet['addConditionalFormatting']
    >[0])
  }
}

/** Read list data-validations. ExcelJS expands ranges to per-cell entries, so we
 * regroup cells that share a value list into contiguous per-column ranges. */
function readDataValidations(ws: ExcelJS.Worksheet): DataValidation[] {
  const model = (ws as unknown as { dataValidations?: { model?: Record<string, { type?: string; formulae?: unknown[] }> } })
    .dataValidations?.model
  if (!model) return []
  // valuesKey -> col -> sorted rows
  const groups = new Map<string, { values: string[]; byCol: Map<number, number[]> }>()
  for (const addr in model) {
    const dv = model[addr]
    if (!dv || dv.type !== 'list') continue
    const f = Array.isArray(dv.formulae) ? dv.formulae[0] : undefined
    if (typeof f !== 'string') continue
    const m = f.match(/^"(.*)"$/s) // inline quoted list only
    if (!m) continue
    const values = m[1].split(',').map((s) => s.trim()).filter((s) => s !== '')
    if (!values.length) continue
    const cell = decodeA1(addr)
    if (!cell) continue
    const vkey = values.join('')
    let g = groups.get(vkey)
    if (!g) {
      g = { values, byCol: new Map() }
      groups.set(vkey, g)
    }
    const rows = g.byCol.get(cell.col) ?? []
    rows.push(cell.row)
    g.byCol.set(cell.col, rows)
  }
  const out: DataValidation[] = []
  for (const g of groups.values()) {
    for (const [col, rows] of g.byCol) {
      rows.sort((a, b) => a - b)
      let start = rows[0]
      let prev = rows[0]
      const flush = (end: number) =>
        out.push({ range: { top: start, left: col, bottom: end, right: col }, values: g.values })
      for (let i = 1; i < rows.length; i++) {
        if (rows[i] === prev + 1) prev = rows[i]
        else {
          flush(prev)
          start = prev = rows[i]
        }
      }
      flush(prev)
    }
  }
  return out
}

function writeDataValidations(ws: ExcelJS.Worksheet, validations: DataValidation[]) {
  const dv = (ws as unknown as {
    dataValidations: { add: (ref: string, rule: Record<string, unknown>) => void }
  }).dataValidations
  for (const v of validations) {
    if (!v.values.length) continue
    dv.add(encodeA1Range(v.range), {
      type: 'list',
      allowBlank: true,
      formulae: [`"${v.values.join(',')}"`],
    })
  }
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
  if (fmt.align || fmt.valign || fmt.wrap) {
    cell.alignment = {
      ...(fmt.align ? { horizontal: fmt.align } : {}),
      ...(fmt.valign ? { vertical: fmt.valign } : {}),
      ...(fmt.wrap ? { wrapText: true } : {}),
    }
  }
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
