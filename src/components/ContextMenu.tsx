import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store/useStore'
import { selectionBounds } from '../lib/utils'
import { useT } from '../i18n'

/** Right-click / long-press menu for the grid, anchored at (x, y). */
export default function ContextMenu({
  x,
  y,
  onClose,
}: {
  x: number
  y: number
  onClose: () => void
}) {
  const t = useT()

  useEffect(() => {
    const close = () => onClose()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
    }
  }, [onClose])

  const run = (fn: () => void) => () => {
    fn()
    onClose()
  }

  const b = () => selectionBounds(useStore.getState().selection)
  const rows = () => b().bottom - b().top + 1
  const cols = () => b().right - b().left + 1

  const doCopy = () => {
    const tsv = useStore.getState().copySelection()
    navigator.clipboard?.writeText(tsv).catch(() => {})
  }
  const doCut = () => {
    const tsv = useStore.getState().cutSelection()
    navigator.clipboard?.writeText(tsv).catch(() => {})
  }
  const doPaste = async () => {
    const store = useStore.getState()
    let text = ''
    try {
      text = await navigator.clipboard.readText()
    } catch {
      /* permission denied / unsupported */
    }
    if (!text) text = store.internalClipboardText() ?? ''
    if (text) store.pasteText(text)
  }
  const doPasteValues = async () => {
    const store = useStore.getState()
    let text = ''
    try {
      text = await navigator.clipboard.readText()
    } catch {
      /* ignore */
    }
    if (text) store.pasteValuesOnly(text)
    else store.pasteValuesOnly() // fall back to the internal clipboard
  }
  const hasClip = useStore.getState().hasClipboard()

  const focus = useStore.getState().selection.focus
  const hasNote = !!useStore.getState().getNote(focus.row, focus.col)
  const editNote = () => {
    const store = useStore.getState()
    const { row, col } = store.selection.focus
    const current = store.getNote(row, col) ?? ''
    const next = window.prompt(t('notePrompt'), current)
    if (next !== null) store.setNote(row, col, next)
  }
  const deleteNote = () => {
    const { row, col } = useStore.getState().selection.focus
    useStore.getState().setNote(row, col, '')
  }

  const hasLink = !!useStore.getState().getLink(focus.row, focus.col)
  const editLink = () => {
    const store = useStore.getState()
    const { row, col } = store.selection.focus
    const current = store.getLink(row, col) ?? ''
    const next = window.prompt(t('linkPrompt'), current)
    if (next !== null) store.setLink(row, col, next)
  }
  const deleteLink = () => {
    const { row, col } = useStore.getState().selection.focus
    useStore.getState().setLink(row, col, '')
  }

  // Keep the menu on-screen.
  const left = Math.min(x, window.innerWidth - 210)
  const top = Math.min(y, window.innerHeight - 380)

  return createPortal(
    <div
      className="dropdown-menu context-menu"
      style={{ top, left }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button className="menu-item" onClick={run(doCut)}>
        {t('cut')}
      </button>
      <button className="menu-item" onClick={run(doCopy)}>
        {t('copy')}
      </button>
      <button className="menu-item" onClick={run(doPaste)}>
        {t('paste')}
      </button>
      {hasClip && (
        <>
          <button className="menu-item" onClick={run(doPasteValues)}>
            {t('pasteValues')}
          </button>
          <button className="menu-item" onClick={run(() => useStore.getState().pasteFormatsOnly())}>
            {t('pasteFormats')}
          </button>
        </>
      )}
      <div className="menu-sep" />
      <button className="menu-item" onClick={run(() => useStore.getState().insertRows(b().top))}>
        {t('insertRowAbove')}
      </button>
      <button
        className="menu-item"
        onClick={run(() => useStore.getState().insertRows(b().bottom + 1))}
      >
        {t('insertRowBelow')}
      </button>
      <button className="menu-item" onClick={run(() => useStore.getState().insertCols(b().left))}>
        {t('insertColLeft')}
      </button>
      <button
        className="menu-item"
        onClick={run(() => useStore.getState().insertCols(b().right + 1))}
      >
        {t('insertColRight')}
      </button>
      <div className="menu-sep" />
      <button
        className="menu-item"
        onClick={run(() => useStore.getState().deleteRows(b().top, rows()))}
      >
        {t('deleteRow')}
      </button>
      <button
        className="menu-item"
        onClick={run(() => useStore.getState().deleteCols(b().left, cols()))}
      >
        {t('deleteCol')}
      </button>
      <button className="menu-item" onClick={run(() => useStore.getState().clearSelectedContents())}>
        {t('clearContents')}
      </button>
      <div className="menu-sep" />
      <button className="menu-item" onClick={run(() => useStore.getState().hideRows())}>
        {t('hideRows')}
      </button>
      <button className="menu-item" onClick={run(() => useStore.getState().hideCols())}>
        {t('hideCols')}
      </button>
      <button className="menu-item" onClick={run(() => useStore.getState().unhideRows())}>
        {t('unhideRows')}
      </button>
      <button className="menu-item" onClick={run(() => useStore.getState().unhideCols())}>
        {t('unhideCols')}
      </button>
      <div className="menu-sep" />
      <button className="menu-item" onClick={run(() => useStore.getState().mergeSelection())}>
        {t('merge')}
      </button>
      <button className="menu-item" onClick={run(() => useStore.getState().unmergeSelection())}>
        {t('unmerge')}
      </button>
      <div className="menu-sep" />
      <button className="menu-item" onClick={run(editNote)}>
        {hasNote ? t('editNote') : t('addNote')}
      </button>
      {hasNote && (
        <button className="menu-item" onClick={run(deleteNote)}>
          {t('deleteNote')}
        </button>
      )}
      <button className="menu-item" onClick={run(editLink)}>
        {hasLink ? t('editLink') : t('addLink')}
      </button>
      {hasLink && (
        <button className="menu-item" onClick={run(deleteLink)}>
          {t('removeLink')}
        </button>
      )}
    </div>,
    document.body,
  )
}
