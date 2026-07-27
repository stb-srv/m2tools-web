jest.mock('../server/config/database', () => ({ query: jest.fn() }));
jest.mock('../server/modules/admin/item_scanner', () => ({
    scan: jest.fn().mockResolvedValue({ success: true, items: 0, icons: 0 })
}));
jest.mock('../server/utils/moduleLoader', () => ({
    getModuleRegistry: jest.fn()
}));

const db = require('../server/config/database');
const { getModuleRegistry } = require('../server/utils/moduleLoader');
const controller = require('../server/modules/admin/controller');

function makeReqRes({ body = {} } = {}) {
    const req = { body };
    const res = { json: jest.fn() };
    const next = jest.fn();
    return { req, res, next };
}

beforeEach(() => {
    db.query.mockReset();
    getModuleRegistry.mockReset();
});

describe('getModuleConfigs', () => {
    test('merges DB overrides onto the static registry, falling back to defaults for unconfigured modules', async () => {
        getModuleRegistry.mockReturnValue([
            { id: 'quest_builder', defaultAccess: 'user' },
            { id: 'admin', defaultAccess: 'admin' }
        ]);
        db.query.mockResolvedValueOnce([[
            { id: 'quest_builder', access_level: 'premium', is_visible_guests: 0, created_at: '2026-01-01' }
        ]]);

        const { req, res, next } = makeReqRes();
        await controller.getModuleConfigs(req, res, next);

        expect(next).not.toHaveBeenCalled();
        const merged = res.json.mock.calls[0][0];
        expect(merged.find(m => m.id === 'quest_builder')).toEqual(expect.objectContaining({ access_level: 'premium', is_visible_guests: false }));
        // 'admin' has no DB row, so it falls back to its static defaultAccess and defaults guests to visible.
        expect(merged.find(m => m.id === 'admin')).toEqual(expect.objectContaining({ access_level: 'admin', is_visible_guests: true }));
    });
});

describe('updateModuleConfig', () => {
    test('rejects a request missing id or access_level without touching the database', async () => {
        const { req, res, next } = makeReqRes({ body: { id: 'quest_builder' } });
        await controller.updateModuleConfig(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
        expect(db.query).not.toHaveBeenCalled();
    });

    test('upserts a valid module config', async () => {
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
        const { req, res, next } = makeReqRes({ body: { id: 'quest_builder', access_level: 'premium', is_visible_guests: true } });
        await controller.updateModuleConfig(req, res, next);
        expect(next).not.toHaveBeenCalled();
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toContain('ON CONFLICT(id)');
        expect(params).toEqual(['quest_builder', 'premium', 1]);
    });
});

describe('getAllUsers', () => {
    test('strips HTML from display names before returning them', async () => {
        db.query.mockResolvedValueOnce([[
            { id: 1, username: 'bob', displayName: '<img src=x onerror=alert(1)>Bob', role: 'viewer', isPremium: 0, createdAt: '2026-01-01' }
        ]]);
        const { req, res, next } = makeReqRes();
        await controller.getAllUsers(req, res, next);
        const [user] = res.json.mock.calls[0][0];
        expect(user.displayName).not.toContain('<img');
        expect(user.displayName).not.toContain('onerror');
    });
});

describe('updateUserStatus', () => {
    test('rejects a missing userId', async () => {
        const { req, res, next } = makeReqRes({ body: { role: 'admin' } });
        await controller.updateUserStatus(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
        expect(db.query).not.toHaveBeenCalled();
    });

    test('rejects an invalid role, blocking privilege escalation to an arbitrary string', async () => {
        const { req, res, next } = makeReqRes({ body: { userId: 2, role: 'superadmin' } });
        await controller.updateUserStatus(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
        expect(db.query).not.toHaveBeenCalled();
    });

    test('updates role and premium status independently when both are provided', async () => {
        db.query.mockResolvedValue([{ affectedRows: 1 }]);
        const { req, res, next } = makeReqRes({ body: { userId: 2, role: 'editor', isPremium: true } });
        await controller.updateUserStatus(req, res, next);
        // 1 UPDATE + 1 audit-log INSERT per changed field (role, isPremium).
        expect(db.query).toHaveBeenCalledTimes(4);
        expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    test('only updates the field that was provided (role omitted -> no role UPDATE)', async () => {
        db.query.mockResolvedValue([{ affectedRows: 1 }]);
        const { req, res, next } = makeReqRes({ body: { userId: 2, isPremium: false } });
        await controller.updateUserStatus(req, res, next);
        // 1 UPDATE + 1 audit-log INSERT, nothing for the omitted role field.
        expect(db.query).toHaveBeenCalledTimes(2);
        expect(db.query.mock.calls[0][0]).toContain('is_premium');
    });
});

describe('getSystemSettings', () => {
    test('flattens key/value rows into a single settings object', async () => {
        db.query.mockResolvedValueOnce([[
            { key: 'site_name', value: 'M2-Tools' },
            { key: 'maintenance_mode', value: '0' }
        ]]);
        const { req, res, next } = makeReqRes();
        await controller.getSystemSettings(req, res, next);
        expect(res.json).toHaveBeenCalledWith({ site_name: 'M2-Tools', maintenance_mode: '0' });
    });
});

describe('updateSystemSettings', () => {
    test('upserts every key in the request body', async () => {
        db.query.mockResolvedValue([{ affectedRows: 1 }]);
        const { req, res, next } = makeReqRes({ body: { site_name: 'New Name', maintenance_mode: true } });
        await controller.updateSystemSettings(req, res, next);
        expect(db.query).toHaveBeenCalledTimes(2);
        expect(res.json).toHaveBeenCalledWith({ success: true });
    });
});
