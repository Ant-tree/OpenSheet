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

// A touch/coarse-pointer page (no right-click) — the long-press path is what
// mobile relies on to open the tab menu.
async function openTouchApp(): Promise<Page> {
  const ctx = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 420, height: 780 } })
  const page = await ctx.newPage()
  await page.goto(baseURL)
  await page.waitForFunction(() => typeof (window as any).store?.getState === 'function')
  await page.waitForSelector('.sheet-tab')
  return page
}

describe('sheet-tab long-press (touch)', () => {
  test('a stationary long-press on a tab opens the tab menu', async () => {
    const page = await openTouchApp()
    const box = await page.locator('.sheet-tab').first().boundingBox()
    if (!box) throw new Error('no tab box')
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    const cdp = await page.context().newCDPSession(page)

    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] })
    // Hold past the 500ms long-press threshold without moving.
    await page.waitForTimeout(650)
    await page.waitForSelector('.tab-menu', { timeout: 2000 })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

    // The menu stays open (not dismissed by the synthesized release event).
    expect(await page.locator('.tab-menu .menu-item').count()).toBeGreaterThanOrEqual(1)

    // And it acts on the right sheet.
    await page.locator('.tab-menu .menu-item', { hasText: 'Duplicate sheet' }).click()
    await page.waitForFunction(() => (window as any).store.getState().sheets.length === 2)
    await page.close()
  })

  test('a quick tap (no hold) switches sheets instead of opening the menu', async () => {
    const page = await openTouchApp()
    await page.evaluate(() => (window as any).store.getState().addSheet()) // 2 tabs, sheet2 active
    const box = await page.locator('.sheet-tab').first().boundingBox()
    if (!box) throw new Error('no tab box')
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

    await page.waitForFunction(() => {
      const s = (window as any).store.getState()
      return s.activeSheetId === s.sheets[0].id
    })
    expect(await page.locator('.tab-menu').count()).toBe(0)
    await page.close()
  })
})
