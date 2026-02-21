//! Per-session I/O thread that reads PTY output and feeds it into the VT terminal.
//!
//! Each terminal session gets its own dedicated OS thread because PTY reads
//! are blocking. The PTY reader is owned by the I/O thread directly (not behind
//! the session mutex), so blocking reads don't prevent the render pump or
//! commands from accessing the session state.

use std::io::Read;
use std::sync::{Arc, Mutex};

use tokio::sync::mpsc;

use crate::state::{SessionId, SessionState};

/// Start the I/O read loop for a session on a dedicated OS thread.
///
/// The `reader` is the PTY reader extracted from the session before it was
/// placed behind the mutex. This allows blocking reads without holding
/// the session lock.
pub fn start_io_thread(
    session_id: SessionId,
    session_state: Arc<Mutex<SessionState>>,
    reader: Box<dyn Read + Send>,
    mut stop_rx: mpsc::Receiver<()>,
) {
    std::thread::Builder::new()
        .name(format!("pty-io-{session_id}"))
        .spawn(move || {
            io_loop(session_state, reader, &mut stop_rx);
        })
        .expect("failed to spawn I/O thread");
}

fn io_loop(
    session_state: Arc<Mutex<SessionState>>,
    mut reader: Box<dyn Read + Send>,
    stop_rx: &mut mpsc::Receiver<()>,
) {
    let mut buf = [0u8; 65536];

    loop {
        // Check for stop signal (non-blocking).
        match stop_rx.try_recv() {
            Ok(()) => return,
            Err(mpsc::error::TryRecvError::Disconnected) => return,
            Err(mpsc::error::TryRecvError::Empty) => {}
        }

        // Read from PTY — this blocks until data is available or PTY closes.
        // The reader is NOT behind the session mutex, so this doesn't block
        // the render pump or Tauri commands.
        let n = match reader.read(&mut buf) {
            Ok(0) => return,  // EOF — PTY closed
            Ok(n) => n,
            Err(_) => return, // Read error — PTY likely closed
        };

        // Lock session briefly to feed bytes into VT and handle write-backs.
        {
            let mut state = match session_state.lock() {
                Ok(s) => s,
                Err(_) => return, // Poisoned lock
            };

            state.session.vt_mut().write(&buf[..n]);
            let _ = state.session.handle_write_backs();
            state.has_pty_data = true;
        }
        // Lock released — render pump and commands can access the session.
    }
}
