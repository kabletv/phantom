# CLI Integration Specifications for Phantom Workspace

> Research and integration design for AI CLI tools used by Phantom's analysis engine and CLI launcher.

---

## 1. Claude Code CLI

**Binary:** `claude`
**Version tested:** 2.1.50
**Install:** `npm install -g @anthropic-ai/claude-code` or via Anthropic installer

### Non-Interactive (Headless) Mode

The primary mode Phantom uses for automated analysis jobs.

```bash
claude -p "Your prompt here"
```

The `-p` / `--print` flag runs Claude non-interactively: it processes the prompt, prints the response, and exits. The workspace trust dialog is skipped in `-p` mode.

**Key flags for automation:**

| Flag | Purpose |
|------|---------|
| `-p, --print` | Non-interactive mode (required for headless) |
| `--model <model>` | Model selection: aliases (`sonnet`, `opus`) or full IDs (`claude-sonnet-4-6`, `claude-opus-4-6`) |
| `--output-format <fmt>` | `text` (default), `json` (single result object), `stream-json` (NDJSON streaming) |
| `--json-schema <schema>` | JSON Schema for structured output validation (use with `--output-format json`) |
| `--max-budget-usd <amount>` | Cost cap for the request (only with `--print`) |
| `--fallback-model <model>` | Automatic fallback when primary model is overloaded (only with `--print`) |
| `--allowedTools <tools>` | Auto-approve specific tools: `"Read,Edit,Bash"` |
| `--append-system-prompt <prompt>` | Add instructions while keeping default system prompt |
| `--system-prompt <prompt>` | Fully replace the system prompt |
| `--effort <level>` | `low`, `medium`, `high` — controls reasoning depth |
| `--verbose` | Enable verbose output (needed for stream-json events) |
| `--include-partial-messages` | Stream partial message chunks (with `stream-json`) |
| `--no-session-persistence` | Don't save session to disk (only with `--print`) |
| `--add-dir <dirs>` | Additional directories to allow tool access to |
| `-c, --continue` | Continue most recent conversation |
| `-r, --resume <id>` | Resume specific session by ID |
| `--permission-mode <mode>` | `default`, `plan`, `acceptEdits`, `bypassPermissions`, `dontAsk` |
| `--dangerously-skip-permissions` | Bypass all permission checks (sandboxed environments only) |

### Interactive Mode

For the CLI launcher (spawned in a terminal pane):

```bash
claude
```

Just run `claude` with no `-p` flag. It enters the TUI. User interacts directly. Phantom spawns this in a PTY via portable-pty.

For interactive mode with preset context:

```bash
claude --model opus --append-system-prompt "You are analyzing a Tauri v2 app"
```

### Output Format Details

**`--output-format json` response structure:**
```json
{
  "result": "The text response from Claude",
  "session_id": "uuid-here",
  "structured_output": { ... },
  "usage": { ... }
}
```

- `result` contains the plain-text response
- `structured_output` contains JSON conforming to `--json-schema` if provided
- `session_id` can be used with `--resume` for follow-up queries

**`--output-format stream-json` event structure:**
Each line is a JSON object. Key event types:
```json
{"type": "stream_event", "event": {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "..."}}}
```

Filter for text with jq:
```bash
claude -p "prompt" --output-format stream-json --verbose --include-partial-messages | \
  jq -rj 'select(.type == "stream_event" and .event.delta.type? == "text_delta") | .event.delta.text'
```

### Context Handling

Claude Code automatically reads the repo context from the current working directory. It reads `CLAUDE.md` files and has access to the full codebase via its built-in tools (Read, Grep, Glob, Bash).

To pass context:
- **Working directory:** `cd /path/to/repo && claude -p "prompt"` — Claude reads from cwd
- **Additional dirs:** `--add-dir /other/path` for cross-repo analysis
- **Allowed tools:** `--allowedTools "Read,Grep,Glob"` for read-only analysis
- **Piped input:** `cat file.py | claude -p "review this code"` — reads from stdin

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Generic error (config, env, dependency issues) |
| 3 | Controlled failure — API key missing/empty/invalid |

### Rate Limiting Behavior

- Claude Code handles rate limits internally with retries
- When overloaded, returns 529 status; `--fallback-model` auto-switches
- API key users get 429 with `retry-after` header
- Subscription users hit usage quotas per billing period
- `--max-budget-usd` prevents runaway costs in automation

