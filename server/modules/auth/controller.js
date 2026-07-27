const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const db = require('../../config/database');
const { JWT_SECRET } = require('./middleware');
const { sendVerificationEmail, sendPasswordResetEmail } = require('./mailer');
const { isDisposableEmail } = require('./disposable-emails');
const { stripHTML } = require('../../utils/sanitizer');
const storageService = require('../../services/storageService');
const { closeWorkspaceDb } = require('../../utils/workspace');
const runtimeConfig = require('../../config/runtimeConfig');
const { logAudit } = require('../../utils/auditLog');

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = '24h';

function verifyTotp(code, secret) {
    return speakeasy.totp.verify({ secret, encoding: 'base32', token: String(code), window: 1 });
}

// Per-account login lockout, on top of the IP-based authLimiter in
// server.js - that one alone doesn't stop a distributed attack targeting
// one specific username from many IPs. In-memory only (like setup's
// setupInProgress guard) - resets on restart, acceptable trade-off for
// this app's scale.
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const failedLoginAttempts = new Map(); // username.toLowerCase() -> { count, lockedUntil }

function loginAttemptKey(username) {
    return String(username).toLowerCase();
}

function isLockedOut(key) {
    const entry = failedLoginAttempts.get(key);
    return entry?.lockedUntil && entry.lockedUntil > Date.now();
}

function registerFailedLogin(key) {
    const entry = failedLoginAttempts.get(key) || { count: 0 };
    entry.count += 1;
    if (entry.count >= MAX_FAILED_LOGIN_ATTEMPTS) {
        entry.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
    }
    failedLoginAttempts.set(key, entry);
}

function clearFailedLogin(key) {
    failedLoginAttempts.delete(key);
}

/**
 * Auth Module Initialization
 */
async function initAuth() {
    // Seed default admin if no users exist
    try {
        const [rows] = await db.query('SELECT COUNT(*) as count FROM m2em_users');
        const count = rows[0]?.count ?? rows[0]?.['COUNT(*)'] ?? 0;
        if (count === 0) {
            const initialPassword = crypto.randomBytes(12).toString('base64url');
            const hash = await bcrypt.hash(initialPassword, SALT_ROUNDS);
            await db.query(
                'INSERT INTO m2em_users (username, email, password_hash, role, email_verified) VALUES (?, ?, ?, ?, ?)',
                ['admin', 'admin@localhost', hash, 'admin', 1]
            );
            console.log('\x1b[33m%s\x1b[0m', '[Auth] Kein Benutzer vorhanden – Admin-Konto wurde angelegt:');
            console.log('\x1b[33m%s\x1b[0m', `[Auth]   Benutzername: admin`);
            console.log('\x1b[33m%s\x1b[0m', `[Auth]   Initial-Passwort: ${initialPassword}`);
            console.log('\x1b[33m%s\x1b[0m', '[Auth]   Bitte sofort nach dem ersten Login unter "Account" ändern. Dieses Passwort wird nicht erneut angezeigt.');
        }
    } catch (err) {
        console.error('[Auth] Initial seed check failed:', err.message);
    }
}

// Skipped while the in-app setup wizard (server/modules/setup/) still owns
// admin-account creation - only relevant for the "power user" path where
// JWT_SECRET/CREDENTIALS_ENCRYPTION_KEY are set directly via real env vars
// (e.g. Coolify's own env var UI) and the wizard is bypassed entirely, in
// which case this behaves exactly as before this module existed.
if (!runtimeConfig.needsSetup()) {
    initAuth();
}

function buildLoginResponse(user) {
    const storageLimit = user.is_premium ? 50 * 1024 * 1024 : 20 * 1024 * 1024;
    const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role, tv: user.token_version || 0 },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
    );
    return {
        success: true,
        token,
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            isPremium: !!user.is_premium,
            storageLimit,
            displayName: user.display_name || user.username,
            avatarUrl: user.avatar_url
        }
    };
}

