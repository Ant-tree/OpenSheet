// Formula editing helpers: function-name completion + argument hints.
// Function names come from the live HyperFormula instance so they always match
// what the engine actually supports; argument signatures are a curated set for
// the most common functions (shown as an inline hint, best-effort).
import { useStore } from '../store/useStore'

let cachedNames: string[] | null = null

/** All function names registered in the engine (uppercase, sorted). */
export function functionNames(): string[] {
  if (cachedNames) return cachedNames
  try {
    const hf = useStore.getState().hf
    cachedNames = hf
      .getRegisteredFunctionNames()
      .map((n) => n.toUpperCase())
      .sort()
  } catch {
    cachedNames = []
  }
  return cachedNames
}

const NAME_CHAR = /[A-Za-z0-9_.]/

/**
 * The function-name token being typed at the caret, or null. Only returns a
 * token inside a formula (value starts with `=`) that sits right after a
 * delimiter (`=`, `(`, `,`, an operator or whitespace) — i.e. a spot where a
 * function call is valid.
 */
export function funcTokenAt(value: string, caret: number): { word: string; start: number } | null {
  if (!value.startsWith('=')) return null
  let i = caret
  while (i > 0 && NAME_CHAR.test(value[i - 1])) i--
  const word = value.slice(i, caret)
  if (!word || !/^[A-Za-z]/.test(word)) return null
  if (i === 0) return null // the char at 0 is '=', so a token must start at >=1
  const prev = value[i - 1]
  if (!/[=(,:+\-*/^&<>=% ]/.test(prev)) return null
  return { word, start: i }
}

/**
 * Function names starting with `prefix` (case-insensitive), capped at `limit`.
 * Ranked shortest-first then alphabetically, so common short names (SUM, IF)
 * outrank longer ones that share the prefix (SUMPRODUCT, SUBSTITUTE).
 */
export function matchFunctions(prefix: string, limit = 8): string[] {
  if (!prefix) return []
  const p = prefix.toUpperCase()
  const matches = functionNames().filter((n) => n.startsWith(p))
  matches.sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))
  return matches.slice(0, limit)
}

/**
 * Name of the innermost unclosed function call at the caret (uppercase), or
 * null — used to show that function's argument hint while typing its args.
 */
export function openCallName(value: string, caret: number): string | null {
  if (!value.startsWith('=')) return null
  let depth = 0
  for (let i = caret - 1; i >= 0; i--) {
    const ch = value[i]
    if (ch === ')') depth++
    else if (ch === '(') {
      if (depth === 0) {
        let j = i
        while (j > 0 && NAME_CHAR.test(value[j - 1])) j--
        const name = value.slice(j, i)
        return name ? name.toUpperCase() : null
      }
      depth--
    }
  }
  return null
}

/** Curated argument signatures for common functions (shown as an inline hint). */
export const SIGNATURES: Record<string, string> = {
  SUM: 'SUM(number1, [number2], …)',
  SUMIF: 'SUMIF(range, criterion, [sum_range])',
  SUMIFS: 'SUMIFS(sum_range, range1, criterion1, …)',
  AVERAGE: 'AVERAGE(number1, [number2], …)',
  AVERAGEIF: 'AVERAGEIF(range, criterion, [average_range])',
  COUNT: 'COUNT(value1, [value2], …)',
  COUNTA: 'COUNTA(value1, [value2], …)',
  COUNTIF: 'COUNTIF(range, criterion)',
  COUNTIFS: 'COUNTIFS(range1, criterion1, …)',
  MAX: 'MAX(number1, [number2], …)',
  MIN: 'MIN(number1, [number2], …)',
  MEDIAN: 'MEDIAN(number1, [number2], …)',
  ROUND: 'ROUND(value, [places])',
  ROUNDUP: 'ROUNDUP(value, [places])',
  ROUNDDOWN: 'ROUNDDOWN(value, [places])',
  ABS: 'ABS(value)',
  INT: 'INT(value)',
  MOD: 'MOD(dividend, divisor)',
  POWER: 'POWER(base, exponent)',
  SQRT: 'SQRT(value)',
  IF: 'IF(logical_test, value_if_true, [value_if_false])',
  IFS: 'IFS(condition1, value1, [condition2, value2], …)',
  IFERROR: 'IFERROR(value, value_if_error)',
  IFNA: 'IFNA(value, value_if_na)',
  AND: 'AND(logical1, [logical2], …)',
  OR: 'OR(logical1, [logical2], …)',
  NOT: 'NOT(logical)',
  SWITCH: 'SWITCH(expression, case1, value1, …, [default])',
  VLOOKUP: 'VLOOKUP(search_key, range, index, [is_sorted])',
  HLOOKUP: 'HLOOKUP(search_key, range, index, [is_sorted])',
  LOOKUP: 'LOOKUP(search_key, search_range, [result_range])',
  INDEX: 'INDEX(reference, row, [column])',
  MATCH: 'MATCH(search_key, range, [search_type])',
  CONCATENATE: 'CONCATENATE(string1, [string2], …)',
  CONCAT: 'CONCAT(string1, [string2], …)',
  TEXTJOIN: 'TEXTJOIN(delimiter, ignore_empty, text1, …)',
  LEFT: 'LEFT(text, [number_of_characters])',
  RIGHT: 'RIGHT(text, [number_of_characters])',
  MID: 'MID(text, starting_at, extract_length)',
  LEN: 'LEN(text)',
  TRIM: 'TRIM(text)',
  UPPER: 'UPPER(text)',
  LOWER: 'LOWER(text)',
  SUBSTITUTE: 'SUBSTITUTE(text, search_for, replace_with, [occurrence])',
  REPLACE: 'REPLACE(text, position, length, new_text)',
  FIND: 'FIND(search_for, text_to_search, [starting_at])',
  SEARCH: 'SEARCH(search_for, text_to_search, [starting_at])',
  DATE: 'DATE(year, month, day)',
  TODAY: 'TODAY()',
  NOW: 'NOW()',
  YEAR: 'YEAR(date)',
  MONTH: 'MONTH(date)',
  DAY: 'DAY(date)',
  EOMONTH: 'EOMONTH(start_date, months)',
  DATEDIF: 'DATEDIF(start_date, end_date, unit)',
}

/** The argument hint string for the call the caret sits inside, or null. */
export function argHint(value: string, caret: number): string | null {
  const name = openCallName(value, caret)
  return name ? SIGNATURES[name] ?? null : null
}
