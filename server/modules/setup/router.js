const express = require('express');
const router = express.Router();
const controller = require('./controller');

// No auth guard on either route, deliberately - there's no admin account
// yet when this module is reachable. Both endpoints are self-locking via
// runtimeConfig.needsSetup() once setup has already completed once (see
// controller.js) - not registered in the module registry (no module.json
// here), so it never appears on the dashboard or in /api/auth/modules/status.
router.get('/status', controller.status);
router.post('/init', controller.init);

module.exports = router;
