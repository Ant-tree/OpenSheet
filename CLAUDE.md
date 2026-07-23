# CLAUDE.md — OpenSheet

Project context for Claude Code. OpenSheet is an offline-first spreadsheet app
that ships as a **web app / PWA**, a **Tauri desktop app** (macOS/Windows/Linux),
and a **Capacitor mobile app** (iOS/Android) from one React/TypeScript codebase.

## Tech stack

- **UI:** React 18 + TypeScript, Vite, plain CSS (`src/styles.css`, CSS variables
  for theming). No component library. Icons are inline SVGs (`src/icons/*.svg`,
  loaded via `import.meta.glob` in `Icon.tsx`).
- **State:** Zustand (`src/store/useStore.ts`, the single document store; plus
  small stores `theme.ts`, `zoom.ts`, `lib/toast.ts`).
- **Formulas:** HyperFormula (`gpl-v3` license key). The store holds cell content
  in HyperFormula; per-cell formatting/notes/merges/etc. live in `SheetMeta`.
- **File format:** ExcelJS for `.xlsx`/`.csv` read/write (`src/lib/fileIO.ts`).
- **Desktop:** Tauri v2 (`src-tauri/`, Rust). No `@tauri-apps/api`-free — we DO
  depend on `@tauri-apps/api` (see gotchas).
- **Mobile:** Capacitor 8 (`@capacitor/core|filesystem|share`), plus one custom
  native Android plugin `SafSaverPlugin` (Java).
- **i18n:** `src/i18n.ts` (en/ko). **Every user-facing string must be added to
  both `en` and `ko`.**

## Commands

```bash
npm run dev              # Vite dev server (localhost:5173)
npm run build            # tsc -b && vite build  -> dist/
npm run tauri dev        # desktop app (rebuilds Rust)
npm run tauri build      # desktop release
npm run cap:sync         # build + cap sync (ios+android)
npx cap sync android     # copy dist/ into the Android project (REQUIRED after web changes)
```

Rust `cargo check` can't run in every environment (needs Linux GTK system libs);
that's an environment limitation, not a code error.

## Architecture / layout

- `src/store/useStore.ts` — the document: sheets, selection, editing, formats,
  merges, filters, undo/redo, file handle/path, all mutations. **`rev` is bumped
  on every document mutation to trigger re-renders.**
- `src/components/Grid.tsx` — the virtualized grid (fixed row height!), cell
  editing (persistent focused `<input>` per active cell for IME safety), mouse +
  touch selection, fill handle, zoom-scaled geometry.
- `src/components/Toolbar.tsx` — file ops (open/save/save-as), formatting, and
  opens the panels (cond-format, chart, data-validation, find/replace).
- `src/components/{FormulaBar,SheetTabs,FindReplace,CondFormatPanel,ChartPanel,
  DataValidationPanel,ContextMenu,FilterDropdown,FormulaAutocomplete,Toast}.tsx`
- `src/lib/` — `fileIO.ts` (import/export + all platform save/open dispatch),
  `nativeSave.ts` (Capacitor Filesystem/Share + `SafSaver` bindings),
  `print.ts`, `format.ts`, `condFormat.ts`, `chartRender.ts`, `recentFiles.ts`
  (IndexedDB recents), `utils.ts`.
- `src-tauri/src/lib.rs` — Rust commands: `print_page`, `save_workbook_as`,
  `save_workbook_to_path`, `open_workbook`, `read_file`.
- `android/app/src/main/java/com/anttree/opensheet/SafSaverPlugin.java` — SAF
  save (`saveDocument`) + open (`openDocument`/`readDocument`, persisted URIs).

## Feature set (current)

Grid & editing: virtualized grid, IME-safe editing, formulas + autocomplete,
copy/cut/paste (TSV), undo/redo, fill handle + Ctrl+D/R, notes, context menu
(insert/delete rows/cols, etc.).
Formatting: bold/italic/underline, h/v align, wrap, text/fill color, number
formats (currency/percent/decimals), borders, merge/unmerge, freeze panes.
Data: sort, AutoFilter, conditional formatting, list data-validation (dropdowns),
charts (bar/line/pie) rendered to SVG and embedded as PNG on export.
Sheets: multiple sheets + tabs; switch with **Ctrl/Cmd+PageUp/PageDown**; the
active tab scrolls into view; prev/next tab buttons.
View: zoom 50–200% (`Ctrl/Cmd +/-/0`, status-bar control), light/dark/auto theme,
en/ko. Find/Replace (Ctrl+F/H **and a toolbar button**).
Files: import/export `.xlsx`/`.csv` with styles, merges, cond-formats,
validations, col widths, freeze, notes, charts.

## Platform file-I/O matrix (this is where most complexity lives)

**No document caching.** The app used to autosave a "draft" to IndexedDB and
restore it on launch; this was removed because it showed stale copies of files
edited elsewhere. `clearCachedDoc()` purges leftover data on launch. On launch:
desktop reopens the last file fresh from disk (by path); everywhere else starts
blank and the user opens files directly.

