// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod io_thread;
mod ipc;
mod render_pump;
mod sandbox;
mod scheduler;
mod state;

use state::AppState;
use std::path::PathBuf;
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{Emitter, Manager};
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

    // Set up the global ~/.phantom directory structure.
    let phantom_home = home_dir()
        .expect("could not determine home directory")
        .join(".phantom");
    std::fs::create_dir_all(phantom_home.join("repos")).expect("failed to create ~/.phantom/repos");
    std::fs::create_dir_all(phantom_home.join("worktrees")).expect("failed to create ~/.phantom/worktrees");
    std::fs::create_dir_all(phantom_home.join("sandbox")).expect("failed to create ~/.phantom/sandbox");

    // Open (or create) the SQLite database at ~/.phantom/phantom.db.
    let db_path = phantom_home.join("phantom.db");
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
            // Build native menu bar.
            build_menu(app)?;

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
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "new-terminal" => {
                    let _ = app.emit("menu:new-terminal", ());
                }
                id if id.starts_with("preset:") => {
                    let _ = app.emit("menu:launch-preset", id.to_string());
                }
                _ => {}
            }
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
            commands::menu::rebuild_menu,
            commands::repos::check_github_auth,
            commands::repos::list_github_repos,
            commands::repos::clone_repository,
            commands::repos::list_repositories,
            commands::projects::create_project,
            commands::projects::list_projects,
            commands::projects::delete_project,
        ])
        // Devtools can be opened with right-click > Inspect Element in debug builds.
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Build the native menu bar.
fn build_menu(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle();

    // App submenu (Phantom)
    let app_menu = SubmenuBuilder::new(handle, "Phantom")
        .about(None)
        .separator()
        .quit()
        .build()?;

    // File submenu
    let new_terminal = MenuItemBuilder::with_id("new-terminal", "New Terminal")
        .accelerator("CmdOrCtrl+T")
        .build(handle)?;

    let close_tab = PredefinedMenuItem::close_window(handle, Some("Close Tab"))?;

    let mut file_menu = SubmenuBuilder::new(handle, "File")
        .item(&new_terminal);

    // Add preset items from database
    let state: tauri::State<AppState> = handle.state();
    if let Ok(db) = state.db.lock() {
        if let Ok(presets) = phantom_db::presets::list_cli_presets(&db) {
            if !presets.is_empty() {
                let mut new_submenu = SubmenuBuilder::new(handle, "New");
                for preset in &presets {
                    let id = format!("preset:{}", preset.id);
                    let item = MenuItemBuilder::with_id(id, &preset.name)
                        .build(handle)?;
                    new_submenu = new_submenu.item(&item);
                }
                let new_sub = new_submenu.build()?;
                file_menu = file_menu.item(&new_sub);
            }
        }
    }

    file_menu = file_menu
        .separator()
        .item(&close_tab);

    let file_built = file_menu.build()?;

    // Edit submenu (standard)
    let edit_menu = SubmenuBuilder::new(handle, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    // Window submenu
    let window_menu = SubmenuBuilder::new(handle, "Window")
        .minimize()
        .build()?;

    let menu = MenuBuilder::new(handle)
        .item(&app_menu)
        .item(&file_built)
        .item(&edit_menu)
        .item(&window_menu)
        .build()?;

    app.set_menu(menu)?;

    Ok(())
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
