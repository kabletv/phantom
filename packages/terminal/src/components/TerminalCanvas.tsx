/**
 * SolidJS component that wraps the Canvas2D terminal renderer.
 *
 * Watches a persistent cell buffer and frameVersion counter to trigger
 * re-renders. Uses dirty row indices for incremental repainting when
 * available, falling back to full frame for resizes and initial render.
 */

import { createEffect, createSignal, onCleanup, onMount, type Component } from "solid-js";
import { CanvasRenderer } from "../renderer/canvas-renderer";
import { calculateDimensions } from "../renderer/font-metrics";

const CELL_SIZE = 16;

export interface TerminalCanvasProps {
  cols: number;
  rows: number;
  cells?: Uint8Array;
  frameVersion: number;
  /** Row indices that changed, or null/undefined for full frame. */
  dirtyRowIndices?: number[] | null;
  cursorRow: number;
  cursorCol: number;
  cursorShape: string;
  cursorVisible: boolean;
  fontFamily?: string;
  fontSize?: number;
  onResize?: (cols: number, rows: number) => void;
}

const TerminalCanvas: Component<TerminalCanvasProps> = (props) => {
  let canvasRef!: HTMLCanvasElement;
  const [renderer, setRenderer] = createSignal<CanvasRenderer | null>(null);

  onMount(() => {
    const r = new CanvasRenderer(canvasRef, props.fontFamily, props.fontSize);
    r.setDimensions(props.cols, props.rows);
    setRenderer(r);

    const parent = canvasRef.parentElement;
    if (parent && props.onResize) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const r = renderer();
          if (!r) continue;

          const { width, height } = entry.contentRect;
          const cellSize = r.getCellSize();
          const dims = calculateDimensions(width, height, {
            cellWidth: cellSize.width,
            cellHeight: cellSize.height,
            ascent: 0,
            descent: 0,
          });

          if (dims.cols !== props.cols || dims.rows !== props.rows) {
            props.onResize?.(dims.cols, dims.rows);
          }
        }
      });

      observer.observe(parent);
      onCleanup(() => observer.disconnect());
    }
  });

  createEffect(() => {
    const r = renderer();
    const cells = props.cells;
    const version = props.frameVersion;
    void version;

    if (!r || !cells || cells.byteLength === 0) return;

    const dirty = props.dirtyRowIndices;

    if (dirty != null && dirty.length > 0) {
      // Incremental: only repaint changed rows.
      const rowBytes = props.cols * CELL_SIZE;
      r.renderDirtyRows(
        dirty.map((y) => ({
          y,
          cells: cells.subarray(y * rowBytes, (y + 1) * rowBytes),
        })),
      );
    } else {
      // Full frame: resize or initial render.
      r.renderFullFrame(cells, props.cols, props.rows);
    }

    r.renderCursor(props.cursorRow, props.cursorCol, props.cursorShape, props.cursorVisible);
  });

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        background: "#000",
      }}
    />
  );
};

export default TerminalCanvas;
