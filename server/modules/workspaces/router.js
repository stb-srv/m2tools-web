const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { requireAuth } = require('../auth/middleware');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.get('/', requireAuth, controller.list);
router.post('/', requireAuth, controller.create);
router.post('/select', requireAuth, controller.select);
router.get('/active', requireAuth, controller.getActive);
router.get('/:id', requireAuth, controller.getDetails);
router.delete('/:id', requireAuth, controller.remove);

// Workspace specific settings & uploads
router.post('/:id/upload/db', requireAuth, upload.single('file'), controller.uploadDb);
router.post('/:id/upload/icons', requireAuth, upload.single('file'), controller.uploadIcons);
router.post('/:id/upload/item_proto', requireAuth, upload.single('file'), controller.uploadItemProto);
router.post('/:id/upload/mob_proto', requireAuth, upload.single('file'), controller.uploadMobProto);

module.exports = router;
