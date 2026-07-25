const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { requireAuth, requireModuleAccess } = require('../auth/middleware');

router.get('/load', requireModuleAccess('mob_drop_editor'), controller.loadMobDrop);
router.post('/save', requireAuth, requireModuleAccess('mob_drop_editor'), controller.saveMobDrop);
router.post('/fix', requireModuleAccess('mob_drop_editor'), controller.fixMobDrop);

module.exports = router;
