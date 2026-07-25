const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const ApiError = require('../../utils/apiError');

let JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    // No hardcoded fallback secret (a secret visible in the source code is not a secret).
    // Generate a random one for this process instead - tokens will simply become
    // invalid on every restart until JWT_SECRET is set in .env.
    JWT_SECRET = crypto.randomBytes(48).toString('hex');
    console.warn('\x1b[33m%s\x1b[0m', '[Auth] WARNUNG: Kein JWT_SECRET in .env gesetzt.');
    console.warn('\x1b[33m%s\x1b[0m', '[Auth]   Es wurde ein zufälliges Secret nur für diesen Prozess generiert.');
    console.warn('\x1b[33m%s\x1b[0m', '[Auth]   Alle Logins werden bei jedem Server-Neustart ungültig. Bitte JWT_SECRET in .env setzen.');
}

/**
 * Require authenticated user.
 */
function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return next(ApiError.unauthorized('Anmeldung erforderlich'));
    }

    const token = header.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        next(ApiError.unauthorized('Sitzung abgelaufen oder ungültig'));
    }
}

/**
 * Optional auth – sets req.user if valid token present, but doesn't block.
 */
function optionalAuth(req, res, next) {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
        const token = header.split(' ')[1];
        try {
            req.user = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            req.user = null;
        }
    } else {
        req.user = null;
    }
    next();
}

/**
 * Role-based access control with hierarchy.
 */
function requireRole(role) {
    const hierarchy = { admin: 3, editor: 2, viewer: 1 };
    return (req, res, next) => {
        if (!req.user) {
            return next(ApiError.unauthorized());
        }
        const userLevel = hierarchy[req.user.role] || 0;
        const requiredLevel = hierarchy[role] || 0;
        if (userLevel < requiredLevel) {
            return next(ApiError.forbidden('Zutritt verweigert: Unzureichende Berechtigungen'));
        }
        next();
    };
}

/**
 * Dynamic module access control.
 */
function requireModuleAccess(moduleId) {
    const db = require('../../config/database');
    return async (req, res, next) => {
        try {
            // 1. Get module configuration
            const [configs] = await db.query('SELECT access_level FROM modules_config WHERE id = ?', [moduleId]);
            const access = configs[0]?.access_level || 'user';

            if (access === 'public') return next();

            // 2. Not public? Check Authentication
            const header = req.headers.authorization;
            if (!header || !header.startsWith('Bearer ')) {
                return next(ApiError.unauthorized('Dieses Modul erfordert eine Anmeldung'));
            }

            const token = header.split(' ')[1];
            let decoded;
            try {
                decoded = jwt.verify(token, JWT_SECRET);
            } catch (e) {
                return next(ApiError.unauthorized('Sitzung ungültig'));
            }
            req.user = decoded;

            // 3. Admin bypass
            if (req.user.role === 'admin') return next();

            // 4. Access level check
            if (access === 'user') return next();

            if (access === 'premium') {
                const [u] = await db.query('SELECT is_premium FROM m2em_users WHERE id = ?', [req.user.id]);
                if (u && u[0] && u[0].is_premium) return next();
                return next(ApiError.forbidden('Premium-Mitgliedschaft erforderlich für dieses Modul'));
            }

            if (access === 'admin') {
                if (req.user.role !== 'admin') {
                    return next(ApiError.forbidden('Dieses Modul ist nur für Administratoren reserviert'));
                }
                return next();
            }

            next();
        } catch (err) {
            console.error('[Middleware] Module access error:', err);
            next(ApiError.internal('Fehler bei der Modul-Zugriffsprüfung'));
        }
    };
}

module.exports = { requireAuth, optionalAuth, requireRole, requireModuleAccess, JWT_SECRET };

