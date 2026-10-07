const webhookEventRepository = require('../repositories/webhook-event.repository');
const repositoryMappingRepository = require('../repositories/repository-mapping.repository');
const syncEngineService = require('./sync-engine.service');
const GitHubProvider = require('../providers/github.provider');
const GitLabProvider = require('../providers/gitlab.provider');
const env = require('../config/env');
const logger = require('../utils/logger');

class WebhookService {
  /**
   * Process GitHub Webhook Event
   */
  async processGitHubWebhook(headers, body) {
    const eventType = headers['x-github-event'] || 'unknown';
    const deliveryId = headers['x-github-delivery'] || `gh_${Date.now()}`;

    // Handle Ping event immediately
    if (eventType === 'ping') {
      return { status: 'OK', message: 'GitHub ping received' };
    }

    // 1. Idempotency Check
    const existingEvent = await webhookEventRepository.findByEventId(deliveryId);
    if (existingEvent) {
      return { status: 'SKIPPED', message: 'Event already processed' };
    }

    // 2. Validate Signature if secret is configured
    const tempProvider = new GitHubProvider('temp');
    const isValidSignature = tempProvider.validateWebhookSignature(headers, body, env.webhook.secret);
    if (env.webhook.secret && !isValidSignature && env.isProduction) {
      logger.warn('GitHub webhook signature validation failed');
      return { status: 'REJECTED', message: 'Invalid webhook signature' };
    }

    // 3. Extract repository details
    const repoFullName = body.repository?.full_name;
    if (!repoFullName) {
      return { status: 'SKIPPED', message: 'No repository specified in payload' };
    }

    const eventRecord = webhookEventRepository.create({
      platform: 'github',
      eventType,
      eventId: deliveryId,
      repositoryId: repoFullName,
      payload: body,
      processed: false,
      status: 'PENDING',
    });
    const savedEvent = await webhookEventRepository.save(eventRecord);

    if (eventType !== 'push') {
      savedEvent.status = 'SKIPPED';
      savedEvent.processed = true;
      await webhookEventRepository.save(savedEvent);
      return { status: 'SKIPPED', message: `Ignored event type: ${eventType}` };
    }

    // 4. Check for Loop Prevention (self-generated sync commit)
    const commits = body.commits || [];
    const headCommit = body.head_commit;
    const isSelfSync = commits.some(
      (c) => c.message && (c.message.includes('[sync-id:') || c.message.includes('by GitSync'))
    );

    if (isSelfSync) {
      logger.info(`Loop Prevention: Skipped GitHub push for ${repoFullName} because it contains sync engine signature.`);
      savedEvent.status = 'SKIPPED';
      savedEvent.processed = true;
      savedEvent.errorMessage = 'Self-generated synchronization commit - skipped to prevent loop';
      await webhookEventRepository.save(savedEvent);
      return { status: 'SKIPPED', message: 'Self-sync commit ignored to prevent loop' };
    }

    // 5. Find all active mappings for this GitHub repo
    const mappings = await repositoryMappingRepository.findByGithubRepo(repoFullName);
    const activeMappings = mappings.filter((m) => m.autoSyncEnabled && m.syncStatus !== 'DISABLED');

    if (activeMappings.length === 0) {
      savedEvent.status = 'SKIPPED';
      savedEvent.processed = true;
      savedEvent.errorMessage = 'No active mapping found with auto-sync enabled';
      await webhookEventRepository.save(savedEvent);
      return { status: 'SKIPPED', message: 'No active mappings configured for auto-sync' };
    }

    // Extract branch name (e.g. 'refs/heads/main' -> 'main')
    const ref = body.ref || 'refs/heads/main';
    const branch = ref.replace('refs/heads/', '');

    // 6. Trigger sync for matching mappings
    for (const mapping of activeMappings) {
      // Check direction compatibility
      if (mapping.syncDirection === 'gitlab_to_github') {
        continue; // Direction doesn't sync GitHub -> GitLab
      }

      const commitSha = headCommit?.id || body.after;
      
      // If the commit matches last synced commit, skip to avoid double processing
      if (mapping.lastSyncedCommitGithub === commitSha) {
        continue;
      }

      await syncEngineService.triggerSync(mapping.id, {
        triggerType: 'WEBHOOK',
        sourcePlatform: 'github',
        destinationPlatform: 'gitlab',
        direction: 'github_to_gitlab',
        branch,
      });
    }

    savedEvent.status = 'PROCESSED';
    savedEvent.processed = true;
    await webhookEventRepository.save(savedEvent);

    return { status: 'PROCESSED', message: `Queued sync for ${activeMappings.length} mappings` };
  }

