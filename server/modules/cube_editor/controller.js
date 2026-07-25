const fs = require('fs').promises;
const { existsSync } = require('fs'); // Still useful for quick checks if needed, but we prefer async
const path = require('path');
const db = require('../../config/database');
const ApiError = require('../../utils/apiError');

// --- Paths ---
const PROJECT_ROOT = process.cwd();
const LOCAL_ITEMS  = path.join(PROJECT_ROOT, 'public', 'assets', 'items');
const EXTERNAL_ITEMS = process.env.ICONS_PATH ? path.resolve(process.env.ICONS_PATH) : null;
const DEFAULT_ICON = path.join(PROJECT_ROOT, 'public', 'assets', 'images', 'default.png');

// --- Helpers ---
const { stripHTML } = require('../../utils/sanitizer');

const decodeName = (val) => {
    if (!val) return 'Unbekanntes Item';
    let raw = '';
    if (typeof val === 'string') raw = val;
    else if (Buffer.isBuffer(val)) raw = val.toString('latin1');
    else if (val.data) raw = Buffer.from(val.data).toString('latin1');
    else raw = String(val);

    return stripHTML(raw); // Security: Strip tags to prevent XSS
};

const { resolveWorkspacePath } = require('../../utils/workspace');

const getCubePath = async (userId) => {
    const defaultValue = path.join(PROJECT_ROOT, 'public', 'basic', 'cube.txt');
    return await resolveWorkspacePath(userId, 'cube.txt', defaultValue);
};

// Try to find the best icon file for a given vnum
const findIconFile = async (vnum, userId = null) => {
    const v = parseInt(vnum, 10);
    if (isNaN(v)) return null;

    const candidates = [v, v - (v % 10)];
    
    const { getActiveWorkspace } = require('../../utils/workspace');
    const storageService = require('../../services/storageService');
    
    const searchDirs = [];
    if (userId) {
        const ws = await getActiveWorkspace(userId);
        if (ws) {
            const wsIconPath = storageService.getWorkspaceIconPath(userId, ws.id);
            if (existsSync(wsIconPath)) searchDirs.push(wsIconPath);
            
            const legacyWsPath = path.join(PROJECT_ROOT, 'public', 'assets', 'workspaces', ws.id.toString(), 'items');
            if (existsSync(legacyWsPath)) searchDirs.push(legacyWsPath);
        }
    }
    searchDirs.push(LOCAL_ITEMS);
    if (EXTERNAL_ITEMS && existsSync(EXTERNAL_ITEMS)) {
        searchDirs.push(EXTERNAL_ITEMS);
    }

    for (const dir of searchDirs) {
        try {
            // Check if directory exists asynchronously
            await fs.access(dir);
        } catch (e) { continue; }

        for (const sv of candidates) {
            const padded5 = sv.toString().padStart(5, '0');
            const padded4 = sv.toString().padStart(4, '0');
            
            const checks = [
                `${padded5}.png`, `${sv}.png`, `${padded4}.png`,
                `${padded5}.PNG`, `${sv}.PNG`
            ];
            
            for (const file of checks) {
                const p = path.join(dir, file);
                try {
                    await fs.access(p);
                    return p;
                } catch (e) {}
            }
        }
    }

    return null;
};

// --- Route handlers ---

const getItemIcon = async (req, res, next) => {
    try {
        const found = await findIconFile(req.params.vnum, req.user?.id);
        if (found) return res.sendFile(found);
        
        try {
            await fs.access(DEFAULT_ICON);
            return res.sendFile(DEFAULT_ICON);
        } catch (e) {
            throw ApiError.notFound('Icon nicht gefunden');
        }
    } catch (err) {
        next(err);
    }
};

