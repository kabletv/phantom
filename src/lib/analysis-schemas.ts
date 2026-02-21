/**
 * Analysis output schemas and validation.
 *
 * These types and validators define the contract between the AI CLI output
 * (parsed by phantom-analysis on the Rust side) and the React frontend.
 * The Rust parser validates against JSON Schema at parse time; these
 * TypeScript types mirror the schemas for frontend consumption, and
 * the validate* functions provide a second layer of defense for data
 * arriving from the backend.
 */

// ============================================================================
// Architecture Graph (Preset A: Architecture Diagram)
// ============================================================================

export type NodeType =
  // Level 1
  | "service" | "library" | "frontend" | "external" | "database"
  // Level 2
  | "module" | "type" | "layer" | "trait" | "interface"
  // Level 3
  | "function" | "method" | "async_boundary" | "decision" | "data_transform" | "error_path";

export type EdgeType = "dependency" | "dataflow" | "call" | "ownership" | "ipc" | "control_flow";

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  group?: string | null;
  metadata?: {
    path?: string | null;
    file?: string | null;
    line?: number | null;
    description?: string | null;
    drillable?: boolean;
    signature?: string | null;
    return_type?: string | null;
  };
}

export interface GraphEdge {
  source: string;
  target: string;
  label?: string | null;
  type: EdgeType;
  metadata?: {
    condition?: string | null;
    data_type?: string | null;
    protocol?: string | null;
  };
}

export interface GraphGroup {
  id: string;
  label: string;
  description?: string | null;
}

export interface ArchitectureGraph {
  version: 1;
  level: 1 | 2 | 3;
  direction: "top-down" | "left-right";
  description: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  groups: GraphGroup[];
}

// ============================================================================
// Performance Analysis (Preset B)
// ============================================================================

export type PerfCategory =
  | "allocation" | "lock_contention" | "io_blocking" | "algorithmic"
  | "caching" | "serialization" | "rendering" | "concurrency";

export interface CodeLocation {
  file: string;
  line_start?: number | null;
  line_end?: number | null;
  snippet?: string | null;
}

export interface PerfFinding {
  title: string;
  severity: Severity;
  category: PerfCategory;
  description: string;
  locations: CodeLocation[];
  suggestion: string;
  effort: Effort;
  impact: string;
}

export interface HotspotNode {
  id: string;
  label: string;
  type: "hotspot" | "bottleneck" | "affected";
  severity: Severity;
  file?: string | null;
}

export interface HotspotEdge {
  source: string;
  target: string;
  label?: string | null;
}

export interface PerformanceAnalysis {
  summary: string;
  findings: PerfFinding[];
  hotspot_graph?: {
    nodes: HotspotNode[];
    edges: HotspotEdge[];
  };
}

// ============================================================================
// Security Scan (Preset C)
// ============================================================================

export type SecurityCategory =
  | "injection" | "xss" | "path_traversal" | "deserialization" | "secrets"
  | "ipc" | "dependencies" | "unsafe_code" | "validation" | "privilege_escalation" | "other";

export interface SecurityFinding {
  title: string;
  severity: Severity;
  category: SecurityCategory;
  cwe?: string | null;
  description: string;
  locations: CodeLocation[];
  exploitability: string;
  remediation: string;
  effort: Effort;
}

export interface AttackSurfaceNode {
  id: string;
  label: string;
  type: "entry_point" | "vulnerability" | "data_sink" | "trust_boundary";
  severity?: Severity | null;
}

export interface AttackSurfaceEdge {
  source: string;
  target: string;
  label?: string | null;
  type: "data_flow" | "trust_crossing" | "attack_vector";
}

export interface SecurityAnalysis {
  summary: string;
  risk_score: "critical" | "high" | "medium" | "low" | "clean";
  findings: SecurityFinding[];
  attack_surface_graph?: {
    nodes: AttackSurfaceNode[];
    edges: AttackSurfaceEdge[];
  };
}

// ============================================================================
// Dependency Map (Preset D)
// ============================================================================

export interface DepNode {
  id: string;
  label: string;
  type: "binary" | "library" | "package" | "config";
  language?: string | null;
  path: string;
}

