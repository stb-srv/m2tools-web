const express = require('express');
const router = express.Router();
const { requireAuth, optionalAuth, requireRole, requireModuleAccess } = require('../auth/middleware');
const controller = require('./controller');

// Shared resources (Accessible to any logged-in user or guest for images)
router.get('/items/:vnum/icon', optionalAuth, controller.getItemIcon);
router.get('/items/search', requireAuth, controller.searchItems);
router.post('/items/names', requireAuth, controller.getItemNames);
router.get('/npcs/search', requireAuth, controller.searchNpcs);

// File operations
router.get('/load', requireModuleAccess('cube_editor'), controller.loadCube);
router.post('/save', requireAuth, requireModuleAccess('cube_editor'), controller.saveCube);
router.post('/export', requireAuth, requireModuleAccess('cube_editor'), controller.saveCube); // Alias

module.exports = router;
