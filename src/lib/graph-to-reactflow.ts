/**
 * Converts ArchitectureGraph JSON directly to React Flow nodes and edges.
 *
 * This is the primary diagram pipeline: AI -> JSON -> React Flow.
 * Mermaid is never parsed; it can optionally be generated from JSON for export.
 */

import dagre from "dagre";
import type { Node, Edge, MarkerType } from "@xyflow/react";
import type {
  ArchitectureGraph,
  GraphNode,
  GraphEdge,
  GraphDiff,
  DiffStatus,
  NodeType,
  EdgeType,
} from "./graph-types";

// Layout constants
const NODE_WIDTH = 200;
const NODE_HEIGHT = 60;
const LEVEL3_NODE_WIDTH = 220;
const LEVEL3_NODE_HEIGHT = 50;

/** Visual config for each edge type per the design doc. */
const EDGE_STYLES: Record<EdgeType, {
  stroke: string;
  strokeDasharray?: string;
  strokeWidth: number;
  animated?: boolean;
}> = {
  dependency:    { stroke: "var(--text-tertiary)",    strokeWidth: 1.5 },
  dataflow:      { stroke: "var(--accent)",           strokeWidth: 2.5 },
  call:          { stroke: "var(--status-success)",   strokeWidth: 1.5, strokeDasharray: "6,4" },
  ownership:     { stroke: "#a78bfa",                 strokeWidth: 1.5 },
  ipc:           { stroke: "var(--status-warning)",   strokeWidth: 2.5, strokeDasharray: "3,3" },
  control_flow:  { stroke: "var(--text-tertiary)",    strokeWidth: 1.5, strokeDasharray: "6,4" },
};

/** Compute diff status for a given node ID. */
function getDiffStatus(nodeId: string, diff?: GraphDiff): DiffStatus {
  if (!diff) return "unchanged";
  if (diff.added_nodes.includes(nodeId)) return "added";
  if (diff.removed_nodes.includes(nodeId)) return "removed";
  if (diff.modified_nodes.some((m) => m.id === nodeId)) return "modified";
  return "unchanged";
}

/** Check if an edge is removed in the diff. */
function isEdgeRemoved(source: string, target: string, diff?: GraphDiff): boolean {
  if (!diff) return false;
  return diff.removed_edges.some((e) => e.source === source && e.target === target);
}

/** Check if an edge is added in the diff. */
function isEdgeAdded(source: string, target: string, diff?: GraphDiff): boolean {
  if (!diff) return false;
  return diff.added_edges.some((e) => e.source === source && e.target === target);
}

/**
 * Convert an ArchitectureGraph to React Flow nodes and edges with dagre layout.
 *
 * @param graph - The ArchitectureGraph JSON from the analysis
 * @param diff - Optional diff data for branch comparison annotations
 * @returns React Flow compatible nodes and edges
 */
