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

const selectCell = (page: Page, r: number, c: number) =>
  page.evaluate(
    ([r, c]) => (window as any).store.getState().setSelection({ anchor: { row: r, col: c }, focus: { row: r, col: c } }),
    [r, c],
  )
const getFormat = (page: Page, r: number, c: number) =>
  page.evaluate(([r, c]) => (window as any).store.getState().getFormat(r, c) ?? null, [r, c])
const cellHeight = async (page: Page, r: number, c: number) =>
  (await page.locator(`td[data-r="${r}"][data-c="${c}"]`).boundingBox())?.height ?? 0

describe('font size & strikethrough', () => {
  test('toolbar strikethrough button applies line-through', async () => {
    const page = await openApp()
    await selectCell(page, 0, 0)
    await page.evaluate(() => (window as any).store.getState().setCellContent(0, 0, 'struck'))
    await page.click('button[title="Strikethrough"]')
    expect(await getFormat(page, 0, 0)).toMatchObject({ strike: true })
    const deco = await page.evaluate(() => {
      const el = document.querySelector('td[data-r="0"][data-c="0"]') as HTMLElement
      return getComputedStyle(el).textDecorationLine
    })
    expect(deco).toContain('line-through')
    await page.close()
  })

  test('font-size select enlarges the text and grows the row', async () => {
    const page = await openApp()
    await selectCell(page, 0, 0)
    await page.evaluate(() => (window as any).store.getState().setCellContent(0, 0, 'big'))
    const before = await cellHeight(page, 5, 0) // an untouched row
    await page.selectOption('.fontsize-select', '32')
    expect(await getFormat(page, 0, 0)).toMatchObject({ fontSize: 32 })
    // The row with the 32px cell is now clearly taller than a default row.
    await expect.poll(() => cellHeight(page, 0, 0)).toBeGreaterThan(before * 1.4)
    await page.close()
  })

  test('font size & strikethrough survive an xlsx round-trip (Excel compatible)', async () => {
    const page = await openApp()
    await selectCell(page, 1, 1)
    await page.evaluate(() => {
      const s = (window as any).store.getState()
      s.setCellContent(1, 1, 'hi')
      s.applyFormat({ bold: true, strike: true, fontSize: 20 })
    })
    const reimported = await page.evaluate(async () => {
      const s = (window as any).store.getState()
      const io = (window as any).fileIO
      const buf = await io.workbookBuffer(s.hf, s.sheets, 'xlsx', s.charts)
      const wb = await io.readWorkbookFile(new File([buf], 'roundtrip.xlsx'))
      return wb.sheets[0].formats['1,1'] ?? null
    })
    expect(reimported).toMatchObject({ bold: true, strike: true })
    // pt rounding: 20px → 15pt → 20px back.
    expect(reimported.fontSize).toBeGreaterThanOrEqual(19)
    expect(reimported.fontSize).toBeLessThanOrEqual(21)
    await page.close()
  })
})
