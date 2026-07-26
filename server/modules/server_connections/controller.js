const path = require('path');
const db = require('../../config/database');
const ApiError = require('../../utils/apiError');
const secretsCrypto = require('../../utils/secretsCrypto');
const sshService = require('../../services/sshService');
const remoteDbService = require('../../services/remoteDbService');
const auditLogService = require('../../services/auditLogService');
const { getWorkspaceDbById } = require('../../utils/workspace');
const protoImportService = require('../../services/protoImportService');

/**
 * Same ownership/team-membership check as workspaces/controller.js's
 * assertWorkspaceAccess - duplicated rather than imported since that
 * module doesn't export it (the existing workspaces controller already
 * inlines this same JOIN in several of its own handlers instead of
 * sharing a single helper, so this follows the same convention).
 */
async function assertWorkspaceAccess(id, userId) {
    const [rows] = await db.query(
        `SELECT w.id FROM workspaces w
         LEFT JOIN m2em_team_members tm ON w.team_id = tm.team_id
         WHERE w.id = ? AND (w.userId = ? OR tm.user_id = ?)`,
        [id, userId, userId]
    );
    if (rows.length === 0) throw ApiError.forbidden('Kein Zugriff auf diesen Workspace');
}

async function getConnectionRow(workspaceId) {
    const [rows] = await db.query('SELECT * FROM workspace_connections WHERE workspace_id = ?', [workspaceId]);
    return rows[0] || null;
}

/**
 * Decrypts the secret fields of a stored connection row into a plain
 * config object ready to hand to sshService/remoteDbService. Only ever
 * called immediately before opening a connection - never logged, never
 * sent back to the frontend.
 */
function buildRuntimeConfig(row) {
    return {
        ssh_host: row.ssh_host,
        ssh_port: row.ssh_port || 22,
        ssh_username: row.ssh_username,
        ssh_auth_method: row.ssh_auth_method || 'password',
        ssh_secret: row.ssh_secret_encrypted ? secretsCrypto.decrypt(row.ssh_secret_encrypted) : null,
        ssh_passphrase: row.ssh_passphrase_encrypted ? secretsCrypto.decrypt(row.ssh_passphrase_encrypted) : null,
        remote_quest_path: row.remote_quest_path,
        remote_cube_path: row.remote_cube_path,
        cmd_restart_game: row.cmd_restart_game,
        cmd_restart_db: row.cmd_restart_db,
        cmd_status: row.cmd_status,
        db_host: row.db_host,
        db_port: row.db_port || 3306,
        db_user: row.db_user,
        db_name: row.db_name,
        db_password: row.db_password_encrypted ? secretsCrypto.decrypt(row.db_password_encrypted) : null
    };
}

function toApiShape(row) {
    if (!row) return null;
    return {
        workspace_id: row.workspace_id,
        ssh_host: row.ssh_host,
        ssh_port: row.ssh_port,
        ssh_username: row.ssh_username,
        ssh_auth_method: row.ssh_auth_method,
        hasSshSecret: !!row.ssh_secret_encrypted,
        hasSshPassphrase: !!row.ssh_passphrase_encrypted,
        remote_quest_path: row.remote_quest_path,
        remote_cube_path: row.remote_cube_path,
        cmd_restart_game: row.cmd_restart_game,
        cmd_restart_db: row.cmd_restart_db,
        cmd_status: row.cmd_status,
        db_host: row.db_host,
        db_port: row.db_port,
        db_user: row.db_user,
        db_name: row.db_name,
        hasDbPassword: !!row.db_password_encrypted,
        updated_at: row.updated_at
    };
}

async function checkTestCooldown(workspaceId) {
    const [settingRows] = await db.query('SELECT value FROM system_settings WHERE key = ?', ['connection_test_cooldown_seconds']);
    const cooldownSeconds = parseInt(settingRows[0]?.value || '30');

    const [rows] = await db.query(
        `SELECT created_at FROM connection_audit_log WHERE workspace_id = ? AND action = 'test_connection' ORDER BY created_at DESC LIMIT 1`,
        [workspaceId]
    );
    if (!rows.length) return;

    const raw = rows[0].created_at;
    const last = raw instanceof Date ? raw : new Date(String(raw).replace(' ', 'T') + 'Z');
    const elapsedSeconds = (Date.now() - last.getTime()) / 1000;
    if (elapsedSeconds < cooldownSeconds) {
        // 429, not 403: the frontend's authFetch treats any 401/403 as an
        // invalid session and force-logs-out - a rate-limit must not do that.
        throw new ApiError(429, `Bitte warte noch ${Math.ceil(cooldownSeconds - elapsedSeconds)}s vor dem nächsten Verbindungstest.`);
    }
}

