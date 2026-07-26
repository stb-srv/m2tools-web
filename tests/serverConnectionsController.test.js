jest.mock('../server/config/database', () => ({ query: jest.fn() }));
jest.mock('../server/services/sshService', () => ({
    testConnection: jest.fn(),
    captureHostKeyFingerprint: jest.fn(),
    uploadFile: jest.fn(),
    runAllowlistedCommand: jest.fn(),
    ALLOWED_COMMAND_KEYS: ['restart_game', 'restart_db', 'status']
}));
jest.mock('../server/services/remoteDbService', () => ({
    testConnection: jest.fn(),
    pullItemProto: jest.fn(),
    pullMobProto: jest.fn(),
    pushItemProto: jest.fn(),
    pushMobProto: jest.fn()
}));
jest.mock('../server/utils/secretsCrypto', () => ({
    encrypt: jest.fn((v) => `enc(${v})`),
    decrypt: jest.fn((v) => `dec(${v})`)
}));
jest.mock('../server/services/auditLogService', () => ({
    logConnectionAction: jest.fn(),
    listRecent: jest.fn()
}));
jest.mock('../server/utils/workspace', () => ({
    getWorkspaceDbById: jest.fn()
}));
jest.mock('../server/services/protoImportService', () => ({
    writeItems: jest.fn(),
    writeMobs: jest.fn()
}));

const db = require('../server/config/database');
const sshService = require('../server/services/sshService');
const controller = require('../server/modules/server_connections/controller');

function makeReqRes({ params = {}, body = {}, user = { id: 1 } } = {}) {
    const req = { params, body, user };
    const res = { json: jest.fn() };
    const next = jest.fn();
    return { req, res, next };
}

beforeEach(() => {
    db.query.mockReset();
    sshService.testConnection.mockReset();
    sshService.captureHostKeyFingerprint.mockReset();
    sshService.runAllowlistedCommand.mockReset();
});

describe('ownership isolation', () => {
    test('get() rejects a workspace the user does not own/belong to, without leaking data', async () => {
        db.query.mockResolvedValueOnce([[]]); // assertWorkspaceAccess: no matching rows

        const { req, res, next } = makeReqRes({ params: { workspaceId: '999' } });
        await controller.get(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
        expect(res.json).not.toHaveBeenCalled();
    });
});

describe('GET /:workspaceId response shape', () => {
    test('never returns encrypted secret blobs, only boolean presence flags', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 4 }]]) // assertWorkspaceAccess: owns it
            .mockResolvedValueOnce([[{
                workspace_id: 4,
                ssh_host: '1.2.3.4', ssh_port: 22, ssh_username: 'root', ssh_auth_method: 'password',
                ssh_secret_encrypted: 'ENCRYPTED_PASSWORD_BLOB',
                ssh_passphrase_encrypted: null,
                ssh_host_key_fingerprint: 'aa:bb:cc',
                remote_quest_path: 'quest/', remote_cube_path: null,
                cmd_restart_game: null, cmd_restart_db: null, cmd_status: null,
                db_host: null, db_port: 3306, db_user: null, db_name: null,
                db_password_encrypted: 'ENCRYPTED_DB_PASSWORD_BLOB',
                updated_at: '2026-01-01 00:00:00'
            }]]); // getConnectionRow

        const { req, res, next } = makeReqRes({ params: { workspaceId: '4' } });
        await controller.get(req, res, next);

        expect(next).not.toHaveBeenCalled();
        const body = res.json.mock.calls[0][0];
        expect(body.ssh_secret_encrypted).toBeUndefined();
        expect(body.db_password_encrypted).toBeUndefined();
        expect(body.ssh_passphrase_encrypted).toBeUndefined();
        expect(body.hasSshSecret).toBe(true);
        expect(body.hasDbPassword).toBe(true);
        // The host-key fingerprint is not a secret - it's meant to be
        // compared publicly, same as a real SSH client shows it.
        expect(body.ssh_host_key_fingerprint).toBe('aa:bb:cc');
    });
});

describe('cooldown enforcement', () => {
    test('blocks a second test() call within the cooldown window, without attempting any connection', async () => {
        const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
        db.query
            .mockResolvedValueOnce([[{ id: 4 }]])              // assertWorkspaceAccess
            .mockResolvedValueOnce([[{ value: '30' }]])        // connection_test_cooldown_seconds
            .mockResolvedValueOnce([[{ created_at: nowUtc }]]); // last test_connection just happened

        const { req, res, next } = makeReqRes({ params: { workspaceId: '4' } });
        await controller.testConnection(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));
        expect(sshService.testConnection).not.toHaveBeenCalled();
        expect(sshService.captureHostKeyFingerprint).not.toHaveBeenCalled();
    });
});

describe('command allowlist', () => {
    test('runCommand() rejects an unlisted key before touching the database or sshService', async () => {
        const { req, res, next } = makeReqRes({ params: { workspaceId: '4' }, body: { key: 'delete_everything' } });
        await controller.runCommand(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
        expect(sshService.runAllowlistedCommand).not.toHaveBeenCalled();
        expect(db.query).not.toHaveBeenCalled();
    });
});
