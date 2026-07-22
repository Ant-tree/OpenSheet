import { create } from 'zustand'

const STORAGE_KEY = 'opensheet.zoom'

export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 2
export const ZOOM_STEP = 0.1

/** Clamp and round to avoid float drift (e.g. 0.30000000004). */
export function clampZoom(z: number): number {
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
  return Math.round(clamped * 100) / 100
}

function detectZoom(): number {
  if (typeof localStorage !== 'undefined') {
    const saved = Number(localStorage.getItem(STORAGE_KEY))
    if (saved && !Number.isNaN(saved)) return clampZoom(saved)
  }
  return 1
}

interface ZoomState {
  zoom: number
  setZoom: (zoom: number) => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
}

function persist(zoom: number) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, String(zoom))
}

export const useZoomStore = create<ZoomState>((set, get) => ({
  zoom: detectZoom(),
  setZoom: (zoom) => {
    const z = clampZoom(zoom)
    persist(z)
    set({ zoom: z })
  },
  zoomIn: () => get().setZoom(get().zoom + ZOOM_STEP),
  zoomOut: () => get().setZoom(get().zoom - ZOOM_STEP),
  resetZoom: () => get().setZoom(1),
}))
