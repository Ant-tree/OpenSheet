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

const colWidth = (page: Page, c: number) =>
  page.evaluate((c) => {
    const s = (window as any).store.getState()
    return s.activeSheet().colWidths[c] ?? 96
  }, c)
const rowHeight = (page: Page, r: number) =>
  page.evaluate((r) => {
    const s = (window as any).store.getState()
    return s.activeSheet().rowHeights[r] ?? null
  }, r)

// Drag from an element's center by (dx, dy) using the pointer/mouse pipeline.
async function dragBy(page: Page, selector: string, dx: number, dy: number) {
  const box = await page.locator(selector).first().boundingBox()
  if (!box) throw new Error(`no box for ${selector}`)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + dx, cy + dy, { steps: 5 })
  await page.mouse.up()
}

describe('drag resize (columns & rows)', () => {
  test('dragging a column-header handle widens the column', async () => {
    const page = await openApp()
    const before = await colWidth(page, 0)
    await dragBy(page, '.colhead .col-resize', 60, 0)
    await expect.poll(() => colWidth(page, 0)).toBeGreaterThan(before + 30)
    await page.close()
  })

  test('dragging a row-header handle grows the row', async () => {
    const page = await openApp()
    // Row 0's handle sits at the bottom edge of the first row header.
    await dragBy(page, 'tr:has(.rowhead) .row-resize', 0, 40)
    await expect.poll(() => rowHeight(page, 0)).not.toBeNull()
    expect(await rowHeight(page, 0)).toBeGreaterThan(40)
    await page.close()
  })

  test('a resized column cannot shrink below the minimum', async () => {
    const page = await openApp()
    await dragBy(page, '.colhead .col-resize', -400, 0)
    expect(await colWidth(page, 0)).toBeGreaterThanOrEqual(24)
    await page.close()
  })
})
