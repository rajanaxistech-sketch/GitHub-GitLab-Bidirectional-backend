const { EntitySchema } = require('typeorm');

const WebhookEventEntity = new EntitySchema({
  name: 'WebhookEvent',
  tableName: 'webhook_events',
  columns: {
    id: {
      primary: true,
      type: 'uuid',
      generated: 'uuid',
    },
    platform: {
      type: 'varchar',
      length: 50,
      nullable: false, // 'github' | 'gitlab'
    },
    eventType: {
      type: 'varchar',
      length: 100,
      nullable: false,
    },
    eventId: {
      type: 'varchar',
      length: 255,
      nullable: true,
    },
    repositoryId: {
      type: 'varchar',
      length: 255,
      nullable: true,
    },
    payload: {
      type: 'simple-json',
      nullable: true,
    },
    processed: {
      type: 'boolean',
      default: false,
    },
    status: {
      type: 'varchar',
      length: 50,
      default: 'PENDING', // 'PENDING' | 'PROCESSED' | 'SKIPPED' | 'FAILED'
    },
    errorMessage: {
      type: 'text',
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
      name: 'IDX_WEBHOOK_EVENT_PLATFORM',
      columns: ['platform'],
    },
    {
      name: 'IDX_WEBHOOK_EVENT_STATUS',
      columns: ['status'],
    },
    {
      name: 'IDX_WEBHOOK_EVENT_EVENT_ID',
      columns: ['eventId'],
    },
  ],
});

module.exports = WebhookEventEntity;
