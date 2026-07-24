import { describe, expect, test } from 'vitest'
import {
  formatNumber,
  asCurrency,
  asCurrencyUsd,
  asPercent,
  increaseDecimals,
  decreaseDecimals,
} from '../../src/lib/format'

describe('formatNumber — built-in presets (must not regress)', () => {
  test('number / decimal / thousands', () => {
    expect(formatNumber(1234, '#,##0')).toBe('1,234')
    expect(formatNumber(1234.5, '#,##0.00')).toBe('1,234.50')
    expect(formatNumber(1234567, '#,##0')).toBe('1,234,567')
  })
  test('negative gets a sign from the positive section', () => {
    expect(formatNumber(-1234, '#,##0')).toBe('-1,234')
  })
  test('percent multiplies by 100', () => {
    expect(formatNumber(0.5, '0%')).toBe('50%')
    expect(formatNumber(0.5, '0.00%')).toBe('50.00%')
  })
  test('currency symbol is a prefix literal', () => {
    expect(formatNumber(1234, '₩#,##0')).toBe('₩1,234')
    expect(formatNumber(1234, '$#,##0.00')).toBe('$1,234.00')
  })
  test('General / empty passes through', () => {
    expect(formatNumber(1234, 'General')).toBe('1234')
    expect(formatNumber(1234, undefined)).toBe('1234')
  })
})

describe('formatNumber — custom literals', () => {
  test('trailing quoted literal (unit suffix)', () => {
    expect(formatNumber(1234, '#,##0 "kg"')).toBe('1,234 kg')
  })
  test('leading quoted literal', () => {
    expect(formatNumber(1234, '"USD "#,##0')).toBe('USD 1,234')
  })
  test('escaped literal char', () => {
    expect(formatNumber(5, '0\\x')).toBe('5x')
  })
  test('a quoted percent sign is literal (no ×100)', () => {
    expect(formatNumber(50, '0"%"')).toBe('50%')
  })
})

describe('decimal helpers keep the format family', () => {
  test('asCurrency / asCurrencyUsd / asPercent', () => {
    expect(asCurrency(undefined)).toBe('₩#,##0')
    expect(asCurrencyUsd(undefined)).toBe('$#,##0')
    expect(asPercent(undefined)).toBe('0%')
  })
  test('increase/decrease decimals', () => {
    expect(increaseDecimals('#,##0')).toBe('#,##0.0')
    expect(decreaseDecimals('#,##0.00')).toBe('#,##0.0')
  })
})
