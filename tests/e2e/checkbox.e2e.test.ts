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
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.goto(baseURL)
  await page.waitForFunction(() => typeof (window as any).store?.getState === 'function')
  await page.waitForFunction(() => typeof (window as any).fileIO?.workbookBuffer === 'function')
  await page.waitForSelector('td[data-r="0"][data-c="0"]')
  return page
}

// Make A1:A2 (col 0, rows 0-1) checkbox cells.
async function addCheckboxes(page: Page) {
  await page.evaluate(() => {
    const s = (window as any).store.getState()
    s.setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 1, col: 0 } })
    s.addCheckboxValidation()
  })
}
const computed = (page: Page, r: number, c: number) =>
  page.evaluate(([r, c]) => (window as any).store.getState().getComputed(r, c), [r, c])

describe('checkbox cells', () => {
  test('checkbox validation renders toggles, unchecked by default', async () => {
    const page = await openApp()
    await addCheckboxes(page)
    await page.waitForSelector('td[data-r="0"][data-c="0"] .cell-checkbox')
    expect(await computed(page, 0, 0)).toBe(false)
    const cls = await page.getAttribute('td[data-r="0"][data-c="0"] .cell-checkbox', 'class')
    expect(cls).not.toContain('on')
    await page.close()
  })

  test('clicking a checkbox toggles the cell value to TRUE', async () => {
    const page = await openApp()
    await addCheckboxes(page)
    await page.click('td[data-r="0"][data-c="0"] .cell-checkbox')
    await expect.poll(() => computed(page, 0, 0)).toBe(true)
    await expect
      .poll(() => page.getAttribute('td[data-r="0"][data-c="0"] .cell-checkbox', 'class'))
      .toContain('on')
    // Clicking again toggles back to FALSE.
    await page.click('td[data-r="0"][data-c="0"] .cell-checkbox')
    await expect.poll(() => computed(page, 0, 0)).toBe(false)
    await page.close()
  })

  test('Space toggles the active checkbox cell', async () => {
    const page = await openApp()
    await addCheckboxes(page)
    // Select via the store + focus the persistent cell input, without clicking
    // the checkbox (a click would toggle it).
    await page.evaluate(() =>
      (window as any).store.getState().setSelection({ anchor: { row: 1, col: 0 }, focus: { row: 1, col: 0 } }),
    )
    await page.waitForSelector('td[data-r="1"][data-c="0"] .cell-input')
    await page.locator('td[data-r="1"][data-c="0"] .cell-input').focus()
    await page.keyboard.press('Space')
    await expect.poll(() => computed(page, 1, 0)).toBe(true)
    await page.close()
  })

  test('checkbox TRUE/FALSE values survive an xlsx round-trip as booleans', async () => {
    const page = await openApp()
    await addCheckboxes(page)
    await page.click('td[data-r="0"][data-c="0"] .cell-checkbox') // A1 → TRUE
    await expect.poll(() => computed(page, 0, 0)).toBe(true)
    const values = await page.evaluate(async () => {
      const s = (window as any).store.getState()
      const io = (window as any).fileIO
      const buf = await io.workbookBuffer(s.hf, s.sheets, 'xlsx', s.charts)
      const wb = await io.readWorkbookFile(new File([buf], 'cb.xlsx'))
      return [wb.sheets[0].rows[0][0], wb.sheets[0].rows[1][0]]
    })
    expect(values[0]).toBe(true)
    expect(values[1]).toBe(false)
    await page.close()
  })
})
