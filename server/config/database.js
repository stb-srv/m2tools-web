/**
 * M2-Tools – Database Abstraction Layer
 * 
 * Supports SQLite (default) and MySQL/MariaDB.
 * Provides a unified async query() interface compatible with mysql2/promise.
 * 
 * Set DB_TYPE=mysql in .env to use MySQL/MariaDB.
 * Default: SQLite (stores data in ./data/m2tools.db)
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config();

const DB_TYPE = (process.env.DB_TYPE || 'sqlite').toLowerCase();

let db = null;

/* ═══════════════════════════════════════════════════════
   SQLite Adapter
   ═══════════════════════════════════════════════════════ */

function createSqliteAdapter() {
    const Database = require('better-sqlite3');
    const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
    const DATA_DIR = path.join(PROJECT_ROOT, 'data');
    const DB_PATH = process.env.SQLITE_PATH || path.join(DATA_DIR, 'm2tools.db');

    // Ensure data directory exists
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const sqlite = new Database(DB_PATH);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    console.log(`[DB] SQLite connected: ${DB_PATH}`);

    const adapter = {
        type: 'sqlite',
        raw: sqlite,
        query(sql, params = []) {
            const { translateMysqlToSqlite, isReadQuery } = require('../utils/sqlMapper');
            const { sql: translatedSql, params: translatedParams } = translateMysqlToSqlite(sql, params);

            try {
                if (isReadQuery(translatedSql)) {
                    const rows = sqlite.prepare(translatedSql).all(...translatedParams);
                    return [rows];
                } else {
                    const res = sqlite.prepare(translatedSql).run(...translatedParams);
                    return [{ insertId: res.lastInsertRowid, affectedRows: res.changes }];
                }
            } catch (err) {
                // SQLite specific unique constraint mapping to MySQL code
                if (err.message.includes('UNIQUE constraint failed')) {
                    const e = new Error(err.message);
                    e.code = 'ER_DUP_ENTRY';
                    throw e;
                }
                throw err;
            }
        },
        close() { sqlite.close(); }
    };

    // ── Central Schema Setup ──
    const { ensureSchema } = require('./schema');
    ensureSchema(adapter);

    return adapter;
}

/* ═══════════════════════════════════════════════════════
   MySQL/MariaDB Adapter
   ═══════════════════════════════════════════════════════ */

function createMysqlAdapter() {
    const mysql = require('mysql2/promise');

    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || process.env.DB_PLAYER || 'player',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    console.log(`[DB] MySQL/MariaDB pool created → ${process.env.DB_HOST || 'localhost'}/${process.env.DB_NAME || process.env.DB_PLAYER || 'player'}`);

    const adapter = {
        type: 'mysql',
        raw: pool,

        async query(sql, params = []) {
            return pool.query(sql, params);
        },

        async close() {
            await pool.end();
        }
    };

    // ── Central Schema Setup ── (was previously only wired up for the
    // SQLite adapter below - DB_TYPE=mysql left the app with no tables at
    // all. ensureSchema already branches its DDL on adapter.type, so this
    // was just a missing call site, not a missing implementation.)
    const { ensureSchema } = require('./schema');
    ensureSchema(adapter);

    return adapter;
}

/* ═══════════════════════════════════════════════════════
   Factory
   ═══════════════════════════════════════════════════════ */

try {
    if (DB_TYPE === 'mysql' || DB_TYPE === 'mariadb') {
        db = createMysqlAdapter();
    } else {
        db = createSqliteAdapter();
    }
} catch (err) {
    console.error('[DB] Connection failed:', err.message);
    console.error('[DB] The application will continue but database features will be unavailable.');
}

module.exports = db;
