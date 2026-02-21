//! IPC types for communication between the Tauri backend and frontend.
//!
//! All events sent to the frontend go through `TerminalEvent`, which is
//! serialized as tagged JSON via Tauri's channel mechanism.

use phantom_vt::{ScreenView, VtCell};
use serde::Serialize;

/// Events sent from the backend to the frontend over a Tauri channel.
#[derive(Serialize, Clone, Debug)]
#[serde(tag = "type")]
pub enum TerminalEvent {
    /// A full frame of the terminal screen (sent on creation and resize).
    FullFrame {
        cols: u16,
        rows: u16,
        /// Binary cell data, 16 bytes per cell, row-major order.
        cells: Vec<u8>,
        cursor_row: u16,
        cursor_col: u16,
        cursor_shape: String,
        cursor_visible: bool,
    },
    /// Incremental update with only changed rows.
    DirtyRows {
        rows: Vec<DirtyRow>,
        cursor_row: u16,
        cursor_col: u16,
        cursor_shape: String,
        cursor_visible: bool,
    },
    /// The terminal title changed (via OSC escape sequences).
    TitleChanged {
        title: String,
    },
    /// The terminal bell rang.
    Bell,
    /// The shell process exited.
    Exited {
        code: Option<u32>,
    },
}

/// A single row of binary cell data for incremental updates.
#[derive(Serialize, Clone, Debug)]
pub struct DirtyRow {
    pub y: u16,
    /// Binary cell data for this row, 16 bytes per cell.
    pub cells: Vec<u8>,
}

/// Encode a single VtCell into 16 bytes.
///
/// Layout (little-endian where applicable):
/// - bytes 0..4:  codepoint as u32 LE
/// - bytes 4..7:  foreground RGB
/// - bytes 7..10: background RGB
/// - byte 10:     CellFlags bits
/// - byte 11:     cell width (0, 1, or 2)
/// - bytes 12..14: reserved (hyperlink_id)
/// - byte 14:     reserved (grapheme_len)
/// - byte 15:     padding
pub fn encode_cell(cell: &VtCell) -> [u8; 16] {
    let mut buf = [0u8; 16];
    // codepoint as u32 LE (4 bytes)
    buf[0..4].copy_from_slice(&(cell.codepoint as u32).to_le_bytes());
    // fg RGB (3 bytes)
    buf[4] = cell.fg.r;
    buf[5] = cell.fg.g;
    buf[6] = cell.fg.b;
    // bg RGB (3 bytes)
    buf[7] = cell.bg.r;
    buf[8] = cell.bg.g;
    buf[9] = cell.bg.b;
    // flags (1 byte)
    buf[10] = cell.flags.bits();
    // width (1 byte)
    buf[11] = cell.width;
    // hyperlink_id (2 bytes, reserved)
    buf[12] = 0;
    buf[13] = 0;
    // grapheme_len (1 byte, reserved)
    buf[14] = 0;
    // padding (1 byte)
    buf[15] = 0;
    buf
}

/// Encode an entire row of cells into binary data.
pub fn encode_row(screen: &ScreenView, row: u16) -> Vec<u8> {
    let cols = screen.cols();
    let mut data = Vec::with_capacity(cols as usize * 16);
    for col in 0..cols {
        data.extend_from_slice(&encode_cell(&screen.cell(row, col)));
    }
    data
}

