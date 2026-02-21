/**
 * Session state store for terminal sessions.
 *
 * Maintains a persistent cell buffer that FullFrame replaces entirely
 * and DirtyRows patches in-place. A frameVersion counter triggers
 * re-renders on every update.
 */

import { createSignal } from "solid-js";
import type { TerminalEvent, SessionId } from "../lib/ipc";

const CELL_SIZE = 16;

/** Represents the full state of a terminal session. */
export interface SessionState {
  id: SessionId;
  cols: number;
  rows: number;
  /** Persistent cell buffer (binary, 16 bytes per cell, row-major). */
  cells: Uint8Array | null;
  /** Monotonic counter incremented on every visual update. */
  frameVersion: number;
  cursorRow: number;
  cursorCol: number;
  cursorShape: string;
  cursorVisible: boolean;
  title: string;
  alive: boolean;
}

/**
 * Create a reactive session store for a terminal session.
 */
export function createSessionStore(id: SessionId, cols: number, rows: number) {
  const [session, setSession] = createSignal<SessionState>({
    id,
    cols,
    rows,
    cells: null,
    frameVersion: 0,
    cursorRow: 0,
    cursorCol: 0,
    cursorShape: "block",
    cursorVisible: true,
    title: "Phantom Terminal",
    alive: true,
  });

  function handleEvent(event: TerminalEvent): void {
    switch (event.type) {
      case "FullFrame": {
        const cells = new Uint8Array(event.cells);
        setSession((prev) => ({
          ...prev,
          cols: event.cols,
          rows: event.rows,
          cells,
          frameVersion: prev.frameVersion + 1,
          cursorRow: event.cursor_row,
          cursorCol: event.cursor_col,
          cursorShape: event.cursor_shape,
          cursorVisible: event.cursor_visible,
        }));
        break;
      }

      case "DirtyRows": {
        setSession((prev) => {
          if (!prev.cells) return prev;

          // Clone the cell buffer and patch dirty rows in-place.
          const cells = new Uint8Array(prev.cells);
          const rowBytes = prev.cols * CELL_SIZE;

          for (const row of event.rows) {
            const rowData = new Uint8Array(row.cells);
            const offset = row.y * rowBytes;
            // Bounds check: ensure the row fits in the buffer.
            if (offset + rowData.byteLength <= cells.byteLength) {
              cells.set(rowData, offset);
            }
          }

          return {
            ...prev,
            cells,
            frameVersion: prev.frameVersion + 1,
            cursorRow: event.cursor_row,
            cursorCol: event.cursor_col,
            cursorShape: event.cursor_shape,
            cursorVisible: event.cursor_visible,
          };
        });
        break;
      }

      case "TitleChanged":
        setSession((prev) => ({
          ...prev,
          title: event.title,
        }));
        break;

      case "Bell":
        break;

      case "Exited":
        setSession((prev) => ({
          ...prev,
          alive: false,
        }));
        break;
    }
  }

  return { session, setSession, handleEvent };
}
