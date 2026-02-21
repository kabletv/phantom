/**
 * SolidJS component that wraps the Canvas2D terminal renderer.
 *
 * Watches a persistent cell buffer and frameVersion counter to trigger
 * re-renders. The cell buffer is always complete (FullFrame replaces,
 * DirtyRows patches in-place in the store).
 */

import { createEffect, createSignal, onCleanup, onMount, type Component } from "solid-js";
import { CanvasRenderer } from "../renderer/canvas-renderer";
import { calculateDimensions } from "../renderer/font-metrics";

export interface TerminalCanvasProps {
  cols: number;
  rows: number;
  cells?: Uint8Array;
  frameVersion: number;
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

    // Set up ResizeObserver on the canvas parent to detect container resizes.
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

  // Re-render when frameVersion changes (covers both FullFrame and DirtyRows).
  createEffect(() => {
    const r = renderer();
    const cells = props.cells;
    const version = props.frameVersion; // Track frameVersion to re-run on every update.
    void version;

    if (r && cells && cells.byteLength > 0) {
      r.renderFullFrame(cells, props.cols, props.rows);
      r.renderCursor(props.cursorRow, props.cursorCol, props.cursorShape, props.cursorVisible);
    }
  });

  // Note: dimensions are handled by renderFullFrame() which calls
  // setDimensions() when cols/rows change. A separate effect would
  // clear the canvas AFTER rendering due to effect ordering.

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