export function graphToReactFlow(
  graph: ArchitectureGraph,
  diff?: GraphDiff,
): { nodes: Node[]; edges: Edge[] } {
  const isLR = graph.direction === "left-right";
  const nodeW = graph.level === 3 ? LEVEL3_NODE_WIDTH : NODE_WIDTH;
  const nodeH = graph.level === 3 ? LEVEL3_NODE_HEIGHT : NODE_HEIGHT;

  // Build dagre graph for auto-layout
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: isLR ? "LR" : "TB",
    nodesep: 60,
    ranksep: 80,
    edgesep: 20,
  });

  // Build group membership map
  const nodeToGroup = new Map<string, string>();
  for (const node of graph.nodes) {
    if (node.group) {
      nodeToGroup.set(node.id, node.group);
    }
  }

  // Build group label map
  const groupLabels = new Map<string, string>();
  for (const group of graph.groups) {
    groupLabels.set(group.id, group.label);
  }

  // Collect all node IDs from the graph
  const graphNodeIds = new Set(graph.nodes.map((n) => n.id));

  // If we have a diff with removed nodes, we need ghost nodes for them
  const removedNodeIds = diff?.removed_nodes.filter((id) => !graphNodeIds.has(id)) ?? [];

  // Add all graph nodes to dagre
  for (const node of graph.nodes) {
    g.setNode(node.id, { width: nodeW, height: nodeH });
  }

  // Add ghost nodes for removed nodes (so layout still includes them)
  for (const id of removedNodeIds) {
    g.setNode(id, { width: nodeW, height: nodeH });
  }

  // Add edges to dagre
  for (const edge of graph.edges) {
    g.setEdge(edge.source, edge.target);
  }

  // Add removed edges back for layout continuity
  if (diff) {
    for (const re of diff.removed_edges) {
      if ((graphNodeIds.has(re.source) || removedNodeIds.includes(re.source)) &&
          (graphNodeIds.has(re.target) || removedNodeIds.includes(re.target))) {
        if (!g.hasEdge(re.source, re.target)) {
          g.setEdge(re.source, re.target);
        }
      }
    }
  }

  // Run dagre layout
  dagre.layout(g);

  // Convert graph nodes to React Flow nodes
  const nodes: Node[] = graph.nodes.map((gNode) => {
    const dagreNode = g.node(gNode.id);
    const diffStatus = getDiffStatus(gNode.id, diff);
    const groupId = nodeToGroup.get(gNode.id);

    return {
      id: gNode.id,
      type: "architectureNode",
      position: {
        x: dagreNode.x - nodeW / 2,
        y: dagreNode.y - nodeH / 2,
      },
      data: {
        label: gNode.label,
        nodeType: gNode.type,
        drillable: gNode.metadata?.drillable ?? false,
        description: gNode.metadata?.description,
        path: gNode.metadata?.path,
        file: gNode.metadata?.file,
        line: gNode.metadata?.line,
        signature: gNode.metadata?.signature,
        returnType: gNode.metadata?.return_type,
        groupId,
        groupLabel: groupId ? groupLabels.get(groupId) : undefined,
        diffStatus,
        level: graph.level,
      },
    };
  });

  // Add ghost nodes for removed items
  for (const id of removedNodeIds) {
    const dagreNode = g.node(id);
    if (dagreNode) {
      nodes.push({
        id,
        type: "architectureNode",
        position: {
          x: dagreNode.x - nodeW / 2,
          y: dagreNode.y - nodeH / 2,
        },
        data: {
          label: id.replace(/^L\d_/, "").replace(/_/g, " "),
          nodeType: "external" as NodeType,
          drillable: false,
          diffStatus: "removed" as DiffStatus,
          level: graph.level,
        },
      });
    }
  }

  // Convert graph edges to React Flow edges
  const edges: Edge[] = graph.edges.map((gEdge, i) => {
    const edgeStyle = EDGE_STYLES[gEdge.type] ?? EDGE_STYLES.dependency;
    const added = isEdgeAdded(gEdge.source, gEdge.target, diff);
    const removed = isEdgeRemoved(gEdge.source, gEdge.target, diff);

    const style: Record<string, string | number> = {
      stroke: edgeStyle.stroke,
      strokeWidth: edgeStyle.strokeWidth,
    };
    if (edgeStyle.strokeDasharray) {
      style.strokeDasharray = edgeStyle.strokeDasharray;
    }

    // Override colors for diff
    if (added) {
      style.stroke = "var(--status-success)";
    } else if (removed) {
      style.stroke = "var(--status-error)";
      style.opacity = 0.5;
      style.strokeDasharray = "4,4";
    }

    const edge: Edge = {
      id: `e-${gEdge.source}-${gEdge.target}-${i}`,
      source: gEdge.source,
      target: gEdge.target,
      style,
      animated: edgeStyle.animated ?? false,
      markerEnd: gEdge.type === "ownership"
        ? { type: "arrow" as MarkerType, color: edgeStyle.stroke }
        : { type: "arrowclosed" as MarkerType, color: edgeStyle.stroke },
    };

    // Build label from edge label + metadata
    const labelParts: string[] = [];
    if (gEdge.label) labelParts.push(gEdge.label);
    if (gEdge.metadata?.protocol) labelParts.push(`[${gEdge.metadata.protocol}]`);
    if (gEdge.metadata?.data_type) labelParts.push(`(${gEdge.metadata.data_type})`);
    if (gEdge.metadata?.condition) labelParts.push(`{${gEdge.metadata.condition}}`);

    if (labelParts.length > 0) {
      edge.label = labelParts.join(" ");
      edge.labelStyle = { fontSize: 11, fill: "var(--text-secondary)" };
      edge.labelBgStyle = { fill: "var(--bg-base)", fillOpacity: 0.85 };
      edge.labelBgPadding = [4, 2] as [number, number];
    }

    return edge;
  });

  // Add removed edges as ghost edges
  if (diff) {
    for (const re of diff.removed_edges) {
      const alreadyPresent = graph.edges.some(
        (e) => e.source === re.source && e.target === re.target,
      );
      if (!alreadyPresent) {
        edges.push({
          id: `e-removed-${re.source}-${re.target}`,
          source: re.source,
          target: re.target,
          style: {
            stroke: "var(--status-error)",
            strokeWidth: 1.5,
            strokeDasharray: "4,4",
            opacity: 0.4,
          },
          animated: false,
          label: re.label,
          labelStyle: { fontSize: 11, fill: "var(--status-error)", opacity: 0.6 },
        });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Parse an ArchitectureGraph from a JSON string.
 * Returns null if parsing fails.
 */
export function parseArchitectureGraph(json: string): ArchitectureGraph | null {
  try {
    const parsed = JSON.parse(json);
    if (parsed && parsed.version === 1 && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
      return parsed as ArchitectureGraph;
    }
    return null;
  } catch {
    return null;
  }
}
