const BaseRepository = require('./base.repository');
const { RepositoryMappingEntity } = require('../entities');

class RepositoryMappingRepository extends BaseRepository {
  constructor() {
    super(RepositoryMappingEntity);
  }

  async findByUserId(userId) {
    return this.getRepository().find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByGithubRepo(fullName) {
    return this.getRepository().find({
      where: { githubRepoFullName: fullName },
    });
  }

  async findByGitlabProject(fullPath) {
    return this.getRepository().find({
      where: { gitlabProjectFullPath: fullPath },
    });
  }

  async findExistingMapping(userId, githubRepoFullName, gitlabProjectFullPath) {
    return this.getRepository().findOne({
      where: {
        userId,
        githubRepoFullName,
        gitlabProjectFullPath,
      },
    });
  }
}

module.exports = new RepositoryMappingRepository();
