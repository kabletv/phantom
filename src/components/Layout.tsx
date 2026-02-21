import React, { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { StatusBarReact } from "./StatusBarReact";
import { ToastContainer } from "./ui/Toast";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { TerminalIsland } from "./TerminalIsland";

const VIEW_ROUTES = ["/terminal", "/dashboard", "/diagrams", "/launcher"] as const;

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [transitioning, setTransitioning] = useState(false);
  const prevPath = useRef(location.pathname);

  const isTerminalRoute = location.pathname === "/terminal";

  // Cross-fade on route change
  useEffect(() => {
    if (prevPath.current !== location.pathname) {
      prevPath.current = location.pathname;
      setTransitioning(true);
      const timer = setTimeout(() => setTransitioning(false), 250);
      return () => clearTimeout(timer);
    }
  }, [location.pathname]);

  // Global keyboard shortcuts: Cmd+1/2/3/4 for view switching, Cmd+T for new terminal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.metaKey && !e.ctrlKey) return;

      // Cmd+1..4 view switching
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= VIEW_ROUTES.length) {
        e.preventDefault();
        navigate(VIEW_ROUTES[num - 1]);
        return;
      }

      // Cmd+T new terminal (navigate to terminal view)
      if (e.key === "t" && !e.shiftKey) {
        e.preventDefault();
        navigate("/terminal");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  return (
    <div style={{
      width: "100vw",
      height: "100vh",
      display: "flex",
      overflow: "hidden",
    }}>
      <Sidebar />
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Terminal is always mounted to keep PTY alive, hidden when not active */}
        <div style={{
          flex: isTerminalRoute ? 1 : undefined,
          display: isTerminalRoute ? "flex" : "none",
          flexDirection: "column",
          overflow: "hidden",
        }}>
          <ErrorBoundary label="Terminal">
            <TerminalIsland />
          </ErrorBoundary>
        </div>

        {/* Non-terminal routes render via Outlet */}
        {!isTerminalRoute && (
          <ErrorBoundary label="Main Content">
            <main
              className={transitioning ? "view-enter" : undefined}
              style={{
                flex: 1,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Outlet />
            </main>
          </ErrorBoundary>
        )}

        <StatusBarReact />
      </div>
      <ToastContainer />
    </div>
  );
}
