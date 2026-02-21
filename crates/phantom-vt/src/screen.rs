use alacritty_terminal::grid::Dimensions;
use alacritty_terminal::index::{Column, Line};
use alacritty_terminal::term::cell::Flags as AlacFlags;
use alacritty_terminal::term::Term;
use alacritty_terminal::vte::ansi::{Color, CursorShape as AlacCursorShape, NamedColor, Rgb as AlacRgb};

use crate::cell::{CellFlags, Rgb, VtCell};
use crate::terminal::EventProxy;

/// Current state of the cursor.
#[derive(Clone, Debug)]
pub struct CursorState {
    pub row: u16,
    pub col: u16,
    pub shape: CursorShape,
    pub visible: bool,
}

/// Shape of the terminal cursor.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CursorShape {
    Block,
    Underline,
    Bar,
    Hidden,
}

/// A read-only view into the terminal screen.
pub struct ScreenView<'a> {
    term: &'a Term<EventProxy>,
}

impl<'a> ScreenView<'a> {
    pub(crate) fn new(term: &'a Term<EventProxy>) -> Self {
        Self { term }
    }

    /// Number of visible rows.
    pub fn rows(&self) -> u16 {
        self.term.screen_lines() as u16
    }

    /// Number of columns.
    pub fn cols(&self) -> u16 {
        self.term.columns() as u16
    }

    /// Get a single cell at the given row and column.
    ///
    /// Row 0 is the top of the visible screen.
    pub fn cell(&self, row: u16, col: u16) -> VtCell {
        let line = Line(row as i32);
        let column = Column(col as usize);
        let grid = self.term.grid();

        if (row as usize) >= self.term.screen_lines() || (col as usize) >= self.term.columns() {
            return VtCell::default();
        }

        let cell = &grid[line][column];
        convert_cell(cell, self.term.colors())
    }

    /// Get all cells in a row.
    pub fn row_cells(&self, row: u16) -> Vec<VtCell> {
        let cols = self.cols();
        (0..cols).map(|col| self.cell(row, col)).collect()
    }

}

/// Information about which parts of the screen have changed.
#[derive(Debug)]
pub enum DamageInfo {
    /// The entire screen needs redrawing.
    Full,
    /// Only specific rows/columns changed.
    Partial(Vec<DamagedRow>),
}

/// A row (or portion of a row) that has been damaged.
#[derive(Debug)]
pub struct DamagedRow {
    pub row: u16,
    pub left: u16,
    pub right: u16,
}

/// Standard xterm-256color ANSI palette.
const ANSI_COLORS: [AlacRgb; 16] = [
    AlacRgb { r: 0, g: 0, b: 0 },       // Black
    AlacRgb { r: 205, g: 0, b: 0 },      // Red
    AlacRgb { r: 0, g: 205, b: 0 },      // Green
    AlacRgb { r: 205, g: 205, b: 0 },    // Yellow
    AlacRgb { r: 0, g: 0, b: 238 },      // Blue
    AlacRgb { r: 205, g: 0, b: 205 },    // Magenta
    AlacRgb { r: 0, g: 205, b: 205 },    // Cyan
    AlacRgb { r: 229, g: 229, b: 229 },  // White
    AlacRgb { r: 127, g: 127, b: 127 },  // Bright Black
    AlacRgb { r: 255, g: 0, b: 0 },      // Bright Red
    AlacRgb { r: 0, g: 255, b: 0 },      // Bright Green
    AlacRgb { r: 255, g: 255, b: 0 },    // Bright Yellow
    AlacRgb { r: 92, g: 92, b: 255 },    // Bright Blue
    AlacRgb { r: 255, g: 0, b: 255 },    // Bright Magenta
    AlacRgb { r: 0, g: 255, b: 255 },    // Bright Cyan
    AlacRgb { r: 255, g: 255, b: 255 },  // Bright White
];

