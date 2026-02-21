use std::sync::{Arc, Mutex};

use alacritty_terminal::event::{Event, EventListener};
use alacritty_terminal::grid::Dimensions;
use alacritty_terminal::term::{Config, Term, TermDamage};
use alacritty_terminal::vte::ansi;

use crate::screen::{
    convert_cursor_shape, CursorState, DamageInfo, DamagedRow, ScreenView,
};

/// Shared event state captured from the terminal.
#[derive(Default)]
struct EventState {
    title: Option<String>,
    bell: bool,
    pty_writes: Vec<String>,
}

/// Event proxy that captures terminal events.
///
/// Must be `Clone` because `Term` requires `T: EventListener` and the event
/// loop may clone it. We use interior mutability via `Arc<Mutex<_>>`.
#[derive(Clone)]
pub struct EventProxy {
    state: Arc<Mutex<EventState>>,
}

impl EventProxy {
    fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(EventState::default())),
        }
    }
}

impl EventListener for EventProxy {
    fn send_event(&self, event: Event) {
        let mut state = self.state.lock().unwrap();
        match event {
            Event::Title(title) => {
                state.title = Some(title);
            }
            Event::ResetTitle => {
                state.title = None;
            }
            Event::Bell => {
                state.bell = true;
            }
            Event::PtyWrite(data) => {
                state.pty_writes.push(data);
            }
            // We don't act on other events for now.
            _ => {}
        }
    }
}

/// Dimensions helper for creating / resizing the terminal.
struct TermSize {
    columns: usize,
    screen_lines: usize,
}

impl Dimensions for TermSize {
    fn total_lines(&self) -> usize {
        self.screen_lines
    }

    fn screen_lines(&self) -> usize {
        self.screen_lines
    }

    fn columns(&self) -> usize {
        self.columns
    }
}

/// The core terminal emulator.
///
/// Wraps `alacritty_terminal::Term` and a VTE parser, providing a clean API
/// for the rest of the Phantom app.
pub struct VtTerminal {
    term: Term<EventProxy>,
    parser: ansi::Processor,
    event_proxy: EventProxy,
    /// Cached title, synced from EventProxy before each access.
    cached_title: Option<String>,
}

impl VtTerminal {
    /// Create a new terminal with the given dimensions.
    ///
    /// Uses 10,000 lines of scrollback history by default.
    pub fn new(cols: u16, rows: u16) -> Self {
        let config = Config {
            scrolling_history: 10_000,
            ..Config::default()
        };

        let size = TermSize {
            columns: cols as usize,
            screen_lines: rows as usize,
        };

        let event_proxy = EventProxy::new();
        let term = Term::new(config, &size, event_proxy.clone());

        Self {
            term,
            parser: ansi::Processor::new(),
            event_proxy,
            cached_title: None,
        }
    }

    /// Feed raw PTY output bytes into the terminal.
    ///
    /// This parses the bytes through the VTE state machine and updates the
    /// terminal grid accordingly.
    pub fn write(&mut self, bytes: &[u8]) {
        self.parser.advance(&mut self.term, bytes);
    }

    /// Resize the terminal to new dimensions.
    pub fn resize(&mut self, cols: u16, rows: u16) {
        let size = TermSize {
            columns: cols as usize,
            screen_lines: rows as usize,
        };
        self.term.resize(size);
    }

