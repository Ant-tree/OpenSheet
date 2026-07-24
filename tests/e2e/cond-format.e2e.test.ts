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
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.goto(baseURL)
  await page.waitForFunction(() => typeof (window as any).store?.getState === 'function')
  await page.waitForFunction(() => typeof (window as any).fileIO?.workbookBuffer === 'function')
  await page.waitForSelector('td[data-r="0"][data-c="0"]')
  return page
}

// Fill a column and add a colorScale / dataBar rule over it, via the store.
async function seed(page: Page) {
  await page.evaluate(() => {
    const s = (window as any).store.getState()
    // Column A (col 0): 0,50,100 for a color scale.
    s.setCellContent(0, 0, '0')
    s.setCellContent(1, 0, '50')
    s.setCellContent(2, 0, '100')
    // Column B (col 1): 0,100,200 for a data bar.
    s.setCellContent(0, 1, '0')
    s.setCellContent(1, 1, '100')
    s.setCellContent(2, 1, '200')
    s.addCondFormat({ range: { top: 0, bottom: 2, left: 0, right: 0 }, kind: 'colorScale', minColor: '#000000', maxColor: '#ffffff' })
    s.addCondFormat({ range: { top: 0, bottom: 2, left: 1, right: 1 }, kind: 'dataBar', barColor: '#5b9bd5' })
  })
}

const bg = (page: Page, r: number, c: number) =>
  page.evaluate(([r, c]) => {
    const el = document.querySelector(`td[data-r="${r}"][data-c="${c}"]`) as HTMLElement
    return getComputedStyle(el).backgroundColor
  }, [r, c])
const barWidth = (page: Page, r: number, c: number) =>
  page.evaluate(([r, c]) => {
    const el = document.querySelector(`td[data-r="${r}"][data-c="${c}"] .data-bar`) as HTMLElement | null
    return el ? el.style.width : null
  }, [r, c])

describe('conditional formatting: color scale & data bar', () => {
  test('color scale shades cells between the two colors by value', async () => {
    const page = await openApp()
    await seed(page)
    // min value → min color (black); max value → max color (white).
    await expect.poll(() => bg(page, 0, 0)).toBe('rgb(0, 0, 0)')
    await expect.poll(() => bg(page, 2, 0)).toBe('rgb(255, 255, 255)')
    // midpoint is grey (between).
    const mid = await bg(page, 1, 0)
    expect(mid).toMatch(/^rgb\((\d+), \1, \1\)$/) // equal channels = grey
    await page.close()
  })

  test('data bar width is proportional to the value', async () => {
    const page = await openApp()
    await seed(page)
    await expect.poll(() => barWidth(page, 0, 1)).toBe('0%')
    await expect.poll(() => barWidth(page, 1, 1)).toBe('50%')
    await expect.poll(() => barWidth(page, 2, 1)).toBe('100%')
    await page.close()
  })

  test('color scale & data bar survive an xlsx round-trip', async () => {
    const page = await openApp()
    await seed(page)
    const kinds = await page.evaluate(async () => {
      const s = (window as any).store.getState()
      const io = (window as any).fileIO
      const buf = await io.workbookBuffer(s.hf, s.sheets, 'xlsx', s.charts)
      const wb = await io.readWorkbookFile(new File([buf], 'cf.xlsx'))
      return wb.sheets[0].condFormats.map((r: any) => r.kind ?? 'cell')
    })
    expect(kinds).toContain('colorScale')
    expect(kinds).toContain('dataBar')
    await page.close()
  })
})
