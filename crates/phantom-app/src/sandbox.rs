//! macOS sandbox-exec profile generation for project worktrees.
//!
//! Generates a sandbox profile that restricts a shell session to only
//! read/write the project worktree, read shared git objects, and access
//! standard system paths.

use std::path::Path;

/// Generate a sandbox-exec profile string for a worktree session.
///
/// The profile allows:
/// - Read/write to the worktree path
/// - Read access to the shared git objects directory
/// - Network access (for git operations, package managers, etc.)
/// - Standard system paths (/usr/bin, /usr/local/bin, /opt/homebrew/bin, dyld shared cache)
/// - Denies write to everything else
pub fn generate_profile(worktree_path: &str, repo_git_dir: &str) -> String {
    // Escape paths for use in sandbox profile (handle spaces and special chars)
    let worktree = escape_path(worktree_path);
    let git_dir = escape_path(repo_git_dir);

    format!(
        r#"(version 1)

;; Default: deny everything
(deny default)

;; Allow process execution
(allow process-exec)
(allow process-fork)

;; Allow reading standard system paths
(allow file-read*
    (subpath "/usr")
    (subpath "/bin")
    (subpath "/sbin")
    (subpath "/Library")
    (subpath "/System")
    (subpath "/private/var/db/dyld")
    (subpath "/private/etc")
    (subpath "/dev")
    (subpath "/opt/homebrew")
    (subpath "/tmp")
    (subpath "/var/folders")
    (literal "/etc")
    (literal "/var")
    (literal "/private"))

;; Allow writing to temp directories
(allow file-write*
    (subpath "/tmp")
    (subpath "/private/tmp")
    (subpath "/var/folders")
    (subpath "/dev"))

;; Allow read/write to the worktree
(allow file-read*
    (subpath "{worktree}"))
(allow file-write*
    (subpath "{worktree}"))

;; Allow reading the shared git objects directory
(allow file-read*
    (subpath "{git_dir}"))

;; Allow network access
(allow network*)

;; Allow sysctl reads (needed by many tools)
(allow sysctl-read)

;; Allow mach lookups (needed for IPC, DNS, etc.)
(allow mach-lookup)

;; Allow signal handling
(allow signal)

;; Allow IOKit (needed by some system libraries)
(allow iokit-open)

;; Allow reading user home directory essentials
(allow file-read*
    (subpath (param "HOME")))
"#,
        worktree = worktree,
        git_dir = git_dir,
    )
}

/// Escape a path for use in a sandbox profile.
fn escape_path(path: &str) -> String {
    // Sandbox profiles use double-quoted strings; escape backslashes and quotes
    path.replace('\\', "\\\\").replace('"', "\\\"")
}

/// Build a command that wraps the given shell command in sandbox-exec.
///
/// Returns the command and arguments to pass to the PTY spawner.
/// The shell command will be: `sandbox-exec -p <profile> /bin/sh -c <command>`
pub fn sandboxed_command(profile: &str, shell: &str) -> (String, Vec<String>) {
    (
        "sandbox-exec".to_string(),
        vec![
            "-p".to_string(),
            profile.to_string(),
            shell.to_string(),
        ],
    )
}

/// Save a sandbox profile to disk and return the file path.
pub fn save_profile(
    sandbox_dir: &Path,
    project_id: i64,
    profile: &str,
) -> Result<String, String> {
    std::fs::create_dir_all(sandbox_dir)
        .map_err(|e| format!("failed to create sandbox dir: {e}"))?;

    let path = sandbox_dir.join(format!("{project_id}.sb"));
    std::fs::write(&path, profile)
        .map_err(|e| format!("failed to write sandbox profile: {e}"))?;

    Ok(path.to_string_lossy().to_string())
}
