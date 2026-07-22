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

/**
 * Save a file on a Capacitor native app (iOS/Android). The wrapped web view
 * can't download a `blob:` URL — on iOS that fails with an `NSOSStatusError`
 * (-10814) — so we write the bytes to the app cache and open the system share
 * sheet, letting the user save to Files / send it on.
 *
 * Returns `true` when it handled the save (native platform), `false` otherwise
 * so the caller can fall back to a normal browser download.
 */
export async function saveOnNative(blob: Blob, filename: string): Promise<boolean> {
  const cap = Capacitor as unknown as {
    isNativePlatform?: () => boolean
    getPlatform?: () => string
  }
  if (!cap?.isNativePlatform?.()) return false
  const platform = cap.getPlatform?.() ?? ''

  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])
  const data = await blobToBase64(blob)
  // writeFile returns the file's uri directly — used below for sharing.
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data,
    directory: Directory.Cache,
    recursive: true,
  })
  try {
    // Android must receive the file in `files` (the plugin exposes it through
    // its FileProvider); passing a bare `file://` in `url` there does NOT attach
    // the file — the share sheet silently no-ops, so "Save As" appeared to do
    // nothing. iOS shares the file correctly via `url`.
    await Share.share(
      platform === 'android'
        ? { title: filename, dialogTitle: filename, files: [uri] }
        : { title: filename, dialogTitle: filename, url: uri },
    )
  } catch (err) {
    // Dismissing the share sheet rejects with "Share canceled" — not an error.
    const msg = String((err as { message?: string })?.message ?? err)
    if (!/cancel/i.test(msg)) throw err
  }
  return true
}
