const BaseRepository = require('./base.repository');
const { SyncJobEntity } = require('../entities');

class SyncJobRepository extends BaseRepository {
  constructor() {
    super(SyncJobEntity);
  }

  async findByMappingId(mappingId, limit = 50) {
    return this.getRepository().find({
      where: { mappingId },
      order: { createdAt: 'DESC' },
      take: limit,
      relations: ['mapping', 'logs'],
    });
  }

  async findByUserId(userId, limit = 50) {
    return this.getRepository().find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      relations: ['mapping'],
    });
  }

  async findActiveJobForMapping(mappingId) {
    return this.getRepository().findOne({
      where: {
        mappingId,
        status: 'RUNNING',
      },
    });
  }

  async findRecentJobByTransactionOrCommit(mappingId, commitSha) {
    if (!commitSha) return null;
    return this.getRepository().findOne({
      where: [
        { mappingId, sourceCommit: commitSha },
        { mappingId, targetCommit: commitSha },
      ],
      order: { createdAt: 'DESC' },
    });
  }
}

module.exports = new SyncJobRepository();
