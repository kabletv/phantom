import React, { useCallback, useRef } from "react";
import { type LayoutNode, type Split, type Pane, isSplit, useTerminalLayout } from "../stores/terminal-layout";
import { TerminalIsland } from "./TerminalIsland";

const MIN_PANE_PX = 80;
const SNAP_THRESHOLD_PX = 20;

function PaneView({ pane }: { pane: Pane }) {
  const activePane = useTerminalLayout((s) => s.activePane);
  const setActivePane = useTerminalLayout((s) => s.setActivePane);
  const isActive = pane.id === activePane;

  return (
    <div
      onClick={() => setActivePane(pane.id)}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        outline: isActive ? "1px solid var(--accent)" : "1px solid var(--border-default)",
        outlineOffset: "-1px",
      }}
    >
      <TerminalIsland command={pane.command} workingDir={pane.workingDir} />
    </div>
  );
}

function Divider({
  direction,
  onDrag,
}: {
  direction: "horizontal" | "vertical";
  onDrag: (delta: number) => void;
}) {
  const dragging = useRef(false);
  const lastPos = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      lastPos.current = direction === "horizontal" ? e.clientX : e.clientY;

      const handleMouseMove = (e: MouseEvent) => {
        if (!dragging.current) return;
        const pos = direction === "horizontal" ? e.clientX : e.clientY;
        const delta = pos - lastPos.current;
        lastPos.current = pos;
        onDrag(delta);
      };

      const handleMouseUp = () => {
        dragging.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [direction, onDrag],
  );

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        flexShrink: 0,
        background: "var(--border-default)",
        cursor: direction === "horizontal" ? "col-resize" : "row-resize",
        transition: "background 120ms ease-out",
        ...(direction === "horizontal"
          ? { width: "1px", padding: "0 2px", backgroundClip: "content-box", height: "100%" }
          : { height: "1px", padding: "2px 0", backgroundClip: "content-box", width: "100%" }),
      }}
    />
  );
}

function SplitView({ split }: { split: Split }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const updateSplitSizes = useTerminalLayout((s) => s.updateSplitSizes);

  const handleDrag = useCallback(
    (dividerIndex: number, delta: number) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const totalPx = split.direction === "horizontal" ? rect.width : rect.height;
      if (totalPx <= 0) return;

      const deltaPct = (delta / totalPx) * 100;
      const sizes = [...split.sizes];
      const leftIdx = dividerIndex - 1;
      const rightIdx = dividerIndex;

      const minPct = (MIN_PANE_PX / totalPx) * 100;
      const snapPct = (SNAP_THRESHOLD_PX / totalPx) * 100;

      let newLeft = sizes[leftIdx] + deltaPct;
      let newRight = sizes[rightIdx] - deltaPct;

      // Enforce minimum sizes
      if (newLeft < minPct) {
        newRight += newLeft - minPct;
        newLeft = minPct;
      }
      if (newRight < minPct) {
        newLeft += newRight - minPct;
        newRight = minPct;
      }

      // Snap to edge
      if (newLeft < snapPct) newLeft = minPct;
      if (newRight < snapPct) newRight = minPct;

      sizes[leftIdx] = newLeft;
      sizes[rightIdx] = newRight;

      updateSplitSizes(split.id, sizes);
    },
    [split.id, split.direction, split.sizes, updateSplitSizes],
  );

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        flexDirection: split.direction === "horizontal" ? "row" : "column",
        width: "100%",
        height: "100%",
      }}
    >
      {split.children.map((child, i) => (
        <React.Fragment key={child.id}>
          {i > 0 && (
            <Divider
              direction={split.direction}
              onDrag={(delta) => handleDrag(i, delta)}
            />
          )}
          <div style={{ flex: `${split.sizes[i]} 0 0%`, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
            <LayoutNodeView node={child} />
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

function LayoutNodeView({ node }: { node: LayoutNode }) {
  if (isSplit(node)) {
    return <SplitView split={node} />;
  }
  return <PaneView pane={node} />;
}

export function SplitContainer() {
  const root = useTerminalLayout((s) => s.root);
  return <LayoutNodeView node={root} />;
}
