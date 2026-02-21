# Phantom Workspace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Evolve Phantom from a terminal emulator into a three-pillar AI development workspace: terminal/split manager, AI CLI launcher with presets, and repo analysis dashboard with interactive architecture diagrams.

**Architecture:** Single Tauri v2 desktop app. React is the primary frontend framework (routing, dashboard, diagrams, settings). SolidJS is kept only for the terminal renderer, mounted as an island into React DOM nodes. Rust backend gains two new crates (phantom-db for SQLite, phantom-analysis for job scheduling/CLI spawning/parsing). The existing phantom-git crate gets branch listing and filesystem watching.

**Tech Stack:** Tauri v2, React 18, React Router, React Flow, Zustand, SolidJS (terminal only), Vite (dual-framework), Rust, SQLite (via rusqlite), notify (fs watcher), Mermaid syntax parsing.

---

## Phase 1: Dual-Framework Build System

### Task 1: Add React to the Vite build alongside SolidJS

The existing app uses `vite-plugin-solid` which transforms all `.tsx` as SolidJS JSX. We need React JSX for the new UI while keeping SolidJS for terminal components. The approach: use file-extension convention — `.tsx` files in `src/terminal/` use SolidJS, everything else uses React.

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `tsconfig.json`

**Step 1: Install React dependencies**

Run:
```bash
cd /Users/dak/projects/phantom
npm install react react-dom react-router-dom zustand @xyflow/react
npm install -D @types/react @types/react-dom @vitejs/plugin-react
```

**Step 2: Configure Vite for dual frameworks**

Replace `vite.config.ts` with:
```typescript
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src",
  plugins: [
    // SolidJS only for files inside src/terminal/
    solid({
      include: ["**/terminal/**/*.tsx", "**/terminal/**/*.ts"],
    }),
    // React for everything else
    react({
      include: ["**/*.tsx", "**/*.ts"],
      exclude: ["**/terminal/**"],
    }),
  ],
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: "esnext",
    outDir: "../dist",
  },
});
```

**Step 3: Update tsconfig.json for React JSX**

Replace `tsconfig.json` with:
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "noEmit": true,
    "strict": true,
    "jsx": "react-jsx",
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "esModuleInterop": true
  },
  "include": ["src"]
}
```

Add a SolidJS-specific tsconfig for the terminal directory at `src/terminal/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "solid-js"
  },
  "include": ["."]
}
```

**Step 4: Relocate existing SolidJS files into `src/terminal/`**

Move these files, preserving all content:
- `src/components/Terminal.tsx` → `src/terminal/components/Terminal.tsx`
- `src/components/TerminalCanvas.tsx` → `src/terminal/components/TerminalCanvas.tsx`
- `src/components/StatusBar.tsx` → `src/terminal/components/StatusBar.tsx`
- `src/lib/ipc.ts` → `src/terminal/lib/ipc.ts`
- `src/lib/keybindings.ts` → `src/terminal/lib/keybindings.ts`
- `src/stores/sessions.ts` → `src/terminal/stores/sessions.ts`
- `src/renderer/font-metrics.ts` → `src/terminal/renderer/font-metrics.ts`
- `src/renderer/canvas-renderer.ts` → `src/terminal/renderer/canvas-renderer.ts`

Update all relative imports within the moved files to reflect new paths (imports are all relative within the same subtree, so most stay the same — verify).

**Step 5: Create the React entry point**

Replace `src/index.tsx` with a React entry:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

**Step 6: Replace `src/App.tsx` with a React placeholder shell**

```tsx
import React from "react";

function App() {
  return (
    <div style={{
      width: "100vw",
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      background: "#000",
      color: "#fff",
    }}>
      <h1 style={{ padding: "20px" }}>Phantom Workspace</h1>
    </div>
  );
}

export default App;
```

**Step 7: Verify the build compiles**

Run: `cd /Users/dak/projects/phantom && npm run build`
Expected: Build succeeds with no errors.

**Step 8: Verify dev mode starts**

Run: `just dev`
Expected: Window opens showing "Phantom Workspace" heading.

**Step 9: Commit**

```bash
git add -A
git commit -m "feat: add React alongside SolidJS with dual-framework Vite config"
```

---

### Task 2: Create the SolidJS terminal island mount

A React component that mounts the SolidJS terminal into a DOM node.

**Files:**
- Create: `src/terminal/mount.ts`
- Create: `src/components/TerminalIsland.tsx`

**Step 1: Create the SolidJS mount function**

Create `src/terminal/mount.ts`:
```typescript
import { render } from "solid-js/web";
import Terminal from "./components/Terminal";

/**
 * Mount the SolidJS terminal into a DOM node.
 * Returns a dispose function to unmount.
 */
export function mountTerminal(container: HTMLElement): () => void {
  const dispose = render(() => Terminal({}), container);
  return dispose;
}
```

**Step 2: Create the React wrapper component**

Create `src/components/TerminalIsland.tsx`:
```tsx
import React, { useEffect, useRef } from "react";
import { mountTerminal } from "../terminal/mount";

export function TerminalIsland() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const dispose = mountTerminal(containerRef.current);
    return () => dispose();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    />
  );
}
```

**Step 3: Wire it into App.tsx temporarily for testing**

Update `src/App.tsx`:
```tsx
import React from "react";
import { TerminalIsland } from "./components/TerminalIsland";

