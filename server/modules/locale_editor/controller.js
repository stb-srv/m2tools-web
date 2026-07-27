const fs = require('fs').promises;
const { existsSync } = require('fs');
const path = require('path');
const ApiError = require('../../utils/apiError');
const { resolveWorkspacePath } = require('../../utils/workspace');

const PROJECT_ROOT = process.cwd();

const getLocalePath = async (userId) => {
    const defaultValue = path.join(PROJECT_ROOT, 'public', 'basic', 'locale_string.txt');
    return await resolveWorkspacePath(userId, 'locale_string.txt', defaultValue);
};

// locale_string.txt is a stable, universal format across Metin2 cores:
// one "key<TAB>value" pair per line - unlike regen.txt/npc.txt there's no
// dialect ambiguity here, so structured editing is the default (not an
// opt-in ?format=json like the other file-backed editors).

const parseLocaleText = (text) => {
    const lines = text.split(/\r?\n/);
    const entries = [];
    for (const line of lines) {
        if (!line.trim() || line.trim().startsWith('//')) continue;
        const tabIdx = line.indexOf('\t');
        if (tabIdx === -1) continue;
        entries.push({ key: line.slice(0, tabIdx), value: line.slice(tabIdx + 1) });
    }
    return entries;
};

const stringifyLocale = (entries) => entries.map(e => `${e.key}\t${e.value}`).join('\n') + '\n';

const loadLocale = async (req, res, next) => {
    try {
        const filePath = await getLocalePath(req.user?.id);
        if (!existsSync(filePath)) return res.json([]);

        const content = await fs.readFile(filePath, 'utf-8');
        res.json(parseLocaleText(content));
    } catch (err) {
        next(ApiError.internal('Fehler beim Laden von locale_string.txt', err.message));
    }
};

const saveLocale = async (req, res, next) => {
    const { entries } = req.body;
    if (!Array.isArray(entries)) return next(ApiError.badRequest('entries (Array) erforderlich'));

    try {
        const filePath = await getLocalePath(req.user?.id);
        const dir = path.dirname(filePath);
        if (!existsSync(dir)) await fs.mkdir(dir, { recursive: true });

        await fs.writeFile(filePath, stringifyLocale(entries), 'utf-8');
        res.json({ success: true, message: 'locale_string.txt gespeichert!' });
    } catch (err) {
        next(err);
    }
};

module.exports = { loadLocale, saveLocale };
