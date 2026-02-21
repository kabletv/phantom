# Analysis System Design: Output Format & Information Architecture

This document specifies what the analysis system produces, how users navigate it, and how results are stored, diffed, and cached. It is the contract between the AI CLI runner (phantom-analysis), the SQLite persistence layer (phantom-db), and the React frontend (diagram viewer + dashboard).

**Key architectural decision**: The AI outputs **structured JSON** directly -- node/edge lists with types, labels, relationships, and metadata. JSON is the source of truth, stored in SQLite, and converted directly to React Flow on the frontend. Mermaid is never parsed. Mermaid can optionally be *generated from* the JSON for export/display, but the pipeline is: AI -> JSON -> React Flow (and optionally JSON -> Mermaid for export).

---

## 1. Multi-Level Diagram Architecture

### 1.1 Level Definitions

The analysis system produces diagrams at three levels of fidelity. Each level answers a different question about the codebase.

**Level 1 -- System Architecture**

Question: "What are the major components and how do they communicate?"

A "system component" is any unit that:
- Has its own process, crate, package, or deployment boundary
- Communicates with other components via IPC, network, or filesystem
- Could be replaced independently

For Phantom itself, Level 1 would show: `phantom-app`, `phantom-vt`, `phantom-pty`, `phantom-git`, `phantom-db`, `phantom-analysis`, the SolidJS terminal frontend, and the React frontend. External systems (the shell/PTY host, git binary, AI CLIs) appear as boundary nodes.

Node types at this level: `service`, `library`, `frontend`, `external`, `database`.

**Level 2 -- Service Internals**

Question: "What are the modules, layers, and key types inside this component?"

A "service internal" is any unit that:
- Is a module (`mod`) or file within the crate/package
- Represents a distinct layer (e.g., API surface vs internal logic vs data access)
- Contains key types (structs, traits, interfaces) that define the component's contract

For `phantom-pty`, Level 2 would show: `pty` (spawn/lifecycle), `session` (read/write abstraction), `multiplexer` (multi-session management), and the key types `PtyHandle`, `Session`, `Multiplexer`.

Node types at this level: `module`, `type`, `layer`, `trait`, `interface`.

**Level 3 -- Logic Flow**

Question: "How does data flow through this module's key operations?"

A "logic flow" is:
- A function call chain for a specific operation (e.g., "terminal input handling")
- Data transformations showing input -> processing -> output
- Control flow including branching, error paths, and async boundaries

For `phantom-pty::session`, Level 3 would show the read loop: `Session::read()` -> `PtyHandle::read_nonblocking()` -> buffer accumulation -> `VtParser::advance()` -> cell grid update -> render event emission.

Node types at this level: `function`, `method`, `async_boundary`, `decision`, `data_transform`, `error_path`.

### 1.2 Level Connections: Drill-Down Prompt Generation

When a user clicks a Level 1 node to see its internals, the system generates a Level 2 analysis. The prompt is constructed by template substitution using metadata from the clicked node:

```
Level 1 -> Level 2:
  The node's `id`, `label`, and `metadata.path` are injected into the Level 2 prompt template.
  The AI is told to analyze that specific component and return JSON in the ArchitectureGraph schema.

Level 2 -> Level 3:
  The node's `id`, `label`, and `metadata.file` are injected into the Level 3 prompt template.
  The AI is told to analyze that specific module's logic flows and return JSON in the ArchitectureGraph schema.
```

The `metadata` fields on each node provide the context needed for child prompts. This is why metadata is a required part of the graph schema -- without `path` on a Level 1 node, we cannot generate a Level 2 prompt.

### 1.3 Node ID Conventions

Node IDs follow a hierarchical, deterministic format:

```
Level 1: L1_{component_name}
  Examples: L1_phantom_pty, L1_react_frontend, L1_sqlite

Level 2: L2_{component}_{module_name}
  Examples: L2_phantom_pty_session, L2_phantom_pty_multiplexer

Level 3: L3_{component}_{module}_{function_name}
  Examples: L3_phantom_pty_session_read, L3_phantom_pty_session_write
```

Rules:
- All lowercase, underscores for word separation
- The prefix (`L1_`, `L2_`, `L3_`) encodes the level
- Each segment maps to the navigation path in the breadcrumb
- IDs must be valid JavaScript identifiers (alphanumeric + underscores, starting with a letter)

---

## 2. Graph JSON Schema (Source of Truth)

### 2.1 Design Rationale

The AI outputs structured JSON instead of mermaid syntax because:
1. **Reliability**: JSON is unambiguous to parse; mermaid has many syntax variants and edge cases
2. **Richness**: JSON can carry metadata (file paths, descriptions, drillable flags) that mermaid cannot represent
3. **Direct consumption**: The frontend converts JSON directly to React Flow nodes/edges with no intermediate parsing step
4. **Validation**: JSON can be validated against a schema; mermaid cannot
5. **Diffing**: Structured data diffs cleanly (compare node arrays); text diffs are fragile

Mermaid can be *generated from* the JSON for optional export (PNG, SVG, shareable text). This is a one-way conversion that never feeds back into the pipeline.

### 2.2 ArchitectureGraph JSON Schema

