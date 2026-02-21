import React, { useState } from "react";

interface CustomAnalysisEditorProps {
  onSave: (name: string, presetType: string, promptTemplate: string, schedule?: string) => void;
  onCancel: () => void;
}

const SCHEDULE_OPTIONS = [
  { value: "", label: "Manual only" },
  { value: "on_main_change", label: "On main branch change" },
  { value: "on_any_change", label: "On any branch change" },
];

export function CustomAnalysisEditor({ onSave, onCancel }: CustomAnalysisEditorProps) {
  const [name, setName] = useState("");
  const [presetType, setPresetType] = useState("custom");
  const [promptTemplate, setPromptTemplate] = useState("");
  const [schedule, setSchedule] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !promptTemplate) return;
    onSave(name, presetType, promptTemplate, schedule || undefined);
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
        <label className="label-overline">Analysis Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Security Scan" />
      </div>

      <div>
        <label className="label-overline">Type</label>
        <select className="select" value={presetType} onChange={(e) => setPresetType(e.target.value)}>
          <option value="diagram">Diagram</option>
          <option value="analysis">Analysis</option>
          <option value="custom">Custom</option>
        </select>
      </div>

      <div>
        <label className="label-overline">Prompt Template</label>
        <textarea
          className="textarea"
          value={promptTemplate}
          onChange={(e) => setPromptTemplate(e.target.value)}
          placeholder="Describe what you want to analyze..."
        />
      </div>

      <div>
        <label className="label-overline">Schedule</label>
        <select className="select" value={schedule} onChange={(e) => setSchedule(e.target.value)}>
          {SCHEDULE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary">Create</button>
      </div>
    </form>
  );
}
