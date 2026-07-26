const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../../config/database');
const runtimeConfig = require('../../config/runtimeConfig');
const { JWT_SECRET } = require('../auth/middleware');

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = '24h';

// Single-process in-memory guard against two near-simultaneous /init
// requests both passing the needsSetup() check before either has finished
// writing (there's no DB-level uniqueness that would otherwise catch this
// the way username collisions do).
let setupInProgress = false;

// ── Setup status (public) ────────────────────────────
const status = (req, res) => {
    res.json({ needsSetup: runtimeConfig.needsSetup() });
};

// ── One-time init: admin account + secrets (public, self-locking) ───
const init = async (req, res) => {
    if (!runtimeConfig.needsSetup()) {
        return res.status(403).json({ success: false, error: 'Einrichtung wurde bereits abgeschlossen.' });
    }
    if (setupInProgress) {
        return res.status(409).json({ success: false, error: 'Einrichtung läuft bereits.' });
    }
    setupInProgress = true;

    try {
        const { username, password, passwordConfirm, email, allowedOrigins, baseUrl, smtp } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Benutzername und Passwort sind erforderlich' });
        }
        if (password.length < 6) {
            return res.status(400).json({ success: false, error: 'Passwort muss mindestens 6 Zeichen lang sein' });
        }
        if (password !== passwordConfirm) {
            return res.status(400).json({ success: false, error: 'Passwörter stimmen nicht überein' });
        }
        if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
            return res.status(400).json({ success: false, error: 'Benutzername darf nur Buchstaben, Zahlen und Unterstriche enthalten (3-30 Zeichen)' });
        }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, error: 'Ungültige E-Mail-Adresse' });
        }

        const hash = await bcrypt.hash(password, SALT_ROUNDS);
        const [result] = await db.query(
            'INSERT INTO m2em_users (username, email, password_hash, role, email_verified) VALUES (?, ?, ?, ?, 1)',
            [username, email || null, hash, 'admin']
        );

        // Persist fresh secrets so they survive future restarts/redeploys.
        // CREDENTIALS_ENCRYPTION_KEY is read fresh from process.env on
        // every call (secretsCrypto.js has no caching), so it's live for
        // the rest of THIS request already. JWT_SECRET is cached in
        // auth/middleware.js's module scope at first require() (already
        // resolved to its own random fallback before this request ever
        // ran) - the token below is deliberately signed with that
        // already-loaded value, not the newly generated one, so every
        // login on this boot (including this one) stays consistent. The
        // freshly generated JWT_SECRET simply takes over starting with the
        // next natural restart - identical to how an unset JWT_SECRET
        // already behaves today, not a new failure mode.
        const configValues = {
            JWT_SECRET: crypto.randomBytes(48).toString('hex'),
            CREDENTIALS_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex')
        };
        if (allowedOrigins) configValues.ALLOWED_ORIGINS = allowedOrigins;
        if (baseUrl) configValues.BASE_URL = baseUrl;
        if (smtp?.host) {
            configValues.SMTP_HOST = smtp.host;
            if (smtp.port) configValues.SMTP_PORT = String(smtp.port);
            if (smtp.user) configValues.SMTP_USER = smtp.user;
            if (smtp.pass) configValues.SMTP_PASS = smtp.pass;
            if (smtp.fromName) configValues.SMTP_FROM_NAME = smtp.fromName;
            if (smtp.from) configValues.SMTP_FROM = smtp.from;
        }
        runtimeConfig.saveConfig(configValues);

        const token = jwt.sign(
            { id: result.insertId, username, role: 'admin' },
            JWT_SECRET,
            { expiresIn: TOKEN_EXPIRY }
        );

        res.json({
            success: true,
            token,
            user: {
                id: result.insertId,
                username,
                email: email || null,
                role: 'admin',
                isPremium: false,
                storageLimit: 20 * 1024 * 1024,
                displayName: username,
                avatarUrl: null
            }
        });
    } catch (err) {
        console.error('[Setup] init error:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, error: 'Benutzername existiert bereits' });
        }
        res.status(500).json({ success: false, error: 'Server-Fehler beim Einrichten' });
    } finally {
        setupInProgress = false;
    }
};

module.exports = { status, init };
