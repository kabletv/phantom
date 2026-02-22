import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { TerminalView } from "./views/TerminalView";
import { DashboardView } from "./views/DashboardView";
import { DiagramView } from "./views/DiagramView";
import { LauncherView } from "./views/LauncherView";
import { ReposView } from "./views/ReposView";
import { ProjectsView } from "./views/ProjectsView";
import { ProjectView } from "./views/ProjectView";

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/terminal" element={<TerminalView />} />
          <Route path="/repos" element={<ReposView />} />
          <Route path="/repos/:repoId/projects" element={<ProjectsView />} />
          <Route path="/projects/:projectId" element={<ProjectView />} />
          <Route path="/launcher" element={<LauncherView />} />
          <Route path="/dashboard" element={<DashboardView />} />
          <Route path="/diagrams" element={<DiagramView />} />
          <Route path="*" element={<Navigate to="/repos" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
