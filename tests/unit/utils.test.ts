import { describe, expect, test } from 'vitest'
import {
  colToLetter,
  letterToCol,
  cellRefToA1,
  selectionBounds,
  isInSelection,
  iterateSelection,
  clamp,
  shiftFormulaRowRefs,
  shiftFormulaRefs,
  replaceCaseInsensitive,
  colFromLetters,
  isInAnyRange,
  iterateMultiSelection,
} from '../../src/lib/utils'
import type { Selection } from '../../src/types'

const sel = (a: [number, number], f: [number, number]): Selection => ({
  anchor: { row: a[0], col: a[1] },
  focus: { row: f[0], col: f[1] },
})

describe('column <-> letter', () => {
  test('colToLetter', () => {
    expect(colToLetter(0)).toBe('A')
    expect(colToLetter(25)).toBe('Z')
    expect(colToLetter(26)).toBe('AA')
    expect(colToLetter(701)).toBe('ZZ')
    expect(colToLetter(702)).toBe('AAA')
  })
  test('letterToCol / colFromLetters round-trip', () => {
    for (const c of [0, 1, 25, 26, 27, 51, 701, 702]) {
      expect(letterToCol(colToLetter(c))).toBe(c)
      expect(colFromLetters(colToLetter(c))).toBe(c)
    }
  })
  test('cellRefToA1', () => {
    expect(cellRefToA1({ row: 0, col: 0 })).toBe('A1')
    expect(cellRefToA1({ row: 9, col: 27 })).toBe('AB10')
  })
})

describe('selection geometry', () => {
  test('selectionBounds normalizes regardless of drag direction', () => {
    expect(selectionBounds(sel([3, 4], [1, 2]))).toEqual({ top: 1, bottom: 3, left: 2, right: 4 })
    expect(selectionBounds(sel([1, 2], [3, 4]))).toEqual({ top: 1, bottom: 3, left: 2, right: 4 })
  })
  test('isInSelection', () => {
    const s = sel([1, 1], [3, 3])
    expect(isInSelection(2, 2, s)).toBe(true)
    expect(isInSelection(1, 1, s)).toBe(true)
    expect(isInSelection(0, 2, s)).toBe(false)
    expect(isInSelection(2, 4, s)).toBe(false)
  })
  test('iterateSelection yields every cell in row-major order', () => {
    const cells = [...iterateSelection(sel([0, 0], [1, 1]))]
    expect(cells).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ])
  })
})

test('clamp', () => {
  expect(clamp(5, 0, 10)).toBe(5)
  expect(clamp(-1, 0, 10)).toBe(0)
  expect(clamp(11, 0, 10)).toBe(10)
})

describe('shiftFormulaRowRefs', () => {
  test('shifts relative rows, keeps absolute rows', () => {
    expect(shiftFormulaRowRefs('=B2*C2', 1)).toBe('=B3*C3')
    expect(shiftFormulaRowRefs('=B$2*C2', 1)).toBe('=B$2*C3')
  })
  test('no-ops on non-formula text and zero delta', () => {
    expect(shiftFormulaRowRefs('B2', 1)).toBe('B2')
    expect(shiftFormulaRowRefs('=B2', 0)).toBe('=B2')
  })
  test('does not shift below row 1', () => {
    expect(shiftFormulaRowRefs('=B1', -1)).toBe('=B1')
  })
  test('leaves function names untouched', () => {
    expect(shiftFormulaRowRefs('=SUM(A2:A3)', 1)).toBe('=SUM(A3:A4)')
  })
})

describe('shiftFormulaRefs', () => {
  test('shifts both row and column for relative refs', () => {
    expect(shiftFormulaRefs('=A1', 1, 1)).toBe('=B2')
    expect(shiftFormulaRefs('=$A1', 1, 1)).toBe('=$A2')
    expect(shiftFormulaRefs('=A$1', 1, 1)).toBe('=B$1')
  })
  test('clamps at column A / row 1', () => {
    expect(shiftFormulaRefs('=A1', 0, -1)).toBe('=A1')
    expect(shiftFormulaRefs('=A1', -1, 0)).toBe('=A1')
  })
})

describe('multi-range selection', () => {
  test('isInAnyRange', () => {
    const ranges = [
      { top: 0, bottom: 1, left: 0, right: 1 },
      { top: 5, bottom: 5, left: 5, right: 5 },
    ]
    expect(isInAnyRange(0, 0, ranges)).toBe(true)
    expect(isInAnyRange(1, 1, ranges)).toBe(true)
    expect(isInAnyRange(5, 5, ranges)).toBe(true)
    expect(isInAnyRange(3, 3, ranges)).toBe(false)
    expect(isInAnyRange(0, 0, [])).toBe(false)
  })

  test('iterateMultiSelection yields extra ranges then the active range', () => {
    const cells = [
      ...iterateMultiSelection(sel([2, 2], [2, 2]), [{ top: 0, bottom: 0, left: 0, right: 1 }]),
    ]
    expect(cells).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 2, col: 2 },
    ])
  })

  test('iterateMultiSelection de-duplicates overlapping cells', () => {
    const cells = [
      ...iterateMultiSelection(sel([0, 0], [1, 1]), [{ top: 0, bottom: 0, left: 0, right: 0 }]),
    ]
    // A1 appears in both the extra range and the active range — visited once.
    const keys = cells.map((c) => `${c.row},${c.col}`)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toContain('0,0')
    expect(cells.length).toBe(4)
  })
})

describe('replaceCaseInsensitive', () => {
  test('replaces all occurrences ignoring case', () => {
    expect(replaceCaseInsensitive('Foo foo FOO', 'foo', 'bar')).toBe('bar bar bar')
  })
  test('treats find text literally (no regex injection)', () => {
    expect(replaceCaseInsensitive('a.b.c', '.', '-')).toBe('a-b-c')
    expect(replaceCaseInsensitive('a+b', '+', '-')).toBe('a-b')
  })
  test('empty find returns input unchanged', () => {
    expect(replaceCaseInsensitive('abc', '', 'x')).toBe('abc')
  })
})
