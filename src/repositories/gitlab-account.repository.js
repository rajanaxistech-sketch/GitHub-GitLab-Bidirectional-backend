const BaseRepository = require('./base.repository');
const { GitLabAccountEntity } = require('../entities');

class GitLabAccountRepository extends BaseRepository {
  constructor() {
    super(GitLabAccountEntity);
  }

  async findByUserId(userId) {
    return this.findOne({ userId });
  }

  async findByGitlabId(gitlabId) {
    return this.findOne({ gitlabId: String(gitlabId) });
  }
}

module.exports = new GitLabAccountRepository();