This is the single schema the AI must produce for all diagram presets. It is stored in the `parsed_graph` column of the `analyses` table.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ArchitectureGraph",
  "type": "object",
  "required": ["version", "level", "direction", "nodes", "edges"],
  "properties": {
    "version": {
      "type": "integer",
      "const": 1
    },
    "level": {
      "type": "integer",
      "enum": [1, 2, 3],
      "description": "1=system, 2=service internals, 3=logic flow"
    },
    "direction": {
      "type": "string",
      "enum": ["top-down", "left-right"],
      "description": "Preferred layout direction. top-down for levels 1-2, left-right for level 3."
    },
    "description": {
      "type": "string",
      "description": "1-3 sentence summary of what this diagram shows, used in context panel"
    },
    "nodes": {
      "type": "array",
      "items": { "$ref": "#/$defs/Node" }
    },
    "edges": {
      "type": "array",
      "items": { "$ref": "#/$defs/Edge" }
    },
    "groups": {
      "type": "array",
      "items": { "$ref": "#/$defs/Group" },
      "description": "Logical groupings (rendered as subgraphs/containers in the diagram)"
    }
  },
  "$defs": {
    "Node": {
      "type": "object",
      "required": ["id", "label", "type"],
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^L[123]_[a-z][a-z0-9_]*$",
          "description": "Hierarchical ID: L1_name, L2_parent_name, L3_parent_module_name"
        },
        "label": {
          "type": "string",
          "description": "Human-readable display name (e.g., 'phantom-pty', 'Session', 'read()')"
        },
        "type": {
          "type": "string",
          "enum": [
            "service", "library", "frontend", "external", "database",
            "module", "type", "layer", "trait", "interface",
            "function", "method", "async_boundary", "decision", "data_transform", "error_path"
          ]
        },
        "group": {
          "type": "string",
          "description": "ID of the group this node belongs to (references groups[].id)"
        },
        "metadata": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string",
              "description": "Repo-relative directory (Level 1) or file path (Level 2-3)"
            },
            "file": {
              "type": "string",
              "description": "Specific file path (Level 2-3)"
            },
            "line": {
              "type": "integer",
              "description": "Line number (Level 3)"
            },
            "description": {
              "type": "string",
              "description": "Brief description for tooltip (1-2 sentences)"
            },
            "drillable": {
              "type": "boolean",
              "description": "Whether clicking this node should trigger a deeper analysis. True for Level 1-2 nodes that have meaningful internals. False for leaf nodes and externals."
            },
            "signature": {
              "type": "string",
              "description": "Function/method signature (Level 3 only)"
            },
            "return_type": {
              "type": "string",
              "description": "Return type (Level 3 only)"
            }
          }
        }
      }
    },
    "Edge": {
      "type": "object",
      "required": ["source", "target", "type"],
      "properties": {
        "source": {
          "type": "string",
          "description": "Node ID of the source"
        },
        "target": {
          "type": "string",
          "description": "Node ID of the target"
        },
        "label": {
          "type": "string",
          "description": "Human-readable relationship description"
        },
        "type": {
          "type": "string",
          "enum": ["dependency", "dataflow", "call", "ownership", "ipc", "control_flow"],
          "description": "Semantic edge type, determines visual style"
        },
        "metadata": {
          "type": "object",
          "properties": {
            "condition": {
              "type": "string",
              "description": "For control_flow edges: the branching condition (e.g., 'on error', 'bytes > 0')"
            },
            "data_type": {
              "type": "string",
              "description": "For dataflow edges: the type being passed (e.g., 'Vec<u8>', 'CellGrid')"
            },
            "protocol": {
              "type": "string",
              "description": "For ipc edges: the protocol (e.g., 'Tauri IPC', 'subprocess', 'TCP')"
            }
          }
        }
      }
    },
    "Group": {
      "type": "object",
      "required": ["id", "label"],
      "properties": {
        "id": {
          "type": "string",
          "description": "Group identifier (e.g., 'frontend', 'backend', 'api_layer')"
        },
        "label": {
          "type": "string",
          "description": "Display label (e.g., 'Frontend Layer', 'Rust Backend')"
        },
        "description": {
          "type": "string",
          "description": "Brief description of the grouping rationale"
        }
      }
    }
  }
}
```

### 2.3 Edge Type Visual Mapping

Each edge type renders differently in React Flow:

| Edge Type | Line Style | Arrowhead | Color | Use Case |
|---|---|---|---|---|
| `dependency` | solid | arrow | gray | A uses/depends on B |
| `dataflow` | solid, thick | arrow | blue | Data passes from A to B |
| `call` | dashed | arrow | green | A calls B (function/method invocation) |
| `ownership` | solid | diamond | purple | A owns/contains B |
| `ipc` | dotted, thick | arrow | orange | Cross-process communication |
| `control_flow` | dashed | arrow | gray | Sequential flow, branching |

### 2.4 Level 1 Example (JSON)

```json
{
  "version": 1,
  "level": 1,
  "direction": "top-down",
  "description": "Phantom workspace architecture showing the Tauri desktop shell, terminal emulation pipeline, and AI analysis subsystem.",
  "nodes": [
    {
      "id": "L1_react_frontend",
      "label": "React UI",
      "type": "frontend",
      "group": "frontend",
      "metadata": {
        "path": "src/",
        "description": "Dashboard, diagrams, sidebar, routing. Primary UI framework.",
        "drillable": true
      }
    },
    {
      "id": "L1_solid_terminal",
      "label": "Terminal Renderer",
      "type": "frontend",
      "group": "frontend",
      "metadata": {
        "path": "src/terminal/",
        "description": "SolidJS canvas-based terminal renderer, mounted as island in React.",
        "drillable": true
      }
    },
    {
      "id": "L1_phantom_app",
      "label": "phantom-app",
      "type": "service",
      "group": "backend",
      "metadata": {
        "path": "crates/phantom-app/",
        "description": "Tauri v2 binary. IPC commands, state management, event emission.",
        "drillable": true
      }
    },
    {
      "id": "L1_phantom_vt",
      "label": "phantom-vt",
      "type": "library",
      "group": "backend",
      "metadata": {
        "path": "crates/phantom-vt/",
        "description": "Terminal emulation via alacritty_terminal. Parses VT sequences to cell grid.",
        "drillable": true
      }
    },
    {
      "id": "L1_phantom_pty",
      "label": "phantom-pty",
      "type": "library",
      "group": "backend",
      "metadata": {
        "path": "crates/phantom-pty/",
        "description": "PTY spawn, read/write, resize. Uses portable-pty.",
        "drillable": true
      }
    },
    {
      "id": "L1_phantom_git",
      "label": "phantom-git",
      "type": "library",
      "group": "backend",
      "metadata": {
        "path": "crates/phantom-git/",
        "description": "Branch listing, HEAD tracking, filesystem watcher for .git/refs.",
        "drillable": true
      }
    },
    {
      "id": "L1_phantom_db",
      "label": "phantom-db",
      "type": "database",
      "group": "backend",
      "metadata": {
        "path": "crates/phantom-db/",
        "description": "SQLite persistence for presets, analyses, and settings.",
        "drillable": true
      }
    },
    {
      "id": "L1_phantom_analysis",
      "label": "phantom-analysis",
      "type": "service",
      "group": "backend",
      "metadata": {
        "path": "crates/phantom-analysis/",
        "description": "Job queue, CLI subprocess spawning, output parsing, diff engine.",
        "drillable": true
      }
    },
    {
      "id": "L1_shell",
      "label": "Host Shell",
      "type": "external",
      "group": "external",
      "metadata": {
        "description": "OS shell and PTY host.",
        "drillable": false
      }
    },
    {
      "id": "L1_git_binary",
      "label": "git CLI",
      "type": "external",
      "group": "external",
      "metadata": {
        "description": "System git binary, invoked as subprocess.",
        "drillable": false
      }
    },
    {
      "id": "L1_ai_cli",
      "label": "AI CLIs",
      "type": "external",
      "group": "external",
      "metadata": {
        "description": "Claude, Codex, Cursor CLI. Spawned as subprocesses for analysis.",
        "drillable": false
      }
    }
  ],
  "edges": [
    { "source": "L1_react_frontend", "target": "L1_phantom_app", "label": "Tauri IPC", "type": "ipc", "metadata": { "protocol": "Tauri IPC" } },
    { "source": "L1_solid_terminal", "target": "L1_react_frontend", "label": "binary cell buffer", "type": "dataflow", "metadata": { "data_type": "Uint8Array (16 bytes/cell)" } },
    { "source": "L1_phantom_app", "target": "L1_phantom_pty", "label": "session management", "type": "dependency" },
    { "source": "L1_phantom_pty", "target": "L1_phantom_vt", "label": "VT parsing", "type": "dataflow", "metadata": { "data_type": "byte stream -> CellGrid" } },
    { "source": "L1_phantom_pty", "target": "L1_shell", "label": "spawn/IO", "type": "ipc", "metadata": { "protocol": "PTY file descriptors" } },
    { "source": "L1_phantom_app", "target": "L1_phantom_git", "label": "branch operations", "type": "dependency" },
    { "source": "L1_phantom_git", "target": "L1_git_binary", "label": "subprocess", "type": "ipc", "metadata": { "protocol": "subprocess" } },
    { "source": "L1_phantom_app", "target": "L1_phantom_db", "label": "persistence", "type": "dependency" },
    { "source": "L1_phantom_app", "target": "L1_phantom_analysis", "label": "job dispatch", "type": "dependency" },
    { "source": "L1_phantom_analysis", "target": "L1_ai_cli", "label": "CLI invocation", "type": "ipc", "metadata": { "protocol": "subprocess" } },
    { "source": "L1_phantom_analysis", "target": "L1_phantom_db", "label": "store results", "type": "dataflow" }
  ],
  "groups": [
    { "id": "frontend", "label": "Frontend Layer", "description": "Browser-side UI running in Tauri webview" },
    { "id": "backend", "label": "Rust Backend", "description": "Tauri process, all Rust crates" },
    { "id": "external", "label": "External Systems", "description": "OS-level processes and binaries" }
  ]
}
```

### 2.5 Level 2 Example (phantom-pty internals)

```json
{
  "version": 1,
  "level": 2,
  "direction": "top-down",
  "description": "Internal structure of phantom-pty: PTY lifecycle management with session abstraction and multiplexing.",
  "nodes": [
    {
      "id": "L2_phantom_pty_lib",
      "label": "lib.rs",
      "type": "module",
      "group": "api_layer",
      "metadata": {
        "file": "crates/phantom-pty/src/lib.rs",
        "description": "Public re-exports and crate entry point.",
        "drillable": false
      }
    },
    {
      "id": "L2_phantom_pty_session",
      "label": "Session",
      "type": "type",
      "group": "core",
      "metadata": {
        "file": "crates/phantom-pty/src/session.rs",
        "description": "Manages a single PTY session: read/write/resize lifecycle.",
        "drillable": true
      }
    },
    {
      "id": "L2_phantom_pty_multiplexer",
      "label": "Multiplexer",
      "type": "type",
      "group": "core",
      "metadata": {
        "file": "crates/phantom-pty/src/multiplexer.rs",
        "description": "Manages multiple concurrent PTY sessions with ID-based routing.",
        "drillable": true
      }
    },
    {
      "id": "L2_phantom_pty_pty",
      "label": "PtyHandle",
      "type": "type",
      "group": "platform",
      "metadata": {
        "file": "crates/phantom-pty/src/pty.rs",
        "description": "Low-level PTY handle wrapping portable-pty. Spawn, read, write, resize.",
        "drillable": true
      }
    },
    {
      "id": "L2_phantom_pty_portable_pty",
      "label": "portable-pty",
      "type": "external",
      "group": "platform",
      "metadata": {
        "description": "External crate providing cross-platform PTY primitives.",
        "drillable": false
      }
    }
  ],
  "edges": [
    { "source": "L2_phantom_pty_lib", "target": "L2_phantom_pty_session", "label": "re-exports", "type": "dependency" },
    { "source": "L2_phantom_pty_lib", "target": "L2_phantom_pty_multiplexer", "label": "re-exports", "type": "dependency" },
    { "source": "L2_phantom_pty_multiplexer", "target": "L2_phantom_pty_session", "label": "manages Vec<Session>", "type": "ownership" },
    { "source": "L2_phantom_pty_session", "target": "L2_phantom_pty_pty", "label": "owns", "type": "ownership" },
    { "source": "L2_phantom_pty_pty", "target": "L2_phantom_pty_portable_pty", "label": "wraps", "type": "dependency" }
  ],
  "groups": [
    { "id": "api_layer", "label": "Public API", "description": "Crate's external surface" },
    { "id": "core", "label": "Core Abstractions", "description": "Main types and business logic" },
    { "id": "platform", "label": "Platform Layer", "description": "OS-specific PTY operations" }
  ]
}
```

### 2.6 Level 3 Example (Session read flow)

```json
{
  "version": 1,
  "level": 3,
  "direction": "left-right",
  "description": "Read loop in Session: non-blocking PTY reads, VT parsing, and render event emission.",
  "nodes": [
    {
      "id": "L3_phantom_pty_session_read",
      "label": "read()",
      "type": "function",
      "metadata": {
        "file": "crates/phantom-pty/src/session.rs",
        "line": 42,
        "description": "Entry point for the session read loop.",
        "signature": "pub fn read(&mut self) -> io::Result<()>",
        "drillable": false
      }
    },
    {
      "id": "L3_phantom_pty_session_nonblock",
      "label": "pty.read_nonblocking()",
      "type": "method",
      "metadata": {
        "file": "crates/phantom-pty/src/pty.rs",
        "line": 88,
        "description": "Non-blocking read from PTY file descriptor.",
        "return_type": "io::Result<Vec<u8>>",
        "drillable": false
      }
    },
    {
      "id": "L3_phantom_pty_session_check",
      "label": "bytes available?",
      "type": "decision",
      "metadata": {
        "description": "Branch on whether the non-blocking read returned data.",
        "drillable": false
      }
    },
    {
      "id": "L3_phantom_pty_session_parse",
      "label": "VtParser::advance()",
      "type": "data_transform",
      "metadata": {
        "file": "crates/phantom-vt/src/terminal.rs",
        "description": "Feed raw bytes through VT state machine to update cell grid.",
        "drillable": false
      }
    },
    {
      "id": "L3_phantom_pty_session_emit",
      "label": "emit render event",
      "type": "function",
      "metadata": {
        "description": "Notify frontend that cell buffer has changed.",
        "drillable": false
      }
    },
    {
      "id": "L3_phantom_pty_session_sleep",
      "label": "sleep(tick_interval)",
      "type": "async_boundary",
      "metadata": {
        "description": "Yield to avoid busy-waiting when no data available.",
        "drillable": false
      }
    }
  ],
  "edges": [
    { "source": "L3_phantom_pty_session_read", "target": "L3_phantom_pty_session_nonblock", "label": "call", "type": "call" },
    { "source": "L3_phantom_pty_session_nonblock", "target": "L3_phantom_pty_session_check", "label": "returns bytes", "type": "dataflow", "metadata": { "data_type": "Vec<u8>" } },
    { "source": "L3_phantom_pty_session_check", "target": "L3_phantom_pty_session_parse", "label": "bytes > 0", "type": "control_flow", "metadata": { "condition": "bytes > 0" } },
    { "source": "L3_phantom_pty_session_check", "target": "L3_phantom_pty_session_sleep", "label": "empty", "type": "control_flow", "metadata": { "condition": "no data" } },
    { "source": "L3_phantom_pty_session_parse", "target": "L3_phantom_pty_session_emit", "label": "grid updated", "type": "dataflow" },
    { "source": "L3_phantom_pty_session_emit", "target": "L3_phantom_pty_session_sleep", "label": "continue", "type": "control_flow" },
    { "source": "L3_phantom_pty_session_sleep", "target": "L3_phantom_pty_session_nonblock", "label": "loop", "type": "control_flow" }
  ],
  "groups": []
}
```

---

## 3. Diff Semantics

### 3.1 Node Identity

Two nodes across two analyses are the "same node" if and only if their **node IDs match exactly**. This is why the ID format is deterministic and hierarchical -- `L1_phantom_pty` on main and `L1_phantom_pty` on a branch refer to the same component.

The diff engine does NOT attempt fuzzy matching by label similarity. If an AI produces a different node ID, it appears as a removal + addition.

### 3.2 Diff Categories

| Category | Condition | Visual |
|---|---|---|
| **Added** | Node ID exists in branch but not in main | Green border, green background tint |
| **Removed** | Node ID exists in main but not in branch | Red border, dashed outline (ghost node) |
| **Modified** | Same node ID, but edges, label, or type changed | Yellow border |
| **Unchanged** | Same node ID, same edges, same label, same type | Default style (gray/neutral) |

### 3.3 What Counts as "Modified"

A node is "modified" if any of these differ between the main and branch versions:
- The `label` text
- The `type` field
- The `group` field
- The set of connected edge `source`/`target` pairs
- The `label` on any connected edge

A node is NOT modified if only its `metadata` changes (e.g., updated description or line number). Metadata changes are invisible in the diagram -- they are informational only.

A node is NOT modified if only its position in the layout changes (layout is computed client-side, not part of the JSON source).

### 3.4 Renamed Nodes

If a component is renamed (e.g., `L1_auth_service` becomes `L1_identity_service`), the diff engine sees this as:
- `L1_auth_service` removed
- `L1_identity_service` added

This is intentional. Rename detection would require heuristics that could produce confusing results. The user sees clearly that something was removed and something was added. If the AI is consistent in its naming (which the ID format conventions encourage), renames in the codebase will naturally produce new IDs.

### 3.5 Structural Reorganization

If a node moves between groups (e.g., from `backend` to `frontend`), and its ID stays the same, this counts as **modified** because the `group` field changed. The diff engine compares `node.group` values.

### 3.6 Diff Data Structure (Rust)

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphDiff {
    pub added_nodes: Vec<String>,
    pub removed_nodes: Vec<String>,
    pub modified_nodes: Vec<ModifiedNode>,
    pub added_edges: Vec<EdgeRef>,
    pub removed_edges: Vec<EdgeRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModifiedNode {
    pub id: String,
    pub changes: Vec<NodeChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum NodeChange {
    LabelChanged { old: String, new: String },
    TypeChanged { old: String, new: String },
    GroupChanged { old: Option<String>, new: Option<String> },
    EdgesChanged,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeRef {
    pub source: String,
    pub target: String,
    pub label: Option<String>,
    pub edge_type: String,
}
```

