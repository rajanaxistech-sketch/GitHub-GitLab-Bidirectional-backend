const axios = require('axios');
const crypto = require('crypto');
const GitProviderInterface = require('./git.provider.interface');
const env = require('../config/env');
const logger = require('../utils/logger');

class GitHubProvider extends GitProviderInterface {
  constructor(token) {
    super(token);
    this.client = axios.create({
      baseURL: env.github.apiBaseUrl,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      timeout: 25000,
    });
  }

  /**
   * Fetch authenticated GitHub user
   */
  async getUser() {
    try {
      const { data } = await this.client.get('/user');
      return {
        id: String(data.id),
        username: data.login,
        displayName: data.name || data.login,
        avatarUrl: data.avatar_url,
        profileUrl: data.html_url,
        email: data.email,
        publicRepos: data.public_repos + (data.total_private_repos || 0),
      };
    } catch (error) {
      logger.error('GitHub API error in getUser:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fetch all repositories accessible to the user
   */
  async getRepositories(options = {}) {
    try {
      const { data } = await this.client.get('/user/repos', {
        params: {
          per_page: options.perPage || 100,
          sort: 'updated',
          direction: 'desc',
          affiliation: 'owner,collaborator,organization_member',
        },
      });

      return data.map((repo) => ({
        id: String(repo.id),
        name: repo.name,
        fullName: repo.full_name,
        owner: repo.owner.login,
        description: repo.description,
        isPrivate: repo.private,
        defaultBranch: repo.default_branch || 'main',
        htmlUrl: repo.html_url,
        cloneUrl: repo.clone_url,
        updatedAt: repo.updated_at,
        pushedAt: repo.pushed_at,
      }));
    } catch (error) {
      logger.error('GitHub API error in getRepositories:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fetch a single repository details
   */
  async getRepository(owner, repo) {
    try {
      const { data } = await this.client.get(`/repos/${owner}/${repo}`);
      return {
        id: String(data.id),
        name: data.name,
        fullName: data.full_name,
        owner: data.owner.login,
        description: data.description,
        isPrivate: data.private,
        defaultBranch: data.default_branch || 'main',
        htmlUrl: data.html_url,
        cloneUrl: data.clone_url,
        updatedAt: data.updated_at,
        pushedAt: data.pushed_at,
      };
    } catch (error) {
      logger.error(`GitHub API error in getRepository (${owner}/${repo}):`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fetch branches for repository
   */
  async getBranches(owner, repo) {
    try {
      const { data } = await this.client.get(`/repos/${owner}/${repo}/branches`, {
        params: { per_page: 100 },
      });
      return data.map((b) => ({
        name: b.name,
        commitSha: b.commit.sha,
        protected: b.protected,
      }));
    } catch (error) {
      // Empty repo might return 404 or empty list
      if (error.response?.status === 404) {
        return [];
      }
      logger.error(`GitHub API error in getBranches (${owner}/${repo}):`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fetch a branch detail
   */
  async getBranch(owner, repo, branch) {
    try {
      const { data } = await this.client.get(`/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`);
      return {
        name: data.name,
        commitSha: data.commit.sha,
        protected: data.protected,
      };
    } catch (error) {
      if (error.response?.status === 404) return null;
      throw error;
    }
  }

  /**
   * Fetch recent commits on a branch
   */
  async getCommits(owner, repo, branch = 'main', limit = 20) {
    try {
      const { data } = await this.client.get(`/repos/${owner}/${repo}/commits`, {
        params: { sha: branch, per_page: limit },
      });
      return data.map((c) => ({
        sha: c.sha,
        message: c.commit.message,
        authorName: c.commit.author.name,
        authorEmail: c.commit.author.email,
        date: c.commit.author.date,
        htmlUrl: c.html_url,
      }));
    } catch (error) {
      if (error.response?.status === 404 || error.response?.status === 409) {
        return [];
      }
      logger.error(`GitHub API error in getCommits (${owner}/${repo}):`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fetch a single commit
   */
  async getCommit(owner, repo, sha) {
    try {
      const { data } = await this.client.get(`/repos/${owner}/${repo}/commits/${sha}`);
      return {
        sha: data.sha,
        message: data.commit.message,
        authorName: data.commit.author.name,
        authorEmail: data.commit.author.email,
        date: data.commit.author.date,
        files: (data.files || []).map((f) => ({
          filename: f.filename,
          status: f.status, // added, modified, removed
          additions: f.additions,
          deletions: f.deletions,
          changes: f.changes,
          patch: f.patch,
        })),
      };
    } catch (error) {
      if (error.response?.status === 404) return null;
      throw error;
    }
  }

  /**
   * Fetch recursive tree for a git reference
   */
  async getFileTree(owner, repo, ref = 'main') {
    try {
      // First get branch or commit to resolve to tree SHA
      let treeSha = ref;
      try {
        const commitRes = await this.client.get(`/repos/${owner}/${repo}/commits/${ref}`);
        treeSha = commitRes.data.commit.tree.sha;
      } catch {
        treeSha = ref;
      }

      const { data } = await this.client.get(`/repos/${owner}/${repo}/git/trees/${treeSha}`, {
        params: { recursive: 1 },
      });

      return (data.tree || [])
        .filter((item) => item.type === 'blob')
        .map((item) => ({
          path: item.path,
          mode: item.mode,
          type: item.type,
          sha: item.sha,
          size: item.size,
        }));
    } catch (error) {
      if (error.response?.status === 404 || error.response?.status === 409) {
        return [];
      }
      logger.error(`GitHub API error in getFileTree (${owner}/${repo}):`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fetch file content (utf8 decoded)
   */
  async getFileContent(owner, repo, filePath, ref = 'main') {
    try {
      const { data } = await this.client.get(`/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`, {
        params: { ref },
      });

      if (data.type === 'file' && data.content) {
        const content = Buffer.from(data.content, data.encoding || 'base64').toString('utf8');
        return {
          path: data.path,
          sha: data.sha,
          size: data.size,
          content,
          encoding: 'utf8',
        };
      }
      return null;
    } catch (error) {
      if (error.response?.status === 404) return null;
      throw error;
    }
  }

  /**
   * Create a new GitHub repository
   */
  async createRepository(name, options = {}) {
    try {
      const { data } = await this.client.post('/user/repos', {
        name,
        description: options.description || 'Synchronized repository',
        private: options.isPrivate !== undefined ? options.isPrivate : false,
        auto_init: true,
      });

      return {
        id: String(data.id),
        name: data.name,
        fullName: data.full_name,
        owner: data.owner.login,
        htmlUrl: data.html_url,
        cloneUrl: data.clone_url,
        defaultBranch: data.default_branch || 'main',
      };
    } catch (error) {
      logger.error('GitHub API error in createRepository:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Create branch
   */
  async createBranch(owner, repo, branchName, fromSha) {
    try {
      const { data } = await this.client.post(`/repos/${owner}/${repo}/git/refs`, {
        ref: `refs/heads/${branchName}`,
        sha: fromSha,
      });
      return {
        name: branchName,
        commitSha: data.object.sha,
      };
    } catch (error) {
      logger.error(`GitHub API error in createBranch (${branchName}):`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Commit and push file changes to GitHub repository
   * @param {string} owner
   * @param {string} repo
   * @param {string} branch
   * @param {string} message
   * @param {Array<{ action: 'create'|'update'|'delete', path: string, content: string }>} actions
   */
  async commitFiles(owner, repo, branch, message, actions) {
    if (!actions || actions.length === 0) return null;

    try {
      // 1. Get current branch reference
      let latestCommitSha;
      let baseTreeSha;

      try {
        const refRes = await this.client.get(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
        latestCommitSha = refRes.data.object.sha;
        const commitRes = await this.client.get(`/repos/${owner}/${repo}/git/commits/${latestCommitSha}`);
        baseTreeSha = commitRes.data.tree.sha;
      } catch (err) {
        // If branch does not exist, try to get default branch
        const repoInfo = await this.getRepository(owner, repo);
        const defaultBranch = repoInfo.defaultBranch || 'main';
        const refRes = await this.client.get(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(defaultBranch)}`);
        latestCommitSha = refRes.data.object.sha;
        const commitRes = await this.client.get(`/repos/${owner}/${repo}/git/commits/${latestCommitSha}`);
        baseTreeSha = commitRes.data.tree.sha;
      }

      // 2. Build tree elements
      const treeItems = [];
      for (const action of actions) {
        if (action.action === 'delete') {
          // GitHub Tree API deletes a file by omitting it or setting sha: null
          treeItems.push({
            path: action.path,
            mode: '100644',
            type: 'blob',
            sha: null,
          });
        } else {
          // Create blob
          const blobRes = await this.client.post(`/repos/${owner}/${repo}/git/blobs`, {
            content: action.content || '',
            encoding: 'utf-8',
          });
          treeItems.push({
            path: action.path,
            mode: '100644',
            type: 'blob',
            sha: blobRes.data.sha,
          });
        }
      }

      // 3. Create new tree with base_tree
      const newTreeRes = await this.client.post(`/repos/${owner}/${repo}/git/trees`, {
        base_tree: baseTreeSha,
        tree: treeItems,
      });

      // 4. Create new commit
      const newCommitRes = await this.client.post(`/repos/${owner}/${repo}/git/commits`, {
        message,
        tree: newTreeRes.data.sha,
        parents: latestCommitSha ? [latestCommitSha] : [],
      });

      const newCommitSha = newCommitRes.data.sha;

      // 5. Update branch ref
      try {
        await this.client.patch(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
          sha: newCommitSha,
          force: true,
        });
      } catch {
        // If ref doesn't exist yet, create it
        await this.client.post(`/repos/${owner}/${repo}/git/refs`, {
          ref: `refs/heads/${branch}`,
          sha: newCommitSha,
        });
      }

      return {
        commitSha: newCommitSha,
        treeSha: newTreeRes.data.sha,
        branch,
        filesChanged: actions.length,
      };
    } catch (error) {
      logger.error(`GitHub commitFiles error (${owner}/${repo}):`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Create Webhook on GitHub repository
   */
  async createWebhook(owner, repo, webhookUrl, secret) {
    try {
      const { data } = await this.client.post(`/repos/${owner}/${repo}/hooks`, {
        name: 'web',
        active: true,
        events: ['push', 'repository', 'create', 'delete'],
        config: {
          url: webhookUrl,
          content_type: 'json',
          secret: secret || env.webhook.secret,
          insecure_ssl: '0',
        },
      });

      return {
        id: String(data.id),
        url: webhookUrl,
        active: data.active,
      };
    } catch (error) {
      logger.error(`GitHub API error in createWebhook (${owner}/${repo}):`, error.response?.data || error.message);
      // If webhook already exists or permissions lack, handle gracefully
      return null;
    }
  }

  /**
   * Delete Webhook
   */
  async deleteWebhook(owner, repo, hookId) {
    try {
      await this.client.delete(`/repos/${owner}/${repo}/hooks/${hookId}`);
      return true;
    } catch (error) {
      logger.warn(`GitHub API error in deleteWebhook (${owner}/${repo}/${hookId}):`, error.message);
      return false;
    }
  }

  /**
   * Validate webhook payload signature using HMAC SHA-256
   */
  validateWebhookSignature(headers, payload, secret) {
    const signature = headers['x-hub-signature-256'];
    if (!signature) return false;

    const hmac = crypto.createHmac('sha256', secret || env.webhook.secret);
    const calculated = `sha256=${hmac.update(typeof payload === 'string' ? payload : JSON.stringify(payload)).digest('hex')}`;
    
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(calculated));
    } catch {
      return false;
    }
  }
}

module.exports = GitHubProvider;
