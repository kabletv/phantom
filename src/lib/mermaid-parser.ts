/**
 * Parser for Mermaid graph syntax (graph TD, graph LR, etc).
 *
 * Extracts nodes, edges, and subgraphs into a simple AST representation.
 * Supports node definitions with labels, edge connections with optional labels,
 * and subgraph grouping.
 */

export interface MermaidNode {
  id: string;
  label: string;
  shape: "rect" | "round" | "stadium" | "diamond" | "circle" | "hex";
}

export interface MermaidEdge {
  source: string;
  target: string;
  label?: string;
  style: "solid" | "dotted" | "thick";
}

export interface MermaidSubgraph {
  id: string;
  label: string;
  nodeIds: string[];
}

export interface MermaidGraph {
  direction: "TD" | "LR" | "BT" | "RL";
  nodes: MermaidNode[];
  edges: MermaidEdge[];
  subgraphs: MermaidSubgraph[];
}

/**
 * Parse a mermaid graph definition string into a structured AST.
 */
export function parseMermaidGraph(input: string): MermaidGraph {
  const lines = input
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("%%"));

  const nodesMap = new Map<string, MermaidNode>();
  const edges: MermaidEdge[] = [];
  const subgraphs: MermaidSubgraph[] = [];
  let direction: MermaidGraph["direction"] = "TD";

  // Parse direction from the first line
  const headerMatch = lines[0]?.match(/^graph\s+(TD|LR|BT|RL|TB)\s*$/i);
  if (headerMatch) {
    const dir = headerMatch[1].toUpperCase();
    direction = dir === "TB" ? "TD" : (dir as MermaidGraph["direction"]);
  }

  // Track subgraph context
  let currentSubgraph: MermaidSubgraph | null = null;

  function ensureNode(id: string): void {
    if (!nodesMap.has(id)) {
      nodesMap.set(id, { id, label: id, shape: "rect" });
    }
    if (currentSubgraph && !currentSubgraph.nodeIds.includes(id)) {
      currentSubgraph.nodeIds.push(id);
    }
  }

  function parseNodeDef(text: string): { id: string; label: string; shape: MermaidNode["shape"] } | null {
    const patterns: Array<{ regex: RegExp; shape: MermaidNode["shape"] }> = [
      { regex: /^(\w+)\(\[(.+?)\]\)$/, shape: "stadium" },
      { regex: /^(\w+)\(\((.+?)\)\)$/, shape: "circle" },
      { regex: /^(\w+)\{\{(.+?)\}\}$/, shape: "hex" },
      { regex: /^(\w+)\{(.+?)\}$/, shape: "diamond" },
      { regex: /^(\w+)\((.+?)\)$/, shape: "round" },
      { regex: /^(\w+)\[(.+?)\]$/, shape: "rect" },
    ];

    for (const { regex, shape } of patterns) {
      const m = text.match(regex);
      if (m) {
        return { id: m[1], label: m[2].replace(/^["']|["']$/g, ""), shape };
      }
    }

    const plainMatch = text.match(/^(\w+)$/);
    if (plainMatch) {
      return { id: plainMatch[1], label: plainMatch[1], shape: "rect" };
    }

    return null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (i === 0 && headerMatch) continue;

    // Subgraph start
    const subgraphMatch = line.match(/^subgraph\s+(\w+)\s*(?:\[(.+?)\])?$/);
    if (subgraphMatch) {
      currentSubgraph = {
        id: subgraphMatch[1],
        label: subgraphMatch[2]?.replace(/^["']|["']$/g, "") || subgraphMatch[1],
        nodeIds: [],
      };
      continue;
    }

    if (line === "end") {
      if (currentSubgraph) {
        subgraphs.push(currentSubgraph);
        currentSubgraph = null;
      }
      continue;
    }

    // Labeled edge patterns
    const edgePatterns = [
      /^(.+?)\s*-->\s*\|(.+?)\|\s*(.+)$/,
      /^(.+?)\s*--\s*(.+?)\s*-->\s*(.+)$/,
      /^(.+?)\s*-\.\s*->\s*\|(.+?)\|\s*(.+)$/,
      /^(.+?)\s*==>\s*\|(.+?)\|\s*(.+)$/,
    ];

    const arrowOnlyPatterns = [
      { regex: /^(.+?)\s*-->\s*(.+)$/, style: "solid" as const },
      { regex: /^(.+?)\s*-\.\s*->\s*(.+)$/, style: "dotted" as const },
      { regex: /^(.+?)\s*==>\s*(.+)$/, style: "thick" as const },
    ];

    let matched = false;

    for (const pattern of edgePatterns) {
      const m = line.match(pattern);
      if (m) {
        const sourceDef = parseNodeDef(m[1].trim());
        const targetDef = parseNodeDef(m[3].trim());
        if (sourceDef && targetDef) {
          nodesMap.set(sourceDef.id, { id: sourceDef.id, label: sourceDef.label, shape: sourceDef.shape });
          nodesMap.set(targetDef.id, { id: targetDef.id, label: targetDef.label, shape: targetDef.shape });
          ensureNode(sourceDef.id);
          ensureNode(targetDef.id);
          const style = line.includes("-.->") ? "dotted" : line.includes("==>") ? "thick" : "solid";
          edges.push({ source: sourceDef.id, target: targetDef.id, label: m[2].trim(), style });
          matched = true;
          break;
        }
      }
    }

    if (matched) continue;

    for (const { regex, style } of arrowOnlyPatterns) {
      const m = line.match(regex);
      if (m) {
        const sourceDef = parseNodeDef(m[1].trim());
        const targetDef = parseNodeDef(m[2].trim());
        if (sourceDef && targetDef) {
          nodesMap.set(sourceDef.id, { id: sourceDef.id, label: sourceDef.label, shape: sourceDef.shape });
          nodesMap.set(targetDef.id, { id: targetDef.id, label: targetDef.label, shape: targetDef.shape });
          ensureNode(sourceDef.id);
          ensureNode(targetDef.id);
          edges.push({ source: sourceDef.id, target: targetDef.id, style });
          matched = true;
          break;
        }
      }
    }

    if (matched) continue;

    const nodeDef = parseNodeDef(line);
    if (nodeDef) {
      nodesMap.set(nodeDef.id, { id: nodeDef.id, label: nodeDef.label, shape: nodeDef.shape });
      ensureNode(nodeDef.id);
    }
  }

  return {
    direction,
    nodes: Array.from(nodesMap.values()),
    edges,
    subgraphs,
  };
}

/**
 * Extract mermaid code blocks from raw text (e.g., AI output).
 */
export function extractMermaidBlocks(text: string): string[] {
  const blocks: string[] = [];
  const regex = /```mermaid\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}
