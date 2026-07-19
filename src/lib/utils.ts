import type { CellRef, Selection } from '../types'

/** 0 -> "A", 25 -> "Z", 26 -> "AA" */
export function colToLetter(col: number): string {
  let s = ''
  let n = col
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}

/** "A" -> 0, "AA" -> 26 */
export function letterToCol(letter: string): number {
  let n = 0
  for (const ch of letter.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64)
  }
  return n - 1
}

/** {row:0,col:0} -> "A1" */
export function cellRefToA1(ref: CellRef): string {
  return `${colToLetter(ref.col)}${ref.row + 1}`
}

export function key(row: number, col: number): string {
  return `${row},${col}`
}

/** Normalize a selection into inclusive bounds. */
export function selectionBounds(sel: Selection) {
  const top = Math.min(sel.anchor.row, sel.focus.row)
  const bottom = Math.max(sel.anchor.row, sel.focus.row)
  const left = Math.min(sel.anchor.col, sel.focus.col)
  const right = Math.max(sel.anchor.col, sel.focus.col)
  return { top, bottom, left, right }
}

export function isInSelection(row: number, col: number, sel: Selection): boolean {
  const b = selectionBounds(sel)
  return row >= b.top && row <= b.bottom && col >= b.left && col <= b.right
}

export function* iterateSelection(sel: Selection): Generator<CellRef> {
  const b = selectionBounds(sel)
  for (let row = b.top; row <= b.bottom; row++) {
    for (let col = b.left; col <= b.right; col++) {
      yield { row, col }
    }
  }
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * Shift the (1-based) row part of every *relative* cell reference in a formula
 * by `delta`. Absolute rows (written with a `$` before the number) and column
 * letters are left untouched. This mirrors how Excel adjusts formulas when rows
 * are reordered by a sort, so same-row formulas like `=B2*C2` stay correct.
 *
 * The reference matcher deliberately excludes function calls (a name followed
 * by `(`) and identifiers embedded in longer tokens.
 */
export function shiftFormulaRowRefs(formula: string, delta: number): string {
  if (delta === 0 || !formula.startsWith('=')) return formula
  const re = /(?<![A-Za-z0-9_$.])(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(])/g
  return formula.replace(re, (match, colAbs, col, rowAbs, rowNum) => {
    if (rowAbs === '$') return match // absolute row: leave as-is
    const newRow = Number(rowNum) + delta
    if (newRow < 1) return match // would move above row 1: keep original
    return `${colAbs}${col}${rowAbs}${newRow}`
  })
}

/** Case-insensitive replace-all of `find` with `repl` in `str`. */
export function replaceCaseInsensitive(str: string, find: string, repl: string): string {
  if (!find) return str
  const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return str.replace(new RegExp(escaped, 'gi'), repl)
}
