jest.mock('../server/config/database', () => ({ query: jest.fn() }));
jest.mock('../server/modules/auth/mailer', () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../server/modules/auth/disposable-emails', () => ({
    isDisposableEmail: jest.fn(() => false)
}));
jest.mock('../server/services/storageService', () => ({
    deleteWorkspaceData: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../server/utils/workspace', () => ({
    closeWorkspaceDb: jest.fn()
}));

const bcrypt = require('bcryptjs');
const db = require('../server/config/database');
const { sendVerificationEmail } = require('../server/modules/auth/mailer');
const { isDisposableEmail } = require('../server/modules/auth/disposable-emails');
const storageService = require('../server/services/storageService');
const { closeWorkspaceDb } = require('../server/utils/workspace');
const controller = require('../server/modules/auth/controller');

function makeReqRes({ params = {}, body = {}, query = {}, user = { id: 1, username: 'bob' } } = {}) {
    const req = { params, body, query, user };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis(), redirect: jest.fn() };
    return { req, res };
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
    db.query.mockReset();
    // initAuth() runs a fire-and-forget seed check on module load - give every
    // test a clean slate by resolving it to "users already exist" so it never
    // interferes with a test's own mock sequence.
    db.query.mockResolvedValue([[{ count: 1 }]]);
    sendVerificationEmail.mockClear();
    isDisposableEmail.mockReset();
    isDisposableEmail.mockReturnValue(false);
    storageService.deleteWorkspaceData.mockReset().mockResolvedValue(undefined);
    closeWorkspaceDb.mockReset();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
});

afterAll(() => {
    process.env = ORIGINAL_ENV;
});

describe('login', () => {
    test('rejects missing credentials without querying the database', async () => {
        const { req, res } = makeReqRes({ body: { username: 'bob' } });
        await controller.login(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('rejects an unknown username/email with a generic error (no user enumeration)', async () => {
        db.query.mockResolvedValueOnce([[]]);
        const { req, res } = makeReqRes({ body: { username: 'ghost', password: 'whatever' } });
        await controller.login(req, res);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Ungültige Anmeldedaten' }));
    });

    test('rejects a wrong password with the same generic error as an unknown user', async () => {
        const hash = await bcrypt.hash('correct-horse', 10);
        db.query.mockResolvedValueOnce([[{ id: 1, username: 'bob', password_hash: hash, role: 'viewer', email_verified: 1 }]]);
        const { req, res } = makeReqRes({ body: { username: 'bob', password: 'wrong' } });
        await controller.login(req, res);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Ungültige Anmeldedaten' }));
    });

    test('blocks an unverified non-admin user and flags needsVerification', async () => {
        const hash = await bcrypt.hash('secret123', 10);
        db.query.mockResolvedValueOnce([[{ id: 1, username: 'bob', password_hash: hash, role: 'viewer', email_verified: 0 }]]);
        const { req, res } = makeReqRes({ body: { username: 'bob', password: 'secret123' } });
        await controller.login(req, res);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ needsVerification: true }));
    });

    test('lets an unverified admin log in (verification check is skipped for admins)', async () => {
        const hash = await bcrypt.hash('secret123', 10);
        db.query.mockResolvedValueOnce([[{ id: 1, username: 'root', password_hash: hash, role: 'admin', email_verified: 0 }]]);
        const { req, res } = makeReqRes({ body: { username: 'root', password: 'secret123' } });
        await controller.login(req, res);
        expect(res.status).not.toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, token: expect.any(String) }));
    });

    test('on success, never leaks the password hash back to the client', async () => {
        const hash = await bcrypt.hash('secret123', 10);
        db.query.mockResolvedValueOnce([[{ id: 1, username: 'bob', email: 'bob@example.com', password_hash: hash, role: 'viewer', email_verified: 1 }]]);
        const { req, res } = makeReqRes({ body: { username: 'bob', password: 'secret123' } });
        await controller.login(req, res);
        const body = res.json.mock.calls[0][0];
        expect(body.user.password_hash).toBeUndefined();
        expect(body.token).toEqual(expect.any(String));
    });
});

