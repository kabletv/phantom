/**
 * Main terminal component that ties together session management,
 * keyboard input, canvas rendering, and resize handling.
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

interface TerminalProps {
  command?: string;
}

const Terminal: Component<TerminalProps> = (props) => {
  let containerRef!: HTMLDivElement;
  const [sessionId, setSessionId] = createSignal<SessionId | null>(null);
  const [initialized, setInitialized] = createSignal(false);

  const { session, handleEvent } = createSessionStore(0, 80, 24);

  onMount(async () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const metrics = measureFontMetrics(DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE, ctx);
    const rect = containerRef.getBoundingClientRect();
    const dims = calculateDimensions(rect.width, rect.height, metrics);
    const cols = Math.max(dims.cols, 2);
    const rows = Math.max(dims.rows, 2);

    try {
      const id = await createTerminal(null, cols, rows, handleEvent);
      setSessionId(id);
      setInitialized(true);
      containerRef.focus();

      // If a command was provided (e.g., from a CLI preset), inject it
      if (props.command) {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(props.command + "\n");
        await writeInput(id, new Uint8Array(bytes));
      }
    } catch (err) {
      console.error("Failed to create terminal session:", err);
    }
  });

  onCleanup(() => {
    const id = sessionId();
    if (id !== null) {
      closeTerminal(id).catch(() => {});
    }
  });

  function handleKeyDown(event: KeyboardEvent) {
    const id = sessionId();
    if (id === null) return;

    const bytes = encodeKeyEvent(event);
    if (bytes !== null) {
      event.preventDefault();
      event.stopPropagation();
      writeInput(id, bytes).catch(() => {});
    }
  }

  function handleResize(cols: number, rows: number) {
    const id = sessionId();
    if (id === null) return;
    resizeTerminal(id, cols, rows).catch(() => {});
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
          "min-height": "0",
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
            frameVersion={session().frameVersion}
            dirtyRowIndices={session().dirtyRowIndices}
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