function App() {
  return (
    <div style={{
      width: "100vw",
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      background: "#000",
      color: "#fff",
    }}>
      <TerminalIsland />
    </div>
  );
}

export default App;
```

**Step 4: Test the terminal still works**

Run: `just dev`
Expected: Terminal renders and accepts input exactly as before.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: SolidJS terminal island mountable from React"
```

---

## Phase 2: Application Shell & Layout

### Task 3: Create the app shell with sidebar and routed views

**Files:**
- Modify: `src/App.tsx`
- Create: `src/components/Sidebar.tsx`
- Create: `src/components/Layout.tsx`
- Create: `src/views/TerminalView.tsx`
- Create: `src/views/DashboardView.tsx`
- Create: `src/views/DiagramView.tsx`
- Create: `src/styles/global.css`

**Step 1: Create global CSS**

Create `src/styles/global.css`:
```css
:root {
  --bg-primary: #0a0a0a;
  --bg-secondary: #111111;
  --bg-tertiary: #1a1a1a;
  --border: #2a2a2a;
  --text-primary: #e0e0e0;
  --text-secondary: #888888;
  --accent: #7c6aef;
  --accent-hover: #8f7ff7;
  --green: #4caf50;
  --red: #f44336;
  --yellow: #ffc107;
  --sidebar-width: 220px;
  --statusbar-height: 28px;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; background: var(--bg-primary); color: var(--text-primary); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 13px; }
#root { width: 100vw; height: 100vh; }
```

Update `src/index.html` to import the CSS:
```html
<link rel="stylesheet" href="/styles/global.css" />
```
(Add inside `<head>` before `</head>`.)

**Step 2: Create the sidebar component**

Create `src/components/Sidebar.tsx`:
```tsx
import React from "react";
import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/terminal", label: "Terminal", icon: ">" },
  { to: "/dashboard", label: "Dashboard", icon: "#" },
  { to: "/diagrams", label: "Diagrams", icon: "~" },
];

export function Sidebar() {
  return (
    <aside style={{
      width: "var(--sidebar-width)",
      height: "100%",
      background: "var(--bg-secondary)",
      borderRight: "1px solid var(--border)",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
    }}>
      <div style={{ padding: "16px 12px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontWeight: 700, fontSize: "15px" }}>Phantom</span>
      </div>

      {/* Navigation */}
      <nav style={{ padding: "8px 0" }}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 12px",
              textDecoration: "none",
              color: isActive ? "var(--accent)" : "var(--text-secondary)",
              background: isActive ? "var(--bg-tertiary)" : "transparent",
              fontSize: "13px",
            })}
          >
            <span style={{ fontFamily: "monospace", width: "16px" }}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Branch list - placeholder */}
      <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border)", marginTop: "auto" }}>
        <div style={{ color: "var(--text-secondary)", fontSize: "11px", marginBottom: "4px" }}>
          BRANCHES
        </div>
        <div style={{ color: "var(--text-primary)", fontSize: "12px" }}>
          main
        </div>
      </div>
    </aside>
  );
}
```

**Step 3: Create placeholder view components**

Create `src/views/TerminalView.tsx`:
```tsx
import React from "react";
import { TerminalIsland } from "../components/TerminalIsland";

export function TerminalView() {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex" }}>
      <TerminalIsland />
    </div>
  );
}
```

Create `src/views/DashboardView.tsx`:
```tsx
import React from "react";

export function DashboardView() {
  return (
    <div style={{ padding: "20px" }}>
      <h2>Analysis Dashboard</h2>
      <p style={{ color: "var(--text-secondary)", marginTop: "8px" }}>
        No analyses yet. Configure presets to get started.
      </p>
    </div>
  );
}
```

Create `src/views/DiagramView.tsx`:
```tsx
import React from "react";

export function DiagramView() {
  return (
    <div style={{ padding: "20px" }}>
      <h2>Architecture Diagrams</h2>
      <p style={{ color: "var(--text-secondary)", marginTop: "8px" }}>
        Run an architecture analysis to generate diagrams.
      </p>
    </div>
  );
}
```

**Step 4: Create the layout component**

Create `src/components/Layout.tsx`:
```tsx
import React from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function Layout() {
  return (
    <div style={{
      width: "100vw",
      height: "100vh",
      display: "flex",
      overflow: "hidden",
    }}>
      <Sidebar />
      <main style={{
        flex: 1,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}>
        <Outlet />
      </main>
    </div>
  );
}
```

**Step 5: Wire up React Router in App.tsx**

Replace `src/App.tsx`:
```tsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { TerminalView } from "./views/TerminalView";
import { DashboardView } from "./views/DashboardView";
import { DiagramView } from "./views/DiagramView";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/terminal" element={<TerminalView />} />
          <Route path="/dashboard" element={<DashboardView />} />
          <Route path="/diagrams" element={<DiagramView />} />
          <Route path="*" element={<Navigate to="/terminal" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

**Step 6: Test the shell**

Run: `just dev`
Expected: Sidebar with nav links. Clicking "Terminal" shows the working terminal. Clicking "Dashboard"/"Diagrams" shows placeholders. Default route goes to terminal.

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: app shell with sidebar, routing, and three main views"
```

---

## Phase 3: SQLite Persistence (phantom-db)

