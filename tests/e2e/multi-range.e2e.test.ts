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

const cell = (r: number, c: number) => `td[data-r="${r}"][data-c="${c}"]`
const isSelected = (page: Page, r: number, c: number) =>
  page.evaluate(
    ([r, c]) => document.querySelector(`td[data-r="${r}"][data-c="${c}"]`)?.classList.contains('selected') ?? false,
    [r, c],
  )
const getFormat = (page: Page, r: number, c: number) =>
  page.evaluate(([r, c]) => (window as any).store.getState().getFormat(r, c) ?? null, [r, c])

describe('multi-range selection', () => {
  test('Ctrl-click adds a non-contiguous cell to the selection', async () => {
    const page = await openApp()
    await page.click(cell(0, 0))
    await page.click(cell(3, 3), { modifiers: ['Control'] })

    // Both the original and the Ctrl-clicked cell are highlighted; a cell
    // between them is not.
    expect(await isSelected(page, 0, 0)).toBe(true)
    expect(await isSelected(page, 3, 3)).toBe(true)
    expect(await isSelected(page, 1, 1)).toBe(false)
    // The store holds one extra range plus the active selection.
    expect(await page.evaluate(() => (window as any).store.getState().extraRanges.length)).toBe(1)
    await page.close()
  })

  test('formatting applies to every range in the multi-selection', async () => {
    const page = await openApp()
    await page.click(cell(0, 0))
    await page.click(cell(2, 2), { modifiers: ['Control'] })
    await page.click(cell(4, 0), { modifiers: ['Control'] })

    await page.evaluate(() => (window as any).store.getState().applyFormat({ bold: true }))

    expect(await getFormat(page, 0, 0)).toMatchObject({ bold: true })
    expect(await getFormat(page, 2, 2)).toMatchObject({ bold: true })
    expect(await getFormat(page, 4, 0)).toMatchObject({ bold: true })
    // A cell that was never selected stays unformatted.
    expect(await getFormat(page, 1, 1)).toBe(null)
    await page.close()
  })

  test('a plain click collapses back to a single range', async () => {
    const page = await openApp()
    await page.click(cell(0, 0))
    await page.click(cell(3, 3), { modifiers: ['Control'] })
    expect(await page.evaluate(() => (window as any).store.getState().extraRanges.length)).toBe(1)

    await page.click(cell(5, 5))
    expect(await page.evaluate(() => (window as any).store.getState().extraRanges.length)).toBe(0)
    expect(await isSelected(page, 0, 0)).toBe(false)
    expect(await isSelected(page, 5, 5)).toBe(true)
    await page.close()
  })

  test('keyboard navigation collapses the multi-selection', async () => {
    const page = await openApp()
    await page.click(cell(0, 0))
    await page.click(cell(3, 3), { modifiers: ['Control'] })
    await page.keyboard.press('ArrowDown')
    expect(await page.evaluate(() => (window as any).store.getState().extraRanges.length)).toBe(0)
    await page.close()
  })
})
