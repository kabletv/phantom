import React, { useEffect, useState } from "react";
import { useWorkspace } from "../stores/workspace";

// Tauri event listener — dynamically imported so the component doesn't crash outside Tauri
let listenFn: ((event: string, handler: (e: { payload: unknown }) => void) => Promise<() => void>) | null = null;
import("@tauri-apps/api/event")
  .then((mod) => { listenFn = mod.listen; })
  .catch(() => { /* not running in Tauri */ });

interface JobStatusPayload {
  analysis_id: number;
  status: string;
}

export function StatusBarReact() {
  const selectedBranch = useWorkspace((s) => s.selectedBranch);
  const [runningJobs, setRunningJobs] = useState(0);

  useEffect(() => {
    if (!listenFn) return;

    let unlisten: (() => void) | null = null;
    const activeJobs = new Set<number>();

    listenFn("analysis:status_changed", (event) => {
      const payload = event.payload as JobStatusPayload;
      if (payload.status === "running" || payload.status === "queued") {
        activeJobs.add(payload.analysis_id);
      } else {
        activeJobs.delete(payload.analysis_id);
      }
      setRunningJobs(activeJobs.size);
    }).then((fn) => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, []);

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      height: "var(--statusbar-height)",
      minHeight: "var(--statusbar-height)",
      padding: "0 var(--space-3)",
      background: "var(--bg-surface)",
      borderTop: "1px solid var(--border-default)",
      fontSize: "11px",
      fontFamily: "var(--font-mono)",
      fontVariantNumeric: "tabular-nums",
      color: "var(--text-secondary)",
      userSelect: "none",
    }}>
      <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
          <span style={{ color: "var(--text-tertiary)", fontSize: "12px" }}>{"\u2387"}</span>
          <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
            {selectedBranch}
          </span>
        </span>
      </div>
      <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
        {runningJobs > 0 && (
          <span style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
            <span style={{
              width: "6px",
              height: "6px",
              borderRadius: "var(--radius-full)",
              background: "var(--status-warning)",
              animation: "pulse-opacity 1.5s ease-in-out infinite",
            }} />
            <span>{runningJobs} job{runningJobs !== 1 ? "s" : ""} running</span>
          </span>
        )}
      </div>
    </div>
  );
}
