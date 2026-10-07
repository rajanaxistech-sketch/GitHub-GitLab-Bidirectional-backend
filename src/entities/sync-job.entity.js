const { EntitySchema } = require('typeorm');

const SyncJobEntity = new EntitySchema({
  name: 'SyncJob',
  tableName: 'sync_jobs',
  columns: {
    id: {
      primary: true,
      type: 'uuid',
      generated: 'uuid',
    },
    mappingId: {
      type: 'uuid',
      nullable: false,
    },
    userId: {
      type: 'uuid',
      nullable: false,
    },
    direction: {
      type: 'varchar',
      length: 50,
      nullable: false,
    },
    triggerType: {
      type: 'varchar',
      length: 50,
      default: 'MANUAL', // 'MANUAL' | 'WEBHOOK' | 'SCHEDULED'
    },
    status: {
      type: 'varchar',
      length: 50,
      default: 'PENDING', // 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CONFLICT'
    },
    sourcePlatform: {
      type: 'varchar',
      length: 50,
      nullable: true,
    },
    destinationPlatform: {
      type: 'varchar',
      length: 50,
      nullable: true,
    },
    sourceBranch: {
      type: 'varchar',
      length: 150,
      nullable: true,
    },
    targetBranch: {
      type: 'varchar',
      length: 150,
      nullable: true,
    },
    sourceCommit: {
      type: 'varchar',
      length: 100,
      nullable: true,
    },
    targetCommit: {
      type: 'varchar',
      length: 100,
      nullable: true,
    },
    changesCount: {
      type: 'int',
      default: 0,
    },
    filesCount: {
      type: 'int',
      default: 0,
    },
    details: {
      type: 'simple-json',
      nullable: true,
    },
    errorMessage: {
      type: 'text',
      nullable: true,
    },
    transactionId: {
      type: 'varchar',
      length: 100,
      nullable: true,
    },
    startedAt: {
      type: 'timestamp with time zone',
      nullable: true,
    },
    completedAt: {
      type: 'timestamp with time zone',
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
  indices: [
    {
      name: 'IDX_SYNC_JOB_MAPPING_ID',
      columns: ['mappingId'],
    },
    {
      name: 'IDX_SYNC_JOB_USER_ID',
      columns: ['userId'],
    },
    {
      name: 'IDX_SYNC_JOB_STATUS',
      columns: ['status'],
    },
  ],
  relations: {
    mapping: {
      target: 'RepositoryMapping',
      type: 'many-to-one',
      joinColumn: { name: 'mappingId' },
      onDelete: 'CASCADE',
    },
    logs: {
      target: 'SyncLog',
      type: 'one-to-many',
      inverseSide: 'job',
      cascade: true,
    },
  },
});

module.exports = SyncJobEntity;
