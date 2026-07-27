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

/** The text rendered in the grid for a cell (full display path, not just the fn). */
async function cellText(page: Page, r: number, c: number): Promise<string> {
  await page.evaluate(
    ([r, c]) =>
      (window as any).store
        .getState()
        .setSelection({ anchor: { row: r, col: c }, focus: { row: r, col: c } }),
    [r, c],
  )
  return (await page.locator(`td[data-r="${r}"][data-c="${c}"]`).innerText()).trim()
}

describe('zero never renders as "-0" in the grid', () => {
  test('0 and tiny negatives under a negative-section currency format show ₩0', async () => {
    const page = await openApp()
    await page.evaluate(() => {
      const s = (window as any).store.getState()
      const fmt = '₩#,##0;₩-#,##0' // imported-style code with a negative section
      s.setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 3, col: 0 } })
      s.applyFormat({ numberFormat: fmt })
      s.setCellContent(0, 0, '0')
      s.setCellContent(1, 0, '=1-1')
      s.setCellContent(2, 0, '=-0.0000001')
      s.setCellContent(3, 0, '=0.3-0.6-0.3+0.6') // float residue near 0
    })
    expect(await cellText(page, 0, 0)).toBe('₩0')
    expect(await cellText(page, 1, 0)).toBe('₩0')
    expect(await cellText(page, 2, 0)).toBe('₩0')
    expect(await cellText(page, 3, 0)).toBe('₩0')
    // A genuine negative still shows its sign.
    await page.evaluate(() => (window as any).store.getState().setCellContent(3, 0, '-5'))
    expect(await cellText(page, 3, 0)).toBe('₩-5')
    await page.close()
  })

  test('accounting format renders zero as the dash section, not ₩-0', async () => {
    const page = await openApp()
    await page.evaluate(() => {
      const s = (window as any).store.getState()
      // Excel's KRW accounting code: zero section is a dash literal, no digits.
      const fmt = '_-₩* #,##0_-;-₩* #,##0_-;_-₩* "-"_-;_-@_-'
      s.setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 1, col: 0 } })
      s.applyFormat({ numberFormat: fmt })
      s.setCellContent(0, 0, '=47-47') // computes 0, like the user's =H47+H48
      s.setCellContent(1, 0, '123456')
    })
    expect(await cellText(page, 0, 0)).toBe('₩-') // the dash, never "₩-0"
    expect(await cellText(page, 1, 0)).toBe('₩123,456')
    await page.close()
  })
})
