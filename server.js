const express = require('express');

const path = require('path');

const fs = require('fs');

const cors = require('cors');

const helmet = require('helmet');

const rateLimit = require('express-rate-limit');

require('dotenv').config();

// Loads any secrets/config the in-app setup wizard has previously
// persisted (server/modules/setup/) onto process.env - must happen before
// anything else requires a module that reads those vars (auth middleware,
// secretsCrypto, mailer, ...). Real env vars always take priority.
require('./server/config/runtimeConfig');





const app = express();

const PORT = process.env.PORT || 3001;

// --- Global Request Logging ---
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[HTTP] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
    });
    next();
});



// ── Security Hardening ──────────────────────────────────

// Helmet adds secure HTTP headers (HSTS, CSP, XSS-Filter, etc.)

app.use(helmet({

    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            // The Vue frontend (frontend/) has zero inline <script> tags or
            // inline event-handler attributes - it's 100% externally bundled
            // JS, so scriptSrc no longer needs 'unsafe-inline'. jszip (used by
            // the tga_converter module) is now an npm dependency bundled with
            // the app, not the CDN script the old vanilla frontend loaded, so
            // cdnjs.cloudflare.com is no longer needed here either.
            scriptSrc: ["'self'"],
            // Vue's :style bindings render as inline style="..." attributes,
            // which CSP's style-src still governs - 'unsafe-inline' stays
            // required here (no inline <script> risk is introduced by this,
            // since scriptSrc is separate and already locked down above).
            // shared.css @imports Google Fonts' CSS (fonts.googleapis.com),
            // which in turn references the actual font files on
            // fonts.gstatic.com (below) - both were missing from this CSP
            // pre-Vue-migration too, silently breaking the font and
            // logging a CSP violation on every single page load.
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            imgSrc: ["'self'", 'data:'],
            fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"]
        }
    },

    crossOriginEmbedderPolicy: false

}));



// Rate Limiting: Prevent Brute-Force & DoS

const apiLimiter = rateLimit({

    windowMs: 15 * 60 * 1000, // 15 minutes

    max: 200, // Limit each IP to 200 requests per window

    standardHeaders: true,

    legacyHeaders: false,

    message: { error: 'Zu viele Anfragen vom selben Client. Bitte warte 15 Minuten.' }

});



const authLimiter = rateLimit({

    windowMs: 10 * 60 * 1000, // 10 minutes

    max: 25, // Only 25 attempts per 10 mins (Login/Register)

    standardHeaders: true,

    message: { error: 'Zu viele Login-Versuche. Bitte warte 10 Minuten.' }

});



// CORS: restrict to known origins via ALLOWED_ORIGINS (comma-separated) in .env.
// Falls back to permissive (reflect any origin) for local development if unset.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

if (allowedOrigins.length > 0) {
    app.use(cors({
        origin(origin, callback) {
            // No Origin header (e.g. same-origin requests, curl) is always allowed.
            if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
            callback(new Error('Not allowed by CORS'));
        }
    }));
} else {
    if (process.env.NODE_ENV === 'production') {
        console.warn('\x1b[33m%s\x1b[0m', '[Server] ALLOWED_ORIGINS ist nicht gesetzt - CORS erlaubt aktuell jede Origin. Für Produktion in .env setzen, z.B. ALLOWED_ORIGINS=https://deine-domain.de');
    }
    app.use(cors());
}

app.use(express.json({ limit: '10mb' }));



// Health check for uptime monitoring / container orchestration - deliberately
// mounted before the /api/ rate limiter and any auth, and does a real DB
// round-trip so a broken DB connection shows up as unhealthy, not just "server
// process is alive".
app.get('/health', async (req, res) => {
    try {
        const db = require('./server/config/database');
        await db.query('SELECT 1');
        res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
    } catch (err) {
        res.status(503).json({ status: 'error', error: err.message });
    }
});



// Apply rate limiting to all /api/ routes

app.use('/api/', apiLimiter);



// ── Shared Config & Secrets ───────────────────────────

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {

    console.error('\x1b[31m%s\x1b[0m', 'CRITICAL SECURITY WARNING: No JWT_SECRET set in .env for production! Sessions will not survive a restart.');

}



// Optional: External icons path (set ICONS_PATH in .env if you have icon files)

const iconsPath = process.env.ICONS_PATH;

if (iconsPath && fs.existsSync(iconsPath)) {

    console.log('[Static] Serving external icons from:', iconsPath);

    app.use('/assets/items', express.static(iconsPath));

}





// Static files from local public/

app.use(express.static('public'));

// Built Vue frontend (frontend/, built via `npm run build` into public/dist/).
// Mounted at the site root so the hashed asset paths emitted by Vite
// (e.g. /app-assets/index-XXXX.js) resolve correctly - public/dist/ is one
// level deeper than public/, so express.static('public') alone can't reach
// them. build.assetsDir is set to 'app-assets' (not Vite's default
// "assets") specifically so this never collides with public/assets/items/.
app.use(express.static(path.join(__dirname, 'public/dist')));



// ── API Routes (Dynamic Loader) ───────────────────────
const { getModuleRegistry } = require('./server/utils/moduleLoader');

