const fs = require('fs').promises;
const { existsSync } = require('fs');
const path = require('path');
const ApiError = require('../../utils/apiError');

const PROJECT_ROOT = process.cwd();
const { resolveWorkspacePath } = require('../../utils/workspace');

const getMobDropPath = async (userId) => {
    const defaultValue = path.join(PROJECT_ROOT, 'public', 'basic', 'mob_drop_item.txt');
    return await resolveWorkspacePath(userId, 'mob_drop_item.txt', defaultValue);
};

// ── Parsing Logic ────────────────────────────────────

/**
 * Parsed mob_drop_item.txt to JSON.
 */
const parseMobDropText = (text) => {
    const lines = text.split(/\r?\n/);
    const groups = [];
    let currentGroup = null;

    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('//')) continue;

        if (line.startsWith('Group')) {
            const parts = line.split(/\s+/);
            const name = parts[1] || 'Unknown';
            currentGroup = { id: name, mob: '', type: 'drop', lines: [] };
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
            if (parts[0] === 'Mob') {
                currentGroup.mob = parts[1];
            } else if (parts[0] === 'Type') {
                currentGroup.type = parts[1];
            } else if (!isNaN(parts[0])) {
                // Item line: ID VNUM COUNT PROB
                currentGroup.lines.push({
                    id: parts[0],
                    vnum: parts[1],
                    count: parts[2] || 1,
                    prob: parts[3] || 1
                });
            }
        }
    }
    return groups;
};

/**
 * JSON back to Metin2 format.
 */
const stringifyMobDropData = (groups) => {
    let out = '';
    groups.forEach(g => {
        out += `Group\t${g.id}\n`;
        out += `{\n`;
        out += `\tMob\t${g.mob}\n`;
        out += `\tType\t${g.type}\n`;
        g.lines.forEach((l, idx) => {
            out += `\t${idx + 1}\t${l.vnum}\t${l.count}\t${l.prob}\n`;
        });
        out += `}\n\n`;
    });
    return out;
};

// ── Handlers ─────────────────────────────────────────

const loadMobDrop = async (req, res, next) => {
    try {
        const filePath = await getMobDropPath(req.user?.id);
        if (!existsSync(filePath)) return res.json([]);
        
        const content = await fs.readFile(filePath, 'utf-8');
        
        // Check if user wants raw or structured
        if (req.query.format === 'json') {
            const json = parseMobDropText(content);
            return res.json(json);
        }
        res.send(content);
    } catch (err) {
        next(ApiError.internal('Fehler beim Laden von mob_drop_item.txt', err.message));
    }
};

const saveMobDrop = async (req, res, next) => {
    const { content, groups } = req.body;
    try {
        const filePath = await getMobDropPath(req.user?.id);
        const textToSave = groups ? stringifyMobDropData(groups) : content;
        
        if (!textToSave) throw ApiError.badRequest('Inhalt ist leer');

        const dir = path.dirname(filePath);
        if (!existsSync(dir)) await fs.mkdir(dir, { recursive: true });
        
        await fs.writeFile(filePath, textToSave, 'utf-8');
        res.json({ success: true, message: 'mob_drop_item.txt gespeichert!' });
    } catch (err) {
        next(err);
    }
};

const fixMobDrop = (req, res, next) => {
    const { content } = req.body;
    if (!content) return next(ApiError.badRequest('Kein Inhalt gesendet'));
    
    const umlautMap = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss' };
    const fixed = content.replace(/Group\t([^\r\n]+)/g, (match, name) => {
        let newName = name;
        for (const [umlaut, replacement] of Object.entries(umlautMap)) {
            newName = newName.split(umlaut).join(replacement);
        }
        newName = newName.split(' ').join('_');
        return `Group\t${newName}`;
    });
    res.json({ fixed });
};

module.exports = { loadMobDrop, saveMobDrop, fixMobDrop };
