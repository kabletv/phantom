use serde::Serialize;
use std::path::Path;
use tokio::process::Command;

/// Known CLI tools and their invocation conventions.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CliKind {
    Claude,
    Codex,
    Cursor,
    Unknown,
}

impl CliKind {
    /// Detect CLI kind from the binary name.
    pub fn detect(cli_binary: &str) -> Self {
        let name = Path::new(cli_binary)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(cli_binary);

        if name.starts_with("claude") {
            CliKind::Claude
        } else if name.starts_with("codex") {
            CliKind::Codex
        } else if name.starts_with("cursor") {
            CliKind::Cursor
        } else {
            CliKind::Unknown
        }
    }
}

/// Result of running a CLI command.
#[derive(Debug)]
pub struct CliOutput {
    pub raw_stdout: String,
    pub raw_stderr: String,
    pub exit_code: Option<i32>,
}

/// Human-readable error mapped from CLI-specific exit codes.
#[derive(Debug, Clone, Serialize)]
pub struct CliError {
    pub message: String,
    pub recoverable: bool,
}

/// Map exit codes to user-friendly error messages.
pub fn map_exit_error(kind: CliKind, code: i32, stderr: &str) -> CliError {
    match kind {
        CliKind::Claude => match code {
            3 => CliError {
                message: "Claude: missing API key. Run `claude login` to authenticate.".to_string(),
                recoverable: false,
            },
            _ => CliError {
                message: format!("Claude exited with code {code}: {}", first_line(stderr)),
                recoverable: false,
            },
        },
        CliKind::Codex => match code {
            124 => CliError {
                message: "Codex: rate limited. Wait a moment and retry.".to_string(),
                recoverable: true,
            },
            2 => CliError {
                message: "Codex: git safety check failed. Ensure the repo is clean.".to_string(),
                recoverable: false,
            },
            _ => CliError {
                message: format!("Codex exited with code {code}: {}", first_line(stderr)),
                recoverable: false,
            },
        },
        CliKind::Cursor => CliError {
            message: format!("Cursor exited with code {code}: {}", first_line(stderr)),
            recoverable: false,
        },
        CliKind::Unknown => CliError {
            message: format!("CLI exited with code {code}: {}", first_line(stderr)),
            recoverable: false,
        },
    }
}

fn first_line(s: &str) -> &str {
    s.lines().next().unwrap_or(s).trim()
}

/// Build the CLI command with correct flags for each tool.
pub fn build_command(
    cli_binary: &str,
    kind: CliKind,
    prompt: &str,
    repo_path: &Path,
    budget_usd: Option<f64>,
) -> Command {
    let mut cmd = Command::new(cli_binary);

    match kind {
        CliKind::Claude => {
            cmd.args(["-p", prompt, "--output-format", "json"]);
            if let Some(budget) = budget_usd {
                cmd.args(["--max-budget-usd", &budget.to_string()]);
            }
        }
        CliKind::Codex => {
            cmd.args(["exec", prompt, "--json"]);
        }
        CliKind::Cursor => {
            cmd.args(["agent", "-p", prompt]);
        }
        CliKind::Unknown => {
            // Best-effort: treat like Claude's old interface
            cmd.args(["--print", "-p", prompt]);
        }
    }

    cmd.current_dir(repo_path);
    cmd
}

/// Run the auth pre-check for a given CLI. Returns Ok(()) if authenticated,
/// or Err with a user-friendly message if not.
pub async fn check_auth(cli_binary: &str, kind: CliKind) -> Result<(), String> {
    match kind {
        CliKind::Claude => {
            // Attempt a minimal invocation; exit 3 = missing API key
            let output = Command::new(cli_binary)
                .args(["-p", "ping", "--output-format", "json"])
                .output()
                .await
                .map_err(|e| format!("failed to run {cli_binary}: {e}"))?;

            match output.status.code() {
                Some(3) => Err(
                    "Claude: missing API key. Run `claude login` to authenticate.".to_string(),
                ),
                Some(0) => Ok(()),
                Some(code) => {
                    // Non-zero but not 3 -- assume auth is fine, other errors
                    // will surface during the actual run
                    let _ = code;
                    Ok(())
                }
                None => Err("Claude process was killed by a signal".to_string()),
            }
        }
        CliKind::Codex => {
            let output = Command::new(cli_binary)
                .args(["login", "status"])
                .output()
                .await
                .map_err(|e| format!("failed to run {cli_binary}: {e}"))?;

            if output.status.success() {
                Ok(())
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Err(format!(
                    "Codex: not authenticated. Run `codex login`. {}",
                    first_line(&stderr)
                ))
            }
        }
        CliKind::Cursor => {
            let output = Command::new(cli_binary)
                .args(["agent", "status"])
                .output()
                .await
                .map_err(|e| format!("failed to run {cli_binary}: {e}"))?;

            if output.status.success() {
                Ok(())
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Err(format!(
                    "Cursor: not authenticated. Check Cursor agent status. {}",
                    first_line(&stderr)
                ))
            }
        }
        CliKind::Unknown => {
            // No auth check for unknown CLIs
            Ok(())
        }
    }
}

