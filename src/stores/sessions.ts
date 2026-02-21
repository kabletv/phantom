/**
 * Session state store for terminal sessions.
 *
 * Uses SolidJS signals to manage reactive terminal session state. Handles
 * incoming TerminalEvent messages from the backend and updates the
 * appropriate signal fields.
 */

import { createSignal } from "solid-js";
import type { TerminalEvent, SessionId } from "../lib/ipc";

/** Represents the full state of a terminal session. */
export interface SessionState {
  id: SessionId;
  cols: number;
  rows: number;
  /** Full-frame cell data (binary, 16 bytes per cell). */
  cells: Uint8Array | null;
  /** Incremental dirty row updates. */
  dirtyRows: Array<{ y: number; cells: Uint8Array }> | null;
  cursorRow: number;
  cursorCol: number;
  cursorShape: string;
  cursorVisible: boolean;
  title: string;
  alive: boolean;
}

/**
 * Create a reactive session store for a terminal session.
 *
 * Returns the signal accessor and setter, plus an event handler function
 * that should be passed as the Tauri Channel callback.
 */
export function createSessionStore(id: SessionId, cols: number, rows: number) {
  const [session, setSession] = createSignal<SessionState>({
    id,
    cols,
    rows,
    cells: null,
    dirtyRows: null,
    cursorRow: 0,
    cursorCol: 0,
    cursorShape: "block",
    cursorVisible: true,
    title: "Phantom Terminal",
    alive: true,
  });

  /**
   * Handle a TerminalEvent from the backend.
   *
   * Updates the session signal based on the event type. For FullFrame events,
   * cells is set and dirtyRows is cleared. For DirtyRows, dirtyRows is set
   * and cells is cleared. This distinction lets the renderer know which
   * rendering path to use.
   */
  function handleEvent(event: TerminalEvent): void {
    switch (event.type) {
      case "FullFrame":
        setSession((prev) => ({
          ...prev,
          cols: event.cols,
          rows: event.rows,
          cells: new Uint8Array(event.cells),
          dirtyRows: null,
          cursorRow: event.cursor_row,
          cursorCol: event.cursor_col,
          cursorShape: event.cursor_shape,
          cursorVisible: event.cursor_visible,
        }));
        break;

      case "DirtyRows":
        setSession((prev) => ({
          ...prev,
          cells: null,
          dirtyRows: event.rows.map((row) => ({
            y: row.y,
            cells: new Uint8Array(row.cells),
          })),
          cursorRow: event.cursor_row,
          cursorCol: event.cursor_col,
          cursorShape: event.cursor_shape,
          cursorVisible: event.cursor_visible,
        }));
        break;

      case "TitleChanged":
        setSession((prev) => ({
          ...prev,
          title: event.title,
        }));
        break;

      case "Bell":
        // Could flash the screen or play a sound in the future.
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
