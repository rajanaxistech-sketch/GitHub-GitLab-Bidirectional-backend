const { EntitySchema } = require('typeorm');

const GitHubAccountEntity = new EntitySchema({
  name: 'GitHubAccount',
  tableName: 'github_accounts',
  columns: {
    id: {
      primary: true,
      type: 'uuid',
      generated: 'uuid',
    },
    userId: {
      type: 'uuid',
      unique: true,
      nullable: false,
    },
    githubId: {
      type: 'varchar',
      length: 100,
      nullable: true,
    },
    username: {
      type: 'varchar',
      length: 150,
      nullable: false,
    },
    displayName: {
      type: 'varchar',
      length: 200,
      nullable: true,
    },
    avatarUrl: {
      type: 'varchar',
      length: 500,
      nullable: true,
    },
    profileUrl: {
      type: 'varchar',
      length: 500,
      nullable: true,
    },
    accessToken: {
      type: 'text',
      nullable: false, // Stored encrypted
    },
    refreshToken: {
      type: 'text',
      nullable: true, // Stored encrypted
    },
    scopes: {
      type: 'varchar',
      length: 255,
      nullable: true,
    },
    tokenExpiresAt: {
      type: 'timestamp with time zone',
      nullable: true,
    },
    repoCount: {
      type: 'int',
      default: 0,
    },
    isConnected: {
      type: 'boolean',
      default: true,
    },
    connectedAt: {
      type: 'timestamp with time zone',
      default: () => 'CURRENT_TIMESTAMP',
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
  relations: {
    user: {
      target: 'User',
      type: 'one-to-one',
      joinColumn: { name: 'userId' },
      onDelete: 'CASCADE',
    },
  },
});

module.exports = GitHubAccountEntity;
