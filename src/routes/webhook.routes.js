const { Router } = require('express');
const webhookController = require('../controllers/webhook.controller');
const asyncHandler = require('../middlewares/async.middleware');

const router = Router();

// Webhook endpoints are public (protected via provider signature / token checks)
router.post('/github', asyncHandler(webhookController.handleGitHubWebhook.bind(webhookController)));
router.post('/gitlab', asyncHandler(webhookController.handleGitLabWebhook.bind(webhookController)));

module.exports = router;
