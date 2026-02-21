# Phantom

An AI-powered development workspace built with Tauri v2, React, and SolidJS. Combines a full terminal emulator, AI CLI session launcher, and automated repository analysis dashboard in a single native desktop app.

```
 +-----------+------------------------------------------+
 |           |                                          |
 |  Sidebar  |   Terminal  |  Dashboard  |  Diagrams   |
 | --------- |                                          |
 | Branches  |   Split terminal panes with tabs,        |
 |  - main   |   AI CLI presets, architecture graphs,   |
 |  - feat/* |   security scans, and performance        |
 |           |   analysis -- all in one window.          |
 |           |                                          |
 +-----------+------------------------------------------+
 | Status: main @ a3f81c | 2 analyses running           |
 +------------------------------------------------------+
```

## Features

**Terminal Emulator** -- Full terminal emulation powered by alacritty_terminal with Canvas2D rendering, split panes, tabs, and keyboard shortcuts. Sessions persist across view switches.

**AI CLI Launcher** -- Configure and launch Claude Code, Codex, Cursor, or any CLI tool with saved presets including flags, working directory, and budget constraints.

**Analysis Dashboard** -- Run AI-powered analyses against your codebase: architecture diagrams, security scans, performance audits, and dependency maps. Results are cached per commit and refresh automatically when `main` changes.

**Interactive Diagrams** -- Explore AI-generated architecture diagrams as interactive React Flow graphs with 3-level drill-down, diff overlays (branch vs. main), and dagre auto-layout.

**Background Scheduler** -- Watches your git refs and automatically re-runs scheduled analyses when the main branch changes. Configurable concurrency limits.

## Quick Start

### Prerequisites

