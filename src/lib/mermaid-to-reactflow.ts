/**
 * Converts parsed Mermaid graph AST into React Flow nodes and edges
 * with automatic layout using dagre.
 */

import dagre from "dagre";
import type { Node, Edge } from "@xyflow/react";
import type { MermaidGraph, MermaidNode } from "./mermaid-parser";

const NODE_WIDTH = 180;
const NODE_HEIGHT = 50;

export interface ConvertOptions {
  /** Node type string to assign to React Flow nodes. Defaults to "default". */
  nodeType?: string;
  /** Additional data to merge into each node's data object. */
  extraData?: Record<string, unknown>;
}

/**
 * Convert a MermaidGraph AST into React Flow nodes and edges with dagre layout.
 */
export function mermaidToReactFlow(
  graph: MermaidGraph,
  options?: ConvertOptions,
): { nodes: Node[]; edges: Edge[] } {
  const nodeType = options?.nodeType ?? "default";
  const extraData = options?.extraData ?? {};

  // Build a dagre graph for auto-layout
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: graph.direction === "LR" || graph.direction === "RL" ? "LR" : "TB",
    nodesep: 60,
    ranksep: 80,
    edgesep: 20,
  });

  // Map subgraph membership
  const nodeToSubgraph = new Map<string, string>();
  for (const sg of graph.subgraphs) {
    for (const nodeId of sg.nodeIds) {
      nodeToSubgraph.set(nodeId, sg.id);
    }
  }

  // Add nodes to dagre
  for (const node of graph.nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  // Add edges to dagre
  for (const edge of graph.edges) {
    g.setEdge(edge.source, edge.target);
  }

  // Run layout
  dagre.layout(g);

  // Convert to React Flow nodes
  const nodes: Node[] = graph.nodes.map((mNode) => {
    const dagreNode = g.node(mNode.id);
    return {
      id: mNode.id,
      type: nodeType,
      position: {
        x: dagreNode.x - NODE_WIDTH / 2,
        y: dagreNode.y - NODE_HEIGHT / 2,
      },
      data: {
        label: mNode.label,
        shape: mNode.shape,
        subgraph: nodeToSubgraph.get(mNode.id),
        ...extraData,
      },
    };
  });

  // Convert to React Flow edges
  const edges: Edge[] = graph.edges.map((mEdge, i) => {
    const edge: Edge = {
      id: `e-${mEdge.source}-${mEdge.target}-${i}`,
      source: mEdge.source,
      target: mEdge.target,
    };

    if (mEdge.label) {
      edge.label = mEdge.label;
    }

    if (mEdge.style === "dotted") {
      edge.style = { strokeDasharray: "5,5" };
    } else if (mEdge.style === "thick") {
      edge.style = { strokeWidth: 3 };
    }

    return edge;
  });

  return { nodes, edges };
}

/**
 * Map mermaid node shapes to React Flow visual hints.
 * Used by custom node renderers to pick the right visual style.
 */
export function shapeToStyle(shape: MermaidNode["shape"]): React.CSSProperties {
  switch (shape) {
    case "round":
      return { borderRadius: "8px" };
    case "stadium":
      return { borderRadius: "25px" };
    case "diamond":
      return { transform: "rotate(45deg)", borderRadius: "4px" };
    case "circle":
      return { borderRadius: "50%", width: "60px", height: "60px" };
    case "hex":
      return { clipPath: "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)" };
    case "rect":
    default:
      return { borderRadius: "4px" };
  }
}
