import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type CliPreset } from "../lib/api";
import { useTerminalLayout } from "../stores/terminal-layout";
import { PresetCard } from "../components/PresetCard";
import { PresetEditor } from "../components/PresetEditor";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { toast } from "../components/ui/Toast";

export function LauncherView() {
  const [presets, setPresets] = useState<CliPreset[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const navigate = useNavigate();
  const addPane = useTerminalLayout((s) => s.addPane);

  useEffect(() => {
    api.listCliPresets()
      .then(setPresets)
      .catch((e: unknown) => {
        setPresets([]);
        toast.error(e instanceof Error ? e.message : "Failed to load presets");
      });
  }, []);

  const handleLaunch = (preset: CliPreset) => {
    const command = preset.flags
      ? `${preset.cli_binary} ${preset.flags}`
      : preset.cli_binary;

    addPane({ title: preset.name, command });
    navigate("/terminal");
  };

  const handleSave = async (name: string, cliBinary: string, flags: string, workingDir?: string) => {
    try {
      await api.createCliPreset(name, cliBinary, flags, workingDir);
      const updated = await api.listCliPresets();
      setPresets(updated);
      setShowEditor(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save preset");
      setShowEditor(false);
    }
  };

  return (
    <ErrorBoundary label="CLI Launcher">
      <div style={{ padding: "var(--space-5)", overflow: "auto", height: "100%" }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--space-4)",
        }}>
          <h2 style={{ fontSize: "20px", fontWeight: 600, lineHeight: "28px", letterSpacing: "-0.02em" }}>
            AI Sessions
          </h2>
          <button className="btn-outline" onClick={() => setShowEditor(true)}>
            + New Preset
          </button>
        </div>

        {showEditor && (
          <div style={{ marginBottom: "var(--space-4)" }}>
            <PresetEditor onSave={handleSave} onCancel={() => setShowEditor(false)} />
          </div>
        )}

        {presets.length === 0 && !showEditor && (
          <EmptyState
            icon="$"
            heading="Create your first preset"
            description="Presets let you launch AI CLI sessions (Claude Code, Codex, Cursor) with pre-configured flags and settings."
            action={{ label: "New Preset", onClick: () => setShowEditor(true) }}
          />
        )}

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: "var(--space-4)",
        }}>
          {presets.map((preset) => (
            <PresetCard key={preset.id} preset={preset} onLaunch={handleLaunch} />
          ))}
        </div>
      </div>
    </ErrorBoundary>
  );
}
