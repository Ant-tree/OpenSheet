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

// A touch/coarse-pointer page: makes `matchMedia('(pointer: coarse)')` match,
// which is what the grid uses (IS_COARSE) to switch on the whole-header resize.
async function openTouchApp(): Promise<Page> {
  const ctx = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 420, height: 780 },
  })
  const page = await ctx.newPage()
  await page.goto(baseURL)
  await page.waitForFunction(() => typeof (window as any).store?.getState === 'function')
  await page.waitForSelector('td[data-r="0"][data-c="0"]')
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches)
  expect(coarse).toBe(true)
  return page
}

async function dragBy(page: Page, selector: string, nth: number, dx: number, dy: number) {
  const box = await page.locator(selector).nth(nth).boundingBox()
  if (!box) throw new Error(`no box for ${selector}`)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + dx, cy + dy, { steps: 6 })
  await page.mouse.up()
}

const colWidth = (page: Page, c: number) =>
  page.evaluate((c) => (window as any).store.getState().activeSheet().colWidths[c] ?? 96, c)
const rowHeight = (page: Page, r: number) =>
  page.evaluate((r) => (window as any).store.getState().activeSheet().rowHeights[r] ?? null, r)

// A real finger drag (pointerType 'touch') via CDP — unlike page.mouse, which is
// always pointerType 'mouse'. This exercises the actual on-device code path
// (the resize is gated on `pointerType !== 'mouse'`, not just a media query).
async function touchDragBy(page: Page, selector: string, nth: number, dx: number, dy: number) {
  const box = await page.locator(selector).nth(nth).boundingBox()
  if (!box) throw new Error(`no box for ${selector}`)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] })
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: cx + (dx * i) / 6, y: cy + (dy * i) / 6 }],
    })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

describe('touch resize (whole header is the grab target)', () => {
  test('dragging anywhere across a column header resizes that column', async () => {
    const page = await openTouchApp()
    const before = await colWidth(page, 1)
    await dragBy(page, '.colhead', 1, 70, 0) // drag from the header's center
    await expect.poll(() => colWidth(page, 1)).toBeGreaterThan(before + 40)
    await page.context().close()
  })

  test('a real touch drag (pointerType=touch) resizes the column', async () => {
    const page = await openTouchApp()
    const before = await colWidth(page, 1)
    await touchDragBy(page, '.colhead', 1, 72, 0)
    await expect.poll(() => colWidth(page, 1)).toBeGreaterThan(before + 40)
    await page.context().close()
  })

  test('a slightly diagonal touch drag still resizes the column', async () => {
    // The real-device failure mode: a finger drag is never perfectly axis-aligned.
    // With touch-action:none the cross-axis wobble can't start a pan/cancel.
    const page = await openTouchApp()
    const before = await colWidth(page, 1)
    await touchDragBy(page, '.colhead', 1, 72, 22) // mostly horizontal, some vertical
    await expect.poll(() => colWidth(page, 1)).toBeGreaterThan(before + 40)
    await page.context().close()
  })

  test('dragging down a row header resizes that row', async () => {
    const page = await openTouchApp()
    await dragBy(page, 'tr:has(.rowhead) .rowhead', 1, 0, 45)
    await expect.poll(() => rowHeight(page, 1)).not.toBeNull()
    expect(await rowHeight(page, 1)).toBeGreaterThan(40)
    await page.context().close()
  })

  test('a tap (no drag) on a column header still selects the whole column', async () => {
    const page = await openTouchApp()
    const box = await page.locator('.colhead').nth(2).boundingBox()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    const sel = await page.evaluate(() => (window as any).store.getState().selection)
    expect(sel.anchor.col).toBe(2)
    expect(sel.focus.col).toBe(2)
    expect(sel.focus.row).toBeGreaterThan(1000) // spans the column
    await page.context().close()
  })

  test('headers declare touch-action:none so a drag never scrolls/cancels', async () => {
    // `none` (not pan-x/pan-y) — Android WebView starts a cross-axis pan on a
    // slightly diagonal drag and fires pointercancel, killing the resize.
    // Applied unconditionally (Capacitor WebViews don't reliably report coarse).
    const page = await openTouchApp()
    const ta = await page.evaluate(() => {
      const col = document.querySelector('.colhead')!
      const row = document.querySelector('.rowhead')!
      return {
        col: getComputedStyle(col).touchAction,
        row: getComputedStyle(row).touchAction,
      }
    })
    expect(ta.col).toBe('none')
    expect(ta.row).toBe('none')
    await page.context().close()
  })
})
