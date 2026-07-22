import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useToastStore } from '../lib/toast'

/** Renders the current transient toast message near the bottom of the screen. */
export default function Toast() {
  const message = useToastStore((s) => s.message)
  const id = useToastStore((s) => s.id)
  const clear = useToastStore((s) => s.clear)

  useEffect(() => {
    if (message === null) return
    const timer = window.setTimeout(() => clear(id), 3200)
    return () => window.clearTimeout(timer)
  }, [message, id, clear])

  if (message === null) return null
  return createPortal(
    <div className="toast" role="status" onClick={() => clear()}>
      {message}
    </div>,
    document.body,
  )
}
