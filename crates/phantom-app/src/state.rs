//! Application state shared between Tauri commands, I/O threads, and the render pump.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use rusqlite::Connection;
use tokio::sync::{mpsc, Semaphore};

pub type SessionId = u64;

/// Per-session state shared between I/O thread, render pump, and commands.
pub struct SessionState {
    /// The terminal session (PTY + VT).
    pub session: phantom_pty::TerminalSession,
    /// Set `true` on creation and after resize to trigger a full frame send.
    pub needs_full_frame: bool,
    /// Cached title from the last render pump tick, used to detect changes.
    pub last_title: Option<String>,
    /// Set by the I/O thread after writing PTY data; cleared by the render pump.
    /// Used to suppress DirtyRows events when only the cursor row is damaged
    /// (alacritty always marks the cursor row dirty for blink support).
    pub has_pty_data: bool,
}

/// Global app state managed by Tauri.
pub struct AppState {
    /// All active sessions, keyed by session ID.
    pub sessions: Arc<Mutex<HashMap<SessionId, Arc<Mutex<SessionState>>>>>,
    /// Channels to signal I/O threads to stop.
    pub io_stops: Arc<Mutex<HashMap<SessionId, mpsc::Sender<()>>>>,
    /// Channels to signal render pumps to stop.
    pub render_stops: Arc<Mutex<HashMap<SessionId, mpsc::Sender<()>>>>,
    /// Monotonically increasing session ID counter.
    next_id: AtomicU64,
    /// SQLite database connection.
    pub db: Arc<Mutex<Connection>>,
    /// Path to the repo being managed.
    pub repo_path: PathBuf,
    /// Shared semaphore to limit concurrent analysis jobs.
    pub analysis_semaphore: Arc<Semaphore>,
}

impl AppState {
    /// Create a new AppState with a database connection and repo path.
    pub fn new(db: Connection, repo_path: PathBuf) -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            io_stops: Arc::new(Mutex::new(HashMap::new())),
            render_stops: Arc::new(Mutex::new(HashMap::new())),
            next_id: AtomicU64::new(1),
            db: Arc::new(Mutex::new(db)),
            repo_path,
            analysis_semaphore: Arc::new(Semaphore::new(
                phantom_analysis::runner::DEFAULT_MAX_CONCURRENCY,
            )),
        }
    }

    /// Allocate the next unique session ID.
    pub fn next_session_id(&self) -> SessionId {
        self.next_id.fetch_add(1, Ordering::Relaxed)
    }
}
