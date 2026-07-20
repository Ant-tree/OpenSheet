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
  const cap = Capacitor as unknown as { isNativePlatform?: () => boolean }
  if (!cap?.isNativePlatform?.()) return false

  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])
  const data = await blobToBase64(blob)
  // writeFile returns the file's uri directly — use it for sharing (works on
  // both iOS and Android; the Share plugin handles the Android FileProvider).
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data,
    directory: Directory.Cache,
    recursive: true,
  })
  try {
    await Share.share({ title: filename, url: uri, dialogTitle: filename })
  } catch (err) {
    // Dismissing the share sheet rejects with "Share canceled" — not an error.
    const msg = String((err as { message?: string })?.message ?? err)
    if (!/cancel/i.test(msg)) throw err
  }
  return true
}
