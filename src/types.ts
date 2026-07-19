export type HAlign = 'left' | 'center' | 'right'

/** One edge of a cell border. `style` is an Excel border-style name (thin, medium, thick, …). */
export interface BorderSide {
  style: string
  color?: string // e.g. "#000000"
}

/** Per-edge cell borders. */
export interface CellBorders {
  top?: BorderSide
  right?: BorderSide
  bottom?: BorderSide
  left?: BorderSide
}

export type VAlign = 'top' | 'middle' | 'bottom'

export interface CellFormat {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  align?: HAlign
  valign?: VAlign
  wrap?: boolean
  color?: string // text color, e.g. "#d93025"
  bgColor?: string // background fill
  /** A number-format token understood by formatNumber(): e.g. "0.00", "#,##0", "0%", "$#,##0.00", "yyyy-mm-dd" */
  numberFormat?: string
  borders?: CellBorders
}

/** A rectangular block of merged cells. Anchored at (top,left). */
export interface MergeRange {
  top: number
  left: number
  bottom: number
  right: number
}

/** A cell coordinate within a sheet (0-based). */
export interface CellRef {
  row: number
  col: number
}

/** A rectangular selection (inclusive, normalized so start<=end). */
export interface Selection {
  anchor: CellRef
  focus: CellRef
}

export interface SheetMeta {
  id: number
  name: string
  /** Per-cell formatting keyed by "row,col". */
  formats: Record<string, CellFormat>
  /** Per-cell notes/comments keyed by "row,col". */
  notes: Record<string, string>
  merges: MergeRange[]
  /** Custom column widths keyed by col index. */
  colWidths: Record<number, number>
  /** Custom row heights keyed by row index. */
  rowHeights: Record<number, number>
  /** Number of leading rows/columns frozen (kept visible while scrolling). */
  frozenRows: number
  frozenCols: number
}
