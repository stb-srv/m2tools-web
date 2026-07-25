const db = require('../../config/database');
const storageService = require('../../services/storageService');
const fs = require('fs').promises;
const { existsSync, mkdirSync, writeFileSync } = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const ApiError = require('../../utils/apiError');
const { getWorkspaceDb } = require('../../utils/workspace');

// List workspaces for user (personal + team)
const list = async (req, res, next) => {
    try {
        const [rows] = await db.query(
            `SELECT w.* FROM workspaces w
             LEFT JOIN m2em_team_members tm ON w.team_id = tm.team_id
             WHERE w.userId = ? OR tm.user_id = ?
             GROUP BY w.id
             ORDER BY w.created_at DESC`,
            [req.user.id, req.user.id]
        );

        // Get activeId
        const [userRows] = await db.query('SELECT current_workspace_id as activeId FROM m2em_users WHERE id = ?', [req.user.id]);
        const activeId = userRows[0]?.activeId;

        // Include storage usage info
        const usage = await storageService.calculateUsage(req.user.id);
        const limit = await storageService.getLimit(req.user.id);

        res.json({ workspaces: rows, activeId, usage, limit });
    } catch (err) {
        next(ApiError.internal('Fehler beim Auflisten der Workspaces', err.message));
    }
};

// Create workspace
const create = async (req, res, next) => {
    const { name, description, base_path, db_config, team_id } = req.body;
    if (!name) return next(ApiError.badRequest('Name ist erforderlich'));

    try {
        // Enforce Limit
        const [userRows] = await db.query('SELECT role FROM m2em_users WHERE id = ?', [req.user.id]);
        const userRole = userRows[0]?.role || 'user';
        
        if (userRole !== 'admin') {
            const [limitRows] = await db.query('SELECT value FROM system_settings WHERE key = ?', ['max_workspaces_per_user']);
            const maxWS = parseInt(limitRows[0]?.value || '1');
            
            const [countRows] = await db.query('SELECT COUNT(*) as c FROM workspaces WHERE userId = ?', [req.user.id]);
            if ((countRows[0]?.c || 0) >= maxWS) {
                throw ApiError.forbidden(`Limit erreicht: Maximal ${maxWS} Workspace(s) erlaubt.`);
            }
        }

        const [result] = await db.query(
            'INSERT INTO workspaces (userId, team_id, name, description, base_path, db_config) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.id, team_id || null, name, description || '', base_path || '', db_config ? JSON.stringify(db_config) : null]
        );
        
        // Auto-select if first
        const [countRows] = await db.query('SELECT COUNT(*) as c FROM workspaces WHERE userId = ?', [req.user.id]);
        if ((countRows[0]?.c || 0) === 1) {
            await db.query('UPDATE m2em_users SET current_workspace_id = ? WHERE id = ?', [result.insertId, req.user.id]);
        }

        // Initialize folder structure
        await storageService.initWorkspace(req.user.id, result.insertId);

        res.json({ success: true, id: result.insertId });
    } catch (err) {
        next(err);
    }
};