// ── Login ────────────────────────────────────────────
const login = async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Username und Passwort erforderlich' });
    }
    if (!db) {
        return res.status(500).json({ success: false, error: 'Datenbank nicht verfügbar' });
    }

    const attemptKey = loginAttemptKey(username);
    if (isLockedOut(attemptKey)) {
        return res.status(429).json({ success: false, error: 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.' });
    }

    try {
        // Allow login by username OR email
        const [rows] = await db.query(
            `SELECT id, username, email, password_hash, role, is_premium, email_verified, display_name,
                    avatar_url, token_version, totp_enabled
             FROM m2em_users WHERE username = ? OR email = ?`,
            [username, username]
        );

        if (rows.length === 0) {
            registerFailedLogin(attemptKey);
            return res.status(401).json({ success: false, error: 'Ungültige Anmeldedaten' });
        }

        const user = rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            registerFailedLogin(attemptKey);
            return res.status(401).json({ success: false, error: 'Ungültige Anmeldedaten' });
        }
        clearFailedLogin(attemptKey);

        // Check email verification (skip for admin)
        if (!user.email_verified && user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'E-Mail noch nicht verifiziert. Bitte prüfe dein Postfach.', needsVerification: true });
        }

        // 2FA enabled: password alone isn't a finished login - hand back a
        // short-lived pending token instead of a real session; the client
        // exchanges it for one via /2fa/login once the code checks out.
        if (user.totp_enabled) {
            const pendingToken = jwt.sign({ id: user.id, purpose: '2fa_pending' }, JWT_SECRET, { expiresIn: '5m' });
            return res.json({ success: true, requires2FA: true, pendingToken });
        }

        res.json(buildLoginResponse(user));
    } catch (err) {
        console.error('[Auth] Login error:', err);
        res.status(500).json({ success: false, error: 'Server-Fehler' });
    }
};

// ── 2FA: complete login after password + TOTP/recovery code ─────────
const verify2FALogin = async (req, res) => {
    const { pendingToken, code } = req.body;
    if (!pendingToken || !code) {
        return res.status(400).json({ success: false, error: 'Code erforderlich' });
    }

    let decoded;
    try {
        decoded = jwt.verify(pendingToken, JWT_SECRET);
        if (decoded.purpose !== '2fa_pending') throw new Error('wrong purpose');
    } catch (err) {
        return res.status(401).json({ success: false, error: 'Sitzung abgelaufen. Bitte erneut anmelden.' });
    }

    try {
        const [rows] = await db.query(
            `SELECT id, username, email, role, is_premium, display_name, avatar_url, token_version,
                    totp_secret, totp_recovery_codes
             FROM m2em_users WHERE id = ?`,
            [decoded.id]
        );
        if (rows.length === 0) return res.status(401).json({ success: false, error: 'Benutzer nicht gefunden' });
        const user = rows[0];

        let valid = !!user.totp_secret && verifyTotp(code, user.totp_secret);

        // Fall back to a one-time recovery code if the TOTP code didn't match.
        if (!valid && user.totp_recovery_codes) {
            const codes = JSON.parse(user.totp_recovery_codes);
            for (let i = 0; i < codes.length; i++) {
                if (await bcrypt.compare(String(code), codes[i])) {
                    valid = true;
                    codes.splice(i, 1);
                    await db.query('UPDATE m2em_users SET totp_recovery_codes = ? WHERE id = ?', [JSON.stringify(codes), user.id]);
                    break;
                }
            }
        }

        if (!valid) {
            return res.status(401).json({ success: false, error: 'Ungültiger Code' });
        }

        res.json(buildLoginResponse(user));
    } catch (err) {
        console.error('[Auth] 2FA login error:', err);
        res.status(500).json({ success: false, error: 'Server-Fehler' });
    }
};

// ── 2FA: setup / confirm / disable (own account) ─────────────────────
const get2FAStatus = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT totp_enabled FROM m2em_users WHERE id = ?', [req.user.id]);
        res.json({ enabled: !!rows[0]?.totp_enabled });
    } catch (err) {
        res.status(500).json({ error: 'Server-Fehler' });
    }
};

