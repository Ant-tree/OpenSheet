// Build stamp injected by Vite `define` (see vite.config.ts). Lets you confirm a
// device/browser is running the latest bundle rather than a cached older one.
export const BUILD_HASH: string = typeof __BUILD_HASH__ === 'string' ? __BUILD_HASH__ : 'dev'
export const BUILD_TIME: string = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : ''

/** e.g. "4b15dd2 · 2026-07-28 09:40" (local time), or just the hash if no time. */
export function buildLabel(): string {
  if (!BUILD_TIME) return BUILD_HASH
  const d = new Date(BUILD_TIME)
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  return `${BUILD_HASH} · ${stamp}`
}
