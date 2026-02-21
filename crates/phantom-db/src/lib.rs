pub mod analyses;
pub mod presets;
pub mod schema;
pub mod settings;

use rusqlite::Connection;
use std::path::Path;

pub use analyses::Analysis;
pub use presets::{AnalysisPreset, CliPreset};

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    schema::initialize(&conn)?;
    Ok(conn)
}
