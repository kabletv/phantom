/**
 * TypeScript type definitions for the ArchitectureGraph JSON schema.
 *
 * This is the source-of-truth schema for all diagram data. AI outputs JSON
 * matching this schema, stored in the `parsed_graph` column of the analyses table.
 * The frontend converts this directly to React Flow nodes/edges.
 */

// === Node Types by Level ===

export type NodeType =
  // Level 1 - System Architecture
  | "service" | "library" | "frontend" | "external" | "database"
  // Level 2 - Service Internals
  | "module" | "type" | "layer" | "trait" | "interface"
  // Level 3 - Logic Flow
  | "function" | "method" | "async_boundary" | "decision" | "data_transform" | "error_path";

export type EdgeType = "dependency" | "dataflow" | "call" | "ownership" | "ipc" | "control_flow";

// === Graph Schema ===

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  group?: string;
  metadata?: {
    path?: string;
    file?: string;
    line?: number;
    description?: string;
    drillable?: boolean;
    signature?: string;
    return_type?: string;
  };
}

export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
  type: EdgeType;
  metadata?: {
    condition?: string;
    data_type?: string;
    protocol?: string;
  };
}

export interface GraphGroup {
  id: string;
  label: string;
  description?: string;
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

// === Diff (computed by Rust backend) ===

export type NodeChange =
  | { kind: "label_changed"; old: string; new: string }
  | { kind: "type_changed"; old: string; new: string }
  | { kind: "group_changed"; old: string | null; new: string | null }
  | { kind: "edges_changed" };

export interface GraphDiff {
  added_nodes: string[];
  removed_nodes: string[];
  modified_nodes: { id: string; changes: NodeChange[] }[];
  added_edges: { source: string; target: string; label?: string; edge_type: string }[];
  removed_edges: { source: string; target: string; label?: string; edge_type: string }[];
}

// === Drill-Down Navigation ===

export interface DrillDownState {
  path: { nodeId: string; label: string; level: number }[];
  currentLevel: 1 | 2 | 3;
  currentTargetNode: string | null;
}

// === Findings ===

export interface Finding {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  description: string;
  locations: { file: string; line_start?: number; line_end?: number; snippet?: string }[];
  suggestion: string;
  effort: "trivial" | "small" | "medium" | "large";
}

export interface AnalysisFindings {
  version: 1;
  summary: string;
  stats: {
    total: number;
    by_severity: Record<string, number>;
    by_category: Record<string, number>;
  };
  findings: Finding[];
}

// === Diff status for React Flow node data ===

export type DiffStatus = "added" | "removed" | "modified" | "unchanged";
