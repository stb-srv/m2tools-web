/**
 * M2-Tools – Central Database Schema
 * Defines all required tables and default seeds.
 */
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
            ['storage_limit_standard', '20971520'], // 20MB
            ['storage_limit_premium', '52428800'],  // 50MB
            ['max_workspaces_per_user', '1'],
            ['max_teams_per_user', '3'],
            ['max_team_members', '5'],
            ['connection_test_cooldown_seconds', '30']
        ];
        for (const [key, val] of defaults) {
            await db.query('INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)', [key, val]);
        }

        // Module Self-Sync
        const { getModuleRegistry } = require('../utils/moduleLoader');
        const registry = getModuleRegistry();
        for (const m of registry) {
            await db.query(`
                INSERT INTO modules_config (id, access_level) VALUES (?, ?)
                ON CONFLICT(id) DO UPDATE SET id = excluded.id
            `, [m.id, m.defaultAccess]);
        }

        console.log(`[DB] Schema synced (${registry.length} modules, default seeds applied)`);

    } catch (err) {
        console.error('[DB] Schema setup error:', err.message);
    }
}

module.exports = { ensureSchema };
