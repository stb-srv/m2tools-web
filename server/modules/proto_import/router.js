const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { requireAuth, requireRole, requireModuleAccess } = require('../auth/middleware');

// Import proto data (access controlled)
router.post('/items', requireAuth, requireModuleAccess('proto_import'), controller.importItems);
router.post('/mobs', requireAuth, requireModuleAccess('proto_import'), controller.importMobs);

// Get stats
router.get('/stats', requireAuth, requireModuleAccess('proto_import'), controller.getStats);

module.exports = router;
