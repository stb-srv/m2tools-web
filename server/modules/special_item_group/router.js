const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { requireAuth, requireModuleAccess } = require('../auth/middleware');

router.get('/load', requireModuleAccess('special_item_group'), controller.loadSpecialItemGroup);
router.post('/save', requireAuth, requireModuleAccess('special_item_group'), controller.saveSpecialItemGroup);

module.exports = router;
