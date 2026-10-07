const env = require('../config/env');
const { AppDataSource } = require('../config/database');

/**
 * Health Service
 * Handles business logic for server health and connectivity status
 */
class HealthService {
  /**
   * Get basic and operational health details
   * @returns {object}
   */
  getHealthStatus() {
    const isDbConnected = AppDataSource.isInitialized;

    return {
      environment: env.nodeEnv,
      status: 'UP',
      timestamp: new Date().toISOString(),
      uptime: `${Math.floor(process.uptime())}s`,
      database: isDbConnected ? 'connected' : 'disconnected',
    };
  }
}

module.exports = new HealthService();
