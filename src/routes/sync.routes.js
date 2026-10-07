const { Router } = require('express');
const syncController = require('../controllers/sync.controller');
const asyncHandler = require('../middlewares/async.middleware');
const { authenticate } = require('../middlewares/auth.middleware');

const router = Router();

router.use(authenticate);

// Trigger syncs
router.post('/jobs', asyncHandler(syncController.getJobs.bind(syncController))); // In case called as post or get
router.get('/jobs', asyncHandler(syncController.getJobs.bind(syncController)));
router.get('/jobs/:id', asyncHandler(syncController.getJobById.bind(syncController)));
router.get('/jobs/:jobId/logs', asyncHandler(syncController.getJobLogs.bind(syncController)));
router.get('/logs', asyncHandler(syncController.getJobs.bind(syncController)));

router.post('/:mappingId', asyncHandler(syncController.triggerSync.bind(syncController)));
router.post('/:mappingId/github-to-gitlab', asyncHandler(syncController.syncGitHubToGitLab.bind(syncController)));
router.post('/:mappingId/gitlab-to-github', asyncHandler(syncController.syncGitLabToGitHub.bind(syncController)));

module.exports = router;
