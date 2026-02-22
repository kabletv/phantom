/**
 * Tauri invoke wrappers and Channel handling for terminal IPC.
 *
 * Provides typed functions for creating, writing to, resizing, and closing
 * terminal sessions. Uses Tauri's Channel mechanism for backend-to-frontend
 * event streaming.
 */

import { invoke, Channel } from "@tauri-apps/api/core";

export type SessionId = number;

/** A single dirty row from an incremental update. */
export interface DirtyRowData {
  y: number;
  cells: number[];
}

/**
 * Events sent from the backend to the frontend over a Tauri channel.
 *
 * These are deserialized from the Rust `TerminalEvent` enum, which uses
 * `#[serde(tag = "type")]` for tagged JSON serialization.
 */
export type TerminalEvent =
  | {
      type: "FullFrame";
      cols: number;
      rows: number;
      cells: number[];
      cursor_row: number;
      cursor_col: number;
      cursor_shape: string;
      cursor_visible: boolean;
    }
  | {
      type: "DirtyRows";
      rows: DirtyRowData[];
      cursor_row: number;
      cursor_col: number;
      cursor_shape: string;
      cursor_visible: boolean;
    }
  | {
      type: "TitleChanged";
      title: string;
    }
  | {
      type: "Bell";
    }
  | {
      type: "Exited";
      code: number | null;
    };

/**
 * Create a new terminal session.
 *
 * Spawns a PTY with the given shell (or system default if null), starts the
 * I/O thread and render pump on the backend, and returns the session ID.
 * Events are delivered to `onEvent` via a Tauri Channel.
 */
export async function createTerminal(
  shell: string | null,
  cols: number,
  rows: number,
  onEvent: (event: TerminalEvent) => void,
  workingDir?: string,
): Promise<SessionId> {
  const channel = new Channel<TerminalEvent>();
  channel.onmessage = onEvent;
  return await invoke<SessionId>("create_terminal", {
    shell,
    cols,
    rows,
    channel,
    workingDir: workingDir ?? null,
  });
}

/**
 * Write user input bytes to a terminal session's PTY.
 *
 * Tauri expects `Vec<u8>` which maps to `number[]` in JSON serialization.
 */
export async function writeInput(sessionId: SessionId, data: Uint8Array): Promise<void> {
  await invoke("write_input", {
    sessionId,
    data: Array.from(data),
  });
}

/**
 * Resize a terminal session's PTY and virtual terminal.
 */
export async function resizeTerminal(
  sessionId: SessionId,
  cols: number,
  rows: number,
): Promise<void> {
  await invoke("resize_terminal", { sessionId, cols, rows });
}

/**
 * Close a terminal session and release all associated resources.
 */
export async function closeTerminal(sessionId: SessionId): Promise<void> {
  await invoke("close_terminal", { sessionId });
}
