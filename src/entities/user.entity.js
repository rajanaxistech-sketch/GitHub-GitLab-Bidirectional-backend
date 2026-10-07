const { EntitySchema } = require('typeorm');

const UserEntity = new EntitySchema({
  name: 'User',
  tableName: 'users',
  columns: {
    id: {
      primary: true,
      type: 'uuid',
      generated: 'uuid',
    },
    name: {
      type: 'varchar',
      length: 150,
      nullable: false,
    },
    email: {
      type: 'varchar',
      length: 255,
      unique: true,
      nullable: false,
    },
    password: {
      type: 'varchar',
      length: 255,
      nullable: false,
    },
    role: {
      type: 'varchar',
      length: 50,
      default: 'user',
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
    githubAccount: {
      target: 'GitHubAccount',
      type: 'one-to-one',
      inverseSide: 'user',
      cascade: true,
    },
    gitlabAccount: {
      target: 'GitLabAccount',
      type: 'one-to-one',
      inverseSide: 'user',
      cascade: true,
    },
    repositoryMappings: {
      target: 'RepositoryMapping',
      type: 'one-to-many',
      inverseSide: 'user',
      cascade: true,
    },
  },
});

module.exports = UserEntity;
