import type { CellFormat } from '../types'

/**
 * A small, pragmatic number-format implementation covering the presets exposed
 * in the toolbar. It is not a full Excel format-code parser, but handles the
 * common cases: thousands separators, fixed decimals, percent, currency, and
 * a couple of date formats.
 */
export function formatNumber(value: number, token: string | undefined): string {
  if (token === undefined || token === '' || token === 'General') {
    return String(value)
  }

  // Date tokens (very small subset).
  if (/[ymdhs]/i.test(token) && !/[#0]/.test(token)) {
    return formatDate(value, token)
  }

  const isPercent = token.includes('%')
  const isCurrency = token.includes('$') || token.includes('₩')
  const hasThousands = token.includes(',')

  let n = value
  if (isPercent) n = n * 100

  // Count decimals from the token (digits after the dot).
  const dotIdx = token.indexOf('.')
  let decimals = 0
  if (dotIdx !== -1) {
    const frac = token.slice(dotIdx + 1)
    decimals = (frac.match(/[0#]/g) || []).length
  }

  let out = Math.abs(n).toFixed(decimals)

  if (hasThousands) {
    const [intPart, fracPart] = out.split('.')
    const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    out = fracPart ? `${withSep}.${fracPart}` : withSep
  }

  const sign = n < 0 ? '-' : ''
  const symbol = isCurrency ? (token.includes('₩') ? '₩' : '$') : ''
  const suffix = isPercent ? '%' : ''

  return `${sign}${symbol}${out}${suffix}`
}

const DAY_MS = 24 * 60 * 60 * 1000
// Excel's epoch is 1899-12-30 (accounting for the 1900 leap-year bug).
const EXCEL_EPOCH = Date.UTC(1899, 11, 30)

function excelSerialToDate(serial: number): Date {
  return new Date(EXCEL_EPOCH + serial * DAY_MS)
}

function formatDate(serial: number, token: string): string {
  const d = excelSerialToDate(serial)
  const pad = (x: number) => String(x).padStart(2, '0')
  return token
    .replace(/yyyy/gi, String(d.getUTCFullYear()))
    .replace(/yy/gi, String(d.getUTCFullYear()).slice(-2))
    .replace(/mm/g, pad(d.getUTCMonth() + 1))
    .replace(/dd/gi, pad(d.getUTCDate()))
    .replace(/hh/gi, pad(d.getUTCHours()))
    .replace(/ss/gi, pad(d.getUTCSeconds()))
}

/** Turn a computed HyperFormula value into the string shown in a cell. */
export function displayValue(value: unknown, fmt: CellFormat | undefined): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    // HyperFormula error objects have a `.value` like "#DIV/0!".
    const maybe = value as { value?: string; type?: string }
    return maybe.value ?? maybe.type ?? String(value)
  }
  if (typeof value === 'number') {
    return formatNumber(value, fmt?.numberFormat)
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  return String(value)
}

export const NUMBER_FORMAT_PRESETS: { label: string; token: string }[] = [
  { label: '일반', token: 'General' },
  { label: '숫자 (1,234)', token: '#,##0' },
  { label: '소수 (1,234.00)', token: '#,##0.00' },
  { label: '백분율 (12%)', token: '0%' },
  { label: '백분율 (12.00%)', token: '0.00%' },
  { label: '통화 ($)', token: '$#,##0.00' },
  { label: '통화 (₩)', token: '₩#,##0' },
  { label: '날짜 (2024-01-31)', token: 'yyyy-mm-dd' },
]
