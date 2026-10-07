const healthService = require('../services/health.service');
const { sendSuccess } = require('../utils/response');
const { SUCCESS_MESSAGES, HTTP_STATUS } = require('../constants');
const asyncHandler = require('../middlewares/async.middleware');

/**
 * Health Controller
 */
class HealthController {
  /**
   * Health check endpoint
   * GET /api/v1/health
   */
  checkHealth = asyncHandler(async (req, res) => {
    const healthData = healthService.getHealthStatus();
    return sendSuccess(res, SUCCESS_MESSAGES.HEALTH_CHECK, healthData, HTTP_STATUS.OK);
  });
}

module.exports = new HealthController();
