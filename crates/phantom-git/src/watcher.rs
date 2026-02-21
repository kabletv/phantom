use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc;

pub enum GitEvent {
    RefsChanged,
    HeadChanged,
}

/// Resolve the actual git directory from a repo path.
/// Handles both normal repos (where `.git` is a directory) and worktrees
/// (where `.git` is a file containing `gitdir: /path/to/real/git/dir`).
pub fn resolve_git_dir(repo_path: &Path) -> Result<PathBuf, String> {
    let dot_git = repo_path.join(".git");

    if !dot_git.exists() {
        return Err(format!(
            "not a git repository: {} does not exist",
            dot_git.display()
        ));
    }

    if dot_git.is_dir() {
        return Ok(dot_git);
    }

    // .git is a file -- this is a worktree. Read the gitdir pointer.
    let content = fs::read_to_string(&dot_git)
        .map_err(|e| format!("failed to read .git file: {e}"))?;

    let gitdir_path = content
        .strip_prefix("gitdir: ")
        .ok_or_else(|| format!("unexpected .git file format: {content}"))?
        .trim();

    let resolved = if Path::new(gitdir_path).is_absolute() {
        PathBuf::from(gitdir_path)
    } else {
        repo_path.join(gitdir_path)
    };

    if !resolved.exists() {
        return Err(format!(
            "git directory does not exist: {}",
            resolved.display()
        ));
    }

    Ok(resolved)
}

/// Watch .git/refs/ (including remotes/) and .git/HEAD for changes.
/// Returns a receiver that emits GitEvents, plus a handle to keep the watcher alive.
pub fn watch_git_dir(
    repo_path: PathBuf,
) -> Result<(mpsc::Receiver<GitEvent>, RecommendedWatcher), String> {
    let (tx, rx) = mpsc::channel();

    let git_dir = resolve_git_dir(&repo_path)?;

    let refs_dir = git_dir.join("refs");
    let head_file = git_dir.join("HEAD");

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                for path in &event.paths {
                    if path.starts_with(&refs_dir) {
                        let _ = tx.send(GitEvent::RefsChanged);
                    } else if path.ends_with("HEAD") || path == &head_file {
                        // Use ends_with("HEAD") as well for macOS compatibility,
                        // where notify may canonicalize paths differently.
                        let _ = tx.send(GitEvent::HeadChanged);
                    }
                }
            }
        },
        Config::default(),
    )
    .map_err(|e| format!("failed to create watcher: {e}"))?;

    // Watch all of refs/ recursively -- this includes refs/heads/, refs/tags/,
    // and refs/remotes/ so we detect local branch changes, tags, and git fetch.
    watcher
        .watch(&git_dir.join("refs"), RecursiveMode::Recursive)
        .map_err(|e| format!("failed to watch refs: {e}"))?;
    watcher
        .watch(&git_dir.join("HEAD"), RecursiveMode::NonRecursive)
        .map_err(|e| format!("failed to watch HEAD: {e}"))?;

    Ok((rx, watcher))
}
