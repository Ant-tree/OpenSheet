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
  await page.waitForFunction(
    () =>
      typeof (window as any).store?.getState === 'function' &&
      typeof (window as any).settings?.getState === 'function',
  )
  await page.waitForSelector('td[data-r="0"][data-c="0"]')
  return page
}

// Install a fake File System Access handle that records each write. Headless
// Chromium has no real FSA/OPFS, so this stands in for the open file and lets us
// verify the debounced auto-save effect actually writes back.
async function installMockHandle(page: Page) {
  await page.evaluate(() => {
    ;(window as any).__writes = [] as number[]
    const handle = {
      name: 'autosave.xlsx',
      async queryPermission() {
        return 'granted'
      },
      async requestPermission() {
        return 'granted'
      },
      async createWritable() {
        return {
          async write(data: ArrayBuffer) {
            ;(window as any).__writes.push((data as ArrayBuffer).byteLength ?? 0)
          },
          async close() {},
        }
      },
    }
    ;(window as any).store.getState().setFileHandle(handle)
  })
}

const writeCount = (page: Page) => page.evaluate(() => (window as any).__writes.length as number)

describe('auto-save', () => {
  test('writes back to the open file after an edit when enabled', async () => {
    const page = await openApp()
    await installMockHandle(page)
    await page.evaluate(() => (window as any).settings.getState().setAutoSave(true))
    await page.evaluate(() => (window as any).store.getState().setCellContent(0, 0, 'edit-1'))

    // Debounce is 1200ms; give it margin, then confirm a write landed with bytes.
    await expect.poll(() => writeCount(page), { timeout: 5000 }).toBeGreaterThan(0)
    const firstWriteBytes = await page.evaluate(() => (window as any).__writes[0] as number)
    expect(firstWriteBytes).toBeGreaterThan(0)
    await page.close()
  })

  test('does not write when auto-save is disabled', async () => {
    const page = await openApp()
    await installMockHandle(page)
    // Auto-save stays off.
    await page.evaluate(() => (window as any).store.getState().setCellContent(0, 0, 'edit-2'))
    await page.waitForTimeout(2000)
    expect(await writeCount(page)).toBe(0)
    await page.close()
  })

  test('debounces multiple rapid edits into fewer writes', async () => {
    const page = await openApp()
    await installMockHandle(page)
    await page.evaluate(() => (window as any).settings.getState().setAutoSave(true))
    // Five quick edits within one debounce window.
    await page.evaluate(async () => {
      const s = (window as any).store.getState()
      for (let i = 0; i < 5; i++) s.setCellContent(0, 0, 'rapid-' + i)
    })
    await expect.poll(() => writeCount(page), { timeout: 5000 }).toBeGreaterThan(0)
    // Far fewer writes than edits (debounced), never 5.
    expect(await writeCount(page)).toBeLessThan(5)
    await page.close()
  })
})
