pub mod branches;
pub mod watcher;
pub mod worktrees;

pub use branches::{
    BranchInfo, current_branch, find_git_binary, head_commit, list_branches, merge_base,
};
pub use watcher::{GitEvent, resolve_git_dir, watch_git_dir};
pub use worktrees::{
    GhRepo, WorktreeInfo, check_gh_auth, clone_repo, create_worktree, list_gh_repos,
    list_worktrees, remove_worktree,
};
