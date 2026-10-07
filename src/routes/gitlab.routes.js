const { Router } = require('express');
const gitlabController = require('../controllers/gitlab.controller');
const asyncHandler = require('../middlewares/async.middleware');
const { authenticate } = require('../middlewares/auth.middleware');

const router = Router();

// OAuth Connect & Callback
router.get('/connect', authenticate, asyncHandler(gitlabController.getConnectUrl.bind(gitlabController)));
router.get('/callback', asyncHandler(gitlabController.handleCallback.bind(gitlabController)));
router.post('/connect-pat', authenticate, asyncHandler(gitlabController.connectWithToken.bind(gitlabController)));

// Status & Account operations
router.get('/status', authenticate, asyncHandler(gitlabController.getStatus.bind(gitlabController)));
router.post('/disconnect', authenticate, asyncHandler(gitlabController.disconnect.bind(gitlabController)));

// Repository operations
router.get('/repositories', authenticate, asyncHandler(gitlabController.getRepositories.bind(gitlabController)));
router.get('/repositories/:projectId/branches', authenticate, asyncHandler(gitlabController.getBranches.bind(gitlabController)));
router.post('/repositories', authenticate, asyncHandler(gitlabController.createRepository.bind(gitlabController)));

module.exports = router;
