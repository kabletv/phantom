/**
 * Main terminal component that ties together session management,
 * keyboard input, canvas rendering, and resize handling.
 *
 * On mount:
 * 1. Measures the container to calculate initial cols/rows
 * 2. Creates a session store with reactive signals
 * 3. Calls createTerminal() with the Channel callback
 * 4. Wires keyboard input through encodeKeyEvent -> writeInput
 * 5. Wires resize via TerminalCanvas onResize -> resizeTerminal
 */

import { createSignal, onCleanup, onMount, Show, type Component } from "solid-js";
import TerminalCanvas from "./TerminalCanvas";
import StatusBar from "./StatusBar";
import { createTerminal, writeInput, resizeTerminal, closeTerminal, type SessionId } from "../lib/ipc";
import { encodeKeyEvent } from "../lib/keybindings";
import { createSessionStore } from "../stores/sessions";
import { measureFontMetrics } from "../renderer/font-metrics";
import { calculateDimensions } from "../renderer/font-metrics";

const DEFAULT_FONT_FAMILY = "Menlo, Monaco, Courier New, monospace";
const DEFAULT_FONT_SIZE = 14;

const Terminal: Component = () => {
  let containerRef!: HTMLDivElement;
  const [sessionId, setSessionId] = createSignal<SessionId | null>(null);
  const [initialized, setInitialized] = createSignal(false);

  // Pre-create the store with placeholder dimensions; will be updated on mount.
  const { session, handleEvent } = createSessionStore(0, 80, 24);

  onMount(async () => {
    // Measure font metrics to calculate initial grid dimensions.
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.error("Failed to create canvas context for font measurement");
      return;
    }

    const metrics = measureFontMetrics(DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE, ctx);
    const rect = containerRef.getBoundingClientRect();
    const dims = calculateDimensions(rect.width, rect.height, metrics);

    const cols = Math.max(dims.cols, 2);
    const rows = Math.max(dims.rows, 2);

    try {
      const id = await createTerminal(null, cols, rows, handleEvent);
      setSessionId(id);
      setInitialized(true);

      // Focus the container so it receives keyboard events.
      containerRef.focus();
    } catch (err) {
      console.error("Failed to create terminal session:", err);
    }
  });

  onCleanup(() => {
    const id = sessionId();
    if (id !== null) {
      closeTerminal(id).catch((err: unknown) => {
        console.error("Failed to close terminal session:", err);
      });
    }
  });

  /** Handle keyboard events: encode and send to the PTY. */
  function handleKeyDown(event: KeyboardEvent) {
    const id = sessionId();
    if (id === null) return;

    const bytes = encodeKeyEvent(event);
    if (bytes !== null) {
      event.preventDefault();
      event.stopPropagation();
      writeInput(id, bytes).catch((err: unknown) => {
        console.error("Failed to write input:", err);
      });
    }
  }

  /** Handle resize events from the TerminalCanvas ResizeObserver. */
  function handleResize(cols: number, rows: number) {
    const id = sessionId();
    if (id === null) return;

    resizeTerminal(id, cols, rows).catch((err: unknown) => {
      console.error("Failed to resize terminal:", err);
    });
  }

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        width: "100%",
        height: "100%",
      }}
    >
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={{
          flex: "1",
          overflow: "hidden",
          outline: "none",
          background: "#000",
        }}
      >
        <Show when={initialized()}>
          <TerminalCanvas
            cols={session().cols}
            rows={session().rows}
            cells={session().cells ?? undefined}
            dirtyRows={session().dirtyRows ?? undefined}
            cursorRow={session().cursorRow}
            cursorCol={session().cursorCol}
            cursorShape={session().cursorShape}
            cursorVisible={session().cursorVisible}
            fontFamily={DEFAULT_FONT_FAMILY}
            fontSize={DEFAULT_FONT_SIZE}
            onResize={handleResize}
          />
        </Show>
      </div>
      <StatusBar title={session().title} alive={session().alive} />
    </div>
  );
};

export default Terminal;
