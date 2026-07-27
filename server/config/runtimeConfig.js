/**
 * M2-Tools – Runtime config persisted outside of .env
 *
 * Lets the in-app setup wizard (server/modules/setup/) generate and persist
 * JWT_SECRET/CREDENTIALS_ENCRYPTION_KEY/etc. through the browser instead of
 * requiring a hand-edited .env file - useful for PaaS deploys (Coolify)
 * where editing files on the host isn't the normal workflow.
 *
 * Must be required at the very top of server.js, before any other module
 * (env vars it applies need to be visible to every later require()).
 *
 * Real environment variables always win over the persisted file - an admin
 * who prefers setting JWT_SECRET/CREDENTIALS_ENCRYPTION_KEY directly (e.g.
 * via Coolify's own env var UI) gets the exact same behavior as before this
 * file existed, and the setup wizard is automatically skipped (needsSetup()
 * is false as soon as both are present from any source).
 */
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'runtime-config.json');

// Keys the setup wizard is allowed to persist/apply. Deliberately a
// fixed allowlist rather than "whatever's in the file" - keeps this from
// silently becoming a way to inject arbitrary env vars via a writable file.
const MANAGED_KEYS = [
    'JWT_SECRET',
    'CREDENTIALS_ENCRYPTION_KEY',
    'ALLOWED_ORIGINS',
    'BASE_URL',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM_NAME',
    'SMTP_FROM'
];

function readConfigFile() {
    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        return {};
    }
}

/**
 * Applies any persisted values onto process.env, without overwriting
 * already-set real env vars. Call once, at boot.
 */
function applyToEnv() {
    const stored = readConfigFile();
    for (const key of MANAGED_KEYS) {
        if (!process.env[key] && stored[key]) {
            process.env[key] = stored[key];
        }
    }
}

/**
 * The two secrets that gate the setup wizard. JWT_SECRET already has a
 * safe (if non-persistent) random fallback elsewhere (auth/middleware.js),
 * but that fallback is never written back to process.env, so checking it
 * here still correctly reflects "was this ever actually configured".
 */
function needsSetup() {
    return !process.env.JWT_SECRET || !process.env.CREDENTIALS_ENCRYPTION_KEY;
}

/**
 * Merges new values into the persisted file and applies them to the
 * current process's env immediately. Only MANAGED_KEYS are accepted;
 * anything else in `values` is silently ignored.
 */
function saveConfig(values) {
    const current = readConfigFile();
    const next = { ...current };

    for (const key of MANAGED_KEYS) {
        if (values[key]) {
            next[key] = values[key];
            process.env[key] = values[key];
        }
    }

    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
}

/**
 * Returns the current value (from process.env, the live source of truth)
 * for a single managed key, or '' if unset/not a managed key. Used by the
 * admin SMTP settings screen to show what's currently configured without
 * exposing JWT_SECRET/CREDENTIALS_ENCRYPTION_KEY to any API response.
 */
function getManagedValue(key) {
    if (!MANAGED_KEYS.includes(key)) return '';
    return process.env[key] || '';
}

applyToEnv();

module.exports = { needsSetup, saveConfig, getManagedValue, CONFIG_PATH };