### Task 4: Create the phantom-db crate with schema and migrations

**Files:**
- Create: `crates/phantom-db/Cargo.toml`
- Create: `crates/phantom-db/src/lib.rs`
- Create: `crates/phantom-db/src/schema.rs`
- Create: `crates/phantom-db/src/presets.rs`
- Create: `crates/phantom-db/src/analyses.rs`
- Modify: `Cargo.toml` (workspace members)
- Modify: `crates/phantom-app/Cargo.toml` (add dependency)

**Step 1: Add crate to workspace**

Append `"crates/phantom-db"` to the `members` array in `/Users/dak/projects/phantom/Cargo.toml`.

**Step 2: Create Cargo.toml for phantom-db**

Create `crates/phantom-db/Cargo.toml`:
```toml
[package]
name = "phantom-db"
version.workspace = true
edition.workspace = true

[dependencies]
rusqlite = { version = "0.31", features = ["bundled"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

**Step 3: Create schema module**

Create `crates/phantom-db/src/schema.rs`:
```rust
use rusqlite::Connection;

pub fn initialize(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS presets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('diagram', 'analysis', 'custom')),
            prompt_template TEXT NOT NULL,
            schedule TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS cli_presets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            cli_binary TEXT NOT NULL,
            flags TEXT NOT NULL DEFAULT '',
            working_dir TEXT,
            env_vars TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS analyses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_path TEXT NOT NULL,
            commit_sha TEXT NOT NULL,
            branch TEXT NOT NULL,
            preset_id INTEGER NOT NULL REFERENCES presets(id),
            status TEXT NOT NULL DEFAULT 'queued'
                CHECK(status IN ('queued', 'running', 'completed', 'failed')),
            raw_output TEXT,
            parsed_mermaid TEXT,
            parsed_findings TEXT,
            error_message TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            completed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_analyses_lookup
            ON analyses(repo_path, commit_sha, preset_id);

        CREATE INDEX IF NOT EXISTS idx_analyses_branch
            ON analyses(repo_path, branch, preset_id);
        ",
    )
}
```

**Step 4: Create presets CRUD module**

Create `crates/phantom-db/src/presets.rs`:
```rust
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisPreset {
    pub id: i64,
    pub name: String,
    #[serde(rename = "type")]
    pub preset_type: String,
    pub prompt_template: String,
    pub schedule: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliPreset {
    pub id: i64,
    pub name: String,
    pub cli_binary: String,
    pub flags: String,
    pub working_dir: Option<String>,
    pub env_vars: Option<String>,
}

pub fn list_analysis_presets(conn: &Connection) -> rusqlite::Result<Vec<AnalysisPreset>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, type, prompt_template, schedule FROM presets ORDER BY name",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(AnalysisPreset {
            id: row.get(0)?,
            name: row.get(1)?,
            preset_type: row.get(2)?,
            prompt_template: row.get(3)?,
            schedule: row.get(4)?,
        })
    })?;
    rows.collect()
}

pub fn create_analysis_preset(
    conn: &Connection,
    name: &str,
    preset_type: &str,
    prompt_template: &str,
    schedule: Option<&str>,
) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO presets (name, type, prompt_template, schedule) VALUES (?1, ?2, ?3, ?4)",
        params![name, preset_type, prompt_template, schedule],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn delete_analysis_preset(conn: &Connection, id: i64) -> rusqlite::Result<bool> {
    let changed = conn.execute("DELETE FROM presets WHERE id = ?1", params![id])?;
    Ok(changed > 0)
}

pub fn list_cli_presets(conn: &Connection) -> rusqlite::Result<Vec<CliPreset>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, cli_binary, flags, working_dir, env_vars FROM cli_presets ORDER BY name",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(CliPreset {
            id: row.get(0)?,
            name: row.get(1)?,
            cli_binary: row.get(2)?,
            flags: row.get(3)?,
            working_dir: row.get(4)?,
            env_vars: row.get(5)?,
        })
    })?;
    rows.collect()
}

pub fn create_cli_preset(
    conn: &Connection,
    name: &str,
    cli_binary: &str,
    flags: &str,
    working_dir: Option<&str>,
    env_vars: Option<&str>,
) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO cli_presets (name, cli_binary, flags, working_dir, env_vars) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![name, cli_binary, flags, working_dir, env_vars],
    )?;
    Ok(conn.last_insert_rowid())
}
```

**Step 5: Create analyses CRUD module**

Create `crates/phantom-db/src/analyses.rs`:
```rust
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Analysis {
    pub id: i64,
    pub repo_path: String,
    pub commit_sha: String,
    pub branch: String,
    pub preset_id: i64,
    pub status: String,
    pub raw_output: Option<String>,
    pub parsed_mermaid: Option<String>,
    pub parsed_findings: Option<String>,
    pub error_message: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
}