### Recommended Phantom Configuration

For analysis jobs (non-interactive, structured JSON output):
```bash
claude -p "<prompt>" \
  --model sonnet \
  --output-format json \
  --json-schema '<schema>' \
  --allowedTools "Read,Grep,Glob" \
  --max-budget-usd 0.50 \
  --no-session-persistence \
  --effort high
```

The `--json-schema` flag enforces structured output. The response JSON has the validated result in `.structured_output`. Phantom extracts nodes/edges/findings from this field.

For interactive launcher:
```bash
claude --model opus
```

---

## 2. Codex CLI (OpenAI)

**Binary:** `codex`
**Install:** `npm install -g @openai/codex` or `brew install --cask codex`
**Language:** Rust
**Auth:** ChatGPT subscription (Plus/Pro/Team/Edu/Enterprise) or API key via `OPENAI_API_KEY`

### Non-Interactive (Headless) Mode

```bash
codex exec "Your prompt here"
```

The `codex exec` subcommand (alias: `codex e`) runs without human interaction.

**Key flags for automation:**

| Flag | Purpose |
|------|---------|
| `--json` | JSONL output (newline-delimited JSON events) |
| `--full-auto` | Auto-approve + workspace-write sandbox |
| `--ephemeral` | Don't persist session to disk |
| `--output-schema <path>` | JSON Schema to constrain final output |
| `--last-message-file, -o <path>` | Write final agent message to file |
| `--prompt-file <path>` | Read prompt from file |
| `--images, -i <paths>` | Attach image files |
| `-c, --config key=value` | Configuration overrides |
| `--color <mode>` | ANSI output: `always`, `never`, `auto` |

**Global flags (work with both interactive and exec):**

| Flag | Purpose |
|------|---------|
| `--model, -m <model>` | Override model (e.g., `gpt-5-codex`) |
| `--sandbox, -s <policy>` | `read-only`, `workspace-write`, `danger-full-access` |
| `--ask-for-approval, -a <mode>` | `untrusted`, `on-request`, `never` |
| `--profile, -p <name>` | Load named config profile from `~/.codex/config.toml` |
| `--search` | Enable live web search |
| `--cd, -C <path>` | Set working directory |
| `--oss` | Use local open-source model provider (Ollama) |

### Interactive Mode

```bash
codex
```

Or with a starting prompt:

```bash
codex "explain the auth module"
```

### Output Format Details

**Default (human-readable):** formatted text with ANSI colors.

**`--json` JSONL events:**
Each line is a JSON object following the `EventMsg` enum:
- `TurnStarted` — turn begins
- `AgentMessage` — streaming content from the agent
- `ExecCommandBegin` — tool execution starting (includes command)
- `ExecCommandOutputDelta` — stdout/stderr from command
- `ExecCommandEnd` — exit status + elapsed duration
- `TurnComplete` — includes token usage metrics
- `Error` — fatal error

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Generic error (config, validation) |
| 2 | Git safety check failed |
| 124 | Timeout or rate limit exceeded |
| 125 | Internal agent error (fatal) |
| 130 | Interrupted (SIGINT/SIGTERM) |

### Context Handling

Codex reads from the current working directory. Use `--cd` or `-C` to set the working dir.

### Session Resume

```bash
codex exec --resume "session-id" "follow-up prompt"
codex exec resume --last
```

### Review Mode (Code Analysis)

Specialized subcommand for code review:
```bash
codex review --files path1 path2
codex review --git-diff "HEAD~1..HEAD"
```

### Configuration

Config file: `~/.codex/config.toml`
CLI `-c` overrides take precedence.

### Recommended Phantom Configuration

For analysis jobs (structured JSON output):
```bash
codex exec --full-auto --json --ephemeral \
  --output-schema /tmp/phantom-schema.json \
  -o /tmp/phantom-result.json \
  -m gpt-5-codex \
  -C /path/to/repo \
  "Your analysis prompt"
```

Phantom writes the JSON schema to a temp file, passes it via `--output-schema`, and reads the structured result from the `-o` output file. The `--json` flag provides streaming JSONL events for progress tracking.

For interactive launcher:
```bash
codex -m gpt-5-codex
```

---

## 3. Cursor CLI

**Binary:** `cursor`
**Subcommand:** `cursor agent`
**Version tested:** 2.5.17
**Install:** Cursor IDE installs the CLI; also available standalone

