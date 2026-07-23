import { defineConfig } from 'vitest/config'

// E2E / UI tests: real Chromium (playwright-core) driving the app served by a
// Vite dev server started in globalSetup. Kept in its own config so the fast
// unit suite (`npm test`) doesn't pull in a browser.
export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.e2e.test.ts'],
    globalSetup: ['tests/e2e/globalSetup.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // One dev server, one browser: run the E2E files serially in a single fork.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
  },
})
