const BaseRepository = require('./base.repository');
const { SyncLogEntity } = require('../entities');

class SyncLogRepository extends BaseRepository {
  constructor() {
    super(SyncLogEntity);
  }

  async findByJobId(jobId) {
    return this.getRepository().find({
      where: { jobId },
      order: { timestamp: 'ASC' },
    });
  }

  async createLog(jobId, mappingId, userId, level, message, metadata = null) {
    const log = this.create({
      jobId,
      mappingId,
      userId,
      level,
      message,
      metadata,
      timestamp: new Date(),
    });
    return this.save(log);
  }
}

module.exports = new SyncLogRepository();
