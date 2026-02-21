//! Application state shared between Tauri commands, I/O threads, and the render pump.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

pub type SessionId = u64;

/// Per-session state shared between I/O thread, render pump, and commands.
pub struct SessionState {
    /// The terminal session (PTY + VT).
    pub session: phantom_pty::TerminalSession,
    /// Set `true` on creation and after resize to trigger a full frame send.
    pub needs_full_frame: bool,
    /// Cached title from the last render pump tick, used to detect changes.
    pub last_title: Option<String>,
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
}

impl AppState {
    /// Create a new, empty AppState.
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            io_stops: Arc::new(Mutex::new(HashMap::new())),
            render_stops: Arc::new(Mutex::new(HashMap::new())),
            next_id: AtomicU64::new(1),
        }
    }

    /// Allocate the next unique session ID.
    pub fn next_session_id(&self) -> SessionId {
        self.next_id.fetch_add(1, Ordering::Relaxed)
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
