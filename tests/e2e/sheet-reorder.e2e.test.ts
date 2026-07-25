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
  await page.waitForSelector('.sheet-tab')
  return page
}

const names = (page: Page) =>
  page.evaluate(() => (window as any).store.getState().sheets.map((s: any) => s.name))

async function addSheets(page: Page, n: number) {
  await page.evaluate((count) => {
    const s = (window as any).store.getState()
    for (let i = 0; i < count; i++) s.addSheet()
  }, n)
  await page.waitForFunction((c) => document.querySelectorAll('.sheet-tab').length === c, 1 + n)
}

/** Drag the tab at `fromIdx` horizontally to land near the tab at `toIdx`. */
async function dragTab(page: Page, fromIdx: number, toIdx: number) {
  const from = await page.locator('.sheet-tab').nth(fromIdx).boundingBox()
  const to = await page.locator('.sheet-tab').nth(toIdx).boundingBox()
  if (!from || !to) throw new Error('tab not found')
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  const targetX = toIdx > fromIdx ? to.x + to.width * 0.8 : to.x + to.width * 0.2
  // Move in steps so pointermove fires and the live reorder crosses midpoints.
  for (let i = 1; i <= 8; i++) {
    const x = from.x + from.width / 2 + ((targetX - (from.x + from.width / 2)) * i) / 8
    await page.mouse.move(x, to.y + to.height / 2)
  }
  await page.mouse.up()
}

describe('sheet reorder (drag)', () => {
  test('dragging the first tab to the end reorders the sheets', async () => {
    const page = await openApp()
    await addSheets(page, 2) // Sheet1, Sheet2, Sheet3
    const before = await names(page)
    expect(before.length).toBe(3)

    await dragTab(page, 0, 2)
    await page.waitForFunction(
      (first) => (window as any).store.getState().sheets[0].name !== first,
      before[0],
    )
    const after = await names(page)
    expect(after[after.length - 1]).toBe(before[0]) // first sheet moved to the end
    expect([...after].sort()).toEqual([...before].sort()) // same set, new order
    await page.close()
  })

  test('a plain click still switches sheets (drag logic does not swallow taps)', async () => {
    const page = await openApp()
    await addSheets(page, 2)
    await page.locator('.sheet-tab').nth(0).click()
    const active = await page.evaluate(() => {
      const s = (window as any).store.getState()
      return s.sheets.findIndex((sh: any) => sh.id === s.activeSheetId)
    })
    expect(active).toBe(0)
    await page.close()
  })
})
