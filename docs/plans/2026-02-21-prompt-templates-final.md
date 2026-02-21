# Final Prompt Templates & JSON Schemas

> Coordinated output from the analysis system design (analytical-educator) and CLI integration specs (cli-expert). These are the production prompt templates and schemas used by phantom-analysis to run AI analysis jobs.

## Design Decisions

### Schema Per Preset, Not One Universal Schema

Each preset has its own JSON Schema because they produce fundamentally different data:

- **Architecture Diagram** produces a graph (nodes/edges/groups) at a single drill-down level
- **Performance Analysis** produces findings with a hotspot relationship graph
- **Security Scan** produces findings with an attack surface graph
- **Dependency Map** produces internal/external dependency data with IPC boundary mapping

A single universal schema would either be too loose to validate or too complex to maintain. Per-preset schemas enable `--json-schema` (Claude) and `--output-schema` (Codex) enforcement.

### One Level Per Request (Architecture)

The Architecture Diagram preset produces **one level per analysis request**, not all three levels bundled together. This enables:
- Independent caching per level (Level 1 at commit X, Level 2 at commit Y)
- Drill-down on demand (only fetch Level 2 when user clicks a node)
- Smaller, more focused AI prompts (better output quality)

The `level` and `target_node_id` fields in the `analyses` table track which level/target each row represents.

### Schema Enforcement Strategy

| CLI | Mechanism | Reliability |
|-----|-----------|-------------|
| Claude Code | `--json-schema '{...}'` inline with `--output-format json` | High -- validated by Claude |
| Codex | `--output-schema /tmp/file.json` with `--json` | High -- validated by Codex |
| Cursor Agent | Schema in prompt text + `--output-format json` | Medium -- no runtime validation |

For all CLIs, the prompt also includes "You MUST respond with ONLY a JSON object..." as a belt-and-suspenders approach.

---

## Preset A: Architecture Diagram

### Level 1 (System Architecture)

**JSON Schema** (`architecture_graph_schema.json`):

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["version", "level", "direction", "description", "nodes", "edges", "groups"],
  "additionalProperties": false,
  "properties": {
    "version": { "type": "integer", "const": 1 },
    "level": { "type": "integer", "enum": [1, 2, 3] },
    "direction": { "type": "string", "enum": ["top-down", "left-right"] },
    "description": { "type": "string" },
    "nodes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "label", "type"],
        "additionalProperties": false,
        "properties": {
          "id": { "type": "string" },
          "label": { "type": "string" },
          "type": {
            "type": "string",
            "enum": [
              "service", "library", "frontend", "external", "database",
              "module", "type", "layer", "trait", "interface",
              "function", "method", "async_boundary", "decision", "data_transform", "error_path"
            ]
          },
          "group": { "type": ["string", "null"] },
          "metadata": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "path": { "type": ["string", "null"] },
              "file": { "type": ["string", "null"] },
              "line": { "type": ["integer", "null"] },
              "description": { "type": ["string", "null"] },
              "drillable": { "type": "boolean" },
              "signature": { "type": ["string", "null"] },
              "return_type": { "type": ["string", "null"] }
            }
          }
        }
      }
    },
    "edges": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["source", "target", "type"],
        "additionalProperties": false,
        "properties": {
          "source": { "type": "string" },
          "target": { "type": "string" },
          "label": { "type": ["string", "null"] },
          "type": {
            "type": "string",
            "enum": ["dependency", "dataflow", "call", "ownership", "ipc", "control_flow"]
          },
          "metadata": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "condition": { "type": ["string", "null"] },
              "data_type": { "type": ["string", "null"] },
              "protocol": { "type": ["string", "null"] }
            }
          }
        }
      }
    },
    "groups": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "label"],
        "additionalProperties": false,
        "properties": {
          "id": { "type": "string" },
          "label": { "type": "string" },
          "description": { "type": ["string", "null"] }
        }
      }
    }
  }
}
```

**Prompt template (Level 1)**:

```
Analyze the architecture of the codebase in the current working directory.

Identify all major components: crates, packages, services, frontends, databases, and external systems the project depends on. Show how they communicate: IPC, function calls, network, filesystem, subprocess.

You MUST respond with ONLY a JSON object matching the schema provided. No markdown, no explanation, no code fences. Just the raw JSON.

