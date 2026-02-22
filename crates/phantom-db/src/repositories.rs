use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Repository {
    pub id: i64,
    pub github_owner: String,
    pub github_name: String,
    pub github_url: String,
    pub local_path: String,
    pub default_branch: String,
    pub created_at: String,
}

pub fn create_repository(
    conn: &Connection,
    github_owner: &str,
    github_name: &str,
    github_url: &str,
    local_path: &str,
    default_branch: &str,
) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO repositories (github_owner, github_name, github_url, local_path, default_branch)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![github_owner, github_name, github_url, local_path, default_branch],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn list_repositories(conn: &Connection) -> rusqlite::Result<Vec<Repository>> {
    let mut stmt = conn.prepare(
        "SELECT id, github_owner, github_name, github_url, local_path, default_branch, created_at
         FROM repositories ORDER BY github_owner, github_name",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Repository {
            id: row.get(0)?,
            github_owner: row.get(1)?,
            github_name: row.get(2)?,
            github_url: row.get(3)?,
            local_path: row.get(4)?,
            default_branch: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?;
    rows.collect()
}

pub fn get_repository(conn: &Connection, id: i64) -> rusqlite::Result<Option<Repository>> {
    let mut stmt = conn.prepare(
        "SELECT id, github_owner, github_name, github_url, local_path, default_branch, created_at
         FROM repositories WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(params![id], |row| {
        Ok(Repository {
            id: row.get(0)?,
            github_owner: row.get(1)?,
            github_name: row.get(2)?,
            github_url: row.get(3)?,
            local_path: row.get(4)?,
            default_branch: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?;
    match rows.next() {
        Some(Ok(repo)) => Ok(Some(repo)),
        Some(Err(e)) => Err(e),
        None => Ok(None),
    }
}

pub fn delete_repository(conn: &Connection, id: i64) -> rusqlite::Result<bool> {
    let changed = conn.execute("DELETE FROM repositories WHERE id = ?1", params![id])?;
    Ok(changed > 0)
}
