import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { TerminalView } from "./views/TerminalView";
import { DashboardView } from "./views/DashboardView";
import { DiagramView } from "./views/DiagramView";
import { LauncherView } from "./views/LauncherView";

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/terminal" element={<TerminalView />} />
          <Route path="/launcher" element={<LauncherView />} />
          <Route path="/dashboard" element={<DashboardView />} />
          <Route path="/diagrams" element={<DiagramView />} />
          <Route path="*" element={<Navigate to="/terminal" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
