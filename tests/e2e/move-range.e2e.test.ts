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

describe('drag-to-move a cell block', () => {
  test('moveRange moves contents + formats + merge and clears the source', async () => {
    const page = await openApp()
    await page.evaluate(() => {
      const s = (window as any).store.getState()
      s.setCellContent(0, 0, 'a')
      s.setCellContent(0, 1, 'b')
      s.setCellContent(1, 0, 'c')
      s.setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 1, col: 1 } })
      s.applyFormat({ bold: true })
      s.mergeSelection() // A1:B2 merged
      s.moveRange({ top: 0, left: 0, bottom: 1, right: 1 }, { row: 5, col: 5 })
    })
    // Source cleared, destination populated.
    expect(await computed(page, 0, 0)).toBeNull()
    expect(await computed(page, 5, 5)).toBe('a')
    expect(await computed(page, 5, 6)).toBe('b')
    expect(await computed(page, 6, 5)).toBe('c')
    const state = await page.evaluate(() => {
      const s = (window as any).store.getState()
      return {
        srcFmt: s.getFormat(0, 0),
        dstFmt: s.getFormat(5, 5),
        merges: s.activeSheet().merges,
      }
    })
    expect(state.srcFmt).toBeFalsy()
    expect(state.dstFmt).toMatchObject({ bold: true })
    expect(state.merges).toContainEqual({ top: 5, left: 5, bottom: 6, right: 6 })
    await page.close()
  })

  test('formulas that reference the moved cells are adjusted', async () => {
    const page = await openApp()
    await page.evaluate(() => {
      const s = (window as any).store.getState()
      s.setCellContent(0, 0, '10')
      s.setCellContent(0, 2, '=A1') // C1 references A1
      s.moveRange({ top: 0, left: 0, bottom: 0, right: 0 }, { row: 4, col: 0 }) // A1 → A5
    })
    // C1 still resolves to the moved value (reference followed A1 → A5).
    expect(await computed(page, 0, 2)).toBe(10)
    const formula = await page.evaluate(() =>
      (window as any).store.getState().hf.getCellFormula({ sheet: (window as any).store.getState().activeSheetId, row: 0, col: 2 }),
    )
    expect(formula).toBe('=A5')
    await page.close()
  })

  test('dragging the selection border moves the block (mouse)', async () => {
    const page = await openApp()
    await page.evaluate(() => {
      const s = (window as any).store.getState()
      s.setCellContent(0, 0, 'X')
      s.setCellContent(1, 1, 'Y')
      s.setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 1, col: 1 } })
    })
    // Grab the top border strip of the selection and drop onto D4 (row3,col3).
    const strip = await page.locator('.move-edge.top').first().boundingBox()
    const dest = await page.locator('td[data-r="3"][data-c="3"]').boundingBox()
    if (!strip || !dest) throw new Error('missing geometry')
    await page.mouse.move(strip.x + strip.width / 2, strip.y + strip.height / 2)
    await page.mouse.down()
    const tx = dest.x + dest.width / 2
    const ty = dest.y + dest.height / 2
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(
        strip.x + strip.width / 2 + ((tx - (strip.x + strip.width / 2)) * i) / 6,
        strip.y + strip.height / 2 + ((ty - (strip.y + strip.height / 2)) * i) / 6,
      )
    }
    await page.mouse.up()
    // The block (grabbed at its top-left A1) lands with A1 at D4 → X at D4, Y at E5.
    await expect.poll(() => computed(page, 3, 3)).toBe('X')
    expect(await computed(page, 4, 4)).toBe('Y')
    expect(await computed(page, 0, 0)).toBeNull()
    await page.close()
  })
})
