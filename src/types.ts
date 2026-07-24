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
  strike?: boolean // strikethrough
  /** Font size in px (app base is 13). Absent = default. Exported to Excel as pt. */
  fontSize?: number
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

export type CondFormatOp = 'greaterThan' | 'lessThan' | 'between' | 'equal' | 'textContains'

/** 'cell' = value comparison (default); 'colorScale'/'dataBar' span the range. */
export type CondFormatKind = 'cell' | 'colorScale' | 'dataBar'

/** A conditional-formatting rule. `kind` (default 'cell') highlights cells whose
 *  value matches `op`; 'colorScale' shades each cell between min/max colors by
 *  value; 'dataBar' draws an in-cell bar proportional to the value. */
export interface CondFormatRule {
  range: MergeRange
  kind?: CondFormatKind
  // --- cell rules ---
  op?: CondFormatOp
  /** Comparison operand (parsed as a number for numeric ops). */
  value1?: string
  /** Upper bound for the 'between' operator. */
  value2?: string
  bgColor?: string
  color?: string
  // --- colorScale rules ---
  minColor?: string
  midColor?: string
  maxColor?: string
  // --- dataBar rules ---
  barColor?: string
}

/** A list data-validation: cells in `range` accept only one of `values` (dropdown). */
export interface DataValidation {
  range: MergeRange
  /** 'list' = dropdown of `values` (default); 'checkbox' = TRUE/FALSE toggle. */
  kind?: 'list' | 'checkbox'
  values?: string[]
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

export type ChartKind = 'bar' | 'line' | 'pie'

/** Data extracted from a range to draw a chart. */
export interface ChartData {
  categories: string[]
  series: { name: string; values: number[] }[]
}

/**
 * A chart inserted onto a sheet. Position/size are in CSS pixels within the
 * grid area; `data` is captured at insert time so the chart is stable even if
 * the underlying cells change. Exported to `.xlsx` as an embedded image.
 */
export interface ChartSpec {
  id: string
  kind: ChartKind
  x: number
  y: number
  width: number
  height: number
  data: ChartData
}

/**
 * A tiny in-cell chart drawn from a source data range. Lives in one target cell
 * ({row, col}); the values are read live from `range` on each render. This is an
 * OpenSheet-only overlay (not written to `.xlsx`).
 */
export interface Sparkline {
  row: number
  col: number
  range: MergeRange
  type: 'line' | 'bar'
  color?: string
}

export interface SheetMeta {
  id: number
  name: string
  /** Per-cell formatting keyed by "row,col". */
  formats: Record<string, CellFormat>
  /** Per-cell notes/comments keyed by "row,col". */
  notes: Record<string, string>
  /** Per-cell hyperlink URLs keyed by "row,col". */
  links?: Record<string, string>
  /** Conditional-formatting rules, applied in order (later rules win). */
  condFormats: CondFormatRule[]
  /** List data-validations (dropdown lists). */
  dataValidations: DataValidation[]
  merges: MergeRange[]
  /** Custom column widths keyed by col index. */
  colWidths: Record<number, number>
  /** Custom row heights keyed by row index. */
  rowHeights: Record<number, number>
  /** Number of leading rows/columns frozen (kept visible while scrolling). */
  frozenRows: number
  frozenCols: number
  /** Manually hidden row / column indices. */
  hiddenRows?: number[]
  hiddenCols?: number[]
  /** In-cell sparklines (OpenSheet-only overlay). */
  sparklines?: Sparkline[]
}