| Platform | Open | Save (in place) | Save As | Recent files |
|---|---|---|---|---|
| **Web Chrome/Edge** | File System Access picker (handle) | ✅ write via handle | `showSaveFilePicker` | ❌ hidden |
| **Web Safari/FF** | `<input type=file>` | ❌ (download) | prompt + download | ❌ hidden |
| **Desktop (Tauri)** | native `open_workbook` (path) | ✅ `save_workbook_to_path` | native `save_workbook_as` dialog | ✅ re-read fresh by path |
| **Android** | native SAF `openDocument` (persisted URI) | ➖ SAF Save As each time | SAF `ACTION_CREATE_DOCUMENT` | ✅ re-read fresh by URI |
| **iOS** | `<input type=file>` | ➖ | write to Documents + Share sheet | ❌ hidden |

- "Save in place" menu item shows when `supportsFileSystemAccess() || isTauri()`.
- Recent files show only when `isTauri() || nativePlatform()==='android'` (they
  need a persistent reference — path or SAF URI — to re-read the current file).
- The file path (desktop) is persisted in `localStorage` (`opensheet.filePath`)
  so Cmd+S saves in place and the file reopens fresh next launch.

## GOTCHAS / hard-won lessons (read before touching file I/O or native)

1. **Detect Tauri via the official API, not raw globals.** Use
   `import { isTauri, invoke } from '@tauri-apps/api/core'`. An earlier attempt
   used `window.__TAURI_INTERNALS__` directly and silently failed (everything
   fell back to a browser download to ~/Downloads). `isTauri()` checks
   `window.isTauri`; `invoke` serializes args correctly.
2. **Import Capacitor plugins statically**, never `await import('@capacitor/...')`.
   Dynamic-import chunks fail in the Capacitor WebView
   ("Failed to fetch dynamically imported module"). See `nativeSave.ts`.
3. **Android Share needs `files: [uri]`, not `url`.** `url` with a `file://`
   silently no-ops on Android; iOS shares fine via `url`. Branch on
   `nativePlatform()`.
4. **Android ghost-tap / synthesized click.** A tap fires delayed synthesized
   mouse events; a modal opened on tap could be instantly dismissed by a
   backdrop `onMouseDown`. Save dialogs therefore only close via explicit
   buttons (no backdrop-dismiss).
5. **iOS auto-zoom on focus.** The viewport is pinned
   (`maximum-scale=1, user-scalable=no`) so focusing a field/`<select>` doesn't
   trigger WKWebView zoom that never restores. In-app zoom replaces pinch-zoom.
6. **Grid content cache is keyed by `"row,col"` only.** It must be invalidated on
   `rev` change AND on `activeSheetId` change, or switching sheets shows the
   previous sheet's cell text over the new sheet's merges (looks corrupted).
   See `contentRev`/`contentSheet` in `Grid.tsx`.
7. **Touch vs. mouse in the grid.** Formula "point mode" (tap a cell to insert a
   ref while editing a formula) is disabled on coarse pointers, so tapping
   another cell commits + moves instead of appearing to copy the formula. Touch
   range-selection uses draggable corner handles + edge auto-scroll (a one-finger
   drag scrolls). `IS_COARSE` gates this.
8. **Rows are a FIXED height** in the virtualization (`DEFAULT_ROW_HEIGHT`).
   `setRowHeight` exists in the store but the grid does not render variable
   heights, so `wrap` text currently clips. (Known limitation / future work.)
9. **Native code can't be verified in the sandbox** (no Android/iOS/GTK build).
   Rust/Java/Swift changes must be built + tested on device by the maintainer.
   Web + desktop-JS behavior IS verifiable headlessly (see below).

## Testing approach used here

Headless Chromium (`playwright-core` + the preinstalled browser at
`/opt/pw-browsers/chromium-*/chrome-linux/chrome`) drives the Vite dev server to
verify web behavior. `window.store` is exposed in dev (`main.tsx`). File System
Access handles can be exercised with real **OPFS** handles
(`navigator.storage.getDirectory()`) which are structured-cloneable and work
headlessly. `isTauri()`/native paths are gated off on the web, so web tests
confirm no regressions there.

## Session changelog (features + fixes, newest first)

- Desktop: show the "Save (in place)" menu item (writes back to the path).
- Files: **removed document cache**; open files directly; desktop reopens the
  last file fresh; Recent files hidden on web/iOS, and on desktop/Android they
  re-read the current file (desktop by path, Android by persisted SAF URI).
- Web: persist the FSA handle so Save works after reload (later superseded by
  the cache removal above).
- Desktop file save/open via the official Tauri API (in-place Cmd+S, fresh
  reopen) — fixed the raw-globals detection bug.
- Mobile save iterations: SAF Save-As dialog (choose location), in-app filename
  modal (Android WebView has no `window.prompt`/reliable share-sheet rename),
  save-to-folder + share, static plugin imports, ghost-tap fix, `files[]` share.
- Added: find/replace toolbar button, print/PDF "unsupported" toast on native
  (localized), mobile panel wrap fix (cond-format/validation didn't fit).
- Grid: fixed stale content on sheet switch; touch drag-selection handles;
  formula point-mode disabled on touch; in-app zoom (50–200%); Ctrl/Cmd+PageUp/
  PageDown sheet switching; active tab scroll-into-view.

## Conventions

- User-facing strings → `src/i18n.ts` (both `en` and `ko`).
- Keep Chrome/web behavior untouched when adding native/desktop paths — gate new
  behavior strictly behind `isTauri()` / `nativePlatform()` / `IS_COARSE`.
- After changing web code for mobile, `npm run build && npx cap sync <platform>`
  is required (the native app bundles `dist/`).
