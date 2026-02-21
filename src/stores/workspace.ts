import { create } from "zustand";

interface WorkspaceState {
  selectedBranch: string;
  repoPath: string;
  setSelectedBranch: (branch: string) => void;
  setRepoPath: (path: string) => void;
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  selectedBranch: "main",
  repoPath: "",
  setSelectedBranch: (branch) => set({ selectedBranch: branch }),
  setRepoPath: (path) => set({ repoPath: path }),
}));
