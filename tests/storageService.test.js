const fs = require('fs-extra');
const path = require('path');

jest.mock('../server/config/database', () => ({ query: jest.fn() }));

const db = require('../server/config/database');
const storageService = require('../server/services/storageService');

// Deliberately unrealistic ids so these tests can never collide with a real
// user's storage folder.
const TEST_USER = 999999;
const TEST_WS = 999999;
const userDir = path.join(storageService.STORAGE_ROOT, `user_${TEST_USER}`);
const wsDir = path.join(userDir, `ws_${TEST_WS}`);

beforeEach(() => {
    db.query.mockReset();
});

afterEach(async () => {
    await fs.remove(userDir);
});

describe('calculateWorkspaceUsage', () => {
    test('returns 0 for a workspace with no files on disk', async () => {
        expect(await storageService.calculateWorkspaceUsage(TEST_USER, TEST_WS)).toBe(0);
    });

    test('sums file sizes within the workspace folder only, ignoring sibling workspaces', async () => {
        await fs.ensureDir(path.join(wsDir, 'icons'));
        await fs.writeFile(path.join(wsDir, 'icons', 'a.png'), Buffer.alloc(100));

        const otherWsDir = path.join(userDir, `ws_${TEST_WS + 1}`);
        await fs.ensureDir(otherWsDir);
        await fs.writeFile(path.join(otherWsDir, 'b.png'), Buffer.alloc(500));

        expect(await storageService.calculateWorkspaceUsage(TEST_USER, TEST_WS)).toBe(100);
    });
});

describe('checkQuota (per-workspace, 10% grace)', () => {
    function mockLimit(bytes) {
        db.query
            .mockResolvedValueOnce([[{ is_premium: 0 }]])
            .mockResolvedValueOnce([[{ key: 'storage_limit_standard', value: String(bytes) }]]);
    }

    test('allows an upload that stays within the limit', async () => {
        mockLimit(1000);
        await expect(storageService.checkQuota(TEST_USER, TEST_WS, 500)).resolves.toEqual({ usage: 0, limit: 1000 });
    });

    test('allows exceeding the raw limit as long as it stays within the 10% grace margin', async () => {
        mockLimit(1000);
        // usage(0) + 1090 = 1090 <= 1000 * 1.1 (1100) -> allowed
        await expect(storageService.checkQuota(TEST_USER, TEST_WS, 1090)).resolves.toEqual({ usage: 0, limit: 1000 });
    });

    test('blocks once usage would exceed the 10% grace margin', async () => {
        mockLimit(1000);
        // usage(0) + 1101 = 1101 > 1100 -> blocked
        await expect(storageService.checkQuota(TEST_USER, TEST_WS, 1101)).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED', limit: 1000 });
    });

    test('checks quota against the specific workspace, not the user total across all workspaces', async () => {
        // A sibling workspace under the same user is already well past the
        // limit, but the target workspace itself is still empty - it must
        // not inherit the sibling's usage.
        const otherWsDir = path.join(userDir, `ws_${TEST_WS + 2}`);
        await fs.ensureDir(otherWsDir);
        await fs.writeFile(path.join(otherWsDir, 'big.db'), Buffer.alloc(5000));

        mockLimit(1000);
        await expect(storageService.checkQuota(TEST_USER, TEST_WS, 500)).resolves.toEqual({ usage: 0, limit: 1000 });
    });
});
