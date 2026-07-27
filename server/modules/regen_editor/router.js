const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { requireAuth, requireModuleAccess } = require('../auth/middleware');

router.get('/load', requireModuleAccess('regen_editor'), controller.loadRegen);
router.post('/save', requireAuth, requireModuleAccess('regen_editor'), controller.saveRegen);

module.exports = router;
