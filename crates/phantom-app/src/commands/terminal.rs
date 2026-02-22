//! Tauri commands for terminal session management.
//!
//! These commands are invoked from the frontend via `invoke()` and handle
//! creating, writing to, resizing, and closing terminal sessions.

use std::sync::{Arc, Mutex};

use tokio::sync::mpsc;

use crate::io_thread::start_io_thread;
use crate::ipc::TerminalEvent;
use crate::render_pump::start_render_pump;
use crate::state::{AppState, SessionId, SessionState};

/// Create a new terminal session.
///
/// Spawns a PTY with the given shell (or default), starts the I/O thread
/// and render pump, and returns the session ID.
#[tauri::command]
pub async fn create_terminal(
    state: tauri::State<'_, AppState>,
    shell: Option<String>,
    cols: u16,
    rows: u16,
    channel: tauri::ipc::Channel<TerminalEvent>,
    working_dir: Option<String>,
) -> Result<SessionId, String> {
    let session_id = state.next_session_id();

    let mut session = phantom_pty::TerminalSession::new(
        session_id,
        shell.as_deref(),
        cols,
        rows,
        working_dir.as_deref(),
    )
    .map_err(|e| format!("Failed to create terminal session: {e}"))?;

    // Extract the PTY reader before putting session behind the mutex.
    // The I/O thread owns the reader directly so it can block without
    // holding the session lock.
    let pty_reader = session.take_pty_reader();

    let session_state = Arc::new(Mutex::new(SessionState {
        session,
        needs_full_frame: true,
        last_title: None,
        has_pty_data: false,
    }));

    // Create stop channels for I/O thread and render pump.
    let (io_stop_tx, io_stop_rx) = mpsc::channel::<()>(1);
    let (render_stop_tx, render_stop_rx) = mpsc::channel::<()>(1);

    // Start the I/O thread (dedicated OS thread for blocking PTY reads).
    start_io_thread(session_id, Arc::clone(&session_state), pty_reader, io_stop_rx);

    // Start the render pump (tokio task at ~60Hz).
    start_render_pump(
        session_id,
        Arc::clone(&session_state),
        channel,
        render_stop_rx,
    );

    // Store everything in global state.
    {
        let mut sessions = state.sessions.lock().map_err(|e| format!("Lock error: {e}"))?;
        sessions.insert(session_id, session_state);
    }
    {
        let mut io_stops = state.io_stops.lock().map_err(|e| format!("Lock error: {e}"))?;
        io_stops.insert(session_id, io_stop_tx);
    }
    {
        let mut render_stops = state
            .render_stops
            .lock()
            .map_err(|e| format!("Lock error: {e}"))?;
        render_stops.insert(session_id, render_stop_tx);
    }

    Ok(session_id)
}

/// Write user input bytes to a terminal session's PTY.
#[tauri::command]
pub async fn write_input(
    state: tauri::State<'_, AppState>,
    session_id: SessionId,
    data: Vec<u8>,
) -> Result<(), String> {
    let session_state = {
        let sessions = state.sessions.lock().map_err(|e| format!("Lock error: {e}"))?;
        sessions
            .get(&session_id)
            .cloned()
            .ok_or_else(|| format!("Session {session_id} not found"))?
    };

    let mut state = session_state
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?;
    state
        .session
        .write_input(&data)
        .map_err(|e| format!("Write error: {e}"))
}

/// Resize a terminal session's PTY and VT terminal.
#[tauri::command]
pub async fn resize_terminal(
    state: tauri::State<'_, AppState>,
    session_id: SessionId,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let session_state = {
        let sessions = state.sessions.lock().map_err(|e| format!("Lock error: {e}"))?;
        sessions
            .get(&session_id)
            .cloned()
            .ok_or_else(|| format!("Session {session_id} not found"))?
    };

    let mut state = session_state
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?;
    state
        .session
        .resize(cols, rows)
        .map_err(|e| format!("Resize error: {e}"))?;

    // Mark as needing a full frame after resize.
    state.needs_full_frame = true;

    Ok(())
}

/// Close a terminal session.
///
/// Sends stop signals to the I/O thread and render pump, then removes the
/// session from the global state.
#[tauri::command]
pub async fn close_terminal(
    state: tauri::State<'_, AppState>,
    session_id: SessionId,
) -> Result<(), String> {
    // Extract senders from the locks before awaiting, to avoid holding
    // std::sync::MutexGuard across an await (which is not Send).
    let io_stop_tx = state
        .io_stops
        .lock()
        .ok()
        .and_then(|mut stops| stops.remove(&session_id));

    let render_stop_tx = state
        .render_stops
        .lock()
        .ok()
        .and_then(|mut stops| stops.remove(&session_id));

    // Send stop signals (now safe to await since we dropped the MutexGuards).
    if let Some(tx) = io_stop_tx {
        let _ = tx.send(()).await;
    }
    if let Some(tx) = render_stop_tx {
        let _ = tx.send(()).await;
    }

    // Remove session from global state (this drops the session, which kills
    // the PTY child process via PtyHandle's Drop impl).
    if let Ok(mut sessions) = state.sessions.lock() {
        sessions.remove(&session_id);
    }

    Ok(())
}