### Key Finding: Cursor Has a Standalone Agent CLI

Cursor ships `cursor agent` as a standalone terminal agent. It supports headless mode via `--print`, very similar to Claude Code's interface.

### Non-Interactive (Headless) Mode

```bash
cursor agent -p "Your prompt here"
```

**Key flags for automation:**

| Flag | Purpose |
|------|---------|
| `-p, --print` | Non-interactive mode (for scripts) |
| `--output-format <fmt>` | `text` (default), `json`, `stream-json` |
| `--stream-partial-output` | Stream partial deltas (with `stream-json`) |
| `--model <model>` | Model selection (e.g., `gpt-5`, `sonnet-4`, `sonnet-4-thinking`) |
| `--mode <mode>` | `plan` (read-only analysis), `ask` (Q&A, read-only) |
| `--plan` | Shorthand for `--mode=plan` |
| `--workspace <path>` | Working directory |
| `-f, --force` | Auto-approve commands |
| `--yolo` | Alias for `--force` |
| `--trust` | Trust workspace without prompting (headless only) |
| `--sandbox <mode>` | `enabled` or `disabled` |
| `--approve-mcps` | Auto-approve all MCP servers |
| `-c, --cloud` | Start in cloud mode |
| `--api-key <key>` | API key (or `CURSOR_API_KEY` env var) |
| `-H, --header <header>` | Custom headers for requests |

### Interactive Mode

```bash
cursor agent
```

Or with a prompt:
```bash
cursor agent "explain this codebase"
```

### Session Management

```bash
cursor agent --resume [chatId]     # Resume specific session
cursor agent --continue            # Continue previous session
cursor agent ls                    # List sessions
```

### Context Handling

Uses `--workspace <path>` to set the project root. Defaults to cwd.

### Additional Subcommands

- `cursor agent login` / `logout` — authentication
- `cursor agent models` — list available models
- `cursor agent status` / `whoami` — auth status
- `cursor agent mcp` — manage MCP servers
- `cursor agent generate-rule` — generate Cursor rules

### Recommended Phantom Configuration

For analysis jobs (structured JSON output):
```bash
cursor agent -p "Your analysis prompt" \
  --model sonnet-4 \
  --output-format json \
  --mode plan \
  --trust \
  --workspace /path/to/repo
```

Cursor Agent does not support `--json-schema` or `--output-schema`. Phantom must include the JSON schema directly in the prompt text and instruct the AI to output only valid JSON. The prompt templates already include this instruction ("You MUST respond with ONLY a JSON object matching the schema provided").

For interactive launcher:
```bash
cursor agent --model sonnet-4
```

---

## 4. Analysis Prompt Design

> **Canonical reference**: The production prompt templates and full JSON schemas are in [`docs/plans/2026-02-21-prompt-templates-final.md`](2026-02-21-prompt-templates-final.md). That document reconciles the CLI construction details from this spec with the schema design from the analysis system design. Implementors should use that file as the authoritative source for prompt text and schema definitions. This section documents the CLI-specific integration mechanics (how schemas are passed to each tool, response extraction, flattened schemas for `--json-schema`/`--output-schema`).

### Output Format: Structured JSON (Not Mermaid)

All analysis presets output **structured JSON** that Phantom parses directly. The frontend converts this JSON into React Flow nodes/edges for rendering. This avoids the fragility of parsing mermaid text and enables richer metadata (severity, file paths, line numbers) that mermaid cannot express.

The canonical JSON schemas are defined by the analytical-educator in `docs/plans/2026-02-21-analysis-system-design.md`. This section specifies how the CLI integration layer feeds those schemas to each tool and extracts the results.

**Four preset-specific schemas are used** (see `docs/plans/2026-02-21-prompt-templates-final.md` for full definitions):
- **ArchitectureGraph** — for Architecture Diagram preset (Levels 1-3). Contains `version`, `level`, `direction`, `nodes`, `edges`, `groups` with hierarchical `L{level}_` node IDs.
- **PerformanceFindings** — for Performance Analysis preset. Contains `summary`, `findings` array with severity/category/locations/effort/impact, plus `hotspot_graph` with nodes/edges.
- **SecurityFindings** — for Security Scan preset. Contains `summary`, `risk_score`, `findings` array with severity/category/cwe/exploitability/remediation, plus `attack_surface_graph`.
- **DependencyMap** — for Dependency Map preset. Contains `internal` (nodes/edges), `external` (versioned deps with `used_by`), `circular_dependencies`, and `ipc_boundary` (Tauri commands).

