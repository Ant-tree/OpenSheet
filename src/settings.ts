import { create } from 'zustand'

const AUTOSAVE_KEY = 'opensheet.autoSave'

function detectAutoSave(): boolean {
  if (typeof localStorage !== 'undefined') return localStorage.getItem(AUTOSAVE_KEY) === '1'
  return false
}

interface SettingsState {
  /** When on, edits are written back to the open file automatically (debounced).
   *  Only effective where in-place save exists (web-Chromium handle / desktop
   *  path); a no-op on platforms that can't write back. */
  autoSave: boolean
  setAutoSave: (on: boolean) => void
  toggleAutoSave: () => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  autoSave: detectAutoSave(),
  setAutoSave: (on) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(AUTOSAVE_KEY, on ? '1' : '0')
    set({ autoSave: on })
  },
  toggleAutoSave: () => get().setAutoSave(!get().autoSave),
}))
