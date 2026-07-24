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

const val = (page: Page, r: number, c: number) =>
  page.evaluate(([r, c]) => (window as any).store.getState().getComputed(r, c) ?? null, [r, c])
const fmt = (page: Page, r: number, c: number) =>
  page.evaluate(([r, c]) => (window as any).store.getState().getFormat(r, c) ?? null, [r, c])
const select = (page: Page, r: number, c: number) =>
  page.evaluate(([r, c]) => (window as any).store.getState().setSelection({ anchor: { row: r, col: c }, focus: { row: r, col: c } }), [r, c])

// Put a bold red "src" in A1 and copy it to the internal clipboard.
async function copySource(page: Page) {
  await page.evaluate(() => {
    const s = (window as any).store.getState()
    s.setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } })
    s.setCellContent(0, 0, 'src')
    s.applyFormat({ bold: true, color: '#d93025' })
    s.copySelection() // populates the internal clipboard (value + format)
  })
}

describe('paste special', () => {
  test('paste values only: value copied, formatting NOT applied', async () => {
    const page = await openApp()
    await copySource(page)
    await select(page, 0, 1) // B1
    await page.evaluate(() => (window as any).store.getState().pasteValuesOnly())
    expect(await val(page, 0, 1)).toBe('src')
    expect(await fmt(page, 0, 1)).toBeNull() // no bold/color
    await page.close()
  })

  test('paste formatting only: format applied, value untouched', async () => {
    const page = await openApp()
    await copySource(page)
    // C1 has its own value we want to keep.
    await page.evaluate(() => (window as any).store.getState().setCellContent(0, 2, 'keep'))
    await select(page, 0, 2)
    await page.evaluate(() => (window as any).store.getState().pasteFormatsOnly())
    expect(await val(page, 0, 2)).toBe('keep') // value unchanged
    expect(await fmt(page, 0, 2)).toMatchObject({ bold: true, color: '#d93025' })
    await page.close()
  })

  test('context menu shows paste-special items after a copy', async () => {
    const page = await openApp()
    await copySource(page)
    // Long-press-free: open the context menu via right-click on a cell.
    await page.click('td[data-r="0"][data-c="3"]', { button: 'right' })
    await page.waitForSelector('.context-menu')
    const labels = await page.$$eval('.context-menu .menu-item', (els) => els.map((e) => e.textContent))
    expect(labels).toContain('Paste values only')
    expect(labels).toContain('Paste formatting only')
    await page.close()
  })
})