### Enforcing JSON Output Per CLI

| CLI | Schema enforcement mechanism | Response extraction |
|-----|------------------------------|---------------------|
| Claude Code | `--output-format json --json-schema '<schema>'` | Parse outer JSON, read `.structured_output` field. This is the schema-validated graph/findings JSON. |
| Codex | `codex exec --output-schema /tmp/schema.json -o /tmp/result.json` | Read the `-o` output file directly. It contains the validated JSON. |
| Cursor Agent | `cursor agent -p "..." --output-format json` (no schema flag) | Parse outer JSON, read `.result` field (text), extract JSON code block, parse as JSON. |

### Claude Code `--output-format json` Wrapping Behavior (IMPORTANT)

When Claude Code runs with `--output-format json`, the response is wrapped in an outer envelope:

```json
{
  "result": "The text response (may contain markdown, code blocks, etc.)",
  "session_id": "uuid",
  "structured_output": { ... },
  "usage": { ... }
}
```

**With `--json-schema`**: The AI's structured response is validated against the schema and placed in `.structured_output`. The `.result` field may still contain explanatory text. **Phantom should read `.structured_output` directly** -- this is the validated, parsed JSON ready to store in `parsed_graph` or `parsed_findings`.

**Without `--json-schema`**: The `.structured_output` field is absent or null. The AI's text response is in `.result`, which may contain a JSON code block that Phantom must extract manually.

**Recommendation**: Always use `--json-schema` for Claude Code analysis jobs. This gives us validated structured output with zero parsing. The runner extracts `.structured_output` and stores it directly.

**Fallback path (Cursor, or if `--json-schema` fails)**: Use `--output-format text` (plain text), then extract the ` ```json ... ``` ` block from the raw output. This avoids double-wrapping and is simpler than unwrapping outer JSON to find inner JSON code blocks. See analysis-system-design.md Appendix D for the extraction/validation logic.

### Prompt Template System

Each prompt template uses `{{variable}}` placeholders that Phantom replaces before sending to the CLI:

- `{{repo_path}}` — absolute path to the repository
- `{{branch}}` — current branch name
- `{{commit_sha}}` — current HEAD commit

For drill-down prompts (Level 2 and 3), additional variables:
- `{{target_node_label}}` — the display name of the node being drilled into
- `{{target_path}}` — the `metadata.path` or `metadata.file` from the clicked node

### Concurrency Note

Analysis jobs run in a bounded queue (default: 2 concurrent jobs). Each prompt is designed to work well as a standalone one-at-a-time job. Do not assume multiple presets run simultaneously.

### Preset A: Architecture Diagram (Level 1)

**Schema**: ArchitectureGraph from analysis-system-design.md Section 2.2. See Section 4.6 below for the flattened version used with `--json-schema`.

**Prompt template:**
```
Analyze the architecture of this codebase.

Identify all major components (crates, packages, services, frontends, databases, external systems).
Show how they communicate: IPC, function calls, network, filesystem, subprocess.

Output a single JSON object with this structure:
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
- Must match pattern: L1_[a-z][a-z0-9_]*
- Must be unique across all nodes
- Must be stable: the same component should always get the same ID

Rules for nodes:
- Set drillable=true for components with meaningful internals (your own crates/packages)
- Set drillable=false for external dependencies, databases, and simple leaf components
- Always include a path for drillable nodes

Rules for edges:
- Use "ipc" type for cross-process communication (include metadata.protocol)
- Use "dataflow" type when data flows in a specific direction (include metadata.data_type)
- Use "dependency" type for general usage relationships
- Use "ownership" type for containment relationships

Do not include individual files or functions. Stay at the component/crate/package level.
Do not include any text outside the JSON object.
```

### Preset A (continued): Architecture Diagram (Level 2 -- drill-down)

**Prompt template:**
```
Analyze the internal structure of {{target_node_label}} (located at {{target_path}}).

Show its modules, key types (structs/traits/interfaces), and internal layers.

Output a single JSON object:
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
- Node IDs: L2_{component}_{name} (lowercase, underscores, match L2_[a-z][a-z0-9_]*)
- Group by architectural layer (API, Core, Platform, Data, etc.)
- Set drillable=true for modules/types with complex internal logic worth exploring
- Always include file paths in metadata
- Show significant external dependencies as type "external" with drillable=false
Do not include any text outside the JSON object.
```