### 3.7 Diff Algorithm

The diff is computed entirely on the Rust backend (`phantom-analysis::diff`):

```
Input: graph_main (ArchitectureGraph), graph_branch (ArchitectureGraph)
Output: GraphDiff

1. Build node maps: main_nodes[id] -> Node, branch_nodes[id] -> Node
2. added_nodes = branch_nodes.keys() - main_nodes.keys()
3. removed_nodes = main_nodes.keys() - branch_nodes.keys()
4. For each id in intersection:
   a. Compare label, type, group
   b. Build edge sets for this node (connected edges as (source, target, label) tuples)
   c. Compare edge sets
   d. If any difference, add to modified_nodes with specific changes
5. Build edge maps: main_edges[(source,target)] -> Edge, branch_edges[(source,target)] -> Edge
6. added_edges = branch_edges.keys() - main_edges.keys()
7. removed_edges = main_edges.keys() - branch_edges.keys()
```

---

## 4. Findings Format

### 4.1 Overview

Findings are structured results from non-diagram analysis presets (Performance Analysis, Security Scan, custom). They are stored as JSON in the `parsed_findings` column of the `analyses` table.

### 4.2 JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AnalysisFindings",
  "type": "object",
  "required": ["version", "findings"],
  "properties": {
    "version": {
      "type": "integer",
      "const": 1
    },
    "summary": {
      "type": "string",
      "description": "1-2 sentence overview of all findings"
    },
    "stats": {
      "type": "object",
      "description": "Always recomputed by parser, never trusted from AI",
      "properties": {
        "total": { "type": "integer" },
        "by_severity": {
          "type": "object",
          "properties": {
            "critical": { "type": "integer" },
            "high": { "type": "integer" },
            "medium": { "type": "integer" },
            "low": { "type": "integer" },
            "info": { "type": "integer" }
          }
        },
        "by_category": {
          "type": "object",
          "additionalProperties": { "type": "integer" }
        }
      }
    },
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "title", "severity", "category"],
        "properties": {
          "id": {
            "type": "string",
            "description": "Stable identifier generated by parser: F_{preset}_{sha256(title)[:8]}",
            "pattern": "^F_[a-z]+_[a-f0-9]{8}$"
          },
          "title": {
            "type": "string",
            "description": "Short description of the finding"
          },
          "severity": {
            "type": "string",
            "enum": ["critical", "high", "medium", "low", "info"]
          },
          "category": {
            "type": "string",
            "description": "Domain-specific, slash-separated",
            "examples": [
              "performance/allocation",
              "performance/lock-contention",
              "security/input-validation",
              "security/dependency",
              "architecture/coupling",
              "architecture/complexity"
            ]
          },
          "description": {
            "type": "string"
          },
          "locations": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["file"],
              "properties": {
                "file": { "type": "string" },
                "line_start": { "type": "integer" },
                "line_end": { "type": "integer" },
                "snippet": { "type": "string" }
              }
            }
          },
          "suggestion": {
            "type": "string"
          },
          "effort": {
            "type": "string",
            "enum": ["trivial", "small", "medium", "large"]
          }
        }
      }
    }
  }
}
```

### 4.3 Findings Extraction

The parser in `phantom-analysis::parser` extracts findings from the AI's raw output:

1. Look for a JSON code block (` ```json ... ``` `) containing a `findings` array -- use directly if valid against schema.
2. Failing that, look for numbered/bulleted lists with severity markers (e.g., `[HIGH]`, `**Critical**`) and convert to the schema.
3. Always recompute `stats` from the parsed `findings` array (never trust AI-computed stats).
4. Generate finding `id` values: `F_{preset_short_name}_{sha256(title)[:8]}`.

### 4.4 Linking Findings to Code

The `locations` array connects findings to specific code. The `file` field uses repo-relative paths (e.g., `crates/phantom-pty/src/session.rs`). Line numbers are optional -- the AI may not always provide them accurately, so the frontend should fall back to file-level linking.

When displaying a finding in the UI, clicking a location should:
1. If a terminal view is open, run `$EDITOR file:line` in the active session
2. Otherwise, show the file path and snippet inline

### 4.5 Dashboard Card Summary

Each analysis card on the dashboard shows a condensed view:

```
+-------------------------------------------+
|  Security Scan                    [Rerun]  |
|  Status: Completed (2m ago)                |
|                                            |
|  3 findings: 0 critical, 1 high, 2 medium |
|                                            |
|  Highest: "Unsanitized PTY input"          |
|  Category breakdown:                       |
|    security/input-validation: 2            |
|    security/dependency: 1                  |
|                                            |
|  [View Full Report]  [View in Diagram]     |
+-------------------------------------------+
```

The card renders from `stats.total`, `stats.by_severity`, the first finding sorted by severity, and `stats.by_category`. No need to iterate the full findings array for the card view.

---

## 5. Cache Strategy

### 5.1 Cache Key Design

The primary cache key is a tuple:

```
(repo_path, commit_sha, preset_id, level, target_node_id)
```

This maps to the `analyses` table with additional columns for drill-down tracking. The existing schema needs a small extension:

```sql
ALTER TABLE analyses ADD COLUMN level INTEGER NOT NULL DEFAULT 1;
ALTER TABLE analyses ADD COLUMN target_node_id TEXT;
```

And a column rename to reflect the JSON-first approach:
- `parsed_mermaid` -> `parsed_graph` (stores ArchitectureGraph JSON for diagram presets)
- `parsed_findings` stays as-is (stores AnalysisFindings JSON for analysis presets)

A top-level (Level 1) analysis has `level = 1` and `target_node_id = NULL`.
A drill-down (Level 2) for `L1_phantom_pty` has `level = 2` and `target_node_id = 'L1_phantom_pty'`.

### 5.2 Cache Validity Rules

A cached analysis is valid when:
1. The `commit_sha` matches the current HEAD of the branch being viewed
2. The `preset_id` matches the requested preset
3. The `status` is `'completed'`
4. The `level` and `target_node_id` match the requested drill-down

A cached analysis is **invalid** (stale) when:
- A new commit is pushed to the branch (commit_sha no longer matches HEAD)
- The preset's `prompt_template` has been edited since the analysis was created (compare `presets.updated_at` > `analyses.created_at`)

Stale analyses are NOT deleted. They remain in the database for historical comparison. The query always filters by `commit_sha` to get the current version.

### 5.3 Partial Cache Hits

When navigating a drill-down:

1. **System level cached, service level not cached**: Show the cached Level 1 diagram immediately. When the user clicks a node, check for a Level 2 cache hit. If miss, run the analysis, show a loading state on the drill-down panel, and cache the result.

2. **Service level cached, system level stale**: The service-level cache is also considered stale because it was generated from an older commit. However, it can be shown as a **preview** with a "stale data" indicator while the fresh analysis runs in the background.

3. **Branch cached, main not cached (for diff)**: Run the main analysis in the background. Show the branch diagram without diff annotations, then animate the diff annotations in when the main analysis completes.

### 5.4 Cache Lookup Query

```sql
SELECT * FROM analyses
WHERE repo_path = ?
  AND commit_sha = ?
  AND preset_id = ?
  AND level = ?
  AND (target_node_id = ? OR (target_node_id IS NULL AND ? IS NULL))
  AND status = 'completed'
