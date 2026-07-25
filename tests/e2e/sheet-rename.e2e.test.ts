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

const activeName = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).store.getState()
    return s.sheets.find((sh: any) => sh.id === s.activeSheetId)?.name
  })

describe('sheet rename (in-app modal, not window.prompt)', () => {
  test('the ⋯ menu opens a modal that renames the sheet', async () => {
    const page = await openApp()
    // window.prompt is unavailable in the Tauri/Android WebViews; make sure the
    // flow never depends on it (throw if anything calls it).
    await page.evaluate(() => {
      ;(window as any).prompt = () => {
        throw new Error('window.prompt must not be used for rename')
      }
    })

    await page.locator('.sheet-tab .tab-menu-btn').first().click()
    await page.locator('.tab-menu .menu-item', { hasText: 'Rename sheet' }).click()
    await page.waitForSelector('.saveas-modal .saveas-input')
    await page.fill('.saveas-modal .saveas-input', 'Budget')
    await page.click('.saveas-modal .saveas-btn.primary')

    await page.waitForFunction(() => !document.querySelector('.saveas-modal'))
    expect(await activeName(page)).toBe('Budget')
    await page.close()
  })

  test('double-clicking a tab opens the same rename modal', async () => {
    const page = await openApp()
    await page.locator('.sheet-tab').first().dblclick()
    await page.waitForSelector('.saveas-modal .saveas-input')
    await page.fill('.saveas-modal .saveas-input', 'Q1')
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => !document.querySelector('.saveas-modal'))
    expect(await activeName(page)).toBe('Q1')
    await page.close()
  })

  test('Escape / empty name leaves the sheet name unchanged', async () => {
    const page = await openApp()
    const before = await activeName(page)
    await page.locator('.sheet-tab .tab-menu-btn').first().click()
    await page.locator('.tab-menu .menu-item', { hasText: 'Rename sheet' }).click()
    await page.waitForSelector('.saveas-modal .saveas-input')
    await page.fill('.saveas-modal .saveas-input', '   ')
    await page.click('.saveas-modal .saveas-btn.primary')
    await page.waitForFunction(() => !document.querySelector('.saveas-modal'))
    expect(await activeName(page)).toBe(before)
    await page.close()
  })
})
