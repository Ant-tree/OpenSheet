import { create } from 'zustand'

interface ToastState {
  message: string | null
  /** Monotonic id so re-showing the same text still restarts the timer. */
  id: number
  show: (message: string) => void
  clear: (id?: number) => void
}

/** A tiny transient toast (used e.g. to report actions unsupported in the app). */
export const useToastStore = create<ToastState>((set, get) => ({
  message: null,
  id: 0,
  show: (message) => set((s) => ({ message, id: s.id + 1 })),
  clear: (id) => {
    // Ignore stale timers from an earlier toast that was superseded.
    if (id !== undefined && id !== get().id) return
    set({ message: null })
  },
}))

export function showToast(message: string): void {
  useToastStore.getState().show(message)
}