### Preset A (continued): Architecture Diagram (Level 3 -- drill-down)

**Prompt template:**
```
Analyze the logic flow of key operations in {{target_node_label}} ({{target_path}}).

Show function call chains, data transformations, control flow decisions, and error paths.
Focus on the most important operations (public API methods, main loops, event handlers).

Output a single JSON object:
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
        "signature": "<full function signature>",
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
- Node IDs: L3_{component}_{module}_{function} (lowercase, underscores, match L3_[a-z][a-z0-9_]*)
- Use type "decision" for branching points
- Use type "async_boundary" for await points, channel sends, thread spawns
- Use type "error_path" for error handling branches
- Use type "data_transform" for significant data shape changes
- Edge metadata.condition: describe branching conditions for control_flow edges
- Edge metadata.data_type: describe data being passed for dataflow edges
- All Level 3 nodes have drillable=false (deepest level)
Do not include any text outside the JSON object.
```

### Preset B: Performance Analysis

**Schema**: AnalysisFindings from analysis-system-design.md Section 4.2. See Section 4.6 below for the flattened version.

**Prompt template:**
```
Analyze this codebase for performance improvement opportunities.

For each finding, provide the data in the JSON structure below.

Output a single JSON object:
{
  "version": 1,
  "summary": "<1-2 sentence overview>",
  "findings": [
    {
      "title": "<short description>",
      "severity": "<critical|high|medium|low|info>",
      "category": "performance/<subcategory>",
      "description": "<detailed explanation>",
      "locations": [{"file": "<repo-relative path>", "line_start": <N>, "snippet": "<relevant code>"}],
      "suggestion": "<specific, actionable fix>",
      "effort": "<trivial|small|medium|large>"
    }
  ]
}

Valid subcategories: allocation, lock-contention, io-blocking, algorithmic, caching, serialization.

Focus on real, actionable issues. Do not report stylistic preferences as performance findings.
Order findings by severity: critical first, then high, medium, low.
Do not include any text outside the JSON object.
```

Note: The `id` and `stats` fields are computed by Phantom's parser after receiving the response, not by the AI. See analysis-system-design.md Section 4.3.

### Preset C: Security Scan

**Schema**: AnalysisFindings from analysis-system-design.md Section 4.2.

**Prompt template:**
```
Analyze this codebase for security concerns.

For each finding, provide the data in the JSON structure below.

Output a single JSON object:
{
  "version": 1,
  "summary": "<1-2 sentence overview>",
  "findings": [
    {
      "title": "<short description>",
      "severity": "<critical|high|medium|low|info>",
      "category": "security/<subcategory>",
      "description": "<detailed explanation>",
      "locations": [{"file": "<repo-relative path>", "line_start": <N>, "snippet": "<relevant code>"}],
      "suggestion": "<specific remediation>",
      "effort": "<trivial|small|medium|large>"
    }
  ]
}

Valid subcategories: input-validation, injection, authentication, authorization, dependency, cryptography, information-disclosure, configuration.

Prioritize findings that could be exploited by an attacker with access to the application.
Do not report missing features (e.g., "no rate limiting") unless the context clearly requires them.
Order findings by severity: critical first, then high, medium, low, info.
Do not include any text outside the JSON object.
```

### Preset D: Dependency Map

**Schema**: Dedicated DependencyMap schema (not ArchitectureGraph). The Dependency Map has richer structure than a generic graph -- it captures external dependency versions, `used_by` arrays, circular dependency chains, and IPC command listings that ArchitectureGraph cannot express.

See the flattened DependencyMap schema in Section 4.6 below.

