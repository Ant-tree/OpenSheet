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
  await page.waitForFunction(() => typeof (window as any).fileIO?.workbookBuffer === 'function')
  await page.waitForSelector('td[data-r="0"][data-c="0"]')
  return page
}

async function select(page: Page, top: number, left: number, bottom: number, right: number) {
  await page.evaluate(([t, l, b, r]) => {
    ;(window as any).store.getState().setSelection({ anchor: { row: t, col: l }, focus: { row: b, col: r } })
  }, [top, left, bottom, right])
}

describe('hide / unhide rows and columns', () => {
  test('hiding a column removes it from the grid; unhide restores it', async () => {
    const page = await openApp()
    // Column C (index 2) is present initially.
    expect(await page.locator('td[data-r="0"][data-c="2"]').count()).toBe(1)

    await select(page, 0, 2, 0, 2)
    await page.evaluate(() => (window as any).store.getState().hideCols())
    await page.waitForFunction(() => document.querySelectorAll('td[data-r="0"][data-c="2"]').length === 0)
    // Neighbours still render (B and D).
    expect(await page.locator('td[data-r="0"][data-c="1"]').count()).toBe(1)
    expect(await page.locator('td[data-r="0"][data-c="3"]').count()).toBe(1)

    // Unhide: select the surrounding span so the hidden column falls inside it.
    await select(page, 0, 1, 0, 3)
    await page.evaluate(() => (window as any).store.getState().unhideCols())
    await page.waitForFunction(() => document.querySelectorAll('td[data-r="0"][data-c="2"]').length === 1)
    await page.close()
  })

  test('hiding a row removes it from the grid; unhide restores it', async () => {
    const page = await openApp()
    expect(await page.locator('td[data-r="2"][data-c="0"]').count()).toBe(1)

    await select(page, 2, 0, 2, 0)
    await page.evaluate(() => (window as any).store.getState().hideRows())
    await page.waitForFunction(() => document.querySelectorAll('td[data-r="2"][data-c="0"]').length === 0)
    // Neighbouring rows still render.
    expect(await page.locator('td[data-r="1"][data-c="0"]').count()).toBe(1)
    expect(await page.locator('td[data-r="3"][data-c="0"]').count()).toBe(1)

    await select(page, 1, 0, 3, 0)
    await page.evaluate(() => (window as any).store.getState().unhideRows())
    await page.waitForFunction(() => document.querySelectorAll('td[data-r="2"][data-c="0"]').length === 1)
    await page.close()
  })

  test('hidden rows and columns survive an xlsx round-trip', async () => {
    const page = await openApp()
    // Fill a 5x5 block so the columns/rows exist in the exported workbook.
    await page.evaluate(() => {
      const s = (window as any).store.getState()
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) s.setCellContent(r, c, `${r}-${c}`)
    })
    await select(page, 0, 1, 0, 1) // column B
    await page.evaluate(() => (window as any).store.getState().hideCols())
    await select(page, 3, 0, 3, 0) // row 4
    await page.evaluate(() => (window as any).store.getState().hideRows())

    const result = await page.evaluate(async () => {
      const s = (window as any).store.getState()
      const io = (window as any).fileIO
      const buf = await io.workbookBuffer(s.hf, s.sheets, 'xlsx', s.charts)
      const wb = await io.readWorkbookFile(new File([buf], 'roundtrip.xlsx'))
      return { hiddenRows: wb.sheets[0].hiddenRows ?? [], hiddenCols: wb.sheets[0].hiddenCols ?? [] }
    })
    expect(result.hiddenCols).toContain(1)
    expect(result.hiddenRows).toContain(3)
    await page.close()
  })
})
