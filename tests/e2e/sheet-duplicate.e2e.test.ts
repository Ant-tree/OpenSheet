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
  await page.waitForSelector('.sheet-tab')
  return page
}

describe('duplicate sheet', () => {
  test('the ⋯ menu copies contents + merges into a new sheet after the source', async () => {
    const page = await openApp()
    await page.evaluate(() => {
      const st = () => (window as any).store.getState()
      st().setCellContent(0, 0, 'orig')
      st().setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 1 } })
      st().mergeSelection()
    })

    await page.locator('.sheet-tab .tab-menu-btn').first().click()
    await page.locator('.tab-menu .menu-item', { hasText: 'Duplicate sheet' }).click()
    await page.waitForFunction(() => (window as any).store.getState().sheets.length === 2)

    const result = await page.evaluate(() => {
      const s = (window as any).store.getState()
      const active = s.sheets.find((sh: any) => sh.id === s.activeSheetId)
      return {
        names: s.sheets.map((sh: any) => sh.name),
        activeName: active.name,
        activeIndex: s.sheets.findIndex((sh: any) => sh.id === s.activeSheetId),
        a1: s.getComputed(0, 0),
        merges: active.merges,
      }
    })
    expect(result.names).toEqual(['Sheet1', 'Sheet1 (2)']) // copy placed after source
    expect(result.activeName).toBe('Sheet1 (2)') // switches to the copy
    expect(result.activeIndex).toBe(1)
    expect(result.a1).toBe('orig') // content copied
    expect(result.merges).toContainEqual({ top: 0, left: 0, bottom: 0, right: 1 }) // merge copied
    await page.close()
  })

  test('editing the copy does not change the original', async () => {
    const page = await openApp()
    await page.evaluate(() => {
      const st = () => (window as any).store.getState()
      st().setCellContent(0, 0, 'base')
      st().duplicateSheet(st().activeSheetId)
      // Now on the copy; change A1.
      st().setCellContent(0, 0, 'changed')
    })
    const { original, copy } = await page.evaluate(() => {
      const s = (window as any).store.getState()
      const origId = s.sheets[0].id
      const copyId = s.sheets[1].id
      const cell = (id: number) => s.hf.getCellValue({ sheet: id, row: 0, col: 0 })
      return { original: cell(origId), copy: cell(copyId) }
    })
    expect(original).toBe('base')
    expect(copy).toBe('changed')
    await page.close()
  })
})
