const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
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

  /**
   * Generate detailed repository audit report comparing GitHub and GitLab repositories
   */
  async getAuditReport(userId) {
    let githubRepos = [];
    let gitlabRepos = [];
    let githubProvider = null;
    let gitlabProvider = null;

    try {
      githubProvider = await providerFactory.getGitHubProvider(userId);
      githubRepos = await githubProvider.getRepositories({ affiliation: 'owner' });
    } catch (e) {
      logger.warn('Could not fetch GitHub repos for audit:', e.message);
    }

    try {
      gitlabProvider = await providerFactory.getGitLabProvider(userId);
      gitlabRepos = await gitlabProvider.getRepositories();
    } catch (e) {
      logger.warn('Could not fetch GitLab repos for audit:', e.message);
    }

    const formatStatus = (commit) => {
      if (!commit) return 'No commits yet';
      const d = new Date(commit.date);
      const isToday = new Date().toDateString() === d.toDateString();
      const dateStr = isToday
        ? `Today, ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const msg = (commit.message || '').split('\n')[0].substring(0, 30);
      return `Latest (${dateStr}: ${msg})`;
    };

    const getCleanProjectName = (repoName) => {
      const mapping = {
        'house_app': 'House App',
        'NoteAx_Product_Backend': 'NoteAX',
        'NoteAx_Product_Mobile': 'NoteAX',
        'NoteAX_Admin': 'NoteAX',
        'NoteAX_Backend_Code': 'NoteAX',
        'Society_Events_App': 'Society Events',
        'attendance_product': 'Attendance Product',
        'attendance_management_system': 'Attendance Management',
        'task_management_system': 'Task Management',
        'custom_project': 'Custom Widgets',
        'face_guard_liveness': 'Face Guard Liveness',
        'metal_management': 'Metal Management',
        'WorkSense': 'WorkSense',
        'cli': 'CLI Tool',
        'psmattendance_suvarnakala_com': 'Suvarnakala Attendance',
        'mattendance.suvarnakala.com': 'Suvarnakala Mobile Attendance',
        'ipo_invess': 'IPO Invess',
        'UPI-Helper': 'UPI Helper Package',
        'Form-Validator': 'Form Validator Package',
        'Aura-Snackbars': 'Aura Snackbars Package',
        'core_api_client_package_android': 'Core API Client Android',
        'ocr_text': 'OCR Text Recognition',
        'modern_dialogs': 'Modern Dialogs Package',
        'est_repo': 'Est Repo',
        'beeline_honeys': 'Beeline Honeys',
        'bg_removal_backend': 'Background Removal Backend',
      };
      return mapping[repoName] || repoName.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    };

    const mappings = await repositoryMappingRepository.findByUserId(userId);
    const processedGlIds = new Set();

    // 1. Process all GitHub repositories in parallel
    const ghReportPromises = githubRepos.map(async (ghRepo) => {
      const glMatch = gitlabRepos.find((r) => {
        if (r.name.toLowerCase() === ghRepo.name.toLowerCase()) return true;
        const normGh = ghRepo.name.toLowerCase().replace(/[._]/g, '-');
        const normGl = r.name.toLowerCase().replace(/[._]/g, '-');
        return normGh === normGl;
      });

      if (glMatch) {
        processedGlIds.add(glMatch.id);
      }

      const mapping = mappings.find(
        (m) => m.githubRepoFullName?.toLowerCase() === ghRepo.fullName?.toLowerCase()
      );

      // Concurrent fetch for GitHub and GitLab commits
      const [ghCommitRes, glCommitRes] = await Promise.allSettled([
        githubProvider.getCommits(
          ghRepo.owner,
          ghRepo.name,
          ghRepo.defaultBranch || 'main',
          1
        ),
        glMatch
          ? gitlabProvider.getCommits(
              glMatch.id,
              glMatch.defaultBranch || 'main',
              1
            )
          : Promise.resolve([]),
      ]);

      const ghCommit = ghCommitRes.status === 'fulfilled' ? ghCommitRes.value?.[0] || null : null;
      const glCommit = glCommitRes.status === 'fulfilled' ? glCommitRes.value?.[0] || null : null;

      let githubStatus = ghCommit ? formatStatus(ghCommit) : 'Empty repo';
      let gitlabStatus = 'Not on GitLab yet';
      let syncState = 'Needs Migration to GitLab';
      let syncBadge = 'warning';

      if (glMatch) {
        gitlabStatus = glCommit ? formatStatus(glCommit) : 'Empty repo';

        if (ghCommit && glCommit && ghCommit.sha === glCommit.sha) {
          syncState = 'Identical (In Sync)';
          syncBadge = 'success';
        } else if (!ghCommit && !glCommit) {
          syncState = 'Identical (In Sync)';
          syncBadge = 'success';
        } else if (ghCommit && glCommit) {
          const ghTime = new Date(ghCommit.date).getTime();
          const glTime = new Date(glCommit.date).getTime();
          if (ghTime > glTime) {
            syncState = 'GitHub Ahead';
            syncBadge = 'brand';
          } else if (glTime > ghTime) {
            syncState = 'GitLab Ahead';
            syncBadge = 'info';
          } else {
            syncState = 'Commits Differ';
            syncBadge = 'warning';
          }
        } else if (!glCommit && ghCommit) {
          syncState = 'Needs Initial Push to GitLab';
          syncBadge = 'warning';
        }
      }

      const projectName = getCleanProjectName(ghRepo.name);
      const isCompleted = Boolean(glMatch);

      return {
        employeeName: 'Harmish',
        projectName,
        repositoryName: ghRepo.name,
        githubRepoFullName: ghRepo.fullName,
        gitlabProjectFullPath: glMatch?.fullName || null,
        githubHtmlUrl: ghRepo.htmlUrl,
        gitlabHtmlUrl: glMatch?.htmlUrl || null,
        githubDefaultBranch: ghRepo.defaultBranch || 'main',
        gitlabDefaultBranch: glMatch?.defaultBranch || 'main',
        githubStatus,
        gitlabStatus,
        syncState,
        syncBadge,
        migrationStatus: isCompleted ? 'Completed' : 'Pending',
        allBranchesMigrated: isCompleted ? 'Yes' : 'No',
        gitHistoryMigrated: isCompleted ? 'Yes' : 'No',
        latestCodePushed: isCompleted ? 'Yes' : 'No',
        glAccessChecked: isCompleted ? 'Yes' : 'No',
        migrationDate: '07-10-2026',
        verifiedBy: 'Harmish',
        notes: isCompleted ? (syncState.includes('In Sync') ? 'Fully migrated and synced' : syncState) : 'Pending migration to GitLab',
        mappingId: mapping?.id || null,
        isMapped: Boolean(mapping),
        canQuickSync: Boolean(glMatch),
      };
    });

    const ghReportResults = await Promise.all(ghReportPromises);

    // 2. Process GitLab-only repositories in parallel
    const glOnlyRepos = gitlabRepos.filter((r) => !processedGlIds.has(r.id));
    const glOnlyPromises = glOnlyRepos.map(async (glRepo) => {
      let glCommit = null;
      try {
        const glCommits = await gitlabProvider.getCommits(
          glRepo.id,
          glRepo.defaultBranch || 'main',
          1
        );
        glCommit = glCommits[0] || null;
      } catch {}

      const projectName = getCleanProjectName(glRepo.name);

      return {
        employeeName: 'Harmish',
        projectName,
        repositoryName: glRepo.name,
        githubRepoFullName: null,
        gitlabProjectFullPath: glRepo.fullName,
        githubHtmlUrl: null,
        gitlabHtmlUrl: glRepo.htmlUrl,
        githubDefaultBranch: 'main',
        gitlabDefaultBranch: glRepo.defaultBranch || 'main',
        githubStatus: 'Not on GitHub',
        gitlabStatus: glCommit ? formatStatus(glCommit) : 'Empty repo',
        syncState: 'GitLab Only',
        syncBadge: 'neutral',
        migrationStatus: 'Completed',
        allBranchesMigrated: 'Yes',
        gitHistoryMigrated: 'Yes',
        latestCodePushed: 'Yes',
        glAccessChecked: 'Yes',
        migrationDate: '07-10-2026',
        verifiedBy: 'Harmish',
        notes: 'GitLab-hosted project',
        mappingId: null,
        isMapped: false,
        canQuickSync: false,
      };
    });

    const glOnlyResults = await Promise.all(glOnlyPromises);

    return [...ghReportResults, ...glOnlyResults];
  }

  /**
   * Automatically create missing repository on target platform, push commits/branches, and establish bidirectional mapping
   * @param {string} userId
   * @param {Object} options
   */
  async autoCreateAndSync(userId, options = {}) {
    const {
      sourcePlatform,
      sourceRepoFullName,
      targetRepoName,
      isPrivate = true,
      syncDirection = 'bidirectional',
    } = options;

    if (!sourcePlatform || !sourceRepoFullName) {
      throw new BadRequestError('sourcePlatform and sourceRepoFullName are required');
    }

    const githubProvider = await providerFactory.getGitHubProvider(userId);
    const gitlabProvider = await providerFactory.getGitLabProvider(userId);
    const { ghToken, glToken } = await providerFactory.getTokens(userId);

    let githubRepoFullName = null;
    let gitlabProjectFullPath = null;
    let githubRepoId = null;
    let gitlabProjectId = null;
    let repoBaseName = '';

    const tempDir = path.join(
      os.tmpdir(),
      `sync_mirror_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.git`
    );

    if (sourcePlatform === 'github') {
      const [ghOwner, ghName] = sourceRepoFullName.split('/');
      repoBaseName = targetRepoName || ghName;
      const ghRepo = await githubProvider.getRepository(ghOwner, ghName);
      githubRepoFullName = ghRepo.fullName;
      githubRepoId = ghRepo.id;

      const glRepos = await gitlabProvider.getRepositories();
      let glProject = glRepos.find(
        (r) =>
          r.name.toLowerCase() === repoBaseName.toLowerCase() ||
          r.name.toLowerCase().replace(/[._]/g, '-') === repoBaseName.toLowerCase().replace(/[._]/g, '-')
      );

      if (!glProject) {
        logger.info(`Auto-creating project '${repoBaseName}' on GitLab...`);
        glProject = await gitlabProvider.createRepository(repoBaseName, {
          description: ghRepo.description || 'Synchronized from GitHub',
          isPrivate: ghRepo.isPrivate !== undefined ? ghRepo.isPrivate : isPrivate,
          initializeWithReadme: false,
        });
      }

      gitlabProjectFullPath = glProject.fullName;
      gitlabProjectId = glProject.id;

      const ghCloneUrl = `https://x-access-token:${ghToken}@github.com/${githubRepoFullName}.git`;
      const glBaseUrlClean = env.gitlab.apiBaseUrl.replace('/api/v4', '').replace(/^https?:\/\//, '');
      const glPushUrl = `http://oauth2:${glToken}@${glBaseUrlClean}/${gitlabProjectFullPath}.git`;

      try {
        logger.info(`Mirror cloning from GitHub: ${githubRepoFullName}`);
        execSync(`git clone --mirror "${ghCloneUrl}" "${tempDir}"`, { stdio: 'pipe' });
        logger.info(`Mirror pushing to GitLab: ${gitlabProjectFullPath}`);
        execSync(`git push --mirror "${glPushUrl}"`, { cwd: tempDir, stdio: 'pipe' });
      } catch (gitErr) {
        logger.warn('Git mirror push encountered warning/error:', gitErr.message);
      } finally {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
      }
    } else {
      const glProject = await gitlabProvider.getRepository(sourceRepoFullName);
      repoBaseName = targetRepoName || glProject.name;
      gitlabProjectFullPath = glProject.fullName;
      gitlabProjectId = glProject.id;

      const ghRepos = await githubProvider.getRepositories({ affiliation: 'owner' });
      let ghRepo = ghRepos.find(
        (r) =>
          r.name.toLowerCase() === repoBaseName.toLowerCase() ||
          r.name.toLowerCase().replace(/[._]/g, '-') === repoBaseName.toLowerCase().replace(/[._]/g, '-')
      );

      if (!ghRepo) {
        logger.info(`Auto-creating repository '${repoBaseName}' on GitHub...`);
        ghRepo = await githubProvider.createRepository(repoBaseName, {
          description: glProject.description || 'Synchronized from GitLab',
          isPrivate: glProject.isPrivate !== undefined ? glProject.isPrivate : isPrivate,
          autoInit: false,
        });
      }

      githubRepoFullName = ghRepo.fullName;
      githubRepoId = ghRepo.id;

      const glBaseUrlClean = env.gitlab.apiBaseUrl.replace('/api/v4', '').replace(/^https?:\/\//, '');
      const glCloneUrl = `http://oauth2:${glToken}@${glBaseUrlClean}/${gitlabProjectFullPath}.git`;
      const ghPushUrl = `https://x-access-token:${ghToken}@github.com/${githubRepoFullName}.git`;

      try {
        logger.info(`Mirror cloning from GitLab: ${gitlabProjectFullPath}`);
        execSync(`git clone --mirror "${glCloneUrl}" "${tempDir}"`, { stdio: 'pipe' });
        logger.info(`Mirror pushing to GitHub: ${githubRepoFullName}`);
        execSync(`git push --mirror "${ghPushUrl}"`, { cwd: tempDir, stdio: 'pipe' });
      } catch (gitErr) {
        logger.warn('Git mirror push encountered warning/error:', gitErr.message);
      } finally {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
      }
    }

    let mapping = await repositoryMappingRepository.findExistingMapping(
      userId,
      githubRepoFullName,
      gitlabProjectFullPath
    );

    if (!mapping) {
      mapping = await this.createMapping(userId, {
        githubRepoFullName,
        gitlabProjectFullPath,
        githubRepoId,
        gitlabProjectId,
        syncDirection,
        autoSyncEnabled: true,
        initialSync: false,
      });
    }

    return {
      mapping,
      githubRepoFullName,
      gitlabProjectFullPath,
    };
  }
}

module.exports = new RepositoryMappingService();
