use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone)]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
    pub commit_sha: String,
}

/// Check that `git` is available on PATH. Returns the path to the binary,
/// or an error with a clear message if not found.
pub fn find_git_binary() -> Result<String, String> {
    let output = Command::new("which")
        .arg("git")
        .output()
        .map_err(|e| format!("failed to search for git binary: {e}"))?;

    if !output.status.success() {
        return Err(
            "git binary not found on PATH. Please install git: https://git-scm.com/downloads"
                .to_string(),
        );
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        return Err(
            "git binary not found on PATH. Please install git: https://git-scm.com/downloads"
                .to_string(),
        );
    }

    Ok(path)
}

pub fn list_branches(repo_path: &Path) -> Result<Vec<BranchInfo>, String> {
    let output = Command::new("git")
        .args(["branch", "--format=%(HEAD) %(refname:short) %(objectname:short)"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let branches = stdout
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() {
                return None;
            }
            let is_current = line.starts_with('*');
            let rest = line.trim_start_matches(['*', ' '].as_ref()).trim();
            let mut parts = rest.splitn(2, ' ');
            let name = parts.next()?.to_string();
            let commit_sha = parts.next().unwrap_or("").to_string();
            Some(BranchInfo {
                name,
                is_current,
                commit_sha,
            })
        })
        .collect();

    Ok(branches)
}

pub fn current_branch(repo_path: &Path) -> Result<String, String> {
    let output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub fn head_commit(repo_path: &Path, branch: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(["rev-parse", branch])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub fn merge_base(repo_path: &Path, branch_a: &str, branch_b: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(["merge-base", branch_a, branch_b])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