const setup2FA = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT username FROM m2em_users WHERE id = ?', [req.user.id]);
        if (rows.length === 0) return res.status(404).json({ success: false, error: 'User nicht gefunden' });

        const secret = speakeasy.generateSecret({ length: 20 }).base32;
        const otpauthUrl = speakeasy.otpauthURL({ secret, label: rows[0].username, issuer: 'M2-Tools', encoding: 'base32' });
        const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

        // Deliberately not persisted yet - only /2fa/verify-setup writes it,
        // and only once the user has proven their authenticator app has it.
        res.json({ success: true, secret, qrCodeDataUrl });
    } catch (err) {
        console.error('[Auth] 2FA setup error:', err);
        res.status(500).json({ success: false, error: 'Server-Fehler' });
    }
};

const RECOVERY_CODE_COUNT = 8;
function generateRecoveryCodes() {
    const codes = [];
    for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
        const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
        codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
    }
    return codes;
}

const verify2FASetup = async (req, res) => {
    const { secret, code } = req.body;
    if (!secret || !code) return res.status(400).json({ success: false, error: 'Secret und Code erforderlich' });

    try {
        if (!verifyTotp(code, secret)) {
            return res.status(400).json({ success: false, error: 'Ungültiger Code' });
        }

        const recoveryCodes = generateRecoveryCodes();
        const hashedCodes = await Promise.all(recoveryCodes.map(c => bcrypt.hash(c, SALT_ROUNDS)));

        await db.query(
            'UPDATE m2em_users SET totp_secret = ?, totp_enabled = 1, totp_recovery_codes = ? WHERE id = ?',
            [secret, JSON.stringify(hashedCodes), req.user.id]
        );

        // Shown to the user exactly once - never retrievable again afterwards.
        res.json({ success: true, recoveryCodes });
    } catch (err) {
        console.error('[Auth] 2FA verify-setup error:', err);
        res.status(500).json({ success: false, error: 'Server-Fehler' });
    }
};

const disable2FA = async (req, res) => {
    const { password, code } = req.body;
    if (!password || !code) return res.status(400).json({ success: false, error: 'Passwort und Code erforderlich' });

    try {
        const [rows] = await db.query('SELECT password_hash, totp_secret FROM m2em_users WHERE id = ?', [req.user.id]);
        if (rows.length === 0) return res.status(404).json({ success: false, error: 'User nicht gefunden' });

        const validPassword = await bcrypt.compare(password, rows[0].password_hash);
        if (!validPassword) return res.status(401).json({ success: false, error: 'Passwort ist falsch' });

        const validCode = !!rows[0].totp_secret && verifyTotp(code, rows[0].totp_secret);
        if (!validCode) return res.status(401).json({ success: false, error: 'Ungültiger Code' });

        await db.query('UPDATE m2em_users SET totp_secret = NULL, totp_enabled = 0, totp_recovery_codes = NULL WHERE id = ?', [req.user.id]);
        res.json({ success: true, message: '2FA deaktiviert' });
    } catch (err) {
        console.error('[Auth] 2FA disable error:', err);
        res.status(500).json({ success: false, error: 'Server-Fehler' });
    }
};

// ── Password reset (forgot / reset) ──────────────────────────────────
const forgotPassword = async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'E-Mail erforderlich' });

    try {
        const [rows] = await db.query('SELECT id, username FROM m2em_users WHERE email = ?', [email]);

        // Always the same response, whether or not the address exists -
        // avoids leaking which emails have an account.
        if (rows.length > 0) {
            const resetToken = crypto.randomBytes(32).toString('hex');
            const resetExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h

            await db.query('UPDATE m2em_users SET reset_token = ?, reset_expires = ? WHERE id = ?', [resetToken, resetExpires, rows[0].id]);

            const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
            const smtpConfigured = process.env.SMTP_HOST && process.env.SMTP_USER;
            if (smtpConfigured) {
                await sendPasswordResetEmail(email, rows[0].username, resetToken, baseUrl);
            } else {
                console.log(`[Auth] SMTP nicht konfiguriert - Reset-Link für ${email}: ${baseUrl}/reset-password.html?token=${resetToken}`);
            }
        }

        res.json({ success: true, message: 'Falls die E-Mail existiert, wurde ein Link zum Zurücksetzen gesendet.' });
    } catch (err) {
        console.error('[Auth] Forgot-password error:', err);
        res.status(500).json({ success: false, error: 'Server-Fehler' });
    }
};