describe('registerPublic', () => {
    const validBody = { username: 'newbob', email: 'new@example.com', password: 'secret123', passwordConfirm: 'secret123' };

    test('rejects a too-short password', async () => {
        const { req, res } = makeReqRes({ body: { ...validBody, password: '123', passwordConfirm: '123' } });
        await controller.registerPublic(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('rejects mismatched password confirmation', async () => {
        const { req, res } = makeReqRes({ body: { ...validBody, passwordConfirm: 'different' } });
        await controller.registerPublic(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('rejects a username with invalid characters', async () => {
        const { req, res } = makeReqRes({ body: { ...validBody, username: 'bad name!' } });
        await controller.registerPublic(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('rejects a disposable email address', async () => {
        isDisposableEmail.mockReturnValue(true);
        const { req, res } = makeReqRes({ body: validBody });
        await controller.registerPublic(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('rejects an already-taken username/email with 409', async () => {
        db.query.mockResolvedValueOnce([[{ id: 5 }]]); // existing check
        const { req, res } = makeReqRes({ body: validBody });
        await controller.registerPublic(req, res);
        expect(res.status).toHaveBeenCalledWith(409);
    });

    test('without SMTP configured, auto-verifies the new account and never emails', async () => {
        db.query
            .mockResolvedValueOnce([[]])              // no existing user
            .mockResolvedValueOnce([{ insertId: 9 }])  // insert
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // auto-verify update
        const { req, res } = makeReqRes({ body: validBody });
        await controller.registerPublic(req, res);
        expect(sendVerificationEmail).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, autoVerified: true }));
        const updateCall = db.query.mock.calls.find(c => c[0].includes('email_verified = 1'));
        expect(updateCall).toBeTruthy();
    });

    test('with SMTP configured, sends a verification email instead of auto-verifying', async () => {
        process.env.SMTP_HOST = 'smtp.example.com';
        process.env.SMTP_USER = 'noreply@example.com';
        db.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ insertId: 9 }]);
        const { req, res } = makeReqRes({ body: validBody });
        await controller.registerPublic(req, res);
        expect(sendVerificationEmail).toHaveBeenCalledWith('new@example.com', 'newbob', expect.any(String), expect.any(String));
        const body = res.json.mock.calls[0][0];
        expect(body.success).toBe(true);
        expect(body.autoVerified).toBeUndefined();
    });
});

describe('verifyEmail', () => {
    test('rejects a missing token', async () => {
        const { req, res } = makeReqRes({ query: {} });
        await controller.verifyEmail(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('rejects an unknown/already-used token', async () => {
        db.query.mockResolvedValueOnce([[]]);
        const { req, res } = makeReqRes({ query: { token: 'bogus' } });
        await controller.verifyEmail(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('rejects an expired token', async () => {
        db.query.mockResolvedValueOnce([[{ id: 1, username: 'bob', verification_expires: '2000-01-01T00:00:00.000Z' }]]);
        const { req, res } = makeReqRes({ query: { token: 'expired' } });
        await controller.verifyEmail(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('marks the account verified and redirects on a valid token', async () => {
        const future = new Date(Date.now() + 60_000).toISOString();
        db.query
            .mockResolvedValueOnce([[{ id: 1, username: 'bob', verification_expires: future }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        const { req, res } = makeReqRes({ query: { token: 'good' } });
        await controller.verifyEmail(req, res);
        expect(res.redirect).toHaveBeenCalled();
        const [sql, params] = db.query.mock.calls[1];
        expect(sql).toContain('email_verified = 1');
        expect(params).toEqual([1]);
    });
});

describe('resendVerification', () => {
    test('does not reveal whether the email exists', async () => {
        db.query.mockResolvedValueOnce([[]]);
        const { req, res } = makeReqRes({ body: { email: 'ghost@example.com' } });
        await controller.resendVerification(req, res);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        expect(sendVerificationEmail).not.toHaveBeenCalled();
    });

    test('short-circuits for an already-verified email without generating a new token', async () => {
        db.query.mockResolvedValueOnce([[{ id: 1, email_verified: 1 }]]);
        const { req, res } = makeReqRes({ body: { email: 'bob@example.com' } });
        await controller.resendVerification(req, res);
        expect(db.query).toHaveBeenCalledTimes(1);
        expect(sendVerificationEmail).not.toHaveBeenCalled();
    });
});

describe('updateAccount', () => {
    test('requires currentPassword when setting a newPassword', async () => {
        const { req, res } = makeReqRes({ body: { newPassword: 'newsecret1' } });
        await controller.updateAccount(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('rejects a wrong currentPassword', async () => {
        const hash = await bcrypt.hash('actualpass', 10);
        db.query.mockResolvedValueOnce([[{ password_hash: hash }]]);
        const { req, res } = makeReqRes({ body: { currentPassword: 'wrongpass', newPassword: 'newsecret1' } });
        await controller.updateAccount(req, res);
        expect(res.status).toHaveBeenCalledWith(401);
    });

    test('rejects changing email to one already in use by another account', async () => {
        db.query.mockResolvedValueOnce([[{ id: 2 }]]); // existing email owned by someone else
        const { req, res } = makeReqRes({ body: { email: 'taken@example.com' } });
        await controller.updateAccount(req, res);
        expect(res.status).toHaveBeenCalledWith(409);
    });
});

describe('admin: register', () => {
    test('falls back to the "viewer" role for an invalid role value', async () => {
        db.query.mockResolvedValueOnce([{ insertId: 3 }]);
        const { req, res } = makeReqRes({ body: { username: 'x', password: 'secret123', role: 'superuser' } });
        await controller.register(req, res);
        const [, params] = db.query.mock.calls[0];
        expect(params).toEqual(expect.arrayContaining(['viewer']));
    });
});

describe('admin: updateUser', () => {
    test('rejects an invalid role', async () => {
        const { req, res } = makeReqRes({ params: { id: '2' }, body: { role: 'superuser' } });
        await controller.updateUser(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(db.query).not.toHaveBeenCalled();
    });
});

describe('admin: deleteUser', () => {
    // Routes db.query by the statement's shape rather than call order, so
    // each test only has to describe what the deleted user owns.
    function mockOwnership({ workspaces = [], teams = [] } = {}) {
        db.query.mockImplementation((sql) => {
            if (sql.includes('SELECT id FROM workspaces WHERE userId')) return Promise.resolve([workspaces]);
            if (sql.includes('SELECT id FROM m2em_teams WHERE owner_id')) return Promise.resolve([teams]);
            return Promise.resolve([{ affectedRows: 1 }]);
        });
    }

    test('refuses to let an admin delete their own account', async () => {
        const { req, res } = makeReqRes({ params: { id: '1' }, user: { id: 1 } });
        await controller.deleteUser(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('deletes a user who owns nothing, without touching workspace/team tables', async () => {
        mockOwnership();
        const { req, res } = makeReqRes({ params: { id: '2' }, user: { id: 1 } });
        await controller.deleteUser(req, res);

        expect(res.json).toHaveBeenCalledWith({ success: true });
        const calledSql = db.query.mock.calls.map(c => c[0]);
        expect(calledSql).not.toContain('DELETE FROM workspaces WHERE userId = ?');
        expect(calledSql).not.toContain('DELETE FROM m2em_teams WHERE owner_id = ?');
        expect(calledSql).toContain('DELETE FROM m2em_team_members WHERE user_id = ?');
        expect(calledSql).toContain('DELETE FROM item_proto WHERE userId = ? AND workspace_id IS NULL');
        expect(calledSql).toContain('DELETE FROM mob_proto WHERE userId = ? AND workspace_id IS NULL');
        expect(calledSql).toContain('DELETE FROM m2em_users WHERE id = ?');
    });

    test('cleans up an owned workspace: connections, audit log, cached DB handle, files, and the row itself', async () => {
        mockOwnership({ workspaces: [{ id: 10 }] });
        const { req, res } = makeReqRes({ params: { id: '2' }, user: { id: 1 } });
        await controller.deleteUser(req, res);

        expect(res.json).toHaveBeenCalledWith({ success: true });
        expect(db.query).toHaveBeenCalledWith('DELETE FROM workspace_connections WHERE workspace_id = ?', [10]);
        expect(db.query).toHaveBeenCalledWith('DELETE FROM connection_audit_log WHERE workspace_id = ?', [10]);
        expect(closeWorkspaceDb).toHaveBeenCalledWith('2', 10);
        expect(storageService.deleteWorkspaceData).toHaveBeenCalledWith('2', 10);
        expect(db.query).toHaveBeenCalledWith('DELETE FROM workspaces WHERE userId = ?', ['2']);
    });

    test('still succeeds when a workspace file cleanup fails (best effort)', async () => {
        mockOwnership({ workspaces: [{ id: 10 }] });
        storageService.deleteWorkspaceData.mockRejectedValueOnce(new Error('EBUSY'));
        const { req, res } = makeReqRes({ params: { id: '2' }, user: { id: 1 } });
        await controller.deleteUser(req, res);
        expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    test('cleans up an owned team: memberships removed and its workspaces unlinked before the team is deleted', async () => {
        mockOwnership({ teams: [{ id: 20 }] });
        const { req, res } = makeReqRes({ params: { id: '2' }, user: { id: 1 } });
        await controller.deleteUser(req, res);

        expect(res.json).toHaveBeenCalledWith({ success: true });
        expect(db.query).toHaveBeenCalledWith('DELETE FROM m2em_team_members WHERE team_id = ?', [20]);
        expect(db.query).toHaveBeenCalledWith('UPDATE workspaces SET team_id = NULL WHERE team_id = ?', [20]);
        expect(db.query).toHaveBeenCalledWith('DELETE FROM m2em_teams WHERE owner_id = ?', ['2']);
    });
});
