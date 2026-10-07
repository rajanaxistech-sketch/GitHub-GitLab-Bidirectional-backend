/**
 * Git Provider Base Class / Interface
 * Defines common operations for version control providers (GitHub, GitLab, etc.)
 */
class GitProviderInterface {
  /**
   * @param {string} token - Decrypted access token
   */
  constructor(token) {
    if (new.target === GitProviderInterface) {
      throw new TypeError('Cannot construct GitProviderInterface instances directly');
    }
    this.token = token;
  }

  async getUser() {
    throw new Error('Method getUser() must be implemented.');
  }

  async getRepositories() {
    throw new Error('Method getRepositories() must be implemented.');
  }

  async getRepository(owner, repo) {
    throw new Error('Method getRepository() must be implemented.');
  }

  async getBranches(owner, repo) {
    throw new Error('Method getBranches() must be implemented.');
  }

  async getBranch(owner, repo, branch) {
    throw new Error('Method getBranch() must be implemented.');
  }

  async getCommits(owner, repo, branch, limit) {
    throw new Error('Method getCommits() must be implemented.');
  }

  async getCommit(owner, repo, sha) {
    throw new Error('Method getCommit() must be implemented.');
  }

  async getFileTree(owner, repo, ref) {
    throw new Error('Method getFileTree() must be implemented.');
  }

  async getFileContent(owner, repo, filePath, ref) {
    throw new Error('Method getFileContent() must be implemented.');
  }

  async createRepository(name, options) {
    throw new Error('Method createRepository() must be implemented.');
  }

  async createBranch(owner, repo, branchName, fromSha) {
    throw new Error('Method createBranch() must be implemented.');
  }

  async commitFiles(owner, repo, branch, message, actions) {
    throw new Error('Method commitFiles() must be implemented.');
  }

  async createWebhook(owner, repo, webhookUrl, secret) {
    throw new Error('Method createWebhook() must be implemented.');
  }

  async deleteWebhook(owner, repo, hookId) {
    throw new Error('Method deleteWebhook() must be implemented.');
  }

  validateWebhookSignature(headers, payload, secret) {
    throw new Error('Method validateWebhookSignature() must be implemented.');
  }
}

module.exports = GitProviderInterface;