/// Convert a CursorShape to the string format expected by the frontend.
pub fn cursor_shape_str(shape: phantom_vt::CursorShape) -> &'static str {
    match shape {
        phantom_vt::CursorShape::Block => "block",
        phantom_vt::CursorShape::Underline => "underline",
        phantom_vt::CursorShape::Bar => "bar",
        phantom_vt::CursorShape::Hidden => "hidden",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use phantom_vt::{CellFlags, Rgb, VtCell};

    #[test]
    fn test_encode_cell_default() {
        let cell = VtCell::default();
        let encoded = encode_cell(&cell);

        assert_eq!(encoded.len(), 16);

        // Default cell is a space (U+0020 = 32).
        let codepoint = u32::from_le_bytes([encoded[0], encoded[1], encoded[2], encoded[3]]);
        assert_eq!(codepoint, ' ' as u32);

        // Default fg is white (255, 255, 255).
        assert_eq!(encoded[4], 255);
        assert_eq!(encoded[5], 255);
        assert_eq!(encoded[6], 255);

        // Default bg is black (0, 0, 0).
        assert_eq!(encoded[7], 0);
        assert_eq!(encoded[8], 0);
        assert_eq!(encoded[9], 0);

        // No flags.
        assert_eq!(encoded[10], 0);

        // Width 1.
        assert_eq!(encoded[11], 1);

        // Reserved bytes are zero.
        assert_eq!(encoded[12], 0);
        assert_eq!(encoded[13], 0);
        assert_eq!(encoded[14], 0);
        assert_eq!(encoded[15], 0);
    }

    #[test]
    fn test_encode_cell_with_attributes() {
        let cell = VtCell {
            codepoint: 'A',
            fg: Rgb::new(255, 0, 0),
            bg: Rgb::new(0, 0, 128),
            flags: CellFlags::BOLD | CellFlags::ITALIC,
            width: 1,
        };
        let encoded = encode_cell(&cell);

        // 'A' is U+0041 = 65.
        let codepoint = u32::from_le_bytes([encoded[0], encoded[1], encoded[2], encoded[3]]);
        assert_eq!(codepoint, 65);

        // fg red.
        assert_eq!(encoded[4], 255);
        assert_eq!(encoded[5], 0);
        assert_eq!(encoded[6], 0);

        // bg dark blue.
        assert_eq!(encoded[7], 0);
        assert_eq!(encoded[8], 0);
        assert_eq!(encoded[9], 128);

        // BOLD | ITALIC = 0b0000_0011 = 3.
        assert_eq!(encoded[10], 3);

        // Width 1.
        assert_eq!(encoded[11], 1);
    }

    #[test]
    fn test_encode_cell_wide_char() {
        let cell = VtCell {
            codepoint: '\u{4e16}', // CJK character
            fg: Rgb::new(200, 200, 200),
            bg: Rgb::new(30, 30, 30),
            flags: CellFlags::empty(),
            width: 2,
        };
        let encoded = encode_cell(&cell);

        let codepoint = u32::from_le_bytes([encoded[0], encoded[1], encoded[2], encoded[3]]);
        assert_eq!(codepoint, 0x4e16);

        assert_eq!(encoded[11], 2); // width = 2
    }

    #[test]
    fn test_encode_cell_emoji_codepoint() {
        let cell = VtCell {
            codepoint: '\u{1F600}', // grinning face emoji
            fg: Rgb::new(255, 255, 255),
            bg: Rgb::new(0, 0, 0),
            flags: CellFlags::empty(),
            width: 2,
        };
        let encoded = encode_cell(&cell);

        let codepoint = u32::from_le_bytes([encoded[0], encoded[1], encoded[2], encoded[3]]);
        assert_eq!(codepoint, 0x1F600);
    }

    #[test]
    fn test_encode_cell_all_flags() {
        let cell = VtCell {
            codepoint: 'X',
            fg: Rgb::new(0, 0, 0),
            bg: Rgb::new(0, 0, 0),
            flags: CellFlags::BOLD
                | CellFlags::ITALIC
                | CellFlags::UNDERLINE
                | CellFlags::STRIKETHROUGH
                | CellFlags::INVERSE
                | CellFlags::DIM
                | CellFlags::HIDDEN
                | CellFlags::BLINK,
            width: 1,
        };
        let encoded = encode_cell(&cell);

        // All flags set: 0b1111_1111 = 255.
        assert_eq!(encoded[10], 0xFF);
    }

    #[test]
    fn test_cursor_shape_str() {
        assert_eq!(cursor_shape_str(phantom_vt::CursorShape::Block), "block");
        assert_eq!(
            cursor_shape_str(phantom_vt::CursorShape::Underline),
            "underline"
        );
        assert_eq!(cursor_shape_str(phantom_vt::CursorShape::Bar), "bar");
        assert_eq!(
            cursor_shape_str(phantom_vt::CursorShape::Hidden),
            "hidden"
        );
    }
}
