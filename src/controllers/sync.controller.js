const syncEngineService = require('../services/sync-engine.service');
const syncJobRepository = require('../repositories/sync-job.repository');
const syncLogRepository = require('../repositories/sync-log.repository');
const repositoryMappingService = require('../services/repository-mapping.service');
const { sendSuccess, NotFoundError, ForbiddenError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

class SyncController {
  /**
   * Trigger synchronization for a repository mapping
   */
  async triggerSync(req, res) {
    const { mappingId } = req.params;
    // Verify user owns the mapping
    await repositoryMappingService.getMappingById(req.user.id, mappingId);

    const job = await syncEngineService.triggerSync(mappingId, {
      triggerType: 'MANUAL',
      ...req.body,
    });

    return sendSuccess(
      res,
      'Synchronization job enqueued successfully',
      {
        jobId: job.id,
        status: job.status,
        direction: job.direction,
        mappingId: job.mappingId,
        createdAt: job.createdAt,
      },
      HTTP_STATUS.ACCEPTED
    );
  }

  /**
   * Force GitHub to GitLab synchronization
   */
  async syncGitHubToGitLab(req, res) {
    const { mappingId } = req.params;
    await repositoryMappingService.getMappingById(req.user.id, mappingId);

    const job = await syncEngineService.triggerSync(mappingId, {
      direction: 'github_to_gitlab',
      triggerType: 'MANUAL',
      sourcePlatform: 'github',
      destinationPlatform: 'gitlab',
    });

    return sendSuccess(
      res,
      'GitHub to GitLab sync enqueued',
      { jobId: job.id, status: job.status },
      HTTP_STATUS.ACCEPTED
    );
  }

  /**
   * Force GitLab to GitHub synchronization
   */
  async syncGitLabToGitHub(req, res) {
    const { mappingId } = req.params;
    await repositoryMappingService.getMappingById(req.user.id, mappingId);

    const job = await syncEngineService.triggerSync(mappingId, {
      direction: 'gitlab_to_github',
      triggerType: 'MANUAL',
      sourcePlatform: 'gitlab',
      destinationPlatform: 'github',
    });

    return sendSuccess(
      res,
      'GitLab to GitHub sync enqueued',
      { jobId: job.id, status: job.status },
      HTTP_STATUS.ACCEPTED
    );
  }

  /**
   * Get all sync jobs for current user
   */
  async getJobs(req, res) {
    const { mappingId, limit } = req.query;
    let jobs;

    if (mappingId) {
      await repositoryMappingService.getMappingById(req.user.id, mappingId);
      jobs = await syncJobRepository.findByMappingId(mappingId, limit ? parseInt(limit, 10) : 50);
    } else {
      jobs = await syncJobRepository.findByUserId(req.user.id, limit ? parseInt(limit, 10) : 50);
    }

    return sendSuccess(res, 'Sync jobs retrieved successfully', jobs);
  }

  /**
   * Get single job by ID with logs
   */
  async getJobById(req, res) {
    const job = await syncJobRepository.findById(req.params.id, {
      relations: ['mapping', 'logs'],
    });

    if (!job) {
      throw new NotFoundError('Sync job not found');
    }

    if (job.userId !== req.user.id) {
      throw new ForbiddenError('You do not have permission to view this sync job');
    }

    return sendSuccess(res, 'Sync job details retrieved', job);
  }

  /**
   * Get logs for a job
   */
  async getJobLogs(req, res) {
    const { jobId } = req.params;
    const job = await syncJobRepository.findById(jobId);
    if (!job) {
      throw new NotFoundError('Sync job not found');
    }
    if (job.userId !== req.user.id) {
      throw new ForbiddenError('You do not have permission to view these logs');
    }

    const logs = await syncLogRepository.findByJobId(jobId);
    return sendSuccess(res, 'Sync logs retrieved', logs);
  }
}

module.exports = new SyncController();