    /// Get a read-only view of the terminal screen.
    pub fn screen(&self) -> ScreenView<'_> {
        ScreenView::new(&self.term)
    }

    /// Get the current cursor state (position, shape, visibility).
    pub fn cursor(&self) -> CursorState {
        let content = self.term.renderable_content();
        let cursor = &content.cursor;

        let visible = cursor.shape != alacritty_terminal::vte::ansi::CursorShape::Hidden;
        let shape = convert_cursor_shape(cursor.shape);

        CursorState {
            row: cursor.point.line.0 as u16,
            col: cursor.point.column.0 as u16,
            shape,
            visible,
        }
    }

    /// Sync the cached title from the event proxy.
    ///
    /// Call this before `title()` if you need the latest title without
    /// going through `title_owned()`.
    fn sync_title(&mut self) {
        let state = self.event_proxy.state.lock().unwrap();
        self.cached_title = state.title.clone();
    }

    /// Get the current window title, if set by OSC escape sequences.
    ///
    /// Note: this returns the title as of the last `write()` or `sync_title()` call.
    /// For the most up-to-date value, use `title_owned()`.
    pub fn title(&mut self) -> Option<&str> {
        self.sync_title();
        self.cached_title.as_deref()
    }

    /// Get the current window title as an owned String.
    pub fn title_owned(&self) -> Option<String> {
        let state = self.event_proxy.state.lock().unwrap();
        state.title.clone()
    }

    /// Get damage information since the last reset.
    ///
    /// After using this information for rendering, call `reset_damage()`.
    /// Note: each call consumes the current damage state from the underlying terminal.
    pub fn damage(&mut self) -> DamageInfo {
        match self.term.damage() {
            TermDamage::Full => DamageInfo::Full,
            TermDamage::Partial(iter) => {
                let rows: Vec<DamagedRow> = iter
                    .map(|d| DamagedRow {
                        row: d.line as u16,
                        left: d.left as u16,
                        right: d.right as u16,
                    })
                    .collect();
                DamageInfo::Partial(rows)
            }
        }
    }

    /// Reset damage tracking after rendering.
    pub fn reset_damage(&mut self) {
        self.term.reset_damage();
    }

    /// Drain any write-back data from the terminal (e.g., device status responses).
    ///
    /// The terminal sometimes needs to respond to queries by writing data back
    /// to the PTY. This method returns and clears that buffer.
    pub fn take_pty_writes(&mut self) -> Vec<String> {
        let mut state = self.event_proxy.state.lock().unwrap();
        std::mem::take(&mut state.pty_writes)
    }

    /// Check and clear the bell flag.
    ///
    /// Returns `true` if the bell has rung since the last call.
    pub fn has_bell(&mut self) -> bool {
        let mut state = self.event_proxy.state.lock().unwrap();
        let bell = state.bell;
        state.bell = false;
        bell
    }

    /// Get a reference to the underlying alacritty Term.
    ///
    /// Escape hatch for advanced use cases.
    pub fn inner(&self) -> &Term<EventProxy> {
        &self.term
    }

    /// Get a mutable reference to the underlying alacritty Term.
    ///
    /// Escape hatch for advanced use cases.
    pub fn inner_mut(&mut self) -> &mut Term<EventProxy> {
        &mut self.term
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cell::CellFlags;

    #[test]
    fn test_create_terminal_dimensions() {
        let term = VtTerminal::new(80, 24);
        let screen = term.screen();
        assert_eq!(screen.cols(), 80);
        assert_eq!(screen.rows(), 24);
    }

    #[test]
    fn test_write_hello() {
        let mut term = VtTerminal::new(80, 24);
        term.write(b"hello");

        let screen = term.screen();
        assert_eq!(screen.cell(0, 0).codepoint, 'h');
        assert_eq!(screen.cell(0, 1).codepoint, 'e');
        assert_eq!(screen.cell(0, 2).codepoint, 'l');
        assert_eq!(screen.cell(0, 3).codepoint, 'l');
        assert_eq!(screen.cell(0, 4).codepoint, 'o');
        // Rest should be spaces.
        assert_eq!(screen.cell(0, 5).codepoint, ' ');
    }

    #[test]
    fn test_ansi_color_escape() {
        let mut term = VtTerminal::new(80, 24);
        // ESC[31m sets foreground to red, then write 'R'.
        term.write(b"\x1b[31mR");

        let cell = term.screen().cell(0, 0);
        assert_eq!(cell.codepoint, 'R');
        // Red foreground: the exact RGB depends on palette, but it should NOT
        // be the default white.
        assert_ne!(cell.fg, crate::cell::Rgb::new(255, 255, 255));
    }

    #[test]
    fn test_resize_terminal() {
        let mut term = VtTerminal::new(80, 24);
        assert_eq!(term.screen().cols(), 80);
        assert_eq!(term.screen().rows(), 24);

        term.resize(120, 40);
        assert_eq!(term.screen().cols(), 120);
        assert_eq!(term.screen().rows(), 40);
    }

    #[test]
    fn test_cursor_position_after_write() {
        let mut term = VtTerminal::new(80, 24);
        // Write enough to move cursor.
        term.write(b"hello");

        let cursor = term.cursor();
        assert_eq!(cursor.row, 0);
        assert_eq!(cursor.col, 5);
        assert!(cursor.visible);
    }

    #[test]
    fn test_cursor_position_multiline() {
        let mut term = VtTerminal::new(10, 5);
        // Fill first line and wrap to second.
        term.write(b"0123456789AB");

        let cursor = term.cursor();
        // After wrapping, cursor should be on line 1, column 2.
        assert_eq!(cursor.row, 1);
        assert_eq!(cursor.col, 2);
    }

    #[test]
    fn test_bold_flag() {
        let mut term = VtTerminal::new(80, 24);
        // ESC[1m enables bold.
        term.write(b"\x1b[1mB");

        let cell = term.screen().cell(0, 0);
        assert_eq!(cell.codepoint, 'B');
        assert!(cell.flags.contains(CellFlags::BOLD));
    }

    #[test]
    fn test_title_change() {
        let mut term = VtTerminal::new(80, 24);
        // OSC 0 sets window title: ESC ] 0 ; title BEL
        term.write(b"\x1b]0;My Terminal\x07");

        assert_eq!(term.title_owned(), Some("My Terminal".to_string()));
        assert_eq!(term.title(), Some("My Terminal"));
    }

    #[test]
    fn test_bell() {
        let mut term = VtTerminal::new(80, 24);
        assert!(!term.has_bell());

        term.write(b"\x07");
        assert!(term.has_bell());
        // After reading, bell should be cleared.
        assert!(!term.has_bell());
    }

    #[test]
    fn test_damage_tracking() {
        let mut term = VtTerminal::new(80, 24);
        // New terminal starts fully damaged.
        assert!(matches!(term.damage(), crate::screen::DamageInfo::Full));
        term.reset_damage();

        // After reset, writing should cause new damage.
        term.write(b"hello");
        let damage = term.damage();
        assert!(!matches!(damage, crate::screen::DamageInfo::Partial(ref rows) if rows.is_empty()));
    }

    #[test]
    fn test_device_status_response() {
        let mut term = VtTerminal::new(80, 24);
        // ESC[6n requests cursor position report. Terminal should respond
        // with ESC[row;colR via PtyWrite event.
        term.write(b"\x1b[6n");

        let writes = term.take_pty_writes();
        assert!(!writes.is_empty(), "Expected a device status response");
        // Response should be in the form ESC[1;1R (for position 1,1).
        assert!(writes[0].starts_with("\x1b["));
    }
}
