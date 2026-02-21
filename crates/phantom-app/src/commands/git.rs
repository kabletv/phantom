use crate::state::AppState;
use serde::Serialize;

#[derive(Serialize)]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
    pub commit_sha: String,
}

#[tauri::command]
pub async fn list_branches(state: tauri::State<'_, AppState>) -> Result<Vec<BranchInfo>, String> {
    let repo_path = state.repo_path.clone();
    tokio::task::spawn_blocking(move || {
        let branches = phantom_git::list_branches(&repo_path)?;
        Ok(branches
            .into_iter()
            .map(|b| BranchInfo {
                name: b.name,
                is_current: b.is_current,
                commit_sha: b.commit_sha,
            })
            .collect())
    })
    .await
    .map_err(|e| format!("task join error: {e}"))?
}

#[tauri::command]
pub async fn get_current_branch(
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let repo_path = state.repo_path.clone();
    tokio::task::spawn_blocking(move || phantom_git::current_branch(&repo_path))
        .await
        .map_err(|e| format!("task join error: {e}"))?
}
