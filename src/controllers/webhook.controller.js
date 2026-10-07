const webhookService = require('../services/webhook.service');
const { sendSuccess } = require('../utils/response');

class WebhookController {
  async handleGitHubWebhook(req, res) {
    const result = await webhookService.processGitHubWebhook(req.headers, req.body);
    return sendSuccess(res, 'GitHub webhook processed', result);
  }

  async handleGitLabWebhook(req, res) {
    const result = await webhookService.processGitLabWebhook(req.headers, req.body);
    return sendSuccess(res, 'GitLab webhook processed', result);
  }
}

module.exports = new WebhookController();
