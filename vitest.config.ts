import { defineConfig } from 'vitest/config'

// Unit tests: pure functions from src/lib, run in a plain Node environment.
// Fast, no browser, no dev server. E2E lives in vitest.e2e.config.ts.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
})