pub fn create_analysis(
    conn: &Connection,
    repo_path: &str,
    commit_sha: &str,
    branch: &str,
    preset_id: i64,
) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO analyses (repo_path, commit_sha, branch, preset_id) VALUES (?1, ?2, ?3, ?4)",
        params![repo_path, commit_sha, branch, preset_id],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update_analysis_status(
    conn: &Connection,
    id: i64,
    status: &str,
    raw_output: Option<&str>,
    parsed_mermaid: Option<&str>,
    parsed_findings: Option<&str>,
    error_message: Option<&str>,
) -> rusqlite::Result<bool> {
    let completed = if status == "completed" || status == "failed" {
        Some("datetime('now')")
    } else {
        None
    };
    let changed = conn.execute(
        &format!(
            "UPDATE analyses SET status = ?1, raw_output = ?2, parsed_mermaid = ?3, parsed_findings = ?4, error_message = ?5{} WHERE id = ?6",
            if completed.is_some() { ", completed_at = datetime('now')" } else { "" }
        ),
        params![status, raw_output, parsed_mermaid, parsed_findings, error_message, id],
    )?;
    Ok(changed > 0)
}

pub fn get_analysis(conn: &Connection, id: i64) -> rusqlite::Result<Option<Analysis>> {
    conn.query_row(
        "SELECT id, repo_path, commit_sha, branch, preset_id, status, raw_output, parsed_mermaid, parsed_findings, error_message, created_at, completed_at FROM analyses WHERE id = ?1",
        params![id],
        |row| Ok(Analysis {
            id: row.get(0)?,
            repo_path: row.get(1)?,
            commit_sha: row.get(2)?,
            branch: row.get(3)?,
            preset_id: row.get(4)?,
            status: row.get(5)?,
            raw_output: row.get(6)?,
            parsed_mermaid: row.get(7)?,
            parsed_findings: row.get(8)?,
            error_message: row.get(9)?,
            created_at: row.get(10)?,
            completed_at: row.get(11)?,
        }),
    ).optional()
}

pub fn find_cached_analysis(
    conn: &Connection,
    repo_path: &str,
    commit_sha: &str,
    preset_id: i64,
) -> rusqlite::Result<Option<Analysis>> {
    conn.query_row(
        "SELECT id, repo_path, commit_sha, branch, preset_id, status, raw_output, parsed_mermaid, parsed_findings, error_message, created_at, completed_at FROM analyses WHERE repo_path = ?1 AND commit_sha = ?2 AND preset_id = ?3 AND status = 'completed' ORDER BY created_at DESC LIMIT 1",
        params![repo_path, commit_sha, preset_id],
        |row| Ok(Analysis {
            id: row.get(0)?,
            repo_path: row.get(1)?,
            commit_sha: row.get(2)?,
            branch: row.get(3)?,
            preset_id: row.get(4)?,
            status: row.get(5)?,
            raw_output: row.get(6)?,
            parsed_mermaid: row.get(7)?,
            parsed_findings: row.get(8)?,
            error_message: row.get(9)?,
            created_at: row.get(10)?,
            completed_at: row.get(11)?,
        }),
    ).optional()
}

pub fn list_analyses_for_branch(
    conn: &Connection,
    repo_path: &str,
    branch: &str,
) -> rusqlite::Result<Vec<Analysis>> {
    let mut stmt = conn.prepare(
        "SELECT id, repo_path, commit_sha, branch, preset_id, status, raw_output, parsed_mermaid, parsed_findings, error_message, created_at, completed_at FROM analyses WHERE repo_path = ?1 AND branch = ?2 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map(params![repo_path, branch], |row| {
        Ok(Analysis {
            id: row.get(0)?,
            repo_path: row.get(1)?,
            commit_sha: row.get(2)?,
            branch: row.get(3)?,
            preset_id: row.get(4)?,
            status: row.get(5)?,
            raw_output: row.get(6)?,
            parsed_mermaid: row.get(7)?,
            parsed_findings: row.get(8)?,
            error_message: row.get(9)?,
            created_at: row.get(10)?,
            completed_at: row.get(11)?,
        })
    })?;
    rows.collect()
}
```

**Step 6: Create lib.rs**

Create `crates/phantom-db/src/lib.rs`:
```rust
pub mod analyses;
pub mod presets;
pub mod schema;

use rusqlite::Connection;
use std::path::Path;

pub use analyses::Analysis;
pub use presets::{AnalysisPreset, CliPreset};

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    schema::initialize(&conn)?;
    Ok(conn)
}
```

**Step 7: Add rusqlite `optional()` import**

Note: `rusqlite`'s `query_row` doesn't have `.optional()` built in — you need `use rusqlite::OptionalExtension;` at the top of `analyses.rs`:
```rust
use rusqlite::OptionalExtension;
```

**Step 8: Add phantom-db to workspace and phantom-app**

In `/Users/dak/projects/phantom/Cargo.toml`, add `"crates/phantom-db"` to workspace members.

In `crates/phantom-app/Cargo.toml`, add:
```toml
phantom-db = { path = "../phantom-db" }
```

**Step 9: Verify it compiles**

Run: `cargo check`
Expected: No errors.

**Step 10: Commit**

```bash
git add -A
git commit -m "feat: add phantom-db crate with SQLite schema, presets, and analyses"
```

---

## Phase 4: Git Branch Watching (phantom-git)

### Task 5: Implement phantom-git with branch listing and filesystem watching

**Files:**
- Modify: `crates/phantom-git/Cargo.toml`
- Modify: `crates/phantom-git/src/lib.rs`
- Create: `crates/phantom-git/src/branches.rs`
- Create: `crates/phantom-git/src/watcher.rs`

**Step 1: Add dependencies**

Replace `crates/phantom-git/Cargo.toml`:
```toml
[package]
name = "phantom-git"
version.workspace = true
edition.workspace = true

