/**
 * Font measurement utilities for the terminal renderer.
 *
 * Measures monospace font metrics using a temporary canvas context, and
 * provides helpers to calculate terminal grid dimensions from pixel sizes.
 */

export interface FontMetrics {
  /** Width of a single character cell in CSS pixels. */
  cellWidth: number;
  /** Height of a single row (ascent + descent + line gap) in CSS pixels. */
  cellHeight: number;
  /** Distance from the top of the cell to the text baseline. */
  ascent: number;
  /** Distance below the baseline. */
  descent: number;
}

/**
 * Measure the metrics of a monospace font at a given size.
 *
 * We use the canvas TextMetrics API with a representative character ('M')
 * to obtain ascent, descent, and advance width. A small line-gap is added
 * to cellHeight for readability.
 */
export function measureFontMetrics(
  fontFamily: string,
  fontSize: number,
  ctx: CanvasRenderingContext2D,
): FontMetrics {
  ctx.font = `${fontSize}px ${fontFamily}`;
  const metrics = ctx.measureText("M");

  // fontBoundingBox* is available in modern browsers.
  // Fall back to approximation if not present.
  const ascent =
    metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent ?? Math.ceil(fontSize * 0.8);
  const descent =
    metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent ?? Math.ceil(fontSize * 0.2);

  // Use advance width for cell width (reliable for monospace fonts).
  const cellWidth = metrics.width;

  // Add a small line gap (2px) for vertical breathing room.
  const lineGap = 2;
  const cellHeight = Math.ceil(ascent + descent + lineGap);

  return {
    cellWidth,
    cellHeight,
    ascent: Math.ceil(ascent),
    descent: Math.ceil(descent),
  };
}

/**
 * Calculate terminal grid dimensions (cols x rows) that fit within the given
 * pixel area, using the measured font metrics.
 */
export function calculateDimensions(
  pixelWidth: number,
  pixelHeight: number,
  metrics: FontMetrics,
): { cols: number; rows: number } {
  const cols = Math.max(1, Math.floor(pixelWidth / metrics.cellWidth));
  const rows = Math.max(1, Math.floor(pixelHeight / metrics.cellHeight));
  return { cols, rows };
}
