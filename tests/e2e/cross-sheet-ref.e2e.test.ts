import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest'
import type { Browser, Page } from 'playwright-core'
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
  await page.waitForSelector('td[data-r="0"][data-c="0"]')
  return page
}

const computed = (page: Page, r: number, c: number) =>
  page.evaluate(([r, c]) => (window as any).store.getState().getComputed(r, c), [r, c])

describe('cross-sheet references', () => {
  test("='6월'!E5 resolves across sheets (typed in the editor)", async () => {
    const page = await openApp()
    await page.evaluate(() => {
      const s = (window as any).store.getState()
      s.renameSheet(s.activeSheetId, '6월')
      s.setCellContent(4, 4, '42') // E5 on sheet 6월
      s.addSheet() // Sheet2 becomes active
    })
    // Type the formula through the real cell editor (exercises autocomplete path).
    await page.evaluate(() =>
      (window as any).store
        .getState()
        .setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } }),
    )
    await page.locator('td[data-r="0"][data-c="0"] .cell-input').focus()
    await page.keyboard.type("='6월'!E5")
    await page.keyboard.press('Enter')
    await expect.poll(() => computed(page, 0, 0)).toBe(42)
    await page.close()
  })

  test('smart/curly quotes from mobile keyboards are normalized', async () => {
    const page = await openApp()
    const result = await page.evaluate(() => {
      const s = (window as any).store.getState()
      s.renameSheet(s.activeSheetId, '6월')
      s.setCellContent(4, 4, '7')
      s.addSheet()
      // Curly single quotes (U+2018 / U+2019) as a phone would auto-insert.
      s.setCellContent(0, 0, '=‘6월’!E5')
      return s.getComputed(0, 0)
    })
    expect(result).toBe(7)
    await page.close()
  })
})
