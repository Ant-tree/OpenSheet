import { create } from 'zustand'

// TEMPORARY on-device touch diagnostics. Flip to false (or delete this module +
// <TouchDebug/> + the tlog() calls) once header resize is confirmed on Android.
export const DEBUG_TOUCH = true

interface TouchDebugState {
  lines: string[]
  log: (line: string) => void
  clear: () => void
}

export const useTouchDebug = create<TouchDebugState>((set, get) => ({
  lines: [],
  log: (line) => {
    if (!DEBUG_TOUCH) return
    set({ lines: [...get().lines, line].slice(-10) })
  },
  clear: () => set({ lines: [] }),
}))

/** Safe logger usable from non-React code (native event listeners). */
export function tlog(line: string): void {
  if (!DEBUG_TOUCH) return
  try {
    useTouchDebug.getState().log(line)
  } catch {
    /* ignore */
  }
}
