const { getActiveWorkspace, getWorkspaceDb } = require('../../utils/workspace');
const storageService = require('../../services/storageService');
const db = require('../../config/database');
const ApiError = require('../../utils/apiError');

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
            items = parseProtoText(req.body.text, 'item');
        } else {
            throw ApiError.badRequest('Entweder "items" (Array) oder "text" (String) erwartet');
        }

        // Check storage quota (estimate 1KB per item)
        try {
            await storageService.checkQuota(userId, items.length * 1024);
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
        // wsDb is cached, do not close manually

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
            mobs = parseProtoText(req.body.text, 'mob');
        } else {
            throw ApiError.badRequest('Entweder "mobs" (Array) oder "text" (String) erwartet');
        }

        // Check storage quota
        try {
            await storageService.checkQuota(userId, mobs.length * 1024);
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

        res.json({ success: true, imported, total: mobs.length });
    } catch (err) {
        next(err);
    }
};

/**
 * Parse tab-separated proto text.
 */
function parseProtoText(text, type) {
    if (!text) return [];
    
    // Remove BOM (Byte Order Mark)
    if (text.charCodeAt(0) === 0xFEFF) {
        text = text.substring(1);
    }

    // Split into lines
    const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'));
    if (lines.length === 0) return [];

    // Detect separator based on first valid data line
    const firstLine = lines[0];
    let separator = '\t'; // Default

    // Logic to detect SQL
    if (firstLine.toUpperCase().includes('INSERT INTO')) {
        return parseSqlProto(lines, type);
    }

    if (!firstLine.includes('\t')) {
        if (firstLine.includes(';')) separator = ';';
        else if (firstLine.includes('  ')) separator = /\s\s+/; // Multiple spaces
        else if (firstLine.includes(',')) separator = ',';
        else if (firstLine.includes(' ')) separator = ' '; // Single space fallback
    }

    const results = [];
    for (const line of lines) {
        let cols = line.split(separator).map(c => c.trim().replace(/^["']|["']$/g, ''));
        if (cols.length < 2) continue;

        const vnum = parseInt(cols[0]);
        if (isNaN(vnum) || vnum === 0) continue;

        if (type === 'item') {
            results.push({
                vnum,
                locale_name: cols[1] || '',
                type: parseInt(cols[2]) || 0,
                subtype: parseInt(cols[3]) || 0,
                flag: parseInt(cols[4]) || 0
            });
        } else {
            results.push({
                vnum,
                locale_name: cols[1] || '',
                type: parseInt(cols[2]) || 0,
                level: parseInt(cols[3]) || 0
            });
        }
    }

    return results;
}

/**
 * Handle SQL INSERT statements
 */
function parseSqlProto(lines, type) {
    const results = [];
    const regex = /VALUES\s*\((.*?)\)/i;

    for (const line of lines) {
        const match = line.match(regex);
        if (!match) continue;

        // Split values by comma, but respect quoted strings
        const values = match[1].split(/,(?=(?:(?:[^']*'){2})*[^']*$)/).map(v => v.trim().replace(/^['"]|['"]$/g, ''));
        
        if (values.length < 2) continue;

        const vnum = parseInt(values[0]);
        if (isNaN(vnum) || vnum === 0) continue;

        if (type === 'item') {
            results.push({
                vnum,
                locale_name: values[1] || '',
                type: parseInt(values[2]) || 0,
                subtype: parseInt(values[3]) || 0,
                flag: parseInt(values[4]) || 0
            });
        } else {
            results.push({
                vnum,
                locale_name: values[1] || '',
                type: parseInt(values[2]) || 0,
                level: parseInt(values[3]) || 0
            });
        }
    }
    return results;
}

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

module.exports = { importItems, importMobs, getStats, parseProtoText };
