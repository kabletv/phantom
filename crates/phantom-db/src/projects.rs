use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: i64,
    pub repo_id: i64,
    pub name: String,
    pub branch: String,
    pub worktree_path: String,
    pub sandbox_profile: Option<String>,
    pub created_at: String,
}

pub fn create_project(
    conn: &Connection,
    repo_id: i64,
    name: &str,
    branch: &str,
    worktree_path: &str,
    sandbox_profile: Option<&str>,
) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO projects (repo_id, name, branch, worktree_path, sandbox_profile)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![repo_id, name, branch, worktree_path, sandbox_profile],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn list_projects(conn: &Connection, repo_id: i64) -> rusqlite::Result<Vec<Project>> {
    let mut stmt = conn.prepare(
        "SELECT id, repo_id, name, branch, worktree_path, sandbox_profile, created_at
         FROM projects WHERE repo_id = ?1 ORDER BY name",
    )?;
    let rows = stmt.query_map(params![repo_id], |row| {
        Ok(Project {
            id: row.get(0)?,
            repo_id: row.get(1)?,
            name: row.get(2)?,
            branch: row.get(3)?,
            worktree_path: row.get(4)?,
            sandbox_profile: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?;
    rows.collect()
}

pub fn get_project(conn: &Connection, id: i64) -> rusqlite::Result<Option<Project>> {
    let mut stmt = conn.prepare(
        "SELECT id, repo_id, name, branch, worktree_path, sandbox_profile, created_at
         FROM projects WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(params![id], |row| {
        Ok(Project {
            id: row.get(0)?,
            repo_id: row.get(1)?,
            name: row.get(2)?,
            branch: row.get(3)?,
            worktree_path: row.get(4)?,
            sandbox_profile: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?;
    match rows.next() {
        Some(Ok(proj)) => Ok(Some(proj)),
        Some(Err(e)) => Err(e),
        None => Ok(None),
    }
}

pub fn delete_project(conn: &Connection, id: i64) -> rusqlite::Result<bool> {
    let changed = conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
    Ok(changed > 0)
}
