use std::collections::HashMap;

use crate::pty::PtyError;
use crate::session::{SessionId, TerminalSession};

/// Manages multiple terminal sessions, providing tab-like multiplexing.
///
/// The `Multiplexer` will be owned by the Tauri app's `AppState` and
/// driven by the render pump to process PTY output for all active sessions.
pub struct Multiplexer {
    sessions: HashMap<SessionId, TerminalSession>,
    next_id: SessionId,
}

impl Multiplexer {
    /// Create a new, empty multiplexer.
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
            next_id: 1,
        }
    }

    /// Create a new terminal session and return its ID.
    pub fn create_session(
        &mut self,
        shell: Option<&str>,
        cols: u16,
        rows: u16,
    ) -> Result<SessionId, PtyError> {
        let id = self.next_id;
        let session = TerminalSession::new(id, shell, cols, rows)?;
        self.sessions.insert(id, session);
        self.next_id += 1;
        Ok(id)
    }

    /// Get a reference to a session by ID.
    pub fn get_session(&self, id: SessionId) -> Option<&TerminalSession> {
        self.sessions.get(&id)
    }

    /// Get a mutable reference to a session by ID.
    pub fn get_session_mut(&mut self, id: SessionId) -> Option<&mut TerminalSession> {
        self.sessions.get_mut(&id)
    }

    /// Close and remove a session.
    pub fn close_session(&mut self, id: SessionId) {
        self.sessions.remove(&id);
    }

    /// List all session IDs.
    pub fn list_sessions(&self) -> Vec<SessionId> {
        let mut ids: Vec<SessionId> = self.sessions.keys().copied().collect();
        ids.sort();
        ids
    }

    /// Process PTY output for all active sessions.
    ///
    /// Returns a list of session IDs that had new data. Sessions that
    /// encounter I/O errors are silently skipped (they may have exited).
    pub fn process_all(&mut self) -> Vec<SessionId> {
        let mut active_ids: Vec<SessionId> = Vec::new();

        let ids: Vec<SessionId> = self.sessions.keys().copied().collect();
        for id in ids {
            if let Some(session) = self.sessions.get_mut(&id) {
                match session.process_pty_output() {
                    Ok(n) if n > 0 => {
                        active_ids.push(id);
                    }
                    _ => {}
                }
            }
        }

        active_ids
    }
}

impl Default for Multiplexer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_and_list_sessions() {
        let mut mux = Multiplexer::new();

        let id1 = mux.create_session(Some("/bin/sh"), 80, 24).unwrap();
        let id2 = mux.create_session(Some("/bin/sh"), 80, 24).unwrap();

        assert_ne!(id1, id2);
        assert_eq!(mux.list_sessions(), vec![id1, id2]);
    }

    #[test]
    fn test_get_session() {
        let mut mux = Multiplexer::new();
        let id = mux.create_session(Some("/bin/sh"), 80, 24).unwrap();

        assert!(mux.get_session(id).is_some());
        assert!(mux.get_session_mut(id).is_some());
        assert!(mux.get_session(999).is_none());
    }

    #[test]
    fn test_close_session() {
        let mut mux = Multiplexer::new();
        let id = mux.create_session(Some("/bin/sh"), 80, 24).unwrap();

        assert!(mux.get_session(id).is_some());
        mux.close_session(id);
        assert!(mux.get_session(id).is_none());
        assert!(mux.list_sessions().is_empty());
    }

    #[test]
    fn test_close_nonexistent_session() {
        let mut mux = Multiplexer::new();
        // Closing a non-existent session should not panic.
        mux.close_session(999);
    }

    #[test]
    fn test_session_ids_increment() {
        let mut mux = Multiplexer::new();
        let id1 = mux.create_session(Some("/bin/sh"), 80, 24).unwrap();
        let id2 = mux.create_session(Some("/bin/sh"), 80, 24).unwrap();
        let id3 = mux.create_session(Some("/bin/sh"), 80, 24).unwrap();

        assert_eq!(id1, 1);
        assert_eq!(id2, 2);
        assert_eq!(id3, 3);
    }

    #[test]
    fn test_default_trait() {
        let mux = Multiplexer::default();
        assert!(mux.list_sessions().is_empty());
    }
}
