const db = require('../config/database');

/**
 * Records an admin-relevant action. Failures are logged but never thrown -
 * an audit-log write must never be the reason a real action (e.g. deleting
 * a user) fails.
 */
async function logAudit(req, action, targetType = null, targetId = null, detail = null) {
    try {
        await db.query(
            'INSERT INTO audit_log (actor_id, actor_username, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?, ?)',
            [
                req.user?.id ?? null,
                req.user?.username ?? null,
                action,
                targetType,
                targetId != null ? String(targetId) : null,
                detail != null ? String(detail) : null
            ]
        );
    } catch (err) {
        console.error('[AuditLog] Failed to write entry:', err.message);
    }
}

module.exports = { logAudit };
