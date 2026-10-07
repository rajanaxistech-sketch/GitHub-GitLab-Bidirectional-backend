const providerFactory = require('../providers/provider.factory');
const repositoryMappingRepository = require('../repositories/repository-mapping.repository');
const syncJobRepository = require('../repositories/sync-job.repository');
const queueService = require('./queue.service');
const { ConflictError, BadRequestError, NotFoundError } = require('../utils/response');
const logger = require('../utils/logger');

class SyncEngineService {
  /**
   * Trigger synchronization for a mapping (Manual, Webhook, or Scheduled)
   * @param {string} mappingId
   * @param {Object} options
   */
  async triggerSync(mappingId, options = {}) {
    const mapping = await repositoryMappingRepository.findById(mappingId);
    if (!mapping) {
      throw new NotFoundError('Repository mapping not found');
    }

    if (mapping.syncStatus === 'DISABLED') {
      throw new BadRequestError('This repository mapping is disabled');
    }

    // Determine direction to execute
    let direction = options.direction || mapping.syncDirection; // 'github_to_gitlab' | 'gitlab_to_github' | 'bidirectional'
    const triggerType = options.triggerType || 'MANUAL';
    const sourcePlatform = options.sourcePlatform || (direction === 'gitlab_to_github' ? 'gitlab' : 'github');
    const destinationPlatform = options.destinationPlatform || (sourcePlatform === 'github' ? 'gitlab' : 'github');

    // Update mapping status to SYNCING
    mapping.syncStatus = 'SYNCING';
    mapping.lastSyncAttempt = new Date();
    await repositoryMappingRepository.save(mapping);

    // Enqueue job in background
    const job = await queueService.enqueue(
      {
        mappingId: mapping.id,
        userId: mapping.userId,
        direction,
        triggerType,
        sourcePlatform,
        destinationPlatform,
        sourceBranch: options.branch || 'main',
        targetBranch: options.branch || 'main',
        transactionId: options.transactionId || `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      },
      async (jobRecord, logFn) => {
        return this.executeSyncJob(mapping, jobRecord, logFn);
      }
    );

    return job;
  }

  /**
   * Execute sync operation inside background worker
   */
  async executeSyncJob(mapping, jobRecord, logFn) {
    const userId = mapping.userId;
    const direction = jobRecord.direction;
    const branch = jobRecord.sourceBranch || 'main';
    const txId = jobRecord.transactionId;

    await logFn('INFO', `Initializing providers for user ${userId}`);
    const githubProvider = await providerFactory.getGitHubProvider(userId);
    const gitlabProvider = await providerFactory.getGitLabProvider(userId);

    if (direction === 'bidirectional') {
      return this.handleBidirectionalSync(mapping, githubProvider, gitlabProvider, branch, txId, logFn);
    } else if (direction === 'github_to_gitlab') {
      return this.syncOneWay({
        sourceProvider: githubProvider,
        targetProvider: gitlabProvider,
        sourcePlatform: 'github',
        targetPlatform: 'gitlab',
        sourceOwner: mapping.githubOwner,
        sourceRepo: mapping.githubRepoName,
        targetRepoId: mapping.gitlabProjectId,
        branch,
        mapping,
        txId,
        logFn,
      });
    } else if (direction === 'gitlab_to_github') {
      return this.syncOneWay({
        sourceProvider: gitlabProvider,
        targetProvider: githubProvider,
        sourcePlatform: 'gitlab',
        targetPlatform: 'github',
        sourceOwner: mapping.gitlabNamespace,
        sourceRepo: mapping.gitlabProjectId,
        targetOwner: mapping.githubOwner,
        targetRepo: mapping.githubRepoName,
        branch,
        mapping,
        txId,
        logFn,
      });
    } else {
      throw new BadRequestError(`Unsupported sync direction: ${direction}`);
    }
  }

  /**
   * Perform One-Way Sync with loop prevention and file tree diffing
   */
  async syncOneWay({
    sourceProvider,
    targetProvider,
    sourcePlatform,
    targetPlatform,
    sourceOwner,
    sourceRepo,
    targetRepoId,
    targetOwner,
    targetRepo,
    branch,
    mapping,
    txId,
    logFn,
  }) {
    await logFn('INFO', `Checking source branch (${sourcePlatform}) '${branch}'`);

    // 1. Fetch source branch and commit
    const sourceBranch = await sourceProvider.getBranch(sourceOwner || sourceRepo, sourceRepo, branch);
    if (!sourceBranch) {
      throw new Error(`Branch '${branch}' not found on source repository (${sourcePlatform})`);
    }

    const sourceCommitSha = sourceBranch.commitSha;
    await logFn('INFO', `Source HEAD commit: ${sourceCommitSha}`);

    // 2. Loop prevention check
    const lastSyncedCommit = sourcePlatform === 'github' ? mapping.lastSyncedCommitGithub : mapping.lastSyncedCommitGitlab;
    if (lastSyncedCommit === sourceCommitSha) {
      await logFn('INFO', `Repository is already up to date. Latest source commit (${sourceCommitSha.substring(0, 8)}) was previously synchronized.`);
      
      mapping.syncStatus = 'SUCCESS';
      mapping.lastSuccessfulSync = new Date();
      mapping.lastSyncError = null;
      await repositoryMappingRepository.save(mapping);

      return {
        status: 'SUCCESS',
        sourceCommit: sourceCommitSha,
        targetCommit: sourcePlatform === 'github' ? mapping.lastSyncedCommitGitlab : mapping.lastSyncedCommitGithub,
        changesCount: 0,
        filesCount: 0,
        details: { message: 'Already up to date - no changes detected since last sync' },
      };
    }

    // 3. Fetch file trees from source and target
    await logFn('INFO', `Fetching file trees for comparison between ${sourcePlatform} and ${targetPlatform}`);
    const sourceTree = await sourceProvider.getFileTree(sourceOwner || sourceRepo, sourceRepo, branch);
    
    let targetTree = [];
    try {
      const targetIdentifier = targetPlatform === 'gitlab' ? targetRepoId : targetOwner;
      targetTree = await targetProvider.getFileTree(targetIdentifier, targetRepo || targetRepoId, branch);
    } catch {
      targetTree = [];
    }

    await logFn('INFO', `Found ${sourceTree.length} files in source, ${targetTree.length} files in destination`);

    // 4. Compute file changes / diff
    const sourceMap = new Map(sourceTree.map((f) => [f.path, f]));
    const targetMap = new Map(targetTree.map((f) => [f.path, f]));

    const actions = [];
    let addedCount = 0;
    let modifiedCount = 0;
    let deletedCount = 0;

    // Check for created or modified files
    for (const [filePath, sourceFile] of sourceMap.entries()) {
      const targetFile = targetMap.get(filePath);

      if (!targetFile) {
        // File exists in source but not target -> CREATE
        await logFn('DEBUG', `File to create in destination: ${filePath}`);
        const fileContent = await sourceProvider.getFileContent(sourceOwner || sourceRepo, sourceRepo, filePath, branch);
        actions.push({
          action: 'create',
          path: filePath,
          content: fileContent ? fileContent.content : '',
        });
        addedCount++;
      } else {
        // Compare SHA or content if target sha exists
        const fileContent = await sourceProvider.getFileContent(sourceOwner || sourceRepo, sourceRepo, filePath, branch);
        let targetContent = null;
        
        try {
          const targetIdentifier = targetPlatform === 'gitlab' ? targetRepoId : targetOwner;
          targetContent = await targetProvider.getFileContent(targetIdentifier, targetRepo || targetRepoId, filePath, branch);
        } catch {
          targetContent = null;
        }

        if (!targetContent || targetContent.content !== (fileContent ? fileContent.content : '')) {
          await logFn('DEBUG', `File updated: ${filePath}`);
          actions.push({
            action: 'update',
            path: filePath,
            content: fileContent ? fileContent.content : '',
          });
          modifiedCount++;
        }
      }
    }

    // Check for deleted files
    for (const [filePath] of targetMap.entries()) {
      if (!sourceMap.has(filePath)) {
        await logFn('DEBUG', `File deleted in source: ${filePath}`);
        actions.push({
          action: 'delete',
          path: filePath,
        });
        deletedCount++;
      }
    }

    const totalChanges = actions.length;
    await logFn('INFO', `Changes to apply: ${totalChanges} (${addedCount} added, ${modifiedCount} modified, ${deletedCount} deleted)`);

    if (totalChanges === 0) {
      await logFn('INFO', 'Source and destination repository contents are identical. Updating sync checkpoint.');

      mapping.syncStatus = 'SUCCESS';
      mapping.lastSuccessfulSync = new Date();
      if (sourcePlatform === 'github') {
        mapping.lastSyncedCommitGithub = sourceCommitSha;
      } else {
        mapping.lastSyncedCommitGitlab = sourceCommitSha;
      }
      mapping.lastSyncError = null;
      await repositoryMappingRepository.save(mapping);

      return {
        status: 'SUCCESS',
        sourceCommit: sourceCommitSha,
        changesCount: 0,
        filesCount: sourceTree.length,
        details: { message: 'Repositories are identical. Sync state updated.' },
      };
    }

    // 5. Apply changes to destination repository
    const commitMessage = `Sync: Update from ${sourcePlatform} (${branch})\n\n[sync-id: ${txId}]\nSource-Commit: ${sourceCommitSha}`;
    await logFn('INFO', `Committing ${totalChanges} changes to ${targetPlatform} with transaction ID: ${txId}`);

    let targetResult;
    if (targetPlatform === 'gitlab') {
      targetResult = await targetProvider.commitFiles(targetRepoId, branch, commitMessage, actions);
    } else {
      targetResult = await targetProvider.commitFiles(targetOwner, targetRepo, branch, commitMessage, actions);
    }

    const targetCommitSha = targetResult?.commitSha || 'unknown';
    await logFn('INFO', `Successfully committed changes to ${targetPlatform}. New target commit: ${targetCommitSha}`);

    // 6. Update mapping record
    mapping.syncStatus = 'SUCCESS';
    mapping.lastSuccessfulSync = new Date();
    mapping.lastSyncError = null;
    if (sourcePlatform === 'github') {
      mapping.lastSyncedCommitGithub = sourceCommitSha;
      mapping.lastSyncedCommitGitlab = targetCommitSha;
    } else {
      mapping.lastSyncedCommitGitlab = sourceCommitSha;
      mapping.lastSyncedCommitGithub = targetCommitSha;
    }

    await repositoryMappingRepository.save(mapping);

    return {
      status: 'SUCCESS',
      sourceCommit: sourceCommitSha,
      targetCommit: targetCommitSha,
      changesCount: totalChanges,
      filesCount: sourceTree.length,
      details: {
        added: addedCount,
        modified: modifiedCount,
        deleted: deletedCount,
        actions: actions.map((a) => ({ action: a.action, path: a.path })),
      },
    };
  }

  /**
   * Handle Bidirectional Sync with Conflict Detection
   */
  async handleBidirectionalSync(mapping, githubProvider, gitlabProvider, branch, txId, logFn) {
    await logFn('INFO', `Evaluating bidirectional synchronization for branch '${branch}'`);

    const githubBranch = await githubProvider.getBranch(mapping.githubOwner, mapping.githubRepoName, branch);
    const gitlabBranch = await gitlabProvider.getBranch(mapping.gitlabProjectId, branch);

    if (!githubBranch) {
      throw new Error(`Branch '${branch}' not found on GitHub repository`);
    }
    if (!gitlabBranch) {
      throw new Error(`Branch '${branch}' not found on GitLab project`);
    }

    const githubCommitSha = githubBranch.commitSha;
    const gitlabCommitSha = gitlabBranch.commitSha;

    await logFn('INFO', `GitHub HEAD commit: ${githubCommitSha.substring(0, 8)}, GitLab HEAD commit: ${gitlabCommitSha.substring(0, 8)}`);

    const githubChanged = mapping.lastSyncedCommitGithub !== githubCommitSha;
    const gitlabChanged = mapping.lastSyncedCommitGitlab !== gitlabCommitSha;

    // If neither side changed
    if (!githubChanged && !gitlabChanged) {
      await logFn('INFO', 'Both repositories are up to date. No changes detected on either platform.');
      
      mapping.syncStatus = 'SUCCESS';
      mapping.lastSuccessfulSync = new Date();
      mapping.lastSyncError = null;
      await repositoryMappingRepository.save(mapping);

      return {
        status: 'SUCCESS',
        sourceCommit: githubCommitSha,
        targetCommit: gitlabCommitSha,
        changesCount: 0,
        filesCount: 0,
        details: { message: 'Both repositories are in sync' },
      };
    }

    // If both sides have changed independently -> CONFLICT
    if (githubChanged && gitlabChanged && mapping.lastSyncedCommitGithub && mapping.lastSyncedCommitGitlab) {
      await logFn('WARN', 'Conflict detected: Both GitHub and GitLab have independent changes since last sync checkpoint.');

      mapping.syncStatus = 'CONFLICT';
      mapping.lastSyncError = `Conflict detected: Both GitHub (${githubCommitSha.substring(0, 8)}) and GitLab (${gitlabCommitSha.substring(0, 8)}) have independent changes since last sync point.`;
      await repositoryMappingRepository.save(mapping);

      const conflictError = new ConflictError(mapping.lastSyncError);
      conflictError.isConflict = true;
      conflictError.details = {
        githubCommit: githubCommitSha,
        gitlabCommit: gitlabCommitSha,
        lastSyncedGithub: mapping.lastSyncedCommitGithub,
        lastSyncedGitlab: mapping.lastSyncedCommitGitlab,
        suggestion: 'Choose either "GitHub → GitLab" or "GitLab → GitHub" to force resolution and establish a new baseline.',
      };
      throw conflictError;
    }

    // If only GitHub changed -> sync GitHub to GitLab
    if (githubChanged) {
      await logFn('INFO', 'New changes detected on GitHub. Synchronizing GitHub → GitLab.');
      return this.syncOneWay({
        sourceProvider: githubProvider,
        targetProvider: gitlabProvider,
        sourcePlatform: 'github',
        targetPlatform: 'gitlab',
        sourceOwner: mapping.githubOwner,
        sourceRepo: mapping.githubRepoName,
        targetRepoId: mapping.gitlabProjectId,
        branch,
        mapping,
        txId,
        logFn,
      });
    }

    // If only GitLab changed -> sync GitLab to GitHub
    if (gitlabChanged) {
      await logFn('INFO', 'New changes detected on GitLab. Synchronizing GitLab → GitHub.');
      return this.syncOneWay({
        sourceProvider: gitlabProvider,
        targetProvider: githubProvider,
        sourcePlatform: 'gitlab',
        targetPlatform: 'github',
        sourceOwner: mapping.gitlabNamespace,
        sourceRepo: mapping.gitlabProjectId,
        targetOwner: mapping.githubOwner,
        targetRepo: mapping.githubRepoName,
        branch,
        mapping,
        txId,
        logFn,
      });
    }

    return { status: 'SUCCESS', changesCount: 0 };
  }
}

module.exports = new SyncEngineService();
