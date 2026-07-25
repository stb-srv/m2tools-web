const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { requireAuth, requireRole } = require('../auth/middleware');

// Admin only routes
router.get('/modules', requireAuth, requireRole('admin'), controller.getModuleConfigs);
router.post('/modules/update', requireAuth, requireRole('admin'), controller.updateModuleConfig);

router.get('/users', requireAuth, requireRole('admin'), controller.getAllUsers);
router.post('/users/update', requireAuth, requireRole('admin'), controller.updateUserStatus);

router.get('/settings', requireAuth, requireRole('admin'), controller.getSystemSettings);
router.post('/settings/update', requireAuth, requireRole('admin'), controller.updateSystemSettings);

// Assets & System
router.get('/items', controller.getItems);
router.get('/changelogs', controller.getChangelogs);

module.exports = router;
