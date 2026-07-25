const db = require('../config/database');
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs-extra');

// Cache for workspace database connections
const wsDbCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Gets the active workspace for a user.
 * Returns the workspace object or null.
 */
async function getActiveWorkspace(userId) {
    try {
        const [userRows] = await db.query('SELECT current_workspace_id FROM m2em_users WHERE id = ?', [userId]);
        const activeId = userRows[0]?.current_workspace_id;

        if (!activeId) return null;

        const [wsRows] = await db.query('SELECT * FROM workspaces WHERE id = ? AND userId = ?', [activeId, userId]);
        return wsRows[0] || null;
    } catch (err) {
        console.error('[Workspace-Util] Error:', err);
        return null;
    }
}

/**
 * Resolves a file path within the active workspace.
 * Includes security checks against directory traversal.
 */
async function resolveWorkspacePath(userId, subPath, defaultValue) {
    const ws = await getActiveWorkspace(userId);
    if (ws && ws.base_path) {
        // Security: Prevent directory traversal in subPath
        // More robust: Remove any sequence of ../ or ..\
        const sanitizedSubPath = subPath.replace(/(\.\.[\/\\])+/g, '').replace(/^\.\.+$/, '');
        const normalizedSubPath = path.normalize(sanitizedSubPath);
        
        // Resolve absolute path
        const absolutePath = path.isAbsolute(ws.base_path) 
            ? path.join(ws.base_path, normalizedSubPath)
            : path.join(process.cwd(), ws.base_path, normalizedSubPath);

        // Security Check: Verify that the resolved path is still within the base_path
        const relative = path.relative(ws.base_path, absolutePath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            console.error('[Security] Workspace path traversal attempt blocked:', absolutePath);
            return defaultValue;
        }

        return absolutePath;
    }
    return defaultValue;
}

/**
 * Returns a SQL filter fragment for the active workspace.
 * If workspace is active: workspace_id = ?
 * If NO workspace: (workspace_id IS NULL AND userId = ?)
 */
async function getWorkspaceScope(userId) {
    const ws = await getActiveWorkspace(userId);
    if (ws) {
        return { 
            clause: 'workspace_id = ?', 
            param: ws.id,
            active: true,
            id: ws.id
        };
    }
    return { 
        clause: '(workspace_id IS NULL AND userId = ?)', 
        param: userId,
        active: false,
        id: null
    };
}

/**
 * Gets a better-sqlite3 connection to a specific workspace's proto.db by id.
 * Caller is responsible for verifying the user has access to wsId.
 */
async function openWorkspaceDb(userId, wsId) {
    const cacheKey = `${userId}_${wsId}`;
    const cached = wsDbCache.get(cacheKey);

    if (cached && cached.db && cached.db.open) {
        cached.lastUsed = Date.now();
        return cached.db;
    }

    const storageService = require('../services/storageService');
    const dbPath = storageService.getWorkspaceDbPath(userId, wsId);

    if (fs.existsSync(dbPath)) {
        let dbInstance = null;
        try {
            dbInstance = new Database(dbPath);
            // Validation: Try a simple operation to ensure it's a valid SQLite file
            dbInstance.pragma('journal_mode = WAL'); // This will fail if not a DB

            wsDbCache.set(cacheKey, { db: dbInstance, lastUsed: Date.now() });

            // Cleanup old connections periodically
            setTimeout(() => {
                const entry = wsDbCache.get(cacheKey);
                if (entry && Date.now() - entry.lastUsed >= CACHE_TTL) {
                    entry.db.close();
                    wsDbCache.delete(cacheKey);
                }
            }, CACHE_TTL);

            return dbInstance;
        } catch (err) {
            console.error(`[Workspace-Util] Failed to validate workspace DB for WS ${wsId}:`, err.message);
            if (dbInstance) try { dbInstance.close(); } catch (e) {}

            // If it's a corruption error, try to repair it!
            if (err.message.includes('file is not a database') || err.message.includes('malformed')) {
                console.log(`[Workspace-Util] Corruption detected in WS ${wsId}. Triggering repair...`);
                wsDbCache.delete(cacheKey);
                await storageService.repairWorkspaceDb(userId, wsId);

                // Try opening again after repair
                try {
                    const repairedDb = new Database(dbPath);
                    repairedDb.pragma('journal_mode = WAL');
                    wsDbCache.set(cacheKey, { db: repairedDb, lastUsed: Date.now() });
                    return repairedDb;
                } catch (retryErr) {
                    console.error('[Workspace-Util] Repair failed:', retryErr.message);
                }
            }
            return null;
        }
    }
    return null;
}

/**
 * Gets a better-sqlite3 connection to the user's *active* workspace proto.db.
 * Falls back to null if not found or no active workspace.
 */
async function getWorkspaceDb(userId) {
    const ws = await getActiveWorkspace(userId);
    if (!ws) return null;
    return openWorkspaceDb(userId, ws.id);
}

/**
 * Gets a better-sqlite3 connection to a specific workspace by id.
 * Caller must have already verified the user has access to wsId.
 */
async function getWorkspaceDbById(userId, wsId) {
    return openWorkspaceDb(userId, wsId);
}

module.exports = { getActiveWorkspace, resolveWorkspacePath, getWorkspaceScope, getWorkspaceDb, getWorkspaceDbById };
