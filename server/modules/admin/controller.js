const path = require('path');
const fs = require('fs').promises;
const { existsSync } = require('fs');
const db = require('../../config/database');
const ApiError = require('../../utils/apiError');
const { stripHTML } = require('../../utils/sanitizer');
const itemScanner = require('./item_scanner');

/**
 * Admin Module Initialization
 */
async function initAdmin() {
    try {
        const scanResult = await itemScanner.scan();
        if (scanResult.success) {
            console.log('\x1b[35m%s\x1b[0m', `[Admin] Item-Scanner: ${scanResult.items} Items und ${scanResult.icons} Icons synchronisiert.`);
        }
    } catch (e) {
        console.error('[Admin] Scanner error on boot:', e.message);
    }
}

// Boot-time scan
initAdmin();

const getModuleConfigs = async (req, res, next) => {
    try {
        const { getModuleRegistry } = require('../../utils/moduleLoader');
        const registry = getModuleRegistry();
        const [dbRows] = await db.query('SELECT * FROM modules_config');
        
        const merged = registry.map(m => {
            const dbConf = dbRows.find(r => r.id === m.id);
            return {
                ...m,
                access_level: dbConf?.access_level || m.defaultAccess,
                is_visible_guests: dbConf ? !!dbConf.is_visible_guests : true,
                created_at: dbConf?.created_at || null
            };
        });
        res.json(merged);
    } catch (err) {
        next(ApiError.internal('Fehler beim Laden der Modul-Konfiguration', err.message));
    }
};

/**
 * Update a module's access level.
 */
const updateModuleConfig = async (req, res, next) => {
    const { id, access_level, is_visible_guests } = req.body;
    if (!id || !access_level) return next(ApiError.badRequest('ID und Access-Level sind erforderlich'));

    try {
        await db.query(`
            INSERT INTO modules_config (id, access_level, is_visible_guests) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
                access_level = excluded.access_level,
                is_visible_guests = excluded.is_visible_guests
        `, [id, access_level, is_visible_guests ? 1 : 0]);
        res.json({ success: true, message: 'Modul-Berechtigungen aktualisiert.' });
    } catch (err) {
        next(err);
    }
};

/**
 * Get all users for admin management.
 */
const getAllUsers = async (req, res, next) => {
    try {
        const [rows] = await db.query('SELECT id, username, display_name AS displayName, role, is_premium AS isPremium, created_at AS createdAt FROM m2em_users');
        const sanitizedRows = rows.map(u => ({
            ...u,
            displayName: stripHTML(u.displayName || u.username)
        }));
        res.json(sanitizedRows);
    } catch (err) {
        next(ApiError.internal('Fehler beim Laden der Benutzerliste', err.message));
    }
};

/**
 * Update a user's role or premium status.
 */
const VALID_ROLES = ['admin', 'editor', 'viewer'];

const updateUserStatus = async (req, res, next) => {
    const { userId, role, isPremium } = req.body;
    if (!userId) return next(ApiError.badRequest('Benutzer-ID fehlt'));
    if (role !== undefined && !VALID_ROLES.includes(role)) {
        return next(ApiError.badRequest('Ungültige Rolle'));
    }

    try {
        if (role !== undefined) {
            await db.query('UPDATE m2em_users SET role = ? WHERE id = ?', [role, userId]);
        }
        if (isPremium !== undefined) {
            await db.query('UPDATE m2em_users SET is_premium = ? WHERE id = ?', [isPremium ? 1 : 0, userId]);
        }
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};

/**
 * Get global system settings.
 */
const getSystemSettings = async (req, res, next) => {
    try {
        const [rows] = await db.query('SELECT key, value FROM system_settings');
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        res.json(settings);
    } catch (err) {
        next(ApiError.internal('Fehler beim Laden der Systemeinstellungen', err.message));
    }
};

/**
 * Update global system settings.
 */
const updateSystemSettings = async (req, res, next) => {
    const settings = req.body; // { key: value, ... }
    try {
        for (const [key, value] of Object.entries(settings)) {
            await db.query(`
                INSERT INTO system_settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
            `, [key, String(value)]);
        }
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};

/**
 * Get item database (Admin Item-Manager).
 */
const getItems = async (req, res, next) => {
    try {
        const dbPath = path.join(__dirname, '../../../data/item_db.json');
        try {
            await fs.access(dbPath);
            return res.sendFile(dbPath);
        } catch (e) {
            res.json({});
        }
    } catch (err) {
        next(err);
    }
};

/**
 * Get system changelogs.
 */
const getChangelogs = async (req, res, next) => {
    try {
        const logPath = path.join(__dirname, '../../data/changelogs.json');
        try {
            await fs.access(logPath);
            return res.sendFile(logPath);
        } catch (e) {
            res.json([]);
        }
    } catch (err) {
        next(err);
    }
};

module.exports = { getModuleConfigs, updateModuleConfig, getAllUsers, updateUserStatus, getSystemSettings, updateSystemSettings, getItems, getChangelogs };

