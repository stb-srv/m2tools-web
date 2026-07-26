/**
 * M2-Tools – SSH/SFTP service for the "Server-Verbindung" feature.
 *
 * Every connection is opened fresh per call and always closed in a
 * `finally`-equivalent - unlike the workspace SQLite handles in
 * server/utils/workspace.js, SSH sessions to a user's own remote server
 * are never cached/pooled across requests, since that would mean holding
 * an authenticated connection open using another user's credentials
 * longer than a single action needs it.
 *
 * Host-key verification (TOFU - Trust On First Use, the same model real
 * SSH clients use): the first successful `captureHostKeyFingerprint()`
 * call pins the remote host's key fingerprint (via the controller, which
 * persists it to workspace_connections.ssh_host_key_fingerprint). Every
 * subsequent connection in `withConnection()` requires that pinned
 * fingerprint to match exactly, closing the "any host key silently
 * accepted" MITM gap.
 */
const { Client } = require('ssh2');

const CONNECT_TIMEOUT_MS = 8000;
const COMMAND_TIMEOUT_MS = 15000;
const OUTPUT_TRUNCATE_LENGTH = 4000;
const HOST_HASH_ALGO = 'sha256';

const ALLOWED_COMMAND_KEYS = ['restart_game', 'restart_db', 'status'];
const COMMAND_FIELD_BY_KEY = {
    restart_game: 'cmd_restart_game',
    restart_db: 'cmd_restart_db',
    status: 'cmd_status'
};

function buildAuthConnectOpts(config) {
    const connectOpts = {
        host: config.ssh_host,
        port: config.ssh_port || 22,
        username: config.ssh_username,
        readyTimeout: CONNECT_TIMEOUT_MS
    };
    if (config.ssh_auth_method === 'key') {
        connectOpts.privateKey = config.ssh_secret;
        if (config.ssh_passphrase) connectOpts.passphrase = config.ssh_passphrase;
    } else {
        connectOpts.password = config.ssh_secret;
    }
    return connectOpts;
}

/**
 * Opens an SSH connection with strict host-key verification, runs
 * `fn(conn)`, and always closes the connection afterwards - regardless of
 * whether `fn` resolved or threw. Requires `config.ssh_host_key_fingerprint`
 * to already be pinned; if it isn't, rejects immediately without even
 * attempting a connection (the caller must run captureHostKeyFingerprint
 * first, which the controller's testConnection flow does automatically).
 */
function withConnection(config, fn) {
    if (!config.ssh_host_key_fingerprint) {
        return Promise.reject(new Error('Kein bekannter Host-Key hinterlegt - bitte zuerst die Verbindung testen.'));
    }

    return new Promise((resolve, reject) => {
        const conn = new Client();
        let settled = false;

        const finish = (err, result) => {
            if (settled) return;
            settled = true;
            conn.end();
            if (err) reject(err); else resolve(result);
        };

        conn.on('ready', () => {
            Promise.resolve()
                .then(() => fn(conn))
                .then((result) => finish(null, result))
                .catch((err) => finish(err));
        });
        conn.on('error', (err) => finish(err));

        conn.connect({
            ...buildAuthConnectOpts(config),
            hostHash: HOST_HASH_ALGO,
            hostVerifier: (key, verify) => verify(key === config.ssh_host_key_fingerprint)
        });
    });
}

/**
 * Connects once, accepting whatever host key the server presents, purely
 * to capture its fingerprint for pinning. The hostVerifier callback fires
 * during the handshake (before auth), so the fingerprint is captured even
 * if the subsequent auth step fails with the given credentials.
 */
function captureHostKeyFingerprint(config) {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        let fingerprint = null;
        let settled = false;

        const finish = (err) => {
            if (settled) return;
            settled = true;
            conn.end();
            if (fingerprint) resolve(fingerprint);
            else reject(err || new Error('Host-Key konnte nicht ermittelt werden'));
        };

        conn.on('ready', () => finish(null));
        conn.on('error', (err) => finish(err));

        conn.connect({
            ...buildAuthConnectOpts(config),
            hostHash: HOST_HASH_ALGO,
            hostVerifier: (key, verify) => {
                fingerprint = key;
                verify(true);
            }
        });
    });
}

/**
 * Writes `content` to `remotePath` via SFTP.
 */
function uploadFile(config, remotePath, content) {
    return withConnection(config, (conn) => new Promise((resolve, reject) => {
        conn.sftp((err, sftp) => {
            if (err) return reject(err);
            const writeStream = sftp.createWriteStream(remotePath);
            writeStream.on('error', reject);
            writeStream.on('close', () => resolve());
            writeStream.end(Buffer.from(content, 'utf8'));
        });
    }));
}

/**
 * Runs one of a fixed set of allowlisted actions. The *action type* is
 * fixed (only these three keys exist); the actual shell command run for
 * each is whatever the user configured on their connection, since every
 * Metin2 server-file distribution names its services/scripts differently.
 * This is deliberately NOT a generic "run any command" endpoint.
 */
function runAllowlistedCommand(config, key) {
    if (!ALLOWED_COMMAND_KEYS.includes(key)) {
        return Promise.reject(new Error(`Unbekannter Befehls-Key: ${key}`));
    }
    const command = config[COMMAND_FIELD_BY_KEY[key]];
    if (!command) {
        return Promise.reject(new Error(`Für "${key}" ist kein Kommando konfiguriert`));
    }

    return withConnection(config, (conn) => new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Kommando-Timeout (${COMMAND_TIMEOUT_MS / 1000}s) überschritten`)), COMMAND_TIMEOUT_MS);
        conn.exec(command, (err, stream) => {
            if (err) { clearTimeout(timeout); return reject(err); }
            let stdout = '';
            let stderr = '';
            stream.on('close', (code) => {
                clearTimeout(timeout);
                resolve({
                    code,
                    stdout: stdout.slice(0, OUTPUT_TRUNCATE_LENGTH),
                    stderr: stderr.slice(0, OUTPUT_TRUNCATE_LENGTH)
                });
            });
            stream.on('data', (data) => { stdout += data.toString(); });
            stream.stderr.on('data', (data) => { stderr += data.toString(); });
        });
    }));
}

/**
 * Pure connect+auth test, no command/file transfer.
 */
function testConnection(config) {
    return withConnection(config, () => ({ ok: true }));
}

module.exports = {
    withConnection,
    captureHostKeyFingerprint,
    uploadFile,
    runAllowlistedCommand,
    testConnection,
    ALLOWED_COMMAND_KEYS
};