[dependencies]
notify = "6"
```

**Step 2: Create branches module**

Create `crates/phantom-git/src/branches.rs`:
```rust
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone)]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
    pub commit_sha: String,
}

pub fn list_branches(repo_path: &Path) -> Result<Vec<BranchInfo>, String> {
    let output = Command::new("git")
        .args(["branch", "--format=%(HEAD) %(refname:short) %(objectname:short)"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let branches = stdout
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() {
                return None;
            }
            let is_current = line.starts_with('*');
            let rest = line.trim_start_matches(['*', ' '].as_ref()).trim();
            let mut parts = rest.splitn(2, ' ');
            let name = parts.next()?.to_string();
            let commit_sha = parts.next().unwrap_or("").to_string();
            Some(BranchInfo { name, is_current, commit_sha })
        })
        .collect();

    Ok(branches)
}

pub fn current_branch(repo_path: &Path) -> Result<String, String> {
    let output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub fn head_commit(repo_path: &Path, branch: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(["rev-parse", branch])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub fn merge_base(repo_path: &Path, branch_a: &str, branch_b: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(["merge-base", branch_a, branch_b])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
```

**Step 3: Create watcher module**

Create `crates/phantom-git/src/watcher.rs`:
```rust
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::mpsc;

pub enum GitEvent {
    RefsChanged,
    HeadChanged,
}

/// Watch .git/refs/ and .git/HEAD for changes.
/// Returns a receiver that emits GitEvents, plus a handle to keep the watcher alive.
pub fn watch_git_dir(
    repo_path: PathBuf,
) -> Result<(mpsc::Receiver<GitEvent>, RecommendedWatcher), String> {
    let (tx, rx) = mpsc::channel();

    let git_dir = repo_path.join(".git");
    if !git_dir.exists() {
        return Err("not a git repository".to_string());
    }

    let refs_dir = git_dir.join("refs");
    let head_file = git_dir.join("HEAD");

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                for path in &event.paths {
                    if path.starts_with(&refs_dir) {
                        let _ = tx.send(GitEvent::RefsChanged);
                    } else if path == &head_file {
                        let _ = tx.send(GitEvent::HeadChanged);
                    }
                }
            }
        },
        Config::default(),
    )
    .map_err(|e| format!("failed to create watcher: {e}"))?;

    watcher
        .watch(&git_dir.join("refs"), RecursiveMode::Recursive)
        .map_err(|e| format!("failed to watch refs: {e}"))?;
    watcher
        .watch(&git_dir.join("HEAD"), RecursiveMode::NonRecursive)
        .map_err(|e| format!("failed to watch HEAD: {e}"))?;

    Ok((rx, watcher))
}
```

**Step 4: Wire up lib.rs**

Replace `crates/phantom-git/src/lib.rs`:
```rust
pub mod branches;
pub mod watcher;

pub use branches::{BranchInfo, current_branch, head_commit, list_branches, merge_base};
pub use watcher::{GitEvent, watch_git_dir};
```

**Step 5: Add phantom-git dependency to phantom-app**

In `crates/phantom-app/Cargo.toml`, add:
```toml
phantom-git = { path = "../phantom-git" }
```

**Step 6: Verify it compiles**

Run: `cargo check`
Expected: No errors.

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: implement phantom-git with branch listing and fs watcher"
```

---

## Phase 5: Tauri Commands for Git and Presets

### Task 6: Expose git and preset operations as Tauri commands

**Files:**
- Create: `crates/phantom-app/src/commands/git.rs`
- Create: `crates/phantom-app/src/commands/presets.rs`
- Modify: `crates/phantom-app/src/commands/mod.rs`
- Modify: `crates/phantom-app/src/state.rs`
- Modify: `crates/phantom-app/src/main.rs`

**Step 1: Add DB and repo path to AppState**

Modify `crates/phantom-app/src/state.rs` — add `db` and `repo_path` fields:
```rust
use rusqlite::Connection;
use std::path::PathBuf;

// Add to AppState struct:
pub db: Arc<Mutex<Connection>>,
pub repo_path: PathBuf,
```

Update `AppState::new()` to accept `db: Connection, repo_path: PathBuf` and store them.

**Step 2: Create git commands**

Create `crates/phantom-app/src/commands/git.rs`:
```rust
use crate::state::AppState;
use serde::Serialize;

#[derive(Serialize)]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
    pub commit_sha: String,
}

#[tauri::command]
pub async fn list_branches(state: tauri::State<'_, AppState>) -> Result<Vec<BranchInfo>, String> {
    let branches = phantom_git::list_branches(&state.repo_path)?;
    Ok(branches
        .into_iter()
        .map(|b| BranchInfo {
            name: b.name,
            is_current: b.is_current,
            commit_sha: b.commit_sha,
        })
        .collect())
}

#[tauri::command]
pub async fn get_current_branch(state: tauri::State<'_, AppState>) -> Result<String, String> {
    phantom_git::current_branch(&state.repo_path)
}
```

**Step 3: Create preset commands**

