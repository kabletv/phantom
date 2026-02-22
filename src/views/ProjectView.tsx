import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type Project, type CliPreset } from "../lib/api";
import { useTerminalLayout } from "../stores/terminal-layout";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { SkeletonList } from "../components/ui/Skeleton";
import { toast } from "../components/ui/Toast";

export function ProjectView() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [presets, setPresets] = useState<CliPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const addPane = useTerminalLayout((s) => s.addPane);

  const numericId = projectId ? parseInt(projectId, 10) : NaN;

  useEffect(() => {
    if (isNaN(numericId)) return;

    Promise.all([
      // We don't have get_project command yet, so we'll find it from list
      api.listRepositories().then(async (repos) => {
        for (const repo of repos) {
          const projects = await api.listProjects(repo.id);
          const found = projects.find((p) => p.id === numericId);
          if (found) {
            setProject(found);
            break;
          }
        }
      }),
      api.listCliPresets().then(setPresets),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [numericId]);

  const launchSession = (preset: CliPreset) => {
    if (!project) return;
    const command = preset.flags
      ? `${preset.cli_binary} ${preset.flags}`
      : preset.cli_binary;

    addPane({
      title: `${preset.name} — ${project.name}`,
      command,
      workingDir: project.worktree_path,
    });
    navigate("/terminal");
  };

  const launchTerminal = () => {
    if (!project) return;
    addPane({
      title: `Terminal — ${project.name}`,
      workingDir: project.worktree_path,
    });
    navigate("/terminal");
  };

  if (loading) {
    return (
      <div style={{ padding: "var(--space-5)" }}>
        <SkeletonList count={3} />
      </div>
    );
  }

  if (!project) {
    return (
      <EmptyState
        heading="Project not found"
        description="The project you're looking for doesn't exist."
        action={{ label: "Back to Repos", onClick: () => navigate("/repos") }}
      />
    );
  }

  return (
    <ErrorBoundary label="Project">
      <div style={{ padding: "var(--space-5)", overflow: "auto", height: "100%" }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-tertiary)",
            fontSize: "12px",
            cursor: "pointer",
            padding: 0,
            marginBottom: "var(--space-1)",
          }}
        >
          &larr; Back
        </button>

        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--space-4)",
        }}>
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: 600, lineHeight: "28px", letterSpacing: "-0.02em" }}>
              {project.name}
            </h2>
            <p style={{ color: "var(--text-tertiary)", fontSize: "12px", fontFamily: "var(--font-mono)", marginTop: "var(--space-1)" }}>
              {project.worktree_path}
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: "12px", marginTop: "var(--space-1)" }}>
              Branch: {project.branch}
            </p>
          </div>
          <button className="btn-primary" onClick={launchTerminal}>
            New Terminal
          </button>
        </div>

        <div className="label-overline" style={{ marginBottom: "var(--space-2)" }}>
          Launch AI Session
        </div>

        {presets.length === 0 ? (
          <EmptyState
            icon="$"
            heading="No presets configured"
            description="Create CLI presets in the Launcher to launch AI sessions in this project."
            action={{ label: "Go to Launcher", onClick: () => navigate("/launcher") }}
          />
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: "var(--space-4)",
          }}>
            {presets.map((preset) => (
              <div key={preset.id} className="card" style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <span style={{
                    width: "20px",
                    height: "20px",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--accent)",
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
                  <span style={{ fontWeight: 600, fontSize: "14px" }}>{preset.name}</span>
                  <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>
                    ({preset.cli_binary})
                  </span>
                </div>
                {preset.flags && (
                  <div style={{
                    padding: "6px 10px",
                    background: "var(--bg-inset)",
                    borderRadius: "var(--radius-sm)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                  }}>
                    {preset.flags}
                  </div>
                )}
                <button
                  className="btn-primary"
                  onClick={() => launchSession(preset)}
                  style={{ marginTop: "var(--space-2)", width: "100%" }}
                >
                  Launch in {project.name}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
