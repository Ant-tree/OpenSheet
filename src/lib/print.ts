/**
 * Print the current view. In the Tauri desktop app on macOS the webview
 * (WKWebView) does not implement JS `window.print()`, so we invoke a native
 * Rust command instead. In a normal browser we just call `window.print()`.
 */
export function printPage(): void {
  const internals = (
    window as unknown as {
      __TAURI_INTERNALS__?: { invoke: (cmd: string, args?: unknown) => Promise<unknown> }
    }
  ).__TAURI_INTERNALS__
  if (internals && typeof internals.invoke === 'function') {
    internals.invoke('print_page').catch(() => window.print())
    return
  }
  window.print()
}
