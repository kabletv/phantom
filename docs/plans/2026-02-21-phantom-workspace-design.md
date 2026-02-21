# Phantom: AI-Powered Development Workspace

## Overview

Phantom evolves from a terminal emulator into a full AI-powered development workspace. Three equal pillars:

1. **Terminal emulator** — embedded split/tab terminal sessions (existing SolidJS + Canvas2D)
2. **AI CLI manager** — first-class launcher for Claude Code, Codex, Cursor CLI with configurable presets
3. **Repo analysis dashboard** — AI-driven architecture diagrams, performance analysis, custom prompts with branch-vs-main comparison

## Tech Stack

- **Desktop shell**: Tauri v2
- **Frontend**: React (primary) + SolidJS (terminal island only)
- **Diagrams**: Mermaid syntax → React Flow renderer
- **Backend**: Rust (Tauri commands + events)
- **Persistence**: SQLite (analyses, presets, sessions, settings)
- **AI integration**: CLI subprocess spawning (claude, codex, cursor — all treated uniformly)
- **Build**: Single Vite app, React as primary framework, SolidJS mounted as island

## Application Shell & Layout

```
+----------------------------------------------------------+
|  Title Bar (draggable, Tauri window controls)            |
+--------+-------------------------------------------------+
|        |                                                 |
|  Side  |              Main Content Area                  |
|  bar   |                                                 |
|        |  View switches between:                         |
| * main |  - Terminal view (splits, tabs)                 |
|   feat |  - Analysis dashboard                           |
|   fix/ |  - Diagram drill-down viewer                    |
|        |  - CLI session launcher                         |
| ------ |                                                 |
| [+New] |                                                 |
|        |                                                 |
+--------+-------------------------------------------------+
|  Status Bar (active branch, running jobs, session count) |
+----------------------------------------------------------+
```

- **Sidebar**: Branches listed as "projects". Clicking switches context to that branch's analysis, terminals, and jobs.
- **Main content**: Routed views via React Router.
- **Status bar**: Active branch, running analysis job count, active CLI sessions.
- SolidJS terminal mounts into React layout DOM nodes via `render()`.

## Terminal & CLI Session Management

### Session Creation

- Quick-launch buttons for each supported CLI (Claude Code, Codex, Cursor CLI, plain shell).
- Clicking a CLI button spawns a terminal with the command pre-filled from preset config.
- No manual command typing needed.

### Presets (per-user, SQLite)

Each preset specifies:
- CLI binary name
- Flags/arguments
- Optional working directory override
- Optional environment variables

Example:
```
Preset: "Claude Opus Deep"
  CLI: claude
  Flags: --model opus --verbose
```

Presets appear in the `[+ New Session]` dropdown.

### Split Management

- Horizontal and vertical splits.
- Drag to resize boundaries.
- Tabs within each split pane.
- Each terminal is a SolidJS island mounted into React's split pane DOM node.

### Session Lifecycle

- Sessions scoped to a branch — switching branches shows that branch's sessions.
- Sessions persist across view switches (terminal stays alive when viewing diagrams).
- Sessions can be named/renamed.

## Analysis Pipeline & Caching

### Architecture

```
Trigger --> Job Queue --> CLI Runner --> Parser --> Cache (SQLite)
```

### Triggers

- **Event-driven**: Filesystem watcher on `.git/refs/heads/main` detects changes.
- **Periodic polling**: Configurable interval checks for new commits on main.
- **Manual**: User clicks "Reanalyze".
- **Branch switch**: Diff analysis runs against cached main results.

### Job Execution

- Each job spawns a CLI subprocess (e.g. `claude --print -p "<prompt>"`).
- Prompt constructed from preset template + repo context.
- Unlimited parallel jobs — no artificial throttling.
- Job statuses: `queued -> running -> completed | failed`.
- Real-time status via Tauri events.

### Cache Schema

