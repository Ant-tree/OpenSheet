import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest'
import type { Browser, Page } from 'playwright-core'
import ExcelJS from 'exceljs'
import { launchBrowser } from './browser'

const baseURL = inject('baseURL')
let browser: Browser

beforeAll(async () => {
  browser = await launchBrowser()
})
afterAll(async () => {
  await browser?.close()
})

const FILE_PATH_KEY = 'opensheet.filePath'
const REOPEN_PENDING_KEY = 'opensheet.reopenPending'
const LAST_FILE = '/Users/me/Budget.xlsx'

async function workbookBytes(): Promise<number[]> {
  const wb = new ExcelJS.Workbook()
  wb.addWorksheet('Budget').getCell('A1').value = 42
  return Array.from(new Uint8Array(await wb.xlsx.writeBuffer()))
}

const SHEET_TABS_MODULE = '**/src/components/SheetTabs.tsx*'

const ALWAYS_CRASH = "export default function SheetTabs() { throw new Error('boom-render') }"

// Crashes only once the reopened file is loaded, so the launch effect has run.
const CRASH_AFTER_LOAD = `
import { useStore } from '/src/store/useStore.ts'
export default function SheetTabs() {
  const name = useStore((s) => s.sheets[0]?.name)
  if (name === 'Budget') throw new Error('boom-render')
  return null
}`

/** Replace the sheet tabs component with one that throws while rendering. */
async function crashSheetTabs(page: Page, body: string): Promise<void> {
  await page.route(SHEET_TABS_MODULE, (route) =>
    route.fulfill({ contentType: 'application/javascript', body }),
  )
}

/**
 * Pretend to be the Tauri desktop app with a last-opened file. `read_file`
 * calls are recorded on `window.__readFileCalls`.
 */
async function emulateDesktop(
  page: Page,
  storage: Record<string, string>,
  bytes: number[] | null,
): Promise<void> {
  await page.addInitScript(
    ({ storage, bytes }) => {
      const w = window as any
      w.isTauri = true
      w.__readFileCalls = 0
      w.__TAURI_INTERNALS__ = {
        invoke: async (cmd: string) => {
          if (cmd !== 'read_file') return null
          w.__readFileCalls += 1
          if (!bytes) throw new Error('missing file')
          return bytes
        },
        transformCallback: () => 0,
      }
      // Seed once: init scripts run again on reload.
      if (!sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('seeded', '1')
        for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v)
      }
    },
    { storage, bytes },
  )
}

function storageValue(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => localStorage.getItem(k), key)
}

// Regression: on the macOS app a startup error left a blank window with no way
// to see the cause (release builds have no dev tools).
describe('startup errors are shown instead of a blank window', () => {
  test('a bundle that fails to evaluate shows the boot error screen', async () => {
    const page = await browser.newPage()
    await page.route('**/src/main.tsx', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: "throw new Error('boom-boot')",
      }),
    )
    await page.goto(baseURL)
    const box = page.locator('#boot-error')
    await box.waitFor()
    expect(await box.textContent()).toContain('boom-boot')

    await page.evaluate((k) => localStorage.setItem(k, '/Users/me/Broken.xlsx'), FILE_PATH_KEY)
    await Promise.all([page.waitForEvent('load'), box.locator('[data-action="start-blank"]').click()])
    expect(await storageValue(page, FILE_PATH_KEY)).toBeNull()
    await page.close()
  })

  test('a render error shows the in-app error screen, not the boot screen', async () => {
    const page = await browser.newPage()
    await crashSheetTabs(page, ALWAYS_CRASH)
    await page.goto(baseURL)
    const screen = page.locator('.crash-screen')
    await screen.waitFor()
    expect(await screen.textContent()).toContain('boom-render')
    // Give the boot guard its full delay: it must stay silent once React rendered.
    await page.waitForTimeout(2000)
    expect(await page.locator('#boot-error').count()).toBe(0)
    await page.close()
  })
})

describe('desktop: reopening the last file on launch', () => {
  test('a successful reopen loads the file and clears the pending marker', async () => {
    const page = await browser.newPage()
    await emulateDesktop(page, { [FILE_PATH_KEY]: LAST_FILE }, await workbookBytes())
    await page.goto(baseURL)
    await page.waitForFunction(
      () => (window as any).store?.getState().sheets[0]?.name === 'Budget',
    )
    await page.waitForFunction((k) => localStorage.getItem(k) === null, REOPEN_PENDING_KEY)
    expect(await storageValue(page, FILE_PATH_KEY)).toBe(LAST_FILE)
    await page.close()
  })

  test('a reopen that crashed rendering is skipped on the next launch', async () => {
    const page = await browser.newPage()
    await emulateDesktop(page, { [FILE_PATH_KEY]: LAST_FILE }, await workbookBytes())
    await crashSheetTabs(page, CRASH_AFTER_LOAD)
    await page.goto(baseURL)
    await page.locator('.crash-screen').waitFor()
    await page.waitForFunction(() => (window as any).__readFileCalls === 1)
    // Past the confirm delay the marker must still be set: the render crashed.
    await page.waitForTimeout(1500)
    expect(await storageValue(page, REOPEN_PENDING_KEY)).toBe(LAST_FILE)

    // Next launch, with the app working again: the file is not reopened.
    await page.unroute(SHEET_TABS_MODULE)
    await page.reload()
    await page.locator('.toast').waitFor()
    expect(await page.evaluate(() => (window as any).__readFileCalls)).toBe(0)
    expect(await storageValue(page, FILE_PATH_KEY)).toBeNull()
    expect(await storageValue(page, REOPEN_PENDING_KEY)).toBeNull()
    await page.close()
  })
})
