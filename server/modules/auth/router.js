const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { requireAuth, requireRole, optionalAuth } = require('./middleware');
const db = require('../../config/database'); // Added for module status route

// ── Public Routes ────────────────────────────────────
router.post('/login', controller.login);
router.post('/register', controller.registerPublic);          // Public registration
router.get('/verify', controller.verifyEmail);                // Email verification
router.post('/resend-verification', controller.resendVerification);

// Module status (public metadata + access levels)
router.get('/modules/status', async (req, res) => {
    try {
        const { getModuleRegistry } = require('../../utils/moduleLoader');
        const registry = getModuleRegistry();
        const [dbConfigs] = await db.query('SELECT * FROM modules_config');
        
        // Load changelogs to get versions
        let changelogs = [];
        const logPath = require('path').join(__dirname, '../../data/changelogs.json');
        if (require('fs').existsSync(logPath)) {
            changelogs = JSON.parse(require('fs').readFileSync(logPath, 'utf8'));
        }

        const merged = registry.map(m => {
            const config = dbConfigs.find(c => c.id === m.id);
            const moduleLogs = changelogs.filter(cl => cl.moduleId === m.id);
            const latestLog = moduleLogs.sort((a, b) => new Date(b.date) - new Date(a.date))[0];

            return {
                ...m,
                access_level: config?.access_level || m.defaultAccess,
                is_visible_guests: config ? !!config.is_visible_guests : true,
                created_at: config?.created_at || null,
                version: latestLog?.version || '1.0.0'
            };
        });
        res.json(merged);
    } catch (e) { 
        console.error('[Auth-Router] status error:', e);
        res.json([]); 
    }
});

// ── Authenticated Routes ─────────────────────────────
router.get('/me', requireAuth, controller.getMe);
router.put('/account', requireAuth, controller.updateAccount); // Account settings

// ── Admin-only Routes ────────────────────────────────
router.post('/admin/register', requireAuth, requireRole('admin'), controller.register);
router.get('/users', requireAuth, requireRole('admin'), controller.listUsers);
router.put('/users/:id', requireAuth, requireRole('admin'), controller.updateUser);
router.delete('/users/:id', requireAuth, requireRole('admin'), controller.deleteUser);

module.exports = router;
