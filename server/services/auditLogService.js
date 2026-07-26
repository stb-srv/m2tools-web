/**
 * M2-Tools – Audit trail for the "Server-Verbindung" feature.
 *
 * No general-purpose audit-log mechanism exists elsewhere in the app;
 * this is scoped specifically to remote-connection actions (SSH/SFTP/
 * live-DB), since that's the one feature where "who did what to which
 * external server, and did it succeed" needs to be reconstructable.
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
