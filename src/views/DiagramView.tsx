import React, { useEffect, useState, useCallback } from "react";
import type { Node, Edge } from "@xyflow/react";
import { api, type AnalysisResult } from "../lib/api";
import { useWorkspace } from "../stores/workspace";
import { graphToReactFlow, parseArchitectureGraph } from "../lib/graph-to-reactflow";
import type { ArchitectureGraph, GraphDiff } from "../lib/graph-types";
import { DiagramCanvas } from "../components/DiagramCanvas";
import { Breadcrumb } from "../components/Breadcrumb";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { toast } from "../components/ui/Toast";
import { useNavigate } from "react-router-dom";

interface DrillLevel {
  label: string;
  nodeId: string | null;
  level: 1 | 2 | 3;
  nodes: Node[];
  edges: Edge[];
  graph: ArchitectureGraph;
}

export function DiagramView() {
  const selectedBranch = useWorkspace((s) => s.selectedBranch);
  const navigate = useNavigate();
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [levels, setLevels] = useState<DrillLevel[]>([]);
  const [showDiff, setShowDiff] = useState(false);
  const [diff, setDiff] = useState<GraphDiff | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch analyses for the selected branch
  useEffect(() => {
    if (selectedBranch) {
      api.listAnalyses(selectedBranch)
        .then(setAnalyses)
        .catch((e: unknown) => {
          setAnalyses([]);
          toast.error(e instanceof Error ? e.message : "Failed to load diagram data");
        });
    }
  }, [selectedBranch]);

  // Find the latest completed diagram analysis (Level 1)
  const diagramAnalysis = analyses.find(
    (a) => a.status === "completed" && a.parsed_graph && a.level === 1,
  ) ?? analyses.find(
    (a) => a.status === "completed" && a.parsed_graph,
  );

  // Build the root level from the diagram analysis
  useEffect(() => {
    if (!diagramAnalysis) {
      setLevels([]);
      return;
    }

    // JSON-first: parsed_graph contains ArchitectureGraph JSON
    const graphJson = diagramAnalysis.parsed_graph;
    if (!graphJson) {
      setLevels([]);
      return;
    }

    const graph = parseArchitectureGraph(graphJson);
    if (!graph) {
      setLevels([]);
      return;
    }

    const { nodes, edges } = graphToReactFlow(graph, showDiff ? (diff ?? undefined) : undefined);
    setLevels([{
      label: "System Architecture",
      nodeId: null,
      level: graph.level as 1 | 2 | 3,
      nodes,
      edges,
      graph,
    }]);
  }, [diagramAnalysis?.parsed_graph, diagramAnalysis?.id, showDiff, diff]);

  // Handle drill-down when clicking a node
  const handleNodeClick = useCallback(
    async (nodeId: string) => {
      const currentLevel = levels[levels.length - 1];
      if (!currentLevel || !diagramAnalysis) return;

      // Find the clicked node in the current graph
      const clickedNode = currentLevel.graph.nodes.find((n) => n.id === nodeId);
      if (!clickedNode?.metadata?.drillable) return;

      // Determine the next level
      const nextLevel = (currentLevel.level + 1) as 1 | 2 | 3;
      if (nextLevel > 3) return;

      setLoading(true);
      try {
        // Run analysis with drill-down params (backend handles caching)
        const analysisId = await api.runAnalysis(
          diagramAnalysis.preset_id,
          selectedBranch,
          nextLevel,
          nodeId,
        );

        // Poll for the result
        let drillResult: AnalysisResult | null = null;
        for (let i = 0; i < 30; i++) {
          drillResult = await api.getAnalysis(analysisId);
          if (drillResult?.status === "completed" || drillResult?.status === "failed") break;
          await new Promise((r) => setTimeout(r, 2000));
        }

        if (drillResult?.parsed_graph) {
          const graph = parseArchitectureGraph(drillResult.parsed_graph);
          if (graph) {
            const { nodes, edges } = graphToReactFlow(graph);
            setLevels((prev) => [
              ...prev,
              {
                label: clickedNode.label,
                nodeId,
                level: nextLevel,
                nodes,
                edges,
                graph,
              },
            ]);
          }
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load drill-down");
      } finally {
        setLoading(false);
      }
    },
    [levels, diagramAnalysis, selectedBranch],
  );

  // Navigate back via breadcrumb
  const handleBreadcrumbNavigate = useCallback(
    (id: string) => {
      const index = levels.findIndex((l) => (l.nodeId ?? "root") === id);
      if (index >= 0) {
        setLevels(levels.slice(0, index + 1));
      }
    },
    [levels],
  );

  const currentLevel = levels[levels.length - 1];

  if (!diagramAnalysis) {
    return (
      <ErrorBoundary label="Diagram Viewer">
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <EmptyState
            icon="~"
            heading="No diagrams yet"
            description="Run an architecture analysis to visualize your codebase as an interactive diagram."
            action={{ label: "Go to Dashboard", onClick: () => navigate("/dashboard") }}
          />
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary label="Diagram Viewer">
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
        {/* Toolbar */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          height: "36px",
          padding: "0 var(--space-4)",
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border-default)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <Breadcrumb
              items={levels.map((l) => ({
                label: l.label,
                id: l.nodeId ?? "root",
              }))}
              onNavigate={handleBreadcrumbNavigate}
            />
            {loading && (
              <span style={{
                fontSize: "11px",
                color: "var(--text-tertiary)",
                fontStyle: "italic",
              }}>
                Loading...
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            {/* Diff toggle */}
            <div style={{
              display: "flex",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)",
              overflow: "hidden",
              fontSize: "12px",
            }}>
              <button
                onClick={() => setShowDiff(false)}
                style={{
                  padding: "2px 10px",
                  background: !showDiff ? "var(--accent)" : "transparent",
                  color: !showDiff ? "var(--bg-base)" : "var(--text-secondary)",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                Clean
              </button>
              <button
                onClick={() => setShowDiff(true)}
                style={{
                  padding: "2px 10px",
                  background: showDiff ? "var(--accent)" : "transparent",
                  color: showDiff ? "var(--bg-base)" : "var(--text-secondary)",
                  border: "none",
                  borderLeft: "1px solid var(--border-default)",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                Diff vs main
              </button>
            </div>

            {/* Level indicator */}
            {currentLevel && (
              <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                L{currentLevel.level}
              </span>
            )}
          </div>
        </div>

        {/* Diff summary bar */}
        {showDiff && diff && (
          <div style={{
            padding: "4px var(--space-4)",
            background: "var(--bg-surface)",
            borderBottom: "1px solid var(--border-default)",
            fontSize: "12px",
            color: "var(--text-secondary)",
            display: "flex",
            gap: "var(--space-3)",
          }}>
            {diff.added_nodes.length > 0 && (
              <span style={{ color: "var(--status-success)" }}>
                +{diff.added_nodes.length} added
              </span>
            )}
            {diff.removed_nodes.length > 0 && (
              <span style={{ color: "var(--status-error)" }}>
                -{diff.removed_nodes.length} removed
              </span>
            )}
            {diff.modified_nodes.length > 0 && (
              <span style={{ color: "var(--status-warning)" }}>
                ~{diff.modified_nodes.length} modified
              </span>
            )}
          </div>
        )}

        {/* Diagram canvas */}
        {currentLevel ? (
          <DiagramCanvas
            nodes={currentLevel.nodes}
            edges={currentLevel.edges}
            onNodeClick={handleNodeClick}
          />
        ) : (
          <EmptyState
            icon="~"
            heading="No diagram data available"
            description="The analysis did not produce diagram data."
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
