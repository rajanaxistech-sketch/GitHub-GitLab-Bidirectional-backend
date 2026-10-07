const axios = require('axios');
const GitProviderInterface = require('./git.provider.interface');
const env = require('../config/env');
const logger = require('../utils/logger');

class GitLabProvider extends GitProviderInterface {
  constructor(token) {
    super(token);
    this.client = axios.create({
      baseURL: env.gitlab.apiBaseUrl,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      timeout: 25000,
    });
  }

  /**
   * Fetch authenticated GitLab user
   */
  async getUser() {
    try {
      const { data } = await this.client.get('/user');

      // Fetch actual count of projects the user is a member of (data.projects_limit is account max quota, e.g. 100000)
      let projectCount = 0;
      try {
        const { headers, data: projects } = await this.client.get('/projects', {
          params: {
            membership: true,
            per_page: 1,
            simple: true,
          },
        });
        const totalHeader = headers['x-total'];
        if (totalHeader !== undefined && totalHeader !== null) {
          projectCount = parseInt(totalHeader, 10) || 0;
        } else if (Array.isArray(projects)) {
          projectCount = projects.length;
        }
      } catch (err) {
        logger.warn('Could not fetch GitLab project count:', err.message);
      }

      return {
        id: String(data.id),
        username: data.username,
        displayName: data.name || data.username,
        avatarUrl: data.avatar_url,
        profileUrl: data.web_url,
        email: data.email,
        publicRepos: projectCount,
      };
    } catch (error) {
      logger.error('GitLab API error in getUser:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fetch all projects/repositories accessible to the user
   */
  async getRepositories(options = {}) {
    try {
      const { data } = await this.client.get('/projects', {
        params: {
          membership: true,
          per_page: options.perPage || 100,
          order_by: 'updated_at',
          sort: 'desc',
        },
      });

      return data.map((project) => ({
        id: String(project.id),
        name: project.name,
        fullName: project.path_with_namespace,
        owner: project.namespace?.path || project.namespace?.name || '',
        description: project.description,
        isPrivate: project.visibility === 'private',
        defaultBranch: project.default_branch || 'main',
        htmlUrl: project.web_url,
        cloneUrl: project.http_url_to_repo,
        updatedAt: project.last_activity_at,
        pushedAt: project.last_activity_at,
      }));
    } catch (error) {
      logger.error('GitLab API error in getRepositories:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fetch a single project detail
   */
  async getRepository(projectPathOrId) {
    try {
      const encodedId = encodeURIComponent(projectPathOrId);
      const { data } = await this.client.get(`/projects/${encodedId}`);
      return {
        id: String(data.id),
        name: data.name,
        fullName: data.path_with_namespace,
        owner: data.namespace?.path || data.namespace?.name || '',
        description: data.description,
        isPrivate: data.visibility === 'private',
        defaultBranch: data.default_branch || 'main',
        htmlUrl: data.web_url,
        cloneUrl: data.http_url_to_repo,
        updatedAt: data.last_activity_at,
        pushedAt: data.last_activity_at,
      };
    } catch (error) {
      logger.error(`GitLab API error in getRepository (${projectPathOrId}):`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fetch branches for project
   */
  async getBranches(projectPathOrId) {
    try {
      const encodedId = encodeURIComponent(projectPathOrId);
      const { data } = await this.client.get(`/projects/${encodedId}/repository/branches`, {
        params: { per_page: 100 },
      });
      return data.map((b) => ({
        name: b.name,
        commitSha: b.commit.id,
        protected: b.protected,
      }));
    } catch (error) {
      if (error.response?.status === 404) return [];
      logger.error(`GitLab API error in getBranches (${projectPathOrId}):`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fetch branch detail
   */
  async getBranch(projectPathOrId, branch) {
    try {
      const encodedId = encodeURIComponent(projectPathOrId);
      const encodedBranch = encodeURIComponent(branch);
      const { data } = await this.client.get(`/projects/${encodedId}/repository/branches/${encodedBranch}`);
      return {
        name: data.name,
        commitSha: data.commit.id,
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
  async getCommits(projectPathOrId, branch = 'main', limit = 20) {
    try {
      const encodedId = encodeURIComponent(projectPathOrId);
      const { data } = await this.client.get(`/projects/${encodedId}/repository/commits`, {
        params: { ref_name: branch, per_page: limit },
      });
      return data.map((c) => ({
        sha: c.id,
        message: c.message,
        authorName: c.author_name,
        authorEmail: c.author_email,
        date: c.created_at,
        htmlUrl: c.web_url,
      }));
    } catch (error) {
      if (error.response?.status === 404) return [];
      logger.error(`GitLab API error in getCommits (${projectPathOrId}):`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fetch single commit
   */
  async getCommit(projectPathOrId, sha) {
    try {
      const encodedId = encodeURIComponent(projectPathOrId);
      const { data } = await this.client.get(`/projects/${encodedId}/repository/commits/${sha}`);
      
      let diffs = [];
      try {
        const diffRes = await this.client.get(`/projects/${encodedId}/repository/commits/${sha}/diff`);
        diffs = diffRes.data || [];
      } catch {
        diffs = [];
      }

      return {
        sha: data.id,
        message: data.message,
        authorName: data.author_name,
        authorEmail: data.author_email,
        date: data.created_at,
        files: diffs.map((d) => ({
          filename: d.new_path || d.old_path,
          status: d.new_file ? 'added' : d.deleted_file ? 'removed' : 'modified',
          diff: d.diff,
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
  async getFileTree(projectPathOrId, ref = 'main') {
    try {
      const encodedId = encodeURIComponent(projectPathOrId);
      let page = 1;
      let allFiles = [];
      let hasMore = true;

      while (hasMore && page <= 10) {
        const { data, headers } = await this.client.get(`/projects/${encodedId}/repository/tree`, {
          params: {
            ref,
            recursive: true,
            per_page: 100,
            page,
          },
        });

        const files = (data || [])
          .filter((item) => item.type === 'blob')
          .map((item) => ({
            path: item.path,
            mode: item.mode,
            type: item.type,
            sha: item.id,
            name: item.name,
          }));

        allFiles = allFiles.concat(files);

        const totalPages = parseInt(headers['x-total-pages'] || '1', 10);
        if (page >= totalPages || data.length < 100) {
          hasMore = false;
        } else {
          page += 1;
        }
      }

      return allFiles;
    } catch (error) {
      if (error.response?.status === 404) return [];
      logger.error(`GitLab API error in getFileTree (${projectPathOrId}):`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fetch file content (utf8 decoded)
   */
  async getFileContent(projectPathOrId, filePath, ref = 'main') {
    try {
      const encodedId = encodeURIComponent(projectPathOrId);
      const encodedFilePath = encodeURIComponent(filePath);
      const { data } = await this.client.get(`/projects/${encodedId}/repository/files/${encodedFilePath}`, {
        params: { ref },
      });

      if (data.content) {
        const content = Buffer.from(data.content, data.encoding || 'base64').toString('utf8');
        return {
          path: data.file_path,
          sha: data.blob_id,
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
   * Create a new GitLab project/repository
   */
  async createRepository(name, options = {}) {
    try {
      const { data } = await this.client.post('/projects', {
        name,
        description: options.description || 'Synchronized repository',
        visibility: options.isPrivate ? 'private' : 'public',
        initialize_with_readme: true,
      });

      return {
        id: String(data.id),
        name: data.name,
        fullName: data.path_with_namespace,
        owner: data.namespace?.path || '',
        htmlUrl: data.web_url,
        cloneUrl: data.http_url_to_repo,
        defaultBranch: data.default_branch || 'main',
      };
    } catch (error) {
      logger.error('GitLab API error in createRepository:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Create branch
   */
  async createBranch(projectPathOrId, branchName, fromSha) {
    try {
      const encodedId = encodeURIComponent(projectPathOrId);
      const { data } = await this.client.post(`/projects/${encodedId}/repository/branches`, {
        branch: branchName,
        ref: fromSha,
      });
      return {
        name: data.name,
        commitSha: data.commit.id,
      };
    } catch (error) {
      logger.error(`GitLab API error in createBranch (${branchName}):`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Commit and push file changes to GitLab repository
   * @param {string} projectPathOrId
   * @param {string} branch
   * @param {string} message
   * @param {Array<{ action: 'create'|'update'|'delete', path: string, content: string }>} actions
   */
  async commitFiles(projectPathOrId, branch, message, actions) {
    if (!actions || actions.length === 0) return null;

    try {
      const encodedId = encodeURIComponent(projectPathOrId);

      // 1. Get existing file tree to determine whether each action is create or update
      let existingFiles = new Set();
      try {
        const tree = await this.getFileTree(projectPathOrId, branch);
        existingFiles = new Set(tree.map((f) => f.path));
      } catch {
        existingFiles = new Set();
      }

      // 2. Map actions to GitLab Commits API format
      const formattedActions = actions.map((act) => {
        let actionType = act.action;
        if (actionType !== 'delete') {
          actionType = existingFiles.has(act.path) ? 'update' : 'create';
        }

        const item = {
          action: actionType,
          file_path: act.path,
        };

        if (actionType !== 'delete') {
          item.content = act.content || '';
          item.encoding = 'text';
        }

        return item;
      });

      // 3. Make Commit API call
      const { data } = await this.client.post(`/projects/${encodedId}/repository/commits`, {
        branch,
        commit_message: message,
        actions: formattedActions,
      });

      return {
        commitSha: data.id,
        branch,
        filesChanged: actions.length,
      };
    } catch (error) {
      logger.error(`GitLab commitFiles error (${projectPathOrId}):`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Create Webhook on GitLab project
   */
  async createWebhook(projectPathOrId, webhookUrl, secret) {
    try {
      const encodedId = encodeURIComponent(projectPathOrId);
      const { data } = await this.client.post(`/projects/${encodedId}/hooks`, {
        url: webhookUrl,
        push_events: true,
        tag_push_events: true,
        repository_update_events: true,
        token: secret || env.webhook.secret,
        enable_ssl_verification: false,
      });

      return {
        id: String(data.id),
        url: webhookUrl,
        active: true,
      };
    } catch (error) {
      logger.error(`GitLab API error in createWebhook (${projectPathOrId}):`, error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Delete Webhook
   */
  async deleteWebhook(projectPathOrId, hookId) {
    try {
      const encodedId = encodeURIComponent(projectPathOrId);
      await this.client.delete(`/projects/${encodedId}/hooks/${hookId}`);
      return true;
    } catch (error) {
      logger.warn(`GitLab API error in deleteWebhook (${projectPathOrId}/${hookId}):`, error.message);
      return false;
    }
  }

  /**
   * Validate webhook token
   */
  validateWebhookSignature(headers, payload, secret) {
    const gitlabToken = headers['x-gitlab-token'];
    const expectedSecret = secret || env.webhook.secret;
    return Boolean(gitlabToken && gitlabToken === expectedSecret);
  }
}

module.exports = GitLabProvider;
