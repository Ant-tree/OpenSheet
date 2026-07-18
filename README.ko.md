# OpenSheet

마이크로소프트 엑셀과 유사하게 동작하는 웹 기반 스프레드시트 편집기입니다.
`.xlsx`와 `.csv` 파일을 열고, 편집하고, 다시 저장할 수 있습니다.

브라우저에서 완전히 로컬로 동작하며(파일은 서버로 전송되지 않습니다), 원하면 정적 호스팅으로 웹 배포도 가능합니다.

**English docs: [README.md](README.md)**

## 실행 방법

```bash
npm install
npm run dev      # http://localhost:5173 자동 실행
```

프로덕션 빌드 / 배포:

```bash
npm run build    # dist/ 에 정적 파일 생성
npm run preview  # 빌드 결과 미리보기
```

## 주요 기능

| 기능 | 설명 |
| --- | --- |
| **수식 / 함수** | `=SUM`, `=AVERAGE`, `=IF`, `=VLOOKUP` 등 약 400개 엑셀 호환 함수 ([HyperFormula](https://hyperformula.handsontable.com/) 엔진) |
| **셀 서식** | 굵게 · 기울임 · 밑줄, 글자/채우기 색, 정렬, 숫자 서식(통화·백분율·소수·날짜), 셀 병합 |
| **정렬** | 선택 범위를 기준 열로 오름/내림차순 정렬 — 수식의 상대 참조를 이동량만큼 자동 보정 |
| **다중 시트** | 시트 탭 추가 · 삭제 · 이름 변경, 시트 간 참조 |
| **파일 입출력** | `.xlsx` / `.csv` 열기·저장. 수식과 병합 셀이 왕복 보존됨 |

## 조작법

- **셀 이동**: 방향키 / 클릭 / 드래그(범위 선택), Shift+클릭(범위 확장)
- **편집 시작**: 더블클릭, `Enter`, `F2`, 또는 문자 입력 시작
- **편집 확정**: `Enter`(아래로) / `Tab`(오른쪽으로), `Esc`(취소)
- **삭제**: `Delete` / `Backspace`
- **서식 단축키**: `Ctrl/Cmd+B` (굵게), `Ctrl/Cmd+I` (기울임), `Ctrl/Cmd+U` (밑줄)
- **수식 입력**: 셀 또는 상단 수식 입력줄에 `=`로 시작하는 식 입력
- **열 너비 조절**: 열 머리글 경계 드래그
- **시트 이름 변경**: 시트 탭 더블클릭

하단 상태 표시줄에는 선택 범위의 **개수 · 합계 · 평균**이 실시간 표시됩니다.

## 기술 스택

- **Vite + React + TypeScript** — UI와 그리드 렌더링
- **HyperFormula** — 엑셀 호환 수식 계산 엔진
- **SheetJS (xlsx)** — `.xlsx` / `.csv` 파싱 및 생성
- **Zustand** — 상태 관리

## 구조

```
src/
  App.tsx              레이아웃 + 전역 단축키 + 상태 표시줄
  components/
    Toolbar.tsx        파일 입출력 · 서식 · 병합 · 정렬 버튼
    FormulaBar.tsx     이름 상자 + 수식 입력줄
    Grid.tsx           스프레드시트 그리드(선택·편집·병합·열 조절)
    SheetTabs.tsx      시트 탭
  store/useStore.ts    HyperFormula를 감싼 Zustand 스토어(모든 편집 로직)
  lib/
    fileIO.ts          SheetJS 기반 xlsx/csv 읽기·쓰기
    format.ts          숫자·날짜 표시 서식
    utils.ts           주소 변환 · 선택 영역 · 수식 참조 이동
  types.ts             공용 타입
```

## 알려진 한계

- 그리드는 200행 × 52열(A–AZ)까지 표시합니다(필요 시 `store/useStore.ts`의 `MAX_ROWS`/`MAX_COLS` 조정).
- 셀 서식(색·굵기 등)은 `.xlsx` 저장 시 아직 기록되지 않습니다(값·수식·병합은 보존).
- 정렬의 수식 참조 보정은 같은 행을 참조하는 일반적인 경우(`=B2*C2`)를 대상으로 합니다.

## 라이센스

[MIT](LICENSE) © Ant-tree
