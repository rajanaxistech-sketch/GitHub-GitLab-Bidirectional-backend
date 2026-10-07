const GitHubProvider = require('./github.provider');
const GitLabProvider = require('./gitlab.provider');
const githubAccountRepository = require('../repositories/github-account.repository');
const gitlabAccountRepository = require('../repositories/gitlab-account.repository');
const { decrypt } = require('../utils/crypto.util');
const { BadRequestError, NotFoundError } = require('../utils/response');

class ProviderFactory {
  /**
   * Get GitHub provider for user
   * @param {string} userId
   * @param {string} [tokenOverride]
   */
  async getGitHubProvider(userId, tokenOverride = null) {
    if (tokenOverride) {
      return new GitHubProvider(tokenOverride);
    }

    const account = await githubAccountRepository.findByUserId(userId);
    if (!account || !account.isConnected || !account.accessToken) {
      throw new BadRequestError('GitHub account is not connected. Please connect your GitHub account first.');
    }

    const token = decrypt(account.accessToken);
    if (!token) {
      throw new BadRequestError('Failed to decrypt GitHub access token. Please reconnect GitHub.');
    }

    return new GitHubProvider(token);
  }

  /**
   * Get GitLab provider for user
   * @param {string} userId
   * @param {string} [tokenOverride]
   */
  async getGitLabProvider(userId, tokenOverride = null) {
    if (tokenOverride) {
      return new GitLabProvider(tokenOverride);
    }

    const account = await gitlabAccountRepository.findByUserId(userId);
    if (!account || !account.isConnected || !account.accessToken) {
      throw new BadRequestError('GitLab account is not connected. Please connect your GitLab account first.');
    }

    const token = decrypt(account.accessToken);
    if (!token) {
      throw new BadRequestError('Failed to decrypt GitLab access token. Please reconnect GitLab.');
    }

    return new GitLabProvider(token);
  }
}

module.exports = new ProviderFactory();
