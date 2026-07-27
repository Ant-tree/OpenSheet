import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

// A build stamp so you can confirm a device/browser is running the latest bundle
// (short git hash + build time). Shown in the F1 help panel and logged on boot.
function gitHash(): string {
  try {
    const hash = execSync('git rev-parse --short HEAD').toString().trim()
    const dirty = execSync('git status --porcelain').toString().trim() ? '+' : ''
    return hash + dirty
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_HASH__: JSON.stringify(gitHash()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    port: 5173,
    open: true,
  },
})
