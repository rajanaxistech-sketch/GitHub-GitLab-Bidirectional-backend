const GitHubProvider = require('./github.provider');
const GitLabProvider = require('./gitlab.provider');
const githubAccountRepository = require('../repositories/github-account.repository');
const gitlabAccountRepository = require('../repositories/gitlab-account.repository');
const env = require('../config/env');
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

    try {
      const account = await githubAccountRepository.findByUserId(userId);
      if (account && account.isConnected && account.accessToken) {
        const token = decrypt(account.accessToken);
        if (token) {
          return new GitHubProvider(token);
        }
      }
    } catch {
      // Database not ready or record not found
    }

    if (env.github.token) {
      return new GitHubProvider(env.github.token);
    }

    throw new BadRequestError('GitHub account is not connected. Please connect your GitHub account first.');
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

    try {
      const account = await gitlabAccountRepository.findByUserId(userId);
      if (account && account.isConnected && account.accessToken) {
        const token = decrypt(account.accessToken);
        if (token) {
          return new GitLabProvider(token);
        }
      }
    } catch {
      // Database not ready or record not found
    }

    if (env.gitlab.token) {
      return new GitLabProvider(env.gitlab.token);
    }

    throw new BadRequestError('GitLab account is not connected. Please connect your GitLab account first.');
  }

  /**
   * Get decrypted tokens for both platforms for user
   */
  async getTokens(userId) {
    let ghToken = env.github.token;
    let glToken = env.gitlab.token;

    try {
      const ghAccount = await githubAccountRepository.findByUserId(userId);
      if (ghAccount && ghAccount.isConnected && ghAccount.accessToken) {
        ghToken = decrypt(ghAccount.accessToken);
      }
    } catch {}

    try {
      const glAccount = await gitlabAccountRepository.findByUserId(userId);
      if (glAccount && glAccount.isConnected && glAccount.accessToken) {
        glToken = decrypt(glAccount.accessToken);
      }
    } catch {}

    return { ghToken, glToken };
  }
}

module.exports = new ProviderFactory();
