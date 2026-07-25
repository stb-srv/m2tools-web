const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { requireAuth, requireModuleAccess } = require('../auth/middleware');

// Shared mob search (Accessible to any logged-in user)
router.get('/mobs/search', requireAuth, controller.searchMobs);

// Quest file operations
router.post('/save', requireAuth, requireModuleAccess('quest_builder'), controller.saveQuest);
router.get('/load', requireModuleAccess('quest_builder'), controller.loadQuest);

module.exports = router;
