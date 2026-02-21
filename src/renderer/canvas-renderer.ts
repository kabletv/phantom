/**
 * Canvas2D terminal renderer.
 *
 * Decodes binary cell data (16 bytes per cell) and draws a terminal grid
 * onto an HTMLCanvasElement using the Canvas 2D API. Supports ligature-
 * friendly text runs, HiDPI scaling, and incremental (dirty-row) redraws.
 */

import { type FontMetrics, measureFontMetrics } from "./font-metrics";

// ── Binary cell layout (16 bytes) ──────────────────────────────────────────
// Offset  0-3 : codepoint (u32 LE)
// Offset  4-6 : fg RGB
// Offset  7-9 : bg RGB
// Offset   10 : flags (bold=1, italic=2, underline=4, strikethrough=8,
//                       inverse=16, dim=32, hidden=64, blink=128)
// Offset   11 : width (0=spacer, 1=normal, 2=wide)
// Offset 12-15: reserved

const CELL_SIZE = 16;

const FLAG_BOLD = 1;
const FLAG_ITALIC = 2;
const FLAG_UNDERLINE = 4;
const FLAG_STRIKETHROUGH = 8;
const FLAG_INVERSE = 16;
const FLAG_DIM = 32;
const FLAG_HIDDEN = 64;
// const FLAG_BLINK = 128;  // Not used in rendering currently

const DEFAULT_FONT_FAMILY = "Menlo, Monaco, Courier New, monospace";
const DEFAULT_FONT_SIZE = 14;
const DEFAULT_BG = "rgb(0,0,0)";
const DEFAULT_FG = "rgb(255,255,255)";