Create `crates/phantom-app/src/commands/presets.rs`:
```rust
use crate::state::AppState;
use phantom_db::presets;

#[tauri::command]
pub async fn list_cli_presets(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<presets::CliPreset>, String> {
    let conn = state.db.lock().unwrap();
    presets::list_cli_presets(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_cli_preset(
    state: tauri::State<'_, AppState>,
    name: String,
    cli_binary: String,
    flags: String,
    working_dir: Option<String>,
) -> Result<i64, String> {
    let conn = state.db.lock().unwrap();
    presets::create_cli_preset(&conn, &name, &cli_binary, &flags, working_dir.as_deref(), None)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_analysis_presets(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<presets::AnalysisPreset>, String> {
    let conn = state.db.lock().unwrap();
    presets::list_analysis_presets(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_analysis_preset(
    state: tauri::State<'_, AppState>,
    name: String,
    preset_type: String,
    prompt_template: String,
    schedule: Option<String>,
) -> Result<i64, String> {
    let conn = state.db.lock().unwrap();
    presets::create_analysis_preset(&conn, &name, &preset_type, &prompt_template, schedule.as_deref())
        .map_err(|e| e.to_string())
}
```

**Step 4: Update commands/mod.rs**

```rust
pub mod git;
pub mod presets;
pub mod terminal;
```

**Step 5: Register new commands in main.rs**

Add to the `invoke_handler` in `main.rs`:
```rust
commands::git::list_branches,
commands::git::get_current_branch,
commands::presets::list_cli_presets,
commands::presets::create_cli_preset,
commands::presets::list_analysis_presets,
commands::presets::create_analysis_preset,
```

Update `main.rs` to initialize DB and detect repo path before building the Tauri app.

**Step 6: Verify it compiles**

Run: `cargo check`
Expected: No errors.

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: Tauri commands for git branches and preset CRUD"
```

---

## Phase 6: Wire Sidebar to Live Branch Data

### Task 7: Connect sidebar to real git branch data

**Files:**
- Create: `src/lib/api.ts`
- Modify: `src/components/Sidebar.tsx`

**Step 1: Create the Tauri API wrapper**

Create `src/lib/api.ts`:
```typescript
import { invoke } from "@tauri-apps/api/core";

export interface BranchInfo {
  name: string;
  is_current: boolean;
  commit_sha: string;
}

export interface CliPreset {
  id: number;
  name: string;
  cli_binary: string;
  flags: string;
  working_dir: string | null;
  env_vars: string | null;
}

export interface AnalysisPreset {
  id: number;
  name: string;
  type: string;
  prompt_template: string;
  schedule: string | null;
}

export interface AnalysisResult {
  id: number;
  repo_path: string;
  commit_sha: string;
  branch: string;
  preset_id: number;
  status: string;
  raw_output: string | null;
  parsed_mermaid: string | null;
  parsed_findings: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export const api = {
  listBranches: () => invoke<BranchInfo[]>("list_branches"),
  getCurrentBranch: () => invoke<string>("get_current_branch"),
  listCliPresets: () => invoke<CliPreset[]>("list_cli_presets"),
  createCliPreset: (name: string, cli_binary: string, flags: string, working_dir?: string) =>
    invoke<number>("create_cli_preset", { name, cliBinary: cli_binary, flags, workingDir: working_dir }),
  listAnalysisPresets: () => invoke<AnalysisPreset[]>("list_analysis_presets"),
  createAnalysisPreset: (name: string, type: string, prompt_template: string, schedule?: string) =>
    invoke<number>("create_analysis_preset", { name, presetType: type, promptTemplate: prompt_template, schedule }),
};
```

**Step 2: Update Sidebar to fetch and display branches**

Update `src/components/Sidebar.tsx` to call `api.listBranches()` on mount and render real branch names. Use `useState`/`useEffect` to load branches. Highlight the current branch. Show the branch list in the bottom section of the sidebar.

**Step 3: Create a Zustand store for workspace state**

Create `src/stores/workspace.ts`:
```typescript
import { create } from "zustand";

interface WorkspaceState {
  selectedBranch: string;
  repoPath: string;
  setSelectedBranch: (branch: string) => void;
  setRepoPath: (path: string) => void;
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  selectedBranch: "main",
  repoPath: "",
  setSelectedBranch: (branch) => set({ selectedBranch: branch }),
  setRepoPath: (path) => set({ repoPath: path }),
}));
```

**Step 4: Test branch list renders**

Run: `just dev`
Expected: Sidebar shows real branch names from the repo.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: sidebar shows live git branches from Tauri backend"
```

---

## Phase 7: CLI Session Launcher

### Task 8: Build the CLI session launcher view with presets

**Files:**
- Create: `src/views/LauncherView.tsx`
- Create: `src/components/PresetCard.tsx`
- Create: `src/components/PresetEditor.tsx`
- Modify: `src/components/Sidebar.tsx` (add launcher nav item)
- Modify: `src/App.tsx` (add route)

**Step 1: Create PresetCard component**

A card for each CLI preset showing name, binary, flags, and a "Launch" button.

**Step 2: Create PresetEditor component**

A form to create/edit CLI presets: name, binary (dropdown: claude/codex/cursor/custom), flags text input, working dir.

**Step 3: Create LauncherView**

Lists CLI presets as cards. "Launch" button spawns a terminal with the preset's command. `[+ New Preset]` button opens the editor.

**Step 4: Wire into router**

Add `/launcher` route in `App.tsx` and nav item in `Sidebar.tsx`.

