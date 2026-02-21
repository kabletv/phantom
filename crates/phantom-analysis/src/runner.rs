use phantom_db::analyses;
use rusqlite::Connection;
use serde::Serialize;
use std::sync::{Arc, Mutex};
use tokio::sync::{mpsc, Semaphore};

use crate::cli::{self, CliKind};
use crate::parser;

/// Default maximum number of concurrent analysis jobs.
pub const DEFAULT_MAX_CONCURRENCY: usize = 2;

#[derive(Debug, Clone, Serialize)]
pub struct JobStatusUpdate {
    pub analysis_id: i64,
    pub status: String,
}

pub struct JobRunner {
    db: Arc<Mutex<Connection>>,
    semaphore: Arc<Semaphore>,
}

impl JobRunner {
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        Self {
            db,
            semaphore: Arc::new(Semaphore::new(DEFAULT_MAX_CONCURRENCY)),
        }
    }

    pub fn with_concurrency(db: Arc<Mutex<Connection>>, max_concurrency: usize) -> Self {
        Self {
            db,
            semaphore: Arc::new(Semaphore::new(max_concurrency)),
        }
    }

    /// Create a runner that shares an existing semaphore (for global concurrency control).
    pub fn with_semaphore(db: Arc<Mutex<Connection>>, semaphore: Arc<Semaphore>) -> Self {
        Self { db, semaphore }
    }

    /// Get a reference to the semaphore so callers can share it across runners.
    pub fn semaphore(&self) -> &Arc<Semaphore> {
        &self.semaphore
    }

    pub async fn run_analysis(
        &self,
        analysis_id: i64,
        cli_binary: &str,
        prompt: &str,
        repo_path: &std::path::Path,
        preset_name: &str,
        preset_type: &str,
        budget_usd: Option<f64>,
        status_tx: mpsc::Sender<JobStatusUpdate>,
    ) -> Result<(), String> {
        // Acquire a semaphore permit to limit concurrency
        let _permit = self
            .semaphore
            .acquire()
            .await
            .map_err(|e| format!("semaphore closed: {e}"))?;

        let kind = CliKind::detect(cli_binary);

        // Update status to running
        self.update_status(analysis_id, "running", None, None, None, None)?;
        let _ = status_tx
            .send(JobStatusUpdate {
                analysis_id,
                status: "running".to_string(),
            })
            .await;

        // Build and spawn the CLI process with correct flags for each tool
        let output = cli::build_command(cli_binary, kind, prompt, repo_path, budget_usd)
            .output()
            .await
            .map_err(|e| format!("failed to spawn {cli_binary}: {e}"))?;

        let raw_stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let raw_stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if !output.status.success() {
            let exit_code = output.status.code().unwrap_or(-1);
            let cli_err = cli::map_exit_error(kind, exit_code, &raw_stderr);
            self.update_status(
                analysis_id,
                "failed",
                Some(&raw_stdout),
                None,
                None,
                Some(&cli_err.message),
            )?;
            let _ = status_tx
                .send(JobStatusUpdate {
                    analysis_id,
                    status: "failed".to_string(),
                })
                .await;
            return Err(cli_err.message);
        }

        // Extract the analysis payload (handles Codex JSONL concatenation)
        let payload = cli::extract_payload(kind, &raw_stdout);

        // Parse output based on preset type
        let (parsed_graph, parsed_findings, error_message) = if preset_type == "diagram" {
            match parser::parse_graph(&payload) {
                Ok(parsed) => {
                    let graph_json = serde_json::to_string(&parsed.graph)
                        .unwrap_or_else(|_| "{}".to_string());
                    let warnings: Vec<String> =
                        parsed.warnings.iter().map(|w| w.message.clone()).collect();
                    let err = if warnings.is_empty() {
                        None
                    } else {
                        Some(warnings.join("; "))
                    };
                    (Some(graph_json), None, err)
                }
                Err(e) => (None, None, Some(e)),
            }
        } else {
            // Analysis preset (performance, security, custom)
            match parser::parse_findings(&payload, preset_name) {
                Ok(parsed) => {
                    let findings_json = serde_json::to_string(&parsed.findings)
                        .unwrap_or_else(|_| "{}".to_string());
                    let warnings: Vec<String> =
                        parsed.warnings.iter().map(|w| w.message.clone()).collect();
                    let err = if warnings.is_empty() {
                        None
                    } else {
                        Some(warnings.join("; "))
                    };
                    (None, Some(findings_json), err)
                }
                Err(e) => (None, None, Some(e)),
            }
        };

        // Determine final status
        let status = if parsed_graph.is_some() || parsed_findings.is_some() {
            "completed"
        } else {
            "failed"
        };

        self.update_status(
            analysis_id,
            status,
            Some(&raw_stdout),
            parsed_graph.as_deref(),
            parsed_findings.as_deref(),
            error_message.as_deref(),
        )?;
        let _ = status_tx
            .send(JobStatusUpdate {
                analysis_id,
                status: status.to_string(),
            })
            .await;

        if status == "failed" {
            Err(error_message.unwrap_or_else(|| "parse failed".to_string()))
        } else {
            Ok(())
        }
    }

    /// Synchronous DB update -- lock is acquired and released within this call,
    /// never held across an await point.
    fn update_status(
        &self,
        id: i64,
        status: &str,
        raw_output: Option<&str>,
        parsed_graph: Option<&str>,
        parsed_findings: Option<&str>,
        error_message: Option<&str>,
    ) -> Result<(), String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("db lock poisoned: {e}"))?;
        analyses::update_analysis_status(
            &conn,
            id,
            status,
            raw_output,
            parsed_graph,
            parsed_findings,
            error_message,
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}