interface DecodedCell {
  codepoint: number;
  char: string;
  fgR: number;
  fgG: number;
  fgB: number;
  bgR: number;
  bgG: number;
  bgB: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  inverse: boolean;
  dim: boolean;
  hidden: boolean;
  width: number; // 0, 1, or 2
}

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private fontFamily: string;
  private fontSize: number;
  private cellWidth: number = 0;
  private cellHeight: number = 0;
  private ascent: number = 0;
  private cols: number = 0;
  private rows: number = 0;
  private dpr: number;

  constructor(canvas: HTMLCanvasElement, fontFamily?: string, fontSize?: number) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      throw new Error("Failed to get 2D rendering context");
    }
    this.ctx = ctx;
    this.fontFamily = fontFamily ?? DEFAULT_FONT_FAMILY;
    this.fontSize = fontSize ?? DEFAULT_FONT_SIZE;
    this.dpr = window.devicePixelRatio || 1;

    this.measureFont();
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Set terminal grid dimensions and resize the canvas to fit.
   */
  setDimensions(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;

    const logicalWidth = cols * this.cellWidth;
    const logicalHeight = rows * this.cellHeight;

    // Set CSS (logical) size.
    this.canvas.style.width = `${logicalWidth}px`;
    this.canvas.style.height = `${logicalHeight}px`;

    // Set physical (device pixel) size.
    this.canvas.width = Math.round(logicalWidth * this.dpr);
    this.canvas.height = Math.round(logicalHeight * this.dpr);

    // Scale the context for HiDPI.
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Font must be re-set after canvas resize.
    this.applyFont(false, false);
  }

  /**
   * Render a complete frame: clear the canvas and draw all cells.
   */
  renderFullFrame(cells: ArrayBuffer | Uint8Array, cols: number, rows: number): void {
    if (this.cols !== cols || this.rows !== rows) {
      this.setDimensions(cols, rows);
    }

    const data = cells instanceof Uint8Array ? cells : new Uint8Array(cells);

    // Clear entire canvas with default background.
    this.ctx.fillStyle = DEFAULT_BG;
    this.ctx.fillRect(0, 0, this.cols * this.cellWidth, this.rows * this.cellHeight);

    for (let y = 0; y < rows; y++) {
      const rowOffset = y * cols * CELL_SIZE;
      const rowData = data.subarray(rowOffset, rowOffset + cols * CELL_SIZE);
      this.drawRow(rowData, y, cols);
    }
  }

  /**
   * Render only the rows that have changed since the last frame.
   */
  renderDirtyRows(rows: Array<{ y: number; cells: ArrayBuffer | Uint8Array }>): void {
    for (const row of rows) {
      const data = row.cells instanceof Uint8Array ? row.cells : new Uint8Array(row.cells);
      const rowCols = data.byteLength / CELL_SIZE;

      // Clear just this row.
      const yPx = row.y * this.cellHeight;
      this.ctx.fillStyle = DEFAULT_BG;
      this.ctx.fillRect(0, yPx, this.cols * this.cellWidth, this.cellHeight);

      this.drawRow(data, row.y, rowCols);
    }
  }

  /**
   * Draw the cursor at the given grid position.
   */
  renderCursor(row: number, col: number, shape: string, visible: boolean): void {
    if (!visible || shape === "hidden") {
      return;
    }

    const x = col * this.cellWidth;
    const y = row * this.cellHeight;

    this.ctx.fillStyle = DEFAULT_FG;

    switch (shape) {
      case "block":
        // Semi-transparent filled block so text shows through.
        this.ctx.globalAlpha = 0.5;
        this.ctx.fillRect(x, y, this.cellWidth, this.cellHeight);
        this.ctx.globalAlpha = 1.0;
        break;
      case "underline":
        // 2px line at the bottom of the cell.
        this.ctx.fillRect(x, y + this.cellHeight - 2, this.cellWidth, 2);
        break;
      case "bar":
        // 2px vertical bar on the left of the cell.
        this.ctx.fillRect(x, y, 2, this.cellHeight);
        break;
      default:
        // Default to block.
        this.ctx.globalAlpha = 0.5;
        this.ctx.fillRect(x, y, this.cellWidth, this.cellHeight);
        this.ctx.globalAlpha = 1.0;
        break;
    }
  }

  /**
   * Return the current cell dimensions in CSS pixels.
   */
  getCellSize(): { width: number; height: number } {
    return { width: this.cellWidth, height: this.cellHeight };
  }

  // ── Private methods ────────────────────────────────────────────────────

  /**
   * Measure and cache font metrics.
   */
  private measureFont(): void {
    const metrics: FontMetrics = measureFontMetrics(this.fontFamily, this.fontSize, this.ctx);
    this.cellWidth = metrics.cellWidth;
    this.cellHeight = metrics.cellHeight;
    this.ascent = metrics.ascent;
  }

  /**
   * Decode a single cell from binary data at the given byte offset.
   */
  private decodeCell(data: Uint8Array, offset: number): DecodedCell {
    // Codepoint: u32 little-endian at bytes 0-3.
    const cp =
      data[offset] |
      (data[offset + 1] << 8) |
      (data[offset + 2] << 16) |
      ((data[offset + 3] << 24) >>> 0); // >>> 0 to keep as unsigned

    const flags = data[offset + 10];

    const inverse = (flags & FLAG_INVERSE) !== 0;

    // Read raw colors.
    let fgR = data[offset + 4];
    let fgG = data[offset + 5];
    let fgB = data[offset + 6];
    let bgR = data[offset + 7];
    let bgG = data[offset + 8];
    let bgB = data[offset + 9];

    // Swap if inverse.
    if (inverse) {
      [fgR, bgR] = [bgR, fgR];
      [fgG, bgG] = [bgG, fgG];
      [fgB, bgB] = [bgB, fgB];
    }

    return {
      codepoint: cp >>> 0, // Ensure unsigned
      char: cp === 0 ? " " : String.fromCodePoint(cp >>> 0),
      fgR,
      fgG,
      fgB,
      bgR,
      bgG,
      bgB,
      bold: (flags & FLAG_BOLD) !== 0,
      italic: (flags & FLAG_ITALIC) !== 0,
      underline: (flags & FLAG_UNDERLINE) !== 0,
      strikethrough: (flags & FLAG_STRIKETHROUGH) !== 0,
      inverse,
      dim: (flags & FLAG_DIM) !== 0,
      hidden: (flags & FLAG_HIDDEN) !== 0,
      width: data[offset + 11],
    };
  }

  /**
   * Draw a complete row of cells.
   *
   * Rendering proceeds in three passes:
   *   1. Background pass  -- filled rectangles for non-default bg colors.
   *   2. Text pass         -- grouped into style-contiguous runs for ligatures.
   *   3. Decoration pass   -- underlines and strikethroughs.
   */
  private drawRow(cells: Uint8Array, y: number, cols: number): void {
    const decoded: DecodedCell[] = new Array(cols);
    for (let c = 0; c < cols; c++) {
      decoded[c] = this.decodeCell(cells, c * CELL_SIZE);
    }

    const yPx = y * this.cellHeight;

    // ── Pass 1: Backgrounds ──────────────────────────────────────────
    for (let c = 0; c < cols; c++) {
      const cell = decoded[c];
      if (cell.width === 0) continue; // Spacer (second half of wide char)

      const bgColor = `rgb(${cell.bgR},${cell.bgG},${cell.bgB})`;
      if (bgColor !== DEFAULT_BG) {
        const xPx = c * this.cellWidth;
        const w = cell.width === 2 ? this.cellWidth * 2 : this.cellWidth;
        this.ctx.fillStyle = bgColor;
        this.ctx.fillRect(xPx, yPx, w, this.cellHeight);
      }
    }

    // ── Pass 2: Text (grouped into runs) ─────────────────────────────
    let runStart = -1;
    let runText = "";
    let runFg = "";
    let runBold = false;
    let runItalic = false;
    let runDim = false;

    const flushRun = (): void => {
      if (runStart < 0 || runText.length === 0) return;
      this.drawTextRun(runText, runStart, y, runFg, runBold, runItalic, runDim);
      runText = "";
      runStart = -1;
    };

    for (let c = 0; c < cols; c++) {
      const cell = decoded[c];

      // Skip spacer cells (width 0) and hidden cells.
      if (cell.width === 0) continue;
      if (cell.hidden) {
        flushRun();
        continue;
      }

      const fg = `rgb(${cell.fgR},${cell.fgG},${cell.fgB})`;
      const sameStyle =
        fg === runFg && cell.bold === runBold && cell.italic === runItalic && cell.dim === runDim;

      if (sameStyle && runStart >= 0) {
        // Extend the current run.
        runText += cell.char;
      } else {
        // Style break -- flush previous run, start a new one.
        flushRun();
        runStart = c;
        runText = cell.char;
        runFg = fg;
        runBold = cell.bold;
        runItalic = cell.italic;
        runDim = cell.dim;
      }
    }
    flushRun();

    // ── Pass 3: Decorations ──────────────────────────────────────────
    for (let c = 0; c < cols; c++) {
      const cell = decoded[c];
      if (cell.width === 0) continue;

      const xPx = c * this.cellWidth;
      const w = cell.width === 2 ? this.cellWidth * 2 : this.cellWidth;

      if (cell.underline) {
        const lineY = yPx + this.ascent + 2;
        this.ctx.fillStyle = `rgb(${cell.fgR},${cell.fgG},${cell.fgB})`;
        this.ctx.fillRect(xPx, lineY, w, 1);
      }

      if (cell.strikethrough) {
        const lineY = yPx + Math.round(this.ascent * 0.55);
        this.ctx.fillStyle = `rgb(${cell.fgR},${cell.fgG},${cell.fgB})`;
        this.ctx.fillRect(xPx, lineY, w, 1);
      }
    }
  }

  /**
   * Draw a contiguous text run with a single fillText call.
   *
   * Issuing one fillText per run (rather than per character) allows the
   * browser's text shaper to apply ligatures within the run.
   */
  private drawTextRun(
    text: string,
    col: number,
    row: number,
    fg: string,
    bold: boolean,
    italic: boolean,
    dim: boolean = false,
  ): void {
    this.applyFont(bold, italic);

    if (dim) {
      this.ctx.globalAlpha = 0.5;
    }

    this.ctx.fillStyle = fg;
    const xPx = col * this.cellWidth;
    const yPx = row * this.cellHeight + this.ascent;
    this.ctx.fillText(text, xPx, yPx);

    if (dim) {
      this.ctx.globalAlpha = 1.0;
    }
  }

  /**
   * Set ctx.font to match the requested style.
   */
  private applyFont(bold: boolean, italic: boolean): void {
    const weight = bold ? "bold " : "";
    const style = italic ? "italic " : "";
    this.ctx.font = `${style}${weight}${this.fontSize}px ${this.fontFamily}`;
  }
}