{
  "version": 1,
  "level": 1,
  "direction": "top-down",
  "description": "1-3 sentence summary of the architecture",
  "nodes": [
    {
      "id": "L1_component_name",
      "label": "Human-Readable Name",
      "type": "service|library|frontend|external|database",
      "group": "group_id or null",
      "metadata": {
        "path": "repo-relative directory path",
        "description": "1-2 sentence description for tooltip",
        "drillable": true
      }
    }
  ],
  "edges": [
    {
      "source": "L1_source_id",
      "target": "L1_target_id",
      "label": "relationship description",
      "type": "dependency|dataflow|call|ownership|ipc|control_flow",
      "metadata": {
        "protocol": "for ipc edges: Tauri IPC, subprocess, etc.",
        "data_type": "for dataflow edges: the type being passed"
      }
    }
  ],
  "groups": [
    {
      "id": "group_id",
      "label": "Group Display Name",
      "description": "why these are grouped"
    }
  ]
}

Node ID rules:
- Format: L1_{component_name} (lowercase, underscores, no spaces)
- Must be unique across all nodes
- Derived from crate/package/directory names for stability
- Same component must always produce the same ID

Node rules:
- Set type to "service" for executable/binary crates, "library" for lib crates, "frontend" for UI packages, "external" for third-party systems, "database" for data stores
- Set drillable=true for components with meaningful internal structure (your own crates/packages)
- Set drillable=false for external dependencies and simple leaf nodes
- Always include metadata.path for drillable nodes (repo-relative directory)
- Always include metadata.description

Edge rules:
- Use "ipc" for cross-process communication (include metadata.protocol)
- Use "dataflow" for data flowing in a direction (include metadata.data_type when significant)
- Use "dependency" for general "A uses B" relationships
- Use "ownership" for "A contains/owns B"
- Every edge source and target must reference an existing node id

Group rules:
- Group by deployment boundary: "frontend", "backend", "external"
- Every node.group must reference an existing group.id

Stay at the component/crate/package level. Do not include individual files or functions.
```

**Prompt template (Level 2 -- drill-down)**:

```
Analyze the internal structure of {{target_label}} located at {{target_path}}.

Show its modules, key types (structs, traits, interfaces), and internal architectural layers.

You MUST respond with ONLY a JSON object matching the schema provided. No markdown, no explanation, no code fences. Just the raw JSON.

{
  "version": 1,
  "level": 2,
  "direction": "top-down",
  "description": "1-3 sentence summary",
  "nodes": [...],
  "edges": [...],
  "groups": [...]
}

Node ID rules:
- Format: L2_{{target_component}}_name (lowercase, underscores)
- Must be unique

Node rules:
- Use type "module" for files/modules, "type" for structs/enums, "trait" for traits, "interface" for TS interfaces, "layer" for architectural layers, "external" for external crate dependencies
- Set drillable=true for modules/types with complex internal logic worth exploring at Level 3
- Always include metadata.file (repo-relative file path) and metadata.description

Edge rules:
- Use "ownership" for struct-contains-field or module-contains-type
- Use "dependency" for imports/uses
- Use "call" for function invocation patterns
- Use "dataflow" for data transformation pipelines

Group rules:
- Group by architectural layer: "api", "core", "platform", "data", etc.
- Describe each group's role
```

**Prompt template (Level 3 -- drill-down)**:

```
Analyze the logic flow of key operations in {{target_label}} located at {{target_path}}.

Show function call chains, data transformations, control flow decisions, and error paths. Focus on the most important operations: public API methods, main loops, event handlers.

You MUST respond with ONLY a JSON object matching the schema provided. No markdown, no explanation, no code fences. Just the raw JSON.

{
  "version": 1,
  "level": 3,
  "direction": "left-right",
  "description": "1-3 sentence summary",
  "nodes": [...],
  "edges": [...],
  "groups": []
}

Node ID rules:
- Format: L3_{{target_component}}_{{target_module}}_function_name (lowercase, underscores)

Node rules:
- Use type "function" for standalone functions, "method" for struct methods, "decision" for branching points, "data_transform" for data shape changes, "async_boundary" for await/channel/thread-spawn points, "error_path" for error handling
- All Level 3 nodes must have drillable=false
- Include metadata.file, metadata.line (if known), metadata.description
- Include metadata.signature and metadata.return_type when applicable

Edge rules:
- Use "call" for function invocations
- Use "dataflow" for data being passed (include metadata.data_type)
- Use "control_flow" for sequential flow and branching (include metadata.condition for branches)