const registry = getModuleRegistry();
const loadedModules = [];
const failedModules = [];
const modulesBaseDir = path.join(__dirname, 'server/modules');

fs.readdirSync(modulesBaseDir).forEach(folder => {
    const routerPath = path.join(modulesBaseDir, folder, 'router.js');
    const modConfig = registry.find(m => m.id === folder);
    const name = modConfig ? modConfig.name : folder;
    const prefix = modConfig ? modConfig.api : `/api/${folder}`;

    if (fs.existsSync(routerPath)) {
        try {
            const router = require(routerPath);
            if (folder === 'auth') {
                app.use(prefix + '/login', authLimiter);
                app.use(prefix + '/register', authLimiter);
                // Sends an email on every hit - same abuse potential as
                // login/register (credential stuffing aside, this one can be
                // used to spam a victim's inbox or run up SMTP costs), so it
                // gets the stricter limiter too instead of just apiLimiter.
                app.use(prefix + '/resend-verification', authLimiter);
            }
            if (folder === 'setup') {
                // Creates the first account, same abuse profile as register.
                app.use(prefix + '/init', authLimiter);
            }
            if (prefix) {
                app.use(prefix, router);
                loadedModules.push({ name, prefix });
            } else {
                console.warn(`[Server] Module ${name} has no API prefix defined.`);
            }
        } catch (err) {
            failedModules.push({ name, path: routerPath, error: err.message });
        }
    } else if (modConfig) {
        // UI Only module
        loadedModules.push({ name, prefix: '(UI Only)' });
    }
});



// ── Start ───────────────────────────────────────────────

// ── SPA Fallback (Vue frontend build in public/dist) ───
// express.static('public') above already serves public/dist/* (it's a
// subfolder of public/), public/assets/*, public/basic/*, and public/i18n/*
// directly. This just serves the built index.html for any other path so
// client-side routing (vue-router, createWebHistory) works on refresh/
// deep-link, without intercepting API calls or static asset 404s.
app.get(/^\/(?!api\/|assets\/|basic\/|i18n\/|dist\/).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public/dist/index.html'));
});

// ── Global Error Handler ───────────────────────────────
const ApiError = require('./server/utils/apiError');

app.use((err, req, res, next) => {
    console.error(`[Error] ${err.name}: ${err.message}`);
    if (err.stack) console.debug(err.stack); // Stack-trace for internal debugging
    
    // Check if it's our custom ApiError
    if (err instanceof ApiError) {
        return res.status(err.statusCode).json({
            error: err.message,
            details: err.details,
            code: err.statusCode
        });
    }

    // Default: Generic 500
    res.status(500).json({
        error: 'Ein unerwarteter Serverfehler ist aufgetreten.',
        message: process.env.NODE_ENV === 'production' ? 'Interner Fehler' : err.message
    });
});

// Fail fast if stored remote-server credentials (SSH/DB, see the
// "Server-Verbindung" feature) exist but the key to decrypt them is
// missing - continuing would silently make those credentials permanently
// unusable, and any newly saved ones unrecoverable after the next restart.
async function verifyCredentialsEncryptionKey() {
    if (process.env.CREDENTIALS_ENCRYPTION_KEY) return;
    try {
        const db = require('./server/config/database');
        const [rows] = await db.query('SELECT COUNT(*) as c FROM workspace_connections');
        if ((rows[0]?.c || 0) > 0) {
            console.error('\x1b[31m%s\x1b[0m', '[Boot] FATAL: workspace_connections enthält Einträge, aber CREDENTIALS_ENCRYPTION_KEY ist nicht gesetzt.');
            console.error('\x1b[31m%s\x1b[0m', '[Boot]   Gespeicherte SSH/DB-Zugangsdaten können ohne diesen Schlüssel nicht entschlüsselt werden.');
            console.error('\x1b[31m%s\x1b[0m', '[Boot]   Bitte CREDENTIALS_ENCRYPTION_KEY in .env setzen (siehe .env.example) und neu starten.');
            process.exit(1);
        }
    } catch (err) {
        // Table doesn't exist yet (fresh install, schema not migrated) - nothing to protect yet.
    }
}

(async () => {

await verifyCredentialsEncryptionKey();

app.listen(PORT, async () => {

    console.log(`\n  ⚔️  M2-Tools running at http://localhost:${PORT}`);

    





    if (failedModules.length === 0) {

        console.log('\x1b[32m%s\x1b[0m', `  ✅ Alle Module (${loadedModules.length}) erfolgreich geladen.\n`);

    } else {

        console.log('\x1b[33m%s\x1b[0m', `  ⚠️  System-Warnung: Es konnten nicht alle Module geladen werden (${loadedModules.length}/${loadedModules.length + failedModules.length} erfolgreich).`);

        console.log('\x1b[33m%s\x1b[0m', `     Die Seite geht trotzdem nur das modul nicht:`);

        failedModules.forEach(m => {

            console.log('\x1b[31m%s\x1b[0m', `     - ${m.name} (Fehler: ${m.error})`);

        });

        console.log(' \n');

    }



});

})();