export interface DepEdge {
  source: string;
  target: string;
  label?: string | null;
  type: "dependency" | "dev_dependency" | "build_dependency" | "ipc";
}

export interface ExternalDep {
  name: string;
  version?: string | null;
  category: "frontend" | "backend" | "build" | "dev" | "testing";
  used_by: string[];
  purpose: string;
}

export interface IpcCommand {
  name: string;
  rust_handler: string;
  frontend_caller?: string | null;
  description: string;
}

export interface DependencyMap {
  internal: {
    nodes: DepNode[];
    edges: DepEdge[];
  };
  external: ExternalDep[];
  circular_dependencies: string[][];
  ipc_boundary: {
    commands: IpcCommand[];
  };
}

// ============================================================================
// Shared types
// ============================================================================

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Effort = "trivial" | "small" | "medium" | "large";

/** Union of all analysis output types */
export type AnalysisOutput = ArchitectureGraph | PerformanceAnalysis | SecurityAnalysis | DependencyMap;

/** Normalized summary for dashboard cards */
export interface AnalysisCardSummary {
  node_count: number;
  edge_count: number;
  group_count: number;
  finding_count: number;
  by_severity: Record<string, number>;
  by_category: Record<string, number>;
  highest_finding_title: string | null;
  has_graph: boolean;
}

// ============================================================================
// Validation
// ============================================================================

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult<T> {
  valid: boolean;
  data: T | null;
  errors: ValidationError[];
}

const NODE_TYPES: Set<string> = new Set([
  "service", "library", "frontend", "external", "database",
  "module", "type", "layer", "trait", "interface",
  "function", "method", "async_boundary", "decision", "data_transform", "error_path",
]);

const EDGE_TYPES: Set<string> = new Set([
  "dependency", "dataflow", "call", "ownership", "ipc", "control_flow",
]);

const SEVERITY_VALUES: Set<string> = new Set([
  "critical", "high", "medium", "low", "info",
]);

const EFFORT_VALUES: Set<string> = new Set([
  "trivial", "small", "medium", "large",
]);

const PERF_CATEGORIES: Set<string> = new Set([
  "allocation", "lock_contention", "io_blocking", "algorithmic",
  "caching", "serialization", "rendering", "concurrency",
]);

const SECURITY_CATEGORIES: Set<string> = new Set([
  "injection", "xss", "path_traversal", "deserialization", "secrets",
  "ipc", "dependencies", "unsafe_code", "validation", "privilege_escalation", "other",
]);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

/**
 * Validate an ArchitectureGraph JSON object.
 * Checks structural integrity: node ID uniqueness, edge reference validity,
 * group reference validity, and node ID format.
 */
