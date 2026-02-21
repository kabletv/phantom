/**
 * SolidJS component that wraps the Canvas2D terminal renderer.
 *
 * Manages the canvas element lifecycle, observes resize events to
 * report new terminal grid dimensions, and triggers re-renders when
 * cell data or cursor state changes.
 */

import { createEffect, createSignal, onCleanup, onMount, type Component } from "solid-js";
import { CanvasRenderer } from "../renderer/canvas-renderer";
import { calculateDimensions } from "../renderer/font-metrics";

export interface TerminalCanvasProps {
  cols: number;
  rows: number;
  cells?: Uint8Array;
  dirtyRows?: Array<{ y: number; cells: Uint8Array }>;
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
            ascent: 0, // Not needed for dimension calculation
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

  // Re-render when full-frame cell data changes.
  createEffect(() => {
    const r = renderer();
    const cells = props.cells;
    if (r && cells && cells.byteLength > 0) {
      r.renderFullFrame(cells, props.cols, props.rows);
      r.renderCursor(props.cursorRow, props.cursorCol, props.cursorShape, props.cursorVisible);
    }
  });

  // Re-render when dirty rows change.
  createEffect(() => {
    const r = renderer();
    const dirty = props.dirtyRows;
    if (r && dirty && dirty.length > 0) {
      r.renderDirtyRows(dirty);
      r.renderCursor(props.cursorRow, props.cursorCol, props.cursorShape, props.cursorVisible);
    }
  });

  // Re-render cursor when cursor props change (independent of cell data).
  createEffect(() => {
    const r = renderer();
    if (!r) return;

    // Access all cursor props so this effect tracks them.
    const row = props.cursorRow;
    const col = props.cursorCol;
    const shape = props.cursorShape;
    const visible = props.cursorVisible;

    // Only re-render cursor standalone when we have existing cell data.
    // Full-frame and dirty-row effects already render the cursor.
    if (!props.cells && !props.dirtyRows) {
      r.renderCursor(row, col, shape, visible);
    }
  });

  // Update dimensions when cols/rows props change.
  createEffect(() => {
    const r = renderer();
    if (r) {
      r.setDimensions(props.cols, props.rows);
    }
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
