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
router.post('/2fa/login', controller.verify2FALogin);          // Exchange pending token + TOTP/recovery code for a session
router.post('/forgot-password', controller.forgotPassword);
router.post('/reset-password', controller.resetPassword);

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

// 2FA setup (own account, admin only per product decision - enforced client-side
// in Account.vue; the endpoints themselves just require a valid session)
router.get('/2fa/status', requireAuth, controller.get2FAStatus);
router.post('/2fa/setup', requireAuth, requireRole('admin'), controller.setup2FA);
router.post('/2fa/verify-setup', requireAuth, requireRole('admin'), controller.verify2FASetup);
router.post('/2fa/disable', requireAuth, controller.disable2FA);

// ── Admin-only Routes ────────────────────────────────
router.post('/admin/register', requireAuth, requireRole('admin'), controller.register);
router.get('/users', requireAuth, requireRole('admin'), controller.listUsers);
router.put('/users/:id', requireAuth, requireRole('admin'), controller.updateUser);
router.delete('/users/:id', requireAuth, requireRole('admin'), controller.deleteUser);
router.post('/users/:id/force-logout', requireAuth, requireRole('admin'), controller.forceLogout);

module.exports = router;
