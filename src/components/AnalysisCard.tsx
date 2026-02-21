import React from "react";
import type { AnalysisPreset, AnalysisResult } from "../lib/api";

interface AnalysisCardProps {
  preset: AnalysisPreset;
  latestRun?: AnalysisResult;
  onRun: (presetId: number) => void;
}

const badgeClass: Record<string, string> = {
  queued:    "badge badge-queued",
  running:   "badge badge-running",
  completed: "badge badge-completed",
  failed:    "badge badge-failed",
};

const badgeLabel: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};

export function AnalysisCard({ preset, latestRun, onRun }: AnalysisCardProps) {
  const status = latestRun?.status;
  const isRunning = status === "running" || status === "queued";

  return (
    <div className="card" style={{
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-2)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary)" }}>
          {preset.name}
        </span>
        {status ? (
          <span className={badgeClass[status] ?? "badge badge-neutral"}>
            {badgeLabel[status] ?? status}
          </span>
        ) : (
          <span className="badge badge-neutral">Never run</span>
        )}
      </div>

      {/* Type + schedule */}
      <div style={{ color: "var(--text-secondary)", fontSize: "11px" }}>
        {preset.type}
        {preset.schedule && ` \u00b7 ${preset.schedule}`}
      </div>

      {/* Progress bar when running */}
      {status === "running" && (
        <div className="progress-bar" style={{ marginTop: "var(--space-1)" }}>
          <div className="progress-bar-fill" />
        </div>
      )}

      {/* Findings summary */}
      {latestRun?.parsed_findings && (
        <div style={{
          fontSize: "13px",
          color: "var(--text-secondary)",
          lineHeight: "20px",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          marginTop: "var(--space-1)",
        }}>
          {latestRun.parsed_findings.slice(0, 150)}
        </div>
      )}

      {/* Timestamp */}
      {latestRun?.completed_at && (
        <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
          Last run: {new Date(latestRun.completed_at).toLocaleString()}
        </div>
      )}

      {/* Actions */}
      <div style={{
        display: "flex",
        gap: "var(--space-2)",
        marginTop: "var(--space-2)",
        paddingTop: "var(--space-3)",
        borderTop: "1px solid var(--border-default)",
      }}>
        <button
          className="btn-ghost btn-ghost-accent"
          onClick={() => onRun(preset.id)}
          disabled={isRunning}
        >
          {status === "running" ? "Running..." : latestRun ? "Rerun" : "Run"}
        </button>
      </div>
    </div>
  );
}
