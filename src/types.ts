export type HAlign = 'left' | 'center' | 'right'

export interface CellFormat {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  align?: HAlign
  color?: string // text color, e.g. "#d93025"
  bgColor?: string // background fill
  /** A number-format token understood by formatNumber(): e.g. "0.00", "#,##0", "0%", "$#,##0.00", "yyyy-mm-dd" */
  numberFormat?: string
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
  merges: MergeRange[]
  /** Custom column widths keyed by col index. */
  colWidths: Record<number, number>
  /** Custom row heights keyed by row index. */
  rowHeights: Record<number, number>
}
