import React from "react";

interface SkeletonProps {
  /** Width (CSS value). Defaults to "100%" */
  width?: string;
  /** Height (CSS value). Defaults to "16px" */
  height?: string;
  /** Border radius (CSS value). Defaults to --radius-md */
  borderRadius?: string;
  /** Additional inline styles */
  style?: React.CSSProperties;
}

/**
 * Generic skeleton loader with shimmer animation.
 * Use for content placeholders while data loads.
 */
export function Skeleton({
  width = "100%",
  height = "16px",
  borderRadius = "var(--radius-md)",
  style,
}: SkeletonProps) {
  return (
    <div
      aria-hidden
      style={{
        width,
        height,
        borderRadius,
        background:
          "linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-surface) 50%, var(--bg-elevated) 75%)",
        backgroundSize: "200% 100%",
        animation: "skeleton-shimmer 1.5s linear infinite",
        ...style,
      }}
    />
  );
}

/**
 * Skeleton shaped like a dashboard analysis card.
 */
export function SkeletonCard() {
  return (
    <div
      aria-hidden
      style={{
        padding: "var(--space-4)",
        borderRadius: "var(--radius-lg)",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Skeleton width="120px" height="14px" />
        <Skeleton width="64px" height="20px" borderRadius="var(--radius-full)" />
      </div>
      {/* Timestamp */}
      <Skeleton width="96px" height="11px" />
      {/* Body lines */}
      <Skeleton width="100%" height="13px" />
      <Skeleton width="80%" height="13px" />
    </div>
  );
}

/**
 * Skeleton for a list of items (e.g. branch list, preset list).
 */
export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div
      aria-hidden
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}
    >
      {Array.from({ length: count }, (_, i) => (
        <Skeleton
          key={i}
          width={`${60 + Math.random() * 30}%`}
          height="20px"
          borderRadius="var(--radius-sm)"
        />
      ))}
    </div>
  );
}
