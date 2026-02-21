import React from "react";
import type { CliPreset } from "../lib/api";

interface PresetCardProps {
  preset: CliPreset;
  onLaunch: (preset: CliPreset) => void;
}

const cliColors: Record<string, string> = {
  claude: "var(--accent)",
  codex: "var(--status-info)",
  cursor: "var(--status-success)",
};

export function PresetCard({ preset, onLaunch }: PresetCardProps) {
  const iconColor = cliColors[preset.cli_binary] ?? "var(--text-secondary)";

  return (
    <div className="card" style={{
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-2)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <span style={{
          width: "20px",
          height: "20px",
          borderRadius: "var(--radius-sm)",
          background: iconColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "11px",
          fontWeight: 700,
          color: "var(--text-inverse)",
          flexShrink: 0,
        }}>
          {preset.cli_binary.charAt(0).toUpperCase()}
        </span>
        <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary)" }}>
          {preset.name}
        </span>
        <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>
          ({preset.cli_binary})
        </span>
      </div>

      {/* Flags */}
      {preset.flags && (
        <div style={{
          padding: "6px 10px",
          background: "var(--bg-inset)",
          borderRadius: "var(--radius-sm)",
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
          color: "var(--text-secondary)",
          lineHeight: "18px",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>
          {preset.flags}
        </div>
      )}

      {/* Working directory */}
      {preset.working_dir && (
        <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
          {preset.working_dir}
        </div>
      )}

      {/* Launch button */}
      <button
        className="btn-primary"
        onClick={() => onLaunch(preset)}
        style={{ marginTop: "var(--space-3)", width: "100%" }}
      >
        Launch
      </button>
    </div>
  );
}
