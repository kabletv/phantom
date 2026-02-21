/**
 * Status bar component displayed at the bottom of the terminal window.
 *
 * Shows the session title and alive/exited status indicator.
 */

import type { Component } from "solid-js";

export interface StatusBarProps {
  title: string;
  alive: boolean;
}

const StatusBar: Component<StatusBarProps> = (props) => {
  return (
    <div
      style={{
        display: "flex",
        "align-items": "center",
        "justify-content": "space-between",
        height: "24px",
        "min-height": "24px",
        padding: "0 8px",
        background: "#1a1a2e",
        color: "#888",
        "font-family": "Menlo, Monaco, Courier New, monospace",
        "font-size": "12px",
        "user-select": "none",
        "border-top": "1px solid #333",
      }}
    >
      <span>{props.title || "Phantom Terminal"}</span>
      <span
        style={{
          color: props.alive ? "#4caf50" : "#f44336",
        }}
      >
        {props.alive ? "running" : "exited"}
      </span>
    </div>
  );
};

export default StatusBar;
