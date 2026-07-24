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

async function fillColumn(page: Page) {
  await page.evaluate(() => {
    const s = (window as any).store.getState()
    const vals = [3, 7, 2, 9, 5]
    for (let r = 0; r < vals.length; r++) s.setCellContent(r, 0, String(vals[r]))
    s.setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 4, col: 0 } })
  })
}

describe('sparklines', () => {
  test('a line sparkline is placed just below a column range', async () => {
    const page = await openApp()
    await fillColumn(page)
    await page.evaluate(() => (window as any).store.getState().addSparkline('line'))
    // A1:A5 → target A6 (row 5, col 0).
    await page.waitForSelector('td[data-r="5"][data-c="0"] svg.sparkline polyline')
    const pts = await page
      .locator('td[data-r="5"][data-c="0"] svg.sparkline polyline')
      .getAttribute('points')
    expect(pts && pts.split(' ').length).toBe(5) // one point per value
    await page.close()
  })

  test('a column sparkline renders one bar per value', async () => {
    const page = await openApp()
    await fillColumn(page)
    await page.evaluate(() => (window as any).store.getState().addSparkline('bar'))
    await page.waitForSelector('td[data-r="5"][data-c="0"] svg.sparkline rect')
    expect(await page.locator('td[data-r="5"][data-c="0"] svg.sparkline rect').count()).toBe(5)
    await page.close()
  })

  test('a horizontal range places the sparkline to the right', async () => {
    const page = await openApp()
    await page.evaluate(() => {
      const s = (window as any).store.getState()
      for (let c = 0; c < 4; c++) s.setCellContent(0, c, String((c + 1) * 2))
      s.setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 3 } })
      s.addSparkline('line')
    })
    // A1:D1 → target E1 (row 0, col 4).
    await page.waitForSelector('td[data-r="0"][data-c="4"] svg.sparkline polyline')
    await page.close()
  })

  test('removeSparkline clears the chart', async () => {
    const page = await openApp()
    await fillColumn(page)
    await page.evaluate(() => (window as any).store.getState().addSparkline('line'))
    await page.waitForSelector('td[data-r="5"][data-c="0"] svg.sparkline')
    await page.evaluate(() => (window as any).store.getState().removeSparkline(5, 0))
    await page.waitForFunction(
      () => !document.querySelector('td[data-r="5"][data-c="0"] svg.sparkline'),
    )
    await page.close()
  })
})
