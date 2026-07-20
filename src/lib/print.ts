/**
 * Print the current view, per platform:
 *
 * - **Tauri desktop app** — macOS WKWebView doesn't implement JS `window.print()`,
 *   so we invoke a native Rust command (see `src-tauri/src/lib.rs`).
 * - **Capacitor native app (iOS/Android)** — the wrapped web views also don't
 *   support `window.print()`. If a Capacitor Printer plugin is installed it is
 *   used; otherwise we fall back to `window.print()`.
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
  // plugin off the global Capacitor registry only if it was installed.
  const printer = w.Capacitor?.Plugins?.Printer
  if (w.Capacitor?.isNativePlatform?.() && printer) {
    printer.print({ content: document.documentElement.outerHTML }).catch(() => window.print())
    return
  }

  window.print()
}
