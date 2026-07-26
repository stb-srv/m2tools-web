/**
 * M2-Tools – At-rest encryption for remote-server credentials
 * (SSH passwords/private keys, remote-DB passwords stored in
 * workspace_connections). AES-256-GCM, key from CREDENTIALS_ENCRYPTION_KEY.
 *
 * Unlike JWT_SECRET there is deliberately NO random-per-process fallback:
 * a fallback here would make already-stored ciphertexts permanently
 * undecryptable after every restart. Missing the key is a hard error.
 */
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey() {
    const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
    if (!raw) {
        throw new Error('CREDENTIALS_ENCRYPTION_KEY ist nicht gesetzt. Siehe .env.example.');
    }
    const key = Buffer.from(raw, 'hex');
    if (key.length !== 32) {
        throw new Error('CREDENTIALS_ENCRYPTION_KEY muss ein 32-Byte-Hex-String sein (64 Hex-Zeichen).');
    }
    return key;
}

function hasEncryptionKey() {
    return !!process.env.CREDENTIALS_ENCRYPTION_KEY;
}

function encrypt(plaintext) {
    if (plaintext === null || plaintext === undefined || plaintext === '') return null;
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

function decrypt(blob) {
    if (!blob) return null;
    const key = getKey();
    const data = Buffer.from(blob, 'base64');
    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
}

module.exports = { encrypt, decrypt, hasEncryptionKey };
