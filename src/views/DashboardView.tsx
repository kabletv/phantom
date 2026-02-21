import React, { useEffect, useState } from "react";
import { api, type AnalysisPreset, type AnalysisResult } from "../lib/api";
import { useWorkspace } from "../stores/workspace";
import { AnalysisCard } from "../components/AnalysisCard";
import { CustomAnalysisEditor } from "../components/CustomAnalysisEditor";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { SkeletonCard } from "../components/ui/Skeleton";
import { toast } from "../components/ui/Toast";

export function DashboardView() {
  const [presets, setPresets] = useState<AnalysisPreset[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [loading, setLoading] = useState(true);
  const selectedBranch = useWorkspace((s) => s.selectedBranch);

  useEffect(() => {
    api.listAnalysisPresets()
      .then(setPresets)
      .catch((e: unknown) => {
        setPresets([]);
        toast.error(e instanceof Error ? e.message : "Failed to load presets");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedBranch) {
      api.listAnalyses(selectedBranch)
        .then(setAnalyses)
        .catch((e: unknown) => {
          setAnalyses([]);
          toast.error(e instanceof Error ? e.message : "Failed to load analyses");
        });
    }
  }, [selectedBranch]);

  // Subscribe to real-time analysis status updates
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<{ analysis_id: number; status: string }>("analysis:status_changed", () => {
        if (selectedBranch) {
          api.listAnalyses(selectedBranch).then(setAnalyses).catch(() => {});
        }
      }).then((fn) => { unlisten = fn; });
    });
    return () => { unlisten?.(); };
  }, [selectedBranch]);

  const handleRun = async (presetId: number) => {
    try {
      await api.runAnalysis(presetId, selectedBranch);
      const updated = await api.listAnalyses(selectedBranch);
      setAnalyses(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to run analysis");
    }
  };

  const handleSavePreset = async (name: string, presetType: string, promptTemplate: string, schedule?: string) => {
    try {
      await api.createAnalysisPreset(name, presetType, promptTemplate, schedule);
      const updated = await api.listAnalysisPresets();
      setPresets(updated);
      setShowEditor(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save preset");
      setShowEditor(false);
    }
  };

  const getLatestRun = (presetId: number): AnalysisResult | undefined => {
    return analyses.find((a) => a.preset_id === presetId);
  };

  return (
    <ErrorBoundary label="Dashboard">
      <div style={{ padding: "var(--space-5)", overflow: "auto", height: "100%" }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--space-4)",
        }}>
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: 600, lineHeight: "28px", letterSpacing: "-0.02em" }}>
              Analysis Dashboard
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "12px", marginTop: "var(--space-1)" }}>
              Branch: {selectedBranch}
            </p>
          </div>
          <button className="btn-outline" onClick={() => setShowEditor(true)}>
            + Add Custom Analysis
          </button>
        </div>

        {showEditor && (
          <div style={{ marginBottom: "var(--space-4)" }}>
            <CustomAnalysisEditor onSave={handleSavePreset} onCancel={() => setShowEditor(false)} />
          </div>
        )}

        {loading ? (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "var(--space-4)",
          }}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : presets.length === 0 && !showEditor ? (
          <EmptyState
            icon="#"
            heading="Set up your first analysis"
            description="Create analysis presets to generate architecture diagrams, security scans, and performance reports."
            action={{ label: "Create Preset", onClick: () => setShowEditor(true) }}
          />
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "var(--space-4)",
          }}>
            {presets.map((preset) => (
              <AnalysisCard
                key={preset.id}
                preset={preset}
                latestRun={getLatestRun(preset.id)}
                onRun={handleRun}
              />
            ))}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