const resetPassword = async (req, res) => {
    const { token, password, passwordConfirm } = req.body;
    if (!token || !password) return res.status(400).json({ success: false, error: 'Token und Passwort erforderlich' });
    if (password.length < 6) return res.status(400).json({ success: false, error: 'Passwort muss mindestens 6 Zeichen lang sein' });
    if (password !== passwordConfirm) return res.status(400).json({ success: false, error: 'Passwörter stimmen nicht überein' });

    try {
        const [rows] = await db.query('SELECT id, reset_expires FROM m2em_users WHERE reset_token = ?', [token]);
        if (rows.length === 0) return res.status(400).json({ success: false, error: 'Ungültiger oder bereits verwendeter Token' });

        const user = rows[0];
        if (new Date(user.reset_expires) < new Date()) {
            return res.status(400).json({ success: false, error: 'Token abgelaufen. Bitte fordere einen neuen Link an.' });
        }

        const hash = await bcrypt.hash(password, SALT_ROUNDS);
        // Bumping token_version invalidates every session issued before this
        // reset - if the old password leaked, those sessions die with it.
        await db.query(
            'UPDATE m2em_users SET password_hash = ?, reset_token = NULL, reset_expires = NULL, token_version = COALESCE(token_version, 0) + 1 WHERE id = ?',
            [hash, user.id]
        );

        res.json({ success: true, message: 'Passwort erfolgreich zurückgesetzt. Du kannst dich jetzt anmelden.' });
    } catch (err) {
        console.error('[Auth] Reset-password error:', err);
        res.status(500).json({ success: false, error: 'Server-Fehler' });
    }
};

// ── Force logout (admin only) ────────────────────────────────────────
const forceLogout = async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('UPDATE m2em_users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = ?', [id]);
        await logAudit(req, 'user.force_logout', 'user', id);
        res.json({ success: true, message: 'Sitzungen des Benutzers wurden beendet' });
    } catch (err) {
        console.error('[Auth] Force-logout error:', err);
        res.status(500).json({ success: false, error: 'Server-Fehler' });
    }
};

// ── Public Registration ──────────────────────────────
const registerPublic = async (req, res) => {
    const { username, email, password, passwordConfirm } = req.body;

    // Validate input
    if (!username || !email || !password) {
        return res.status(400).json({ success: false, error: 'Alle Felder sind erforderlich' });
    }
    if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'Passwort muss mindestens 6 Zeichen lang sein' });
    }
    if (password !== passwordConfirm) {
        return res.status(400).json({ success: false, error: 'Passwörter stimmen nicht überein' });
    }
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
        return res.status(400).json({ success: false, error: 'Username darf nur Buchstaben, Zahlen und Unterstriche enthalten (3-30 Zeichen)' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, error: 'Ungültige E-Mail-Adresse' });
    }

    // Check disposable/temp emails
    if (isDisposableEmail(email)) {
        return res.status(400).json({ success: false, error: 'Wegwerf-E-Mail-Adressen (10min-Mails) sind nicht erlaubt' });
    }

    try {
        // Check if username or email already exists
        const [existing] = await db.query(
            'SELECT id FROM m2em_users WHERE username = ? OR email = ?',
            [username, email]
        );
        if (existing.length > 0) {
            return res.status(409).json({ success: false, error: 'Benutzername oder E-Mail existiert bereits' });
        }

        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h

        const hash = await bcrypt.hash(password, SALT_ROUNDS);
        await db.query(
            `INSERT INTO m2em_users (username, email, password_hash, role, email_verified, verification_token, verification_expires) 
             VALUES (?, ?, ?, 'viewer', 0, ?, ?)`,
            [username, email, hash, verificationToken, verificationExpires]
        );

        // Send verification email
        const smtpConfigured = process.env.SMTP_HOST && process.env.SMTP_USER;
        if (smtpConfigured) {
            const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
            await sendVerificationEmail(email, username, verificationToken, baseUrl);
            res.json({ success: true, message: 'Registrierung erfolgreich! Bitte prüfe dein Postfach und bestätige deine E-Mail.' });
        } else {
            // If SMTP not configured, auto-verify (dev mode)
            await db.query('UPDATE m2em_users SET email_verified = 1 WHERE username = ?', [username]);
            console.log(`[Auth] SMTP not configured – auto-verified user: ${username}`);
            res.json({ success: true, message: 'Registrierung erfolgreich! Du kannst dich jetzt anmelden.', autoVerified: true });
        }
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, error: 'Benutzername oder E-Mail existiert bereits' });
        }
        console.error('[Auth] Register error:', err);
        res.status(500).json({ success: false, error: 'Server-Fehler bei der Registrierung' });
    }
};

