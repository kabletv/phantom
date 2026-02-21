import React, { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  /** What to display when an error is caught. Defaults to built-in error panel. */
  fallback?: ReactNode;
  /** Label for the section this boundary wraps (e.g. "Diagram Viewer") */
  label?: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

/**
 * React error boundary that catches rendering errors and displays
 * a graceful inline error panel instead of crashing the whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, showDetails: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? `: ${this.props.label}` : ""}]`, error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, showDetails: false });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, showDetails } = this.state;
      const label = this.props.label || "This section";

      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            minHeight: "160px",
            padding: "var(--space-5)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "var(--radius-full)",
              background: "var(--status-error-muted)",
              color: "var(--status-error)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px",
              fontWeight: 700,
              marginBottom: "var(--space-3)",
            }}
          >
            !
          </div>
          <h2
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: "var(--space-1)",
            }}
          >
            {label} encountered an error
          </h2>
          <p
            style={{
              fontSize: "13px",
              color: "var(--text-secondary)",
              marginBottom: "var(--space-3)",
              maxWidth: "320px",
            }}
          >
            Something went wrong. You can try again or reload the app.
          </p>

          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <button className="btn-primary" onClick={this.handleRetry}>
              Retry
            </button>
            <button className="btn-ghost" onClick={() => this.setState({ showDetails: !showDetails })}>
              {showDetails ? "Hide Details" : "Show Details"}
            </button>
          </div>

          {showDetails && error && (
            <pre
              style={{
                marginTop: "var(--space-3)",
                padding: "var(--space-3)",
                background: "var(--bg-inset)",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-md)",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--text-secondary)",
                textAlign: "left",
                maxWidth: "480px",
                maxHeight: "200px",
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
