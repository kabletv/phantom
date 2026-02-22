use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone)]
pub struct WorktreeInfo {
    pub path: String,
    pub head: String,
    pub branch: Option<String>,
}

/// Clone a GitHub repo using `gh repo clone`.
pub fn clone_repo(url: &str, target_path: &Path) -> Result<(), String> {
    let output = Command::new("gh")
        .args(["repo", "clone", url, &target_path.to_string_lossy()])
        .output()
        .map_err(|e| format!("failed to run gh: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(())
}

/// Check if `gh` CLI is authenticated.
pub fn check_gh_auth() -> Result<bool, String> {
    let output = Command::new("gh")
        .args(["auth", "status"])
        .output()
        .map_err(|e| format!("failed to run gh: {e}"))?;

    Ok(output.status.success())
}

/// List repos for the authenticated GitHub user.
pub fn list_gh_repos() -> Result<Vec<GhRepo>, String> {
    let output = Command::new("gh")
        .args([
            "repo", "list",
            "--json", "nameWithOwner,url,defaultBranchRef",
            "--limit", "100",
        ])
        .output()
        .map_err(|e| format!("failed to run gh: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let repos: Vec<GhRepoRaw> = serde_json::from_str(&stdout)
        .map_err(|e| format!("failed to parse gh output: {e}"))?;

    Ok(repos.into_iter().map(|r| {
        let parts: Vec<&str> = r.name_with_owner.splitn(2, '/').collect();
        let (owner, name) = if parts.len() == 2 {
            (parts[0].to_string(), parts[1].to_string())
        } else {
            (String::new(), r.name_with_owner.clone())
        };
        GhRepo {
            owner,
            name,
            url: r.url,
            default_branch: r.default_branch_ref
                .map(|b| b.name)
                .unwrap_or_else(|| "main".to_string()),
        }
    }).collect())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GhRepo {
    pub owner: String,
    pub name: String,
    pub url: String,
    pub default_branch: String,
}

#[derive(serde::Deserialize)]
struct GhRepoRaw {
    #[serde(rename = "nameWithOwner")]
    name_with_owner: String,
    url: String,
    #[serde(rename = "defaultBranchRef")]
    default_branch_ref: Option<DefaultBranchRef>,
}

#[derive(serde::Deserialize)]
struct DefaultBranchRef {
    name: String,
}

/// Create a new git worktree.
pub fn create_worktree(
    repo_path: &Path,
    worktree_path: &Path,
    branch: &str,
) -> Result<(), String> {
    let output = Command::new("git")
        .args([
            "worktree", "add",
            &worktree_path.to_string_lossy(),
            "-b", branch,
        ])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;

    if !output.status.success() {
        // Try without -b (branch already exists)
        let output = Command::new("git")
            .args([
                "worktree", "add",
                &worktree_path.to_string_lossy(),
                branch,
            ])
            .current_dir(repo_path)
            .output()
            .map_err(|e| format!("failed to run git: {e}"))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
    }

    Ok(())
}

/// List all worktrees for a repository.
pub fn list_worktrees(repo_path: &Path) -> Result<Vec<WorktreeInfo>, String> {
    let output = Command::new("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut worktrees = Vec::new();
    let mut current_path = String::new();
    let mut current_head = String::new();
    let mut current_branch: Option<String> = None;

    for line in stdout.lines() {
        if let Some(path) = line.strip_prefix("worktree ") {
            if !current_path.is_empty() {
                worktrees.push(WorktreeInfo {
                    path: std::mem::take(&mut current_path),
                    head: std::mem::take(&mut current_head),
                    branch: current_branch.take(),
                });
            }
            current_path = path.to_string();
        } else if let Some(head) = line.strip_prefix("HEAD ") {
            current_head = head.to_string();
        } else if let Some(branch) = line.strip_prefix("branch ") {
            // Strip refs/heads/ prefix
            current_branch = Some(
                branch
                    .strip_prefix("refs/heads/")
                    .unwrap_or(branch)
                    .to_string(),
            );
        }
    }

    // Push last entry
    if !current_path.is_empty() {
        worktrees.push(WorktreeInfo {
            path: current_path,
            head: current_head,
            branch: current_branch,
        });
    }

    Ok(worktrees)
}

/// Remove a git worktree.
pub fn remove_worktree(repo_path: &Path, worktree_path: &Path) -> Result<(), String> {
    let output = Command::new("git")
        .args(["worktree", "remove", &worktree_path.to_string_lossy()])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(())
}
