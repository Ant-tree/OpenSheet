import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest'
import type { Browser, Page } from 'playwright-core'
import ExcelJS from 'exceljs'
import { launchBrowser } from './browser'

const baseURL = inject('baseURL')
let browser: Browser

beforeAll(async () => {
  browser = await launchBrowser()
})
afterAll(async () => {
  await browser?.close()
})

async function openApp(): Promise<Page> {
  const page = await browser.newPage()
  await page.goto(baseURL)
  await page.waitForFunction(() => typeof (window as any).store?.getState === 'function')
  await page.waitForFunction(() => !!(window as any).fileIO?.buildWorkbook)
  await page.waitForSelector('td[data-r="0"][data-c="0"]')
  return page
}

/** Build an .xlsx export in the app, return its bytes, and re-read with exceljs. */
async function exportFirstCell(page: Page): Promise<ExcelJS.Cell> {
  const bytes = await page.evaluate(() => {
    const st = (window as any).store.getState()
    const wb = (window as any).fileIO.buildWorkbook(st.hf, st.sheets, 'xlsx')
    return wb.xlsx.writeBuffer().then((b: ArrayBuffer) => Array.from(new Uint8Array(b)))
  })
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(bytes))
  return wb.worksheets[0].getCell(1, 1)
}

describe('xlsx export cell types', () => {
  // Regression: HyperFormula's serialized content is always a string, so writing
  // it verbatim exported numbers as text cells (t="s") — Excel/Sheets showed them
  // as plain text and excluded them from formulas. Numbers must stay numeric.
  test('a typed number exports as a numeric cell, not text', async () => {
    const page = await openApp()
    await page.evaluate(() => {
      const s = (window as any).store.getState()
      s.setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } })
      s.setCellContent(0, 0, '7200000')
    })
    await page.click('button[title*="₩"]') // accounting/currency format applied
    const cell = await exportFirstCell(page)
    expect(cell.type).toBe(ExcelJS.ValueType.Number)
    expect(cell.value).toBe(7200000)
    await page.close()
  })

  test('a checkbox TRUE still exports as a boolean', async () => {
    const page = await openApp()
    await page.evaluate(() => {
      const s = (window as any).store.getState()
      s.setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } })
      s.setCellContent(0, 0, 'TRUE')
    })
    const cell = await exportFirstCell(page)
    expect(cell.type).toBe(ExcelJS.ValueType.Boolean)
    expect(cell.value).toBe(true)
    await page.close()
  })

  test('a date (serial + date format) exports as a date cell, not text', async () => {
    // A date is a serial number carrying a date number-format. The same
    // serialized-string bug exported it as text (t="s"), so Excel ignored the
    // format and showed the raw serial. It must stay numeric so the date format
    // applies — exceljs reads such a cell back as a real Date.
    const page = await openApp()
    await page.evaluate(() => {
      const s = (window as any).store.getState()
      s.setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } })
      s.setCellContent(0, 0, '46037') // 2026-01-15 as an Excel serial
      s.applyFormat({ numberFormat: 'm"월" d"일"' })
    })
    const cell = await exportFirstCell(page)
    expect(cell.type).toBe(ExcelJS.ValueType.Date)
    expect(cell.numFmt).toBe('m"월" d"일"')
    await page.close()
  })

  test('genuine text still exports as a string cell', async () => {
    const page = await openApp()
    await page.evaluate(() => {
      const s = (window as any).store.getState()
      s.setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } })
      s.setCellContent(0, 0, 'hello')
    })
    const cell = await exportFirstCell(page)
    expect(cell.type).toBe(ExcelJS.ValueType.String)
    expect(cell.value).toBe('hello')
    await page.close()
  })
})