// ── Verify Email ─────────────────────────────────────
const verifyEmail = async (req, res) => {
    const { token } = req.query;
    if (!token) {
        return res.status(400).json({ success: false, error: 'Verifikations-Token fehlt' });
    }

    try {
        const [rows] = await db.query(
            'SELECT id, username, verification_expires FROM m2em_users WHERE verification_token = ? AND email_verified = 0',
            [token]
        );

        if (rows.length === 0) {
            return res.status(400).json({ success: false, error: 'Ungültiger oder bereits verwendeter Token' });
        }

        const user = rows[0];
        if (new Date(user.verification_expires) < new Date()) {
            return res.status(400).json({ success: false, error: 'Verifikations-Token abgelaufen. Bitte registriere dich erneut.' });
        }

        await db.query(
            'UPDATE m2em_users SET email_verified = 1, verification_token = NULL, verification_expires = NULL WHERE id = ?',
            [user.id]
        );

        // Redirect to login with success message
        res.redirect('/login.html?verified=true');
    } catch (err) {
        console.error('[Auth] Verify error:', err);
        res.status(500).json({ success: false, error: 'Server-Fehler' });
    }
};

// ── Resend Verification ──────────────────────────────
const resendVerification = async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'E-Mail erforderlich' });

    try {
        const [rows] = await db.query(
            'SELECT id, username, email_verified FROM m2em_users WHERE email = ?',
            [email]
        );

        if (rows.length === 0) {
            return res.json({ success: true, message: 'Falls die E-Mail existiert, wurde eine neue Verifikation gesendet.' });
        }

        if (rows[0].email_verified) {
            return res.json({ success: true, message: 'E-Mail bereits verifiziert. Du kannst dich anmelden.' });
        }

        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        await db.query(
            'UPDATE m2em_users SET verification_token = ?, verification_expires = ? WHERE id = ?',
            [verificationToken, verificationExpires, rows[0].id]
        );

        const smtpConfigured = process.env.SMTP_HOST && process.env.SMTP_USER;
        if (smtpConfigured) {
            const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
            await sendVerificationEmail(email, rows[0].username, verificationToken, baseUrl);
        }

        res.json({ success: true, message: 'Neue Verifikations-E-Mail gesendet.' });
    } catch (err) {
        console.error('[Auth] Resend error:', err);
        res.status(500).json({ success: false, error: 'Server-Fehler' });
    }
};

// ── Get current user ─────────────────────────────────
const getMe = async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, username, email, role, display_name, avatar_url, email_verified, created_at FROM m2em_users WHERE id = ?',
            [req.user.id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'User nicht gefunden' });
        const u = rows[0];
        const storageLimit = u.is_premium ? 50 * 1024 * 1024 : 20 * 1024 * 1024;
        
        res.json({
            user: {
                id: u.id, username: u.username, email: u.email, role: u.role,
                isPremium: !!u.is_premium, storageLimit,
                displayName: u.display_name || u.username, avatarUrl: u.avatar_url,
                emailVerified: !!u.email_verified, createdAt: u.created_at
            }
        });
    } catch (err) {
        res.json({ user: req.user });
    }
};

