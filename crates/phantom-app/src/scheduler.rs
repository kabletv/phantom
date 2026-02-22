use phantom_analysis::runner::{JobRunner, JobStatusUpdate, DEFAULT_MAX_CONCURRENCY};
use phantom_db::{analyses, presets, settings};
use phantom_git::GitEvent;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Emitter;
use tokio::sync::mpsc;

/// Settings key for max concurrent analysis jobs.
pub const SETTING_MAX_CONCURRENCY: &str = "analysis_max_concurrency";

/// Settings key for the default CLI binary used for analyses.
pub const SETTING_DEFAULT_CLI_BINARY: &str = "analysis_default_cli_binary";

/// Default CLI binary if not configured.
pub const DEFAULT_CLI_BINARY: &str = "claude";

/// Seed built-in presets if the presets table is empty.
pub fn seed_presets(conn: &Connection) -> rusqlite::Result<()> {
    let existing = presets::list_analysis_presets(conn)?;
    if !existing.is_empty() {
        return Ok(());
    }

    presets::create_analysis_preset(
        conn,
        "Architecture Diagram",
        "diagram",
        "Analyze the codebase architecture. Produce a mermaid graph TD diagram showing the major \
         modules/services, their dependencies, and data flow. Include subgraphs for logical \
         groupings. Label edges with the type of interaction (HTTP, gRPC, function call, etc).",
        Some("on_main_change"),
    )?;

    presets::create_analysis_preset(
        conn,
        "Performance Analysis",
        "analysis",
        "Analyze the codebase for performance issues. Look for N+1 queries, unnecessary \
         allocations, blocking I/O in async contexts, missing indexes, and hot paths. \
         Produce a numbered list of findings with severity and suggested fixes.",
        Some("on_main_change"),
    )?;

    presets::create_analysis_preset(
        conn,
        "Security Scan",
        "analysis",
        "Perform a security review of the codebase. Check for injection vulnerabilities, \
         authentication/authorization issues, secrets in code, unsafe deserialization, \
         and OWASP Top 10 concerns. Produce a numbered list of findings with severity.",
        Some("on_main_change"),
    )?;

    presets::create_analysis_preset(
        conn,
        "Dependency Map",
        "diagram",
        "Map all external dependencies and internal module dependencies. Produce a mermaid \
         graph showing crate/package dependencies, version constraints, and any circular \
         dependencies. Highlight outdated or vulnerable dependencies.",
        Some("on_main_change"),
    )?;

    // Seed default settings
    settings::set(conn, SETTING_MAX_CONCURRENCY, &DEFAULT_MAX_CONCURRENCY.to_string())?;
    settings::set(conn, SETTING_DEFAULT_CLI_BINARY, DEFAULT_CLI_BINARY)?;

    Ok(())
}

/// Read the max concurrency setting from the database.
fn read_max_concurrency(db: &Arc<Mutex<Connection>>) -> usize {
    let conn = match db.lock() {
        Ok(c) => c,
        Err(_) => return DEFAULT_MAX_CONCURRENCY,
    };
    settings::get(&conn, SETTING_MAX_CONCURRENCY)
        .ok()
        .flatten()
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_MAX_CONCURRENCY)
}

/// Read the default CLI binary from the database.
pub fn read_cli_binary(db: &Arc<Mutex<Connection>>) -> String {
    let conn = match db.lock() {
        Ok(c) => c,
        Err(_) => return DEFAULT_CLI_BINARY.to_string(),
    };
    settings::get(&conn, SETTING_DEFAULT_CLI_BINARY)
        .ok()
        .flatten()
        .unwrap_or_else(|| DEFAULT_CLI_BINARY.to_string())
}

/// Get the main branch SHA, running the blocking git command off the async runtime.
async fn get_main_sha_async(repo_path: PathBuf) -> Option<String> {
    tokio::task::spawn_blocking(move || phantom_git::head_commit(&repo_path, "main").ok())
        .await
        .ok()
        .flatten()
}

