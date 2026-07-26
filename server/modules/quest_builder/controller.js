const fs = require('fs').promises;
const { existsSync, readdirSync, statSync } = require('fs');
const path = require('path');
const db = require('../../config/database');
const { getActiveWorkspace, getWorkspaceScope, getWorkspaceDb } = require('../../utils/workspace');
const ApiError = require('../../utils/apiError');
const { decodeLocaleBytes } = require('../../services/protoImportService');

const PROJECT_ROOT = process.cwd();
const QUEST_ASSETS_DIR = path.join(PROJECT_ROOT, 'public', 'assets', 'workspaces');

const getQuestsDir = async (userId) => {
    const ws = await getActiveWorkspace(userId);
    if (ws) {
        const dir = path.join(QUEST_ASSETS_DIR, ws.id.toString(), 'quests');
        if (!existsSync(dir)) await fs.mkdir(dir, { recursive: true });
        return dir;
    }
    // Fallback or unauthorized? For safety return a default
    const defaultDir = path.join(PROJECT_ROOT, 'public', 'basic', 'quests');
    if (!existsSync(defaultDir)) await fs.mkdir(defaultDir, { recursive: true });
    return defaultDir;
};

const decodeName = (val) => {
    if (!val) return 'Unbekannt';
    if (typeof val === 'string') return val;
    if (Buffer.isBuffer(val)) return decodeLocaleBytes(val);
    if (val.data) return decodeLocaleBytes(Buffer.from(val.data));
    return String(val);
};

// ── Search mobs from mob_proto ─────────────────────────
const searchMobs = async (req, res, next) => {
    const query = req.query.q || '';
    const userId = req.user?.id;

    try {
        const wsDb = await getWorkspaceDb(userId);
        let rows = [];

        if (wsDb) {
            const stmt = wsDb.prepare(
                `SELECT vnum, locale_name AS name, level, type
                 FROM mob_proto
                 WHERE (CAST(vnum AS TEXT) LIKE ? OR locale_name LIKE ?)
                 LIMIT 50`
            );
            rows = stmt.all(`%${query}%`, `%${query}%`);
            // wsDb is cached, do not close
        } else {
            const scope = await getWorkspaceScope(userId);
            const [dbRows] = await db.query(
                `SELECT vnum, locale_name AS name, level, type
                 FROM mob_proto
                 WHERE (CAST(vnum AS TEXT) LIKE ? OR locale_name LIKE ?)
                 AND ${scope.clause}
                 LIMIT 50`,
                [`%${query}%`, `%${query}%`, scope.param]
            );
            rows = dbRows;
        }

        return res.json(rows.map(r => ({
            vnum: r.vnum,
            name: decodeName(r.name),
            level: r.level,
            type: r.type
        })));
    } catch (err) {
        next(ApiError.internal('Fehler bei der Mob-Suche', err.message));
    }
};

// ── Save quest file ─────────────────────────────────────
const saveQuest = async (req, res, next) => {
    const { filename, content } = req.body;
    if (!filename || !content) {
        return next(ApiError.badRequest('Filename und Inhalt erforderlich'));
    }

    try {
        const questsDir = await getQuestsDir(req.user?.id);
        const safeName = filename.replace(/[^a-zA-Z0-9_\-]/g, '') + '.quest';
        const filePath = path.join(questsDir, safeName);

        await fs.writeFile(filePath, content, 'utf-8');
        res.json({ success: true, path: safeName });
    } catch (err) {
        next(ApiError.internal('Speichern der Quest fehlgeschlagen', err.message));
    }
};

// ── Load quest file ─────────────────────────────────────
const loadQuest = async (req, res, next) => {
    try {
        const filename = req.query.file;
        const questsDir = await getQuestsDir(req.user?.id);

        if (!filename) {
            const files = (await fs.readdir(questsDir))
                .filter(f => f.endsWith('.quest'))
                .map(f => {
                    try {
                        const stats = statSync(path.join(questsDir, f));
                        return { name: f, modified: stats.mtime };
                    } catch (e) {
                        return { name: f, modified: new Date() };
                    }
                });
            return res.json(files);
        }

        const safeName = path.basename(filename);
        const filePath = path.join(questsDir, safeName);
        if (!existsSync(filePath)) {
            throw ApiError.notFound('Datei nicht gefunden');
        }
        res.sendFile(filePath);
    } catch (err) {
        next(err);
    }
};

module.exports = { searchMobs, saveQuest, loadQuest };
