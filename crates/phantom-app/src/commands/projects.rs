//! Tauri commands for project (worktree) management.

use crate::state::AppState;
use phantom_db::Project;

/// Create a new project (git worktree) for a repository.
#[tauri::command]
pub async fn create_project(
    state: tauri::State<'_, AppState>,
    repo_id: i64,
    name: String,
    branch: String,
) -> Result<Project, String> {
    let (repo_path, owner, repo_name) = {
        let db = state.db.lock().map_err(|e| format!("lock error: {e}"))?;
        let repo = phantom_db::repositories::get_repository(&db, repo_id)
            .map_err(|e| format!("db error: {e}"))?
            .ok_or_else(|| format!("repository {repo_id} not found"))?;
        (repo.local_path.clone(), repo.github_owner.clone(), repo.github_name.clone())
    };

    let phantom_home = phantom_home()?;
    let worktree_path = phantom_home
        .join("worktrees")
        .join(&owner)
        .join(&repo_name)
        .join(&name);

    let repo_path_clone = std::path::PathBuf::from(&repo_path);
    let wt_path_clone = worktree_path.clone();
    let branch_clone = branch.clone();

    tokio::task::spawn_blocking(move || {
        phantom_git::create_worktree(&repo_path_clone, &wt_path_clone, &branch_clone)
    })
    .await
    .map_err(|e| format!("task join error: {e}"))??;

    // Optionally generate a sandbox profile.
    let sandbox_profile = {
        let git_dir = std::path::Path::new(&repo_path).join(".git");
        let profile = crate::sandbox::generate_profile(
            &worktree_path.to_string_lossy(),
            &git_dir.to_string_lossy(),
        );
        Some(profile)
    };

    let wt_str = worktree_path.to_string_lossy().to_string();

    let db = state.db.lock().map_err(|e| format!("lock error: {e}"))?;
    let id = phantom_db::projects::create_project(
        &db,
        repo_id,
        &name,
        &branch,
        &wt_str,
        sandbox_profile.as_deref(),
    )
    .map_err(|e| format!("db error: {e}"))?;

    // Save sandbox profile to disk.
    if let Some(ref profile) = sandbox_profile {
        let sandbox_dir = phantom_home.join("sandbox");
        let _ = crate::sandbox::save_profile(&sandbox_dir, id, profile);
    }

    phantom_db::projects::get_project(&db, id)
        .map_err(|e| format!("db error: {e}"))?
        .ok_or_else(|| "project not found after insert".to_string())
}

/// List all projects for a repository.
#[tauri::command]
pub async fn list_projects(
    state: tauri::State<'_, AppState>,
    repo_id: i64,
) -> Result<Vec<Project>, String> {
    let db = state.db.lock().map_err(|e| format!("lock error: {e}"))?;
    phantom_db::projects::list_projects(&db, repo_id).map_err(|e| format!("db error: {e}"))
}

/// Delete a project (removes worktree from disk and DB).
#[tauri::command]
pub async fn delete_project(
    state: tauri::State<'_, AppState>,
    project_id: i64,
) -> Result<(), String> {
    let (worktree_path, repo_path) = {
        let db = state.db.lock().map_err(|e| format!("lock error: {e}"))?;
        let project = phantom_db::projects::get_project(&db, project_id)
            .map_err(|e| format!("db error: {e}"))?
            .ok_or_else(|| format!("project {project_id} not found"))?;
        let repo = phantom_db::repositories::get_repository(&db, project.repo_id)
            .map_err(|e| format!("db error: {e}"))?
            .ok_or_else(|| format!("repository {} not found", project.repo_id))?;
        (project.worktree_path.clone(), repo.local_path.clone())
    };

    // Remove the git worktree.
    let repo_p = std::path::PathBuf::from(&repo_path);
    let wt_p = std::path::PathBuf::from(&worktree_path);
    let _ = tokio::task::spawn_blocking(move || {
        phantom_git::remove_worktree(&repo_p, &wt_p)
    })
    .await;

    // Remove sandbox profile.
    let phantom_home = phantom_home()?;
    let sb_path = phantom_home.join("sandbox").join(format!("{project_id}.sb"));
    let _ = std::fs::remove_file(sb_path);

    // Remove from DB.
    let db = state.db.lock().map_err(|e| format!("lock error: {e}"))?;
    phantom_db::projects::delete_project(&db, project_id)
        .map_err(|e| format!("db error: {e}"))?;

    Ok(())
}

fn phantom_home() -> Result<std::path::PathBuf, String> {
    let home = std::env::var_os("HOME")
        .ok_or_else(|| "HOME not set".to_string())?;
    Ok(std::path::PathBuf::from(home).join(".phantom"))
}
