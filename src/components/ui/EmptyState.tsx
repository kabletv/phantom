import React from "react";

interface EmptyStateProps {
  /** Icon character or element displayed above the heading */
  icon?: React.ReactNode;
  /** Short heading describing the empty state */
  heading: string;
  /** One sentence of context or guidance */
  description: string;
  /** Primary call-to-action */
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Centered empty state with icon, heading, description, and optional CTA.
 * Used when a view or component has no data to display.
 */
export function EmptyState({ icon, heading, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "var(--space-10)",
        height: "100%",
        minHeight: "200px",
      }}
    >
      {icon && (
        <div
          style={{
            fontSize: "48px",
            lineHeight: 1,
            color: "var(--text-tertiary)",
            marginBottom: "var(--space-4)",
            userSelect: "none",
          }}
        >
          {icon}
        </div>
      )}
      <h2
        style={{
          fontSize: "14px",
          fontWeight: 600,
          lineHeight: "20px",
          color: "var(--text-secondary)",
          marginBottom: "var(--space-2)",
        }}
      >
        {heading}
      </h2>
      <p
        style={{
          fontSize: "13px",
          lineHeight: "20px",
          color: "var(--text-tertiary)",
          maxWidth: "320px",
        }}
      >
        {description}
      </p>
      {action && (
        <button
          className="btn-primary"
          onClick={action.onClick}
          style={{ marginTop: "var(--space-4)" }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
