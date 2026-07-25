const fs = require('fs-extra');
const path = require('path');
const db = require('../config/database');

// Default Limits (fallback if DB fails)
const DEFAULT_LIMIT_STANDARD = 20 * 1024 * 1024; // 20MB
const DEFAULT_LIMIT_PREMIUM = 50 * 1024 * 1024;  // 50MB

const STORAGE_ROOT = path.resolve(__dirname, '..', '..', 'server', 'storage', 'data');

/**
 * Ensures the user's storage root exists.
 */
async function ensureUserRoot(userId) {
    const userPath = path.join(STORAGE_ROOT, `user_${userId}`);
    await fs.ensureDir(userPath);
    return userPath;
}

/**
 * Initializes a new workspace folder structure and a valid proto.db.
 */
async function initWorkspace(userId, wsId) {
    const wsPath = path.join(STORAGE_ROOT, `user_${userId}`, `ws_${wsId}`);
    const dirs = ['icons', 'db', 'exports'];
    
    for (const dir of dirs) {
        await fs.ensureDir(path.join(wsPath, dir));
    }

    const dbPath = path.join(wsPath, 'db', 'proto.db');
    let needsInit = true;

    // Check if DB exists AND is valid
    if (await fs.pathExists(dbPath)) {
        const stats = await fs.stat(dbPath);
        if (stats.size >= 100) {
            // Check for SQLite Header "SQLite format 3"
            const fd = await fs.open(dbPath, 'r');
            const buffer = Buffer.alloc(16);
            await fs.read(fd, buffer, 0, 16, 0);
            await fs.close(fd);
            
            if (buffer.toString('utf-8').startsWith('SQLite format 3')) {
                needsInit = false;
            }
        }
    }

    if (needsInit) {
        console.log(`[Storage] Initializing fresh proto.db for User ${userId}, WS ${wsId}`);
        if (await fs.pathExists(dbPath)) await fs.remove(dbPath);
        
        const Database = require('better-sqlite3');
        const wsDb = new Database(dbPath);
        
        wsDb.exec(`
            CREATE TABLE IF NOT EXISTS item_proto (
                vnum INTEGER PRIMARY KEY,
                locale_name TEXT NOT NULL DEFAULT '',
                type INTEGER DEFAULT 0,
                subtype INTEGER DEFAULT 0,
                flag INTEGER DEFAULT 0,
                anti_flag INTEGER DEFAULT 0,
                refine_vnum INTEGER DEFAULT 1,
                gold INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS mob_proto (
                vnum INTEGER PRIMARY KEY,
                locale_name TEXT NOT NULL DEFAULT '',
                type INTEGER DEFAULT 0,
                rank INTEGER DEFAULT 0,
                level INTEGER DEFAULT 0,
                ai_flag TEXT DEFAULT ''
            );
        `);
        wsDb.close();
    }

    return wsPath;
}

/**
 * Forcefully repairs a workspace database by deleting and re-initializing it.
 */
async function repairWorkspaceDb(userId, wsId) {
    const dbPath = path.join(STORAGE_ROOT, `user_${userId}`, `ws_${wsId}`, 'db', 'proto.db');
    if (await fs.pathExists(dbPath)) {
        await fs.remove(dbPath);
    }
    return await initWorkspace(userId, wsId);
}

/**
 * Recursively calculates the size of a directory in bytes.
 */
async function calculateUsage(userId) {
    const userPath = path.join(STORAGE_ROOT, `user_${userId}`);
    if (!(await fs.pathExists(userPath))) return 0;

    let totalSize = 0;
    const files = await fs.readdir(userPath, { recursive: true });
    
    for (const file of files) {
        const stats = await fs.stat(path.join(userPath, file));
        if (stats.isFile()) totalSize += stats.size;
    }
    
    return totalSize;
}

/**
 * Returns the storage limit for a user based on their premium status and global system settings.
 */
async function getLimit(userId) {
    try {
        const [rows] = await db.query('SELECT is_premium FROM m2em_users WHERE id = ?', [userId]);
        const isPremium = rows[0]?.is_premium || 0;

        // Fetch global limits from DB
        const [settingRows] = await db.query('SELECT key, value FROM system_settings WHERE key IN (?, ?)', [
            'storage_limit_standard',
            'storage_limit_premium'
        ]);

        const settings = {};
        settingRows.forEach(r => settings[r.key] = parseInt(r.value));

        const limitStd = settings['storage_limit_standard'] || DEFAULT_LIMIT_STANDARD;
        const limitPre = settings['storage_limit_premium'] || DEFAULT_LIMIT_PREMIUM;

        return isPremium ? limitPre : limitStd;
    } catch (err) {
        console.error('[StorageService] Error fetching limit:', err);
        return DEFAULT_LIMIT_STANDARD; // Safe fallback
    }
}

/**
 * Checks if adding the specified number of bytes will exceed the user's quota.
 * Throws an error if quota exceeded.
 */
async function checkQuota(userId, bytesToAdd = 0) {
    const [usage, limit] = await Promise.all([
        calculateUsage(userId),
        getLimit(userId)
    ]);

    if (usage + bytesToAdd > limit) {
        const err = new Error('Speicherkontingent überschritten');
        err.code = 'QUOTA_EXCEEDED';
        err.limit = limit;
        err.usage = usage;
        throw err;
    }

    return { usage, limit };
}

/**
 * Gets the absolute path for a workspace SQLite DB.
 */
function getWorkspaceDbPath(userId, wsId) {
    return path.join(STORAGE_ROOT, `user_${userId}`, `ws_${wsId}`, 'db', 'proto.db');
}

/**
 * Gets the absolute path for a workspace icon folder.
 */
function getWorkspaceIconPath(userId, wsId) {
    return path.join(STORAGE_ROOT, `user_${userId}`, `ws_${wsId}`, 'icons');
}

/**
 * Deletes a workspace folder and all its contents.
 */
async function deleteWorkspaceData(userId, wsId) {
    const wsPath = path.join(STORAGE_ROOT, `user_${userId}`, `ws_${wsId}`);
    if (await fs.pathExists(wsPath)) {
        await fs.remove(wsPath);
    }
}

/**
 * Gets the absolute path for a workspace root folder.
 */
function getWorkspacePath(userId, wsId) {
    return path.join(STORAGE_ROOT, `user_${userId}`, `ws_${wsId}`);
}

module.exports = {
    initWorkspace,
    calculateUsage,
    getLimit,
    checkQuota,
    getWorkspaceDbPath,
    getWorkspaceIconPath,
    getWorkspacePath,
    deleteWorkspaceData,
    repairWorkspaceDb,
    STORAGE_ROOT
};