Groups are typically empty at Level 3. Use them only if the flow has distinct phases.
```

---

## Preset B: Performance Analysis

**JSON Schema** (`performance_findings_schema.json`):

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["summary", "findings"],
  "additionalProperties": false,
  "properties": {
    "summary": { "type": "string" },
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["title", "severity", "category", "description", "locations", "suggestion", "effort"],
        "additionalProperties": false,
        "properties": {
          "title": { "type": "string" },
          "severity": { "type": "string", "enum": ["critical", "high", "medium", "low", "info"] },
          "category": {
            "type": "string",
            "enum": ["allocation", "lock_contention", "io_blocking", "algorithmic", "caching", "serialization", "rendering", "concurrency"]
          },
          "description": { "type": "string" },
          "locations": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["file"],
              "additionalProperties": false,
              "properties": {
                "file": { "type": "string" },
                "line_start": { "type": ["integer", "null"] },
                "line_end": { "type": ["integer", "null"] },
                "snippet": { "type": ["string", "null"] }
              }
            }
          },
          "suggestion": { "type": "string" },
          "effort": { "type": "string", "enum": ["trivial", "small", "medium", "large"] },
          "impact": { "type": "string" }
        }
      }
    },
    "hotspot_graph": {
      "type": "object",
      "required": ["nodes", "edges"],
      "additionalProperties": false,
      "properties": {
        "nodes": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["id", "label", "type", "severity"],
            "additionalProperties": false,
            "properties": {
              "id": { "type": "string" },
              "label": { "type": "string" },
              "type": { "type": "string", "enum": ["hotspot", "bottleneck", "affected"] },
              "severity": { "type": "string", "enum": ["critical", "high", "medium", "low", "info"] },
              "file": { "type": ["string", "null"] }
            }
          }
        },
        "edges": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["source", "target"],
            "additionalProperties": false,
            "properties": {
              "source": { "type": "string" },
              "target": { "type": "string" },
              "label": { "type": ["string", "null"] }
            }
          }
        }
      }
    }
  }
}
```

**Prompt template**:

```
Analyze the codebase in the current working directory for performance issues.

You MUST respond with ONLY a JSON object matching the schema provided. No markdown, no explanation, no code fences. Just the raw JSON.

{
  "summary": "1-2 sentence overview of performance health",
  "findings": [
    {
      "title": "Short description of the issue",
      "severity": "critical|high|medium|low|info",
      "category": "allocation|lock_contention|io_blocking|algorithmic|caching|serialization|rendering|concurrency",
      "description": "Detailed explanation of the problem and why it matters",
      "locations": [
        {
          "file": "repo-relative/path/to/file.rs",
          "line_start": 42,
          "line_end": 55,
          "snippet": "the relevant code"
        }
      ],
      "suggestion": "Specific, actionable fix recommendation",
      "effort": "trivial|small|medium|large",
      "impact": "Expected performance improvement if fixed"
    }
  ],
  "hotspot_graph": {
    "nodes": [
      {
        "id": "perf_node_id",
        "label": "Display label",
        "type": "hotspot|bottleneck|affected",
        "severity": "critical|high|medium|low|info",
        "file": "repo-relative/path.rs"
      }
    ],
    "edges": [
      {
        "source": "node_id",
        "target": "node_id",
        "label": "causal relationship"
      }
    ]
  }
}

Examine the codebase for:
1. Hot paths and computational bottlenecks (category: "algorithmic")
2. Unnecessary memory allocations, clones, large stack objects (category: "allocation")
3. Lock contention and synchronization overhead (category: "lock_contention")
4. I/O blocking on async threads (category: "io_blocking")
5. Missing caching opportunities (category: "caching")
6. Expensive serialization/deserialization (category: "serialization")
7. Unnecessary re-renders or redundant computation in frontend (category: "rendering")
8. Thread/task concurrency issues (category: "concurrency")

For each finding:
- Provide the exact file path (repo-relative) and line numbers
- Include a code snippet showing the problematic code
- Give a specific, actionable fix (not "consider optimizing")
- Estimate the effort to fix and the expected impact

In hotspot_graph, create a node for each finding location and edges showing causal chains (e.g., lock contention at A causes I/O blocking at B). Use type "hotspot" for the root cause, "bottleneck" for chokepoints, "affected" for downstream effects.

Order findings by severity: critical first.
Focus on real, actionable issues. Do not report stylistic preferences as performance problems.
```

---

