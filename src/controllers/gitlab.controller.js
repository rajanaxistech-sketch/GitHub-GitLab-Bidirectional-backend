const gitlabService = require('../services/gitlab.service');
const { sendSuccess } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');
const env = require('../config/env');

class GitLabController {
  async getConnectUrl(req, res) {
    const url = gitlabService.getOAuthUrl(req.user.id);
    return sendSuccess(res, 'GitLab OAuth URL generated', { url });
  }

  async handleCallback(req, res) {
    const { code, state } = req.query;
    try {
      await gitlabService.handleCallback(code, state);
      return res.redirect(`${env.clientUrl}/accounts?status=gitlab_connected`);
    } catch (error) {
      return res.redirect(`${env.clientUrl}/accounts?error=${encodeURIComponent(error.message)}`);
    }
  }

  async connectWithToken(req, res) {
    const { token } = req.body;
    const result = await gitlabService.connectWithToken(req.user.id, token);
    return sendSuccess(res, 'GitLab connected successfully', result);
  }

  async getStatus(req, res) {
    const status = await gitlabService.getStatus(req.user.id);
    return sendSuccess(res, 'GitLab status retrieved', status);
  }

  async getRepositories(req, res) {
    const repos = await gitlabService.getRepositories(req.user.id);
    return sendSuccess(res, 'GitLab repositories retrieved', repos);
  }

  async getBranches(req, res) {
    const { projectId } = req.params;
    const branches = await gitlabService.getBranches(req.user.id, projectId);
    return sendSuccess(res, 'GitLab branches retrieved', branches);
  }

  async createRepository(req, res) {
    const newRepo = await gitlabService.createRepository(req.user.id, req.body);
    return sendSuccess(res, 'GitLab project created successfully', newRepo, HTTP_STATUS.CREATED);
  }

  async disconnect(req, res) {
    const result = await gitlabService.disconnect(req.user.id);
    return sendSuccess(res, 'GitLab account disconnected', result);
  }
}

module.exports = new GitLabController();
