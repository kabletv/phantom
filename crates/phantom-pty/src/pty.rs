use std::io::{Read, Write};

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};

/// Errors from PTY operations.
#[derive(Debug)]
pub enum PtyError {
    SpawnFailed(String),
    IoError(std::io::Error),
    ResizeFailed(String),
}

impl std::fmt::Display for PtyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PtyError::SpawnFailed(msg) => write!(f, "PTY spawn failed: {msg}"),
            PtyError::IoError(err) => write!(f, "PTY I/O error: {err}"),
            PtyError::ResizeFailed(msg) => write!(f, "PTY resize failed: {msg}"),
        }
    }
}

impl std::error::Error for PtyError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            PtyError::IoError(err) => Some(err),
            _ => None,
        }
    }
}

impl From<std::io::Error> for PtyError {
    fn from(err: std::io::Error) -> Self {
        PtyError::IoError(err)
    }
}

/// Owns a portable-pty child process, master pair, reader, and writer.
pub struct PtyHandle {
    master: Box<dyn MasterPty + Send>,
    reader: Box<dyn Read + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

impl PtyHandle {
    /// Spawn a new PTY with the given shell command and dimensions.
    ///
    /// If `shell` is `None`, uses the user's default shell (`$SHELL` or `/bin/sh`).
    pub fn spawn(shell: Option<&str>, cols: u16, rows: u16) -> Result<Self, PtyError> {
        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| PtyError::SpawnFailed(format!("failed to open PTY: {e}")))?;

        let cmd = match shell {
            Some(s) => CommandBuilder::new(s),
            None => {
                let shell_path = default_shell();
                CommandBuilder::new(shell_path)
            }
        };

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| PtyError::SpawnFailed(format!("failed to spawn command: {e}")))?;

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| PtyError::SpawnFailed(format!("failed to clone reader: {e}")))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| PtyError::SpawnFailed(format!("failed to take writer: {e}")))?;

        Ok(Self {
            master: pair.master,
            reader,
            writer,
            child,
        })
    }

    /// Resize the PTY to new dimensions.
    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), PtyError> {
        self.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| PtyError::ResizeFailed(format!("{e}")))
    }

    /// Write bytes to the PTY master (user input -> shell).
    pub fn write(&mut self, data: &[u8]) -> Result<(), PtyError> {
        self.writer.write_all(data)?;
        self.writer.flush()?;
        Ok(())
    }

    /// Try to read available bytes from the PTY master (shell output -> us).
    ///
    /// Returns the number of bytes read. This is a blocking read; callers
    /// should invoke this from a dedicated I/O thread.
    pub fn read(&mut self, buf: &mut [u8]) -> Result<usize, PtyError> {
        let n = self.reader.read(buf)?;
        Ok(n)
    }

    /// Check if the child process is still alive.
    pub fn is_alive(&mut self) -> bool {
        self.try_wait().is_none()
    }

    /// Get the child process exit status if it has exited.
    ///
    /// Returns `None` if the process is still running.
    pub fn try_wait(&mut self) -> Option<u32> {
        match self.child.try_wait() {
            Ok(Some(status)) => Some(status.exit_code()),
            _ => None,
        }
    }
}

/// Returns the user's default shell, falling back to `/bin/sh`.
fn default_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
}

#[cfg(test)]
pub(crate) fn get_default_shell() -> String {
    default_shell()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn test_spawn_pty() {
        let handle = PtyHandle::spawn(Some("/bin/sh"), 80, 24);
        assert!(handle.is_ok(), "Failed to spawn PTY: {:?}", handle.err());
        let mut handle = handle.unwrap();
        assert!(handle.is_alive());
    }

    #[test]
    fn test_write_read_echo() {
        let mut handle = PtyHandle::spawn(Some("/bin/sh"), 80, 24).unwrap();

        // Write a command that echoes a known string.
        handle.write(b"echo PHANTOM_TEST_OK\n").unwrap();

        // Give the shell time to process.
        thread::sleep(Duration::from_millis(500));

        let mut output = Vec::new();
        let mut buf = [0u8; 4096];

        // Read in a loop with a timeout to collect all available output.
        let deadline = std::time::Instant::now() + Duration::from_secs(3);
        loop {
            if std::time::Instant::now() > deadline {
                break;
            }
            match handle.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    output.extend_from_slice(&buf[..n]);
                    let text = String::from_utf8_lossy(&output);
                    if text.contains("PHANTOM_TEST_OK") {
                        break;
                    }
                }
                Err(_) => break,
            }
        }

        let text = String::from_utf8_lossy(&output);
        assert!(
            text.contains("PHANTOM_TEST_OK"),
            "Expected output to contain PHANTOM_TEST_OK, got: {text}"
        );
    }

    #[test]
    fn test_resize() {
        let handle = PtyHandle::spawn(Some("/bin/sh"), 80, 24).unwrap();
        let result = handle.resize(120, 40);
        assert!(result.is_ok(), "Resize failed: {:?}", result.err());
    }

    #[test]
    fn test_child_exit() {
        // Spawn a shell that exits immediately via -c flag (no interactive prompt).
        let mut handle = PtyHandle::spawn(Some("/bin/sh"), 80, 24).unwrap();
        handle.write(b"exit 0\n").unwrap();

        // The PTY reader blocks, so we drain it in a background thread.
        // Once the child exits, the reader will eventually return EOF or error.
        let mut reader = std::mem::replace(
            &mut handle.reader,
            Box::new(std::io::empty()),
        );
        let drain = thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => return,
                    Ok(_) => {}
                }
            }
        });

        // Wait for drain (with timeout via the OS -- reader EOF on child exit).
        let _ = drain.join();

        // After draining, poll try_wait.
        let deadline = std::time::Instant::now() + Duration::from_secs(3);
        loop {
            if std::time::Instant::now() > deadline {
                break;
            }
            if handle.try_wait().is_some() {
                break;
            }
            thread::sleep(Duration::from_millis(50));
        }

        let exit_code = handle.try_wait();
        assert!(exit_code.is_some(), "Child should have exited");
        assert_eq!(exit_code, Some(0));
    }

    #[test]
    fn test_default_shell_detection() {
        let shell = get_default_shell();
        assert!(
            !shell.is_empty(),
            "Default shell should not be empty"
        );
        // On any POSIX system, the shell should be a valid path.
        assert!(
            shell.starts_with('/'),
            "Default shell should be an absolute path, got: {shell}"
        );
    }
}
