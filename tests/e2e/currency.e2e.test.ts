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
  await page.evaluate(() => {
    const s = (window as any).store.getState()
    s.setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } })
    s.setCellContent(0, 0, '1234')
  })
  return page
}
const numFmt = (page: Page) =>
  page.evaluate(() => (window as any).store.getState().getFormat(0, 0)?.numberFormat ?? null)

describe('currency format buttons', () => {
  test('₩ button applies the Won currency format', async () => {
    const page = await openApp()
    await page.click('button[title*="₩"]')
    expect(await numFmt(page)).toBe('₩#,##0')
    await page.close()
  })

  test('$ button applies the USD currency format', async () => {
    const page = await openApp()
    await page.click('button[title*="$"]')
    expect(await numFmt(page)).toBe('$#,##0')
    await page.close()
  })
})
