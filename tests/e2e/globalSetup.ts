import { createServer } from 'vite'
import type { GlobalSetupContext } from 'vitest/node'

/**
 * Boot the real Vite dev server once for the whole E2E run and hand its URL to
 * the tests via `inject('baseURL')`. The dev server (not a preview build) is
 * used on purpose: it exposes `window.store` / `window.fileIO` (see main.tsx),
 * which the tests read to assert on document state.
 */
export default async function setup({ provide }: GlobalSetupContext) {
  const server = await createServer({
    // A dedicated port so a developer's own `npm run dev` (5173) can run
    // alongside the tests without a clash.
    server: { port: 5178, strictPort: true, open: false },
    logLevel: 'error',
  })
  await server.listen()
  const url = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5178/'
  provide('baseURL', url)

  return async () => {
    await server.close()
  }
}

declare module 'vitest' {
  export interface ProvidedContext {
    baseURL: string
  }
}