export function validateArchitectureGraph(raw: unknown): ValidationResult<ArchitectureGraph> {
  const errors: ValidationError[] = [];

  if (!isObject(raw)) {
    return { valid: false, data: null, errors: [{ path: "$", message: "expected an object" }] };
  }

  if (raw.version !== 1) {
    errors.push({ path: "$.version", message: `expected 1, got ${raw.version}` });
  }

  if (![1, 2, 3].includes(raw.level as number)) {
    errors.push({ path: "$.level", message: `expected 1, 2, or 3, got ${raw.level}` });
  }

  if (!["top-down", "left-right"].includes(raw.direction as string)) {
    errors.push({ path: "$.direction", message: `expected "top-down" or "left-right", got ${raw.direction}` });
  }

  if (!isString(raw.description)) {
    errors.push({ path: "$.description", message: "expected a string" });
  }

  // Validate nodes
  if (!isArray(raw.nodes)) {
    errors.push({ path: "$.nodes", message: "expected an array" });
    return { valid: false, data: null, errors };
  }

  const nodeIds = new Set<string>();
  const level = raw.level as number;

  for (let i = 0; i < raw.nodes.length; i++) {
    const node = raw.nodes[i];
    if (!isObject(node)) {
      errors.push({ path: `$.nodes[${i}]`, message: "expected an object" });
      continue;
    }

    if (!isString(node.id)) {
      errors.push({ path: `$.nodes[${i}].id`, message: "expected a string" });
    } else {
      if (nodeIds.has(node.id)) {
        errors.push({ path: `$.nodes[${i}].id`, message: `duplicate node ID: "${node.id}"` });
      }
      nodeIds.add(node.id);

      const expectedPrefix = `L${level}_`;
      if (!node.id.startsWith(expectedPrefix)) {
        errors.push({ path: `$.nodes[${i}].id`, message: `expected prefix "${expectedPrefix}", got "${node.id}"` });
      }
    }

    if (!isString(node.label)) {
      errors.push({ path: `$.nodes[${i}].label`, message: "expected a string" });
    }

    if (!isString(node.type) || !NODE_TYPES.has(node.type)) {
      errors.push({ path: `$.nodes[${i}].type`, message: `invalid node type: "${node.type}"` });
    }
  }

  // Validate groups
  const groupIds = new Set<string>();
  if (isArray(raw.groups)) {
    for (let i = 0; i < raw.groups.length; i++) {
      const group = raw.groups[i];
      if (!isObject(group)) continue;
      if (isString(group.id)) {
        groupIds.add(group.id);
      }
    }
  }

  // Validate node.group references
  for (let i = 0; i < raw.nodes.length; i++) {
    const node = raw.nodes[i] as Record<string, unknown>;
    if (isString(node.group) && !groupIds.has(node.group)) {
      errors.push({ path: `$.nodes[${i}].group`, message: `references unknown group: "${node.group}"` });
    }
  }

  // Validate edges
  if (!isArray(raw.edges)) {
    errors.push({ path: "$.edges", message: "expected an array" });
  } else {
    for (let i = 0; i < raw.edges.length; i++) {
      const edge = raw.edges[i];
      if (!isObject(edge)) {
        errors.push({ path: `$.edges[${i}]`, message: "expected an object" });
        continue;
      }

      if (!isString(edge.source) || !nodeIds.has(edge.source)) {
        errors.push({ path: `$.edges[${i}].source`, message: `references unknown node: "${edge.source}"` });
      }

      if (!isString(edge.target) || !nodeIds.has(edge.target)) {
        errors.push({ path: `$.edges[${i}].target`, message: `references unknown node: "${edge.target}"` });
      }

      if (!isString(edge.type) || !EDGE_TYPES.has(edge.type)) {
        errors.push({ path: `$.edges[${i}].type`, message: `invalid edge type: "${edge.type}"` });
      }
    }
  }

  return {
    valid: errors.length === 0,
    data: errors.length === 0 ? (raw as unknown as ArchitectureGraph) : null,
    errors,
  };
}

/**
 * Validate a PerformanceAnalysis JSON object.
 */
