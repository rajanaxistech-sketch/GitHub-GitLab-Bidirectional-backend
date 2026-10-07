const { Router } = require('express');
const githubController = require('../controllers/github.controller');
const asyncHandler = require('../middlewares/async.middleware');
const { authenticate } = require('../middlewares/auth.middleware');

const router = Router();

// OAuth Connect & Callback
router.get('/connect', authenticate, asyncHandler(githubController.getConnectUrl.bind(githubController)));
router.get('/callback', asyncHandler(githubController.handleCallback.bind(githubController)));
router.post('/connect-pat', authenticate, asyncHandler(githubController.connectWithToken.bind(githubController)));

// Status & Account operations
router.get('/status', authenticate, asyncHandler(githubController.getStatus.bind(githubController)));
router.post('/disconnect', authenticate, asyncHandler(githubController.disconnect.bind(githubController)));

// Repository operations
router.get('/repositories', authenticate, asyncHandler(githubController.getRepositories.bind(githubController)));
router.get('/repositories/:owner/:repo/branches', authenticate, asyncHandler(githubController.getBranches.bind(githubController)));
router.post('/repositories', authenticate, asyncHandler(githubController.createRepository.bind(githubController)));

module.exports = router;