**Prompt template:**
```
Analyze the dependency structure of this codebase.

Output a single JSON object:
{
  "internal": {
    "nodes": [
      {
        "id": "<crate_or_package_name>",
        "label": "<display name>",
        "type": "<binary|library|package|config>",
        "language": "<rust|typescript|null>",
        "path": "<repo-relative path to crate/package root>"
      }
    ],
    "edges": [
      {
        "source": "<dependent>",
        "target": "<dependency>",
        "label": "<relationship description or null>",
        "type": "<dependency|dev_dependency|build_dependency|ipc>"
      }
    ]
  },
  "external": [
    {
      "name": "<dependency name>",
      "version": "<version or null>",
      "category": "<frontend|backend|build|dev|testing>",
      "used_by": ["<internal node id>", ...],
      "purpose": "<one sentence description>"
    }
  ],
  "circular_dependencies": [
    ["<node_a>", "<node_b>", "<node_a>"]
  ],
  "ipc_boundary": {
    "commands": [
      {
        "name": "<tauri_command_name>",
        "rust_handler": "<repo-relative path to handler file>",
        "frontend_caller": "<repo-relative path to calling file or null>",
        "description": "<what this command does>"
      }
    ]
  }
}

Rules:
- Include ALL workspace crates and npm packages in "internal"
- Node IDs in "internal" must match crate/package names exactly
- Use edge type "ipc" for the Tauri frontend-to-backend boundary
- "used_by" in external deps must reference valid internal node IDs
- Do not include transitive external dependencies -- only direct ones
- "circular_dependencies" is an empty array if none exist
- List every #[tauri::command] function in "ipc_boundary"
Do not include any text outside the JSON object.
```

### 4.6 Flattened JSON Schemas for CLI `--json-schema` Flag

Claude Code's `--json-schema` flag does not support `$ref` or `$defs`. The schemas must be fully flattened. Codex's `--output-schema` requires `"additionalProperties": false` on all object types. These flattened schemas satisfy both requirements.

**Flattened ArchitectureGraph schema:**
```json
{
  "type": "object",
  "required": ["version", "level", "direction", "nodes", "edges"],
  "additionalProperties": false,
  "properties": {
    "version": { "type": "integer" },
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
          "type": { "type": "string" },
          "group": { "type": "string" },
          "metadata": {
            "type": "object",
            "additionalProperties": true,
            "properties": {
              "path": { "type": "string" },
              "file": { "type": "string" },
              "line": { "type": "integer" },
              "description": { "type": "string" },
              "drillable": { "type": "boolean" },
              "signature": { "type": "string" },
              "return_type": { "type": "string" }
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
          "label": { "type": "string" },
          "type": { "type": "string" },
          "metadata": {
            "type": "object",
            "additionalProperties": true,
            "properties": {
              "condition": { "type": "string" },
              "data_type": { "type": "string" },
              "protocol": { "type": "string" }
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
          "description": { "type": "string" }
        }
      }
    }
  }
}
```

