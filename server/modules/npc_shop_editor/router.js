const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { requireAuth, requireModuleAccess } = require('../auth/middleware');

const gate = requireModuleAccess('npc_shop_editor');

router.get('/shop/load', gate, controller.loadShop);
router.post('/shop/save', requireAuth, gate, controller.saveShop);
router.get('/npc/load', gate, controller.loadNpc);
router.post('/npc/save', requireAuth, gate, controller.saveNpc);

module.exports = router;
