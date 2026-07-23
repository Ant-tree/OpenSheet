import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser } from 'playwright-core'

/**
 * Locate a Chromium executable to drive the E2E tests.
 *
 * We use `playwright-core` (no bundled browser) so tests can reuse a browser
 * that's already on disk instead of downloading one — important in sandboxes
 * where the download is blocked. Resolution order:
 *   1. $OPENSHEET_CHROME — an explicit override.
 *   2. a chromium-* browser dir under $PLAYWRIGHT_BROWSERS_PATH — the browser a
 *      normal Playwright install (or this CI image) already unpacked.
 *   3. undefined — let playwright-core find its own registered browser.
 */
export function resolveChromiumPath(): string | undefined {
  const explicit = process.env.OPENSHEET_CHROME
  if (explicit && existsSync(explicit)) return explicit

  const base = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (base && existsSync(base)) {
    for (const entry of readdirSync(base)) {
      // Prefer the full browser over the headless_shell build.
      if (entry.startsWith('chromium-') && !entry.includes('headless_shell')) {
        const p = join(base, entry, 'chrome-linux', 'chrome')
        if (existsSync(p)) return p
      }
    }
  }
  return undefined
}

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    executablePath: resolveChromiumPath(),
    // --no-sandbox is required to launch Chromium as root in the CI sandbox.
    args: ['--no-sandbox'],
  })
}
