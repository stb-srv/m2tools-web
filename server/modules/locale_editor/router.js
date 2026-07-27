const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { requireAuth, requireModuleAccess } = require('../auth/middleware');

router.get('/load', requireModuleAccess('locale_editor'), controller.loadLocale);
router.post('/save', requireAuth, requireModuleAccess('locale_editor'), controller.saveLocale);

module.exports = router;
