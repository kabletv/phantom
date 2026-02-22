import { invoke } from "@tauri-apps/api/core";
import type { GraphDiff } from "./graph-types";

export interface BranchInfo {
  name: string;
  is_current: boolean;
  commit_sha: string;
}

export interface CliPreset {
  id: number;
  name: string;
  cli_binary: string;
  flags: string;
  working_dir: string | null;
  env_vars: string | null;
}

export interface AnalysisPreset {
  id: number;
  name: string;
  type: string;
  prompt_template: string;
  schedule: string | null;
}

export interface AnalysisResult {
  id: number;
  repo_path: string;
  commit_sha: string;
  branch: string;
  preset_id: number;
  status: string;
  raw_output: string | null;
  parsed_graph: string | null;
  parsed_findings: string | null;
  error_message: string | null;
  level: number;
  target_node_id: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Repository {
  id: number;
  github_owner: string;
  github_name: string;
  github_url: string;
  local_path: string;
  default_branch: string;
  created_at: string;
}

export interface Project {
  id: number;
  repo_id: number;
  name: string;
  branch: string;
  worktree_path: string;
  sandbox_profile: string | null;
  created_at: string;
}

export interface GhRepo {
  owner: string;
  name: string;
  url: string;
  default_branch: string;
}

export { type GraphDiff };

export const api = {
  // Git
  listBranches: () => invoke<BranchInfo[]>("list_branches"),
  getCurrentBranch: () => invoke<string>("get_current_branch"),

  // CLI Presets
  listCliPresets: () => invoke<CliPreset[]>("list_cli_presets"),
  createCliPreset: (name: string, cliBinary: string, flags: string, workingDir?: string) =>
    invoke<number>("create_cli_preset", { name, cliBinary, flags, workingDir }),

  // Analysis Presets
  listAnalysisPresets: () => invoke<AnalysisPreset[]>("list_analysis_presets"),
  createAnalysisPreset: (name: string, presetType: string, promptTemplate: string, schedule?: string) =>
    invoke<number>("create_analysis_preset", { name, presetType, promptTemplate, schedule }),

  // Analysis
  runAnalysis: (presetId: number, branch: string, level?: number, targetNodeId?: string) =>
    invoke<number>("run_analysis", { presetId, branch, level, targetNodeId }),
  getAnalysis: (analysisId: number) =>
    invoke<AnalysisResult | null>("get_analysis", { analysisId }),
  listAnalyses: (branch: string) =>
    invoke<AnalysisResult[]>("list_analyses", { branch }),
  getAnalysisDiff: (branchAnalysisId: number, mainAnalysisId: number) =>
    invoke<GraphDiff>("get_analysis_diff", { branchAnalysisId, mainAnalysisId }),

  // Repositories
  checkGithubAuth: () => invoke<boolean>("check_github_auth"),
  listGithubRepos: () => invoke<GhRepo[]>("list_github_repos"),
  cloneRepository: (owner: string, name: string, url: string, defaultBranch?: string) =>
    invoke<Repository>("clone_repository", { owner, name, url, defaultBranch }),
  listRepositories: () => invoke<Repository[]>("list_repositories"),

  // Projects
  createProject: (repoId: number, name: string, branch: string) =>
    invoke<Project>("create_project", { repoId, name, branch }),
  listProjects: (repoId: number) =>
    invoke<Project[]>("list_projects", { repoId }),
  deleteProject: (projectId: number) =>
    invoke<void>("delete_project", { projectId }),

  // Menu
  rebuildMenu: () => invoke<void>("rebuild_menu"),
};
