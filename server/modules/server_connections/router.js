const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { requireAuth, requireModuleAccess } = require('../auth/middleware');

const gate = [requireAuth, requireModuleAccess('server_connections')];

router.get('/:workspaceId', ...gate, controller.get);
router.put('/:workspaceId', ...gate, controller.upsert);
router.post('/:workspaceId/test', ...gate, controller.testConnection);
router.post('/:workspaceId/deploy-quest', ...gate, controller.deployQuest);
router.post('/:workspaceId/deploy-cube', ...gate, controller.deployCube);
router.post('/:workspaceId/command', ...gate, controller.runCommand);
router.post('/:workspaceId/db/pull', ...gate, controller.dbPull);
router.post('/:workspaceId/db/push', ...gate, controller.dbPush);
router.post('/:workspaceId/forget-host-key', ...gate, controller.forgetHostKey);
router.get('/:workspaceId/audit-log', ...gate, controller.getAuditLog);

module.exports = router;
