# OpenSheet

A web-based spreadsheet editor that behaves like Microsoft Excel.
Open, edit, and save `.xlsx` and `.csv` files.

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
| **Cell formatting** | Bold · italic · underline, text/fill color, alignment, number formats (currency, percent, decimal, date), cell merging |
| **Sorting** | Sort a selected range by its key column — relative formula references are automatically re-based by how far each row moved |
| **Multiple sheets** | Add / delete / rename sheet tabs, with cross-sheet references |
| **File I/O** | Open and save `.xlsx` / `.csv`. Formulas and merged cells survive the round trip |

## Usage

- **Move**: arrow keys / click / drag (range select), Shift+click (extend range)
- **Start editing**: double-click, `Enter`, `F2`, or just start typing
- **Commit edit**: `Enter` (move down) / `Tab` (move right), `Esc` (cancel)
- **Delete**: `Delete` / `Backspace`
- **Formatting shortcuts**: `Ctrl/Cmd+B` (bold), `Ctrl/Cmd+I` (italic), `Ctrl/Cmd+U` (underline)
- **Formulas**: type an expression starting with `=` in a cell or the formula bar
- **Resize columns**: drag the column-header border
- **Rename a sheet**: double-click its tab

The status bar shows the live **count · sum · average** of the current selection.

## Tech stack

- **Vite + React + TypeScript** — UI and grid rendering
- **HyperFormula** — Excel-compatible formula engine
- **SheetJS (xlsx)** — `.xlsx` / `.csv` parsing and generation
- **Zustand** — state management

## Project structure

```
src/
  App.tsx              layout + global shortcuts + status bar
  components/
    Toolbar.tsx        file I/O · formatting · merge · sort controls
    FormulaBar.tsx     name box + formula input
    Grid.tsx           spreadsheet grid (selection, editing, merges, resizing)
    SheetTabs.tsx      sheet tabs
  store/useStore.ts    Zustand store wrapping HyperFormula (all editing logic)
  lib/
    fileIO.ts          SheetJS-based xlsx/csv read & write
    format.ts          number/date display formatting
    utils.ts           address conversion · selection · formula-reference shifting
  types.ts             shared types
```

## Known limitations

- The grid displays up to 200 rows × 52 columns (A–AZ). Adjust `MAX_ROWS` / `MAX_COLS` in `store/useStore.ts` if needed.
- Cell styling (colors, bold, etc.) is not yet written into the saved `.xlsx` (values, formulas, and merges are preserved).
- The sort's formula-reference adjustment targets the common case of same-row references (e.g. `=B2*C2`).

## License

[MIT](LICENSE) © Ant-tree
