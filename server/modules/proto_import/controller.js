const { getActiveWorkspace, getWorkspaceDb } = require('../../utils/workspace');
const storageService = require('../../services/storageService');
const db = require('../../config/database');
const ApiError = require('../../utils/apiError');
const protoImportService = require('../../services/protoImportService');

/**
 * Import items from JSON array.
 */
const importItems = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) throw ApiError.unauthorized();

        const activeWS = await getActiveWorkspace(userId);
        if (!activeWS) throw ApiError.badRequest('Kein aktiver Workspace ausgewählt');

        let items = [];
        if (req.body.items && Array.isArray(req.body.items)) {
            items = req.body.items;
        } else if (req.body.text && typeof req.body.text === 'string') {
            items = protoImportService.parseProtoText(req.body.text, 'item');
        } else {
            throw ApiError.badRequest('Entweder "items" (Array) oder "text" (String) erwartet');
        }

        // Check storage quota (estimate 1KB per item)
        try {
            await storageService.checkQuota(userId, activeWS.id, items.length * 1024);
        } catch (quotaErr) {
            if (quotaErr.code === 'QUOTA_EXCEEDED') {
                throw new ApiError(403, 'Speicherkontingent überschritten', {
                    usage: Math.round(quotaErr.usage / 1024 / 1024 * 100) / 100 + 'MB',
                    limit: Math.round(quotaErr.limit / 1024 / 1024 * 100) / 100 + 'MB'
                });
            }
            throw quotaErr;
        }

        const wsDb = await getWorkspaceDb(userId);
        if (!wsDb) throw ApiError.internal('Workspace-Datenbank konnte nicht geladen werden');

        // wsDb is cached, do not close manually
        const imported = protoImportService.writeItems(wsDb, items);

        res.json({ success: true, imported, total: items.length });
    } catch (err) {
        next(err);
    }
};

/**
 * Import mobs from JSON array.
 */
const importMobs = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) throw ApiError.unauthorized();

        const activeWS = await getActiveWorkspace(userId);
        if (!activeWS) throw ApiError.badRequest('Kein aktiver Workspace ausgewählt');

        let mobs = [];
        if (req.body.mobs && Array.isArray(req.body.mobs)) {
            mobs = req.body.mobs;
        } else if (req.body.text && typeof req.body.text === 'string') {
            mobs = protoImportService.parseProtoText(req.body.text, 'mob');
        } else {
            throw ApiError.badRequest('Entweder "mobs" (Array) oder "text" (String) erwartet');
        }

        // Check storage quota
        try {
            await storageService.checkQuota(userId, activeWS.id, mobs.length * 1024);
        } catch (quotaErr) {
            if (quotaErr.code === 'QUOTA_EXCEEDED') {
                throw new ApiError(403, 'Speicherkontingent überschritten', {
                    usage: Math.round(quotaErr.usage / 1024 / 1024 * 100) / 100 + 'MB',
                    limit: Math.round(quotaErr.limit / 1024 / 1024 * 100) / 100 + 'MB'
                });
            }
            throw quotaErr;
        }

        const wsDb = await getWorkspaceDb(userId);
        if (!wsDb) throw ApiError.internal('Workspace-Datenbank konnte nicht geladen werden');

        const imported = protoImportService.writeMobs(wsDb, mobs);

        res.json({ success: true, imported, total: mobs.length });
    } catch (err) {
        next(err);
    }
};

/**
 * Get database statistics.
 */
const getStats = async (req, res, next) => {
    if (!db) return res.json({ items: 0, mobs: 0, users: 0, dbType: 'none' });

    try {
        const [items] = await db.query('SELECT COUNT(*) as c FROM item_proto');
        const [mobs] = await db.query('SELECT COUNT(*) as c FROM mob_proto');
        const [users] = await db.query('SELECT COUNT(*) as c FROM m2em_users');

        res.json({
            items: items[0]?.c || 0,
            mobs: mobs[0]?.c || 0,
            users: users[0]?.c || 0,
            dbType: db.type
        });
    } catch (err) {
        // Stats failure shouldn't crash the UI, but we log it
        console.error('[Proto] Stats error:', err.message);
        res.json({ items: 0, mobs: 0, users: 0, dbType: db?.type || 'none' });
    }
};

module.exports = { importItems, importMobs, getStats };