/// Start the background scheduler. Must be called after the Tauri app is set up.
pub fn start_scheduler(
    app_handle: tauri::AppHandle,
    db: Arc<Mutex<Connection>>,
    repo_path: PathBuf,
) {
    // Start the git watcher in a background thread
    let (git_rx, _watcher) = match phantom_git::watch_git_dir(repo_path.clone()) {
        Ok(pair) => pair,
        Err(e) => {
            eprintln!("scheduler: failed to watch git dir: {e}");
            return;
        }
    };

    // Bridge git events from std::sync::mpsc to tokio::sync::mpsc
    let (tx, mut rx) = mpsc::channel::<GitEvent>(32);
    std::thread::spawn(move || {
        // Keep _watcher alive for the lifetime of this thread
        let _keep_alive = _watcher;
        while let Ok(event) = git_rx.recv() {
            if tx.blocking_send(event).is_err() {
                break;
            }
        }
    });

    // Tokio task: process git events and trigger analyses
    let db_clone = db.clone();
    let repo_clone = repo_path.clone();
    tauri::async_runtime::spawn(async move {
        let mut last_main_sha = get_main_sha_async(repo_clone.clone()).await;

        loop {
            tokio::select! {
                event = rx.recv() => {
                    match event {
                        Some(GitEvent::RefsChanged | GitEvent::HeadChanged) => {
                            let new_sha = get_main_sha_async(repo_clone.clone()).await;
                            if new_sha != last_main_sha {
                                last_main_sha = new_sha.clone();
                                if let Some(sha) = &new_sha {
                                    queue_scheduled_analyses(
                                        &app_handle,
                                        &db_clone,
                                        &repo_clone,
                                        sha,
                                    ).await;
                                }
                            }
                        }
                        None => break,
                    }
                }
                _ = tokio::time::sleep(Duration::from_secs(60)) => {
                    // Periodic poll for main changes
                    let new_sha = get_main_sha_async(repo_clone.clone()).await;
                    if new_sha != last_main_sha {
                        last_main_sha = new_sha.clone();
                        if let Some(sha) = &new_sha {
                            queue_scheduled_analyses(
                                &app_handle,
                                &db_clone,
                                &repo_clone,
                                sha,
                            ).await;
                        }
                    }
                }
            }
        }
    });
}

async fn queue_scheduled_analyses(
    app_handle: &tauri::AppHandle,
    db: &Arc<Mutex<Connection>>,
    repo_path: &PathBuf,
    commit_sha: &str,
) {
    // Find all presets with schedule = 'on_main_change'
    let scheduled_presets = {
        let conn = match db.lock() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("scheduler: db lock poisoned: {e}");
                return;
            }
        };
        match presets::list_analysis_presets(&conn) {
            Ok(p) => p,
            Err(_) => return,
        }
    };

    let repo_str = repo_path.to_string_lossy();

    // Read concurrency limit and CLI binary from settings
    let max_concurrency = read_max_concurrency(db);
    let cli_binary = read_cli_binary(db);
    let runner = Arc::new(JobRunner::with_concurrency(db.clone(), max_concurrency));

    for preset in scheduled_presets {
        if preset.schedule.as_deref() != Some("on_main_change") {
            continue;
        }

        // Check if we already have a completed analysis for this commit+preset
        let already_cached = {
            let conn = match db.lock() {
                Ok(c) => c,
                Err(_) => continue,
            };
            analyses::find_cached_analysis(&conn, &repo_str, commit_sha, preset.id, 1, None)
                .ok()
                .flatten()
                .is_some()
        };

        if already_cached {
            continue;
        }

        // Create analysis record
        let analysis_id = {
            let conn = match db.lock() {
                Ok(c) => c,
                Err(_) => continue,
            };
            match analyses::create_analysis(&conn, &repo_str, commit_sha, "main", preset.id, 1, None) {
                Ok(id) => id,
                Err(_) => continue,
            }
        };

        // Spawn the job (semaphore inside the runner limits concurrency)
        let (status_tx, mut status_rx) = mpsc::channel::<JobStatusUpdate>(16);
        let app_clone = app_handle.clone();
        tokio::spawn(async move {
            while let Some(update) = status_rx.recv().await {
                let _ = app_clone.emit("analysis:status_changed", &update);
            }
        });

        let runner = runner.clone();
        let prompt = preset.prompt_template.clone();
        let p_name = preset.name.clone();
        let p_type = preset.preset_type.clone();
        let rp = repo_path.clone();
        let cli = cli_binary.clone();
        tokio::spawn(async move {
            let _ = runner
                .run_analysis(analysis_id, &cli, &prompt, &rp, &p_name, &p_type, None, status_tx)
                .await;
        });
    }
}
