import { useEffect } from 'react'
import { useT, type MsgKey } from '../i18n'

// ⌘ on macOS, Ctrl elsewhere (desktop + web). Mobile has no hardware keyboard,
// but the panel is still readable there and harmless to show.
const IS_MAC =
  typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent)
const MOD = IS_MAC ? '⌘' : 'Ctrl'

type Row = { desc: MsgKey; keys: string[] }
type Group = { title: MsgKey; rows: Row[] }

const GROUPS: Group[] = [
  {
    title: 'scGroupFile',
    rows: [{ desc: 'scSave', keys: [`${MOD}+S`] }],
  },
  {
    title: 'scGroupEditing',
    rows: [
      { desc: 'scEditCell', keys: ['Enter', 'F2'] },
      { desc: 'scConfirm', keys: ['Enter'] },
      { desc: 'scCancel', keys: ['Esc'] },
      { desc: 'scClear', keys: ['Delete'] },
      { desc: 'scUndo', keys: [`${MOD}+Z`] },
      { desc: 'scRedo', keys: [`${MOD}+Y`, `${MOD}+Shift+Z`] },
      { desc: 'scFillDown', keys: [`${MOD}+D`] },
      { desc: 'scFillRight', keys: [`${MOD}+R`] },
      { desc: 'scBold', keys: [`${MOD}+B`] },
      { desc: 'scItalic', keys: [`${MOD}+I`] },
      { desc: 'scUnderline', keys: [`${MOD}+U`] },
      { desc: 'scFind', keys: [`${MOD}+F`] },
      { desc: 'scReplace', keys: [`${MOD}+H`] },
    ],
  },
  {
    title: 'scGroupNav',
    rows: [
      { desc: 'scMove', keys: ['←', '↑', '→', '↓'] },
      { desc: 'scExtend', keys: ['Shift+←…'] },
      { desc: 'scNextCell', keys: ['Tab', 'Shift+Tab'] },
      { desc: 'scSwitchSheet', keys: [`${MOD}+PgUp`, `${MOD}+PgDn`] },
    ],
  },
  {
    title: 'scGroupView',
    rows: [{ desc: 'scZoom', keys: [`${MOD}+`, `${MOD}−`, `${MOD}0`] }],
  },
]

export default function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const t = useT()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="saveas-overlay" onMouseDown={onClose}>
      <div
        className="shortcuts-modal"
        role="dialog"
        aria-label={t('keyboardShortcuts')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-head">
          <span className="saved-title">{t('keyboardShortcuts')}</span>
          <button className="saveas-btn" onClick={onClose}>
            {t('close')}
          </button>
        </div>
        <div className="shortcuts-body">
          {GROUPS.map((g) => (
            <div className="shortcuts-group" key={g.title}>
              <div className="shortcuts-group-title">{t(g.title)}</div>
              {g.rows.map((r) => (
                <div className="shortcuts-row" key={r.desc}>
                  <span className="shortcuts-desc">{t(r.desc)}</span>
                  <span className="shortcuts-keys">
                    {r.keys.map((k, i) => (
                      <kbd className="shortcuts-kbd" key={i}>
                        {k}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
