//! Tauri commands for repository management.

use crate::state::AppState;
use phantom_db::Repository;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct GhRepo {
    pub owner: String,
    pub name: String,
    pub url: String,
    pub default_branch: String,
}

/// Check if the GitHub CLI is authenticated.
#[tauri::command]
pub async fn check_github_auth() -> Result<bool, String> {
    tokio::task::spawn_blocking(|| phantom_git::check_gh_auth())
        .await
        .map_err(|e| format!("task join error: {e}"))?
}

/// List the authenticated user's GitHub repositories.
#[tauri::command]
pub async fn list_github_repos() -> Result<Vec<GhRepo>, String> {
    let repos = tokio::task::spawn_blocking(|| phantom_git::list_gh_repos())
        .await
        .map_err(|e| format!("task join error: {e}"))??;

    Ok(repos
        .into_iter()
        .map(|r| GhRepo {
            owner: r.owner,
            name: r.name,
            url: r.url,
            default_branch: r.default_branch,
        })
        .collect())
}

/// Clone a GitHub repository to ~/.phantom/repos/{owner}/{name}.
#[tauri::command]
pub async fn clone_repository(
    state: tauri::State<'_, AppState>,
    owner: String,
    name: String,
    url: String,
    default_branch: Option<String>,
) -> Result<Repository, String> {
    let phantom_home = phantom_home()?;
    let repo_dir = phantom_home.join("repos").join(&owner).join(&name);

    // Clone if not already present.
    if !repo_dir.exists() {
        let url_clone = url.clone();
        let dir_clone = repo_dir.clone();
        tokio::task::spawn_blocking(move || {
            std::fs::create_dir_all(dir_clone.parent().unwrap())
                .map_err(|e| format!("failed to create directory: {e}"))?;
            phantom_git::clone_repo(&url_clone, &dir_clone)
        })
        .await
        .map_err(|e| format!("task join error: {e}"))??;
    }

    let branch = default_branch.unwrap_or_else(|| "main".to_string());
    let local_path = repo_dir.to_string_lossy().to_string();

    let db = state.db.lock().map_err(|e| format!("lock error: {e}"))?;
    let id = phantom_db::repositories::create_repository(
        &db, &owner, &name, &url, &local_path, &branch,
    )
    .map_err(|e| format!("db error: {e}"))?;

    phantom_db::repositories::get_repository(&db, id)
        .map_err(|e| format!("db error: {e}"))?
        .ok_or_else(|| "repository not found after insert".to_string())
}

/// List all tracked repositories.
#[tauri::command]
pub async fn list_repositories(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<Repository>, String> {
    let db = state.db.lock().map_err(|e| format!("lock error: {e}"))?;
    phantom_db::repositories::list_repositories(&db).map_err(|e| format!("db error: {e}"))
}

fn phantom_home() -> Result<std::path::PathBuf, String> {
    let home = std::env::var_os("HOME")
        .ok_or_else(|| "HOME not set".to_string())?;
    Ok(std::path::PathBuf::from(home).join(".phantom"))
}
