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

// Packed RGB for default colors, used for fast comparison.
const DEFAULT_BG_PACKED = 0;
const DEFAULT_FG_PACKED = (255 << 16) | (255 << 8) | 255;

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

  // Caches to avoid redundant canvas state changes.
  private lastFont: string = "";
  private lastFillPacked: number = -1;

  // Pre-computed font strings for the 4 possible style combos.
  private fontNormal: string = "";
  private fontBold: string = "";
  private fontItalic: string = "";
  private fontBoldItalic: string = "";

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
    this.buildFontStrings();
  }

  // ── Public API ─────────────────────────────────────────────────────────

  setDimensions(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;

    const logicalWidth = cols * this.cellWidth;
    const logicalHeight = rows * this.cellHeight;

    this.canvas.style.width = `${logicalWidth}px`;
    this.canvas.style.height = `${logicalHeight}px`;

    this.canvas.width = Math.round(logicalWidth * this.dpr);
    this.canvas.height = Math.round(logicalHeight * this.dpr);

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.lastFont = "";
    this.lastFillPacked = -1;
    this.applyFont(false, false);
  }

  renderFullFrame(cells: ArrayBuffer | Uint8Array, cols: number, rows: number): void {
    if (this.cols !== cols || this.rows !== rows) {
      this.setDimensions(cols, rows);
    }

    const data = cells instanceof Uint8Array ? cells : new Uint8Array(cells);

    this.ctx.fillStyle = DEFAULT_BG;
    this.lastFillPacked = DEFAULT_BG_PACKED;
    this.ctx.fillRect(0, 0, this.cols * this.cellWidth, this.rows * this.cellHeight);

    for (let y = 0; y < rows; y++) {
      const rowOffset = y * cols * CELL_SIZE;
      this.drawRow(data, rowOffset, y, cols);
    }
  }

  renderDirtyRows(rows: Array<{ y: number; cells: ArrayBuffer | Uint8Array }>): void {
    for (const row of rows) {
      const data = row.cells instanceof Uint8Array ? row.cells : new Uint8Array(row.cells);
      const rowCols = data.byteLength / CELL_SIZE;

      const yPx = row.y * this.cellHeight;
      this.setFill(0, 0, 0);
      this.ctx.fillRect(0, yPx, this.cols * this.cellWidth, this.cellHeight);

      this.drawRow(data, 0, row.y, rowCols);
    }
  }

  renderCursor(row: number, col: number, shape: string, visible: boolean): void {
    if (!visible || shape === "hidden") {
      return;
    }

    const x = col * this.cellWidth;
    const y = row * this.cellHeight;

    this.setFill(255, 255, 255);

    switch (shape) {
      case "block":
        this.ctx.globalAlpha = 0.5;
        this.ctx.fillRect(x, y, this.cellWidth, this.cellHeight);
        this.ctx.globalAlpha = 1.0;
        break;
      case "underline":
        this.ctx.fillRect(x, y + this.cellHeight - 2, this.cellWidth, 2);
        break;
      case "bar":
        this.ctx.fillRect(x, y, 2, this.cellHeight);
        break;
      default:
        this.ctx.globalAlpha = 0.5;
        this.ctx.fillRect(x, y, this.cellWidth, this.cellHeight);
        this.ctx.globalAlpha = 1.0;
        break;
    }
  }

  getCellSize(): { width: number; height: number } {
    return { width: this.cellWidth, height: this.cellHeight };
  }

  // ── Private methods ────────────────────────────────────────────────────

  private measureFont(): void {
    const metrics: FontMetrics = measureFontMetrics(this.fontFamily, this.fontSize, this.ctx);
    this.cellWidth = metrics.cellWidth;
    this.cellHeight = metrics.cellHeight;
    this.ascent = metrics.ascent;
  }

  private buildFontStrings(): void {
    const base = `${this.fontSize}px ${this.fontFamily}`;
    this.fontNormal = base;
    this.fontBold = `bold ${base}`;
    this.fontItalic = `italic ${base}`;
    this.fontBoldItalic = `italic bold ${base}`;
  }

  /**
   * Draw a row directly from binary cell data without allocating DecodedCell objects.
   *
   * Three passes: backgrounds, text runs, decorations.
   */
  private drawRow(data: Uint8Array, dataOffset: number, y: number, cols: number): void {
    const yPx = y * this.cellHeight;
    const cw = this.cellWidth;
    const ch = this.cellHeight;

    // ── Pass 1: Backgrounds ──────────────────────────────────────────
    for (let c = 0; c < cols; c++) {
      const off = dataOffset + c * CELL_SIZE;
      const width = data[off + 11];
      if (width === 0) continue;

      const flags = data[off + 10];
      const inverse = (flags & FLAG_INVERSE) !== 0;

      let bgR: number, bgG: number, bgB: number;
      if (inverse) {
        bgR = data[off + 4];
        bgG = data[off + 5];
        bgB = data[off + 6];
      } else {
        bgR = data[off + 7];
        bgG = data[off + 8];
        bgB = data[off + 9];
      }

      const packed = (bgR << 16) | (bgG << 8) | bgB;
      if (packed !== DEFAULT_BG_PACKED) {
        const xPx = c * cw;
        const w = width === 2 ? cw * 2 : cw;
        this.setFill(bgR, bgG, bgB);
        this.ctx.fillRect(xPx, yPx, w, ch);
      }
    }

    // ── Pass 2: Text (grouped into style-contiguous runs) ───────────
    let runStart = -1;
    let runText = "";
    let runFgR = 0;
    let runFgG = 0;
    let runFgB = 0;
    let runBold = false;
    let runItalic = false;
    let runDim = false;

    const flushRun = (): void => {
      if (runStart < 0 || runText.length === 0) return;
      this.drawTextRun(runText, runStart, y, runFgR, runFgG, runFgB, runBold, runItalic, runDim);
      runText = "";
      runStart = -1;
    };

    for (let c = 0; c < cols; c++) {
      const off = dataOffset + c * CELL_SIZE;
      const width = data[off + 11];
      if (width === 0) continue;

      const flags = data[off + 10];
      if ((flags & FLAG_HIDDEN) !== 0) {
        flushRun();
        continue;
      }

      const inverse = (flags & FLAG_INVERSE) !== 0;
      let fgR: number, fgG: number, fgB: number;
      if (inverse) {
        fgR = data[off + 7];
        fgG = data[off + 8];
        fgB = data[off + 9];
      } else {
        fgR = data[off + 4];
        fgG = data[off + 5];
        fgB = data[off + 6];
      }

      const bold = (flags & FLAG_BOLD) !== 0;
      const italic = (flags & FLAG_ITALIC) !== 0;
      const dim = (flags & FLAG_DIM) !== 0;

      const sameStyle =
        fgR === runFgR &&
        fgG === runFgG &&
        fgB === runFgB &&
        bold === runBold &&
        italic === runItalic &&
        dim === runDim;

      // Decode codepoint.
      const cp =
        data[off] | (data[off + 1] << 8) | (data[off + 2] << 16) | ((data[off + 3] << 24) >>> 0);
      const ch0 = cp === 0 ? " " : String.fromCodePoint(cp >>> 0);

      if (sameStyle && runStart >= 0) {
        runText += ch0;
      } else {
        flushRun();
        runStart = c;
        runText = ch0;
        runFgR = fgR;
        runFgG = fgG;
        runFgB = fgB;
        runBold = bold;
        runItalic = italic;
        runDim = dim;
      }
    }
    flushRun();

    // ── Pass 3: Decorations ──────────────────────────────────────────
    for (let c = 0; c < cols; c++) {
      const off = dataOffset + c * CELL_SIZE;
      const width = data[off + 11];
      if (width === 0) continue;

      const flags = data[off + 10];
      const hasUnderline = (flags & FLAG_UNDERLINE) !== 0;
      const hasStrikethrough = (flags & FLAG_STRIKETHROUGH) !== 0;
      if (!hasUnderline && !hasStrikethrough) continue;

      const inverse = (flags & FLAG_INVERSE) !== 0;
      const fgR = inverse ? data[off + 7] : data[off + 4];
      const fgG = inverse ? data[off + 8] : data[off + 5];
      const fgB = inverse ? data[off + 9] : data[off + 6];

      const xPx = c * cw;
      const w = width === 2 ? cw * 2 : cw;

      this.setFill(fgR, fgG, fgB);

      if (hasUnderline) {
        this.ctx.fillRect(xPx, yPx + this.ascent + 2, w, 1);
      }

      if (hasStrikethrough) {
        this.ctx.fillRect(xPx, yPx + Math.round(this.ascent * 0.55), w, 1);
      }
    }
  }

  private drawTextRun(
    text: string,
    col: number,
    row: number,
    fgR: number,
    fgG: number,
    fgB: number,
    bold: boolean,
    italic: boolean,
    dim: boolean,
  ): void {
    this.applyFont(bold, italic);

    if (dim) {
      this.ctx.globalAlpha = 0.5;
    }

    this.setFill(fgR, fgG, fgB);
    const xPx = col * this.cellWidth;
    const yPx = row * this.cellHeight + this.ascent;
    this.ctx.fillText(text, xPx, yPx);

    if (dim) {
      this.ctx.globalAlpha = 1.0;
    }
  }

  private applyFont(bold: boolean, italic: boolean): void {
    let font: string;
    if (bold && italic) {
      font = this.fontBoldItalic;
    } else if (bold) {
      font = this.fontBold;
    } else if (italic) {
      font = this.fontItalic;
    } else {
      font = this.fontNormal;
    }

    if (font !== this.lastFont) {
      this.ctx.font = font;
      this.lastFont = font;
    }
  }

  private setFill(r: number, g: number, b: number): void {
    const packed = (r << 16) | (g << 8) | b;
    if (packed !== this.lastFillPacked) {
      this.ctx.fillStyle = `rgb(${r},${g},${b})`;
      this.lastFillPacked = packed;
    }
  }
}
