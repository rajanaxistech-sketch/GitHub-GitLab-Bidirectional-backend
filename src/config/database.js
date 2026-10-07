require('reflect-metadata');
const { DataSource } = require('typeorm');
const env = require('./env');
const logger = require('../utils/logger');
const entities = require('../entities');

const entityList = Object.values(entities);

const AppDataSource = new DataSource({
  type: 'postgres',
  host: env.db.host,
  port: env.db.port,
  username: env.db.username,
  password: env.db.password,
  database: env.db.database,
  synchronize: env.db.synchronize, // Auto synchronize schema in dev
  logging: env.isDevelopment ? ['error', 'warn'] : ['error'],
  entities: entityList,
  migrations: [],
  subscribers: [],
});

/**
 * Initialize PostgreSQL connection via TypeORM
 */
const initializeDatabase = async () => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      logger.info(`PostgreSQL Database connected successfully [${env.db.host}:${env.db.port}/${env.db.database}]`);
    }
    return AppDataSource;
  } catch (error) {
    logger.error('Failed to connect to PostgreSQL database:', error);
    throw error;
  }
};

/**
 * Close PostgreSQL connection
 */
const closeDatabase = async () => {
  try {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
      logger.info('PostgreSQL Database connection closed cleanly.');
    }
  } catch (error) {
    logger.error('Error closing PostgreSQL database connection:', error);
  }
};

module.exports = {
  AppDataSource,
  initializeDatabase,
  closeDatabase,
};
