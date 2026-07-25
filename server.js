const express = require('express');

const path = require('path');

const fs = require('fs');

const cors = require('cors');

const helmet = require('helmet');

const rateLimit = require('express-rate-limit');

require('dotenv').config();







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
            // Frontend uses inline <script>/<style> blocks throughout - 'unsafe-inline'
            // is required until those are moved into external files. CSP still blocks
            // untrusted external hosts, framing, and <object>/<embed> exfiltration.
            scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
            fontSrc: ["'self'", 'data:'],
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