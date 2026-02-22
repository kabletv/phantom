// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod io_thread;
mod ipc;
mod render_pump;
mod scheduler;
mod state;

use state::AppState;
use std::path::PathBuf;
use tauri_plugin_updater::UpdaterExt;

fn main() {
    // Verify git is available on PATH before doing anything else.
    if let Err(e) = phantom_git::find_git_binary() {
        eprintln!("fatal: {e}");
        std::process::exit(1);
    }

    // Detect repo path: use current working directory, or fall back to home dir.
    let repo_path = std::env::current_dir().unwrap_or_else(|_| {
        dirs_or_cwd()
    });

    // Open (or create) the SQLite database inside the repo's .phantom directory.
    let db_dir = repo_path.join(".phantom");
    std::fs::create_dir_all(&db_dir).expect("failed to create .phantom directory");
    let db_path = db_dir.join("phantom.db");
    let db = phantom_db::open(&db_path).expect("failed to open database");

    // Seed built-in presets on first launch.
    scheduler::seed_presets(&db).expect("failed to seed presets");

    let app_state = AppState::new(db, repo_path);
    let scheduler_db = app_state.db.clone();
    let scheduler_repo = app_state.repo_path.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(app_state)
        .setup(move |app| {
            scheduler::start_scheduler(app.handle().clone(), scheduler_db, scheduler_repo);
            // Check for updates in the background.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = check_for_updates(handle).await {
                    log::warn!("Update check failed: {e}");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::terminal::create_terminal,
            commands::terminal::write_input,
            commands::terminal::resize_terminal,
            commands::terminal::close_terminal,
            commands::git::list_branches,
            commands::git::get_current_branch,
            commands::presets::list_cli_presets,
            commands::presets::create_cli_preset,
            commands::presets::list_analysis_presets,
            commands::presets::create_analysis_preset,
            commands::analysis::run_analysis,
            commands::analysis::get_analysis,
            commands::analysis::list_analyses,
            commands::analysis::get_analysis_diff,
        ])
        // Devtools can be opened with right-click > Inspect Element in debug builds.
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Check GitHub releases for a newer version and install it.
async fn check_for_updates(app: tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let updater = app.updater().map_err(|e| format!("updater init: {e}"))?;
    match updater.check().await {
        Ok(Some(update)) => {
            log::info!(
                "Update available: {} -> {}",
                update.current_version,
                update.version
            );
            update.download_and_install(|_, _| {}, || {}).await?;
            log::info!("Update installed, will apply on next restart");
        }
        Ok(None) => {
            log::info!("App is up to date");
        }
        Err(e) => {
            log::warn!("Update check error: {e}");
        }
    }
    Ok(())
}

/// Fallback directory when current_dir() fails.
fn dirs_or_cwd() -> PathBuf {
    home_dir().unwrap_or_else(|| PathBuf::from("."))
}

/// Get the user's home directory.
fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}