// ── Update own account ───────────────────────────────
const updateAccount = async (req, res) => {
    const userId = req.user.id;
    const { displayName, email, currentPassword, newPassword } = req.body;

    try {
        // If changing password, verify current password first
        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({ success: false, error: 'Aktuelles Passwort erforderlich' });
            }
            if (newPassword.length < 6) {
                return res.status(400).json({ success: false, error: 'Neues Passwort muss mind. 6 Zeichen haben' });
            }

            const [rows] = await db.query('SELECT password_hash FROM m2em_users WHERE id = ?', [userId]);
            if (rows.length === 0) return res.status(404).json({ success: false, error: 'User nicht gefunden' });

            const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
            if (!valid) {
                return res.status(401).json({ success: false, error: 'Aktuelles Passwort ist falsch' });
            }

            const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
            // Bumps token_version too - a changed password should invalidate
            // every other session immediately, not just this one going forward.
            await db.query(
                'UPDATE m2em_users SET password_hash = ?, token_version = COALESCE(token_version, 0) + 1 WHERE id = ?',
                [hash, userId]
            );
        }

        // Update display name
        if (displayName !== undefined) {
            const cleanDisplayName = stripHTML(String(displayName)).trim().slice(0, 50);
            await db.query('UPDATE m2em_users SET display_name = ? WHERE id = ?', [cleanDisplayName, userId]);
        }

        // Update email (requires re-verification)
        if (email) {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return res.status(400).json({ success: false, error: 'Ungültige E-Mail' });
            }
            if (isDisposableEmail(email)) {
                return res.status(400).json({ success: false, error: 'Wegwerf-E-Mail-Adressen sind nicht erlaubt' });
            }

            const [existing] = await db.query('SELECT id FROM m2em_users WHERE email = ? AND id != ?', [email, userId]);
            if (existing.length > 0) {
                return res.status(409).json({ success: false, error: 'E-Mail wird bereits verwendet' });
            }

            const verificationToken = crypto.randomBytes(32).toString('hex');
            const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

            await db.query(
                'UPDATE m2em_users SET email = ?, email_verified = 0, verification_token = ?, verification_expires = ? WHERE id = ?',
                [email, verificationToken, verificationExpires, userId]
            );

            const smtpConfigured = process.env.SMTP_HOST && process.env.SMTP_USER;
            if (smtpConfigured) {
                const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
                await sendVerificationEmail(email, req.user.username, verificationToken, baseUrl);
            } else {
                await db.query('UPDATE m2em_users SET email_verified = 1 WHERE id = ?', [userId]);
            }
        }

        res.json({ success: true, message: 'Account aktualisiert' });
    } catch (err) {
        console.error('[Auth] Update account error:', err);
        res.status(500).json({ success: false, error: 'Server-Fehler' });
    }
};

// ── Admin: Register user (admin only) ────────────────
const register = async (req, res) => {
    const { username, password, role, email } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Username und Passwort erforderlich' });
    }

    const validRoles = ['admin', 'editor', 'viewer'];
    const userRole = validRoles.includes(role) ? role : 'viewer';

    try {
        const hash = await bcrypt.hash(password, SALT_ROUNDS);
        await db.query(
            'INSERT INTO m2em_users (username, email, password_hash, role, email_verified) VALUES (?, ?, ?, ?, 1)',
            [username, email || null, hash, userRole]
        );
        res.json({ success: true });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, error: 'Benutzername existiert bereits' });
        }
        console.error('[Auth] Register error:', err);
        res.status(500).json({ success: false, error: 'Server-Fehler' });
    }
};

// ── List users (admin only) ──────────────────────────
const listUsers = async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, username, email, role, email_verified, created_at FROM m2em_users ORDER BY created_at DESC'
        );
        res.json(rows);
    } catch (err) {
        console.error('[Auth] List users error:', err);
        res.status(500).json({ error: 'Server-Fehler' });
    }
};

