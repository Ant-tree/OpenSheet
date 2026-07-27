import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { useStore } from './store/useStore'
import { useSettingsStore } from './settings'
import { initTheme } from './theme'
import { buildLabel, BUILD_HASH, BUILD_TIME } from './lib/build'
import './styles.css'

initTheme()

// Log the build stamp on boot so you can confirm (in the console) that a
// browser/WebView is serving the latest bundle, not a cached older one. Also
// exposed as window.OPENSHEET_BUILD for a quick check.
console.info(`OpenSheet build ${buildLabel()}`)
;(window as unknown as { OPENSHEET_BUILD: unknown }).OPENSHEET_BUILD = {
  hash: BUILD_HASH,
  time: BUILD_TIME,
}

// The app used to ship as a PWA (vite-plugin-pwa). That was removed — the app
// runs online on the web and is bundled locally in the desktop/mobile shells, so
// a precaching service worker only risked serving stale assets. Unregister any
// worker a previous version installed and drop its caches so existing installs
// stop being served from the old precache.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()))
  if ('caches' in window) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)))
  }
}

// Dev-only handle for debugging / automated verification in the browser console.
if (import.meta.env.DEV) {
  ;(window as unknown as { store: typeof useStore }).store = useStore
  ;(window as unknown as { settings: typeof useSettingsStore }).settings = useSettingsStore
  Promise.all([import('./lib/fileIO'), import('./lib/recentFiles'), import('xlsx')]).then(
    ([io, recent, xlsx]) => {
      Object.assign(window as object, { fileIO: io, recentFiles: recent, XLSX: xlsx })
    },
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
