import { create } from 'zustand'

export type Lang = 'en' | 'ko'

const STORAGE_KEY = 'opensheet.lang'

export function detectLang(): Lang {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'ko') return saved
  }
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ko')) {
    return 'ko'
  }
  return 'en'
}

const dict = {
  en: {
    open: 'Open',
    save: 'Save',
    saveInPlace: 'Save',
    saveInPlaceHint: 'Open a file first',
    saveXlsx: 'Save as xlsx…',
    saveCsv: 'Save as csv…',
    bold: 'Bold (Ctrl+B)',
    italic: 'Italic (Ctrl+I)',
    underline: 'Underline (Ctrl+U)',
    alignLeft: 'Align left',
    alignCenter: 'Align center',
    alignRight: 'Align right',
    textColor: 'Text color',
    fillColor: 'Fill color',
    numberFormat: 'Number format',
    borders: 'Borders',
    bordersHint: 'Borders for selection',
    borderAll: 'All borders',
    borderOuter: 'Outer border',
    borderTop: 'Top',
    borderBottom: 'Bottom',
    borderLeft: 'Left',
    borderRight: 'Right',
    borderNone: 'No border',
    merge: 'Merge',
    unmerge: 'Unmerge',
    sortAsc: 'Sort ascending',
    sortDesc: 'Sort descending',
    addSheet: 'Add sheet',
    deleteSheet: 'Delete sheet',
    deleteSheetConfirm: "Delete the '{name}' sheet?",
    renameHint: 'Double-click to rename',
    formulaPlaceholder: 'Value or =formula',
    statusCount: 'Count',
    statusSum: 'Sum',
    statusAvg: 'Average',
    language: 'Language',
    readFail: 'Could not read the file: ',
    saveFail: 'Could not save: ',
    errXls: 'The legacy .xls format is not supported. Please re-save as .xlsx and open again.',
    defaultFileName: 'Workbook.xlsx',
    fmtGeneral: 'General',
    fmtNumber: 'Number (1,234)',
    fmtDecimal: 'Decimal (1,234.00)',
    fmtPercent: 'Percent (12%)',
    fmtPercent2: 'Percent (12.00%)',
    fmtCurrencyUsd: 'Currency ($)',
    fmtCurrencyKrw: 'Currency (₩)',
    fmtDate: 'Date (2024-01-31)',
  },
  ko: {
    open: '열기',
    save: '저장',
    saveInPlace: '원본에 저장',
    saveInPlaceHint: '먼저 파일을 열어 주세요',
    saveXlsx: 'xlsx로 저장…',
    saveCsv: 'csv로 저장…',
    bold: '굵게 (Ctrl+B)',
    italic: '기울임 (Ctrl+I)',
    underline: '밑줄 (Ctrl+U)',
    alignLeft: '왼쪽 정렬',
    alignCenter: '가운데 정렬',
    alignRight: '오른쪽 정렬',
    textColor: '글자 색',
    fillColor: '채우기 색',
    numberFormat: '숫자 서식',
    borders: '테두리',
    bordersHint: '선택 영역 테두리',
    borderAll: '모든 테두리',
    borderOuter: '바깥쪽 테두리',
    borderTop: '위쪽',
    borderBottom: '아래쪽',
    borderLeft: '왼쪽',
    borderRight: '오른쪽',
    borderNone: '테두리 없음',
    merge: '병합',
    unmerge: '병합 해제',
    sortAsc: '오름차순 정렬',
    sortDesc: '내림차순 정렬',
    addSheet: '시트 추가',
    deleteSheet: '시트 삭제',
    deleteSheetConfirm: "'{name}' 시트를 삭제할까요?",
    renameHint: '더블클릭하여 이름 변경',
    formulaPlaceholder: '값 또는 =수식 입력',
    statusCount: '개수',
    statusSum: '합계',
    statusAvg: '평균',
    language: '언어',
    readFail: '파일을 읽지 못했습니다: ',
    saveFail: '저장하지 못했습니다: ',
    errXls: '구형 .xls 형식은 지원하지 않습니다. .xlsx로 저장한 뒤 다시 열어 주세요.',
    defaultFileName: '통합 문서.xlsx',
    fmtGeneral: '일반',
    fmtNumber: '숫자 (1,234)',
    fmtDecimal: '소수 (1,234.00)',
    fmtPercent: '백분율 (12%)',
    fmtPercent2: '백분율 (12.00%)',
    fmtCurrencyUsd: '통화 ($)',
    fmtCurrencyKrw: '통화 (₩)',
    fmtDate: '날짜 (2024-01-31)',
  },
} as const

export type MsgKey = keyof (typeof dict)['en']

export function t(key: MsgKey, lang: Lang): string {
  return dict[lang][key] ?? dict.en[key] ?? key
}

interface LangState {
  lang: Lang
  setLang: (lang: Lang) => void
}

export const useLangStore = create<LangState>((set) => ({
  lang: detectLang(),
  setLang: (lang) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, lang)
    set({ lang })
  },
}))

/** Hook returning a translate function bound to the current language. */
export function useT(): (key: MsgKey) => string {
  const lang = useLangStore((s) => s.lang)
  return (key) => t(key, lang)
}