ORDER BY created_at DESC
LIMIT 1
```

### 5.5 Storage Format for Drill-Down Sub-Analyses

Each drill-down is stored as its own row in the `analyses` table. This means:
- A full Level 1 + all Level 2 drill-downs for a 6-component system = 7 rows
- Each row has its own `parsed_graph` and/or `parsed_findings`
- The `target_node_id` links back to the parent diagram's node

This is simpler than nesting sub-analyses inside a single JSON blob because:
- Each sub-analysis can be cached/invalidated independently
- The same SQL query pattern works at all levels
- Parallel drill-down requests don't contend on a single row

### 5.6 Cache Index Update

The existing index should be extended:

```sql
DROP INDEX IF EXISTS idx_analyses_lookup;
CREATE INDEX idx_analyses_lookup
    ON analyses(repo_path, commit_sha, preset_id, level, target_node_id);
```

---

## 6. Educational UX

### 6.1 Design Principle: Progressive Disclosure

The diagram system should teach the user about the codebase through layers. Each level answers a question, and the user's clicks form a natural learning path:

- Start at Level 1: "What is this project made of?"
- Click a component: "How is this component organized?"
- Click a module: "How does this operation actually work?"

The breadcrumb trail acts as both navigation AND a record of the user's learning path.

### 6.2 Node Tooltips

On hover, each node shows a tooltip with information directly from the `metadata` field in the JSON:

**Level 1 tooltips:**
```
phantom-pty
Type: Library crate
Path: crates/phantom-pty/
"PTY spawn, read/write, resize. Uses portable-pty."
Connections: 3 incoming, 2 outgoing
Click to explore internals
```

**Level 2 tooltips:**
```
Session
Type: Core type (struct)
File: crates/phantom-pty/src/session.rs
"Manages a single PTY session: read/write/resize lifecycle."
Click to see logic flows
```

**Level 3 tooltips:**
```
read()
Type: Async method
File: crates/phantom-pty/src/session.rs:42
Signature: pub fn read(&mut self) -> io::Result<()>
"Entry point for the session read loop."
```

All tooltip data comes directly from `node.metadata` -- no separate parsing or extraction needed. This is a key advantage of the JSON-first approach: the AI embeds the tooltip content at generation time.

### 6.3 Context Panel

Alongside the diagram, a collapsible right-side panel shows:

- **Description**: `node.metadata.description` for the selected node
- **Key files**: `node.metadata.path` or `node.metadata.file`, clickable to open in terminal
- **Findings**: Any analysis findings (performance, security) related to this node, linked by file path overlap between `node.metadata.path` and `finding.locations[].file`
- **Recent changes**: If on a branch with diff, show what changed in this node

The panel width defaults to 280px, collapsible to icon-only (40px).

### 6.4 Making Drill-Down Feel Like Exploration

The key to making drill-down feel like "exploring" rather than "loading":

1. **Instant visual feedback**: When clicking a node, immediately zoom into it and expand a placeholder frame at the expected size before the sub-analysis loads. The parent diagram remains visible behind, blurred.

2. **Breadcrumb animation**: New breadcrumb segments slide in from the right, giving a sense of forward motion.

3. **Cache-first rendering**: If any cached result exists (even stale), show it immediately with a subtle "refreshing..." indicator. Most drill-downs after the first analysis will be instant.

4. **Preserve scroll/zoom state**: When navigating back up via breadcrumb, restore the parent diagram at exactly the zoom/pan position the user left it. This gives spatial memory -- users remember "the PTY component was in the bottom-left."

5. **Loading skeleton**: If no cache exists, show a skeleton that mirrors the expected layout (a few gray placeholder nodes with faint connecting lines). The skeleton should have roughly the right shape for the component being explored (more nodes for larger components).

### 6.5 Diff View as Teaching Tool

When viewing a branch diff, the annotations teach the user what changed:

- **Green nodes** get a subtle pulsing glow on first render, drawing attention
- **Red (removed) nodes** render as semi-transparent ghosts so the user sees what was there
- **Yellow (modified) nodes** show a small delta icon; clicking reveals a before/after tooltip
- A **diff summary bar** at the top: "3 added, 1 removed, 2 modified components vs main"

The diff view is a toggle, not the default. Users learning a new codebase start with the clean view; users reviewing changes toggle to diff view. The toggle should be a prominent button: `[Clean View] [Diff vs main]`.

---

## Appendix A: Prompt Templates for Built-In Presets

### Architecture Diagram (Level 1)

```
Analyze the architecture of this codebase.

