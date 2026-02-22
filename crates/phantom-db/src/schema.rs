use rusqlite::Connection;

/// Current schema version. Bump this when adding migrations.
const CURRENT_VERSION: i64 = 4;

pub fn initialize(conn: &Connection) -> rusqlite::Result<()> {
    // Create base tables (idempotent)
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS presets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('diagram', 'analysis', 'custom')),
            prompt_template TEXT NOT NULL,
            schedule TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS cli_presets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            cli_binary TEXT NOT NULL,
            flags TEXT NOT NULL DEFAULT '',
            working_dir TEXT,
            env_vars TEXT,
            budget_usd REAL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS analyses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_path TEXT NOT NULL,
            commit_sha TEXT NOT NULL,
            branch TEXT NOT NULL,
            preset_id INTEGER NOT NULL REFERENCES presets(id),
            level INTEGER NOT NULL DEFAULT 1,
            target_node_id TEXT,
            status TEXT NOT NULL DEFAULT 'queued'
                CHECK(status IN ('queued', 'running', 'completed', 'failed')),
            raw_output TEXT,
            parsed_graph TEXT,
            parsed_findings TEXT,
            error_message TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            completed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_analyses_lookup
            ON analyses(repo_path, commit_sha, preset_id, level, target_node_id);

        CREATE INDEX IF NOT EXISTS idx_analyses_branch
            ON analyses(repo_path, branch, preset_id);
        ",
    )?;

    migrate(conn)?;
    Ok(())
}

fn current_version(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_version",
        [],
        |row| row.get(0),
    )
}

fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    let version = current_version(conn)?;

    if version < 2 {
        // Migration v2: add drill-down columns and parsed_graph.
        // For existing databases that already have the old schema, we add
        // the new columns. For fresh databases the CREATE TABLE already
        // includes them, so we check column existence first.
        let has_level = conn
            .prepare("SELECT level FROM analyses LIMIT 0")
            .is_ok();

        if !has_level {
            conn.execute_batch(
                "
                ALTER TABLE analyses ADD COLUMN level INTEGER NOT NULL DEFAULT 1;
                ALTER TABLE analyses ADD COLUMN target_node_id TEXT;
                ALTER TABLE analyses ADD COLUMN parsed_graph TEXT;
                UPDATE analyses SET parsed_graph = parsed_mermaid WHERE parsed_mermaid IS NOT NULL;
                DROP INDEX IF EXISTS idx_analyses_lookup;
                CREATE INDEX idx_analyses_lookup
                    ON analyses(repo_path, commit_sha, preset_id, level, target_node_id);
                ",
            )?;
        }

        conn.execute(
            "INSERT OR REPLACE INTO schema_version (version) VALUES (?1)",
            [2_i64],
        )?;
    }

    if version < 3 {
        // Migration v3: add budget_usd column to cli_presets.
        let has_budget = conn
            .prepare("SELECT budget_usd FROM cli_presets LIMIT 0")
            .is_ok();

        if !has_budget {
            conn.execute_batch(
                "ALTER TABLE cli_presets ADD COLUMN budget_usd REAL;",
            )?;
        }

        conn.execute(
            "INSERT OR REPLACE INTO schema_version (version) VALUES (?1)",
            [3_i64],
        )?;
    }

    if version < 4 {
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS repositories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                github_owner TEXT NOT NULL,
                github_name TEXT NOT NULL,
                github_url TEXT NOT NULL,
                local_path TEXT NOT NULL,
                default_branch TEXT NOT NULL DEFAULT 'main',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(github_owner, github_name)
            );

            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                repo_id INTEGER NOT NULL REFERENCES repositories(id),
                name TEXT NOT NULL,
                branch TEXT NOT NULL,
                worktree_path TEXT NOT NULL,
                sandbox_profile TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            ",
        )?;

        conn.execute(
            "INSERT OR REPLACE INTO schema_version (version) VALUES (?1)",
            [CURRENT_VERSION],
        )?;
    }

    Ok(())
}
