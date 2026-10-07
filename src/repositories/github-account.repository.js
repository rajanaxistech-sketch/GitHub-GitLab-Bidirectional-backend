const BaseRepository = require('./base.repository');
const { GitHubAccountEntity } = require('../entities');

class GitHubAccountRepository extends BaseRepository {
  constructor() {
    super(GitHubAccountEntity);
  }

  async findByUserId(userId) {
    return this.findOne({ userId });
  }

  async findByGithubId(githubId) {
    return this.findOne({ githubId: String(githubId) });
  }
}

module.exports = new GitHubAccountRepository();