Identify all major components (crates, packages, services, frontends, databases, external systems).
Show how they communicate: IPC, function calls, network, filesystem, subprocess.

Output a single JSON code block with this exact schema:
{
  "version": 1,
  "level": 1,
  "direction": "top-down",
  "description": "<1-3 sentence summary>",
  "nodes": [
    {
      "id": "L1_<component_name>",
      "label": "<Display Name>",
      "type": "<service|library|frontend|external|database>",
      "group": "<group_id>",
      "metadata": {
        "path": "<repo-relative directory>",
        "description": "<1-2 sentence description>",
        "drillable": true|false
      }
    }
  ],
  "edges": [
    {
      "source": "<node_id>",
      "target": "<node_id>",
      "label": "<relationship description>",
      "type": "<dependency|dataflow|call|ownership|ipc|control_flow>",
      "metadata": { "protocol": "...", "data_type": "..." }
    }
  ],
  "groups": [
    { "id": "<group_id>", "label": "<Display Label>", "description": "..." }
  ]
}

Rules for node IDs:
- Format: L1_{component_name} (lowercase, underscores only)
- Must be unique across all nodes
- Must be stable: the same component should always get the same ID

Rules for nodes:
- Set drillable=true for components with meaningful internals (your own crates/packages)
- Set drillable=false for external dependencies, databases, and simple leaf components
- Always include a path for drillable nodes

