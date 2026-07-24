import type { BorderSide } from '../types'
import type { CellFormat } from '../types'
import type { MsgKey } from '../i18n'

/** Visual weight of a border style, used to pick the "winner" on a shared edge. */
export function borderWeight(side: BorderSide | undefined): number {
  if (!side) return 0
  switch (side.style) {
    case 'thick':
    case 'double':
      return 3
    case 'medium':
    case 'mediumDashed':
    case 'mediumDashDot':
    case 'mediumDashDotDot':
    case 'slantDashDot':
      return 2
    default:
      return 1
  }
}

/** Of two borders sharing an edge, return the heavier one (presence beats absence). */
export function strongerBorder(
  a: BorderSide | undefined,
  b: BorderSide | undefined,
): BorderSide | undefined {
  return borderWeight(a) >= borderWeight(b) ? a ?? b : b
}

/** Map an Excel border style + color to a CSS `border` shorthand value. */
export function borderCss(side: BorderSide): string {
  const color = side.color ?? '#000000'
  switch (side.style) {
    case 'thick':
      return `3px solid ${color}`
    case 'double':
      return `3px double ${color}`
    case 'medium':
    case 'slantDashDot':
      return `2px solid ${color}`
    case 'mediumDashed':
    case 'mediumDashDot':
    case 'mediumDashDotDot':
      return `2px dashed ${color}`
    case 'dotted':
      return `1px dotted ${color}`
    case 'dashed':
    case 'dashDot':
    case 'dashDotDot':
      return `1px dashed ${color}`
    default: // thin, hair, and anything unrecognized
      return `1px solid ${color}`
  }
}

const CURRENCY_RE = /[₩$€£¥]/

/** Strip Excel format noise (colors, conditions, quoted literals, padding). */
function cleanFormatSection(section: string): string {
  return section
    .replace(/\[[^\]]*\]/g, '') // [Red], [$-409], [>0] conditions
    .replace(/"[^"]*"/g, '') // quoted literals
    .replace(/\\./g, '') // escaped chars
    .replace(/_./g, '') // padding (_x reserves a char-width)
    .replace(/\*./g, '') // fill (*x)
}

