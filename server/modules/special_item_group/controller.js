const fs = require('fs').promises;
const { existsSync } = require('fs');
const path = require('path');
const { resolveWorkspacePath } = require('../../utils/workspace');
const ApiError = require('../../utils/apiError');

const PROJECT_ROOT = process.cwd();

const getSpecialItemGroupPath = async (userId) => {
    const defaultValue = path.join(PROJECT_ROOT, 'public', 'basic', 'special_item_group.txt');
    return await resolveWorkspacePath(userId, 'special_item_group.txt', defaultValue);
};

const loadSpecialItemGroup = async (req, res, next) => {
    try {
        const filePath = await getSpecialItemGroupPath(req.user?.id);
        if (!existsSync(filePath)) {
            return res.send(''); // Empty config if none exists
        }
        const content = await fs.readFile(filePath, 'utf-8');
        res.send(content);
    } catch (err) {
        next(ApiError.internal('Fehler beim Laden von group.txt', err.message));
    }
};

const saveSpecialItemGroup = async (req, res, next) => {
    const { content } = req.body;
    if (!content) return next(ApiError.badRequest('Kein Inhalt gesendet'));
    
    try {
        const filePath = await getSpecialItemGroupPath(req.user?.id);
        const dir = path.dirname(filePath);
        if (!existsSync(dir)) await fs.mkdir(dir, { recursive: true });
        
        await fs.writeFile(filePath, content, 'utf-8');
        res.json({ success: true, message: 'special_item_group.txt gespeichert!' });
    } catch (err) {
        next(ApiError.internal('Speichern fehlgeschlagen', err.message));
    }
};

module.exports = { loadSpecialItemGroup, saveSpecialItemGroup };