## Preset C: Security Scan

**JSON Schema** (`security_findings_schema.json`):

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["summary", "risk_score", "findings"],
  "additionalProperties": false,
  "properties": {
    "summary": { "type": "string" },
    "risk_score": { "type": "string", "enum": ["critical", "high", "medium", "low", "clean"] },
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["title", "severity", "category", "description", "locations", "exploitability", "remediation", "effort"],
        "additionalProperties": false,
        "properties": {
          "title": { "type": "string" },
          "severity": { "type": "string", "enum": ["critical", "high", "medium", "low", "info"] },
          "category": {
            "type": "string",
            "enum": ["injection", "xss", "path_traversal", "deserialization", "secrets", "ipc", "dependencies", "unsafe_code", "validation", "privilege_escalation", "other"]
          },
          "cwe": { "type": ["string", "null"] },
          "description": { "type": "string" },
          "locations": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["file"],
              "additionalProperties": false,
              "properties": {
                "file": { "type": "string" },
                "line_start": { "type": ["integer", "null"] },
                "line_end": { "type": ["integer", "null"] },
                "snippet": { "type": ["string", "null"] }
              }
            }
          },
          "exploitability": { "type": "string" },
          "remediation": { "type": "string" },
          "effort": { "type": "string", "enum": ["trivial", "small", "medium", "large"] }
        }
      }
    },
    "attack_surface_graph": {
      "type": "object",
      "required": ["nodes", "edges"],
      "additionalProperties": false,
      "properties": {
        "nodes": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["id", "label", "type"],
            "additionalProperties": false,
            "properties": {
              "id": { "type": "string" },
              "label": { "type": "string" },
              "type": { "type": "string", "enum": ["entry_point", "vulnerability", "data_sink", "trust_boundary"] },
              "severity": { "type": ["string", "null"], "enum": ["critical", "high", "medium", "low", "info", null] }
            }
          }
        },
        "edges": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["source", "target"],
            "additionalProperties": false,
            "properties": {
              "source": { "type": "string" },
              "target": { "type": "string" },
              "label": { "type": ["string", "null"] },
              "type": { "type": "string", "enum": ["data_flow", "trust_crossing", "attack_vector"] }
            }
          }
        }
      }
    }
  }
}
```

**Prompt template**:

```
Perform a security audit of the codebase in the current working directory.

You MUST respond with ONLY a JSON object matching the schema provided. No markdown, no explanation, no code fences. Just the raw JSON.

{
  "summary": "1-2 sentence overview of security posture",
  "risk_score": "critical|high|medium|low|clean",
  "findings": [
    {
      "title": "Short description",
      "severity": "critical|high|medium|low|info",
      "category": "injection|xss|path_traversal|deserialization|secrets|ipc|dependencies|unsafe_code|validation|privilege_escalation|other",
      "cwe": "CWE-78 or null",
      "description": "Detailed explanation",
      "locations": [
        { "file": "repo-relative/path.rs", "line_start": 42, "line_end": 55, "snippet": "code" }
      ],
      "exploitability": "How an attacker could exploit this",
      "remediation": "Specific fix recommendation",
      "effort": "trivial|small|medium|large"
    }
  ],
  "attack_surface_graph": {
    "nodes": [
      { "id": "node_id", "label": "Display label", "type": "entry_point|vulnerability|data_sink|trust_boundary", "severity": "high or null" }
    ],
    "edges": [
      { "source": "node_id", "target": "node_id", "label": "description", "type": "data_flow|trust_crossing|attack_vector" }
    ]
  }
}

Scan for:
1. Command injection in shell commands and PTY spawning (category: "injection")
2. Path traversal / directory escape (category: "path_traversal")
3. XSS in frontend rendering (category: "xss")
4. Unsafe deserialization of untrusted data (category: "deserialization")
5. Hardcoded secrets or credentials (category: "secrets")
6. Insecure Tauri IPC — missing input validation on commands (category: "ipc")
7. Known CVEs in dependencies from lock files (category: "dependencies")
8. Unsafe Rust blocks without safety comments (category: "unsafe_code")
9. Missing input validation at system boundaries (category: "validation")
10. Privilege escalation vectors (category: "privilege_escalation")

For each finding:
- Include CWE identifier where applicable
- Provide exact file path (repo-relative) and line numbers
- Describe a realistic exploitation scenario
- Give a specific remediation (not "add validation")

