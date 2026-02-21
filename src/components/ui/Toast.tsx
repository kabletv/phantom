import React, { useCallback, useEffect, useState } from "react";

type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  dismissing?: boolean;
}

// Module-level state so any code can call toast() without React context
let addToastFn: ((type: ToastType, message: string) => void) | null = null;
let nextId = 0;

/** Imperative toast API. Call from anywhere. */
export const toast = {
  success: (message: string) => addToastFn?.("success", message),
  error: (message: string) => addToastFn?.("error", message),
  warning: (message: string) => addToastFn?.("warning", message),
  info: (message: string) => addToastFn?.("info", message),
};

const typeStyles: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: {
    bg: "var(--status-success-muted)",
    border: "var(--status-success)",
    icon: "\u2713",
  },
  error: {
    bg: "var(--status-error-muted)",
    border: "var(--status-error)",
    icon: "\u2717",
  },
  warning: {
    bg: "var(--status-warning-muted)",
    border: "var(--status-warning)",
    icon: "!",
  },
  info: {
    bg: "var(--status-info-muted)",
    border: "var(--status-info)",
    icon: "i",
  },
};

const AUTO_DISMISS_MS = 5000;

/**
 * Toast container. Mount once at the app root level.
 * Toasts stack from bottom-right and auto-dismiss after 5 seconds.
 */
export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, dismissing: true } : t)),
    );
    // Remove from DOM after exit animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 150);
  }, []);

  // Register the imperative API
  useEffect(() => {
    addToastFn = (type: ToastType, message: string) => {
      const id = ++nextId;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    };
    return () => {
      addToastFn = null;
    };
  }, [dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "calc(var(--statusbar-height) + var(--space-3))",
        right: "var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => {
        const s = typeStyles[t.type];
        return (
          <div
            key={t.id}
            style={{
              pointerEvents: "auto",
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              padding: "var(--space-2) var(--space-3)",
              background: "var(--bg-overlay)",
              border: `1px solid ${s.border}`,
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-md)",
              fontSize: "13px",
              color: "var(--text-primary)",
              maxWidth: "360px",
              animation: t.dismissing
                ? "slide-out-down 150ms var(--ease-exit) forwards"
                : "slide-in-up 250ms var(--ease-enter) both",
            }}
          >
            <span
              style={{
                width: "18px",
                height: "18px",
                borderRadius: "var(--radius-full)",
                background: s.bg,
                color: s.border,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "11px",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {s.icon}
            </span>
            <span style={{ flex: 1 }}>{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              style={{
                background: "none",
                border: "none",
                color: "var(--text-tertiary)",
                cursor: "pointer",
                fontSize: "14px",
                padding: "2px",
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              \u00d7
            </button>
          </div>
        );
      })}
    </div>
  );
}
