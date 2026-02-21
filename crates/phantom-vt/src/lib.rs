//! phantom-vt: Terminal emulation engine for Phantom.
//!
//! Provides a clean Rust API over `alacritty_terminal` for terminal emulation.
//! This crate handles parsing of PTY output, maintaining the terminal grid state,
//! and providing cell data for rendering.

pub mod cell;
pub mod screen;
pub mod terminal;

pub use cell::{CellFlags, Rgb, VtCell};
pub use screen::{CursorShape, CursorState, DamageInfo, DamagedRow, ScreenView};
pub use terminal::VtTerminal;
