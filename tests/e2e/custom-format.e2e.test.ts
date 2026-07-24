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
  await page.setViewportSize({ width: 1300, height: 800 })
  await page.goto(baseURL)
  await page.waitForFunction(() => typeof (window as any).store?.getState === 'function')
  await page.waitForSelector('td[data-r="0"][data-c="0"]')
  return page
}
const fmt = (page: Page) =>
  page.evaluate(() => (window as any).store.getState().getFormat(0, 0)?.numberFormat ?? null)

describe('custom number format input', () => {
  test('typing a custom token applies it to the selection', async () => {
    const page = await openApp()
    await page.evaluate(() => {
      const s = (window as any).store.getState()
      s.setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } })
      s.setCellContent(0, 0, '1234')
    })
    await page.fill('.numfmt-input', '#,##0 "kg"')
    await page.locator('.numfmt-input').press('Enter')
    expect(await fmt(page)).toBe('#,##0 "kg"')
    // The rendered cell reflects the custom format.
    await expect
      .poll(() =>
        page.evaluate(() => document.querySelector('td[data-r="0"][data-c="0"]')?.textContent ?? ''),
      )
      .toContain('kg')
    await page.close()
  })

  test('the input shows the focused cell’s current custom format', async () => {
    const page = await openApp()
    await page.evaluate(() => {
      const s = (window as any).store.getState()
      s.setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } })
      s.applyFormat({ numberFormat: '0.0"%"' })
    })
    // Re-focus the cell so the toolbar input re-mounts with its value.
    await page.evaluate(() =>
      (window as any).store.getState().setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } }),
    )
    await expect.poll(() => page.inputValue('.numfmt-input')).toBe('0.0"%"')
    await page.close()
  })
})