In attack_surface_graph:
- "entry_point" nodes: user inputs, IPC calls, network endpoints, file reads
- "vulnerability" nodes: each finding location
- "data_sink" nodes: file writes, command execution, DOM manipulation, database writes
- "trust_boundary" nodes: frontend/backend boundary, user/system boundary
- Connect with "data_flow" (data path), "trust_crossing" (crosses a boundary), "attack_vector" (exploitation path)

Set risk_score to the highest severity finding, or "clean" if no issues found.
Order findings by severity: critical first.
Prioritize findings that could be exploited by an attacker with access to the application. Do not report missing features as security issues unless the context clearly requires them.
```

---

## Preset D: Dependency Map

**JSON Schema** (`dependency_map_schema.json`):

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["internal", "external", "circular_dependencies", "ipc_boundary"],
  "additionalProperties": false,
  "properties": {
    "internal": {
      "type": "object",
      "required": ["nodes", "edges"],
      "additionalProperties": false,
      "properties": {
        "nodes": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["id", "label", "type", "path"],
            "additionalProperties": false,
            "properties": {
              "id": { "type": "string" },
              "label": { "type": "string" },
              "type": { "type": "string", "enum": ["binary", "library", "package", "config"] },
              "language": { "type": ["string", "null"] },
              "path": { "type": "string" }
            }
          }
        },
        "edges": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["source", "target", "type"],
            "additionalProperties": false,
            "properties": {
              "source": { "type": "string" },
              "target": { "type": "string" },
              "label": { "type": ["string", "null"] },
              "type": { "type": "string", "enum": ["dependency", "dev_dependency", "build_dependency", "ipc"] }
            }
          }
        }
      }
    },
    "external": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "category", "used_by", "purpose"],
        "additionalProperties": false,
        "properties": {
          "name": { "type": "string" },
          "version": { "type": ["string", "null"] },
          "category": { "type": "string", "enum": ["frontend", "backend", "build", "dev", "testing"] },
          "used_by": { "type": "array", "items": { "type": "string" } },
          "purpose": { "type": "string" }
        }
      }
    },
    "circular_dependencies": {
      "type": "array",
      "items": {
        "type": "array",
        "items": { "type": "string" }
      }
    },
    "ipc_boundary": {
      "type": "object",
      "required": ["commands"],
      "additionalProperties": false,
      "properties": {
        "commands": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["name", "rust_handler", "description"],
            "additionalProperties": false,
            "properties": {
              "name": { "type": "string" },
              "rust_handler": { "type": "string" },
              "frontend_caller": { "type": ["string", "null"] },
              "description": { "type": "string" }
            }
          }
        }
      }
    }
  }
}
```

**Prompt template**:

```
Analyze the dependency structure of the codebase in the current working directory.

You MUST respond with ONLY a JSON object matching the schema provided. No markdown, no explanation, no code fences. Just the raw JSON.

{
  "internal": {
    "nodes": [
      { "id": "crate_or_package_name", "label": "Display Name", "type": "binary|library|package|config", "language": "rust|typescript|null", "path": "repo-relative/path/" }
    ],
    "edges": [
      { "source": "node_id", "target": "node_id", "label": "optional note", "type": "dependency|dev_dependency|build_dependency|ipc" }
    ]
  },
  "external": [
    { "name": "crate_or_npm_name", "version": "1.2.3 or null", "category": "frontend|backend|build|dev|testing", "used_by": ["internal_node_id"], "purpose": "one sentence" }
  ],
  "circular_dependencies": [["A", "B", "A"]],
  "ipc_boundary": {
    "commands": [
      { "name": "command_name", "rust_handler": "crates/phantom-app/src/commands/file.rs", "frontend_caller": "src/lib/api.ts or null", "description": "what this command does" }
    ]
  }
}

Produce a comprehensive dependency map covering:

1. internal — workspace crates (Rust) and packages (npm) with their inter-dependencies:
   - Node IDs must match crate/package names exactly (e.g., "phantom-pty", "phantom-app")
   - Use type "binary" for executable crates, "library" for lib crates, "package" for npm packages, "config" for config-only packages
   - Mark cross-process boundaries (frontend calling backend) with edge type "ipc"
   - Include the path to each crate/package root

2. external — direct external dependencies (not transitive):
   - Read from Cargo.toml [dependencies] and package.json "dependencies"/"devDependencies"
   - Include version from Cargo.lock / package-lock.json if visible
   - used_by must reference valid internal node IDs
   - Describe each dependency's purpose in one sentence

3. circular_dependencies — any circular dependency chains:
   - Each entry is an array of node IDs forming the cycle (e.g., ["A", "B", "C", "A"])
   - Empty array if none found

4. ipc_boundary — all Tauri IPC commands:
   - List every #[tauri::command] function
   - Include the Rust file that defines it
   - Include the frontend file that calls invoke() for it (or null if uncalled)
   - Describe what the command does
```

