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

/** Resolve the style a set of rules applies to a cell (later rules win). */
export function condStyleFor(
  rules: CondFormatRule[],
  row: number,
  col: number,
  computed: unknown,
): { bgColor?: string; color?: string } {
  const out: { bgColor?: string; color?: string } = {}
  for (const rule of rules) {
    if (inRange(rule.range, row, col) && matchesCond(rule, computed)) {
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
