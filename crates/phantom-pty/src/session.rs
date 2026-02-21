use phantom_vt::VtTerminal;

use crate::pty::{PtyError, PtyHandle};

/// Unique identifier for a terminal session.
pub type SessionId = u64;

/// A terminal session that pairs a PTY process with a VT terminal emulator.
///
/// Reads shell output from the PTY, feeds it into the VtTerminal for parsing,
/// and writes user input back to the shell. This is the primary abstraction
/// for managing a single terminal tab.
pub struct TerminalSession {
    id: SessionId,
    vt: VtTerminal,
    pty: PtyHandle,
    title: Option<String>,
    alive: bool,
    exit_code: Option<u32>,
}

impl TerminalSession {
    /// Create a new terminal session.
    ///
    /// Spawns a PTY process with the given shell (or the user's default shell)
    /// and a VtTerminal with the given dimensions.
    pub fn new(
        id: SessionId,
        shell: Option<&str>,
        cols: u16,
        rows: u16,
    ) -> Result<Self, PtyError> {
        let pty = PtyHandle::spawn(shell, cols, rows)?;
        let vt = VtTerminal::new(cols, rows);

        Ok(Self {
            id,
            vt,
            pty,
            title: None,
            alive: true,
            exit_code: None,
        })
    }

    /// Returns the session's unique identifier.
    pub fn id(&self) -> SessionId {
        self.id
    }

    /// Read available PTY output and feed it into the VT terminal.
    ///
    /// Call this in a loop from the I/O thread. After feeding bytes into the
    /// VT parser, any write-back data (e.g., device status responses) is
    /// automatically written back to the PTY.
    ///
    /// Returns the number of bytes processed.
    pub fn process_pty_output(&mut self) -> Result<usize, PtyError> {
        let mut buf = [0u8; 4096];
        let n = self.pty.read(&mut buf)?;

        if n > 0 {
            self.vt.write(&buf[..n]);

            // Handle VT write-backs (e.g., device status responses).
            let writes = self.vt.take_pty_writes();
            for data in &writes {
                self.pty.write(data.as_bytes())?;
            }

            // Sync the title from the VT terminal.
            self.title = self.vt.title_owned();
        }

        // Check if the child process has exited.
        if let Some(code) = self.pty.try_wait() {
            self.alive = false;
            self.exit_code = Some(code);
        }

        Ok(n)
    }

    /// Write user input to the PTY.
    pub fn write_input(&mut self, data: &[u8]) -> Result<(), PtyError> {
        self.pty.write(data)
    }

    /// Resize both the PTY and VT terminal.
    pub fn resize(&mut self, cols: u16, rows: u16) -> Result<(), PtyError> {
        self.pty.resize(cols, rows)?;
        self.vt.resize(cols, rows);
        Ok(())
    }

    /// Get a reference to the VT terminal for screen reading.
    pub fn vt(&self) -> &VtTerminal {
        &self.vt
    }

    /// Get a mutable reference to the VT terminal.
    pub fn vt_mut(&mut self) -> &mut VtTerminal {
        &mut self.vt
    }

    /// Check if the session is still alive.
    ///
    /// Returns `false` after the child process has exited.
    pub fn is_alive(&mut self) -> bool {
        if self.alive {
            if let Some(code) = self.pty.try_wait() {
                self.alive = false;
                self.exit_code = Some(code);
            }
        }
        self.alive
    }

    /// Get exit code if the process has exited.
    pub fn exit_code(&mut self) -> Option<u32> {
        if self.exit_code.is_none() {
            if let Some(code) = self.pty.try_wait() {
                self.alive = false;
                self.exit_code = Some(code);
            }
        }
        self.exit_code
    }

    /// Extract the PTY reader for use in a dedicated I/O thread.
    ///
    /// After calling this, `process_pty_output()` will no longer read from the PTY.
    /// The caller should read from the returned reader and feed bytes into
    /// `vt_mut().write()` manually, then call `handle_write_backs()`.
    pub fn take_pty_reader(&mut self) -> Box<dyn std::io::Read + Send> {
        self.pty.take_reader()
    }

    /// Write VT write-back data to the PTY and sync title.
    ///
    /// Call this after feeding bytes into `vt_mut().write()` to handle
    /// device status responses and title changes.
    pub fn handle_write_backs(&mut self) -> Result<(), PtyError> {
        let writes = self.vt.take_pty_writes();
        for data in &writes {
            self.pty.write(data.as_bytes())?;
        }
        self.title = self.vt.title_owned();
        Ok(())
    }

    /// Get the current session title (set by shell via OSC escape sequences).
    pub fn title(&self) -> Option<&str> {
        self.title.as_deref()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn test_create_session() {
        let session = TerminalSession::new(1, Some("/bin/sh"), 80, 24);
        assert!(session.is_ok(), "Failed to create session: {:?}", session.err());
        let mut session = session.unwrap();
        assert_eq!(session.id(), 1);
        assert!(session.is_alive());
    }

    #[test]
    fn test_session_write_and_process() {
        let mut session = TerminalSession::new(1, Some("/bin/sh"), 80, 24).unwrap();

        // Write input to the shell.
        session.write_input(b"echo SESS_TEST\n").unwrap();

        // Give the shell time to process and produce output.
        thread::sleep(Duration::from_millis(500));

        // Process PTY output into the VT terminal.
        let mut total_bytes = 0;
        let deadline = std::time::Instant::now() + Duration::from_secs(3);
        loop {
            if std::time::Instant::now() > deadline {
                break;
            }
            match session.process_pty_output() {
                Ok(0) => break,
                Ok(n) => {
                    total_bytes += n;
                    // Check if we've received enough to see our output.
                    // The VT terminal now contains the parsed screen state.
                    let screen = session.vt().screen();
                    let mut text = String::new();
                    for row in 0..screen.rows() {
                        for col in 0..screen.cols() {
                            text.push(screen.cell(row, col).codepoint);
                        }
                    }
                    if text.contains("SESS_TEST") {
                        break;
                    }
                }
                Err(_) => break,
            }
        }

        assert!(total_bytes > 0, "Expected some PTY output to be processed");
    }

    #[test]
    fn test_session_resize() {
        let mut session = TerminalSession::new(1, Some("/bin/sh"), 80, 24).unwrap();

        let result = session.resize(120, 40);
        assert!(result.is_ok(), "Resize failed: {:?}", result.err());

        let screen = session.vt().screen();
        assert_eq!(screen.cols(), 120);
        assert_eq!(screen.rows(), 40);
    }

    #[test]
    fn test_session_exit() {
        let mut session = TerminalSession::new(1, Some("/bin/sh"), 80, 24).unwrap();

        session.write_input(b"exit 0\n").unwrap();

        let deadline = std::time::Instant::now() + Duration::from_secs(3);
        loop {
            if std::time::Instant::now() > deadline {
                break;
            }
            // Process any remaining output.
            let _ = session.process_pty_output();
            if !session.is_alive() {
                break;
            }
            thread::sleep(Duration::from_millis(100));
        }

        assert!(!session.is_alive(), "Session should have exited");
        assert_eq!(session.exit_code(), Some(0));
    }
}
