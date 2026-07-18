# OpenSheet

A web-based spreadsheet editor that behaves like Microsoft Excel.
Open, edit, and save `.xlsx` and `.csv` files — with styles preserved.

It runs entirely in the browser (files never leave your machine) and can also be
deployed as a static site.

**한국어 문서: [README.ko.md](README.ko.md)**

## Getting started

**macOS — no terminal needed:** double-click **`start.command`** in Finder. It
checks Node.js, installs dependencies on first run, starts the server, and opens
your browser automatically.

Or from a terminal:

```bash
npm install
npm run dev      # opens http://localhost:5173
```

Build / deploy:

```bash
npm run build    # outputs static files to dist/
npm run preview  # preview the production build
```

## Features

| Feature | Description |
| --- | --- |
| **Formulas / functions** | ~400 Excel-compatible functions such as `=SUM`, `=AVERAGE`, `=IF`, `=VLOOKUP` (powered by [HyperFormula](https://hyperformula.handsontable.com/)) |
| **Cell formatting** | Bold · italic · underline, text/fill color, alignment, number formats (currency, percent, decimal, date), borders, and cell merging |
| **Styles round-trip** | Fonts, fills, colors (including theme/indexed), number formats, borders, column widths and row heights are read from and written back to `.xlsx` |
| **Undo / redo** | Full history for content, formatting, borders, merges and sorting |
| **Clipboard** | Copy · cut · paste over a range as TSV — formats are kept when pasting within the app, and it interoperates with Excel/Sheets |
| **Sorting** | Sort a selected range by its key column — relative formula references are automatically re-based by how far each row moved |
| **Multiple sheets** | Add / delete / rename sheet tabs, with cross-sheet references |
| **File I/O** | Open and save `.xlsx` / `.csv`; **Save in place** overwrites the opened file (Chromium browsers) or downloads a copy |
| **Multi-language** | English / Korean UI, switchable from the status bar (remembers your choice) |

## Usage

- **Move**: arrow keys / click / drag (range select), Shift+click (extend range)
- **Start editing**: double-click, `Enter`, `F2`, or just start typing (IME/Korean input supported)
- **Commit edit**: `Enter` (move down) / `Tab` (move right), `Esc` (cancel)
- **Delete**: `Delete` / `Backspace`
- **Undo / redo**: `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` (or `Ctrl+Y`)
- **Copy / cut / paste**: `Ctrl/Cmd+C` / `X` / `V`
- **Save**: `Ctrl/Cmd+S` (saves in place if the file was opened with the picker, otherwise downloads `.xlsx`)
- **Formatting shortcuts**: `Ctrl/Cmd+B` (bold), `Ctrl/Cmd+I` (italic), `Ctrl/Cmd+U` (underline)
- **Borders**: the *Borders* toolbar menu (all / outer / top / bottom / left / right / none)
- **Formulas**: type an expression starting with `=` in a cell or the formula bar
- **Reference picking**: while editing a `=`formula, click (or drag) cells to insert their `A1` reference / range
- **Resize columns**: drag the column-header border
- **Rename a sheet**: double-click its tab

The status bar shows the live **count · sum · average** of the current selection.

## Mobile app (Android / iOS)

The UI is responsive and works in mobile browsers. To ship it as a native app,
the repo is configured for [Capacitor](https://capacitorjs.com/). The generated
`android/` and `ios/` projects are already committed, so you can go straight to
building — or regenerate them from scratch.

**One-time setup** (only if `android/` or `ios/` is missing):

```bash
npm install
npx cap add android          # Android Studio required
npx cap add ios              # Xcode required (Capacitor 8 uses Swift Package Manager — no CocoaPods needed)
```

**Build & run:**

```bash
npm run cap:android          # builds the web app, syncs, and opens Android Studio
npm run cap:ios              # ...and opens Xcode
```

Then press Run (device/emulator) or Archive to produce the `.apk` / `.ipa`. After
changing web code, run `npm run cap:sync` (or the `cap:*` scripts, which sync for you).

**App identity & assets:**

- App id (Android `applicationId` / iOS bundle id): `dev.anttree.opensheet` — change it
  in [`capacitor.config.ts`](capacitor.config.ts) (and the native projects) before publishing.
- Icons & splash source art lives in [`assets/`](assets). After editing it, regenerate all
  sizes with:
  ```bash
  npx capacitor-assets generate --ios --android
  ```

> Notes:
> - Android builds need **JDK 17+**; Android Studio bundles a suitable one (the Capacitor
>   CLI may warn about an older system JDK — opening the project in Android Studio resolves it).
> - **Save in place** (File System Access API) is desktop-Chromium only. On mobile, opening
>   uses the system file picker and saving downloads a copy.

## Tech stack

- **Vite + React + TypeScript** — UI and grid rendering
- **HyperFormula** — Excel-compatible formula engine
- **ExcelJS** — `.xlsx` reading/writing with full cell styling
- **Zustand** — state management

## Project structure

```
src/
  App.tsx              layout + global shortcuts (save, undo, clipboard) + status bar
  i18n.ts              English/Korean strings + language store
  components/
    Toolbar.tsx        file I/O · formatting · borders · merge · sort controls
    FormulaBar.tsx     name box + formula input
    Grid.tsx           spreadsheet grid (selection, editing/IME, merges, borders, resizing)
    SheetTabs.tsx      sheet tabs
    Icon.tsx           inline SVG icon loader
  icons/               hand-drawn SVG toolbar icons
  store/useStore.ts    Zustand store wrapping HyperFormula (editing, undo/redo, clipboard)
  lib/
    fileIO.ts          ExcelJS-based xlsx/csv read & write (styles, borders, sizes)
    format.ts          number/date display formatting + border helpers
    utils.ts           address conversion · selection · formula-reference shifting
  types.ts             shared types
```

## Known limitations

- The grid displays up to 200 rows × 52 columns (A–AZ). Adjust `MAX_ROWS` / `MAX_COLS` in `store/useStore.ts` if needed.
- **Save in place** uses the File System Access API and works in Chromium browsers (Chrome/Edge); elsewhere saving downloads a copy.
- The legacy `.xls` format is not supported — re-save as `.xlsx` first.
- Theme/indexed colors are resolved with the default Office palette, so custom-themed workbooks may differ slightly.
- The sort's formula-reference adjustment targets the common case of same-row references (e.g. `=B2*C2`).

## License

[MIT](LICENSE) © Ant-tree
