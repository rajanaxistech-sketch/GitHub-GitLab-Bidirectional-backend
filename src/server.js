const app = require('./app');
const env = require('./config/env');
const { initializeDatabase, closeDatabase } = require('./config/database');
const logger = require('./utils/logger');

let server;

const startServer = async () => {
  try {
    // 1. Initialize Database Connection via TypeORM
    logger.info('Initializing PostgreSQL connection via TypeORM...');
    try {
      await initializeDatabase();
    } catch (dbError) {
      logger.error('Warning: Database connection failed on startup. Server will continue running.', dbError);
      // In development or CI, we allow the server to start even if DB is offline, but log clearly
      if (env.isProduction) {
        throw dbError;
      }
    }

    // 2. Start HTTP Server
    server = app.listen(env.port, () => {
      logger.info(`Server running in ${env.nodeEnv} mode on http://localhost:${env.port}`);
      logger.info(`Health check available at http://localhost:${env.port}/api/v1/health`);
    });
  } catch (error) {
    logger.error('Fatal error occurred during server startup:', error);
    process.exit(1);
  }
};

// Graceful Shutdown Handler
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);

  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed.');
      await closeDatabase();
      process.exit(0);
    });

    // Force exit if shutdown takes too long
    setTimeout(() => {
      logger.error('Forced shutdown due to timeout.');
      process.exit(1);
    }, 10000);
  } else {
    await closeDatabase();
    process.exit(0);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the server
startServer();
