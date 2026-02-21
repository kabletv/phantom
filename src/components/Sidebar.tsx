import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { api, type BranchInfo } from "../lib/api";
import { useWorkspace } from "../stores/workspace";
import { SkeletonList } from "./ui/Skeleton";

const navItems = [
  { to: "/terminal", label: "Terminal", icon: "\u203a" },
  { to: "/launcher", label: "Launcher", icon: "$" },
  { to: "/dashboard", label: "Dashboard", icon: "#" },
  { to: "/diagrams", label: "Diagrams", icon: "~" },
];

export function Sidebar() {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const selectedBranch = useWorkspace((s) => s.selectedBranch);
  const setSelectedBranch = useWorkspace((s) => s.setSelectedBranch);

  useEffect(() => {
    api.listBranches()
      .then((b) => {
        setBranches(b);
        const current = b.find((br) => br.is_current);
        if (current) setSelectedBranch(current.name);
      })
      .catch(() => {
        setBranches([{ name: "main", is_current: true, commit_sha: "" }]);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <aside style={{
      width: "var(--sidebar-width)",
      height: "100%",
      background: "var(--bg-surface)",
      borderRight: "1px solid var(--border-default)",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
    }}>
      {/* Title */}
      <div style={{
        padding: "var(--space-4) var(--space-3)",
        borderBottom: "1px solid var(--border-default)",
      }}>
        <span style={{
          fontWeight: 600,
          fontSize: "15px",
          letterSpacing: "-0.01em",
          color: "var(--text-primary)",
        }}>
          Phantom
        </span>
      </div>

      {/* Navigation */}
      <nav style={{ padding: "var(--space-2) 0" }}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `sidebar-nav-link${isActive ? " active" : ""}`
            }
          >
            <span style={{
              fontFamily: "var(--font-mono)",
              width: "16px",
              textAlign: "center",
              color: "var(--text-tertiary)",
            }}>
              {item.icon}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Branch list */}
      <div style={{
        padding: "var(--space-3)",
        borderTop: "1px solid var(--border-default)",
        marginTop: "auto",
        overflowY: "auto",
      }}>
        <div className="label-overline" style={{ marginBottom: "var(--space-2)" }}>
          Branches
        </div>

        {loading ? (
          <SkeletonList count={3} />
        ) : (
          branches.map((branch) => (
            <button
              key={branch.name}
              className="branch-item"
              data-selected={branch.name === selectedBranch}
              onClick={() => setSelectedBranch(branch.name)}
            >
              {branch.is_current && (
                <span style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "var(--radius-full)",
                  background: "var(--status-success)",
                  flexShrink: 0,
                }} />
              )}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {branch.name}
              </span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
