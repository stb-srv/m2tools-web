const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');

jest.mock('../server/config/database', () => ({ query: jest.fn() }));
jest.mock('../server/services/storageService', () => ({
    calculateUsage: jest.fn().mockResolvedValue(0),
    calculateWorkspaceUsage: jest.fn().mockResolvedValue(0),
    getLimit: jest.fn().mockResolvedValue(20 * 1024 * 1024),
    initWorkspace: jest.fn().mockResolvedValue(undefined),
    checkQuota: jest.fn().mockResolvedValue(undefined),
    getWorkspaceDbPath: jest.fn(),
    getWorkspaceIconPath: jest.fn(),
    deleteWorkspaceData: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../server/services/protoImportService', () => ({
    parseUploadedProtoFile: jest.fn(),
    writeItems: jest.fn(),
    writeMobs: jest.fn()
}));
jest.mock('../server/utils/workspace', () => ({
    getWorkspaceDbById: jest.fn(),
    closeWorkspaceDb: jest.fn()
}));

const db = require('../server/config/database');
const storageService = require('../server/services/storageService');
const protoImportService = require('../server/services/protoImportService');
const { getWorkspaceDbById, closeWorkspaceDb } = require('../server/utils/workspace');
const controller = require('../server/modules/workspaces/controller');

function makeReqRes({ params = {}, body = {}, user = { id: 1, role: 'viewer' }, file = undefined } = {}) {
    const req = { params, body, user, file };
    const res = { json: jest.fn() };
    const next = jest.fn();
    return { req, res, next };
}

beforeEach(() => {
    db.query.mockReset();
    Object.values(storageService).forEach(fn => fn.mockClear && fn.mockClear());
    Object.values(protoImportService).forEach(fn => fn.mockClear && fn.mockClear());
    getWorkspaceDbById.mockReset();
    closeWorkspaceDb.mockReset();
});

describe('list', () => {
    test('attaches a per-workspace usage figure to each row instead of one account-wide total', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 4, userId: 1, name: 'A' }, { id: 7, userId: 1, name: 'B' }]]) // workspaces
            .mockResolvedValueOnce([[{ activeId: 4 }]]); // current_workspace_id
        storageService.calculateWorkspaceUsage
            .mockResolvedValueOnce(1000) // for ws 4
            .mockResolvedValueOnce(2000); // for ws 7

        const { req, res, next } = makeReqRes();
        await controller.list(req, res, next);

        expect(next).not.toHaveBeenCalled();
        const body = res.json.mock.calls[0][0];
        expect(body.workspaces).toEqual([
            expect.objectContaining({ id: 4, usage: 1000 }),
            expect.objectContaining({ id: 7, usage: 2000 })
        ]);
        expect(storageService.calculateWorkspaceUsage).toHaveBeenCalledWith(1, 4);
        expect(storageService.calculateWorkspaceUsage).toHaveBeenCalledWith(1, 7);
        expect(body.usage).toBeUndefined(); // no more account-wide aggregate
    });
});

