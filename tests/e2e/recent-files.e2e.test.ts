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
    () => typeof (window as any).recentFiles?.addRecentFile === 'function',
  )
  // Start from an empty Recent store for a deterministic assertion.
  await page.evaluate(() => (window as any).recentFiles.clearRecentFiles())
  return page
}

// Mirrors the fix: saving a workbook calls addRecentFile with the path just
// written. Because Recent dedups by name, saving the same file to a new path
// must REPLACE the stale entry — otherwise reopening from Recent re-reads the
// original location and shows pre-save content (the reported desktop bug).
describe('recent files: save updates the entry (dedup by name)', () => {
  test('saving to a new path replaces the entry so Recent points at the save', async () => {
    const page = await openApp()
    const list = await page.evaluate(async () => {
      const rf = (window as any).recentFiles
      const bytes = () => new Uint8Array([1, 2, 3]).buffer
      // Open the file (original location), then "save" it to a new location.
      await rf.addRecentFile('Book.xlsx', bytes(), { path: '/original/Book.xlsx' })
      await rf.addRecentFile('Book.xlsx', bytes(), { path: '/saved/Book.xlsx' })
      return rf.listRecentFiles()
    })
    // Exactly one entry for that name, pointing at the saved path.
    const books = list.filter((f: any) => f.name === 'Book.xlsx')
    expect(books).toHaveLength(1)
    expect(books[0].path).toBe('/saved/Book.xlsx')
    await page.close()
  })

  test('different names coexist as separate entries', async () => {
    const page = await openApp()
    const list = await page.evaluate(async () => {
      const rf = (window as any).recentFiles
      const bytes = () => new Uint8Array([9]).buffer
      await rf.addRecentFile('A.xlsx', bytes(), { path: '/x/A.xlsx' })
      await rf.addRecentFile('B.xlsx', bytes(), { path: '/x/B.xlsx' })
      return rf.listRecentFiles()
    })
    expect(list.map((f: any) => f.name).sort()).toEqual(['A.xlsx', 'B.xlsx'])
    await page.close()
  })
})