- [Rust](https://rustup.rs/) (edition 2021)
- [Node.js](https://nodejs.org/) >= 18
- [just](https://github.com/casey/just) (task runner)
- Tauri v2 system dependencies ([platform guide](https://v2.tauri.app/start/prerequisites/))

### Install & Run

```bash
git clone https://github.com/kabletv/phantom.git
cd phantom
npm install
just dev
```

This builds the terminal package, starts the Vite dev server, and launches the Tauri app.

### Build for Production

```bash
just build
```

### Type-check Rust Only

```bash
just check
# or
cargo check
```

### Run Tests

```bash
cargo test
```

54 tests across all crates (22 phantom-analysis, 6 phantom-app, 15 phantom-pty, 11 phantom-vt).

## Architecture

```
+------------------------------------------------------------------+
|                        Tauri v2 Shell                             |
|  +-------------------+  +---------------------+  +-------------+ |
|  | phantom-app       |  | phantom-analysis    |  | phantom-git | |
|  | (main binary)     |  | (CLI runner, parser |  | (branches,  | |
|  |                   |  |  diff engine)       |  |  watcher)   | |
|  | - Tauri commands  |  +---------------------+  +-------------+ |
|  | - Scheduler       |  +---------------------+                  |
|  | - Render pump     |  | phantom-db          |                  |
|  | - IPC encoding    |  | (SQLite, migrations |                  |
|  +-------------------+  |  presets, settings)  |                  |
|  +-------------------+  +---------------------+                  |
|  | phantom-vt        |                                           |
|  | (alacritty_terminal                                           |
|  |  wrapper)          |                                          |
|  +-------------------+                                           |
|  | phantom-pty       |                                           |
|  | (PTY spawn/       |                                           |
|  |  read/write)      |                                           |
|  +-------------------+                                           |
+------------------------------------------------------------------+
        |  Tauri IPC (commands + channels + events)
        v
+------------------------------------------------------------------+
|                        Frontend                                   |
|  +-----------------------------+  +----------------------------+ |
|  | React (primary UI)          |  | @phantom/terminal          | |
|  | - Layout, Sidebar, Router   |  | (SolidJS package)          | |
|  | - DashboardView             |  | - Terminal.tsx              | |
|  | - DiagramView (React Flow)  |  | - TerminalCanvas.tsx       | |
|  | - LauncherView              |  | - Canvas2D renderer        | |
|  | - Zustand stores            |  | - Keybinding encoder       | |
|  +-----------------------------+  +----------------------------+ |
+------------------------------------------------------------------+
```

### Dual-Framework Design

The terminal is a SolidJS component in `packages/terminal/`, built as a separate Vite library and mounted into the React app as an "island" via `TerminalIsland`. This lets the terminal use SolidJS's fine-grained reactivity for 60fps rendering while the rest of the UI uses React with React Router and Zustand.

### Data Flow

```
Terminal Input                          Terminal Output
--------------                          ---------------
Keypress                                Shell writes to PTY
  -> encodeKeyEvent()                     <- io_thread reads bytes
  -> writeInput(sessionId, bytes)         <- VtTerminal.process_bytes()
  -> Tauri command                        <- render_pump extracts cells (60Hz)
  -> PTY subprocess                       <- TerminalEvent via Tauri channel
                                          <- Canvas2D renderer draws frame

Analysis Pipeline
-----------------
User clicks "Run"    ->  Tauri command: run_analysis
                     ->  Check cache (commit + preset + level)
                     ->  Auth pre-check CLI tool
                     ->  Create DB record (status: queued)
                     ->  JobRunner acquires semaphore permit
                     ->  Spawn CLI subprocess (claude/codex/cursor)
                     ->  Parse JSON output (graph or findings)
                     ->  Store in SQLite
                     ->  Emit "analysis:status_changed" event
                     ->  Frontend refreshes
```

## Workspace Layout

```
phantom/
  src/                              # React frontend
    App.tsx                         # HashRouter with Layout wrapper
    components/
      Layout.tsx                    # Main shell: sidebar + content + status bar
      Sidebar.tsx                   # Branch list, nav links
      TerminalIsland.tsx            # SolidJS terminal mounted in React
      DiagramCanvas.tsx             # React Flow wrapper
      DiagramNode.tsx               # Custom node with diff styling
      AnalysisCard.tsx              # Dashboard preset card
      PresetCard.tsx                # CLI launcher preset card
      CustomAnalysisEditor.tsx      # New analysis form
      PresetEditor.tsx              # New CLI preset form
      SplitContainer.tsx            # Terminal pane splitter
      StatusBarReact.tsx            # Bottom status bar
      Breadcrumb.tsx                # Navigation breadcrumbs
      ui/
        EmptyState.tsx              # Placeholder for empty views
        ErrorBoundary.tsx           # React error boundary
        Skeleton.tsx                # Loading skeleton cards
        Toast.tsx                   # Toast notification system
    views/
      TerminalView.tsx              # Terminal pane host
      DashboardView.tsx             # Analysis preset grid
      DiagramView.tsx               # Interactive architecture diagrams
      LauncherView.tsx              # CLI session launcher
    stores/
      workspace.ts                  # Zustand: selected branch, state
      terminal-layout.ts            # Zustand: pane splits, tabs
    lib/
      api.ts                        # Tauri command wrappers
      graph-types.ts                # TypeScript types for graphs/diffs
      graph-to-reactflow.ts         # ArchitectureGraph -> React Flow
      analysis-schemas.ts           # JSON schemas for analysis output
    styles/
      global.css                    # Design tokens, component styles

  packages/
    terminal/                       # @phantom/terminal (SolidJS)
      src/
        components/
          Terminal.tsx              # Main terminal component
          TerminalCanvas.tsx        # Canvas2D grid renderer
          StatusBar.tsx             # Terminal title bar
        renderer/
          canvas-renderer.ts        # Binary cell decoding + drawing
          font-metrics.ts           # Font measurement
        lib/
          ipc.ts                    # Tauri command wrappers
          keybindings.ts            # Key event encoding
        stores/
          sessions.ts               # SolidJS session state

  crates/
    phantom-vt/                     # Terminal emulation (alacritty_terminal)
    phantom-pty/                    # PTY management (portable-pty)
    phantom-git/                    # Git operations + filesystem watcher
    phantom-db/                     # SQLite persistence layer
    phantom-analysis/               # Analysis engine (CLI runner, parser, differ)
    phantom-app/                    # Tauri v2 binary (commands, scheduler, IPC)

  docs/plans/                       # Design docs and implementation plans
```

## Crate Reference

### phantom-vt

Wraps `alacritty_terminal` to provide a clean Rust API for terminal emulation.

- `VtTerminal` -- create, process bytes, resize, query screen state
- `VtCell` -- single grid cell: codepoint, fg/bg RGB, flags, width
- `ScreenView` -- read-only snapshot of the terminal grid
- `CellFlags` -- bitflags: BOLD, ITALIC, UNDERLINE, STRIKETHROUGH, INVERSE, DIM, HIDDEN, BLINK

Binary cell format (16 bytes per cell, little-endian):

```
Bytes 0-3:   Unicode codepoint (u32)
Bytes 4-6:   Foreground RGB
Bytes 7-9:   Background RGB
Byte  10:    CellFlags
Byte  11:    Cell width (0, 1, or 2)
Bytes 12-15: Reserved
```

### phantom-pty

Bridges PTY processes with the VT terminal.

- `PtyHandle` -- spawn a shell, read/write, resize
- `TerminalSession` -- pairs `PtyHandle` + `VtTerminal`
- `Multiplexer` -- manages multiple sessions for tab-based multiplexing

### phantom-git

Git repository operations and filesystem watching.

- `list_branches()` / `current_branch()` / `head_commit()` / `merge_base()`
- `watch_git_dir()` -- returns a receiver of `GitEvent` (RefsChanged, HeadChanged)
- Uses the `notify` crate for cross-platform filesystem events

### phantom-db

SQLite persistence with schema versioning (currently v3).

**Tables:**

| Table | Purpose |
|-------|---------|
| `settings` | Key-value config (max_concurrency, default_cli_binary) |
| `presets` | Analysis presets (name, type, prompt_template, schedule) |
| `cli_presets` | CLI launch presets (binary, flags, working_dir, budget) |
| `analyses` | Analysis results (commit, branch, status, parsed output) |

**Key types:**

- `AnalysisPreset` -- template for running an analysis
- `CliPreset` -- template for launching a CLI session
- `Analysis` -- result record with `parsed_graph` or `parsed_findings`

### phantom-analysis

The analysis engine: CLI abstraction, output parsing, and graph diffing.

**CLI Abstraction** (`cli.rs`):

| CLI | Detection | Notes |
|-----|-----------|-------|
| Claude Code | binary contains "claude" | Default tool |
| Codex | binary contains "codex" | JSONL output extraction |
| Cursor | binary contains "cursor" | Cursor CLI flags |
| Unknown | fallback | Generic invocation |

- `build_command()` -- constructs the CLI invocation with correct flags per tool
- `check_auth()` -- pre-flight auth verification before spawning
- `map_exit_error()` -- translates exit codes to user-friendly messages
- `extract_payload()` -- handles Codex JSONL concatenation

**Parser** (`parser.rs`):

Extracts structured JSON from AI CLI output:

- `parse_graph()` -- deserializes `ArchitectureGraph` (nodes, edges, groups), validates IDs and references
- `parse_findings()` -- deserializes `AnalysisFindings` (findings, stats), generates stable IDs
- `extract_json_block()` -- finds fenced JSON in markdown output
- `strip_trailing_commas()` -- fixes common AI output formatting errors

**Differ** (`diff.rs`):

Compares two `ArchitectureGraph` instances:

```
GraphDiff {
  added_nodes:    [node IDs new in branch]
  removed_nodes:  [node IDs gone from branch]
  modified_nodes: [{ id, changes: [LabelChanged, TypeChanged, ...] }]
  added_edges:    [new edges]
  removed_edges:  [removed edges]
}
```

**Job Runner** (`runner.rs`):

- `JobRunner` with `tokio::sync::Semaphore` for bounded concurrency (default: 2)
- Shared semaphore across all analysis triggers (commands + scheduler)
- Status updates emitted via Tauri events for real-time dashboard updates

### phantom-app

The Tauri v2 binary that wires everything together.

**Tauri Commands:**

| Command | Description |
|---------|-------------|
| `create_terminal` | Spawn a new PTY session |
| `write_input` | Send keystrokes to a session |
| `resize_terminal` | Resize a session's PTY + VT |
| `close_terminal` | Kill a session |
| `list_branches` | List git branches |
| `get_current_branch` | Get HEAD branch name |
| `run_analysis` | Trigger an analysis (with caching) |
| `get_analysis` | Fetch a single analysis result |
| `list_analyses` | List analyses for a branch |
| `get_analysis_diff` | Diff two diagram analyses |
| `list_analysis_presets` | List analysis presets |
| `create_analysis_preset` | Create a new analysis preset |
| `list_cli_presets` | List CLI launch presets |
| `create_cli_preset` | Create a new CLI preset |
| `get_setting` / `set_setting` | Read/write settings |

**Scheduler:**

Watches git refs via `phantom-git::watch_git_dir()`. When `main` changes:

1. Queries all presets with `schedule = "on_main_change"`
2. Checks the cache for each (commit + preset + level)
3. Creates analysis records and spawns jobs for uncached presets
4. Falls back to 60-second polling if filesystem events are missed

**Render Pump:**

Runs at 60Hz, extracting terminal state and sending it to the frontend:

- `FullFrame` on session creation or resize (complete cell grid)
- `DirtyRows` for incremental updates (only changed rows)
- Suppresses idle ticks when no PTY data has arrived

## Views

### Terminal (`Cmd+1`)

Full terminal emulator with split panes. The SolidJS terminal component decodes 16-byte binary cells and renders them to a Canvas2D element at 60fps. Sessions stay alive when you switch to other views.

### Dashboard (`Cmd+2`)

Grid of analysis preset cards. Each card shows the preset name, type (diagram/analysis), last run status and timestamp. Click "Run" to trigger an analysis against the current branch. The dashboard subscribes to `analysis:status_changed` Tauri events for live status updates.

**Built-in presets** (seeded on first launch):

- Architecture Diagram -- mermaid-style graph of modules and dependencies
- Performance Analysis -- N+1 queries, blocking I/O, hot paths
- Security Scan -- OWASP Top 10, secrets in code, injection vulnerabilities
- Dependency Map -- crate/package dependencies with version constraints

### Diagrams (`Cmd+3`)

Interactive React Flow canvas showing AI-generated architecture graphs.

- **Drill-down**: Click a drillable node to zoom into its internals (up to 3 levels)
- **Breadcrumb navigation**: Click any level in the breadcrumb to navigate back
- **Diff overlay**: Toggle "Diff vs main" to see added (green), removed (red), and modified (yellow) nodes
- **Auto-layout**: dagre algorithm positions nodes automatically

### Launcher (`Cmd+4`)

Configure and launch AI CLI sessions with saved presets. Each preset specifies:

- CLI binary (claude, codex, cursor, or custom)
- Flags and arguments
- Working directory
- Budget constraint (USD)

Clicking "Launch" opens a new terminal pane with the configured command.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+1` | Switch to Terminal view |
| `Cmd+2` | Switch to Dashboard view |
| `Cmd+3` | Switch to Diagrams view |
| `Cmd+4` | Switch to Launcher view |
| `Cmd+T` | Open Terminal view |

## Configuration

Phantom stores its database at `.phantom/phantom.db` in the repository root (SQLite, WAL mode).

**Settings** (configurable via the settings API):

| Key | Default | Description |
|-----|---------|-------------|
| `analysis_max_concurrency` | `2` | Max concurrent analysis jobs |
| `analysis_default_cli_binary` | `claude` | Default CLI tool for analyses |

## Design System

Phantom uses a dark-first design system with CSS custom properties:

```
Backgrounds:   #09090b -> #111113 -> #1a1a1f -> #222228
Text:           #ececf0 (primary), #8b8b96 (secondary), #5a5a65 (tertiary)
Accent:         #7c6aef (purple)
Status:         #3dd68c (success), #f25f5c (error), #f0c040 (warning), #6cb4ee (info)
Typography:     Inter (UI), Berkeley Mono / JetBrains Mono (code)
Spacing:        4px base grid (--space-1 through --space-10)
Border radius:  4px (sm), 6px (md), 8px (lg), 12px (xl)
```

All animations respect `prefers-reduced-motion`. Focus rings use the accent color with 2px offset.

## Dependencies

### Rust

| Crate | Version | Purpose |
|-------|---------|---------|
| `tauri` | 2 | Desktop shell + IPC |
| `alacritty_terminal` | 0.25.1 | Terminal emulation engine |
| `portable-pty` | 0.9.0 | Cross-platform PTY |
| `tokio` | 1 | Async runtime |
| `rusqlite` | 0.31 | SQLite (bundled) |
| `notify` | 6 | Filesystem watcher |
| `serde` / `serde_json` | 1 | Serialization |
| `bitflags` | 2.11 | Cell attribute flags |

### JavaScript

| Package | Version | Purpose |
|---------|---------|---------|
| `react` | ^19.2 | UI framework |
| `solid-js` | ^1.9 | Terminal component |
| `@tauri-apps/api` | ^2 | Tauri bindings |
| `@xyflow/react` | ^12.10 | Interactive diagrams |
| `dagre` | ^0.8.5 | Graph layout algorithm |
| `react-router-dom` | ^7.13 | Client-side routing |
| `zustand` | ^5.0 | State management |
| `vite` | ^6 | Build tool |

## License

MIT