Rules for edges:
- Use "ipc" type for cross-process communication
- Use "dataflow" type when data flows in a specific direction
- Use "dependency" type for general usage relationships
- Include metadata.protocol for ipc edges
- Include metadata.data_type for dataflow edges when the type is significant

Do not include individual files or functions. Stay at the component/crate/package level.
```

### Architecture Diagram (Level 2 -- drill-down)

```
Analyze the internal structure of {target_node_label} (located at {target_path}).

Show its modules, key types (structs/traits/interfaces), and internal layers.

Output a single JSON code block with this exact schema:
{
  "version": 1,
  "level": 2,
  "direction": "top-down",
  "description": "<1-3 sentence summary>",
  "nodes": [
    {
      "id": "L2_{component}_{module_or_type_name}",
      "label": "<Display Name>",
      "type": "<module|type|layer|trait|interface|external>",
      "group": "<group_id>",
      "metadata": {
        "file": "<repo-relative file path>",
        "description": "<1-2 sentence description>",
        "drillable": true|false
      }
    }
  ],
  "edges": [
    {
      "source": "<node_id>",
      "target": "<node_id>",
      "label": "<relationship>",
      "type": "<dependency|dataflow|call|ownership|ipc|control_flow>"
    }
  ],
  "groups": [
    { "id": "<layer_id>", "label": "<Layer Name>", "description": "..." }
  ]
}

