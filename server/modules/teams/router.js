const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { requireAuth, requireRole } = require('../auth/middleware');

router.get('/', requireAuth, controller.list);
router.post('/create', requireAuth, controller.create);
router.get('/:id/details', requireAuth, controller.getDetails);
router.post('/addMember', requireAuth, controller.addMember);
router.post('/delete', requireAuth, controller.deleteTeam);
router.post('/removeMember', requireAuth, controller.removeMember);

// Admin-Specific Team Management
router.get('/admin/list', requireAuth, requireRole('admin'), controller.listAll);
router.post('/admin/delete', requireAuth, requireRole('admin'), controller.deleteTeam);

module.exports = router;
