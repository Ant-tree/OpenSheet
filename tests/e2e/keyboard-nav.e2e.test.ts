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

const sel = (page: Page) => page.evaluate(() => (window as any).store.getState().selection)
async function focusCell(page: Page, r: number, c: number) {
  await page.evaluate(([r, c]) => (window as any).store.getState().setSelection({ anchor: { row: r, col: c }, focus: { row: r, col: c } }), [r, c])
  await page.waitForSelector(`td[data-r="${r}"][data-c="${c}"] .cell-input`)
  await page.locator(`td[data-r="${r}"][data-c="${c}"] .cell-input`).focus()
}

describe('keyboard power-user navigation', () => {
  test('Ctrl+ArrowDown jumps to the bottom of the data block', async () => {
    const page = await openApp()
    // A1:A4 filled, then a gap.
    await page.evaluate(() => {
      const s = (window as any).store.getState()
      for (let r = 0; r < 4; r++) s.setCellContent(r, 0, String(r + 1))
    })
    await focusCell(page, 0, 0)
    await page.keyboard.press('Control+ArrowDown')
    await expect.poll(async () => (await sel(page)).focus.row).toBe(3) // last filled row (A4)
    await page.close()
  })

  test('Ctrl+A selects the used range', async () => {
    const page = await openApp()
    await page.evaluate(() => {
      const s = (window as any).store.getState()
      s.setCellContent(0, 0, 'a')
      s.setCellContent(2, 3, 'b') // used range spans rows 0-2, cols 0-3
    })
    await focusCell(page, 0, 0)
    await page.keyboard.press('Control+a')
    const s = await sel(page)
    expect(s.anchor).toEqual({ row: 0, col: 0 })
    expect(s.focus.row).toBeGreaterThanOrEqual(2)
    expect(s.focus.col).toBeGreaterThanOrEqual(3)
    await page.close()
  })

  test('Ctrl+Space selects the whole column, Shift+Space the whole row', async () => {
    const page = await openApp()
    await focusCell(page, 2, 1) // B3
    await page.keyboard.press('Control+Space')
    let s = await sel(page)
    expect(s.anchor.col).toBe(1)
    expect(s.focus.col).toBe(1)
    expect(s.focus.row).toBeGreaterThan(1000) // spans the column

    await focusCell(page, 2, 1)
    await page.keyboard.press('Shift+Space')
    s = await sel(page)
    expect(s.anchor.row).toBe(2)
    expect(s.focus.row).toBe(2)
    expect(s.focus.col).toBeGreaterThan(50) // spans the row
    await page.close()
  })
})
