import React, { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { NodeType, DiffStatus } from "../lib/graph-types";

interface ArchitectureNodeData {
  label: string;
  nodeType: NodeType;
  drillable: boolean;
  description?: string;
  path?: string;
  file?: string;
  line?: number;
  signature?: string;
  returnType?: string;
  groupId?: string;
  groupLabel?: string;
  diffStatus?: DiffStatus;
  level?: number;
  [key: string]: unknown;
}

/** Border colors by diff status. */
const DIFF_BORDER: Record<DiffStatus, string> = {
  added: "var(--status-success)",
  removed: "var(--status-error)",
  modified: "var(--status-warning)",
  unchanged: "var(--border-strong)",
};

const DIFF_BG: Record<DiffStatus, string> = {
  added: "rgba(61, 214, 140, 0.06)",
  removed: "rgba(242, 95, 92, 0.06)",
  modified: "rgba(240, 192, 64, 0.06)",
  unchanged: "var(--bg-surface)",
};

/** Icon/badge for node types. */
const NODE_TYPE_LABELS: Partial<Record<NodeType, { short: string; color: string }>> = {
  service:          { short: "SVC",  color: "var(--accent)" },
  library:          { short: "LIB",  color: "#a78bfa" },
  frontend:         { short: "UI",   color: "var(--status-success)" },
  external:         { short: "EXT",  color: "var(--text-tertiary)" },
  database:         { short: "DB",   color: "var(--status-warning)" },
  module:           { short: "MOD",  color: "var(--accent)" },
  type:             { short: "TYPE", color: "#a78bfa" },
  layer:            { short: "LYR",  color: "var(--text-secondary)" },
  trait:            { short: "TRT",  color: "#f472b6" },
  interface:        { short: "IFC",  color: "#f472b6" },
  function:         { short: "fn",   color: "var(--accent)" },
  method:           { short: "fn",   color: "var(--accent)" },
  async_boundary:   { short: "ASY",  color: "var(--status-warning)" },
  decision:         { short: "?",    color: "var(--status-warning)" },
  data_transform:   { short: "DT",   color: "#a78bfa" },
  error_path:       { short: "ERR",  color: "var(--status-error)" },
};

/** Shape styling based on node type. */
function getNodeShape(nodeType: NodeType): React.CSSProperties {
  switch (nodeType) {
    case "decision":
      return { borderRadius: "2px", transform: "rotate(0deg)", minWidth: "120px" };
    case "async_boundary":
      return { borderRadius: "var(--radius-full)", minWidth: "140px" };
    case "error_path":
      return { borderRadius: "var(--radius-md)", borderStyle: "dashed" };
    case "database":
      return { borderRadius: "var(--radius-sm)", minWidth: "140px" };
    case "external":
      return { borderRadius: "var(--radius-md)", borderStyle: "dashed", opacity: 0.85 };
    case "frontend":
      return { borderRadius: "var(--radius-lg)", minWidth: "140px" };
    default:
      return { borderRadius: "var(--radius-md)", minWidth: "140px" };
  }
}

function ArchitectureNodeComponent({ data }: NodeProps) {
  const d = data as ArchitectureNodeData;
  const [showTooltip, setShowTooltip] = useState(false);
  const diffStatus: DiffStatus = d.diffStatus ?? "unchanged";
  const isRemoved = diffStatus === "removed";
  const typeMeta = NODE_TYPE_LABELS[d.nodeType];
  const shapeStyle = getNodeShape(d.nodeType);
  const isLR = d.level === 3;

  return (
    <div
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      style={{
        position: "relative",
        padding: "8px 12px",
        background: DIFF_BG[diffStatus],
        border: `1.5px solid ${DIFF_BORDER[diffStatus]}`,
        borderLeft: diffStatus !== "unchanged" ? `3px solid ${DIFF_BORDER[diffStatus]}` : undefined,
        color: "var(--text-primary)",
        fontSize: "13px",
        fontWeight: 500,
        textAlign: "center",
        cursor: d.drillable ? "pointer" : "default",
        maxWidth: "260px",
        opacity: isRemoved ? 0.5 : 1,
        transition: "border-color 120ms ease-out, box-shadow 120ms ease-out",
        ...shapeStyle,
      }}
    >
      <Handle
        type="target"
        position={isLR ? Position.Left : Position.Top}
        style={{ background: "var(--accent)", width: 6, height: 6 }}
      />

      {/* Type badge */}
      {typeMeta && (
        <div style={{
          position: "absolute",
          top: "-8px",
          right: "8px",
          fontSize: "9px",
          fontWeight: 600,
          color: typeMeta.color,
          background: "var(--bg-base)",
          padding: "0 4px",
          borderRadius: "var(--radius-sm)",
          border: `1px solid ${typeMeta.color}`,
          lineHeight: "14px",
          letterSpacing: "0.03em",
        }}>
          {typeMeta.short}
        </div>
      )}

      {/* Label */}
      <div style={{ lineHeight: "18px" }}>{d.label}</div>

      {/* Group label */}
      {d.groupLabel && (
        <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "1px" }}>
          {d.groupLabel}
        </div>
      )}

      {/* Drillable indicator */}
      {d.drillable && (
        <div style={{
          fontSize: "9px",
          color: "var(--text-tertiary)",
          marginTop: "2px",
          letterSpacing: "0.05em",
        }}>
          Click to explore
        </div>
      )}

      <Handle
        type="source"
        position={isLR ? Position.Right : Position.Bottom}
        style={{ background: "var(--accent)", width: 6, height: 6 }}
      />

      {/* Tooltip */}
      {showTooltip && d.description && (
        <div style={{
          position: "absolute",
          bottom: "calc(100% + 8px)",
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-md)",
          padding: "8px 12px",
          fontSize: "12px",
          color: "var(--text-secondary)",
          lineHeight: "18px",
          maxWidth: "320px",
          minWidth: "180px",
          whiteSpace: "normal",
          textAlign: "left",
          zIndex: 100,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          pointerEvents: "none",
        }}>
          <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
            {d.label}
          </div>
          {d.nodeType && (
            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "4px" }}>
              Type: {d.nodeType.replace(/_/g, " ")}
            </div>
          )}
          <div>{d.description}</div>
          {d.path && (
            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>
              Path: {d.path}
            </div>
          )}
          {d.file && (
            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>
              File: {d.file}{d.line != null ? `:${d.line}` : ""}
            </div>
          )}
          {d.signature && (
            <div style={{
              fontSize: "11px",
              color: "var(--accent)",
              marginTop: "4px",
              fontFamily: "monospace",
            }}>
              {d.signature}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const DiagramNode = memo(ArchitectureNodeComponent);