/// Resolve a `vte::ansi::Color` to an `Rgb` using the terminal's color palette.
pub(crate) fn resolve_color(
    color: &Color,
    colors: &alacritty_terminal::term::color::Colors,
    is_fg: bool,
) -> Rgb {
    match color {
        Color::Spec(rgb) => Rgb::new(rgb.r, rgb.g, rgb.b),
        Color::Named(named) => {
            if let Some(rgb) = colors[*named] {
                Rgb::new(rgb.r, rgb.g, rgb.b)
            } else {
                let idx = *named as usize;
                // Use default ANSI palette or default fg/bg.
                match named {
                    NamedColor::Foreground | NamedColor::BrightForeground => {
                        Rgb::new(255, 255, 255)
                    }
                    NamedColor::Background => Rgb::new(0, 0, 0),
                    NamedColor::Cursor => Rgb::new(255, 255, 255),
                    _ if idx < 16 => {
                        let c = ANSI_COLORS[idx];
                        Rgb::new(c.r, c.g, c.b)
                    }
                    // Dim colors: map to corresponding normal color with dimming.
                    NamedColor::DimBlack => Rgb::new(0, 0, 0),
                    NamedColor::DimRed => Rgb::new(154, 0, 0),
                    NamedColor::DimGreen => Rgb::new(0, 154, 0),
                    NamedColor::DimYellow => Rgb::new(154, 154, 0),
                    NamedColor::DimBlue => Rgb::new(0, 0, 178),
                    NamedColor::DimMagenta => Rgb::new(154, 0, 154),
                    NamedColor::DimCyan => Rgb::new(0, 154, 154),
                    NamedColor::DimWhite => Rgb::new(178, 178, 178),
                    NamedColor::DimForeground => Rgb::new(178, 178, 178),
                    _ => {
                        if is_fg {
                            Rgb::new(255, 255, 255)
                        } else {
                            Rgb::new(0, 0, 0)
                        }
                    }
                }
            }
        }
        Color::Indexed(idx) => {
            let idx = *idx as usize;
            if let Some(rgb) = colors[idx] {
                Rgb::new(rgb.r, rgb.g, rgb.b)
            } else if idx < 16 {
                let c = ANSI_COLORS[idx];
                Rgb::new(c.r, c.g, c.b)
            } else if idx < 232 {
                // 216-color cube (indices 16..232).
                let n = idx - 16;
                let r = (n / 36) % 6;
                let g = (n / 6) % 6;
                let b = n % 6;
                let to_byte = |v: usize| if v == 0 { 0u8 } else { (55 + 40 * v) as u8 };
                Rgb::new(to_byte(r), to_byte(g), to_byte(b))
            } else {
                // Grayscale ramp (indices 232..256).
                let v = (8 + 10 * (idx - 232)) as u8;
                Rgb::new(v, v, v)
            }
        }
    }
}

/// Convert an alacritty Cell to our VtCell.
pub(crate) fn convert_cell(
    cell: &alacritty_terminal::term::cell::Cell,
    colors: &alacritty_terminal::term::color::Colors,
) -> VtCell {
    let fg = resolve_color(&cell.fg, colors, true);
    let bg = resolve_color(&cell.bg, colors, false);

    let mut flags = CellFlags::empty();
    if cell.flags.contains(AlacFlags::BOLD) {
        flags |= CellFlags::BOLD;
    }
    if cell.flags.contains(AlacFlags::ITALIC) {
        flags |= CellFlags::ITALIC;
    }
    if cell.flags.contains(AlacFlags::UNDERLINE) {
        flags |= CellFlags::UNDERLINE;
    }
    if cell.flags.contains(AlacFlags::STRIKEOUT) {
        flags |= CellFlags::STRIKETHROUGH;
    }
    if cell.flags.contains(AlacFlags::INVERSE) {
        flags |= CellFlags::INVERSE;
    }
    if cell.flags.contains(AlacFlags::DIM) {
        flags |= CellFlags::DIM;
    }
    if cell.flags.contains(AlacFlags::HIDDEN) {
        flags |= CellFlags::HIDDEN;
    }

    let width = if cell.flags.contains(AlacFlags::WIDE_CHAR) {
        2
    } else if cell.flags.contains(AlacFlags::WIDE_CHAR_SPACER) {
        0
    } else {
        1
    };

    VtCell {
        codepoint: cell.c,
        fg,
        bg,
        flags,
        width,
    }
}

/// Convert alacritty's CursorShape to our CursorShape.
pub(crate) fn convert_cursor_shape(shape: AlacCursorShape) -> CursorShape {
    match shape {
        AlacCursorShape::Block | AlacCursorShape::HollowBlock => CursorShape::Block,
        AlacCursorShape::Underline => CursorShape::Underline,
        AlacCursorShape::Beam => CursorShape::Bar,
        AlacCursorShape::Hidden => CursorShape::Hidden,
    }
}