// Select active workspace
const select = async (req, res, next) => {
    const { id } = req.body;
    if (!id) return next(ApiError.badRequest('Workspace ID ist erforderlich'));

    try {
        // Verify ownership OR team membership
        const [rows] = await db.query(
            `SELECT w.id FROM workspaces w
             LEFT JOIN m2em_team_members tm ON w.team_id = tm.team_id
             WHERE w.id = ? AND (w.userId = ? OR tm.user_id = ?)`,
            [id, req.user.id, req.user.id]
        );
        
        if (rows.length === 0) throw ApiError.forbidden('Kein Zugriff auf diesen Workspace');

        await db.query('UPDATE m2em_users SET current_workspace_id = ? WHERE id = ?', [id, req.user.id]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};

// Get active workspace
const getActive = async (req, res, next) => {
    try {
        const [userRows] = await db.query('SELECT current_workspace_id FROM m2em_users WHERE id = ?', [req.user.id]);
        const activeId = userRows[0]?.current_workspace_id;

        if (!activeId) {
            const [wsRows] = await db.query(
                `SELECT w.* FROM workspaces w
                 LEFT JOIN m2em_team_members tm ON w.team_id = tm.team_id
                 WHERE w.userId = ? OR tm.user_id = ?
                 ORDER BY w.is_default DESC, w.created_at DESC LIMIT 1`,
                [req.user.id, req.user.id]
            );
            if (wsRows.length > 0) {
                await db.query('UPDATE m2em_users SET current_workspace_id = ? WHERE id = ?', [wsRows[0].id, req.user.id]);
                return res.json(wsRows[0]);
            }
            return res.json(null);
        }

        const [wsRows] = await db.query(
            `SELECT w.* FROM workspaces w
             LEFT JOIN m2em_team_members tm ON w.team_id = tm.team_id
             WHERE w.id = ? AND (w.userId = ? OR tm.user_id = ?)`,
            [activeId, req.user.id, req.user.id]
        );
        res.json(wsRows[0] || null);
    } catch (err) {
        next(ApiError.internal('Fehler beim Abrufen des aktiven Workspaces', err.message));
    }
};

// Delete workspace
const remove = async (req, res, next) => {
    const { id } = req.params;
    try {
        // Only owner can delete
        const [wsRows] = await db.query('SELECT id FROM workspaces WHERE id = ? AND userId = ?', [id, req.user.id]);
        if (wsRows.length === 0) throw ApiError.forbidden('Nicht berechtigt oder Workspace existiert nicht');

        await db.query('DELETE FROM workspaces WHERE id = ? AND userId = ?', [id, req.user.id]);
        
        // Cleanup storage
        await storageService.deleteWorkspaceData(req.user.id, id);

        // Reset current_workspace_id if it was this one
        await db.query('UPDATE m2em_users SET current_workspace_id = NULL WHERE id = ? AND current_workspace_id = ?', [req.user.id, id]);

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};

// Get workspace detail
const getDetails = async (req, res, next) => {
    const { id } = req.params;
    try {
        const [ws] = await db.query(
            `SELECT w.* FROM workspaces w
             LEFT JOIN m2em_team_members tm ON w.team_id = tm.team_id
             WHERE w.id = ? AND (w.userId = ? OR tm.user_id = ?)`,
            [id, req.user.id, req.user.id]
        );
        if (!ws.length) throw ApiError.notFound('Workspace nicht gefunden');
        
        res.json(ws[0]);
    } catch (err) {
        next(err);
    }
};

// Upload proto.db
const uploadDb = async (req, res, next) => {
    const { id } = req.params;
    if (!req.file) return next(ApiError.badRequest('Keine Datei hochgeladen'));

    try {
        try {
            await storageService.checkQuota(req.user.id, req.file.size);
        } catch (qErr) {
            if (qErr.code === 'QUOTA_EXCEEDED') throw new ApiError(403, qErr.message);
            throw qErr;
        }

        const dbPath = storageService.getWorkspaceDbPath(req.user.id, id);
        const dir = path.dirname(dbPath);
        
        if (!existsSync(dir)) await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(dbPath, req.file.buffer);

        res.json({ success: true, message: 'Datenbank erfolgreich aktualisiert' });
    } catch (err) {
        next(err);
    }
};

// Upload Icons (ZIP)
const uploadIcons = async (req, res, next) => {
    const { id } = req.params;
    if (!req.file) return next(ApiError.badRequest('Keine Datei hochgeladen'));

    try {
        const zip = new AdmZip(req.file.buffer);
        const iconDir = storageService.getWorkspaceIconPath(req.user.id, id);
        
        try {
            await storageService.checkQuota(req.user.id, req.file.size);
        } catch (qErr) {
            if (qErr.code === 'QUOTA_EXCEEDED') throw new ApiError(403, qErr.message);
            throw qErr;
        }

        if (!existsSync(iconDir)) await fs.mkdir(iconDir, { recursive: true });

        // Security: Manually extract to prevent Zip Slip
        const entries = zip.getEntries();
        for (const entry of entries) {
            const entryName = entry.entryName;
            const targetPath = path.join(iconDir, entryName);
            
            // Check if entry stays inside target directory
            const relative = path.relative(iconDir, targetPath);
            if (relative.startsWith('..') || path.isAbsolute(relative)) {
                 console.warn('[Security] Zip Slip attempt blocked:', entryName);
                 continue; // Skip this entry
            }

            if (entry.isDirectory) {
                if (!existsSync(targetPath)) await fs.mkdir(targetPath, { recursive: true });
            } else {
                const dir = path.dirname(targetPath);
                if (!existsSync(dir)) await fs.mkdir(dir, { recursive: true });
                await fs.writeFile(targetPath, entry.getData());
            }
        }

        res.json({ success: true, message: 'Icons erfolgreich entpackt' });
    } catch (err) {
        next(ApiError.internal('Entpacken der Icons fehlgeschlagen', err.message));
    }
};

// Upload Item Proto (TXT)
const uploadItemProto = async (req, res, next) => {
    const { id } = req.params;
    if (!req.file) return next(ApiError.badRequest('Keine Datei hochgeladen'));

    try {
        const userId = req.user.id;
        const { parseProtoText } = require('../proto_import/controller');
        const content = req.file.buffer.toString('utf-8');
        
        console.log(`[Proto Debug] User ${userId} uploaded file, size: ${req.file.size} bytes`);
        console.log(`[Proto Debug] First 200 chars: ${content.substring(0, 200)}`);
        
        const items = parseProtoText(content, 'item');
        console.log(`[Proto Debug] Parsed items count: ${items.length}`);

        if (items.length === 0) {
            // Check if encoding might be the issue
            const latinContent = req.file.buffer.toString('latin1');
            console.log(`[Proto Debug] Retrying with latin1... First 200: ${latinContent.substring(0, 200)}`);
            const itemsLatin = parseProtoText(latinContent, 'item');
            if (itemsLatin.length > 0) {
                console.log(`[Proto Debug] Success with latin1 (${itemsLatin.length} items)`);
                return await processItems(itemsLatin, userId, res, next);
            }
            throw ApiError.badRequest('Keine gültigen Einträge im File gefunden. Bitte Dateiformat prüfen.');
        }

        return await processItems(items, userId, res, next);
    } catch (err) {
        next(err);
    }
};

const processItems = async (items, userId, res, next) => {
    try {
        const wsDb = await getWorkspaceDb(userId);
        if (!wsDb) throw ApiError.internal('Workspace-Datenbank konnte nicht geladen werden');

        let imported = 0;
        const insertStmt = wsDb.prepare(
            `INSERT OR REPLACE INTO item_proto (vnum, locale_name, type, subtype, flag) VALUES (?, ?, ?, ?, ?)`
        );

        const transaction = wsDb.transaction((rows) => {
            for (const item of rows) {
                insertStmt.run(
                    parseInt(item.vnum) || 0,
                    item.locale_name || item.name || '',
                    parseInt(item.type) || 0,
                    parseInt(item.subtype) || 0,
                    parseInt(item.flag) || 0
                );
                imported++;
            }
        });

        transaction(items);
        res.json({ success: true, message: `${imported} Items erfolgreich importiert` });
    } catch (err) {
        next(err);
    }
};

// Upload Mob Proto (TXT)
const uploadMobProto = async (req, res, next) => {
    const { id } = req.params;
    if (!req.file) return next(ApiError.badRequest('Keine Datei hochgeladen'));

    try {
        const userId = req.user.id;
        const { parseProtoText } = require('../proto_import/controller');
        const content = req.file.buffer.toString('utf-8');
        
        console.log(`[Proto Mob Debug] User ${userId} uploaded file, size: ${req.file.size} bytes`);
        
        const mobs = parseProtoText(content, 'mob');
        if (mobs.length === 0) {
            const latinContent = req.file.buffer.toString('latin1');
            const mobsLatin = parseProtoText(latinContent, 'mob');
            if (mobsLatin.length > 0) {
                return await processMobs(mobsLatin, userId, res, next);
            }
            throw ApiError.badRequest('Keine gültigen Einträge im File gefunden.');
        }

        return await processMobs(mobs, userId, res, next);
    } catch (err) {
        next(err);
    }
};

const processMobs = async (mobs, userId, res, next) => {
    try {
        const wsDb = await getWorkspaceDb(userId);
        if (!wsDb) throw ApiError.internal('Workspace-Datenbank konnte nicht geladen werden');

        let imported = 0;
        const insertStmt = wsDb.prepare(
            `INSERT OR REPLACE INTO mob_proto (vnum, locale_name, type, level) VALUES (?, ?, ?, ?)`
        );

        const transaction = wsDb.transaction((rows) => {
            for (const mob of rows) {
                insertStmt.run(
                    parseInt(mob.vnum) || 0,
                    mob.locale_name || mob.name || '',
                    parseInt(mob.type) || 0,
                    parseInt(mob.level) || 0
                );
                imported++;
            }
        });

        transaction(mobs);
        res.json({ success: true, message: `${imported} Mob-Einträge erfolgreich importiert` });
    } catch (err) {
        next(err);
    }
};

module.exports = { list, create, select, getActive, remove, getDetails, uploadDb, uploadIcons, uploadItemProto, uploadMobProto };
