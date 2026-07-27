const fs = require('fs').promises;
const { existsSync } = require('fs');
const path = require('path');
const ApiError = require('../../utils/apiError');
const { resolveWorkspacePath } = require('../../utils/workspace');

const PROJECT_ROOT = process.cwd();

const getRegenPath = async (userId) => {
    const defaultValue = path.join(PROJECT_ROOT, 'public', 'basic', 'regen.txt');
    return await resolveWorkspacePath(userId, 'regen.txt', defaultValue);
};

// ── Parsing Logic ────────────────────────────────────
// Metin2 regen.txt syntax isn't fully standardized across server cores -
// this follows the same Group/{ }/keyed-field idiom mob_drop_item.txt
// already uses in this project (Group name, a "Vnum" field, then numeric
// data lines - here x/y/direction spawn points instead of drop lines).
// Raw text mode (the default, no ?format=json) always round-trips
// correctly regardless of the exact dialect a given server expects;
// structured mode is a convenience for servers matching this shape.

const parseRegenText = (text) => {
    const lines = text.split(/\r?\n/);
    const groups = [];
    let currentGroup = null;

    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('//')) continue;

        if (line.startsWith('Group')) {
            const parts = line.split(/\s+/);
            currentGroup = { id: parts[1] || 'Unknown', vnum: '', points: [] };
            continue;
        }
        if (line === '{') continue;
        if (line === '}') {
            if (currentGroup) groups.push(currentGroup);
            currentGroup = null;
            continue;
        }
        if (currentGroup) {
            const parts = line.split(/\s+/);
            if (parts[0] === 'Vnum') {
                currentGroup.vnum = parts[1] || '';
            } else if (!isNaN(parts[0])) {
                currentGroup.points.push({ x: parts[0], y: parts[1] || '0', direction: parts[2] || '0' });
            }
        }
    }
    return groups;
};

const stringifyRegenData = (groups) => {
    let out = '';
    groups.forEach(g => {
        out += `Group\t${g.id}\n{\n\tVnum\t${g.vnum}\n`;
        (g.points || []).forEach(p => {
            out += `\t${p.x}\t${p.y}\t${p.direction}\n`;
        });
        out += `}\n\n`;
    });
    return out;
};

// ── Handlers ─────────────────────────────────────────

const loadRegen = async (req, res, next) => {
    try {
        const filePath = await getRegenPath(req.user?.id);
        if (!existsSync(filePath)) {
            return req.query.format === 'json' ? res.json([]) : res.send('');
        }

        const content = await fs.readFile(filePath, 'utf-8');
        if (req.query.format === 'json') {
            return res.json(parseRegenText(content));
        }
        res.send(content);
    } catch (err) {
        next(ApiError.internal('Fehler beim Laden von regen.txt', err.message));
    }
};

const saveRegen = async (req, res, next) => {
    const { content, groups } = req.body;
    try {
        const filePath = await getRegenPath(req.user?.id);
        const textToSave = groups ? stringifyRegenData(groups) : content;
        if (!textToSave) throw ApiError.badRequest('Inhalt ist leer');

        const dir = path.dirname(filePath);
        if (!existsSync(dir)) await fs.mkdir(dir, { recursive: true });

        await fs.writeFile(filePath, textToSave, 'utf-8');
        res.json({ success: true, message: 'regen.txt gespeichert!' });
    } catch (err) {
        next(err);
    }
};

module.exports = { loadRegen, saveRegen };
