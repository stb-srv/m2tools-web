/**
 * M2-Tools – Live remote-MySQL service for the "Server-Verbindung" feature.
 *
 * Deliberately separate from server/config/database.js, which is the
 * single global singleton for M2-Tools' OWN application data (users,
 * workspaces, module configs). This module instead opens one short-lived
 * connection per call to a user's own remote game-server database - never
 * pooled, since usage is sporadic ("sync now" clicks), not high-frequency,
 * and a long-lived pool would mean holding open a connection authenticated
 * with one user's remote credentials for longer than a single action needs.
 *
 * Only exposes narrow, purpose-built functions for the two tables this
 * app already understands (item_proto/mob_proto, same shape as
 * server/services/protoImportService.js) - deliberately NOT a generic
 * "run arbitrary SQL" passthrough.
 */
const mysql = require('mysql2/promise');

const CONNECT_TIMEOUT_MS = 8000;

async function withConnection(config, fn) {
    const conn = await mysql.createConnection({
        host: config.db_host,
        port: config.db_port || 3306,
        user: config.db_user,
        password: config.db_password,
        database: config.db_name,
        connectTimeout: CONNECT_TIMEOUT_MS
    });
    try {
        return await fn(conn);
    } finally {
        await conn.end();
    }
}

async function pullItemProto(config) {
    return withConnection(config, async (conn) => {
        const [rows] = await conn.query('SELECT vnum, locale_name, type, subtype, flag FROM item_proto');
        return rows;
    });
}

async function pullMobProto(config) {
    return withConnection(config, async (conn) => {
        const [rows] = await conn.query('SELECT vnum, locale_name, type, level FROM mob_proto');
        return rows;
    });
}

async function pushItemProto(config, rows) {
    return withConnection(config, async (conn) => {
        let written = 0;
        for (const item of rows) {
            await conn.query(
                `INSERT INTO item_proto (vnum, locale_name, type, subtype, flag) VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE locale_name = VALUES(locale_name), type = VALUES(type), subtype = VALUES(subtype), flag = VALUES(flag)`,
                [item.vnum, item.locale_name || '', item.type || 0, item.subtype || 0, item.flag || 0]
            );
            written++;
        }
        return written;
    });
}

async function pushMobProto(config, rows) {
    return withConnection(config, async (conn) => {
        let written = 0;
        for (const mob of rows) {
            await conn.query(
                `INSERT INTO mob_proto (vnum, locale_name, type, level) VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE locale_name = VALUES(locale_name), type = VALUES(type), level = VALUES(level)`,
                [mob.vnum, mob.locale_name || '', mob.type || 0, mob.level || 0]
            );
            written++;
        }
        return written;
    });
}

async function testConnection(config) {
    return withConnection(config, async () => ({ ok: true }));
}

module.exports = { withConnection, pullItemProto, pullMobProto, pushItemProto, pushMobProto, testConnection };
