import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Repository, type GhRepo } from "../lib/api";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { SkeletonList } from "../components/ui/Skeleton";
import { toast } from "../components/ui/Toast";

export function ReposView() {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [ghRepos, setGhRepos] = useState<GhRepo[]>([]);
  const [ghAuthed, setGhAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [cloning, setCloning] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.listRepositories()
      .then(setRepos)
      .catch(() => setRepos([]))
      .finally(() => setLoading(false));
  }, []);

  const handleConnect = async () => {
    try {
      const authed = await api.checkGithubAuth();
      setGhAuthed(authed);
      if (!authed) {
        toast.error("GitHub CLI not authenticated. Run `gh auth login` first.");
        return;
      }
      const remote = await api.listGithubRepos();
      setGhRepos(remote);
      setShowPicker(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to connect to GitHub");
    }
  };

  const handleClone = async (repo: GhRepo) => {
    setCloning(`${repo.owner}/${repo.name}`);
    try {
      const created = await api.cloneRepository(repo.owner, repo.name, repo.url, repo.default_branch);
      setRepos((prev) => [...prev, created]);
      setShowPicker(false);
      toast.success(`Cloned ${repo.owner}/${repo.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Clone failed");
    } finally {
      setCloning(null);
    }
  };

  return (
    <ErrorBoundary label="Repositories">
      <div style={{ padding: "var(--space-5)", overflow: "auto", height: "100%" }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--space-4)",
        }}>
          <h2 style={{ fontSize: "20px", fontWeight: 600, lineHeight: "28px", letterSpacing: "-0.02em" }}>
            Repositories
          </h2>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
            {ghAuthed !== null && (
              <span style={{
                fontSize: "11px",
                color: ghAuthed ? "var(--status-success)" : "var(--status-error)",
              }}>
                {ghAuthed ? "GitHub connected" : "Not authenticated"}
              </span>
            )}
            <button className="btn-outline" onClick={handleConnect}>
              + Connect Repository
            </button>
          </div>
        </div>

        {/* GitHub repo picker */}
        {showPicker && (
          <div className="card" style={{ marginBottom: "var(--space-4)", maxHeight: "300px", overflow: "auto" }}>
            <div className="label-overline" style={{ marginBottom: "var(--space-2)" }}>
              Select a repository to clone
            </div>
            {ghRepos.length === 0 ? (
              <p style={{ color: "var(--text-tertiary)", fontSize: "12px" }}>No repositories found.</p>
            ) : (
              ghRepos.map((r) => {
                const key = `${r.owner}/${r.name}`;
                const alreadyCloned = repos.some(
                  (lr) => lr.github_owner === r.owner && lr.github_name === r.name
                );
                return (
                  <button
                    key={key}
                    disabled={alreadyCloned || cloning !== null}
                    onClick={() => handleClone(r)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      width: "100%",
                      padding: "8px 12px",
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--border-default)",
                      color: alreadyCloned ? "var(--text-tertiary)" : "var(--text-primary)",
                      cursor: alreadyCloned ? "default" : "pointer",
                      fontSize: "13px",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ fontFamily: "var(--font-mono)" }}>{key}</span>
                    {alreadyCloned && <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>cloned</span>}
                    {cloning === key && <span style={{ fontSize: "11px", color: "var(--accent)" }}>cloning...</span>}
                  </button>
                );
              })
            )}
          </div>
        )}

        {loading ? (
          <SkeletonList count={3} />
        ) : repos.length === 0 ? (
          <EmptyState
            icon="&gt;"
            heading="Connect your first repository"
            description="Clone a GitHub repository to create sandboxed projects and launch AI sessions."
            action={{ label: "Connect Repository", onClick: handleConnect }}
          />
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "var(--space-4)",
          }}>
            {repos.map((repo) => (
              <div
                key={repo.id}
                className="card"
                style={{ cursor: "pointer" }}
                onClick={() => navigate(`/repos/${repo.id}/projects`)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
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
                    {repo.github_name.charAt(0).toUpperCase()}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: "14px" }}>
                    {repo.github_owner}/{repo.github_name}
                  </span>
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                  {repo.local_path}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "var(--space-1)" }}>
                  Default branch: {repo.default_branch}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
