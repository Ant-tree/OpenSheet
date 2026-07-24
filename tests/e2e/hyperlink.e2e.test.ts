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
  await page.waitForFunction(() => typeof (window as any).fileIO?.workbookBuffer === 'function')
  await page.waitForSelector('td[data-r="0"][data-c="0"]')
  return page
}

describe('cell hyperlinks', () => {
  test('setLink marks the cell as a link and shows the open marker', async () => {
    const page = await openApp()
    await page.evaluate(() => {
      const s = (window as any).store.getState()
      s.setCellContent(1, 1, 'OpenSheet')
      s.setLink(1, 1, 'https://example.com')
    })
    const td = page.locator('td[data-r="1"][data-c="1"]')
    await page.waitForSelector('td[data-r="1"][data-c="1"].has-link')
    expect(await td.locator('.cell-link-marker').count()).toBe(1)

    // Removing the link clears the class and marker.
    await page.evaluate(() => (window as any).store.getState().setLink(1, 1, ''))
    await page.waitForFunction(
      () => !document.querySelector('td[data-r="1"][data-c="1"]')?.classList.contains('has-link'),
    )
    expect(await td.locator('.cell-link-marker').count()).toBe(0)
    await page.close()
  })

  test('clicking the marker opens the URL in a new tab', async () => {
    const page = await openApp()
    await page.evaluate(() => {
      const s = (window as any).store.getState()
      s.setCellContent(0, 0, 'go')
      s.setLink(0, 0, 'example.org') // bare host → normalized to https
    })
    const opened = await page.evaluate(() => {
      return new Promise<string>((resolve) => {
        const orig = window.open
        ;(window as any).open = (url: string) => {
          ;(window as any).open = orig
          resolve(url)
          return null
        }
        ;(document.querySelector('td[data-r="0"][data-c="0"] .cell-link-marker') as HTMLElement).click()
      })
    })
    expect(opened).toBe('https://example.org')
    await page.close()
  })

  test('hyperlinks survive an xlsx round-trip', async () => {
    const page = await openApp()
    await page.evaluate(() => {
      const s = (window as any).store.getState()
      s.setCellContent(2, 3, 'site')
      s.setLink(2, 3, 'https://anttree.dev')
    })
    const link = await page.evaluate(async () => {
      const s = (window as any).store.getState()
      const io = (window as any).fileIO
      const buf = await io.workbookBuffer(s.hf, s.sheets, 'xlsx', s.charts)
      const wb = await io.readWorkbookFile(new File([buf], 'roundtrip.xlsx'))
      return wb.sheets[0].links?.['2,3'] ?? null
    })
    expect(link).toBe('https://anttree.dev')
    await page.close()
  })
})