// ── Update user (admin only) ─────────────────────────
const updateUser = async (req, res) => {
    const { id } = req.params;
    const { role, password } = req.body;

    try {
        if (password) {
            const hash = await bcrypt.hash(password, SALT_ROUNDS);
            await db.query(
                'UPDATE m2em_users SET password_hash = ?, token_version = COALESCE(token_version, 0) + 1 WHERE id = ?',
                [hash, id]
            );
            await logAudit(req, 'user.password_reset', 'user', id);
        }
        if (role) {
            const validRoles = ['admin', 'editor', 'viewer'];
            if (!validRoles.includes(role)) {
                return res.status(400).json({ success: false, error: 'Ungültige Rolle' });
            }
            await db.query('UPDATE m2em_users SET role = ? WHERE id = ?', [role, id]);
            await logAudit(req, 'user.role_updated', 'user', id, `role=${role}`);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('[Auth] Update error:', err);
        res.status(500).json({ success: false, error: 'Server-Fehler' });
    }
};

// ── Delete user (admin only) ─────────────────────────
const deleteUser = async (req, res) => {
    const { id } = req.params;
    if (parseInt(id) === req.user.id) {
        return res.status(400).json({ success: false, error: 'Kann eigenen Account nicht löschen' });
    }
    try {
        // None of the tables below have an ON DELETE CASCADE foreign key
        // back to m2em_users (same gap as the workspace-deletion bug), so
        // without this cleanup a deleted user's workspaces, SSH/DB
        // credentials, and teams become permanently orphaned - unreachable
        // through the UI (the owner is gone) but still sitting in the DB
        // and, for workspace files, still on disk.
        const [ownedWorkspaces] = await db.query('SELECT id FROM workspaces WHERE userId = ?', [id]);
        for (const ws of ownedWorkspaces) {
            await db.query('DELETE FROM workspace_connections WHERE workspace_id = ?', [ws.id]);
            await db.query('DELETE FROM connection_audit_log WHERE workspace_id = ?', [ws.id]);
            closeWorkspaceDb(id, ws.id);
            try {
                await storageService.deleteWorkspaceData(id, ws.id);
            } catch (storageErr) {
                console.error(`[Auth] Storage cleanup failed for deleted user ${id}, workspace ${ws.id}:`, storageErr.message);
            }
        }
        if (ownedWorkspaces.length > 0) {
            await db.query('DELETE FROM workspaces WHERE userId = ?', [id]);
        }

        // Teams this user owns: drop memberships and unlink any workspace
        // (including other users' team-shared ones) before removing the team.
        const [ownedTeams] = await db.query('SELECT id FROM m2em_teams WHERE owner_id = ?', [id]);
        for (const team of ownedTeams) {
            await db.query('DELETE FROM m2em_team_members WHERE team_id = ?', [team.id]);
            await db.query('UPDATE workspaces SET team_id = NULL WHERE team_id = ?', [team.id]);
        }
        if (ownedTeams.length > 0) {
            await db.query('DELETE FROM m2em_teams WHERE owner_id = ?', [id]);
        }

        // Membership in teams owned by someone else.
        await db.query('DELETE FROM m2em_team_members WHERE user_id = ?', [id]);

        // Personal (no active workspace) item/mob proto entries.
        await db.query('DELETE FROM item_proto WHERE userId = ? AND workspace_id IS NULL', [id]);
        await db.query('DELETE FROM mob_proto WHERE userId = ? AND workspace_id IS NULL', [id]);

        await db.query('DELETE FROM m2em_users WHERE id = ?', [id]);
        await logAudit(req, 'user.deleted', 'user', id);
        res.json({ success: true });
    } catch (err) {
        console.error('[Auth] Delete error:', err);
        res.status(500).json({ success: false, error: 'Server-Fehler' });
    }
};

module.exports = {
    login, getMe, register, registerPublic, verifyEmail,
    resendVerification, updateAccount, listUsers, updateUser, deleteUser,
    verify2FALogin, get2FAStatus, setup2FA, verify2FASetup, disable2FA,
    forgotPassword, resetPassword, forceLogout
};