  /**
   * Process GitLab Webhook Event
   */
  async processGitLabWebhook(headers, body) {
    const eventType = headers['x-gitlab-event'] || body.object_kind || 'unknown';
    const deliveryId = `gl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 1. Validate Token
    const tempProvider = new GitLabProvider('temp');
    const isValidToken = tempProvider.validateWebhookSignature(headers, body, env.webhook.secret);
    if (env.webhook.secret && !isValidToken && env.isProduction) {
      logger.warn('GitLab webhook token validation failed');
      return { status: 'REJECTED', message: 'Invalid webhook token' };
    }

    const projectFullPath = body.project?.path_with_namespace;
    if (!projectFullPath) {
      return { status: 'SKIPPED', message: 'No project path in payload' };
    }

    const eventRecord = webhookEventRepository.create({
      platform: 'gitlab',
      eventType,
      eventId: deliveryId,
      repositoryId: projectFullPath,
      payload: body,
      processed: false,
      status: 'PENDING',
    });
    const savedEvent = await webhookEventRepository.save(eventRecord);

    if (body.object_kind !== 'push') {
      savedEvent.status = 'SKIPPED';
      savedEvent.processed = true;
      await webhookEventRepository.save(savedEvent);
      return { status: 'SKIPPED', message: `Ignored event kind: ${body.object_kind}` };
    }

    // 2. Loop Prevention Check
    const commits = body.commits || [];
    const isSelfSync = commits.some(
      (c) => c.message && (c.message.includes('[sync-id:') || c.message.includes('by GitSync'))
    );

    if (isSelfSync) {
      logger.info(`Loop Prevention: Skipped GitLab push for ${projectFullPath} because it contains sync engine signature.`);
      savedEvent.status = 'SKIPPED';
      savedEvent.processed = true;
      savedEvent.errorMessage = 'Self-generated synchronization commit - skipped to prevent loop';
      await webhookEventRepository.save(savedEvent);
      return { status: 'SKIPPED', message: 'Self-sync commit ignored to prevent loop' };
    }

    // 3. Find active mappings for this GitLab project
    const mappings = await repositoryMappingRepository.findByGitlabProject(projectFullPath);
    const activeMappings = mappings.filter((m) => m.autoSyncEnabled && m.syncStatus !== 'DISABLED');

    if (activeMappings.length === 0) {
      savedEvent.status = 'SKIPPED';
      savedEvent.processed = true;
      savedEvent.errorMessage = 'No active mapping found with auto-sync enabled';
      await webhookEventRepository.save(savedEvent);
      return { status: 'SKIPPED', message: 'No active mappings configured for auto-sync' };
    }

    const ref = body.ref || 'refs/heads/main';
    const branch = ref.replace('refs/heads/', '');
    const commitSha = body.after || (commits.length > 0 ? commits[commits.length - 1].id : null);

    // 4. Trigger sync for matching mappings
    for (const mapping of activeMappings) {
      if (mapping.syncDirection === 'github_to_gitlab') {
        continue;
      }

      if (mapping.lastSyncedCommitGitlab === commitSha) {
        continue;
      }

      await syncEngineService.triggerSync(mapping.id, {
        triggerType: 'WEBHOOK',
        sourcePlatform: 'gitlab',
        destinationPlatform: 'github',
        direction: 'gitlab_to_github',
        branch,
      });
    }

    savedEvent.status = 'PROCESSED';
    savedEvent.processed = true;
    await webhookEventRepository.save(savedEvent);

    return { status: 'PROCESSED', message: `Queued sync for ${activeMappings.length} mappings` };
  }
}

module.exports = new WebhookService();
