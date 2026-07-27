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

describe('copy/paste carries merged cells', () => {
  test('copying a merged block and pasting recreates the merge at the target', async () => {
    const page = await openApp()
    const merges = await page.evaluate(() => {
      const st = () => (window as any).store.getState()
      st().setCellContent(0, 0, 'X')
      // Merge A1:B2.
      st().setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 1, col: 1 } })
      st().mergeSelection()
      // Copy A1:B2.
      st().setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 1, col: 1 } })
      const tsv = st().copySelection()
      // Paste at A4 (row 3, col 0).
      st().setSelection({ anchor: { row: 3, col: 0 }, focus: { row: 3, col: 0 } })
      st().pasteText(tsv)
      return st().activeSheet().merges
    })
    // Original merge plus the pasted one (offset to row 3).
    expect(merges).toContainEqual({ top: 0, left: 0, bottom: 1, right: 1 })
    expect(merges).toContainEqual({ top: 3, left: 0, bottom: 4, right: 1 })
    await page.close()
  })

  test('a multi-line cell round-trips as one cell and keeps its merge + format', async () => {
    const page = await openApp()
    const result = await page.evaluate(() => {
      const st = () => (window as any).store.getState()
      // A cell whose text contains a newline (the case that used to split rows).
      st().setCellContent(0, 0, '(주식계좌현금\n중 달러)')
      st().setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 1, col: 0 } })
      st().applyFormat({ bold: true })
      st().mergeSelection() // A1:A2 merged
      st().setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 1, col: 0 } })
      const tsv = st().copySelection()
      st().setSelection({ anchor: { row: 5, col: 0 }, focus: { row: 5, col: 0 } })
      st().pasteText(tsv)
      return {
        a1: st().getComputed(5, 0),
        fmt: st().getFormat(5, 0),
        merges: st().activeSheet().merges,
      }
    })
    // The newline stayed inside one cell (not split across rows)...
    expect(result.a1).toBe('(주식계좌현금\n중 달러)')
    // ...and because the grid matched, format + merge were applied.
    expect(result.fmt).toMatchObject({ bold: true })
    expect(result.merges).toContainEqual({ top: 5, left: 0, bottom: 6, right: 0 })
    await page.close()
  })

  test('paste formatting-only also carries the merge', async () => {
    const page = await openApp()
    const merges = await page.evaluate(() => {
      const st = () => (window as any).store.getState()
      st().setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 2 } })
      st().mergeSelection()
      st().setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 2 } })
      st().copySelection()
      st().setSelection({ anchor: { row: 5, col: 0 }, focus: { row: 5, col: 0 } })
      st().pasteFormatsOnly()
      return st().activeSheet().merges
    })
    expect(merges).toContainEqual({ top: 5, left: 0, bottom: 5, right: 2 })
    await page.close()
  })
})
