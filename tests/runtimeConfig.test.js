jest.mock('fs');
const fs = require('fs');

const ORIGINAL_ENV = { ...process.env };

function freshRuntimeConfig() {
    let mod;
    jest.isolateModules(() => {
        mod = require('../server/config/runtimeConfig');
    });
    return mod;
}

beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.JWT_SECRET;
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    delete process.env.ALLOWED_ORIGINS;
    fs.readFileSync = jest.fn(() => { throw new Error('ENOENT: no such file'); });
    fs.writeFileSync = jest.fn();
    fs.mkdirSync = jest.fn();
});

afterAll(() => {
    process.env = ORIGINAL_ENV;
});

describe('needsSetup', () => {
    test('true when neither secret is set', () => {
        const { needsSetup } = freshRuntimeConfig();
        expect(needsSetup()).toBe(true);
    });

    test('true when only one of the two secrets is set', () => {
        process.env.JWT_SECRET = 'a';
        const { needsSetup } = freshRuntimeConfig();
        expect(needsSetup()).toBe(true);
    });

    test('false once both secrets are present', () => {
        process.env.JWT_SECRET = 'a';
        process.env.CREDENTIALS_ENCRYPTION_KEY = 'b';
        const { needsSetup } = freshRuntimeConfig();
        expect(needsSetup()).toBe(false);
    });
});

describe('applying the persisted file at require-time', () => {
    test('applies persisted values onto process.env when unset', () => {
        fs.readFileSync = jest.fn(() => JSON.stringify({ JWT_SECRET: 'from-file', ALLOWED_ORIGINS: 'https://example.com' }));
        freshRuntimeConfig();
        expect(process.env.JWT_SECRET).toBe('from-file');
        expect(process.env.ALLOWED_ORIGINS).toBe('https://example.com');
    });

    test('a real env var already set always wins over the persisted file', () => {
        process.env.JWT_SECRET = 'real-env-value';
        fs.readFileSync = jest.fn(() => JSON.stringify({ JWT_SECRET: 'from-file' }));
        freshRuntimeConfig();
        expect(process.env.JWT_SECRET).toBe('real-env-value');
    });

    test('a missing/unreadable config file is treated as empty, not a boot error', () => {
        fs.readFileSync = jest.fn(() => { throw new Error('ENOENT: no such file'); });
        expect(() => freshRuntimeConfig()).not.toThrow();
    });

    test('ignores keys outside the managed allowlist', () => {
        fs.readFileSync = jest.fn(() => JSON.stringify({ SOME_RANDOM_VAR: 'nope' }));
        freshRuntimeConfig();
        expect(process.env.SOME_RANDOM_VAR).toBeUndefined();
    });
});

describe('saveConfig', () => {
    test('writes only managed keys, merged with existing file content, and creates the data dir', () => {
        fs.readFileSync = jest.fn(() => JSON.stringify({ SMTP_HOST: 'old-host' }));
        const { saveConfig } = freshRuntimeConfig();
        saveConfig({ JWT_SECRET: 'new-secret', notAManagedKey: 'ignored' });

        expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
        const [, written] = fs.writeFileSync.mock.calls[0];
        const parsed = JSON.parse(written);
        expect(parsed.JWT_SECRET).toBe('new-secret');
        expect(parsed.SMTP_HOST).toBe('old-host');
        expect(parsed.notAManagedKey).toBeUndefined();
    });

    test('applies saved values to process.env immediately, no restart needed', () => {
        const { saveConfig } = freshRuntimeConfig();
        saveConfig({ CREDENTIALS_ENCRYPTION_KEY: 'abc123' });
        expect(process.env.CREDENTIALS_ENCRYPTION_KEY).toBe('abc123');
    });
});