**Step 5: Test preset creation and launch**

Run: `just dev`
Expected: Can create a CLI preset, see it listed, click Launch to open a terminal with the command.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: CLI session launcher with presets"
```

---

## Phase 8: Analysis Engine (phantom-analysis)

### Task 9: Create phantom-analysis crate with job runner

**Files:**
- Create: `crates/phantom-analysis/Cargo.toml`
- Create: `crates/phantom-analysis/src/lib.rs`
- Create: `crates/phantom-analysis/src/runner.rs`
- Create: `crates/phantom-analysis/src/parser.rs`
- Create: `crates/phantom-analysis/src/diff.rs`
- Modify: `Cargo.toml` (workspace members)
- Modify: `crates/phantom-app/Cargo.toml`

**Step 1: Create the crate**

```toml
[package]
name = "phantom-analysis"
version.workspace = true
edition.workspace = true

[dependencies]
phantom-db = { path = "../phantom-db" }
phantom-git = { path = "../phantom-git" }
tokio = { version = "1", features = ["process", "sync", "rt"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

**Step 2: Create the job runner**

`runner.rs` — spawns CLI subprocesses (`claude --print -p "<prompt>"`), captures stdout, updates status in SQLite. Uses `tokio::process::Command` for async subprocess management. Emits status updates via a channel that the Tauri app can forward as events.

Key struct:
```rust
pub struct JobRunner {
    db: Arc<Mutex<Connection>>,
}

impl JobRunner {
    pub async fn run_analysis(
        &self,
        analysis_id: i64,
        cli_binary: &str,
        prompt: &str,
        repo_path: &Path,
        status_tx: mpsc::Sender<JobStatusUpdate>,
    ) -> Result<(), String>
}
```

**Step 3: Create the mermaid parser**

`parser.rs` — extracts mermaid code blocks from raw AI output. Looks for ` ```mermaid ... ``` ` blocks. Also extracts structured findings (numbered lists, bullet points with categories).

**Step 4: Create the diff engine**

`diff.rs` — compares two parsed mermaid diagrams. Parses mermaid graph syntax to extract node IDs and edges. Produces a list of added/removed/modified nodes and edges.

**Step 5: Wire up lib.rs**

```rust
pub mod diff;
pub mod parser;
pub mod runner;
```

**Step 6: Verify it compiles**

Run: `cargo check`

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: phantom-analysis crate with job runner, parser, and diff engine"
```

---

### Task 10: Add analysis Tauri commands and events

**Files:**
- Create: `crates/phantom-app/src/commands/analysis.rs`
- Modify: `crates/phantom-app/src/commands/mod.rs`
- Modify: `crates/phantom-app/src/main.rs`

**Step 1: Create analysis commands**

Commands:
- `run_analysis(preset_id, branch)` — creates analysis record, spawns job, returns analysis ID
- `cancel_analysis(analysis_id)` — kills running job
- `get_analysis(analysis_id)` — returns analysis result
- `list_analyses(branch)` — returns all analyses for a branch
- `get_analysis_diff(branch_analysis_id, main_analysis_id)` — runs diff engine

**Step 2: Set up Tauri event emission**

When a job status changes, emit `analysis:status_changed` event with `{ id, status, progress }` so the frontend dashboard updates in real time.

**Step 3: Register commands**

Add to `invoke_handler` in `main.rs`.

**Step 4: Verify it compiles**

Run: `cargo check`

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: Tauri commands and events for analysis jobs"
```

---

## Phase 9: Analysis Dashboard Frontend

### Task 11: Build the analysis dashboard with live-updating cards

**Files:**
- Modify: `src/views/DashboardView.tsx`
- Create: `src/components/AnalysisCard.tsx`
- Create: `src/components/CustomAnalysisEditor.tsx`
- Modify: `src/lib/api.ts` (add analysis endpoints)

**Step 1: Add analysis API functions**

Add to `src/lib/api.ts`:
- `runAnalysis(presetId, branch)`
- `cancelAnalysis(analysisId)`
- `getAnalysis(analysisId)`
- `listAnalyses(branch)`

**Step 2: Create AnalysisCard component**

Shows preset name, status badge, last run time, findings summary, diff vs main summary. Actions: View, Rerun, Cancel.

**Step 3: Create CustomAnalysisEditor**

A prompt textarea + schedule selector for creating custom analysis presets.

**Step 4: Build DashboardView**

Grid of AnalysisCards, one per preset. `[+ Add Custom Analysis]` button. Listen to Tauri `analysis:status_changed` events to update cards in real time.

**Step 5: Test the dashboard**

Run: `just dev`
Expected: Dashboard shows preset cards. Clicking "Run" starts a job, card updates to "running", then "completed" with results.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: analysis dashboard with live-updating cards"
```

---

## Phase 10: Diagram System

### Task 12: Mermaid-to-React-Flow converter

**Files:**
- Create: `src/lib/mermaid-parser.ts`
- Create: `src/lib/mermaid-to-reactflow.ts`

**Step 1: Create the mermaid graph parser**

Parse mermaid `graph TD` / `graph LR` syntax into an AST of nodes and edges. Handle node IDs, labels, edge labels, subgraphs.

**Step 2: Create the React Flow converter**

Convert the parsed AST into React Flow `Node[]` and `Edge[]` arrays. Apply automatic layout (dagre or elkjs). Assign node types based on metadata (service, module, function).

**Step 3: Write tests**

Test with sample mermaid output from Claude analysis.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: mermaid to React Flow conversion with auto-layout"
```

---

### Task 13: Build the diagram viewer with drill-down navigation

**Files:**
- Modify: `src/views/DiagramView.tsx`
- Create: `src/components/DiagramCanvas.tsx`
- Create: `src/components/Breadcrumb.tsx`
- Create: `src/components/DiagramNode.tsx`

**Step 1: Create custom DiagramNode component**

A React Flow custom node that renders service/module/function nodes. Clickable to drill down. Supports diff coloring (green/red/yellow border).

**Step 2: Create Breadcrumb component**

Shows navigation trail: `System > Service > Function`. Clickable segments to navigate up.

**Step 3: Create DiagramCanvas**

Wraps React Flow with controls, minimap, and pan/zoom. Renders nodes and edges from analysis results.

**Step 4: Build DiagramView**

Fetches analysis results for the selected branch and preset. Converts mermaid to React Flow. Renders DiagramCanvas with Breadcrumb. Clicking a node triggers a deeper analysis (or fetches cached) and pushes to breadcrumb.

**Step 5: Add diff annotations**

When viewing a branch, compare against main's analysis. Color-code nodes: green (new), red (removed), yellow (modified). Add a toggle for diff view vs clean view.

**Step 6: Test the full diagram flow**

Run: `just dev`
Expected: Run architecture analysis → see diagram → click node to drill down → breadcrumb navigates back → branch shows color-coded diffs.

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: interactive diagram viewer with drill-down and branch diff annotations"
```

---

## Phase 11: Background Analysis Scheduling

### Task 14: Implement background analysis triggers

**Files:**
- Create: `crates/phantom-app/src/scheduler.rs`
- Modify: `crates/phantom-app/src/main.rs`

**Step 1: Create the scheduler**

A tokio task that:
1. Watches for git events from `phantom_git::watch_git_dir()`
2. Polls periodically (configurable interval) for new commits on main
3. When main changes: queues all presets with `schedule = 'on_main_change'`
4. When branch changes: queues diff analyses

**Step 2: Start the scheduler on app launch**

In `main.rs`, after Tauri setup, start the scheduler task with access to `AppState`.

**Step 3: Seed built-in presets**

On first launch (empty presets table), seed the 4 built-in presets:
- Architecture Diagram
- Performance Analysis
- Security Scan
- Dependency Map

Each with a carefully crafted prompt template.

**Step 4: Test background scheduling**

Run: `just dev`
Expected: Make a commit on main → analysis jobs automatically queue and run → dashboard updates.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: background analysis scheduler with git watching and built-in presets"
```

---

## Phase 12: Terminal Split Management

### Task 15: Add split/tab terminal management to TerminalView

**Files:**
- Create: `src/components/SplitContainer.tsx`
- Create: `src/components/TerminalTabs.tsx`
- Create: `src/stores/terminal-layout.ts`
- Modify: `src/views/TerminalView.tsx`
- Modify: `src/terminal/mount.ts` (support multiple instances)

**Step 1: Create terminal layout store**

Zustand store managing a tree of splits and tabs:
```typescript
interface Pane {
  id: string;
  type: "terminal";
  sessionId?: number;
  title: string;
}

interface Split {
  id: string;
  direction: "horizontal" | "vertical";
  children: (Pane | Split)[];
  sizes: number[]; // percentages
}
```

**Step 2: Create SplitContainer**

Recursive component that renders splits with draggable dividers. Each leaf renders a tab bar + terminal island.

**Step 3: Create TerminalTabs**

Tab bar for multiple sessions within a single pane. Add tab button creates new session.

**Step 4: Update TerminalView**

Replace single terminal with SplitContainer. Add keyboard shortcuts for splitting (Ctrl+Shift+| for vertical, Ctrl+Shift+- for horizontal).

**Step 5: Test splits and tabs**

Run: `just dev`
Expected: Can create splits, tabs within splits, resize by dragging, close panes.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: terminal split and tab management"
```

---

## Phase 13: Status Bar

### Task 16: Add a global status bar

**Files:**
- Create: `src/components/StatusBar.tsx` (React version, separate from SolidJS one)
- Modify: `src/components/Layout.tsx`

**Step 1: Create the status bar**

Shows:
- Current branch name (from workspace store)
- Number of running analysis jobs
- Number of active terminal sessions
- Quick actions (new terminal, run analysis)

**Step 2: Wire into Layout**

Add at the bottom of `<Layout>`.

**Step 3: Test**

Run: `just dev`
Expected: Status bar shows accurate counts that update as sessions/jobs change.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: global status bar with branch, jobs, and session counts"
```

---

## Phase 14: Polish and Integration

### Task 17: End-to-end integration testing

**Step 1: Test the full workflow**

1. Launch Phantom pointed at a git repo
2. See branches in sidebar, select one
3. Open terminal view, create splits, launch Claude Code via preset
4. Switch to dashboard, run architecture analysis
5. View generated diagram, drill into a service
6. Switch to a feature branch, see diff annotations
7. Create a custom analysis, run it
8. Verify background analysis triggers on main commit

**Step 2: Fix any issues found**

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: Phantom workspace v1 complete"
```