```sql
analyses(
  id,
  repo_path,
  commit_sha,
  branch,
  preset_id,
  status,           -- queued/running/completed/failed
  raw_output,
  parsed_mermaid,
  parsed_findings,
  created_at,
  completed_at
)

presets(
  id,
  name,
  type,             -- 'diagram' | 'analysis' | 'custom'
  prompt_template,
  schedule          -- null | 'on_main_change' | cron expression
)
```

### Branch Comparison

1. Compute merge-base between branch HEAD and main.
2. Fetch cached main analysis at merge-base commit.
3. Run same preset against branch HEAD.
4. Diff engine compares parsed results — produces annotated node/edge list.
5. Frontend renders annotated diagram.

### Built-in Presets

- **Architecture Diagram** — multi-level system -> service -> logic flow.
- **Performance Analysis** — identify performance improvement opportunities.
- **Security Scan** — surface potential security concerns.
- **Dependency Map** — visualize internal/external dependency graph.

## Diagram System

### Mermaid to React Flow

- AI outputs mermaid chart syntax.
- Parser converts mermaid graph definitions into React Flow node/edge data.
- Nodes get typed metadata: `{ id, label, type, children_preset_id }`.
- Edges preserve relationship types.

### Drill-Down Navigation

Three levels of fidelity:
1. **System architecture** — high-level services/components.
2. **Service internals** — modules, layers, abstractions within a service.
3. **Logic flow** — function-level control flow, data transformations.

Breadcrumb trail at the top: `System Architecture > Auth Service > Login Flow`. Click to navigate up.

### Branch Diff Annotations

Color coding on nodes and edges:
- **Green**: new (on branch, not on main)
- **Red**: removed (on main, not on branch)
- **Yellow**: modified (changed connections or internals)
- **Gray**: unchanged

Toggle between "diff view" and "clean view".

### Interaction

- Pan/zoom on React Flow canvas.
- Click node to drill down.
- Hover for summary tooltip.
- Minimap for large diagrams.
- Export as PNG/SVG.

## Analysis Dashboard

### Card Layout

Each preset gets a dashboard card showing:
- Preset name and icon
- Status (queued/running/complete/failed)
- Last run timestamp
- Summary of findings
- Diff summary vs main (on branch views)
- Actions: View results, Rerun, Cancel

### Custom Analysis

- `[+ Add Custom Analysis]` opens a prompt editor.
- Free-form prompt entry.
- Optional schedule: manual, on main change, or periodic.
- Saves as personal preset with its own card.

### Context Switching

- **Main selected**: Cards show absolute findings (baseline).
- **Branch selected**: Cards show findings relative to main.

### Real-Time Updates

- Tauri events push job status changes.
- Cards update live — no frontend polling.

## Rust Backend Crates

| Crate | Responsibility | Status |
|---|---|---|
| `phantom-app` | Tauri binary, commands, IPC | Exists, extend |
| `phantom-vt` | Terminal emulation | Exists, unchanged |
| `phantom-pty` | PTY management | Exists, unchanged |
| `phantom-git` | Git operations, branch watching, merge-base | Exists, extend |
| `phantom-analysis` | Job queue, CLI spawning, output parsing, mermaid extraction, diff engine | **New** |
| `phantom-db` | SQLite persistence | **New** |

## End-to-End Data Flow

### Analysis Run

1. Git watcher detects new commit (or user clicks Rerun).
2. `phantom-analysis` creates job record in SQLite (queued).
3. Tauri event `analysis:job_updated` fires — dashboard card appears.
4. Job runner constructs command from preset, spawns CLI subprocess.
5. Stdout piped, streamed to frontend for progress.
6. Raw output parsed for mermaid blocks and structured findings.
7. Results written to SQLite cache keyed by `(repo, commit, preset)`.
8. Tauri event fires — card updates, diagram becomes viewable.

### Branch Comparison

1. User selects branch in sidebar.
2. Rust computes merge-base.
3. Fetches cached main analysis at merge-base commit.
4. Runs (or fetches cached) same preset against branch HEAD.
5. Diff engine compares, produces annotated node/edge list.
6. Frontend renders annotated React Flow diagram.
