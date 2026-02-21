//! 60Hz render pump that extracts screen state and sends it to the frontend.
//!
//! Each session gets its own render pump running as a tokio task. The pump
//! grabs the session lock briefly each tick to extract cell data and check
//! for changes, then sends events to the frontend via a Tauri channel.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::sync::mpsc;

use phantom_vt::DamageInfo;

use crate::ipc::{cursor_shape_str, encode_row, DirtyRow, TerminalEvent};
use crate::state::{SessionId, SessionState};

/// Start the render pump for a session.
///
/// Runs at ~60Hz. Each tick:
/// 1. Lock the session
/// 2. Check if needs_full_frame -> send FullFrame event
/// 3. Otherwise check damage -> send DirtyRows for changed rows
/// 4. Check for title changes -> send TitleChanged
/// 5. Check for bell -> send Bell
/// 6. Check if process exited -> send Exited
///
/// The pump runs in a tokio task and stops when it receives a signal
/// on the stop channel, or when the session exits.
pub fn start_render_pump(
    _session_id: SessionId,
    session_state: Arc<Mutex<SessionState>>,
    channel: tauri::ipc::Channel<TerminalEvent>,
    mut stop_rx: mpsc::Receiver<()>,
) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_micros(16_667)); // ~60Hz
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            tokio::select! {
                _ = interval.tick() => {}
                _ = stop_rx.recv() => return,
            }

            let events = extract_events(&session_state);

            for event in events {
                let is_exited = matches!(event, TerminalEvent::Exited { .. });
                let _ = channel.send(event);
                if is_exited {
                    return;
                }
            }
        }
    });
}

/// Extract events from the session state. Holds the lock briefly.
fn extract_events(session_state: &Arc<Mutex<SessionState>>) -> Vec<TerminalEvent> {
    let mut events = Vec::new();

    let mut state = match session_state.lock() {
        Ok(s) => s,
        Err(_) => return events, // Poisoned lock.
    };

    // Snapshot and clear the PTY data flag.
    let had_pty_data = state.has_pty_data;
    state.has_pty_data = false;

    // Get cursor state.
    let cursor = state.session.vt().cursor();
    let cursor_row = cursor.row;
    let cursor_col = cursor.col;
    let cursor_shape = cursor_shape_str(cursor.shape);
    let cursor_visible = cursor.visible;

    if state.needs_full_frame {
        let screen = state.session.vt().screen();
        let cols = screen.cols();
        let rows = screen.rows();
        let mut cells = Vec::with_capacity(cols as usize * rows as usize * 16);
        for row in 0..rows {
            cells.extend_from_slice(&encode_row(&screen, row));
        }

        let _ = state.session.vt_mut().damage();
        state.session.vt_mut().reset_damage();
        state.needs_full_frame = false;

        events.push(TerminalEvent::FullFrame {
            cols,
            rows,
            cells,
            cursor_row,
            cursor_col,
            cursor_shape: cursor_shape.to_string(),
            cursor_visible,
        });
    } else {
        let damage = state.session.vt_mut().damage();
        match damage {
            DamageInfo::Full => {
                let screen = state.session.vt().screen();
                let cols = screen.cols();
                let rows = screen.rows();
                let mut cells = Vec::with_capacity(cols as usize * rows as usize * 16);
                for row in 0..rows {
                    cells.extend_from_slice(&encode_row(&screen, row));
                }
                state.session.vt_mut().reset_damage();

                events.push(TerminalEvent::FullFrame {
                    cols,
                    rows,
                    cells,
                    cursor_row,
                    cursor_col,
                    cursor_shape: cursor_shape.to_string(),
                    cursor_visible,
                });
            }
            DamageInfo::Partial(damaged_rows) => {
                // Suppress cursor-only damage when idle. alacritty always marks
                // the cursor row dirty (for blink support). If no PTY data
                // arrived since the last tick, skip encoding + sending.
                let only_cursor = !had_pty_data
                    && damaged_rows.len() == 1
                    && damaged_rows[0].row == cursor_row;

                if !damaged_rows.is_empty() && !only_cursor {
                    let screen = state.session.vt().screen();
                    let mut dirty_rows = Vec::with_capacity(damaged_rows.len());

                    // Deduplicate rows using a sorted dedup instead of HashSet.
                    let mut row_indices: Vec<u16> =
                        damaged_rows.iter().map(|d| d.row).collect();
                    row_indices.sort_unstable();
                    row_indices.dedup();

                    for row_idx in row_indices {
                        dirty_rows.push(DirtyRow {
                            y: row_idx,
                            cells: encode_row(&screen, row_idx),
                        });
                    }

                    state.session.vt_mut().reset_damage();

                    events.push(TerminalEvent::DirtyRows {
                        rows: dirty_rows,
                        cursor_row,
                        cursor_col,
                        cursor_shape: cursor_shape.to_string(),
                        cursor_visible,
                    });
                } else {
                    state.session.vt_mut().reset_damage();
                }
            }
        }
    }

    // Read title, bell, and PTY writes in one lock acquisition on EventProxy.
    let current_title = state.session.title().map(|s| s.to_string());
    if current_title != state.last_title {
        let title = current_title.clone().unwrap_or_default();
        events.push(TerminalEvent::TitleChanged { title });
        state.last_title = current_title;
    }

    if state.session.vt_mut().has_bell() {
        events.push(TerminalEvent::Bell);
    }

    if !state.session.is_alive() {
        let code = state.session.exit_code();
        events.push(TerminalEvent::Exited { code });
    }

    events
}
