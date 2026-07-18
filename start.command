#!/usr/bin/env bash
#
# OpenSheet launcher (macOS)
# Finder에서 이 파일을 더블클릭하면 서버가 뜨고 브라우저가 열립니다.
# Double-click in Finder to start the server and open the browser.
#
set -e
cd "$(dirname "$0")"

echo "──────────────────────────────────────────"
echo "  OpenSheet"
echo "──────────────────────────────────────────"

# 1) Node.js 확인 / check Node.js
if ! command -v node >/dev/null 2>&1; then
  MSG="Node.js가 설치되어 있지 않습니다. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해 주세요."
  echo "$MSG"
  osascript -e "display alert \"Node.js가 필요합니다\" message \"$MSG\"" >/dev/null 2>&1 || true
  exit 1
fi
echo "✓ Node.js $(node -v)"

# 2) 의존성 설치 (최초 1회) / install dependencies on first run
if [ ! -d node_modules ]; then
  echo "· 최초 실행: 의존성을 설치합니다 (수 분 소요될 수 있음)..."
  npm install
fi

# 3) 개발 서버 실행 (vite가 브라우저를 자동으로 엽니다)
#    start the dev server — vite opens the browser automatically
echo "· 서버를 시작합니다. 종료하려면 이 창에서 Ctrl+C 를 누르세요."
echo "  주소: http://localhost:5173"
echo "──────────────────────────────────────────"
exec npm run dev
