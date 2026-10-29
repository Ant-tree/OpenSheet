// Boot guard: shows the startup error instead of a blank window.
//
// This is a classic (non-module) script loaded before the app bundle, so it still
// runs when the bundle itself fails to load, parse, or evaluate (for example on
// an older WebKit in the macOS app, where release builds have no dev tools to
// read the console). Once React has rendered anything into #root, the in-app
// ErrorBoundary takes over and this script stays silent.
//
// The strings live here rather than in src/i18n.ts because that module is part
// of the bundle that may have failed to load.
;(function () {
  var FILE_PATH_KEY = 'opensheet.filePath'
  var LANG_KEY = 'opensheet.lang'
  var CHECK_DELAY_MS = 1500

  var messages = {
    en: {
      title: 'OpenSheet could not start',
      body: 'An error occurred while loading the app. Please send the details below to the developer.',
      startBlank: 'Start with a blank document',
      reload: 'Reload',
    },
    ko: {
      title: 'OpenSheet를 시작하지 못했습니다',
      body: '앱을 불러오는 중에 오류가 발생했습니다. 아래 내용을 개발자에게 전달해 주세요.',
      startBlank: '빈 문서로 시작',
      reload: '다시 불러오기',
    },
  }

  var errors = []
  var shown = false
  window.__OPENSHEET_BOOT_ERRORS__ = errors

  function detectLang() {
    try {
      var saved = localStorage.getItem(LANG_KEY)
      if (saved === 'en' || saved === 'ko') return saved
    } catch (e) {}
    var nav = (navigator.language || '').toLowerCase()
    return nav.indexOf('ko') === 0 ? 'ko' : 'en'
  }

  function describe(value) {
    if (value && value.stack) return String(value.stack)
    if (value && value.message) return String(value.message)
    return String(value)
  }

  function appRendered() {
    var root = document.getElementById('root')
    return !!root && root.childNodes.length > 0
  }

  function render() {
    if (shown || appRendered() || errors.length === 0) return
    shown = true
    var m = messages[detectLang()]

    var style = document.createElement('style')
    style.textContent =
      '#boot-error{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;' +
      'max-width:760px;margin:48px auto;padding:0 24px;color:#1f2328}' +
      '#boot-error h1{font-size:20px;margin:0 0 8px}' +
      '#boot-error p{margin:0 0 16px;color:#57606a}' +
      '#boot-error pre{white-space:pre-wrap;word-break:break-word;user-select:text;-webkit-user-select:text;' +
      'background:#f5f6f8;border:1px solid #d5d9de;border-radius:6px;padding:12px;font-size:12px;max-height:50vh;overflow:auto}' +
      '#boot-error button{margin-right:8px;padding:6px 14px;border-radius:6px;border:1px solid #d5d9de;background:#fff;color:#1f2328;font-size:14px;cursor:pointer}' +
      '#boot-error button.primary{background:#1a73e8;border-color:#1a73e8;color:#fff}' +
      '@media (prefers-color-scheme: dark){body{background:#1a1d21}#boot-error{color:#e6e8eb}#boot-error p{color:#9aa4b0}' +
      '#boot-error pre{background:#202429;border-color:#3a3f46}#boot-error button{background:#2a2f35;border-color:#3a3f46;color:#e6e8eb}' +
      '#boot-error button.primary{background:#4c8dff;border-color:#4c8dff;color:#fff}}'
    document.head.appendChild(style)

    var box = document.createElement('div')
    box.id = 'boot-error'
    box.setAttribute('role', 'alert')

    var title = document.createElement('h1')
    title.textContent = m.title
    var body = document.createElement('p')
    body.textContent = m.body
    var details = document.createElement('pre')
    details.textContent = errors.join('\n\n') + '\n\n' + navigator.userAgent

    var startBlank = document.createElement('button')
    startBlank.className = 'primary'
    startBlank.setAttribute('data-action', 'start-blank')
    startBlank.textContent = m.startBlank
    startBlank.onclick = function () {
      try {
        localStorage.removeItem(FILE_PATH_KEY)
      } catch (e) {}
      location.reload()
    }
    var reload = document.createElement('button')
    reload.setAttribute('data-action', 'reload')
    reload.textContent = m.reload
    reload.onclick = function () {
      location.reload()
    }

    box.appendChild(title)
    box.appendChild(body)
    box.appendChild(details)
    box.appendChild(startBlank)
    box.appendChild(reload)
    document.body.appendChild(box)
  }

  // React renders asynchronously after the bundle runs, so give it a moment
  // before deciding the app never came up.
  function record(text) {
    errors.push(text)
    setTimeout(render, CHECK_DELAY_MS)
  }

  window.addEventListener(
    'error',
    function (event) {
      var target = event.target
      // Capture phase also sees resource load failures (e.g. the bundle itself).
      if (target && target !== window && (target.src || target.href)) {
        record('Failed to load ' + (target.src || target.href))
        return
      }
      var where = event.filename ? ' (' + event.filename + ':' + event.lineno + ':' + event.colno + ')' : ''
      record(describe(event.error || event.message) + where)
    },
    true,
  )
  window.addEventListener('unhandledrejection', function (event) {
    record('Unhandled rejection: ' + describe(event.reason))
  })
})()