const searchItems = async (req, res, next) => {
    const query = req.query.q || '';
    const userId = req.user?.id;
    const { getWorkspaceScope, getWorkspaceDb } = require('../../utils/workspace');
    
    try {
        const wsDb = await getWorkspaceDb(userId);
        let items = [];

        if (wsDb) {
            const stmt = wsDb.prepare(
                `SELECT vnum, locale_name AS name, type, subtype, flag
                 FROM item_proto
                 WHERE (CAST(vnum AS TEXT) LIKE ? OR locale_name LIKE ?)
                 ORDER BY vnum ASC LIMIT 50`
            );
            items = stmt.all(`%${query}%`, `%${query}%`);
            // Note: wsDb is now cached, do not close it manually
        } else {
            const scope = await getWorkspaceScope(userId);
            const [rows] = await db.query(
                `SELECT vnum, locale_name AS name, type, subtype, flag, userId
                 FROM item_proto
                 WHERE (CAST(vnum AS TEXT) LIKE ? OR locale_name LIKE ?)
                 AND ${scope.clause}
                 ORDER BY vnum ASC LIMIT 50`,
                [`%${query}%`, `%${query}%`, scope.param]
            );
            items = rows;
        }
        
        return res.json(items.map(r => ({
            vnum: r.vnum,
            name: decodeName(r.name),
            type: r.type,
            subtype: r.subtype,
            flag: r.flag
        })));
    } catch (err) {
        next(ApiError.internal('Artikelsuche fehlgeschlagen', err.message));
    }
};


const getItemNames = async (req, res, next) => {
    const vnums = req.body.vnums || [];
    if (!vnums.length) return res.json({});
    const userId = req.user?.id;
    const { getWorkspaceDb } = require('../../utils/workspace');

    try {
        const wsDb = await getWorkspaceDb(userId);
        let rows = [];

        if (wsDb) {
            const stmt = wsDb.prepare(`SELECT vnum, locale_name AS name, type, subtype, flag FROM item_proto WHERE vnum IN (${vnums.map(() => '?').join(',')})`);
            rows = stmt.all(...vnums);
        } else if (db) {
            const [dbRows] = await db.query(
                `SELECT vnum, locale_name AS name, type, subtype, flag
                 FROM item_proto WHERE vnum IN (?)`,
                [vnums]
            );
            rows = dbRows;
        }

        const map = {};
        rows.forEach(r => {
            map[r.vnum] = {
                name: decodeName(r.name),
                type: r.type,
                subtype: r.subtype,
                flag: r.flag
            };
        });
        return res.json(map);
    } catch (err) {
        next(ApiError.internal('Namensauflösung fehlgeschlagen', err.message));
    }
};

const searchNpcs = async (req, res, next) => {
    const query = req.query.q || '';
    const userId = req.user?.id;
    const { getWorkspaceScope, getWorkspaceDb } = require('../../utils/workspace');

    try {
        const wsDb = await getWorkspaceDb(userId);
        let rows = [];

        if (wsDb) {
            const stmt = wsDb.prepare(
                `SELECT vnum, locale_name AS name
                 FROM mob_proto
                 WHERE CAST(vnum AS TEXT) LIKE ? OR locale_name LIKE ?
                 LIMIT 50`
            );
            rows = stmt.all(`%${query}%`, `%${query}%`);
        } else if (db) {
            const scope = await getWorkspaceScope(userId);
            const [dbRows] = await db.query(
                `SELECT vnum, locale_name AS name
                 FROM mob_proto
                 WHERE (CAST(vnum AS TEXT) LIKE ? OR locale_name LIKE ?)
                 AND ${scope.clause}
                 LIMIT 50`,
                [`%${query}%`, `%${query}%`, scope.param]
            );
            rows = dbRows;
        }

        return res.json(rows.map(r => ({ vnum: r.vnum, name: decodeName(r.name) })));
    } catch (err) {
        next(ApiError.internal('NPC-Suche fehlgeschlagen', err.message));
    }
};

const loadCube = async (req, res, next) => {
    try {
        const cubePath = await getCubePath(req.user?.id);
        try {
            await fs.access(cubePath);
            res.sendFile(cubePath);
        } catch (e) {
            res.send('');
        }
    } catch (err) {
        next(err);
    }
};

const saveCube = async (req, res, next) => {
    const { content } = req.body;
    try {
        const cubePath = await getCubePath(req.user?.id);
        if (!content) throw ApiError.badRequest('Inhalt ist leer');
        
        const dir = path.dirname(cubePath);
        try {
            await fs.access(dir);
        } catch (e) {
            await fs.mkdir(dir, { recursive: true });
        }
        
        await fs.writeFile(cubePath, content, 'utf-8');
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    searchItems,
    searchNpcs,
    getItemNames,
    loadCube,
    saveCube,
    getItemIcon
};
