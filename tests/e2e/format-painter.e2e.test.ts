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

function selectCell(page: Page, row: number, col: number) {
  return page.evaluate(
    ([r, c]) =>
      (window as any).store.getState().setSelection({
        anchor: { row: r, col: c },
        focus: { row: r, col: c },
      }),
    [row, col],
  )
}

function getFormat(page: Page, row: number, col: number) {
  return page.evaluate(([r, c]) => (window as any).store.getState().getFormat(r, c) ?? null, [
    row,
    col,
  ])
}

describe('format painter', () => {
  test('copies formatting from the source cell to a clicked target', async () => {
    const page = await openApp()

    // Format the source cell B2 (row 1, col 1): bold + red text.
    await selectCell(page, 1, 1)
    await page.evaluate(() =>
      (window as any).store.getState().applyFormat({ bold: true, color: '#d93025' }),
    )
    expect(await getFormat(page, 1, 1)).toMatchObject({ bold: true, color: '#d93025' })

    // Arm the painter from B2, then click target C4 (row 3, col 2).
    await page.click('button[aria-label="Format painter"]')
    expect(await page.getAttribute('button[aria-label="Format painter"]', 'aria-pressed')).toBe(
      'true',
    )
    await page.waitForSelector('.grid-scroll.painter-armed')

    await page.click('td[data-r="3"][data-c="2"]')

    // Target picks up the source's formatting; painter disarms.
    await expect.poll(() => getFormat(page, 3, 2)).toMatchObject({ bold: true, color: '#d93025' })
    await expect
      .poll(() => page.getAttribute('button[aria-label="Format painter"]', 'aria-pressed'))
      .toBe('false')
    expect(await page.locator('.grid-scroll.painter-armed').count()).toBe(0)
    await page.close()
  })

  test('painting from a plain cell clears the target formatting', async () => {
    const page = await openApp()

    // Give D1 (row 0, col 3) some formatting.
    await selectCell(page, 0, 3)
    await page.evaluate(() => (window as any).store.getState().applyFormat({ bold: true }))
    expect(await getFormat(page, 0, 3)).toMatchObject({ bold: true })

    // Arm from a plain, unformatted cell A1, then paint over D1.
    await selectCell(page, 0, 0)
    await page.click('button[aria-label="Format painter"]')
    await page.click('td[data-r="0"][data-c="3"]')

    await expect.poll(() => getFormat(page, 0, 3)).toBe(null)
    await page.close()
  })

  test('Escape disarms the painter without painting', async () => {
    const page = await openApp()
    await selectCell(page, 0, 0)
    await page.click('button[aria-label="Format painter"]')
    await page.waitForSelector('.grid-scroll.painter-armed')
    await page.keyboard.press('Escape')
    await expect.poll(() => page.locator('.grid-scroll.painter-armed').count()).toBe(0)
    await page.close()
  })
})