function decimalsOf(section: string): number {
  const cleaned = cleanFormatSection(section)
  const dot = cleaned.indexOf('.')
  return dot === -1 ? 0 : (cleaned.slice(dot + 1).match(/[0#]/g) || []).length
}

/**
 * A pragmatic number-format implementation covering the presets exposed in the
 * toolbar plus the real Excel format codes found in workbooks (accounting/
 * currency formats with quoted symbols, multi-section codes, date literals).
 * Not a full format-code engine, but handles the common cases faithfully.
 */
export function formatNumber(value: number, token: string | undefined): string {
  if (token === undefined || token === '' || token === 'General') {
    return String(value)
  }

  // Excel codes have up to four sections: positive;negative;zero;text. Use the
  // negative/zero section when present (it carries its own sign), else derive
  // the sign ourselves from the positive section.
  const parts = token.split(';')
  let section: string
  let autoSign = ''
  if (value < 0 && parts.length > 1) section = parts[1]
  else if (value === 0 && parts.length > 2) section = parts[2]
  else {
    section = parts[0]
    autoSign = value < 0 ? '-' : ''
  }

  const cleaned = cleanFormatSection(section)
  // Date/time codes contain y/m/d/h/s and no numeric placeholders.
  if (/[ymdhs]/i.test(cleaned) && !/[#0]/.test(cleaned)) {
    return formatDate(value, section)
  }

  const isPercent = cleaned.includes('%')

  // Walk the section, splitting literals (quoted / escaped / symbols) from the
  // numeric placeholder run (# 0 , .). Literals before the run become the
  // prefix, after it the suffix — so `#,##0 "kg"` → `1,234 kg`, `₩#,##0` →
  // `₩1,234`, `$0.00` → `$1.23`.
  const body = section.replace(/\[[^\]]*\]/g, '').replace(/[_*]./g, '')
  let prefix = ''
  let suffix = ''
  let core = ''
  let seenCore = false
  const lit = (s: string) => {
    if (seenCore) suffix += s
    else prefix += s
  }
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch === '"') {
      const end = body.indexOf('"', i + 1)
      lit(body.slice(i + 1, end < 0 ? body.length : end))
      i = end < 0 ? body.length : end
    } else if (ch === '\\') {
      lit(body[i + 1] ?? '')
      i++
    } else if (ch === '#' || ch === '0' || ch === ',' || ch === '.') {
      core += ch
      seenCore = true
    } else if (ch !== '%' || !isPercent) {
      // Any other char is a literal (currency symbols, spaces, text). A `%` that
      // drives percent mode is emitted below; a stray `%` prints literally.
      lit(ch)
    } else {
      lit('%') // the percent sign shows in place
    }
  }

  let n = value
  if (isPercent) n = n * 100

  const decimals = decimalsOf(core || section)
  let out = Math.abs(n).toFixed(decimals)
  if (core.includes(',')) {
    const [intPart, fracPart] = out.split('.')
    const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    out = fracPart ? `${withSep}.${fracPart}` : withSep
  }

  return `${autoSign}${prefix}${out}${suffix}`
}

function currentDecimals(token?: string): number {
  if (!token || token === 'General') return 0
  return decimalsOf(token.split(';')[0])
}

/** Build a number format with `n` decimals, preserving currency/percent/thousands. */
export function withDecimals(token: string | undefined, n: number): string {
  const clamped = Math.max(0, Math.min(n, 10))
  const t = token && token !== 'General' ? token : ''
  const currency = CURRENCY_RE.exec(t)?.[0] ?? ''
  const percent = t.includes('%')
  const thousands = t.includes(',') || currency !== ''
  const intPart = thousands ? '#,##0' : '0'
  const frac = clamped > 0 ? '.' + '0'.repeat(clamped) : ''
  return `${currency}${intPart}${frac}${percent ? '%' : ''}` || 'General'
}

export const increaseDecimals = (token?: string) => withDecimals(token, currentDecimals(token) + 1)
export const decreaseDecimals = (token?: string) => withDecimals(token, currentDecimals(token) - 1)

/** Apply a currency format, keeping the current decimal count. */
export function asCurrency(token?: string): string {
  const d = currentDecimals(token)
  return `₩#,##0${d > 0 ? '.' + '0'.repeat(d) : ''}`
}

export function asCurrencyUsd(token?: string): string {
  const d = currentDecimals(token)
  return `$#,##0${d > 0 ? '.' + '0'.repeat(d) : ''}`
}

/** Apply a percent format, keeping the current decimal count. */
export function asPercent(token?: string): string {
  const d = currentDecimals(token)
  return `0${d > 0 ? '.' + '0'.repeat(d) : ''}%`
}

/** Classify any Excel format code into the closest toolbar preset token. */
export function toPresetToken(code: string | undefined): string {
  if (!code || code === 'General') return 'General'
  if (NUMBER_FORMAT_PRESETS.some((p) => p.token === code)) return code

  const section = code.split(';')[0]
  const cleaned = cleanFormatSection(section)
  if (/[ymdhs]/i.test(cleaned) && !/[#0]/.test(cleaned)) return 'yyyy-mm-dd'
  if (code.includes('₩')) return '₩#,##0'
  if (/[$€£¥]/.test(code)) return '$#,##0.00'
  if (section.includes('%')) return decimalsOf(section) >= 2 ? '0.00%' : '0%'
  if (/[#0]/.test(cleaned)) return decimalsOf(section) >= 1 ? '#,##0.00' : '#,##0'
  return 'General'
}

const DAY_MS = 24 * 60 * 60 * 1000
// Excel's epoch is 1899-12-30 (accounting for the 1900 leap-year bug).
const EXCEL_EPOCH = Date.UTC(1899, 11, 30)

function excelSerialToDate(serial: number): Date {
  return new Date(EXCEL_EPOCH + serial * DAY_MS)
}

/**
 * Render an Excel date/time code (e.g. `yyyy-mm-dd`, `m"월" d"일"`). Walks the
 * token so quoted literals are preserved and single-letter tokens (m, d) work.
 * `m` is treated as month (minutes are rarely needed in this app).
 */
function formatDate(serial: number, token: string): string {
  const d = excelSerialToDate(serial)
  const pad = (x: number) => String(x).padStart(2, '0')
  const Y = d.getUTCFullYear()
  const parts: Array<[RegExp, string]> = [
    [/^yyyy/i, String(Y)],
    [/^yy/i, String(Y).slice(-2)],
    [/^mm/i, pad(d.getUTCMonth() + 1)],
    [/^m/i, String(d.getUTCMonth() + 1)],
    [/^dd/i, pad(d.getUTCDate())],
    [/^d/i, String(d.getUTCDate())],
    [/^hh/i, pad(d.getUTCHours())],
    [/^h/i, String(d.getUTCHours())],
    [/^ss/i, pad(d.getUTCSeconds())],
    [/^s/i, String(d.getUTCSeconds())],
  ]
  let out = ''
  let i = 0
  while (i < token.length) {
    if (token[i] === '"') {
      const end = token.indexOf('"', i + 1)
      out += token.slice(i + 1, end < 0 ? token.length : end)
      i = end < 0 ? token.length : end + 1
      continue
    }
    if (token[i] === '\\') {
      out += token[i + 1] ?? ''
      i += 2
      continue
    }
    const rest = token.slice(i)
    const hit = parts.find(([re]) => re.test(rest))
    if (hit) {
      out += hit[1]
      i += hit[0].exec(rest)![0].length
    } else {
      out += token[i]
      i += 1
    }
  }
  return out
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

export const NUMBER_FORMAT_PRESETS: { labelKey: MsgKey; token: string }[] = [
  { labelKey: 'fmtGeneral', token: 'General' },
  { labelKey: 'fmtNumber', token: '#,##0' },
  { labelKey: 'fmtDecimal', token: '#,##0.00' },
  { labelKey: 'fmtPercent', token: '0%' },
  { labelKey: 'fmtPercent2', token: '0.00%' },
  { labelKey: 'fmtCurrencyUsd', token: '$#,##0.00' },
  { labelKey: 'fmtCurrencyKrw', token: '₩#,##0' },
  { labelKey: 'fmtDate', token: 'yyyy-mm-dd' },
]
