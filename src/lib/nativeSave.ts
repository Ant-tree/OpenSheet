import { Capacitor } from '@capacitor/core'

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
 * (iOS/Android). We can't trigger a `blob:` download in a web view, so the
 * bytes are written straight to disk and the location is returned (the caller
 * confirms it and offers a Share button). Documents is preferred (visible in
 * the iOS Files app when the Info.plist keys are set); we fall back to
 * app-specific storage if it isn't writable.
 */
export async function saveFileNative(blob: Blob, filename: string): Promise<NativeSaveResult> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const data = await blobToBase64(blob)
  const candidates: [string, (typeof Directory)[keyof typeof Directory]][] = [
    ['Documents', Directory.Documents],
    ['External', Directory.External],
    ['Data', Directory.Data],
  ]
  let lastErr: unknown
  for (const [name, dir] of candidates) {
    try {
      const { uri } = await Filesystem.writeFile({
        path: filename,
        data,
        directory: dir,
        recursive: true,
      })
      return { uri, directory: name, filename }
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
  const { Share } = await import('@capacitor/share')
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
