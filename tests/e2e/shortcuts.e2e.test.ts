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

describe('keyboard shortcuts help', () => {
  test('opens from the toolbar button and lists shortcut rows', async () => {
    const page = await openApp()
    expect(await page.locator('.shortcuts-modal').count()).toBe(0)
    await page.click('button[aria-label="Keyboard shortcuts"]')
    await page.waitForSelector('.shortcuts-modal')
    // Has grouped shortcut rows (e.g. Save, Undo).
    expect(await page.locator('.shortcuts-row').count()).toBeGreaterThan(5)
    await page.close()
  })

  test('F1 toggles the panel, Escape closes it', async () => {
    const page = await openApp()
    await page.keyboard.press('F1')
    await page.waitForSelector('.shortcuts-modal')
    await page.keyboard.press('Escape')
    await expect.poll(() => page.locator('.shortcuts-modal').count()).toBe(0)
    await page.close()
  })

  test('clicking the backdrop closes the panel', async () => {
    const page = await openApp()
    await page.click('button[aria-label="Keyboard shortcuts"]')
    await page.waitForSelector('.shortcuts-modal')
    // Click the overlay outside the modal (top-left corner).
    await page.mouse.click(5, 5)
    await expect.poll(() => page.locator('.shortcuts-modal').count()).toBe(0)
    await page.close()
  })
})
