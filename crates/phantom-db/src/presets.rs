use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisPreset {
    pub id: i64,
    pub name: String,
    #[serde(rename = "type")]
    pub preset_type: String,
    pub prompt_template: String,
    pub schedule: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliPreset {
    pub id: i64,
    pub name: String,
    pub cli_binary: String,
    pub flags: String,
    pub working_dir: Option<String>,
    pub env_vars: Option<String>,
    pub budget_usd: Option<f64>,
}

pub fn list_analysis_presets(conn: &Connection) -> rusqlite::Result<Vec<AnalysisPreset>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, type, prompt_template, schedule FROM presets ORDER BY name",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(AnalysisPreset {
            id: row.get(0)?,
            name: row.get(1)?,
            preset_type: row.get(2)?,
            prompt_template: row.get(3)?,
            schedule: row.get(4)?,
        })
    })?;
    rows.collect()
}

pub fn create_analysis_preset(
    conn: &Connection,
    name: &str,
    preset_type: &str,
    prompt_template: &str,
    schedule: Option<&str>,
) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO presets (name, type, prompt_template, schedule) VALUES (?1, ?2, ?3, ?4)",
        params![name, preset_type, prompt_template, schedule],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn delete_analysis_preset(conn: &Connection, id: i64) -> rusqlite::Result<bool> {
    let changed = conn.execute("DELETE FROM presets WHERE id = ?1", params![id])?;
    Ok(changed > 0)
}

pub fn list_cli_presets(conn: &Connection) -> rusqlite::Result<Vec<CliPreset>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, cli_binary, flags, working_dir, env_vars, budget_usd \
         FROM cli_presets ORDER BY name",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(CliPreset {
            id: row.get(0)?,
            name: row.get(1)?,
            cli_binary: row.get(2)?,
            flags: row.get(3)?,
            working_dir: row.get(4)?,
            env_vars: row.get(5)?,
            budget_usd: row.get(6)?,
        })
    })?;
    rows.collect()
}

pub fn create_cli_preset(
    conn: &Connection,
    name: &str,
    cli_binary: &str,
    flags: &str,
    working_dir: Option<&str>,
    env_vars: Option<&str>,
    budget_usd: Option<f64>,
) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO cli_presets (name, cli_binary, flags, working_dir, env_vars, budget_usd) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![name, cli_binary, flags, working_dir, env_vars, budget_usd],
    )?;
    Ok(conn.last_insert_rowid())
}
