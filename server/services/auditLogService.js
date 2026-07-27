/**
 * M2-Tools – Audit trail for the "Server-Verbindung" feature.
 *
 * Scoped specifically to remote-connection actions (SSH/SFTP/live-DB) and
 * their workspace/success/error_message shape. The general-purpose admin
 * audit log (module/user/SMTP changes etc.) is server/utils/auditLog.js,
 * writing to the separate `audit_log` table.
 */
const db = require('../config/database');

async function logConnectionAction(workspaceId, userId, action, detail, success, errorMessage = null) {
    try {
        await db.query(
            'INSERT INTO connection_audit_log (workspace_id, userId, action, detail, success, error_message) VALUES (?, ?, ?, ?, ?, ?)',
            [workspaceId, userId, action, detail || null, success ? 1 : 0, errorMessage || null]
        );
    } catch (err) {
        console.error('[AuditLog] Failed to write connection_audit_log entry:', err.message);
    }
}

async function listRecent(workspaceId, limit = 20) {
    const [rows] = await db.query(
        'SELECT action, detail, success, error_message, created_at FROM connection_audit_log WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?',
        [workspaceId, limit]
    );
    return rows;
}

module.exports = { logConnectionAction, listRecent };