Rules:
- Node IDs: L2_{component}_{name} (lowercase, underscores)
- Group by architectural layer (API, Core, Platform, Data, etc.)
- Set drillable=true for modules/types with complex internal logic worth exploring
- Always include file paths in metadata
- Show significant external dependencies as type "external" with drillable=false
```

### Architecture Diagram (Level 3 -- drill-down)

```
Analyze the logic flow of key operations in {target_node_label} ({target_path}).

Show function call chains, data transformations, control flow decisions, and error paths.
Focus on the most important operations (public API methods, main loops, event handlers).

Output a single JSON code block with this exact schema:
{
  "version": 1,
  "level": 3,
  "direction": "left-right",
  "description": "<1-3 sentence summary>",
  "nodes": [
    {
      "id": "L3_{component}_{module}_{function_name}",
      "label": "<function_name()>",
      "type": "<function|method|async_boundary|decision|data_transform|error_path>",
      "metadata": {
        "file": "<file path>",
        "line": <line_number>,
        "description": "<what this step does>",
        "signature": "<full signature>",
        "return_type": "<return type>",
        "drillable": false
      }
    }
  ],
  "edges": [
    {
      "source": "<node_id>",
      "target": "<node_id>",
      "label": "<relationship>",
      "type": "<call|dataflow|control_flow>",
      "metadata": { "condition": "...", "data_type": "..." }
    }
  ],
  "groups": []
}

Rules:
- Node IDs: L3_{component}_{module}_{function} (lowercase, underscores)
- Use type "decision" for branching points
- Use type "async_boundary" for await points, channel sends, thread spawns
- Use type "error_path" for error handling branches
- Use type "data_transform" for significant data shape changes
- Edge metadata.condition should describe branching conditions for control_flow edges
- Edge metadata.data_type should describe the data being passed for dataflow edges
- All Level 3 nodes have drillable=false (this is the deepest level)
```

### Performance Analysis

```
Analyze this codebase for performance improvement opportunities.

For each finding, provide the data in the JSON structure below.

Output a single JSON code block:
{
  "summary": "<1-2 sentence overview>",
  "findings": [
    {
      "title": "<short description>",
      "severity": "<critical|high|medium|low|info>",
      "category": "performance/<subcategory>",
      "description": "<detailed explanation>",
      "locations": [{"file": "<repo-relative path>", "line_start": <N>, "snippet": "<code>"}],
      "suggestion": "<specific fix>",
      "effort": "<trivial|small|medium|large>"
    }
  ]
}

Valid subcategories: allocation, lock-contention, io-blocking, algorithmic, caching, serialization.

Focus on real, actionable issues. Do not report stylistic preferences as performance findings.
```

### Security Scan

```
Analyze this codebase for security concerns.

For each finding, provide the data in the JSON structure below.

Output a single JSON code block:
{
  "summary": "<1-2 sentence overview>",
  "findings": [
    {
      "title": "<short description>",
      "severity": "<critical|high|medium|low|info>",
      "category": "security/<subcategory>",
      "description": "<detailed explanation>",
      "locations": [{"file": "<repo-relative path>", "line_start": <N>, "snippet": "<code>"}],
      "suggestion": "<specific remediation>",
      "effort": "<trivial|small|medium|large>"
    }
  ]
}

Valid subcategories: input-validation, injection, authentication, authorization, dependency, cryptography, information-disclosure, configuration.

Prioritize findings that could be exploited by an attacker with access to the application.
Do not report missing features (e.g., "no rate limiting") unless the context clearly requires them.
```

---

## Appendix B: Schema Migration

The `analyses` table needs modifications for drill-down support and the JSON-first approach.

```sql
-- New columns for drill-down:
ALTER TABLE analyses ADD COLUMN level INTEGER NOT NULL DEFAULT 1;
ALTER TABLE analyses ADD COLUMN target_node_id TEXT;

