const { encrypt, decrypt } = require('../server/utils/secretsCrypto');

const VALID_KEY = 'a'.repeat(64); // 32 bytes hex

describe('secretsCrypto', () => {
    const originalKey = process.env.CREDENTIALS_ENCRYPTION_KEY;

    beforeEach(() => {
        process.env.CREDENTIALS_ENCRYPTION_KEY = VALID_KEY;
    });

    afterAll(() => {
        process.env.CREDENTIALS_ENCRYPTION_KEY = originalKey;
    });

    test('round-trips a plaintext value', () => {
        const blob = encrypt('super-secret-password');
        expect(blob).not.toBe('super-secret-password');
        expect(decrypt(blob)).toBe('super-secret-password');
    });

    test('produces different ciphertext for the same plaintext (random IV)', () => {
        const a = encrypt('same-value');
        const b = encrypt('same-value');
        expect(a).not.toBe(b);
        expect(decrypt(a)).toBe('same-value');
        expect(decrypt(b)).toBe('same-value');
    });

    test('returns null for empty/nullish plaintext', () => {
        expect(encrypt(null)).toBeNull();
        expect(encrypt(undefined)).toBeNull();
        expect(encrypt('')).toBeNull();
    });

    test('returns null when decrypting a nullish blob', () => {
        expect(decrypt(null)).toBeNull();
        expect(decrypt('')).toBeNull();
        expect(decrypt(undefined)).toBeNull();
    });

    test('throws a clear error when CREDENTIALS_ENCRYPTION_KEY is missing', () => {
        delete process.env.CREDENTIALS_ENCRYPTION_KEY;
        expect(() => encrypt('x')).toThrow('CREDENTIALS_ENCRYPTION_KEY ist nicht gesetzt');
    });

    test('throws a clear error for a malformed key length', () => {
        process.env.CREDENTIALS_ENCRYPTION_KEY = 'tooshort';
        expect(() => encrypt('x')).toThrow('32-Byte-Hex-String');
    });

    test('fails to decrypt with the wrong key (GCM auth tag mismatch)', () => {
        const blob = encrypt('secret');
        process.env.CREDENTIALS_ENCRYPTION_KEY = 'b'.repeat(64);
        expect(() => decrypt(blob)).toThrow();
    });
});
