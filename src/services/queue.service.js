const EventEmitter = require('events');
const logger = require('../utils/logger');
const syncJobRepository = require('../repositories/sync-job.repository');
const syncLogRepository = require('../repositories/sync-log.repository');

class QueueService extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.runningJobs = new Map(); // jobId -> Promise
    this.activeMappings = new Set(); // mappingId set to prevent concurrent syncs on same mapping
    this.concurrency = 3;
    this.isProcessing = false;
  }

  /**
   * Enqueue a sync job
   * @param {Object} jobParams
   * @param {Function} handler - async function(job, logFn) => result
   */
  async enqueue(jobParams, handler) {
    const jobRecord = syncJobRepository.create({
      mappingId: jobParams.mappingId,
      userId: jobParams.userId,
      direction: jobParams.direction,
      triggerType: jobParams.triggerType || 'MANUAL',
      status: 'PENDING',
      sourcePlatform: jobParams.sourcePlatform,
      destinationPlatform: jobParams.destinationPlatform,
      sourceBranch: jobParams.sourceBranch || 'main',
      targetBranch: jobParams.targetBranch || 'main',
      transactionId: jobParams.transactionId || `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    });

    const savedJob = await syncJobRepository.save(jobRecord);

    await syncLogRepository.createLog(
      savedJob.id,
      savedJob.mappingId,
      savedJob.userId,
      'INFO',
      `Sync job enqueued [Trigger: ${savedJob.triggerType}, Direction: ${savedJob.direction}]`
    );

    this.queue.push({
      jobId: savedJob.id,
      mappingId: savedJob.mappingId,
      userId: savedJob.userId,
      params: jobParams,
      handler,
    });

    // Trigger process loop
    this.processNext();

    return savedJob;
  }

  /**
   * Process next jobs in queue
   */
  async processNext() {
    if (this.runningJobs.size >= this.concurrency || this.queue.length === 0) {
      return;
    }

    // Find the first job whose mapping is not currently actively running
    const jobIndex = this.queue.findIndex((j) => !this.activeMappings.has(j.mappingId));
    if (jobIndex === -1) {
      return;
    }

    const [item] = this.queue.splice(jobIndex, 1);
    this.activeMappings.add(item.mappingId);

    const taskPromise = this.executeJob(item).finally(() => {
      this.runningJobs.delete(item.jobId);
      this.activeMappings.delete(item.mappingId);
      this.processNext();
    });

    this.runningJobs.set(item.jobId, taskPromise);
  }

  /**
   * Execute single job with database logging
   */
  async executeJob(item) {
    const { jobId, mappingId, userId, handler } = item;
    const job = await syncJobRepository.findById(jobId);
    if (!job) return;

    job.status = 'RUNNING';
    job.startedAt = new Date();
    await syncJobRepository.save(job);

    const logFn = async (level, message, metadata = null) => {
      try {
        await syncLogRepository.createLog(jobId, mappingId, userId, level, message, metadata);
      } catch (err) {
        logger.error('Failed to write sync log:', err);
      }
    };

    await logFn('INFO', `Starting synchronization worker for job ${jobId}`);

    try {
      const result = await handler(job, logFn);

      job.status = result?.status || 'SUCCESS';
      job.completedAt = new Date();
      job.sourceCommit = result?.sourceCommit || job.sourceCommit;
      job.targetCommit = result?.targetCommit || job.targetCommit;
      job.changesCount = result?.changesCount || 0;
      job.filesCount = result?.filesCount || 0;
      job.details = result?.details || null;
      job.errorMessage = null;
      await syncJobRepository.save(job);

      await logFn('INFO', `Synchronization completed successfully with status: ${job.status}`, {
        changesCount: job.changesCount,
        filesCount: job.filesCount,
        sourceCommit: job.sourceCommit,
        targetCommit: job.targetCommit,
      });

      this.emit('job:completed', job);
    } catch (error) {
      logger.error(`Sync Job ${jobId} failed:`, error);

      const isConflict = error.name === 'ConflictError' || error.isConflict;
      job.status = isConflict ? 'CONFLICT' : 'FAILED';
      job.completedAt = new Date();
      job.errorMessage = error.message;
      job.details = error.details || { error: error.message };
      await syncJobRepository.save(job);

      await logFn(
        isConflict ? 'WARN' : 'ERROR',
        `Synchronization failed: ${error.message}`,
        { error: error.message, stack: error.stack, details: error.details }
      );

      this.emit('job:failed', { job, error });
    }
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      pendingJobs: this.queue.length,
      runningJobs: this.runningJobs.size,
      activeMappingsCount: this.activeMappings.size,
    };
  }
}

module.exports = new QueueService();