-- Rename parsed_mermaid to parsed_graph (conceptual -- SQLite doesn't support RENAME COLUMN
-- in older versions, so create new column and migrate data):
ALTER TABLE analyses ADD COLUMN parsed_graph TEXT;
UPDATE analyses SET parsed_graph = parsed_mermaid WHERE parsed_mermaid IS NOT NULL;
-- parsed_mermaid column can be left in place for backwards compatibility, ignored going forward.

-- Update the lookup index:
DROP INDEX IF EXISTS idx_analyses_lookup;
CREATE INDEX idx_analyses_lookup
    ON analyses(repo_path, commit_sha, preset_id, level, target_node_id);
```

Since SQLite does not support `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, the migration should be version-tracked:

```sql
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
);

-- Check: SELECT COALESCE(MAX(version), 0) FROM schema_version
-- If < 2, run migration and INSERT INTO schema_version VALUES (2)
```

---

## Appendix C: Frontend Type Definitions

```typescript
// === Graph Schema (from AI output, stored in parsed_graph column) ===

interface GraphNode {
  id: string;              // "L1_phantom_pty"
  label: string;           // "phantom-pty"
  type: NodeType;
  group?: string;          // references groups[].id
  metadata?: {
    path?: string;         // repo-relative directory (Level 1)
    file?: string;         // repo-relative file path (Level 2-3)
    line?: number;         // line number (Level 3)
    description?: string;  // tooltip text
    drillable?: boolean;   // whether clicking opens sub-analysis
    signature?: string;    // function signature (Level 3)
    return_type?: string;  // return type (Level 3)
  };
}

type NodeType =
  // Level 1
  | "service" | "library" | "frontend" | "external" | "database"
  // Level 2
  | "module" | "type" | "layer" | "trait" | "interface"
  // Level 3
  | "function" | "method" | "async_boundary" | "decision" | "data_transform" | "error_path";

interface GraphEdge {
  source: string;
  target: string;
  label?: string;
  type: EdgeType;
  metadata?: {
    condition?: string;    // for control_flow edges
    data_type?: string;    // for dataflow edges
    protocol?: string;     // for ipc edges
  };
}

type EdgeType = "dependency" | "dataflow" | "call" | "ownership" | "ipc" | "control_flow";

interface GraphGroup {
  id: string;
  label: string;
  description?: string;
}

interface ArchitectureGraph {
  version: 1;
  level: 1 | 2 | 3;
  direction: "top-down" | "left-right";
  description: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  groups: GraphGroup[];
}

// === Diff (computed by Rust backend) ===

interface GraphDiff {
  added_nodes: string[];
  removed_nodes: string[];
  modified_nodes: { id: string; changes: NodeChange[] }[];
  added_edges: { source: string; target: string; label?: string; edge_type: string }[];
  removed_edges: { source: string; target: string; label?: string; edge_type: string }[];
}

type NodeChange =
  | { kind: "label_changed"; old: string; new: string }
  | { kind: "type_changed"; old: string; new: string }
  | { kind: "group_changed"; old: string | null; new: string | null }
  | { kind: "edges_changed" };

// === Drill-Down Navigation ===

interface DrillDownState {
  path: { nodeId: string; label: string; level: number }[];
  currentLevel: 1 | 2 | 3;
  currentTargetNode: string | null;
}

// === Findings (from analysis presets) ===

interface Finding {
  id: string;              // "F_security_a1b2c3d4"
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;        // "security/input-validation"
  description: string;
  locations: { file: string; line_start?: number; line_end?: number; snippet?: string }[];
  suggestion: string;
  effort: "trivial" | "small" | "medium" | "large";
}

interface AnalysisFindings {
  version: 1;
  summary: string;
  stats: {
    total: number;
    by_severity: Record<string, number>;
    by_category: Record<string, number>;
  };
  findings: Finding[];
}

// === React Flow Conversion ===
// The frontend converts ArchitectureGraph -> React Flow format:

import type { Node, Edge } from "@xyflow/react";

function graphToReactFlow(graph: ArchitectureGraph, diff?: GraphDiff): { nodes: Node[]; edges: Edge[] } {
  // Direct mapping: GraphNode -> React Flow Node
  // GraphNode.id -> Node.id
  // GraphNode.type -> Node.data.nodeType (used by custom node component)
  // GraphNode.metadata.drillable -> Node.data.drillable (enables click handler)
  // GraphDiff annotations -> Node.data.diffStatus ("added" | "removed" | "modified" | "unchanged")
  // Layout computed by dagre/elkjs using graph.direction
  // ... implementation in src/lib/graph-to-reactflow.ts
}
```

---

## Appendix D: JSON Validation in the Parser

The `phantom-analysis::parser` module must validate the AI's JSON output before storing it. Validation steps:

1. **Extract JSON block**: Find the first ` ```json ... ``` ` code block in the raw output.
2. **Parse JSON**: `serde_json::from_str()` into the `ArchitectureGraph` or `AnalysisFindings` struct.
3. **Validate node IDs**: Check that all IDs match the `L{level}_...` pattern and are unique.
4. **Validate edge references**: Check that every `edge.source` and `edge.target` references an existing `node.id`.
5. **Validate group references**: Check that every `node.group` references an existing `group.id`.
6. **Compute derived fields**: For findings, recompute `stats` from the `findings` array.
7. **Generate stable IDs**: For findings, generate `id` from `F_{preset}_{sha256(title)[:8]}`.

If validation fails at step 2 (invalid JSON), attempt a best-effort recovery:
- Strip trailing commas (common AI output error)
- Fix unescaped quotes in strings
- If still invalid, store the raw output with `status = 'failed'` and `error_message` describing the parse failure

If validation fails at steps 3-5 (structurally invalid), store with a warning but do not reject entirely -- partial graphs are still useful for display. Log the validation errors in `error_message`.
