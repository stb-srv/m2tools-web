jest.mock('../server/config/database', () => ({ query: jest.fn() }));
jest.mock('../server/config/runtimeConfig', () => ({
    needsSetup: jest.fn(),
    saveConfig: jest.fn()
}));
jest.mock('../server/modules/auth/middleware', () => ({
    JWT_SECRET: 'test-jwt-secret-for-setup-controller'
}));

const db = require('../server/config/database');
const runtimeConfig = require('../server/config/runtimeConfig');
const controller = require('../server/modules/setup/controller');

function makeReqRes(body = {}) {
    const req = { body };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    return { req, res };
}

beforeEach(() => {
    db.query.mockReset();
    runtimeConfig.needsSetup.mockReset().mockReturnValue(true);
    runtimeConfig.saveConfig.mockReset();
});

describe('status', () => {
    test('reflects runtimeConfig.needsSetup()', () => {
        runtimeConfig.needsSetup.mockReturnValue(true);
        const { req, res } = makeReqRes();
        controller.status(req, res);
        expect(res.json).toHaveBeenCalledWith({ needsSetup: true });
    });

    test('false once setup is complete', () => {
        runtimeConfig.needsSetup.mockReturnValue(false);
        const { req, res } = makeReqRes();
        controller.status(req, res);
        expect(res.json).toHaveBeenCalledWith({ needsSetup: false });
    });
});

describe('init', () => {
    const validBody = { username: 'admin', password: 'secret123', passwordConfirm: 'secret123' };

    test('refuses to run again once setup is already complete', async () => {
        runtimeConfig.needsSetup.mockReturnValue(false);
        const { req, res } = makeReqRes(validBody);
        await controller.init(req, res);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(db.query).not.toHaveBeenCalled();
        expect(runtimeConfig.saveConfig).not.toHaveBeenCalled();
    });

    test('rejects missing username/password without touching the database', async () => {
        const { req, res } = makeReqRes({ username: 'admin' });
        await controller.init(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('rejects a too-short password', async () => {
        const { req, res } = makeReqRes({ ...validBody, password: '123', passwordConfirm: '123' });
        await controller.init(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('rejects mismatched password confirmation', async () => {
        const { req, res } = makeReqRes({ ...validBody, passwordConfirm: 'different' });
        await controller.init(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('rejects a username with invalid characters', async () => {
        const { req, res } = makeReqRes({ ...validBody, username: 'bad name!' });
        await controller.init(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('rejects an invalid email when one is provided', async () => {
        const { req, res } = makeReqRes({ ...validBody, email: 'not-an-email' });
        await controller.init(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('creates the admin row, persists generated secrets, and returns a token', async () => {
        db.query.mockResolvedValueOnce([{ insertId: 1 }]);
        const { req, res } = makeReqRes(validBody);
        await controller.init(req, res);

        expect(res.status).not.toHaveBeenCalledWith(400);
        expect(res.status).not.toHaveBeenCalledWith(403);

        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toContain('INSERT INTO m2em_users');
        expect(params[0]).toBe('admin'); // username
        expect(params[3]).toBe('admin'); // role

        const [savedConfig] = runtimeConfig.saveConfig.mock.calls[0];
        expect(savedConfig.JWT_SECRET).toMatch(/^[0-9a-f]{96}$/);
        expect(savedConfig.CREDENTIALS_ENCRYPTION_KEY).toMatch(/^[0-9a-f]{64}$/);

        const body = res.json.mock.calls[0][0];
        expect(body.success).toBe(true);
        expect(body.token).toEqual(expect.any(String));
        expect(body.user).toEqual(expect.objectContaining({ username: 'admin', role: 'admin' }));
    });

    test('passes through optional domain/SMTP settings to saveConfig', async () => {
        db.query.mockResolvedValueOnce([{ insertId: 1 }]);
        const { req, res } = makeReqRes({
            ...validBody,
            allowedOrigins: 'https://example.com',
            baseUrl: 'https://example.com',
            smtp: { host: 'smtp.example.com', port: 587, user: 'a', pass: 'b', fromName: 'M2', from: 'noreply@example.com' }
        });
        await controller.init(req, res);

        const [savedConfig] = runtimeConfig.saveConfig.mock.calls[0];
        expect(savedConfig.ALLOWED_ORIGINS).toBe('https://example.com');
        expect(savedConfig.BASE_URL).toBe('https://example.com');
        expect(savedConfig.SMTP_HOST).toBe('smtp.example.com');
        expect(savedConfig.SMTP_PORT).toBe('587');
    });

    test('maps a duplicate-username DB error to 409', async () => {
        const dupErr = new Error('duplicate');
        dupErr.code = 'ER_DUP_ENTRY';
        db.query.mockRejectedValueOnce(dupErr);
        const { req, res } = makeReqRes(validBody);
        await controller.init(req, res);
        expect(res.status).toHaveBeenCalledWith(409);
    });

    test('a second concurrent call is rejected while the first is still in flight', async () => {
        db.query.mockResolvedValue([{ insertId: 1 }]);
        const { req: req1, res: res1 } = makeReqRes(validBody);
        const { req: req2, res: res2 } = makeReqRes(validBody);

        const p1 = controller.init(req1, res1);
        const p2 = controller.init(req2, res2);
        await Promise.all([p1, p2]);

        expect(res2.status).toHaveBeenCalledWith(409);
    });
});
