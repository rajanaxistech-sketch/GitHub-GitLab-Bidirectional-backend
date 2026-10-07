const authService = require('../services/auth.service');
const { sendSuccess } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

class AuthController {
  async register(req, res) {
    const result = await authService.register(req.body);
    return sendSuccess(res, 'User registered successfully', result, HTTP_STATUS.CREATED);
  }

  async login(req, res) {
    const result = await authService.login(req.body);
    return sendSuccess(res, 'Login successful', result, HTTP_STATUS.OK);
  }

  async getProfile(req, res) {
    const profile = await authService.getProfile(req.user.id);
    return sendSuccess(res, 'Profile retrieved successfully', profile, HTTP_STATUS.OK);
  }

  async logout(req, res) {
    return sendSuccess(res, 'Logged out successfully', null, HTTP_STATUS.OK);
  }
}

module.exports = new AuthController();
