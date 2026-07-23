import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// A minimal localStorage stub so the settings store can persist under Node.
function stubLocalStorage() {
  const map = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  })
  return map
}

describe('settings store (auto-save)', () => {
  let store: typeof import('../../src/settings')

  beforeEach(async () => {
    stubLocalStorage()
    vi.resetModules()
    store = await import('../../src/settings')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('defaults to off', () => {
    expect(store.useSettingsStore.getState().autoSave).toBe(false)
  })

  test('setAutoSave persists to localStorage', () => {
    store.useSettingsStore.getState().setAutoSave(true)
    expect(store.useSettingsStore.getState().autoSave).toBe(true)
    expect(localStorage.getItem('opensheet.autoSave')).toBe('1')
    store.useSettingsStore.getState().setAutoSave(false)
    expect(localStorage.getItem('opensheet.autoSave')).toBe('0')
  })

  test('toggleAutoSave flips the value', () => {
    const s = store.useSettingsStore.getState()
    expect(s.autoSave).toBe(false)
    s.toggleAutoSave()
    expect(store.useSettingsStore.getState().autoSave).toBe(true)
    store.useSettingsStore.getState().toggleAutoSave()
    expect(store.useSettingsStore.getState().autoSave).toBe(false)
  })

  test('reads a persisted value on load', async () => {
    localStorage.setItem('opensheet.autoSave', '1')
    vi.resetModules()
    const reloaded = await import('../../src/settings')
    expect(reloaded.useSettingsStore.getState().autoSave).toBe(true)
  })
})
