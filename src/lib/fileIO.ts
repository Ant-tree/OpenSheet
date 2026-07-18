import * as XLSX from 'xlsx'
import type { HyperFormula } from 'hyperformula'
import type { MergeRange, SheetMeta } from '../types'

export interface ImportedSheet {
  name: string
  rows: (string | number | boolean | null)[][]
  merges: MergeRange[]
}

export interface ImportedWorkbook {
  fileName: string
  sheets: ImportedSheet[]
}

/**
 * Parse an .xlsx or .csv File into a plain array-of-arrays per sheet.
 * Formula cells are preserved as "=..." strings so HyperFormula recomputes
 * them; everything else keeps its raw value.
 */
export async function readWorkbookFile(file: File): Promise<ImportedWorkbook> {
  const buf = await file.arrayBuffer()
  // cellDates:false keeps dates as numeric serials, which HyperFormula understands.
  const wb = XLSX.read(buf, { type: 'array', cellFormula: true, cellDates: false })

  const sheets = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]
    const rows: (string | number | boolean | null)[][] = []
    if (ws['!ref']) {
      const range = XLSX.utils.decode_range(ws['!ref'])
      for (let r = range.s.r; r <= range.e.r; r++) {
        const row: (string | number | boolean | null)[] = []
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r, c })
          const cell = ws[addr]
          row.push(cellToInput(cell))
        }
        rows.push(row)
      }
    }
    const merges: MergeRange[] = (ws['!merges'] ?? []).map((m) => ({
      top: m.s.r,
      left: m.s.c,
      bottom: m.e.r,
      right: m.e.c,
    }))
    return { name, rows, merges }
  })

  return { fileName: file.name, sheets }
}

function cellToInput(
  cell: XLSX.CellObject | undefined,
): string | number | boolean | null {
  if (!cell) return null
  if (cell.f) return '=' + cell.f // preserve formula
  if (cell.v === undefined || cell.v === null) return null
  if (cell.v instanceof Date) return cell.v.toISOString().slice(0, 10)
  return cell.v as string | number | boolean
}

/**
 * Build a SheetJS workbook from the current HyperFormula state and trigger a
 * download. For .xlsx we write real formula cells (with their cached computed
 * value); for .csv we write the computed values only.
 */
export function exportWorkbook(
  hf: HyperFormula,
  sheets: SheetMeta[],
  fileName: string,
  format: 'xlsx' | 'csv',
) {
  const wb = buildWorkbook(hf, sheets, format)
  const base = fileName.replace(/\.(xlsx|csv)$/i, '')
  XLSX.writeFile(wb, `${base}.${format}`, { bookType: format })
}

/** Build a SheetJS workbook from HyperFormula state (no download). */
export function buildWorkbook(
  hf: HyperFormula,
  sheets: SheetMeta[],
  format: 'xlsx' | 'csv',
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()

  for (const meta of sheets) {
    const dims = hf.getSheetDimensions(meta.id)
    const height = Math.max(dims.height, 1)
    const width = Math.max(dims.width, 1)
    const ws: XLSX.WorkSheet = {}
    const range = { s: { r: 0, c: 0 }, e: { r: height - 1, c: width - 1 } }

    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const addr = { sheet: meta.id, row: r, col: c }
        const serialized = hf.getCellSerialized(addr)
        if (serialized === null || serialized === undefined || serialized === '') continue
        const computed = hf.getCellValue(addr)
        const cellAddr = XLSX.utils.encode_cell({ r, c })

        if (format === 'xlsx' && typeof serialized === 'string' && serialized.startsWith('=')) {
          ws[cellAddr] = makeCell(computed, serialized.slice(1))
        } else {
          const value = format === 'csv' ? computed : serialized
          ws[cellAddr] = makeCell(value)
        }
      }
    }

    ws['!ref'] = XLSX.utils.encode_range(range)
    if (format === 'xlsx' && meta.merges.length) {
      ws['!merges'] = meta.merges.map((m) => ({
        s: { r: m.top, c: m.left },
        e: { r: m.bottom, c: m.right },
      }))
    }
    XLSX.utils.book_append_sheet(wb, ws, meta.name.slice(0, 31))
  }

  return wb
}

function makeCell(value: unknown, formula?: string): XLSX.CellObject {
  let t: XLSX.ExcelDataType = 's'
  let v: string | number | boolean = ''
  if (value === null || value === undefined) {
    t = 's'
    v = ''
  } else if (typeof value === 'object') {
    // HyperFormula error object, e.g. { value: "#DIV/0!" }.
    t = 'e'
    v = 0
    return { t, v, w: (value as { value?: string }).value ?? '#ERROR!' }
  } else if (typeof value === 'number') {
    t = 'n'
    v = value
  } else if (typeof value === 'boolean') {
    t = 'b'
    v = value
  } else {
    t = 's'
    v = String(value)
  }
  const cell: XLSX.CellObject = { t, v }
  if (formula) cell.f = formula
  return cell
}
