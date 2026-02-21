use crate::state::AppState;
use phantom_db::presets;

#[tauri::command]
pub async fn list_cli_presets(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<presets::CliPreset>, String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| format!("db lock poisoned: {e}"))?;
        presets::list_cli_presets(&conn).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("task join error: {e}"))?
}

#[tauri::command]
pub async fn create_cli_preset(
    state: tauri::State<'_, AppState>,
    name: String,
    cli_binary: String,
    flags: String,
    working_dir: Option<String>,
    budget_usd: Option<f64>,
) -> Result<i64, String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| format!("db lock poisoned: {e}"))?;
        presets::create_cli_preset(
            &conn,
            &name,
            &cli_binary,
            &flags,
            working_dir.as_deref(),
            None,
            budget_usd,
        )
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("task join error: {e}"))?
}

#[tauri::command]
pub async fn list_analysis_presets(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<presets::AnalysisPreset>, String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| format!("db lock poisoned: {e}"))?;
        presets::list_analysis_presets(&conn).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("task join error: {e}"))?
}

#[tauri::command]
pub async fn create_analysis_preset(
    state: tauri::State<'_, AppState>,
    name: String,
    preset_type: String,
    prompt_template: String,
    schedule: Option<String>,
) -> Result<i64, String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| format!("db lock poisoned: {e}"))?;
        presets::create_analysis_preset(
            &conn,
            &name,
            &preset_type,
            &prompt_template,
            schedule.as_deref(),
        )
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("task join error: {e}"))?
}
