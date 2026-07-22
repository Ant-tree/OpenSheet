import { Capacitor, registerPlugin } from '@capacitor/core'
// Static imports (not `await import(...)`): dynamic-import chunks fail to load in
// the Capacitor WebView ("Failed to fetch dynamically imported module"), so the
// plugins are bundled with the app instead of fetched on demand at save time.
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/** Custom Android plugin: save bytes to a user-picked location via the Storage
 *  Access Framework (see android/.../SafSaverPlugin.java). */
interface SafSaverPlugin {
  saveDocument(options: {
    data: string
    filename: string
    mimeType: string
  }): Promise<{ saved: boolean; uri?: string }>
}
const SafSaver = registerPlugin<SafSaverPlugin>('SafSaver')

/**
 * Show the Android "Save As" system dialog (SAF) and write `base64` to the
 * chosen file. Returns 'cancelled' if the user dismissed it, or 'unavailable'
 * when the native plugin isn't present (older build / non-Android), so the
 * caller can fall back.
 */
export async function safSaveDocument(
  base64: string,
  filename: string,
  mimeType: string,
): Promise<'saved' | 'cancelled' | 'unavailable'> {
  if (nativePlatform() !== 'android') return 'unavailable'
  try {
    const res = await SafSaver.saveDocument({ data: base64, filename, mimeType })
    return res.saved ? 'saved' : 'cancelled'
  } catch {
    // Plugin not registered (app not rebuilt) — let the caller fall back.
    return 'unavailable'
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const result = reader.result as string
      // strip the "data:...;base64," prefix
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(blob)
  })
}

/** Where a file was written on a native app, so it can be shown/shared afterward. */
export interface NativeSaveResult {
  /** The file's native uri (used for sharing). */
  uri: string
  /** The Capacitor directory it landed in ('Documents' | 'External' | 'Data'). */
  directory: string
  filename: string
}

export function isNativePlatform(): boolean {
  const cap = Capacitor as unknown as { isNativePlatform?: () => boolean }
  return !!cap?.isNativePlatform?.()
}

export function nativePlatform(): string {
  const cap = Capacitor as unknown as { getPlatform?: () => string }
  return cap.getPlatform?.() ?? ''
}

/**
 * Write a file to a user-accessible folder on a Capacitor native app
 * (iOS/Android). We can't trigger a `blob:` download in a web view, so the bytes
 * are written straight to disk and the location is returned (the caller confirms
 * it and offers a Share button).
 *
 * Android: try the public Downloads then Documents folder (needs the storage
 * permission, requested here). That lands in the shared, user-browsable storage
 * on Android ≤10; on 11+ those writes are restricted, so we fall back to
 * app-specific storage (still saved, and shareable out).
 * iOS: the app Documents folder (visible in the Files app via the Info.plist
 * keys).
 */
export async function saveFileNative(blob: Blob, filename: string): Promise<NativeSaveResult> {
  const data = await blobToBase64(blob)
  type Target = { label: string; directory: Directory; path: string }

  const appTargets: Target[] = [
    { label: 'App storage', directory: Directory.External, path: filename },
    { label: 'App storage', directory: Directory.Data, path: filename },
  ]

  let targets: Target[]
  if (nativePlatform() === 'android') {
    let granted = false
    try {
      let perm = await Filesystem.checkPermissions()
      if (perm.publicStorage !== 'granted') perm = await Filesystem.requestPermissions()
      granted = perm.publicStorage === 'granted'
    } catch {
      /* older API without a permission model — just try the writes */
    }
    const publicTargets: Target[] = granted
      ? [
          { label: 'Download', directory: Directory.ExternalStorage, path: `Download/${filename}` },
          { label: 'Documents', directory: Directory.Documents, path: filename },
        ]
      : []
    targets = [...publicTargets, ...appTargets]
  } else {
    targets = [{ label: 'Documents', directory: Directory.Documents, path: filename }, ...appTargets]
  }

  let lastErr: unknown
  for (const t of targets) {
    try {
      const { uri } = await Filesystem.writeFile({
        path: t.path,
        data,
        directory: t.directory,
        recursive: true,
      })
      return { uri, directory: t.label, filename }
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/**
 * Open the OS share sheet for an already-written file so the user can save it to
 * Files / Drive or send it on. Android must receive the file in `files` (shared
 * via the plugin's FileProvider); iOS shares fine via `url`.
 */
export async function shareFileNative(result: NativeSaveResult): Promise<void> {
  try {
    await Share.share(
      nativePlatform() === 'android'
        ? { title: result.filename, dialogTitle: result.filename, files: [result.uri] }
        : { title: result.filename, dialogTitle: result.filename, url: result.uri },
    )
  } catch (err) {
    // Dismissing the share sheet rejects with "Share canceled" — not an error.
    const msg = String((err as { message?: string })?.message ?? err)
    if (!/cancel/i.test(msg)) throw err
  }
}
