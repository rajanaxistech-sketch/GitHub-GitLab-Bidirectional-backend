const { Router } = require('express');
const healthController = require('../controllers/health.controller');

const router = Router();

/**
 * @route GET /api/v1/health
 * @desc Get API and database health status
 * @access Public
 */
router.get('/', healthController.checkHealth);

module.exports = router;
