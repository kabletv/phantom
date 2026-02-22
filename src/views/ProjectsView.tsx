import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type Repository, type Project } from "../lib/api";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { SkeletonList } from "../components/ui/Skeleton";
import { toast } from "../components/ui/Toast";

export function ProjectsView() {
  const { repoId } = useParams<{ repoId: string }>();
  const [repo, setRepo] = useState<Repository | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBranch, setNewBranch] = useState("main");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const numericRepoId = repoId ? parseInt(repoId, 10) : NaN;

  useEffect(() => {
    if (isNaN(numericRepoId)) return;
    Promise.all([
      api.listRepositories().then((repos) => {
        const found = repos.find((r) => r.id === numericRepoId);
        setRepo(found ?? null);
        if (found) setNewBranch(found.default_branch);
      }),
      api.listProjects(numericRepoId).then(setProjects),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [numericRepoId]);

  const handleCreate = async () => {
    if (!newName.trim() || isNaN(numericRepoId)) return;
    setCreating(true);
    try {
      const project = await api.createProject(numericRepoId, newName.trim(), newBranch);
      setProjects((prev) => [...prev, project]);
      setShowNew(false);
      setNewName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (projectId: number) => {
    try {
      await api.deleteProject(projectId);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete project");
    }
  };

  return (
    <ErrorBoundary label="Projects">
      <div style={{ padding: "var(--space-5)", overflow: "auto", height: "100%" }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--space-4)",
        }}>
          <div>
            <button
              onClick={() => navigate("/repos")}
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
              &larr; Repositories
            </button>
            <h2 style={{ fontSize: "20px", fontWeight: 600, lineHeight: "28px", letterSpacing: "-0.02em" }}>
              {repo ? `${repo.github_owner}/${repo.github_name}` : "Projects"}
            </h2>
          </div>
          <button className="btn-outline" onClick={() => setShowNew(true)}>
            + New Project
          </button>
        </div>

        {/* New project form */}
        {showNew && (
          <div className="card" style={{ marginBottom: "var(--space-4)", display: "flex", gap: "var(--space-3)", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                Project Name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. feature-auth"
                className="input"
                autoFocus
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                Branch
              </label>
              <input
                type="text"
                value={newBranch}
                onChange={(e) => setNewBranch(e.target.value)}
                placeholder="main"
                className="input"
              />
            </div>
            <button className="btn-primary" onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? "Creating..." : "Create"}
            </button>
            <button className="btn-outline" onClick={() => setShowNew(false)}>
              Cancel
            </button>
          </div>
        )}

        {loading ? (
          <SkeletonList count={3} />
        ) : projects.length === 0 ? (
          <EmptyState
            icon="+"
            heading="Create your first project"
            description="Projects are sandboxed git worktrees where you launch AI sessions and terminals."
            action={{ label: "New Project", onClick: () => setShowNew(true) }}
          />
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "var(--space-4)",
          }}>
            {projects.map((project) => (
              <div key={project.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div
                    style={{ cursor: "pointer", flex: 1 }}
                    onClick={() => navigate(`/projects/${project.id}`)}
                  >
                    <div style={{ fontWeight: 600, fontSize: "14px", marginBottom: "var(--space-1)" }}>
                      {project.name}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                      branch: {project.branch}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
                      {project.worktree_path}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(project.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-tertiary)",
                      cursor: "pointer",
                      fontSize: "16px",
                      padding: "4px",
                      lineHeight: 1,
                    }}
                    title="Delete project"
                  >
                    x
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
