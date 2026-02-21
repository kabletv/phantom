//! Per-session I/O thread that reads PTY output and feeds it into the VT terminal.
//!
//! Each terminal session gets its own dedicated OS thread because PTY reads
//! are blocking. The thread holds the session lock only briefly during
//! read+write cycles, allowing the render pump to grab the lock between reads.

use std::sync::{Arc, Mutex};

use tokio::sync::mpsc;

use crate::state::{SessionId, SessionState};

/// Start the I/O read loop for a session on a dedicated OS thread.
///
/// Reads PTY output in a loop and feeds it into the VT terminal.
/// Stops when it receives a signal on the stop channel or the PTY closes.
pub fn start_io_thread(
    session_id: SessionId,
    session_state: Arc<Mutex<SessionState>>,
    mut stop_rx: mpsc::Receiver<()>,
) {
    std::thread::Builder::new()
        .name(format!("pty-io-{session_id}"))
        .spawn(move || {
            io_loop(session_id, session_state, &mut stop_rx);
        })
        .expect("failed to spawn I/O thread");
}

fn io_loop(
    _session_id: SessionId,
    session_state: Arc<Mutex<SessionState>>,
    stop_rx: &mut mpsc::Receiver<()>,
) {
    loop {
        // Check for stop signal (non-blocking).
        match stop_rx.try_recv() {
            Ok(()) => return,
            Err(mpsc::error::TryRecvError::Disconnected) => return,
            Err(mpsc::error::TryRecvError::Empty) => {}
        }

        // Lock the session, read from PTY, feed into VT.
        let should_stop = {
            let mut state = match session_state.lock() {
                Ok(s) => s,
                Err(_) => return, // Poisoned lock, bail out.
            };

            match state.session.process_pty_output() {
                Ok(0) => {
                    // No data available yet, or EOF. Check if the process exited.
                    !state.session.is_alive()
                }
                Ok(_n) => {
                    // Successfully processed some bytes. Continue the loop.
                    false
                }
                Err(_) => {
                    // PTY read error (likely process exited and PTY closed).
                    true
                }
            }
        };
        // Lock is released here, giving render pump a chance.

        if should_stop {
            return;
        }

        // Small sleep to avoid busy-spinning when there is no data.
        // The PTY read itself is blocking, but process_pty_output uses a
        // fixed-size buffer and may return quickly if no data is available.
        // This sleep is a fallback for the case where read returns 0 but
        // the process is still alive (e.g., idle shell).
        std::thread::sleep(std::time::Duration::from_millis(1));
    }
}
