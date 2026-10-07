const { EntitySchema } = require('typeorm');

const RepositoryMappingEntity = new EntitySchema({
  name: 'RepositoryMapping',
  tableName: 'repository_mappings',
  columns: {
    id: {
      primary: true,
      type: 'uuid',
      generated: 'uuid',
    },
    userId: {
      type: 'uuid',
      nullable: false,
    },
    githubAccountId: {
      type: 'uuid',
      nullable: true,
    },
    gitlabAccountId: {
      type: 'uuid',
      nullable: true,
    },
    githubRepoId: {
      type: 'varchar',
      length: 100,
      nullable: false,
    },
    githubOwner: {
      type: 'varchar',
      length: 150,
      nullable: false,
    },
    githubRepoName: {
      type: 'varchar',
      length: 150,
      nullable: false,
    },
    githubRepoFullName: {
      type: 'varchar',
      length: 300,
      nullable: false,
    },
    gitlabProjectId: {
      type: 'varchar',
      length: 100,
      nullable: false,
    },
    gitlabNamespace: {
      type: 'varchar',
      length: 150,
      nullable: false,
    },
    gitlabProjectName: {
      type: 'varchar',
      length: 150,
      nullable: false,
    },
    gitlabProjectFullPath: {
      type: 'varchar',
      length: 300,
      nullable: false,
    },
    syncDirection: {
      type: 'varchar',
      length: 50,
      default: 'bidirectional', // 'github_to_gitlab' | 'gitlab_to_github' | 'bidirectional'
    },
    autoSyncEnabled: {
      type: 'boolean',
      default: true,
    },
    syncStatus: {
      type: 'varchar',
      length: 50,
      default: 'IDLE', // 'IDLE' | 'SYNCING' | 'SUCCESS' | 'FAILED' | 'CONFLICT' | 'DISABLED'
    },
    lastSuccessfulSync: {
      type: 'timestamp with time zone',
      nullable: true,
    },
    lastSyncAttempt: {
      type: 'timestamp with time zone',
      nullable: true,
    },
    lastSyncError: {
      type: 'text',
      nullable: true,
    },
    lastSyncedCommitGithub: {
      type: 'varchar',
      length: 100,
      nullable: true,
    },
    lastSyncedCommitGitlab: {
      type: 'varchar',
      length: 100,
      nullable: true,
    },
    webhookGithubId: {
      type: 'varchar',
      length: 100,
      nullable: true,
    },
    webhookGitlabId: {
      type: 'varchar',
      length: 100,
      nullable: true,
    },
    webhookSecret: {
      type: 'varchar',
      length: 255,
      nullable: true,
    },
    createdAt: {
      type: 'timestamp with time zone',
      createDate: true,
    },
    updatedAt: {
      type: 'timestamp with time zone',
      updateDate: true,
    },
  },
  uniques: [
    {
      name: 'UQ_USER_GITHUB_GITLAB_MAPPING',
      columns: ['userId', 'githubRepoFullName', 'gitlabProjectFullPath'],
    },
  ],
  indices: [
    {
      name: 'IDX_MAPPING_USER_ID',
      columns: ['userId'],
    },
    {
      name: 'IDX_MAPPING_GITHUB_REPO',
      columns: ['githubRepoFullName'],
    },
    {
      name: 'IDX_MAPPING_GITLAB_PROJECT',
      columns: ['gitlabProjectFullPath'],
    },
  ],
  relations: {
    user: {
      target: 'User',
      type: 'many-to-one',
      joinColumn: { name: 'userId' },
      onDelete: 'CASCADE',
    },
    syncJobs: {
      target: 'SyncJob',
      type: 'one-to-many',
      inverseSide: 'mapping',
      cascade: true,
    },
  },
});

module.exports = RepositoryMappingEntity;
