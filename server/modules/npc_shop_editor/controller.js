const fs = require('fs').promises;
const { existsSync } = require('fs');
const path = require('path');
const ApiError = require('../../utils/apiError');
const { resolveWorkspacePath } = require('../../utils/workspace');

const PROJECT_ROOT = process.cwd();

const getShopPath = async (userId) => {
    const defaultValue = path.join(PROJECT_ROOT, 'public', 'basic', 'shop.txt');
    return await resolveWorkspacePath(userId, 'shop.txt', defaultValue);
};

const getNpcPath = async (userId) => {
    const defaultValue = path.join(PROJECT_ROOT, 'public', 'basic', 'npc.txt');
    return await resolveWorkspacePath(userId, 'npc.txt', defaultValue);
};

// ── Shop parsing (ShopName { vnum count ... }) ──────
// shop.txt's block shape is stable across cores (name line, then a brace
// block of "vnum count" pairs) unlike npc.txt, which is kept raw-text only
// below since its layout varies too much by core to safely structure-edit.

const parseShopText = (text) => {
    const lines = text.split(/\r?\n/);
    const shops = [];
    let curr = null;

    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('//')) continue;
        if (line === '{') continue;
        if (line === '}') {
            if (curr) shops.push(curr);
            curr = null;
            continue;
        }

        const parts = line.split(/\s+/);
        if (!curr) {
            curr = { id: line, items: [] };
        } else if (parts.length >= 2 && !isNaN(parts[0])) {
            curr.items.push({ vnum: parts[0], count: parts[1] });
        }
    }
    return shops;
};

const stringifyShops = (shops) => {
    let out = '';
    shops.forEach(s => {
        out += `${s.id}\n{\n`;
        (s.items || []).forEach(i => { out += `\t${i.vnum}\t${i.count}\n`; });
        out += `}\n\n`;
    });
    return out;
};

const loadShop = async (req, res, next) => {
    try {
        const filePath = await getShopPath(req.user?.id);
        if (!existsSync(filePath)) {
            return req.query.format === 'json' ? res.json([]) : res.send('');
        }

        const content = await fs.readFile(filePath, 'utf-8');
        if (req.query.format === 'json') {
            return res.json(parseShopText(content));
        }
        res.send(content);
    } catch (err) {
        next(ApiError.internal('Fehler beim Laden von shop.txt', err.message));
    }
};

const saveShop = async (req, res, next) => {
    const { content, shops } = req.body;
    try {
        const filePath = await getShopPath(req.user?.id);
        const textToSave = shops ? stringifyShops(shops) : content;
        if (!textToSave) throw ApiError.badRequest('Inhalt ist leer');

        const dir = path.dirname(filePath);
        if (!existsSync(dir)) await fs.mkdir(dir, { recursive: true });

        await fs.writeFile(filePath, textToSave, 'utf-8');
        res.json({ success: true, message: 'shop.txt gespeichert!' });
    } catch (err) {
        next(err);
    }
};

// ── NPC file (raw text only) ─────────────────────────
const loadNpc = async (req, res, next) => {
    try {
        const filePath = await getNpcPath(req.user?.id);
        if (!existsSync(filePath)) return res.send('');
        const content = await fs.readFile(filePath, 'utf-8');
        res.send(content);
    } catch (err) {
        next(ApiError.internal('Fehler beim Laden von npc.txt', err.message));
    }
};

const saveNpc = async (req, res, next) => {
    const { content } = req.body;
    if (!content) return next(ApiError.badRequest('Kein Inhalt gesendet'));

    try {
        const filePath = await getNpcPath(req.user?.id);
        const dir = path.dirname(filePath);
        if (!existsSync(dir)) await fs.mkdir(dir, { recursive: true });

        await fs.writeFile(filePath, content, 'utf-8');
        res.json({ success: true, message: 'npc.txt gespeichert!' });
    } catch (err) {
        next(ApiError.internal('Speichern fehlgeschlagen', err.message));
    }
};

module.exports = { loadShop, saveShop, loadNpc, saveNpc };
