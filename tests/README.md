# Tests

Two suites, run separately so the fast one has no browser dependency.

| Command | What it runs |
|---|---|
| `npm test` / `npm run test:unit` | Vitest unit tests (`tests/unit/`) — pure functions from `src/lib`, Node env, no browser. |
| `npm run test:e2e` | Playwright E2E (`tests/e2e/`) — real Chromium driving the app on a Vite dev server. |
| `npm run test:all` | unit then e2e. |
| `npm run test:watch` | unit tests in watch mode. |

## E2E details

- **Runner:** Vitest (`vitest.e2e.config.ts`), single fork, serial.
- **Server:** `tests/e2e/globalSetup.ts` boots the real Vite dev server once on
  port 5178 and hands its URL to tests via `inject('baseURL')`. The dev server
  (not a preview build) is used because it exposes `window.store` /
  `window.fileIO` (see `src/main.tsx`) for state assertions.
- **Browser:** `playwright-core` (no bundled download). `tests/e2e/browser.ts`
  resolves a Chromium binary in this order:
  1. `$OPENSHEET_CHROME` (explicit override),
  2. a `chromium-*` browser under `$PLAYWRIGHT_BROWSERS_PATH`,
  3. playwright-core's own registered browser.

  On a normal dev machine a standard `npx playwright install chromium` (or an
  existing Playwright install) satisfies step 3. In CI/sandbox images the
  browser is already unpacked under `$PLAYWRIGHT_BROWSERS_PATH` (step 2).

## What E2E cannot cover

Native shells — Tauri desktop, iOS/Android — and OS file pickers can't be
driven headlessly. Those paths are gated behind `isTauri()` /
`nativePlatform()` and must be verified on-device (see `CLAUDE.md` gotcha #9).
Web + desktop-JS logic is fully covered here.