// GET /:workspaceId
const get = async (req, res, next) => {
    const { workspaceId } = req.params;
    try {
        await assertWorkspaceAccess(workspaceId, req.user.id);
        const row = await getConnectionRow(workspaceId);
        res.json(toApiShape(row));
    } catch (err) {
        next(err);
    }
};

// PUT /:workspaceId
const upsert = async (req, res, next) => {
    const { workspaceId } = req.params;
    try {
        await assertWorkspaceAccess(workspaceId, req.user.id);
        const body = req.body || {};
        const existing = await getConnectionRow(workspaceId);

        // Empty secret fields mean "leave unchanged" - the frontend never
        // receives decrypted secrets back, so it can only ever send a new
        // value or nothing.
        const sshSecretEncrypted = body.ssh_secret ? secretsCrypto.encrypt(body.ssh_secret) : (existing?.ssh_secret_encrypted || null);
        const sshPassphraseEncrypted = body.ssh_passphrase ? secretsCrypto.encrypt(body.ssh_passphrase) : (existing?.ssh_passphrase_encrypted || null);
        const dbPasswordEncrypted = body.db_password ? secretsCrypto.encrypt(body.db_password) : (existing?.db_password_encrypted || null);

        const f = {
            ssh_host: body.ssh_host || null,
            ssh_port: parseInt(body.ssh_port) || 22,
            ssh_username: body.ssh_username || null,
            ssh_auth_method: body.ssh_auth_method === 'key' ? 'key' : 'password',
            ssh_secret_encrypted: sshSecretEncrypted,
            ssh_passphrase_encrypted: sshPassphraseEncrypted,
            remote_quest_path: body.remote_quest_path || null,
            remote_cube_path: body.remote_cube_path || null,
            cmd_restart_game: body.cmd_restart_game || null,
            cmd_restart_db: body.cmd_restart_db || null,
            cmd_status: body.cmd_status || null,
            db_host: body.db_host || null,
            db_port: parseInt(body.db_port) || 3306,
            db_user: body.db_user || null,
            db_name: body.db_name || null,
            db_password_encrypted: dbPasswordEncrypted
        };

        if (existing) {
            await db.query(
                `UPDATE workspace_connections SET
                    ssh_host=?, ssh_port=?, ssh_username=?, ssh_auth_method=?, ssh_secret_encrypted=?, ssh_passphrase_encrypted=?,
                    remote_quest_path=?, remote_cube_path=?, cmd_restart_game=?, cmd_restart_db=?, cmd_status=?,
                    db_host=?, db_port=?, db_user=?, db_name=?, db_password_encrypted=?, updated_at=CURRENT_TIMESTAMP
                 WHERE workspace_id=?`,
                [f.ssh_host, f.ssh_port, f.ssh_username, f.ssh_auth_method, f.ssh_secret_encrypted, f.ssh_passphrase_encrypted,
                    f.remote_quest_path, f.remote_cube_path, f.cmd_restart_game, f.cmd_restart_db, f.cmd_status,
                    f.db_host, f.db_port, f.db_user, f.db_name, f.db_password_encrypted, workspaceId]
            );
        } else {
            await db.query(
                `INSERT INTO workspace_connections
                    (workspace_id, ssh_host, ssh_port, ssh_username, ssh_auth_method, ssh_secret_encrypted, ssh_passphrase_encrypted,
                     remote_quest_path, remote_cube_path, cmd_restart_game, cmd_restart_db, cmd_status,
                     db_host, db_port, db_user, db_name, db_password_encrypted)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [workspaceId, f.ssh_host, f.ssh_port, f.ssh_username, f.ssh_auth_method, f.ssh_secret_encrypted, f.ssh_passphrase_encrypted,
                    f.remote_quest_path, f.remote_cube_path, f.cmd_restart_game, f.cmd_restart_db, f.cmd_status,
                    f.db_host, f.db_port, f.db_user, f.db_name, f.db_password_encrypted]
            );
        }

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};

// POST /:workspaceId/test
const testConnection = async (req, res, next) => {
    const { workspaceId } = req.params;
    try {
        await assertWorkspaceAccess(workspaceId, req.user.id);
        await checkTestCooldown(workspaceId);

        const row = await getConnectionRow(workspaceId);
        if (!row) throw ApiError.badRequest('Keine Verbindung konfiguriert');
        const config = buildRuntimeConfig(row);

        const result = { ssh: null, db: null };

        if (config.ssh_host) {
            try {
                await sshService.testConnection(config);
                result.ssh = { ok: true };
                await auditLogService.logConnectionAction(workspaceId, req.user.id, 'test_connection', 'ssh', true);
            } catch (err) {
                result.ssh = { ok: false, error: err.message };
                await auditLogService.logConnectionAction(workspaceId, req.user.id, 'test_connection', 'ssh', false, err.message);
            }
        }

        if (config.db_host) {
            try {
                await remoteDbService.testConnection(config);
                result.db = { ok: true };
                await auditLogService.logConnectionAction(workspaceId, req.user.id, 'test_connection', 'db', true);
            } catch (err) {
                result.db = { ok: false, error: err.message };
                await auditLogService.logConnectionAction(workspaceId, req.user.id, 'test_connection', 'db', false, err.message);
            }
        }

        res.json(result);
    } catch (err) {
        next(err);
    }
};

// POST /:workspaceId/deploy-quest  { filename, content }
const deployQuest = async (req, res, next) => {
    const { workspaceId } = req.params;
    const { filename, content } = req.body || {};
    if (!filename || typeof content !== 'string') return next(ApiError.badRequest('filename und content sind erforderlich'));

    try {
        await assertWorkspaceAccess(workspaceId, req.user.id);
        const row = await getConnectionRow(workspaceId);
        if (!row || !row.ssh_host) throw ApiError.badRequest('Keine SSH-Verbindung konfiguriert');
        if (!row.remote_quest_path) throw ApiError.badRequest('Kein Quest-Pfad konfiguriert');

        const config = buildRuntimeConfig(row);
        const safeFilename = path.basename(filename);
        const remotePath = row.remote_quest_path.replace(/\/?$/, '/') + safeFilename;

        try {
            await sshService.uploadFile(config, remotePath, content);
            await auditLogService.logConnectionAction(workspaceId, req.user.id, 'sftp_upload', remotePath, true);
        } catch (err) {
            await auditLogService.logConnectionAction(workspaceId, req.user.id, 'sftp_upload', remotePath, false, err.message);
            throw ApiError.internal('Deploy fehlgeschlagen: ' + err.message);
        }

        res.json({ success: true, remotePath });
    } catch (err) {
        next(err);
    }
};

// POST /:workspaceId/deploy-cube  { filename, content }
const deployCube = async (req, res, next) => {
    const { workspaceId } = req.params;
    const { filename, content } = req.body || {};
    if (!filename || typeof content !== 'string') return next(ApiError.badRequest('filename und content sind erforderlich'));

    try {
        await assertWorkspaceAccess(workspaceId, req.user.id);
        const row = await getConnectionRow(workspaceId);
        if (!row || !row.ssh_host) throw ApiError.badRequest('Keine SSH-Verbindung konfiguriert');
        if (!row.remote_cube_path) throw ApiError.badRequest('Kein Cube-Pfad konfiguriert');

        const config = buildRuntimeConfig(row);
        const safeFilename = path.basename(filename);
        const remotePath = row.remote_cube_path.replace(/\/?$/, '/') + safeFilename;

        try {
            await sshService.uploadFile(config, remotePath, content);
            await auditLogService.logConnectionAction(workspaceId, req.user.id, 'sftp_upload', remotePath, true);
        } catch (err) {
            await auditLogService.logConnectionAction(workspaceId, req.user.id, 'sftp_upload', remotePath, false, err.message);
            throw ApiError.internal('Deploy fehlgeschlagen: ' + err.message);
        }

        res.json({ success: true, remotePath });
    } catch (err) {
        next(err);
    }
};

// POST /:workspaceId/command  { key: 'restart_game'|'restart_db'|'status' }
const runCommand = async (req, res, next) => {
    const { workspaceId } = req.params;
    const { key } = req.body || {};
    if (!sshService.ALLOWED_COMMAND_KEYS.includes(key)) {
        return next(ApiError.badRequest(`Ungültiger Befehls-Key. Erlaubt: ${sshService.ALLOWED_COMMAND_KEYS.join(', ')}`));
    }

    try {
        await assertWorkspaceAccess(workspaceId, req.user.id);
        const row = await getConnectionRow(workspaceId);
        if (!row || !row.ssh_host) throw ApiError.badRequest('Keine SSH-Verbindung konfiguriert');

        const config = buildRuntimeConfig(row);
        try {
            const result = await sshService.runAllowlistedCommand(config, key);
            await auditLogService.logConnectionAction(workspaceId, req.user.id, 'ssh_command', key, true);
            res.json({ success: true, ...result });
        } catch (err) {
            await auditLogService.logConnectionAction(workspaceId, req.user.id, 'ssh_command', key, false, err.message);
            throw ApiError.internal('Kommando fehlgeschlagen: ' + err.message);
        }
    } catch (err) {
        next(err);
    }
};

// POST /:workspaceId/db/pull - fetch item_proto/mob_proto from the real remote DB into the workspace's local SQLite
const dbPull = async (req, res, next) => {
    const { workspaceId } = req.params;
    try {
        const userId = req.user.id;
        await assertWorkspaceAccess(workspaceId, userId);
        const row = await getConnectionRow(workspaceId);
        if (!row || !row.db_host) throw ApiError.badRequest('Keine Datenbank-Verbindung konfiguriert');

        const config = buildRuntimeConfig(row);
        const wsDb = await getWorkspaceDbById(userId, workspaceId);
        if (!wsDb) throw ApiError.internal('Workspace-Datenbank konnte nicht geladen werden');

        try {
            const [items, mobs] = await Promise.all([
                remoteDbService.pullItemProto(config),
                remoteDbService.pullMobProto(config)
            ]);
            const itemsWritten = protoImportService.writeItems(wsDb, items);
            const mobsWritten = protoImportService.writeMobs(wsDb, mobs);
            await auditLogService.logConnectionAction(workspaceId, userId, 'db_pull', `${itemsWritten} items, ${mobsWritten} mobs`, true);
            res.json({ success: true, itemsWritten, mobsWritten });
        } catch (err) {
            await auditLogService.logConnectionAction(workspaceId, userId, 'db_pull', null, false, err.message);
            throw ApiError.internal('Sync von Server fehlgeschlagen: ' + err.message);
        }
    } catch (err) {
        next(err);
    }
};

// POST /:workspaceId/db/push - write the workspace's local item_proto/mob_proto back to the real remote DB
const dbPush = async (req, res, next) => {
    const { workspaceId } = req.params;
    try {
        const userId = req.user.id;
        await assertWorkspaceAccess(workspaceId, userId);
        const row = await getConnectionRow(workspaceId);
        if (!row || !row.db_host) throw ApiError.badRequest('Keine Datenbank-Verbindung konfiguriert');

        const config = buildRuntimeConfig(row);
        const wsDb = await getWorkspaceDbById(userId, workspaceId);
        if (!wsDb) throw ApiError.internal('Workspace-Datenbank konnte nicht geladen werden');

        try {
            const items = wsDb.prepare('SELECT vnum, locale_name, type, subtype, flag FROM item_proto').all();
            const mobs = wsDb.prepare('SELECT vnum, locale_name, type, level FROM mob_proto').all();
            const itemsWritten = await remoteDbService.pushItemProto(config, items);
            const mobsWritten = await remoteDbService.pushMobProto(config, mobs);
            await auditLogService.logConnectionAction(workspaceId, userId, 'db_push', `${itemsWritten} items, ${mobsWritten} mobs`, true);
            res.json({ success: true, itemsWritten, mobsWritten });
        } catch (err) {
            await auditLogService.logConnectionAction(workspaceId, userId, 'db_push', null, false, err.message);
            throw ApiError.internal('Sync zu Server fehlgeschlagen: ' + err.message);
        }
    } catch (err) {
        next(err);
    }
};

// GET /:workspaceId/audit-log
const getAuditLog = async (req, res, next) => {
    const { workspaceId } = req.params;
    try {
        await assertWorkspaceAccess(workspaceId, req.user.id);
        const entries = await auditLogService.listRecent(workspaceId);
        res.json(entries);
    } catch (err) {
        next(err);
    }
};

module.exports = { get, upsert, testConnection, deployQuest, deployCube, runCommand, dbPull, dbPush, getAuditLog };
