import React from "react";

interface BreadcrumbProps {
  items: Array<{ label: string; id: string }>;
  onNavigate: (id: string) => void;
}

export function Breadcrumb({ items, onNavigate }: BreadcrumbProps) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "var(--space-1)",
      fontSize: "13px",
      color: "var(--text-secondary)",
    }}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <React.Fragment key={item.id}>
            {i > 0 && (
              <span style={{
                margin: "0 var(--space-1)",
                color: "var(--text-tertiary)",
                fontSize: "10px",
              }}>
                /
              </span>
            )}
            <span
              onClick={() => !isLast && onNavigate(item.id)}
              role={isLast ? undefined : "button"}
              tabIndex={isLast ? undefined : 0}
              onKeyDown={(e) => {
                if (!isLast && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onNavigate(item.id);
                }
              }}
              style={{
                cursor: isLast ? "default" : "pointer",
                color: isLast ? "var(--text-primary)" : "var(--text-secondary)",
                fontWeight: isLast ? 500 : 400,
                textDecoration: "none",
              }}
            >
              {item.label}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}
