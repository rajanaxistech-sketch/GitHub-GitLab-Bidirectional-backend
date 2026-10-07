const repositoryMappingRepository = require('../repositories/repository-mapping.repository');
const githubAccountRepository = require('../repositories/github-account.repository');
const gitlabAccountRepository = require('../repositories/gitlab-account.repository');
const providerFactory = require('../providers/provider.factory');
const syncEngineService = require('./sync-engine.service');
const env = require('../config/env');
const { BadRequestError, NotFoundError, ConflictError, ForbiddenError } = require('../utils/response');
const logger = require('../utils/logger');

class RepositoryMappingService {
  /**
   * Create a new repository mapping between GitHub and GitLab
   */
  async createMapping(userId, data) {
    const {
      githubRepoFullName,
      gitlabProjectFullPath,
      githubRepoId,
      gitlabProjectId,
      syncDirection = 'bidirectional',
      autoSyncEnabled = true,
      initialSync = true,
    } = data;

    if (!githubRepoFullName || !gitlabProjectFullPath) {
      throw new BadRequestError('Both GitHub repository and GitLab project are required');
    }

    // 1. Verify user's accounts
    const githubAccount = await githubAccountRepository.findByUserId(userId);
    const gitlabAccount = await gitlabAccountRepository.findByUserId(userId);

    if (!githubAccount || !githubAccount.isConnected) {
      throw new BadRequestError('GitHub account is not connected. Connect GitHub before creating a mapping.');
    }
    if (!gitlabAccount || !gitlabAccount.isConnected) {
      throw new BadRequestError('GitLab account is not connected. Connect GitLab before creating a mapping.');
    }

    // 2. Prevent duplicate mappings
    const existing = await repositoryMappingRepository.findExistingMapping(
      userId,
      githubRepoFullName,
      gitlabProjectFullPath
    );
    if (existing) {
      throw new ConflictError('A synchronization mapping between these two repositories already exists');
    }

    // 3. Extract owners and repo names
    const [githubOwner, githubRepoName] = githubRepoFullName.split('/');
    const gitlabParts = gitlabProjectFullPath.split('/');
    const gitlabProjectName = gitlabParts[gitlabParts.length - 1];
    const gitlabNamespace = gitlabParts.slice(0, -1).join('/') || gitlabProjectName;

    // 4. Create webhooks on both providers if autoSyncEnabled
    let webhookGithubId = null;
    let webhookGitlabId = null;
    const webhookSecret = env.webhook.secret;

    try {
      const githubProvider = await providerFactory.getGitHubProvider(userId);
      const ghHook = await githubProvider.createWebhook(
        githubOwner,
        githubRepoName,
        `${env.webhook.baseUrl}/github`,
        webhookSecret
      );
      if (ghHook) webhookGithubId = ghHook.id;
    } catch (err) {
      logger.warn('Could not register GitHub webhook automatically:', err.message);
    }

    try {
      const gitlabProvider = await providerFactory.getGitLabProvider(userId);
      const glHook = await gitlabProvider.createWebhook(
        gitlabProjectId || gitlabProjectFullPath,
        `${env.webhook.baseUrl}/gitlab`,
        webhookSecret
      );
      if (glHook) webhookGitlabId = glHook.id;
    } catch (err) {
      logger.warn('Could not register GitLab webhook automatically:', err.message);
    }

    // 5. Create mapping entity
    const newMapping = repositoryMappingRepository.create({
      userId,
      githubAccountId: githubAccount.id,
      gitlabAccountId: gitlabAccount.id,
      githubRepoId: String(githubRepoId || githubRepoFullName),
      githubOwner,
      githubRepoName,
      githubRepoFullName,
      gitlabProjectId: String(gitlabProjectId || gitlabProjectFullPath),
      gitlabNamespace,
      gitlabProjectName,
      gitlabProjectFullPath,
      syncDirection,
      autoSyncEnabled: autoSyncEnabled !== false,
      syncStatus: 'IDLE',
      webhookGithubId,
      webhookGitlabId,
      webhookSecret,
    });

    const savedMapping = await repositoryMappingRepository.save(newMapping);

    // 6. Optionally trigger initial synchronization
    if (initialSync) {
      syncEngineService.triggerSync(savedMapping.id, {
        triggerType: 'MANUAL',
        direction: syncDirection,
      }).catch((err) => {
        logger.error('Initial sync failed for new mapping:', err);
      });
    }

    return savedMapping;
  }

  /**
   * Get all mappings for user
   */
  async getMappings(userId) {
    return repositoryMappingRepository.findByUserId(userId);
  }

  /**
   * Get single mapping by ID
   */
  async getMappingById(userId, mappingId) {
    const mapping = await repositoryMappingRepository.findById(mappingId);
    if (!mapping) {
      throw new NotFoundError('Repository mapping not found');
    }
    if (mapping.userId !== userId) {
      throw new ForbiddenError('You do not have permission to access this mapping');
    }
    return mapping;
  }

  /**
   * Update repository mapping
   */
  async updateMapping(userId, mappingId, updateData) {
    const mapping = await this.getMappingById(userId, mappingId);

    if (updateData.syncDirection) {
      mapping.syncDirection = updateData.syncDirection;
    }
    if (typeof updateData.autoSyncEnabled === 'boolean') {
      mapping.autoSyncEnabled = updateData.autoSyncEnabled;
    }
    if (updateData.syncStatus) {
      mapping.syncStatus = updateData.syncStatus;
    }

    return repositoryMappingRepository.save(mapping);
  }

  /**
   * Delete repository mapping and its webhooks
   */
  async deleteMapping(userId, mappingId) {
    const mapping = await this.getMappingById(userId, mappingId);

    // Attempt to remove webhooks cleanly
    try {
      if (mapping.webhookGithubId) {
        const githubProvider = await providerFactory.getGitHubProvider(userId);
        await githubProvider.deleteWebhook(mapping.githubOwner, mapping.githubRepoName, mapping.webhookGithubId);
      }
    } catch (err) {
      logger.warn('Failed to remove GitHub webhook:', err.message);
    }

    try {
      if (mapping.webhookGitlabId) {
        const gitlabProvider = await providerFactory.getGitLabProvider(userId);
        await gitlabProvider.deleteWebhook(mapping.gitlabProjectId, mapping.webhookGitlabId);
      }
    } catch (err) {
      logger.warn('Failed to remove GitLab webhook:', err.message);
    }

    await repositoryMappingRepository.delete(mappingId);
    return { success: true, message: 'Mapping deleted successfully' };
  }
}

module.exports = new RepositoryMappingService();
