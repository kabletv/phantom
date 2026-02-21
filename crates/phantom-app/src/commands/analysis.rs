use crate::state::AppState;
use phantom_analysis::cli;
use phantom_analysis::diff;
use phantom_analysis::runner::{JobRunner, JobStatusUpdate};
use phantom_db::analyses;
use tauri::Emitter;

#[tauri::command]
pub async fn run_analysis(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    preset_id: i64,
    branch: String,
    level: Option<i64>,
    target_node_id: Option<String>,
) -> Result<i64, String> {
    let level = level.unwrap_or(1);
    let repo_path = state.repo_path.clone();
    let db = state.db.clone();

    // Get the current commit for this branch (blocking git call)
    let rp = repo_path.clone();
    let br = branch.clone();
    let commit_sha = tokio::task::spawn_blocking(move || {
        phantom_git::head_commit(&rp, &br)
    })
    .await
    .map_err(|e| format!("task join error: {e}"))??;

    // Check for a cached completed analysis
    let repo_str = repo_path.to_string_lossy().to_string();
    let cached = {
        let db = db.clone();
        let repo_str = repo_str.clone();
        let commit_sha = commit_sha.clone();
        let target_node_id = target_node_id.clone();
        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(|e| format!("db lock poisoned: {e}"))?;
            analyses::find_cached_analysis(
                &conn,
                &repo_str,
                &commit_sha,
                preset_id,
                level,
                target_node_id.as_deref(),
            )
            .map_err(|e| e.to_string())
        })
        .await
        .map_err(|e| format!("task join error: {e}"))??
    };
    if let Some(cached) = cached {
        return Ok(cached.id);
    }

    // Look up the preset to get the prompt template, name, type, and read CLI binary from settings
    let (prompt_template, preset_name, preset_type, cli_binary) = {
        let db = db.clone();
        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(|e| format!("db lock poisoned: {e}"))?;
            let presets =
                phantom_db::presets::list_analysis_presets(&conn).map_err(|e| e.to_string())?;
            let preset = presets
                .into_iter()
                .find(|p| p.id == preset_id)
                .ok_or_else(|| format!("preset {preset_id} not found"))?;
            let cli = phantom_db::settings::get(
                &conn,
                crate::scheduler::SETTING_DEFAULT_CLI_BINARY,
            )
            .ok()
            .flatten()
            .unwrap_or_else(|| crate::scheduler::DEFAULT_CLI_BINARY.to_string());
            Ok::<_, String>((preset.prompt_template, preset.name, preset.preset_type, cli))
        })
        .await
        .map_err(|e| format!("task join error: {e}"))??
    };

    // Auth pre-check: verify the CLI is authenticated before creating a DB record
    let cli_kind = cli::CliKind::detect(&cli_binary);
    cli::check_auth(&cli_binary, cli_kind).await?;

    // Create the analysis record
    let analysis_id = {
        let db = db.clone();
        let repo_str = repo_str.clone();
        let commit_sha = commit_sha.clone();
        let branch = branch.clone();
        let target_node_id = target_node_id.clone();
        tokio::task::spawn_blocking(move || {
            let conn = db.lock().map_err(|e| format!("db lock poisoned: {e}"))?;
            analyses::create_analysis(
                &conn,
                &repo_str,
                &commit_sha,
                &branch,
                preset_id,
                level,
                target_node_id.as_deref(),
            )
            .map_err(|e| e.to_string())
        })
        .await
        .map_err(|e| format!("task join error: {e}"))??
    };

    // Spawn the job in the background
    let (status_tx, mut status_rx) = tokio::sync::mpsc::channel::<JobStatusUpdate>(16);

    // Forward status updates as Tauri events
    let app_handle = app.clone();
    tokio::spawn(async move {
        while let Some(update) = status_rx.recv().await {
            let _ = app_handle.emit("analysis:status_changed", &update);
        }
    });

    let runner = JobRunner::with_semaphore(state.db.clone(), state.analysis_semaphore.clone());
    tokio::spawn(async move {
        let _ = runner
            .run_analysis(analysis_id, &cli_binary, &prompt_template, &repo_path, &preset_name, &preset_type, None, status_tx)
            .await;
    });

    Ok(analysis_id)
}

#[tauri::command]
pub async fn get_analysis(
    state: tauri::State<'_, AppState>,
    analysis_id: i64,
) -> Result<Option<phantom_db::Analysis>, String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| format!("db lock poisoned: {e}"))?;
        analyses::get_analysis(&conn, analysis_id).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("task join error: {e}"))?
}

#[tauri::command]
pub async fn list_analyses(
    state: tauri::State<'_, AppState>,
    branch: String,
) -> Result<Vec<phantom_db::Analysis>, String> {
    let db = state.db.clone();
    let repo_str = state.repo_path.to_string_lossy().to_string();
    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| format!("db lock poisoned: {e}"))?;
        analyses::list_analyses_for_branch(&conn, &repo_str, &branch).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("task join error: {e}"))?
}

#[tauri::command]
pub async fn get_analysis_diff(
    state: tauri::State<'_, AppState>,
    branch_analysis_id: i64,
    main_analysis_id: i64,
) -> Result<diff::GraphDiff, String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || {
        let conn = db.lock().map_err(|e| format!("db lock poisoned: {e}"))?;

        let branch_analysis = analyses::get_analysis(&conn, branch_analysis_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "branch analysis not found".to_string())?;

        let main_analysis = analyses::get_analysis(&conn, main_analysis_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "main analysis not found".to_string())?;

        let branch_graph_json = branch_analysis
            .parsed_graph
            .as_deref()
            .ok_or_else(|| "branch analysis has no graph output".to_string())?;

        let main_graph_json = main_analysis
            .parsed_graph
            .as_deref()
            .ok_or_else(|| "main analysis has no graph output".to_string())?;

        let base_graph = diff::parse_graph_json(main_graph_json)?;
        let branch_graph = diff::parse_graph_json(branch_graph_json)?;

        Ok(diff::diff_graphs(&base_graph, &branch_graph))
    })
    .await
    .map_err(|e| format!("task join error: {e}"))?
}
