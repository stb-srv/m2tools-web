const path = require('path');
const fs = require('fs').promises;
const { existsSync } = require('fs');
const db = require('../../config/database');
const ApiError = require('../../utils/apiError');
const { stripHTML } = require('../../utils/sanitizer');
const itemScanner = require('./item_scanner');
const runtimeConfig = require('../../config/runtimeConfig');
const mailer = require('../auth/mailer');
const { logAudit } = require('../../utils/auditLog');

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
        await logAudit(req, 'module.access_updated', 'module', id, `access_level=${access_level}, visible_guests=${!!is_visible_guests}`);
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
            await logAudit(req, 'user.role_updated', 'user', userId, `role=${role}`);
        }
        if (isPremium !== undefined) {
            await db.query('UPDATE m2em_users SET is_premium = ? WHERE id = ?', [isPremium ? 1 : 0, userId]);
            await logAudit(req, 'user.premium_updated', 'user', userId, `isPremium=${!!isPremium}`);
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
 * Get current SMTP configuration (Admin only). Password is never sent
 * back - only whether one is currently set - since these settings can
 * only be entered once at /setup.html otherwise and there was no way to
 * see or change them afterwards.
 */
const getSmtpSettings = async (req, res, next) => {
    try {
        res.json({
            host: runtimeConfig.getManagedValue('SMTP_HOST'),
            port: runtimeConfig.getManagedValue('SMTP_PORT'),
            user: runtimeConfig.getManagedValue('SMTP_USER'),
            hasPassword: !!runtimeConfig.getManagedValue('SMTP_PASS'),
            fromName: runtimeConfig.getManagedValue('SMTP_FROM_NAME'),
            from: runtimeConfig.getManagedValue('SMTP_FROM')
        });
    } catch (err) {
        next(ApiError.internal('Fehler beim Laden der SMTP-Einstellungen', err.message));
    }
};

/**
 * Update SMTP configuration (Admin only). `pass` is optional on update -
 * leaving it blank keeps the previously saved password instead of wiping it.
 */
const updateSmtpSettings = async (req, res, next) => {
    const { host, port, user, pass, fromName, from } = req.body;
    if (!host || !user) return next(ApiError.badRequest('SMTP-Host und Benutzer sind erforderlich'));

    try {
        const values = { SMTP_HOST: host, SMTP_USER: user };
        if (port) values.SMTP_PORT = String(port);
        if (pass) values.SMTP_PASS = pass;
        if (fromName) values.SMTP_FROM_NAME = fromName;
        if (from) values.SMTP_FROM = from;

        runtimeConfig.saveConfig(values);
        mailer.resetTransporter();
        await logAudit(req, 'smtp.updated', 'system', null, `host=${host}, user=${user}`);

        res.json({ success: true, message: 'SMTP-Einstellungen gespeichert' });
    } catch (err) {
        next(ApiError.internal('Fehler beim Speichern der SMTP-Einstellungen', err.message));
    }
};

/**
 * Public (no auth) subset of system_settings needed client-side before
 * login is even confirmed - currently just the idle-logout timeout, so
 * every session (not only admins) can enforce it locally.
 */
const getPublicSettings = async (req, res) => {
    try {
        const [rows] = await db.query("SELECT value FROM system_settings WHERE key = 'idle_timeout_minutes'");
        const idleTimeoutMinutes = rows[0] ? parseInt(rows[0].value, 10) : 60;
        res.json({ idleTimeoutMinutes: Number.isFinite(idleTimeoutMinutes) ? idleTimeoutMinutes : 60 });
    } catch (err) {
        res.json({ idleTimeoutMinutes: 60 });
    }
};

/**
 * Get recent admin audit-log entries (Admin only).
 */
const getAuditLog = async (req, res, next) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
        const [rows] = await db.query(
            'SELECT id, actor_id, actor_username, action, target_type, target_id, detail, created_at FROM audit_log ORDER BY id DESC LIMIT ?',
            [limit]
        );
        res.json(rows);
    } catch (err) {
        next(ApiError.internal('Fehler beim Laden des Audit-Logs', err.message));
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

module.exports = {
    getModuleConfigs, updateModuleConfig, getAllUsers, updateUserStatus,
    getSystemSettings, updateSystemSettings, getSmtpSettings, updateSmtpSettings,
    getPublicSettings, getAuditLog, getItems, getChangelogs
};

