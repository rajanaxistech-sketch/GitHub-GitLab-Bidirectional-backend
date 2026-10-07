const UserEntity = require('./user.entity');
const GitHubAccountEntity = require('./github-account.entity');
const GitLabAccountEntity = require('./gitlab-account.entity');
const RepositoryMappingEntity = require('./repository-mapping.entity');
const SyncJobEntity = require('./sync-job.entity');
const SyncLogEntity = require('./sync-log.entity');
const WebhookEventEntity = require('./webhook-event.entity');

module.exports = {
  UserEntity,
  GitHubAccountEntity,
  GitLabAccountEntity,
  RepositoryMappingEntity,
  SyncJobEntity,
  SyncLogEntity,
  WebhookEventEntity,
};
