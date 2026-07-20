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

# 2) 의존성: 없거나 package-lock가 바뀐 경우에만 설치 (재실행은 즉시)
#    Install deps only when missing or the lockfile changed (e.g. after a pull).
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo "· 의존성을 설치합니다 (최초 실행/변경 시, 수 분 소요될 수 있음)..."
  npm install
else
  echo "✓ 의존성 최신"
fi

# 3) 빌드: dist가 없거나 소스가 마지막 빌드보다 새 경우에만 (변경 없으면 건너뜀)
#    Rebuild only when dist is missing or the source changed since the last build.
#    (개발 서버가 아니라 빌드 결과를 서빙해야 빠릅니다 — 개발 모드는 훨씬 느림.)
NEED_BUILD=0
if [ ! -f dist/index.html ]; then
  NEED_BUILD=1
elif [ -n "$(find src public index.html vite.config.ts tsconfig.json package.json -newer dist/index.html 2>/dev/null)" ]; then
  NEED_BUILD=1
fi
if [ "$NEED_BUILD" = "1" ]; then
  echo "· 앱을 빌드합니다 (변경 감지, 수십 초 소요될 수 있음)..."
  ./node_modules/.bin/vite build
else
  echo "✓ 빌드 최신 (건너뜀)"
fi

# 4) 미리보기 서버 실행 (vite가 브라우저를 자동으로 엽니다)
#    serve the build — vite opens the browser automatically
echo "· 서버를 시작합니다. 종료하려면 이 창에서 Ctrl+C 를 누르세요."
echo "  주소: http://localhost:4173"
echo "──────────────────────────────────────────"
exec npm run preview -- --open
