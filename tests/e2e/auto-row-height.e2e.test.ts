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
  await page.setViewportSize({ width: 1100, height: 800 })
  await page.goto(baseURL)
  await page.waitForFunction(() => typeof (window as any).store?.getState === 'function')
  await page.waitForSelector('td[data-r="0"][data-c="0"]')
  return page
}

function selectCell(page: Page, row: number, col: number) {
  return page.evaluate(
    ([r, c]) =>
      (window as any).store.getState().setSelection({
        anchor: { row: r, col: c },
        focus: { row: r, col: c },
      }),
    [row, col],
  )
}

const LONG =
  'The quick brown fox jumps over the lazy dog several times, over and over, without stopping.'

async function cellHeight(page: Page, row: number, col: number): Promise<number> {
  const box = await page.locator(`td[data-r="${row}"][data-c="${col}"]`).boundingBox()
  return box?.height ?? 0
}

describe('auto row height (wrap)', () => {
  test('a wrapped long-text row grows taller than a plain row', async () => {
    const page = await openApp()
    const plainHeight = await cellHeight(page, 5, 0)

    await selectCell(page, 0, 0)
    await page.evaluate((text) => {
      const s = (window as any).store.getState()
      s.setCellContent(0, 0, text)
      s.applyFormat({ wrap: true })
    }, LONG)

    await expect.poll(() => cellHeight(page, 0, 0)).toBeGreaterThan(plainHeight * 1.8)
    // A different, untouched row keeps the default height.
    expect(await cellHeight(page, 5, 0)).toBeCloseTo(plainHeight, 0)
    await page.close()
  })

  test('removing wrap collapses the row back to default', async () => {
    const page = await openApp()
    const plainHeight = await cellHeight(page, 3, 0)
    await selectCell(page, 0, 0)
    await page.evaluate((text) => {
      const s = (window as any).store.getState()
      s.setCellContent(0, 0, text)
      s.applyFormat({ wrap: true })
    }, LONG)
    await expect.poll(() => cellHeight(page, 0, 0)).toBeGreaterThan(plainHeight * 1.8)

    await selectCell(page, 0, 0)
    await page.evaluate(() => (window as any).store.getState().applyFormat({ wrap: false }))
    await expect.poll(() => cellHeight(page, 0, 0)).toBeCloseTo(plainHeight, 0)
    await page.close()
  })

  test('rows below a tall wrapped row remain correctly clickable (windowing)', async () => {
    const page = await openApp()
    await selectCell(page, 0, 0)
    await page.evaluate((text) => {
      const s = (window as any).store.getState()
      s.setCellContent(0, 0, text)
      s.applyFormat({ wrap: true })
    }, LONG)
    await expect.poll(() => cellHeight(page, 0, 0)).toBeGreaterThan(40)

    // Clicking a lower row selects exactly that row (offsets stay consistent).
    await page.click('td[data-r="8"][data-c="1"]')
    const focus = await page.evaluate(() => (window as any).store.getState().selection.focus)
    expect(focus).toEqual({ row: 8, col: 1 })
    await page.close()
  })
})