---

## How Phantom Constructs Analysis Commands

The `phantom-analysis::runner` constructs the CLI command based on `cli_binary`:

### Claude Code

```bash
claude -p "<prompt>" \
  --output-format json \
  --json-schema '<schema_json_string>' \
  --allowedTools "Read,Grep,Glob" \
  --model sonnet \
  --max-budget-usd 0.50 \
  --no-session-persistence \
  --effort high
```

**Response parsing**: The JSON response has `{ "result": "...", "structured_output": {...} }`. Extract `structured_output` -- this is the schema-validated data.

### Codex

```bash
# Write schema to temp file first
codex exec --full-auto --json --ephemeral \
  --output-schema /tmp/phantom-schema-{analysis_id}.json \
  -o /tmp/phantom-result-{analysis_id}.json \
  -m gpt-5-codex \
  -C /path/to/repo \
  "<prompt>"
```

**Response parsing**: Read the file at `/tmp/phantom-result-{analysis_id}.json`. This contains the schema-validated result. The `--json` flag on stdout produces JSONL events for progress tracking; filter for `AgentMessage` events.

### Cursor Agent

```bash
cursor agent -p "<prompt_with_schema_inline>" \
  --output-format json \
  --mode plan \
  --trust \
  --workspace /path/to/repo
```

**Response parsing**: Similar to Claude -- JSON response, extract the main content. Since Cursor has no `--json-schema` enforcement, the prompt itself must include the full schema definition and the instruction to output only valid JSON. The prompt templates above already include this.

---

## Parser Post-Processing

After extracting the JSON from the CLI response, `phantom-analysis::parser` performs these steps:

### For Architecture Graph responses:

1. Parse JSON into `ArchitectureGraph` struct
2. Validate all edge `source`/`target` reference existing node IDs
3. Validate all `node.group` reference existing group IDs
4. Verify node IDs match the `L{level}_*` pattern
5. Store in `parsed_graph` column

### For Findings responses (Performance, Security):

1. Parse JSON into the preset-specific struct
2. Generate stable finding IDs: `F_{preset}_{sha256(title)[:8]}`
3. Compute stats: `{ total, by_severity, by_category }` from the findings array (never trust AI-computed stats)
4. Normalize findings to the common `AnalysisFindings` format for dashboard display
5. Store the original preset-specific JSON in `parsed_findings`
6. Store the normalized stats separately or as a computed field

### For Dependency Map responses:

1. Parse JSON into `DependencyMap` struct
2. Validate `used_by` arrays reference valid internal node IDs
3. Validate edge source/target reference valid node IDs
4. Store in `parsed_graph` column (the dependency graph is renderable as a diagram)

### Error recovery:

If JSON parsing fails:
- Strip trailing commas (common AI output error)
- Fix unescaped quotes in strings
- If still invalid, store raw output with `status = 'failed'` and `error_message` describing the parse failure
- Store any partial output in `raw_output` for debugging

---

## Dashboard Normalization

All four presets produce different JSON structures, but the dashboard needs a uniform way to display cards. The parser normalizes each preset's output into a common summary:

```typescript
interface AnalysisCardSummary {
  // For diagram presets (Architecture, Dependency Map):
  node_count: number;
  edge_count: number;
  group_count: number;

  // For findings presets (Performance, Security):
  finding_count: number;
  by_severity: Record<string, number>;
  by_category: Record<string, number>;
  highest_finding_title: string | null;

  // For all presets:
  has_graph: boolean;  // true if the response includes a renderable graph
}
```

- Architecture Diagram: `{ node_count, edge_count, group_count, has_graph: true }`
- Performance Analysis: `{ finding_count, by_severity, by_category, highest_finding_title, has_graph: hotspot_graph exists }`
- Security Scan: `{ finding_count, by_severity, by_category, highest_finding_title, has_graph: attack_surface_graph exists }`
- Dependency Map: `{ node_count (internal), edge_count (internal + ipc), has_graph: true }`