/// Extract the analysis payload from raw CLI stdout.
///
/// - Claude/Cursor: single JSON response, return as-is
/// - Codex: JSONL stream, scan for AgentMessage events and concatenate content
pub fn extract_payload(kind: CliKind, stdout: &str) -> String {
    match kind {
        CliKind::Codex => extract_codex_payload(stdout),
        _ => stdout.to_string(),
    }
}

/// Codex outputs JSONL (one JSON object per line). Scan for AgentMessage
/// events and concatenate their content fields.
fn extract_codex_payload(stdout: &str) -> String {
    let mut content_parts = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        if let Ok(obj) = serde_json::from_str::<serde_json::Value>(line) {
            // Look for AgentMessage type events
            let is_agent_msg = obj
                .get("type")
                .and_then(|t| t.as_str())
                .map(|t| t == "AgentMessage" || t == "agent_message")
                .unwrap_or(false);

            if is_agent_msg {
                if let Some(content) = obj.get("content").and_then(|c| c.as_str()) {
                    content_parts.push(content.to_string());
                }
            }

            // Also check for a top-level "message" field with content
            if content_parts.is_empty() {
                if let Some(msg) = obj.get("message") {
                    if let Some(content) = msg.get("content").and_then(|c| c.as_str()) {
                        content_parts.push(content.to_string());
                    }
                }
            }
        }
    }

    if content_parts.is_empty() {
        // Fallback: return stdout as-is if we couldn't find JSONL events
        stdout.to_string()
    } else {
        content_parts.join("\n")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_cli_kind() {
        assert_eq!(CliKind::detect("claude"), CliKind::Claude);
        assert_eq!(CliKind::detect("/usr/local/bin/claude"), CliKind::Claude);
        assert_eq!(CliKind::detect("claude-code"), CliKind::Claude);
        assert_eq!(CliKind::detect("codex"), CliKind::Codex);
        assert_eq!(CliKind::detect("/opt/codex"), CliKind::Codex);
        assert_eq!(CliKind::detect("cursor"), CliKind::Cursor);
        assert_eq!(CliKind::detect("my-custom-ai"), CliKind::Unknown);
    }

    #[test]
    fn test_map_exit_error_claude() {
        let err = map_exit_error(CliKind::Claude, 3, "");
        assert!(err.message.contains("missing API key"));
        assert!(!err.recoverable);
    }

    #[test]
    fn test_map_exit_error_codex_rate_limit() {
        let err = map_exit_error(CliKind::Codex, 124, "");
        assert!(err.message.contains("rate limited"));
        assert!(err.recoverable);
    }

    #[test]
    fn test_map_exit_error_codex_git_safety() {
        let err = map_exit_error(CliKind::Codex, 2, "dirty working tree");
        assert!(err.message.contains("git safety"));
        assert!(!err.recoverable);
    }

    #[test]
    fn test_extract_payload_passthrough() {
        let raw = "```json\n{\"version\": 1}\n```";
        assert_eq!(extract_payload(CliKind::Claude, raw), raw);
        assert_eq!(extract_payload(CliKind::Cursor, raw), raw);
    }

    #[test]
    fn test_extract_codex_jsonl() {
        let stdout = r#"{"type":"AgentMessage","content":"Here is the result:"}
{"type":"AgentMessage","content":"```json\n{\"version\":1}\n```"}
{"type":"system","content":"done"}
"#;
        let payload = extract_payload(CliKind::Codex, stdout);
        assert!(payload.contains("Here is the result:"));
        assert!(payload.contains("```json"));
    }

    #[test]
    fn test_extract_codex_fallback() {
        // If no JSONL events found, return raw stdout
        let stdout = "plain text output with no jsonl";
        let payload = extract_payload(CliKind::Codex, stdout);
        assert_eq!(payload, stdout);
    }
}
