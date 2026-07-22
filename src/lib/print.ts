import { t, useLangStore } from '../i18n'
import { showToast } from './toast'

/**
 * Print the current view, per platform:
 *
 * - **Tauri desktop app** — macOS WKWebView doesn't implement JS `window.print()`,
 *   so we invoke a native Rust command (see `src-tauri/src/lib.rs`).
 * - **Capacitor native app (iOS/Android)** — the wrapped web views don't support
 *   `window.print()` (it's a silent no-op). If a Capacitor Printer plugin is
 *   installed it is used; otherwise we show a toast that printing isn't available.
 * - **Any browser / PWA** — `window.print()` works directly.
 */
export function printPage(): void {
  const w = window as unknown as {
    __TAURI_INTERNALS__?: { invoke: (cmd: string, args?: unknown) => Promise<unknown> }
    Capacitor?: {
      isNativePlatform?: () => boolean
      Plugins?: { Printer?: { print: (opts: { content?: string }) => Promise<unknown> } }
    }
  }

  // Tauri desktop: native print command.
  if (w.__TAURI_INTERNALS__ && typeof w.__TAURI_INTERNALS__.invoke === 'function') {
    w.__TAURI_INTERNALS__.invoke('print_page').catch(() => window.print())
    return
  }

  // Capacitor native: use the Printer plugin if present (window.print is a
  // no-op inside the wrapped web view). No build-time dependency — we read the
  // plugin off the global Capacitor registry only if it was installed. Without
  // it, tell the user printing/PDF isn't available in the app instead of doing
  // nothing.
  if (w.Capacitor?.isNativePlatform?.()) {
    const printer = w.Capacitor?.Plugins?.Printer
    if (printer) {
      printer.print({ content: document.documentElement.outerHTML }).catch(() =>
        showToast(t('printUnsupported', useLangStore.getState().lang)),
      )
      return
    }
    showToast(t('printUnsupported', useLangStore.getState().lang))
    return
  }

  window.print()
}
