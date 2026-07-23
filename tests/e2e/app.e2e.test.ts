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

/** Open the app and wait for the dev-only `window.store` handle to be ready. */
async function openApp(): Promise<Page> {
  const page = await browser.newPage()
  await page.goto(baseURL)
  await page.waitForFunction(() => typeof (window as any).store?.getState === 'function')
  await page.waitForSelector('td[data-r="0"][data-c="0"]')
  return page
}

/** Set a cell's content through the store (stable across virtualization). */
async function setCell(page: Page, row: number, col: number, value: string) {
  await page.evaluate(
    ([r, c, v]) => (window as any).store.getState().setCellContent(r as number, c as number, v as string),
    [row, col, value],
  )
}

/** Read the on-screen text of a rendered cell (empty string if blank). */
function cellText(page: Page, row: number, col: number) {
  return page.evaluate(([r, c]) => {
    const td = document.querySelector(`td[data-r="${r}"][data-c="${c}"] .cell-text`)
    return td?.textContent ?? ''
  }, [row, col])
}

describe('OpenSheet app', () => {
  test('renders the grid with row/column headers', async () => {
    const page = await openApp()
    expect(await page.locator('.colhead').first().textContent()).toBe('A')
    expect(await page.locator('.rowhead').first().textContent()).toBe('1')
    await page.close()
  })

  test('cell content set in the store shows in the grid', async () => {
    const page = await openApp()
    await setCell(page, 0, 0, 'hello')
    await expect.poll(() => cellText(page, 0, 0)).toBe('hello')
    await page.close()
  })

  test('switching sheets shows the new sheet, not stale content (regression)', async () => {
    // Content cache used to be keyed only by "row,col" and was invalidated on
    // `rev` but not on sheet change, so a fresh sheet showed the previous
    // sheet's text over its merges. Guard that fix.
    const page = await openApp()
    await setCell(page, 0, 0, 'sheet1-A1')
    await expect.poll(() => cellText(page, 0, 0)).toBe('sheet1-A1')

    // Add a second sheet and switch to it via the tab UI.
    await page.click('.add-sheet')
    await page.waitForFunction(() => (window as any).store.getState().sheets.length >= 2)
    const tabs = page.locator('.sheet-tab')
    await tabs.nth(1).click()
    await page.waitForFunction(() => {
      const s = (window as any).store.getState()
      return s.activeSheetId === s.sheets[1].id
    })

    // The new sheet's A1 must be blank — not still showing "sheet1-A1".
    await expect.poll(() => cellText(page, 0, 0)).toBe('')

    // Switching back must restore the first sheet's content.
    await tabs.nth(0).click()
    await expect.poll(() => cellText(page, 0, 0)).toBe('sheet1-A1')
    await page.close()
  })

  test('zoom control changes the zoom percentage', async () => {
    const page = await openApp()
    const label = page.locator('.zoom-label')
    expect(await label.textContent()).toBe('100%')
    await page.locator('.zoom-btn').last().click() // zoom in
    await expect.poll(() => label.textContent()).not.toBe('100%')
    await page.locator('.zoom-label').click() // reset
    await expect.poll(() => label.textContent()).toBe('100%')
    await page.close()
  })
})
