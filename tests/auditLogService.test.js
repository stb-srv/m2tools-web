jest.mock('../server/config/database', () => ({ query: jest.fn() }));

const db = require('../server/config/database');
const auditLogService = require('../server/services/auditLogService');

describe('logConnectionAction', () => {
    beforeEach(() => {
        db.query.mockReset();
    });

    test('writes a success entry', async () => {
        db.query.mockResolvedValue([{ insertId: 1 }]);
        await auditLogService.logConnectionAction(4, 1, 'test_connection', 'ssh', true);

        expect(db.query).toHaveBeenCalledTimes(1);
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toContain('INSERT INTO connection_audit_log');
        expect(params).toEqual([4, 1, 'test_connection', 'ssh', 1, null]);
    });

    test('writes a failure entry with the error message, converting success to 0', async () => {
        db.query.mockResolvedValue([{ insertId: 2 }]);
        await auditLogService.logConnectionAction(4, 1, 'sftp_upload', '/quest/foo.lua', false, 'connect ECONNREFUSED');

        const [, params] = db.query.mock.calls[0];
        expect(params).toEqual([4, 1, 'sftp_upload', '/quest/foo.lua', 0, 'connect ECONNREFUSED']);
    });

    test('swallows DB write failures instead of throwing (never blocks the caller)', async () => {
        db.query.mockRejectedValue(new Error('db unavailable'));
        await expect(auditLogService.logConnectionAction(4, 1, 'test_connection', null, true)).resolves.toBeUndefined();
    });
});

describe('listRecent', () => {
    beforeEach(() => {
        db.query.mockReset();
    });

    test('queries the audit log scoped to one workspace with a limit', async () => {
        const fakeRows = [{ action: 'test_connection', success: 1 }];
        db.query.mockResolvedValue([fakeRows]);

        const rows = await auditLogService.listRecent(4, 10);

        expect(rows).toEqual(fakeRows);
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toContain('WHERE workspace_id = ?');
        expect(params).toEqual([4, 10]);
    });

    test('defaults the limit to 20', async () => {
        db.query.mockResolvedValue([[]]);
        await auditLogService.listRecent(4);
        const [, params] = db.query.mock.calls[0];
        expect(params).toEqual([4, 20]);
    });
});