**Flattened PerformanceFindings schema:**
```json
{
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
          "category": { "type": "string", "enum": ["allocation", "lock_contention", "io_blocking", "algorithmic", "caching", "serialization", "rendering", "concurrency"] },
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

**Flattened SecurityFindings schema:**
```json
{
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
          "category": { "type": "string", "enum": ["injection", "xss", "path_traversal", "deserialization", "secrets", "ipc", "dependencies", "unsafe_code", "validation", "privilege_escalation", "other"] },
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

Note: The `id` and `stats` fields are intentionally omitted from findings schemas passed to the AI. They are computed by Phantom's parser (see analysis-system-design.md Section 4.3).

**Flattened DependencyMap schema:**
```json
{
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

---

## 5. Preset Configuration Schema

### Default Analysis Presets (Seeded on First Launch)

```json
[
  {
    "name": "Architecture Diagram",
    "type": "diagram",
    "prompt_template": "<architecture prompt from section 4>",
    "schedule": "on_main_change"
  },
  {
    "name": "Performance Analysis",
    "type": "analysis",
    "prompt_template": "<performance prompt from section 4>",
    "schedule": null
  },
  {
    "name": "Security Scan",
    "type": "analysis",
    "prompt_template": "<security prompt from section 4>",
    "schedule": "on_main_change"
  },
  {
    "name": "Dependency Map",
    "type": "diagram",
    "prompt_template": "<dependency prompt from section 4>",
    "schedule": "on_main_change"
  }
]
```

### Default CLI Presets (Seeded on First Launch)

```json
[
  {
    "name": "Claude Code (Interactive)",
    "cli_binary": "claude",
    "flags": "--model sonnet",
    "working_dir": null,
    "env_vars": null
  },
  {
    "name": "Claude Code (Opus)",
    "cli_binary": "claude",
    "flags": "--model opus",
    "working_dir": null,
    "env_vars": null
  },
  {
    "name": "Codex (Interactive)",
    "cli_binary": "codex",
    "flags": "",
    "working_dir": null,
    "env_vars": null
  },
  {
    "name": "Cursor Agent",
    "cli_binary": "cursor",
    "flags": "agent",
    "working_dir": null,
    "env_vars": null
  },
  {
    "name": "Cursor Agent (Plan Mode)",
    "cli_binary": "cursor",
    "flags": "agent --plan",
    "working_dir": null,
    "env_vars": null
  }
]
```

### CLI Preset Field Semantics

- **`cli_binary`**: The executable name. Phantom resolves via `PATH` or allows absolute paths.
- **`flags`**: Space-separated flags appended after the binary. For Cursor, this MUST include `agent` as the first flag since `cursor agent` is a subcommand.
- **`working_dir`**: Override the working directory. `null` means use the current repo path.
- **`env_vars`**: JSON string of `{"KEY": "VALUE"}` pairs merged into the subprocess environment. `null` means inherit.
- **`budget_usd`** (new field): Optional cost cap for analysis jobs. Maps to `--max-budget-usd` for Claude Code. Codex and Cursor do not have equivalent flags, so this field is ignored for those CLIs. Stored as `REAL` in SQLite. Default: `null` (no limit).

The `cli_presets` table needs a new column:
```sql
ALTER TABLE cli_presets ADD COLUMN budget_usd REAL;
```

### How Phantom Constructs the Command

For interactive launch (spawned in PTY):
```
{cli_binary} {flags}
```

For headless analysis (structured JSON):
```
# Claude Code — uses --json-schema for enforcement
claude -p "{prompt}" --output-format json --json-schema '{schema}' \
  --allowedTools "Read,Grep,Glob" --model sonnet --no-session-persistence

# Codex — writes schema to temp file, reads result from -o file
codex exec --full-auto --json --ephemeral \
  --output-schema /tmp/phantom-schema-{id}.json \
  -o /tmp/phantom-result-{id}.json \
  -m gpt-5-codex "{prompt}"

# Cursor Agent — no schema enforcement; schema is included in prompt text
cursor agent -p "{prompt}" --output-format json --mode plan --trust
```

### CLI Detection Logic

The analysis engine needs to know which headless flags to use based on `cli_binary`:

| Binary | Headless flag | Output flag | Schema enforcement | Prompt arg |
|--------|--------------|-------------|-------------------|------------|
| `claude` | `-p` | `--output-format json` | `--json-schema '{...}'` (inline JSON) | Positional (after flags) |
| `codex` | `exec` subcommand | `--json` | `--output-schema /path/to/file.json` (file path) | Positional (after `exec` + flags) |
| `cursor` | `agent -p` | `--output-format json` | None (schema in prompt text) | Positional (after flags) |

---

## 6. Error Handling

### CLI Not Installed

**Detection:** Before spawning a job, run `which {cli_binary}` (or use Rust's `which` crate). If it returns a non-zero exit code, the binary is not in PATH.

**User-facing error:**
```
"{cli_binary}" is not installed or not in PATH.

Install instructions:
- claude: npm install -g @anthropic-ai/claude-code
- codex: npm install -g @openai/codex
- cursor: Install from https://cursor.com
```

**Implementation:** The `phantom-analysis` runner should check binary availability before creating the analysis record. Return early with a clear error rather than creating a "failed" analysis.

### API Key / Auth Not Configured

**Detection per tool:**

| Tool | Check | Indicator |
|------|-------|-----------|
| Claude Code | Exit code 3 | API key missing/empty |
| Claude Code | stderr contains "authentication" | Auth token expired |
| Codex | `codex login status` exits non-zero | Not authenticated |
| Codex | stderr contains "OPENAI_API_KEY" | API key not set |
| Cursor Agent | `cursor agent status` exits non-zero | Not logged in |

**User-facing error:**
```
{tool_name} is not authenticated. Please run "{auth_command}" in a terminal first.

Auth commands:
- claude: claude auth login
- codex: codex login
- cursor: cursor agent login
```

### Rate Limit Handling

| Tool | Rate limit signal | Behavior |
|------|------------------|----------|
| Claude Code | 429 response / "rate limit" in output | Internal retry with backoff; `--fallback-model` if configured |
| Codex | Exit code 124 | Timeout/rate limit; should retry with exponential backoff |
| Cursor Agent | 429 in output | Similar to Claude; retry with backoff |

**Phantom's strategy:**
1. First attempt: run as configured
2. On rate limit: wait 30 seconds, retry once
3. On second rate limit: mark analysis as "failed" with message "Rate limited. Try again later."
4. Store partial output if any was captured before the rate limit

### Timeout Handling

**Default timeout:** 5 minutes per analysis job.

**Detection:** `tokio::time::timeout` wrapping the subprocess. If the timeout fires, kill the subprocess and mark the analysis as "failed" with message "Analysis timed out after 5 minutes."

**Per-CLI behavior on kill:**
- All three CLIs handle SIGTERM gracefully
- Send SIGTERM first, wait 5 seconds, then SIGKILL if still alive

### Subprocess Crash / Unexpected Exit

If the subprocess exits with an unexpected non-zero code:
1. Capture all stderr output
2. Mark analysis as "failed"
3. Store stderr as `error_message` in the analysis record
4. Store any partial stdout as `raw_output` (it may contain useful partial results)

### Network Errors

If the machine is offline or the API endpoint is unreachable:
- Claude Code and Codex both fail quickly with descriptive stderr
- Phantom should detect "network" or "connection" errors in stderr
- Mark as "failed" with message "Network error. Check your internet connection."

---

## 7. Important Findings for Implementation Plan

### Finding 1: All Three CLIs Support Headless Mode

All three tools (Claude Code, Codex, Cursor Agent) support non-interactive headless execution with structured JSON output. This is confirmed and working. No changes needed to the implementation plan.

### Finding 2: Cursor Agent Is a Subcommand

Cursor's CLI agent is `cursor agent`, not just `cursor`. The `cli_binary` field in presets should be `cursor` and `flags` should start with `agent`. The command construction logic in `phantom-analysis` must handle this: when `cli_binary` is `cursor`, prepend `agent` to the headless flags.

### Finding 3: Output Format Differences

- Claude Code: `--output-format json` returns a JSON object with `.result` and `.structured_output`
- Codex: `--json` returns JSONL (newline-delimited events); final message must be extracted from `AgentMessage` events
- Cursor Agent: `--output-format json` returns JSON (similar structure to Claude)

The `phantom-analysis` parser must handle both single-JSON and JSONL formats. The parser implementation in Task 9 should include a CLI-aware extraction layer.

### Finding 4: Structured JSON Output Is Enforceable (Claude + Codex)

**This is the approach used for all analysis presets.** Each preset has its own JSON schema, defined in `docs/plans/2026-02-21-prompt-templates-final.md` (the canonical reference).

- **Claude Code**: `--json-schema` flag accepts an inline JSON Schema string. The validated output appears in `.structured_output`. This is the strongest enforcement -- Claude validates against the schema. Phantom reads `.structured_output` directly; no text parsing needed.
- **Codex**: `--output-schema` flag accepts a path to a JSON Schema file. The validated output is written to the `-o` file. Note: requires `"additionalProperties": false` on all object types per OpenAI's Structured Outputs spec. The flattened schemas in Section 4.6 satisfy this requirement.
- **Cursor Agent**: No schema enforcement flag. The schema structure is described in the prompt text with instructions to output only valid JSON. Less reliable, but works in practice when the prompt is explicit. Phantom must extract the JSON from the text response using the fallback parser (see analysis-system-design.md Appendix D).

All prompt templates include "Do not include any text outside the JSON object." This serves as belt-and-suspenders: it reinforces schema enforcement for Claude/Codex and is the primary control for Cursor.

### Finding 5: Codex Has a Dedicated Review Mode

`codex review` is a specialized subcommand for code analysis that accepts `--files` and `--git-diff`. This could be useful for the security scan and performance analysis presets. Consider adding a Codex-specific code path that uses `codex review` instead of `codex exec` for analysis presets.

### Finding 6: Budget Control

Claude Code has `--max-budget-usd` for cost control. Codex does not have an equivalent CLI flag. Phantom should expose a per-preset budget field that maps to `--max-budget-usd` for Claude Code jobs.

### Finding 7: Concurrency Limiting

Analysis jobs should run in a bounded queue (default: 2 concurrent jobs). The `phantom-analysis` runner should use a `tokio::sync::Semaphore` to limit concurrent subprocess spawns. Each preset prompt is self-contained and designed to work well as a standalone job — no prompt depends on another preset running first.
