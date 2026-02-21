use bitflags::bitflags;

/// RGB color value.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rgb {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

impl Rgb {
    pub const fn new(r: u8, g: u8, b: u8) -> Self {
        Self { r, g, b }
    }
}

bitflags! {
    /// Cell attribute flags, packed into a single byte.
    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    pub struct CellFlags: u8 {
        const BOLD          = 0b0000_0001;
        const ITALIC        = 0b0000_0010;
        const UNDERLINE     = 0b0000_0100;
        const STRIKETHROUGH = 0b0000_1000;
        const INVERSE       = 0b0001_0000;
        const DIM           = 0b0010_0000;
        const HIDDEN        = 0b0100_0000;
        const BLINK         = 0b1000_0000;
    }
}

/// A single cell in the terminal grid.
#[derive(Clone, Debug)]
pub struct VtCell {
    /// The character displayed in this cell.
    pub codepoint: char,
    /// Foreground color.
    pub fg: Rgb,
    /// Background color.
    pub bg: Rgb,
    /// Cell attribute flags (bold, italic, etc.).
    pub flags: CellFlags,
    /// Character width: 1 for normal, 2 for wide (CJK) chars.
    pub width: u8,
}

impl Default for VtCell {
    fn default() -> Self {
        Self {
            codepoint: ' ',
            fg: Rgb::new(255, 255, 255),
            bg: Rgb::new(0, 0, 0),
            flags: CellFlags::empty(),
            width: 1,
        }
    }
}
