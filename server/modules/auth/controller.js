const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../../config/database');
const { JWT_SECRET } = require('./middleware');
const { sendVerificationEmail } = require('./mailer');
const { isDisposableEmail } = require('./disposable-emails');
const { stripHTML } = require('../../utils/sanitizer');
const storageService = require('../../services/storageService');
const { closeWorkspaceDb } = require('../../utils/workspace');
const runtimeConfig = require('../../config/runtimeConfig');

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = '24h';

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

// ── Login ────────────────────────────────────────────
const login = async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Username und Passwort erforderlich' });
    }
    if (!db) {
        return res.status(500).json({ success: false, error: 'Datenbank nicht verfügbar' });
    }

    try {
        // Allow login by username OR email
        const [rows] = await db.query(
            'SELECT id, username, email, password_hash, role, email_verified, display_name, avatar_url FROM m2em_users WHERE username = ? OR email = ?',
            [username, username]
        );

        if (rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Ungültige Anmeldedaten' });
        }

        const user = rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ success: false, error: 'Ungültige Anmeldedaten' });
        }

        // Check email verification (skip for admin)
        if (!user.email_verified && user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'E-Mail noch nicht verifiziert. Bitte prüfe dein Postfach.', needsVerification: true });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: TOKEN_EXPIRY }
        );

        const storageLimit = user.is_premium ? 50 * 1024 * 1024 : 20 * 1024 * 1024;

        res.json({
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
        });
    } catch (err) {
        console.error('[Auth] Login error:', err);
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
            await db.query('UPDATE m2em_users SET password_hash = ? WHERE id = ?', [hash, userId]);
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
            await db.query('UPDATE m2em_users SET password_hash = ? WHERE id = ?', [hash, id]);
        }
        if (role) {
            const validRoles = ['admin', 'editor', 'viewer'];
            if (!validRoles.includes(role)) {
                return res.status(400).json({ success: false, error: 'Ungültige Rolle' });
            }
            await db.query('UPDATE m2em_users SET role = ? WHERE id = ?', [role, id]);
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
        res.json({ success: true });
    } catch (err) {
        console.error('[Auth] Delete error:', err);
        res.status(500).json({ success: false, error: 'Server-Fehler' });
    }
};

module.exports = {
    login, getMe, register, registerPublic, verifyEmail,
    resendVerification, updateAccount, listUsers, updateUser, deleteUser
};
