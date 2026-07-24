import type { CondFormatOp, CondFormatRule, MergeRange } from '../types'

/** True when (row, col) falls inside a rule's range. */
export function inRange(range: MergeRange, row: number, col: number): boolean {
  return row >= range.top && row <= range.bottom && col >= range.left && col <= range.right
}

/** Evaluate whether a cell's computed value satisfies a rule's condition. */
export function matchesCond(rule: CondFormatRule, computed: unknown): boolean {
  const num = typeof computed === 'number' ? computed : null
  const v1 = Number(rule.value1)
  const v2 = Number(rule.value2)
  switch (rule.op) {
    case 'greaterThan':
      return num !== null && !isNaN(v1) && num > v1
    case 'lessThan':
      return num !== null && !isNaN(v1) && num < v1
    case 'between':
      return num !== null && !isNaN(v1) && !isNaN(v2) && num >= Math.min(v1, v2) && num <= Math.max(v1, v2)
    case 'equal':
      if (num !== null && !isNaN(v1)) return num === v1
      return computed != null && String(computed) === rule.value1
    case 'textContains':
      return (
        computed != null &&
        !!rule.value1 &&
        String(computed).toLowerCase().includes(rule.value1.toLowerCase())
      )
    default:
      return false
  }
}

/** Pick a legible text color (dark or light) for a given background hex. */
function readableText(hex: string): string {
  const h = hex.replace(/^#/, '')
  if (h.length < 6) return '#1f2328'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#1f2328' : '#ffffff'
}

/** Min/max of the numeric computed values in a range (null if none numeric). */
export function rangeNumericStats(
  range: MergeRange,
  getComputed: (row: number, col: number) => unknown,
): { min: number; max: number } | null {
  let min = Infinity
  let max = -Infinity
  let any = false
  for (let r = range.top; r <= range.bottom; r++) {
    for (let c = range.left; c <= range.right; c++) {
      const v = getComputed(r, c)
      if (typeof v === 'number' && isFinite(v)) {
        any = true
        if (v < min) min = v
        if (v > max) max = v
      }
    }
  }
  return any ? { min, max } : null
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}
/** Linear interpolate between two hex colors, t in [0,1]. */
export function lerpHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t)
}

/** Fraction (0..1) of `value` within [min,max]; 0 if the range is degenerate. */
function fraction(min: number, max: number, value: number): number {
  if (max <= min) return max <= min && value >= max ? 1 : 0
  return Math.max(0, Math.min(1, (value - min) / (max - min)))
}

/** The in-cell data bar to draw for a cell, if any. */
export interface DataBar {
  pct: number // 0..100
  color: string
}

/**
 * Resolve the style a set of rules applies to a cell (later rules win).
 * `statsByRule` supplies precomputed range min/max for colorScale/dataBar rules.
 */
export function condStyleFor(
  rules: CondFormatRule[],
  row: number,
  col: number,
  computed: unknown,
  statsByRule?: Map<CondFormatRule, { min: number; max: number }>,
): { bgColor?: string; color?: string; dataBar?: DataBar } {
  const out: { bgColor?: string; color?: string; dataBar?: DataBar } = {}
  for (const rule of rules) {
    if (!inRange(rule.range, row, col)) continue
    const kind = rule.kind ?? 'cell'
    if (kind === 'colorScale') {
      const stats = statsByRule?.get(rule)
      if (!stats || typeof computed !== 'number') continue
      const t = fraction(stats.min, stats.max, computed)
      const min = rule.minColor ?? '#f8696b'
      const max = rule.maxColor ?? '#63be7b'
      const bg = rule.midColor
        ? t < 0.5
          ? lerpHex(min, rule.midColor, t * 2)
          : lerpHex(rule.midColor, max, (t - 0.5) * 2)
        : lerpHex(min, max, t)
      out.bgColor = bg
      out.color = readableText(bg)
    } else if (kind === 'dataBar') {
      const stats = statsByRule?.get(rule)
      if (!stats || typeof computed !== 'number') continue
      out.dataBar = { pct: Math.round(fraction(stats.min, stats.max, computed) * 100), color: rule.barColor ?? '#63be7b' }
    } else if (rule.bgColor && matchesCond(rule, computed)) {
      out.bgColor = rule.bgColor
      // Keep the fill legible regardless of the current theme's text color.
      out.color = rule.color ?? readableText(rule.bgColor)
    }
  }
  return out
}

/** Map our operator to the exceljs `cellIs` operator (null for text rules). */
export function opToExcel(op: CondFormatOp): string | null {
  switch (op) {
    case 'greaterThan':
      return 'greaterThan'
    case 'lessThan':
      return 'lessThan'
    case 'between':
      return 'between'
    case 'equal':
      return 'equal'
    case 'textContains':
      return null
    default:
      return null
  }
}

/** Map an exceljs `cellIs` operator back to ours. */
export function opFromExcel(operator: string): CondFormatOp | null {
  switch (operator) {
    case 'greaterThan':
      return 'greaterThan'
    case 'lessThan':
      return 'lessThan'
    case 'between':
      return 'between'
    case 'equal':
      return 'equal'
    default:
      return null
  }
}