describe('create', () => {
    test('rejects a missing name without hitting the database', async () => {
        const { req, res, next } = makeReqRes({ body: {} });
        await controller.create(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
        expect(db.query).not.toHaveBeenCalled();
    });

    test('blocks a non-admin from exceeding their workspace limit', async () => {
        db.query
            .mockResolvedValueOnce([[{ role: 'viewer' }]])
            .mockResolvedValueOnce([[{ value: '1' }]])
            .mockResolvedValueOnce([[{ c: 1 }]]);
        const { req, res, next } = makeReqRes({ body: { name: 'WS2' } });
        await controller.create(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
        expect(storageService.initWorkspace).not.toHaveBeenCalled();
    });

    test('lets an admin bypass the workspace limit', async () => {
        db.query
            .mockResolvedValueOnce([[{ role: 'admin' }]])
            .mockResolvedValueOnce([{ insertId: 7 }])
            .mockResolvedValueOnce([[{ c: 2 }]]); // not the first workspace, no auto-select update
        const { req, res, next } = makeReqRes({ body: { name: 'WS-Admin' } });
        await controller.create(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(storageService.initWorkspace).toHaveBeenCalledWith(1, 7);
        expect(res.json).toHaveBeenCalledWith({ success: true, id: 7 });
    });
});

describe('select', () => {
    test('rejects a missing id', async () => {
        const { req, res, next } = makeReqRes({ body: {} });
        await controller.select(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    test('forbids selecting a workspace the user has no access to', async () => {
        db.query.mockResolvedValueOnce([[]]);
        const { req, res, next } = makeReqRes({ body: { id: 5 } });
        await controller.select(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });
});

describe('remove', () => {
    test('refuses to delete a workspace the requester does not own', async () => {
        db.query.mockResolvedValueOnce([[]]);
        const { req, res, next } = makeReqRes({ params: { id: '5' } });
        await controller.remove(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
        expect(storageService.deleteWorkspaceData).not.toHaveBeenCalled();
    });

    test('closes the cached DB handle before removing files, so a Windows file lock cannot block deletion', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 5 }]])       // ownership check
            .mockResolvedValueOnce([{ affectedRows: 1 }]) // DELETE FROM workspaces
            .mockResolvedValueOnce([{ affectedRows: 0 }]); // reset current_workspace_id
        const { req, res, next } = makeReqRes({ params: { id: '5' } });
        await controller.remove(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(closeWorkspaceDb).toHaveBeenCalledWith(1, '5');
        const closeCallOrder = closeWorkspaceDb.mock.invocationCallOrder[0];
        const deleteDataCallOrder = storageService.deleteWorkspaceData.mock.invocationCallOrder[0];
        expect(closeCallOrder).toBeLessThan(deleteDataCallOrder);
        expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    test('still reports success when storage cleanup fails (the DB row is already gone)', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 5 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ affectedRows: 0 }]);
        storageService.deleteWorkspaceData.mockRejectedValueOnce(new Error('EBUSY: resource busy or locked'));
        const { req, res, next } = makeReqRes({ params: { id: '5' } });
        await controller.remove(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    test('also deletes the workspace_connections and connection_audit_log rows (no FK cascade on those tables)', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 5 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]) // DELETE FROM workspaces
            .mockResolvedValueOnce([{ affectedRows: 1 }]) // DELETE FROM workspace_connections
            .mockResolvedValueOnce([{ affectedRows: 3 }]) // DELETE FROM connection_audit_log
            .mockResolvedValueOnce([{ affectedRows: 0 }]); // reset current_workspace_id
        const { req, res, next } = makeReqRes({ params: { id: '5' } });
        await controller.remove(req, res, next);

        expect(next).not.toHaveBeenCalled();
        const calledSql = db.query.mock.calls.map(c => c[0]);
        expect(calledSql).toContain('DELETE FROM workspace_connections WHERE workspace_id = ?');
        expect(calledSql).toContain('DELETE FROM connection_audit_log WHERE workspace_id = ?');
        expect(db.query.mock.calls[2]).toEqual(['DELETE FROM workspace_connections WHERE workspace_id = ?', ['5']]);
        expect(db.query.mock.calls[3]).toEqual(['DELETE FROM connection_audit_log WHERE workspace_id = ?', ['5']]);
    });
});

describe('getDetails', () => {
    test('returns 404 when the workspace is not found or not accessible', async () => {
        db.query.mockResolvedValueOnce([[]]);
        const { req, res, next } = makeReqRes({ params: { id: '5' } });
        await controller.getDetails(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });
});

describe('uploadDb', () => {
    test('rejects when no file was uploaded', async () => {
        const { req, res, next } = makeReqRes({ params: { id: '5' }, file: undefined });
        await controller.uploadDb(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
        expect(db.query).not.toHaveBeenCalled();
    });

    test('rejects a file upload for a workspace the user cannot access', async () => {
        db.query.mockResolvedValueOnce([[]]); // assertWorkspaceAccess: no rows
        const { req, res, next } = makeReqRes({ params: { id: '5' }, file: { buffer: Buffer.from('x'), size: 1 } });
        await controller.uploadDb(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });

    test('converts a quota-exceeded error into a 403 ApiError', async () => {
        db.query.mockResolvedValueOnce([[{ id: 5 }]]); // has access
        const quotaErr = new Error('Speicherlimit erreicht');
        quotaErr.code = 'QUOTA_EXCEEDED';
        storageService.checkQuota.mockRejectedValueOnce(quotaErr);
        const { req, res, next } = makeReqRes({ params: { id: '5' }, file: { buffer: Buffer.from('x'), size: 999999999 } });
        await controller.uploadDb(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });
});

describe('uploadItemProto', () => {
    test('rejects a proto file with no parseable entries', async () => {
        db.query.mockResolvedValueOnce([[{ id: 5 }]]); // has access
        protoImportService.parseUploadedProtoFile.mockReturnValue([]);
        const { req, res, next } = makeReqRes({ params: { id: '5' }, file: { buffer: Buffer.from('garbage') } });
        await controller.uploadItemProto(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
        expect(getWorkspaceDbById).not.toHaveBeenCalled();
    });
});

describe('uploadIcons (Zip Slip protection)', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm2tools-zipslip-'));
        storageService.getWorkspaceIconPath.mockReturnValue(path.join(tmpDir, 'icons'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('drops path-traversal entries instead of writing them outside the icon directory', async () => {
        db.query.mockResolvedValueOnce([[{ id: 5 }]]); // has access

        const zip = new AdmZip();
        zip.addFile('safe.png', Buffer.from('safe-content'));
        zip.addFile('../../evil.txt', Buffer.from('escaped!'));
        const buffer = zip.toBuffer();

        const { req, res, next } = makeReqRes({ params: { id: '5' }, file: { buffer, size: buffer.length } });
        await controller.uploadIcons(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

        // The safe file landed inside the icon dir...
        expect(fs.existsSync(path.join(tmpDir, 'icons', 'safe.png'))).toBe(true);
        // ...but nothing escaped to the parent of tmpDir.
        expect(fs.existsSync(path.join(tmpDir, '..', 'evil.txt'))).toBe(false);
        expect(fs.existsSync(path.join(os.tmpdir(), 'evil.txt'))).toBe(false);
    });
});
