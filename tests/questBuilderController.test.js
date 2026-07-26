jest.mock('fs', () => ({
    existsSync: jest.fn(() => true),
    readdirSync: jest.fn(),
    statSync: jest.fn(() => ({ mtime: new Date('2026-01-01') })),
    promises: {
        mkdir: jest.fn().mockResolvedValue(undefined),
        writeFile: jest.fn().mockResolvedValue(undefined),
        readdir: jest.fn().mockResolvedValue([])
    }
}));
jest.mock('../server/config/database', () => ({ query: jest.fn() }));
jest.mock('../server/utils/workspace', () => ({
    getActiveWorkspace: jest.fn(),
    getWorkspaceScope: jest.fn(),
    getWorkspaceDb: jest.fn()
}));

const path = require('path');
const fs = require('fs');
const db = require('../server/config/database');
const { getActiveWorkspace, getWorkspaceScope, getWorkspaceDb } = require('../server/utils/workspace');
const controller = require('../server/modules/quest_builder/controller');

function makeReqRes({ query = {}, body = {}, user = { id: 1 } } = {}) {
    const req = { query, body, user };
    const res = { json: jest.fn(), sendFile: jest.fn() };
    const next = jest.fn();
    return { req, res, next };
}

beforeEach(() => {
    db.query.mockReset();
    getActiveWorkspace.mockReset().mockResolvedValue({ id: 5 });
    getWorkspaceScope.mockReset();
    getWorkspaceDb.mockReset();
    fs.existsSync.mockReset().mockReturnValue(true);
    fs.promises.mkdir.mockClear();
    fs.promises.writeFile.mockClear();
    fs.promises.readdir.mockClear().mockResolvedValue([]);
});

describe('searchMobs', () => {
    test('queries the workspace-local proto DB when one is active, and decodes latin1 mob names', async () => {
        const all = jest.fn().mockReturnValue([
            { vnum: 101, name: Buffer.from('Ork', 'latin1'), level: 5, type: 0 }
        ]);
        getWorkspaceDb.mockResolvedValue({ prepare: jest.fn(() => ({ all })) });

        const { req, res, next } = makeReqRes({ query: { q: 'Ork' } });
        await controller.searchMobs(req, res, next);

        expect(db.query).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith([{ vnum: 101, name: 'Ork', level: 5, type: 0 }]);
    });

    test('falls back to the central DB scoped to the workspace when no local proto DB exists', async () => {
        getWorkspaceDb.mockResolvedValue(null);
        getWorkspaceScope.mockResolvedValue({ clause: 'workspace_id = ?', param: 5 });
        db.query.mockResolvedValueOnce([[{ vnum: 202, name: 'Wolf', level: 3, type: 1 }]]);

        const { req, res, next } = makeReqRes({ query: { q: 'Wolf' } });
        await controller.searchMobs(req, res, next);

        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toContain('workspace_id = ?');
        expect(params).toEqual(['%Wolf%', '%Wolf%', 5]);
        expect(res.json).toHaveBeenCalledWith([{ vnum: 202, name: 'Wolf', level: 3, type: 1 }]);
    });
});

describe('saveQuest', () => {
    test('rejects a missing filename or content without touching the filesystem', async () => {
        const { req, res, next } = makeReqRes({ body: { filename: 'x' } });
        await controller.saveQuest(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
        expect(fs.promises.writeFile).not.toHaveBeenCalled();
    });

    test('strips path-traversal and special characters from the filename before writing', async () => {
        const { req, res, next } = makeReqRes({ body: { filename: '../../etc/evil.quest', content: 'quest content' } });
        await controller.saveQuest(req, res, next);

        expect(next).not.toHaveBeenCalled();
        const [writtenPath] = fs.promises.writeFile.mock.calls[0];
        expect(path.basename(writtenPath)).toBe('etcevilquest.quest');
        expect(writtenPath).not.toContain('..');
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
});

describe('loadQuest', () => {
    test('lists only .quest files when no specific file is requested', async () => {
        fs.promises.readdir.mockResolvedValue(['a.quest', 'notes.txt', 'b.quest']);
        const { req, res, next } = makeReqRes({ query: {} });
        await controller.loadQuest(req, res, next);
        const names = res.json.mock.calls[0][0].map(f => f.name);
        expect(names).toEqual(['a.quest', 'b.quest']);
    });

    test('collapses a path-traversal filename to its basename', async () => {
        fs.existsSync.mockReturnValue(true);
        const { req, res, next } = makeReqRes({ query: { file: '../../../etc/passwd' } });
        await controller.loadQuest(req, res, next);
        expect(next).not.toHaveBeenCalled();
        const [sentPath] = res.sendFile.mock.calls[0];
        expect(path.basename(sentPath)).toBe('passwd');
        expect(sentPath).not.toMatch(/\.\./);
    });

    test('returns 404 when the requested file does not exist', async () => {
        fs.existsSync.mockReturnValue(false);
        const { req, res, next } = makeReqRes({ query: { file: 'missing.quest' } });
        await controller.loadQuest(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });
});
