import { useRef } from 'react'
import { useStore } from '../store/useStore'
import { readWorkbookFile, exportWorkbook } from '../lib/fileIO'
import { NUMBER_FORMAT_PRESETS } from '../lib/format'
import type { HAlign } from '../types'

export default function Toolbar() {
  const fileRef = useRef<HTMLInputElement>(null)
  const applyFormat = useStore((s) => s.applyFormat)
  const mergeSelection = useStore((s) => s.mergeSelection)
  const unmergeSelection = useStore((s) => s.unmergeSelection)
  const sortSelection = useStore((s) => s.sortSelection)
  const loadWorkbook = useStore((s) => s.loadWorkbook)
  const getFormat = useStore((s) => s.getFormat)
  const selection = useStore((s) => s.selection)
  useStore((s) => s.rev) // subscribe so active-state buttons re-render

  const active = getFormat(selection.focus.row, selection.focus.col)

  const toggle = (kProp: 'bold' | 'italic' | 'underline') =>
    applyFormat({ [kProp]: !active?.[kProp] })

  const setAlign = (align: HAlign) => applyFormat({ align })

  const onOpenFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const wb = await readWorkbookFile(file)
      loadWorkbook(wb.sheets, wb.fileName)
    } catch (err) {
      alert('파일을 읽지 못했습니다: ' + (err as Error).message)
    }
    e.target.value = ''
  }

  const save = (format: 'xlsx' | 'csv') => {
    const { hf, sheets, fileName } = useStore.getState()
    exportWorkbook(hf, sheets, fileName, format)
  }

  return (
    <div className="toolbar">
      <div className="group">
        <button className="tbtn primary" onClick={() => fileRef.current?.click()}>
          📂 열기
        </button>
        <button className="tbtn" onClick={() => save('xlsx')}>
          💾 xlsx
        </button>
        <button className="tbtn" onClick={() => save('csv')}>
          💾 csv
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden-file-input"
          onChange={onOpenFile}
        />
      </div>

      <div className="group">
        <button
          className={`tbtn bold${active?.bold ? ' active' : ''}`}
          title="굵게 (Ctrl+B)"
          onClick={() => toggle('bold')}
        >
          B
        </button>
        <button
          className={`tbtn italic${active?.italic ? ' active' : ''}`}
          title="기울임 (Ctrl+I)"
          onClick={() => toggle('italic')}
        >
          I
        </button>
        <button
          className={`tbtn underline${active?.underline ? ' active' : ''}`}
          title="밑줄 (Ctrl+U)"
          onClick={() => toggle('underline')}
        >
          U
        </button>
      </div>

      <div className="group">
        <button
          className={`tbtn${active?.align === 'left' ? ' active' : ''}`}
          title="왼쪽 정렬"
          onClick={() => setAlign('left')}
        >
          ⬅
        </button>
        <button
          className={`tbtn${active?.align === 'center' ? ' active' : ''}`}
          title="가운데 정렬"
          onClick={() => setAlign('center')}
        >
          ↔
        </button>
        <button
          className={`tbtn${active?.align === 'right' ? ' active' : ''}`}
          title="오른쪽 정렬"
          onClick={() => setAlign('right')}
        >
          ➡
        </button>
      </div>

      <div className="group">
        <label className="color-field">
          글자
          <input
            type="color"
            value={active?.color ?? '#1f2328'}
            onChange={(e) => applyFormat({ color: e.target.value })}
          />
        </label>
        <label className="color-field">
          채우기
          <input
            type="color"
            value={active?.bgColor ?? '#ffffff'}
            onChange={(e) => applyFormat({ bgColor: e.target.value })}
          />
        </label>
      </div>

      <div className="group">
        <select
          title="숫자 서식"
          value={active?.numberFormat ?? 'General'}
          onChange={(e) => applyFormat({ numberFormat: e.target.value })}
        >
          {NUMBER_FORMAT_PRESETS.map((p) => (
            <option key={p.token} value={p.token}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="group">
        <button className="tbtn" title="셀 병합" onClick={mergeSelection}>
          ⊞ 병합
        </button>
        <button className="tbtn" title="병합 해제" onClick={unmergeSelection}>
          ⊟ 해제
        </button>
      </div>

      <div className="group">
        <button className="tbtn" title="오름차순 정렬" onClick={() => sortSelection(true)}>
          ↑ 정렬
        </button>
        <button className="tbtn" title="내림차순 정렬" onClick={() => sortSelection(false)}>
          ↓ 정렬
        </button>
      </div>
    </div>
  )
}