export function validatePerformanceAnalysis(raw: unknown): ValidationResult<PerformanceAnalysis> {
  const errors: ValidationError[] = [];

  if (!isObject(raw)) {
    return { valid: false, data: null, errors: [{ path: "$", message: "expected an object" }] };
  }

  if (!isString(raw.summary)) {
    errors.push({ path: "$.summary", message: "expected a string" });
  }

  if (!isArray(raw.findings)) {
    errors.push({ path: "$.findings", message: "expected an array" });
    return { valid: false, data: null, errors };
  }

  for (let i = 0; i < raw.findings.length; i++) {
    const f = raw.findings[i];
    if (!isObject(f)) {
      errors.push({ path: `$.findings[${i}]`, message: "expected an object" });
      continue;
    }

    if (!isString(f.title)) errors.push({ path: `$.findings[${i}].title`, message: "expected a string" });
    if (!isString(f.severity) || !SEVERITY_VALUES.has(f.severity)) {
      errors.push({ path: `$.findings[${i}].severity`, message: `invalid severity: "${f.severity}"` });
    }
    if (!isString(f.category) || !PERF_CATEGORIES.has(f.category)) {
      errors.push({ path: `$.findings[${i}].category`, message: `invalid category: "${f.category}"` });
    }
    if (!isString(f.description)) errors.push({ path: `$.findings[${i}].description`, message: "expected a string" });
    if (!isString(f.suggestion)) errors.push({ path: `$.findings[${i}].suggestion`, message: "expected a string" });
    if (!isString(f.effort) || !EFFORT_VALUES.has(f.effort)) {
      errors.push({ path: `$.findings[${i}].effort`, message: `invalid effort: "${f.effort}"` });
    }
    if (!isString(f.impact)) errors.push({ path: `$.findings[${i}].impact`, message: "expected a string" });

    if (!isArray(f.locations)) {
      errors.push({ path: `$.findings[${i}].locations`, message: "expected an array" });
    } else {
      for (let j = 0; j < f.locations.length; j++) {
        const loc = f.locations[j];
        if (!isObject(loc) || !isString(loc.file)) {
          errors.push({ path: `$.findings[${i}].locations[${j}].file`, message: "expected a string" });
        }
      }
    }
  }

  // Validate hotspot_graph if present
  if (raw.hotspot_graph !== undefined && raw.hotspot_graph !== null) {
    if (!isObject(raw.hotspot_graph)) {
      errors.push({ path: "$.hotspot_graph", message: "expected an object" });
    } else {
      const graph = raw.hotspot_graph as Record<string, unknown>;
      const graphNodeIds = new Set<string>();

      if (isArray(graph.nodes)) {
        for (let i = 0; i < graph.nodes.length; i++) {
          const n = graph.nodes[i];
          if (isObject(n) && isString(n.id)) graphNodeIds.add(n.id);
        }
      }

      if (isArray(graph.edges)) {
        for (let i = 0; i < graph.edges.length; i++) {
          const e = graph.edges[i];
          if (!isObject(e)) continue;
          if (isString(e.source) && !graphNodeIds.has(e.source)) {
            errors.push({ path: `$.hotspot_graph.edges[${i}].source`, message: `references unknown node: "${e.source}"` });
          }
          if (isString(e.target) && !graphNodeIds.has(e.target)) {
            errors.push({ path: `$.hotspot_graph.edges[${i}].target`, message: `references unknown node: "${e.target}"` });
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    data: errors.length === 0 ? (raw as unknown as PerformanceAnalysis) : null,
    errors,
  };
}

/**
 * Validate a SecurityAnalysis JSON object.
 */
export function validateSecurityAnalysis(raw: unknown): ValidationResult<SecurityAnalysis> {
  const errors: ValidationError[] = [];

  if (!isObject(raw)) {
    return { valid: false, data: null, errors: [{ path: "$", message: "expected an object" }] };
  }

  if (!isString(raw.summary)) {
    errors.push({ path: "$.summary", message: "expected a string" });
  }

  const validRiskScores = new Set(["critical", "high", "medium", "low", "clean"]);
  if (!isString(raw.risk_score) || !validRiskScores.has(raw.risk_score)) {
    errors.push({ path: "$.risk_score", message: `invalid risk_score: "${raw.risk_score}"` });
  }

  if (!isArray(raw.findings)) {
    errors.push({ path: "$.findings", message: "expected an array" });
    return { valid: false, data: null, errors };
  }

  for (let i = 0; i < raw.findings.length; i++) {
    const f = raw.findings[i];
    if (!isObject(f)) {
      errors.push({ path: `$.findings[${i}]`, message: "expected an object" });
      continue;
    }

    if (!isString(f.title)) errors.push({ path: `$.findings[${i}].title`, message: "expected a string" });
    if (!isString(f.severity) || !SEVERITY_VALUES.has(f.severity)) {
      errors.push({ path: `$.findings[${i}].severity`, message: `invalid severity: "${f.severity}"` });
    }
    if (!isString(f.category) || !SECURITY_CATEGORIES.has(f.category)) {
      errors.push({ path: `$.findings[${i}].category`, message: `invalid category: "${f.category}"` });
    }
    if (!isString(f.description)) errors.push({ path: `$.findings[${i}].description`, message: "expected a string" });
    if (!isString(f.exploitability)) errors.push({ path: `$.findings[${i}].exploitability`, message: "expected a string" });
    if (!isString(f.remediation)) errors.push({ path: `$.findings[${i}].remediation`, message: "expected a string" });
    if (!isString(f.effort) || !EFFORT_VALUES.has(f.effort)) {
      errors.push({ path: `$.findings[${i}].effort`, message: `invalid effort: "${f.effort}"` });
    }

    if (!isArray(f.locations)) {
      errors.push({ path: `$.findings[${i}].locations`, message: "expected an array" });
    } else {
      for (let j = 0; j < f.locations.length; j++) {
        const loc = f.locations[j];
        if (!isObject(loc) || !isString(loc.file)) {
          errors.push({ path: `$.findings[${i}].locations[${j}].file`, message: "expected a string" });
        }
      }
    }
  }

  // Validate attack_surface_graph if present
  if (raw.attack_surface_graph !== undefined && raw.attack_surface_graph !== null) {
    if (!isObject(raw.attack_surface_graph)) {
      errors.push({ path: "$.attack_surface_graph", message: "expected an object" });
    } else {
      const graph = raw.attack_surface_graph as Record<string, unknown>;
      const graphNodeIds = new Set<string>();

      if (isArray(graph.nodes)) {
        for (let i = 0; i < graph.nodes.length; i++) {
          const n = graph.nodes[i];
          if (isObject(n) && isString(n.id)) graphNodeIds.add(n.id);
        }
      }

      if (isArray(graph.edges)) {
        for (let i = 0; i < graph.edges.length; i++) {
          const e = graph.edges[i];
          if (!isObject(e)) continue;
          if (isString(e.source) && !graphNodeIds.has(e.source)) {
            errors.push({ path: `$.attack_surface_graph.edges[${i}].source`, message: `references unknown node: "${e.source}"` });
          }
          if (isString(e.target) && !graphNodeIds.has(e.target)) {
            errors.push({ path: `$.attack_surface_graph.edges[${i}].target`, message: `references unknown node: "${e.target}"` });
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    data: errors.length === 0 ? (raw as unknown as SecurityAnalysis) : null,
    errors,
  };
}

/**
 * Validate a DependencyMap JSON object.
 */
export function validateDependencyMap(raw: unknown): ValidationResult<DependencyMap> {
  const errors: ValidationError[] = [];

  if (!isObject(raw)) {
    return { valid: false, data: null, errors: [{ path: "$", message: "expected an object" }] };
  }

  // Validate internal
  if (!isObject(raw.internal)) {
    errors.push({ path: "$.internal", message: "expected an object" });
    return { valid: false, data: null, errors };
  }

  const internal = raw.internal as Record<string, unknown>;
  const internalNodeIds = new Set<string>();

  if (!isArray(internal.nodes)) {
    errors.push({ path: "$.internal.nodes", message: "expected an array" });
  } else {
    const validTypes = new Set(["binary", "library", "package", "config"]);
    for (let i = 0; i < internal.nodes.length; i++) {
      const n = internal.nodes[i];
      if (!isObject(n)) {
        errors.push({ path: `$.internal.nodes[${i}]`, message: "expected an object" });
        continue;
      }
      if (!isString(n.id)) {
        errors.push({ path: `$.internal.nodes[${i}].id`, message: "expected a string" });
      } else {
        if (internalNodeIds.has(n.id)) {
          errors.push({ path: `$.internal.nodes[${i}].id`, message: `duplicate: "${n.id}"` });
        }
        internalNodeIds.add(n.id);
      }
      if (!isString(n.label)) errors.push({ path: `$.internal.nodes[${i}].label`, message: "expected a string" });
      if (!isString(n.type) || !validTypes.has(n.type)) {
        errors.push({ path: `$.internal.nodes[${i}].type`, message: `invalid type: "${n.type}"` });
      }
      if (!isString(n.path)) errors.push({ path: `$.internal.nodes[${i}].path`, message: "expected a string" });
    }
  }

  if (!isArray(internal.edges)) {
    errors.push({ path: "$.internal.edges", message: "expected an array" });
  } else {
    for (let i = 0; i < internal.edges.length; i++) {
      const e = internal.edges[i];
      if (!isObject(e)) continue;
      if (isString(e.source) && !internalNodeIds.has(e.source)) {
        errors.push({ path: `$.internal.edges[${i}].source`, message: `references unknown node: "${e.source}"` });
      }
      if (isString(e.target) && !internalNodeIds.has(e.target)) {
        errors.push({ path: `$.internal.edges[${i}].target`, message: `references unknown node: "${e.target}"` });
      }
    }
  }

  // Validate external
  if (!isArray(raw.external)) {
    errors.push({ path: "$.external", message: "expected an array" });
  } else {
    for (let i = 0; i < raw.external.length; i++) {
      const dep = raw.external[i];
      if (!isObject(dep)) continue;
      if (isArray(dep.used_by)) {
        for (let j = 0; j < dep.used_by.length; j++) {
          const ref = dep.used_by[j];
          if (isString(ref) && !internalNodeIds.has(ref)) {
            errors.push({ path: `$.external[${i}].used_by[${j}]`, message: `references unknown internal node: "${ref}"` });
          }
        }
      }
    }
  }

  // Validate circular_dependencies
  if (!isArray(raw.circular_dependencies)) {
    errors.push({ path: "$.circular_dependencies", message: "expected an array" });
  }

  // Validate ipc_boundary
  if (!isObject(raw.ipc_boundary)) {
    errors.push({ path: "$.ipc_boundary", message: "expected an object" });
  } else {
    const ipc = raw.ipc_boundary as Record<string, unknown>;
    if (!isArray(ipc.commands)) {
      errors.push({ path: "$.ipc_boundary.commands", message: "expected an array" });
    }
  }

  return {
    valid: errors.length === 0,
    data: errors.length === 0 ? (raw as unknown as DependencyMap) : null,
    errors,
  };
}

// ============================================================================
// Dashboard summary computation
// ============================================================================

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0, high: 1, medium: 2, low: 3, info: 4,
};

/**
 * Compute a normalized dashboard card summary from any analysis output.
 */
export function computeCardSummary(
  presetType: "diagram" | "analysis" | "custom",
  presetName: string,
  data: AnalysisOutput,
): AnalysisCardSummary {
  // Architecture Graph
  if ("version" in data && "level" in data && "nodes" in data && "edges" in data) {
    const graph = data as ArchitectureGraph;
    return {
      node_count: graph.nodes.length,
      edge_count: graph.edges.length,
      group_count: graph.groups.length,
      finding_count: 0,
      by_severity: {},
      by_category: {},
      highest_finding_title: null,
      has_graph: true,
    };
  }

  // Dependency Map
  if ("internal" in data && "external" in data && "ipc_boundary" in data) {
    const depMap = data as DependencyMap;
    return {
      node_count: depMap.internal.nodes.length,
      edge_count: depMap.internal.edges.length,
      group_count: 0,
      finding_count: 0,
      by_severity: {},
      by_category: {},
      highest_finding_title: null,
      has_graph: true,
    };
  }

  // Findings-based presets (Performance, Security)
  if ("findings" in data && Array.isArray(data.findings)) {
    const findings = data.findings as Array<{ title: string; severity: string; category: string }>;

    const bySeverity: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    let highestTitle: string | null = null;
    let highestSeverityRank = Infinity;

    for (const f of findings) {
      bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
      byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;

      const rank = SEVERITY_ORDER[f.severity] ?? 99;
      if (rank < highestSeverityRank) {
        highestSeverityRank = rank;
        highestTitle = f.title;
      }
    }

    const hasGraph = ("hotspot_graph" in data && data.hotspot_graph != null)
      || ("attack_surface_graph" in data && data.attack_surface_graph != null);

    return {
      node_count: 0,
      edge_count: 0,
      group_count: 0,
      finding_count: findings.length,
      by_severity: bySeverity,
      by_category: byCategory,
      highest_finding_title: highestTitle,
      has_graph: hasGraph,
    };
  }

  // Fallback
  return {
    node_count: 0,
    edge_count: 0,
    group_count: 0,
    finding_count: 0,
    by_severity: {},
    by_category: {},
    highest_finding_title: null,
    has_graph: false,
  };
}

/**
 * Generate a stable finding ID from a preset name and finding title.
 * Uses a simple hash to produce F_{preset}_{8 hex chars}.
 */
export function generateFindingId(presetShortName: string, title: string): string {
  // Simple djb2 hash for browser compatibility (no crypto dependency needed)
  let hash = 5381;
  for (let i = 0; i < title.length; i++) {
    hash = ((hash << 5) + hash + title.charCodeAt(i)) >>> 0;
  }
  const hex = hash.toString(16).padStart(8, "0").slice(0, 8);
  return `F_${presetShortName.toLowerCase().replace(/[^a-z]/g, "")}_${hex}`;
}
