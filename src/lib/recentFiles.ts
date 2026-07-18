// Recent files, stored as byte snapshots in IndexedDB so they can be reopened on
// any platform (web + Capacitor mobile) without File System Access permissions.

const DB_NAME = 'opensheet'
const STORE = 'recent'
const MAX_RECENT = 12

export interface RecentFile {
  id: string
  name: string
  savedAt: number
  bytes: ArrayBuffer
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function listRecentFiles(): Promise<RecentFile[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
    req.onsuccess = () => resolve((req.result as RecentFile[]).sort((a, b) => b.savedAt - a.savedAt))
    req.onerror = () => reject(req.error)
  })
}

/** Record a freshly opened/saved file (deduped by name, keeping only the newest). */
export async function addRecentFile(name: string, bytes: ArrayBuffer): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite')
      const store = t.objectStore(STORE)
      const all = store.getAll() as IDBRequest<RecentFile[]>
      all.onsuccess = () => {
        const existing = all.result
        existing.filter((f) => f.name === name).forEach((f) => store.delete(f.id))
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        store.put({ id, name, savedAt: Date.now(), bytes })
        existing
          .filter((f) => f.name !== name)
          .sort((a, b) => b.savedAt - a.savedAt)
          .slice(MAX_RECENT - 1)
          .forEach((f) => store.delete(f.id))
      }
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error)
    })
  } catch {
    // Storage full / unavailable — recent files are best-effort, never block a save/open.
  }
}

export async function removeRecentFile(id: string): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve) => {
    const t = db.transaction(STORE, 'readwrite')
    t.objectStore(STORE).delete(id)
    t.oncomplete = () => resolve()
    t.onerror = () => resolve()
  })
}

export async function clearRecentFiles(): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve) => {
    const t = db.transaction(STORE, 'readwrite')
    t.objectStore(STORE).clear()
    t.oncomplete = () => resolve()
    t.onerror = () => resolve()
  })
}

/** Localized "2 minutes ago"-style label using the platform's Intl support. */
export function relativeTime(ts: number, lang: string): string {
  const sec = Math.round((ts - Date.now()) / 1000)
  const abs = Math.abs(sec)
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
  if (abs < 60) return rtf.format(Math.round(sec), 'second')
  if (abs < 3600) return rtf.format(Math.round(sec / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(sec / 3600), 'hour')
  if (abs < 604800) return rtf.format(Math.round(sec / 86400), 'day')
  return new Date(ts).toLocaleDateString(lang)
}
