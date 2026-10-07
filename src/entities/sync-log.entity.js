const { EntitySchema } = require('typeorm');

const SyncLogEntity = new EntitySchema({
  name: 'SyncLog',
  tableName: 'sync_logs',
  columns: {
    id: {
      primary: true,
      type: 'uuid',
      generated: 'uuid',
    },
    jobId: {
      type: 'uuid',
      nullable: false,
    },
    mappingId: {
      type: 'uuid',
      nullable: true,
    },
    userId: {
      type: 'uuid',
      nullable: true,
    },
    level: {
      type: 'varchar',
      length: 20,
      default: 'INFO', // 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'
    },
    message: {
      type: 'text',
      nullable: false,
    },
    metadata: {
      type: 'simple-json',
      nullable: true,
    },
    timestamp: {
      type: 'timestamp with time zone',
      default: () => 'CURRENT_TIMESTAMP',
    },
    createdAt: {
      type: 'timestamp with time zone',
      createDate: true,
    },
  },
  indices: [
    {
      name: 'IDX_SYNC_LOG_JOB_ID',
      columns: ['jobId'],
    },
    {
      name: 'IDX_SYNC_LOG_MAPPING_ID',
      columns: ['mappingId'],
    },
  ],
  relations: {
    job: {
      target: 'SyncJob',
      type: 'many-to-one',
      joinColumn: { name: 'jobId' },
      onDelete: 'CASCADE',
    },
  },
});

module.exports = SyncLogEntity;
