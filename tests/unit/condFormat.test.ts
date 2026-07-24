import { describe, expect, test } from 'vitest'
import { condStyleFor, lerpHex, rangeNumericStats } from '../../src/lib/condFormat'
import type { CondFormatRule } from '../../src/types'

const R = (top: number, bottom: number, left: number, right: number) => ({ top, bottom, left, right })

describe('lerpHex', () => {
  test('interpolates endpoints and midpoint', () => {
    expect(lerpHex('#000000', '#ffffff', 0)).toBe('#000000')
    expect(lerpHex('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(lerpHex('#000000', '#ffffff', 0.5)).toBe('#808080')
  })
})

describe('rangeNumericStats', () => {
  const grid: Record<string, unknown> = { '0,0': 10, '0,1': 20, '1,0': 30, '1,1': 'x' }
  const get = (r: number, c: number) => grid[`${r},${c}`]
  test('min/max over numeric cells, ignoring non-numbers', () => {
    expect(rangeNumericStats(R(0, 1, 0, 1), get)).toEqual({ min: 10, max: 30 })
  })
  test('null when no numeric cells', () => {
    expect(rangeNumericStats(R(5, 5, 5, 5), get)).toBeNull()
  })
})

describe('condStyleFor — cell rules', () => {
  test('greaterThan applies bg + legible text', () => {
    const rule: CondFormatRule = { range: R(0, 0, 0, 0), op: 'greaterThan', value1: '5', bgColor: '#000000' }
    const out = condStyleFor([rule], 0, 0, 10)
    expect(out.bgColor).toBe('#000000')
    expect(out.color).toBe('#ffffff') // dark bg → light text
  })
  test('no match → no style', () => {
    const rule: CondFormatRule = { range: R(0, 0, 0, 0), op: 'greaterThan', value1: '50', bgColor: '#000000' }
    expect(condStyleFor([rule], 0, 0, 10)).toEqual({})
  })
})

describe('condStyleFor — color scale', () => {
  const rule: CondFormatRule = { range: R(0, 2, 0, 0), kind: 'colorScale', minColor: '#000000', maxColor: '#ffffff' }
  const stats = new Map([[rule, { min: 0, max: 100 }]])
  test('interpolates by value within range', () => {
    expect(condStyleFor([rule], 0, 0, 0, stats).bgColor).toBe('#000000')
    expect(condStyleFor([rule], 1, 0, 50, stats).bgColor).toBe('#808080')
    expect(condStyleFor([rule], 2, 0, 100, stats).bgColor).toBe('#ffffff')
  })
})

describe('condStyleFor — data bar', () => {
  const rule: CondFormatRule = { range: R(0, 1, 0, 0), kind: 'dataBar', barColor: '#5b9bd5' }
  const stats = new Map([[rule, { min: 0, max: 200 }]])
  test('bar percent is value fraction of range', () => {
    expect(condStyleFor([rule], 0, 0, 50, stats).dataBar).toEqual({ pct: 25, color: '#5b9bd5' })
    expect(condStyleFor([rule], 1, 0, 200, stats).dataBar).toEqual({ pct: 100, color: '#5b9bd5' })
  })
})
