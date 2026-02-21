use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Analysis {
    pub id: i64,
    pub repo_path: String,
    pub commit_sha: String,
    pub branch: String,
    pub preset_id: i64,
    pub level: i64,
    pub target_node_id: Option<String>,
    pub status: String,
    pub raw_output: Option<String>,
    pub parsed_graph: Option<String>,
    pub parsed_findings: Option<String>,
    pub error_message: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
}

const SELECT_COLUMNS: &str = "\
    id, repo_path, commit_sha, branch, preset_id, level, target_node_id, \
    status, raw_output, parsed_graph, parsed_findings, error_message, \
    created_at, completed_at";

fn row_to_analysis(row: &rusqlite::Row) -> rusqlite::Result<Analysis> {
    Ok(Analysis {
        id: row.get(0)?,
        repo_path: row.get(1)?,
        commit_sha: row.get(2)?,
        branch: row.get(3)?,
        preset_id: row.get(4)?,
        level: row.get(5)?,
        target_node_id: row.get(6)?,
        status: row.get(7)?,
        raw_output: row.get(8)?,
        parsed_graph: row.get(9)?,
        parsed_findings: row.get(10)?,
        error_message: row.get(11)?,
        created_at: row.get(12)?,
        completed_at: row.get(13)?,
    })
}

pub fn create_analysis(
    conn: &Connection,
    repo_path: &str,
    commit_sha: &str,
    branch: &str,
    preset_id: i64,
    level: i64,
    target_node_id: Option<&str>,
) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO analyses (repo_path, commit_sha, branch, preset_id, level, target_node_id) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![repo_path, commit_sha, branch, preset_id, level, target_node_id],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update_analysis_status(
    conn: &Connection,
    id: i64,
    status: &str,
    raw_output: Option<&str>,
    parsed_graph: Option<&str>,
    parsed_findings: Option<&str>,
    error_message: Option<&str>,
) -> rusqlite::Result<bool> {
    let sql = if status == "completed" || status == "failed" {
        "UPDATE analyses SET status = ?1, raw_output = ?2, parsed_graph = ?3, \
         parsed_findings = ?4, error_message = ?5, completed_at = datetime('now') WHERE id = ?6"
    } else {
        "UPDATE analyses SET status = ?1, raw_output = ?2, parsed_graph = ?3, \
         parsed_findings = ?4, error_message = ?5 WHERE id = ?6"
    };
    let changed = conn.execute(
        sql,
        params![status, raw_output, parsed_graph, parsed_findings, error_message, id],
    )?;
    Ok(changed > 0)
}

pub fn get_analysis(conn: &Connection, id: i64) -> rusqlite::Result<Option<Analysis>> {
    conn.query_row(
        &format!("SELECT {SELECT_COLUMNS} FROM analyses WHERE id = ?1"),
        params![id],
        row_to_analysis,
    )
    .optional()
}

pub fn find_cached_analysis(
    conn: &Connection,
    repo_path: &str,
    commit_sha: &str,
    preset_id: i64,
    level: i64,
    target_node_id: Option<&str>,
) -> rusqlite::Result<Option<Analysis>> {
    conn.query_row(
        &format!(
            "SELECT {SELECT_COLUMNS} FROM analyses \
             WHERE repo_path = ?1 AND commit_sha = ?2 AND preset_id = ?3 \
             AND level = ?4 \
             AND (target_node_id = ?5 OR (target_node_id IS NULL AND ?5 IS NULL)) \
             AND status = 'completed' \
             ORDER BY created_at DESC LIMIT 1"
        ),
        params![repo_path, commit_sha, preset_id, level, target_node_id],
        row_to_analysis,
    )
    .optional()
}

pub fn list_analyses_for_branch(
    conn: &Connection,
    repo_path: &str,
    branch: &str,
) -> rusqlite::Result<Vec<Analysis>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {SELECT_COLUMNS} FROM analyses \
         WHERE repo_path = ?1 AND branch = ?2 ORDER BY created_at DESC"
    ))?;
    let rows = stmt.query_map(params![repo_path, branch], row_to_analysis)?;
    rows.collect()
}
