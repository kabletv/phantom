import React, { useState } from "react";

interface PresetEditorProps {
  onSave: (name: string, cliBinary: string, flags: string, workingDir?: string) => void;
  onCancel: () => void;
}

const CLI_OPTIONS = ["claude", "codex", "cursor", "custom"];

export function PresetEditor({ onSave, onCancel }: PresetEditorProps) {
  const [name, setName] = useState("");
  const [cliBinary, setCliBinary] = useState("claude");
  const [customBinary, setCustomBinary] = useState("");
  const [flags, setFlags] = useState("");
  const [workingDir, setWorkingDir] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const binary = cliBinary === "custom" ? customBinary : cliBinary;
    if (!name || !binary) return;
    onSave(name, binary, flags, workingDir || undefined);
  };

  return (
    <form onSubmit={handleSubmit} style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-strong)",
      borderRadius: "var(--radius-lg)",
      padding: "var(--space-5)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-3)",
    }}>
      <div>
        <label className="label-overline">Preset Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Preset" />
      </div>

      <div>
        <label className="label-overline">CLI Binary</label>
        <select className="select" value={cliBinary} onChange={(e) => setCliBinary(e.target.value)}>
          {CLI_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      {cliBinary === "custom" && (
        <div>
          <label className="label-overline">Custom Binary Path</label>
          <input className="input" value={customBinary} onChange={(e) => setCustomBinary(e.target.value)} placeholder="/usr/local/bin/my-cli" />
        </div>
      )}

      <div>
        <label className="label-overline">Flags</label>
        <input className="input" value={flags} onChange={(e) => setFlags(e.target.value)} placeholder="--flag1 --flag2" />
      </div>

      <div>
        <label className="label-overline">Working Directory (optional)</label>
        <input className="input" value={workingDir} onChange={(e) => setWorkingDir(e.target.value)} placeholder="/path/to/project" />
      </div>

      <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary">Save</button>
      </div>
    </form>
  );
}
