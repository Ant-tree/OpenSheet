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

describe('build stamp (confirm the running bundle)', () => {
  test('exposes window.OPENSHEET_BUILD and shows it in the help panel', async () => {
    const page = await openApp()
    const build = await page.evaluate(() => (window as any).OPENSHEET_BUILD)
    expect(build?.hash).toBeTruthy()
    expect(typeof build.hash).toBe('string')

    // F1 opens the help panel; the build tag is in its footer.
    await page.keyboard.press('F1')
    await page.waitForSelector('.build-tag')
    const tag = await page.locator('.build-tag').innerText()
    expect(tag).toContain(build.hash)
    await page.close()
  })
})
