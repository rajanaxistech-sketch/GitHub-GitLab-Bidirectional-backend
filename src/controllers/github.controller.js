const githubService = require('../services/github.service');
const { sendSuccess } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');
const env = require('../config/env');

class GitHubController {
  async getConnectUrl(req, res) {
    const url = githubService.getOAuthUrl(req.user.id);
    return sendSuccess(res, 'GitHub OAuth URL generated', { url });
  }

  async handleCallback(req, res) {
    const { code, state } = req.query;
    try {
      await githubService.handleCallback(code, state);
      return res.redirect(`${env.clientUrl}/accounts?status=github_connected`);
    } catch (error) {
      return res.redirect(`${env.clientUrl}/accounts?error=${encodeURIComponent(error.message)}`);
    }
  }

  async connectWithToken(req, res) {
    const { token } = req.body;
    const result = await githubService.connectWithToken(req.user.id, token);
    return sendSuccess(res, 'GitHub connected successfully', result);
  }

  async getStatus(req, res) {
    const status = await githubService.getStatus(req.user.id);
    return sendSuccess(res, 'GitHub status retrieved', status);
  }

  async getRepositories(req, res) {
    const repos = await githubService.getRepositories(req.user.id);
    return sendSuccess(res, 'GitHub repositories retrieved', repos);
  }

  async getBranches(req, res) {
    const { owner, repo } = req.params;
    const branches = await githubService.getBranches(req.user.id, owner, repo);
    return sendSuccess(res, 'GitHub branches retrieved', branches);
  }

  async createRepository(req, res) {
    const newRepo = await githubService.createRepository(req.user.id, req.body);
    return sendSuccess(res, 'GitHub repository created successfully', newRepo, HTTP_STATUS.CREATED);
  }

  async disconnect(req, res) {
    const result = await githubService.disconnect(req.user.id);
    return sendSuccess(res, 'GitHub account disconnected', result);
  }
}

module.exports = new GitHubController();
