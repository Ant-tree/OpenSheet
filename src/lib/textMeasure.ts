// Deterministic text measurement for auto row height (wrapped cells).
//
// A single shared <canvas> 2D context measures text width at the grid's base
// (unscaled) font. Wrapping is simulated word-by-word so the computed line
// count matches what the browser will render, keeping the virtualization math
// (row offsets, spacers) exactly consistent with the clipped cell height.

let ctx: CanvasRenderingContext2D | null = null
let ctxFont = ''

/** The cell font family, matching `.cell` in styles.css. */
const CELL_FONT_FAMILY = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
/** App base font size in px (`.cell` font-size at zoom 1). */
export const BASE_FONT_SIZE = 13

function measureCtx(fontSize: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null
  if (!ctx) ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return null
  const font = `${fontSize}px ${CELL_FONT_FAMILY}`
  if (ctxFont !== font) {
    ctx.font = font
    ctxFont = font
  }
  return ctx
}

function textWidth(s: string, fontSize: number): number {
  const c = measureCtx(fontSize)
  if (!c) return 0
  return c.measureText(s).width
}

/**
 * Number of visual lines `text` occupies when wrapped into `availWidth` px
 * (unscaled) at `fontSize` px. Splits on whitespace like CSS `white-space:
 * normal`; a single word longer than the width is broken across lines by
 * characters. Explicit newlines force a break. Always at least 1.
 */
export function wrappedLineCount(text: string, availWidth: number, fontSize = BASE_FONT_SIZE): number {
  if (!text || availWidth <= 0) return 1
  if (typeof document === 'undefined') return 1
  let lines = 0
  for (const paragraph of text.split('\n')) {
    lines += linesForParagraph(paragraph, availWidth, fontSize)
  }
  return Math.max(1, lines)
}

function linesForParagraph(paragraph: string, availWidth: number, fontSize: number): number {
  if (paragraph === '') return 1
  const words = paragraph.split(/(\s+)/) // keep whitespace tokens for width
  let lines = 1
  let cur = ''
  for (const w of words) {
    const candidate = cur + w
    if (textWidth(candidate, fontSize) <= availWidth || cur === '') {
      // A single token wider than the line: break it across lines by chars.
      if (cur === '' && textWidth(w, fontSize) > availWidth) {
        const broken = breakLongToken(w, availWidth, fontSize)
        lines += broken.lines - 1
        cur = broken.remainder
      } else {
        cur = candidate
      }
    } else {
      lines++
      cur = w.trimStart()
    }
  }
  return lines
}

function breakLongToken(
  token: string,
  availWidth: number,
  fontSize: number,
): { lines: number; remainder: string } {
  let lines = 1
  let cur = ''
  for (const ch of token) {
    if (textWidth(cur + ch, fontSize) <= availWidth || cur === '') {
      cur += ch
    } else {
      lines++
      cur = ch
    }
  }
  return { lines, remainder: cur }
}
