import { create } from 'zustand'

export type Theme = 'auto' | 'light' | 'dark'

const STORAGE_KEY = 'opensheet.theme'

export function detectTheme(): Theme {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'auto' || saved === 'light' || saved === 'dark') return saved
  }
  return 'auto'
}

function resolved(theme: Theme): 'light' | 'dark' {
  if (theme === 'auto') {
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
    return 'light'
  }
  return theme
}

/** Apply the resolved theme to the document root as a data-theme attribute. */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', resolved(theme))
}

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: detectTheme(),
  setTheme: (theme) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, theme)
    applyTheme(theme)
    set({ theme })
  },
}))

/** Wire up initial theme and keep 'auto' in sync with the OS preference. */
export function initTheme(): void {
  applyTheme(detectTheme())
  if (typeof matchMedia !== 'undefined') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (useThemeStore.getState().theme === 'auto') applyTheme('auto')
    })
  }
}
