/**
 * M2-Tools – Central Database Schema
 * Defines all required tables and default seeds.
 */

/**
 * Adds a column to an already-existing table if it isn't there yet. There's
 * no migration framework in this project - `CREATE TABLE IF NOT EXISTS`
 * only covers brand-new installs, so upgrading an existing table (e.g.
 * adding ssh_host_key_fingerprint to workspace_connections after that
 * table already has rows) needs this ALTER TABLE, with the "column
 * already exists" error swallowed since that's the expected outcome on
 * every boot after the first.
 */
async function addColumnIfMissing(db, table, column, ddl) {
    try {
        await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    } catch (err) {
        // Already present (SQLite: "duplicate column name", MySQL: "Duplicate column name") - ignore.
    }
}

async function ensureSchema(db) {
    if (!db) return;
    const isSqlite = db.type === 'sqlite';

    console.log('[DB] Central Schema: Initializing tables...');

    try {
        // ── USERS & AUTH ─────────────────────────────────
        await db.query(`
            CREATE TABLE IF NOT EXISTS m2em_users (
                id INTEGER PRIMARY KEY ${isSqlite ? 'AUTOINCREMENT' : 'AUTO_INCREMENT'},
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                role TEXT DEFAULT 'viewer',
                is_premium INTEGER DEFAULT 0,
                email_verified INTEGER DEFAULT 0,
                verification_token VARCHAR(255),
                verification_expires TEXT,
                reset_token VARCHAR(255),
                reset_expires TEXT,
                avatar_url TEXT,
                display_name VARCHAR(100),
                current_workspace_id INTEGER DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // ── MODULE CONFIGS & PERMISSIONS ─────────────────
        await db.query(`
            CREATE TABLE IF NOT EXISTS modules_config (
                id TEXT PRIMARY KEY,
                access_level TEXT DEFAULT 'user',
                is_visible_guests INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // ── SYSTEM SETTINGS ──────────────────────────────
        await db.query(`
            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // ── WORKSPACES ───────────────────────────────────
        await db.query(`
            CREATE TABLE IF NOT EXISTS workspaces (
                id INTEGER PRIMARY KEY ${isSqlite ? 'AUTOINCREMENT' : 'AUTO_INCREMENT'},
                userId INTEGER NOT NULL,
                team_id INTEGER DEFAULT NULL,
                name TEXT NOT NULL,
                description TEXT,
                base_path TEXT,
                db_config TEXT,
                is_default INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // ── WORKSPACE REMOTE CONNECTIONS (SSH/SFTP + Live-DB) ──
        await db.query(`
            CREATE TABLE IF NOT EXISTS workspace_connections (
                id INTEGER PRIMARY KEY ${isSqlite ? 'AUTOINCREMENT' : 'AUTO_INCREMENT'},
                workspace_id INTEGER NOT NULL UNIQUE,
                ssh_host TEXT,
                ssh_port INTEGER DEFAULT 22,
                ssh_username TEXT,
                ssh_auth_method TEXT DEFAULT 'password',
                ssh_secret_encrypted TEXT,
                ssh_passphrase_encrypted TEXT,
                ssh_host_key_fingerprint TEXT,
                remote_quest_path TEXT,
                remote_cube_path TEXT,
                cmd_restart_game TEXT,
                cmd_restart_db TEXT,
                cmd_status TEXT,
                db_host TEXT,
                db_port INTEGER DEFAULT 3306,
                db_user TEXT,
                db_name TEXT,
                db_password_encrypted TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        // TOFU host-key pinning was added after this table already had rows
        // in some deployments - covered by CREATE TABLE above for fresh
        // installs, this ALTER fills the gap for existing ones.
        await addColumnIfMissing(db, 'workspace_connections', 'ssh_host_key_fingerprint', 'TEXT');

        await db.query(`
            CREATE TABLE IF NOT EXISTS connection_audit_log (
                id INTEGER PRIMARY KEY ${isSqlite ? 'AUTOINCREMENT' : 'AUTO_INCREMENT'},
                workspace_id INTEGER NOT NULL,
                userId INTEGER NOT NULL,
                action TEXT NOT NULL,
                detail TEXT,
                success INTEGER NOT NULL,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // ── TEAMS ────────────────────────────────────────
        await db.query(`
            CREATE TABLE IF NOT EXISTS m2em_teams (
                id INTEGER PRIMARY KEY ${isSqlite ? 'AUTOINCREMENT' : 'AUTO_INCREMENT'},
                name TEXT NOT NULL,
                owner_id INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS m2em_team_members (
                team_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                role TEXT DEFAULT 'member',
                PRIMARY KEY (team_id, user_id)
            )
        `);

        // ── PROTO TABLES (FOR EDITORS) ───────────────────
        await db.query(`
            CREATE TABLE IF NOT EXISTS item_proto (
                vnum INTEGER PRIMARY KEY,
                locale_name TEXT NOT NULL DEFAULT '',
                type INTEGER DEFAULT 0,
                subtype INTEGER DEFAULT 0,
                flag INTEGER DEFAULT 0,
                anti_flag INTEGER DEFAULT 0,
                refine_vnum INTEGER DEFAULT 0,
                gold INTEGER DEFAULT 0,
                userId INTEGER DEFAULT NULL,
                workspace_id INTEGER DEFAULT NULL
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS mob_proto (
                vnum INTEGER PRIMARY KEY,
                locale_name TEXT NOT NULL DEFAULT '',
                type INTEGER DEFAULT 0,
                rank INTEGER DEFAULT 0,
                level INTEGER DEFAULT 0,
                ai_flag TEXT DEFAULT '',
                userId INTEGER DEFAULT NULL,
                workspace_id INTEGER DEFAULT NULL
            )
        `);

        // ── SEEDS ────────────────────────────────────────
        
        // Default System Settings
        const defaults = [
            ['storage_limit_standard', '157286400'], // 150MB, per workspace (see storageService.checkQuota)
            ['storage_limit_premium', '314572800'],  // 300MB, per workspace
            ['max_workspaces_per_user', '1'],
            ['max_teams_per_user', '3'],
            ['max_team_members', '5'],
            ['connection_test_cooldown_seconds', '30'],
            ['command_cooldown_seconds', '10'],
            ['deploy_cooldown_seconds', '5']
        ];
        // "INSERT OR IGNORE" is SQLite-only syntax; the SQLite adapter's
        // query() runs everything through sqlMapper's translator, but the
        // MySQL adapter passes SQL straight through untouched, so this has
        // to branch here rather than relying on the translator.
        const upsertSettingSql = isSqlite
            ? 'INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)'
            : 'INSERT IGNORE INTO system_settings (key, value) VALUES (?, ?)';
        for (const [key, val] of defaults) {
            await db.query(upsertSettingSql, [key, val]);
        }

        // Module Self-Sync - upserts each module's row without ever
        // touching access_level on conflict, so an admin's runtime change
        // via the Admin Panel survives every subsequent server restart.
        const { getModuleRegistry } = require('../utils/moduleLoader');
        const registry = getModuleRegistry();
        const upsertModuleSql = isSqlite
            ? `INSERT INTO modules_config (id, access_level) VALUES (?, ?)
               ON CONFLICT(id) DO UPDATE SET id = excluded.id`
            : `INSERT INTO modules_config (id, access_level) VALUES (?, ?)
               ON DUPLICATE KEY UPDATE id = VALUES(id)`;
        for (const m of registry) {
            await db.query(upsertModuleSql, [m.id, m.defaultAccess]);
        }

        console.log(`[DB] Schema synced (${registry.length} modules, default seeds applied)`);

    } catch (err) {
        console.error('[DB] Schema setup error:', err.message);
    }
}

module.exports = { ensureSchema };
