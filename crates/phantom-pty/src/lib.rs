//! phantom-pty: PTY management and terminal session lifecycle for Phantom.
//!
//! This crate sits between the PTY (real shell process) and the VT terminal
//! (screen state). It reads shell output, feeds it into `VtTerminal`, and
//! writes user input back to the shell.
//!
//! # Architecture
//!
//! - [`PtyHandle`] — Low-level PTY process management (spawn, read, write, resize).
//! - [`TerminalSession`] — Pairs a `PtyHandle` with a `VtTerminal` for a complete
//!   terminal tab experience.
//! - [`Multiplexer`] — Manages multiple `TerminalSession`s for tab-based multiplexing.

pub mod multiplexer;
pub mod pty;
pub mod session;

pub use multiplexer::Multiplexer;
pub use pty::{PtyError, PtyHandle};
pub use session::{SessionId, TerminalSession};
