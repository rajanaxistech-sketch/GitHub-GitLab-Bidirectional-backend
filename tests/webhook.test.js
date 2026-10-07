const webhookService = require('../src/services/webhook.service');
const webhookEventRepository = require('../src/repositories/webhook-event.repository');
const repositoryMappingRepository = require('../src/repositories/repository-mapping.repository');

describe('Webhook Service & Loop Prevention', () => {
  it('should ignore self-generated commits to prevent infinite loops (GitHub)', async () => {
    jest.spyOn(webhookEventRepository, 'findByEventId').mockResolvedValue(null);
    jest.spyOn(webhookEventRepository, 'create').mockImplementation((data) => data);
    jest.spyOn(webhookEventRepository, 'save').mockImplementation(async (data) => data);

    const headers = {
      'x-github-event': 'push',
      'x-github-delivery': 'del_test_123',
    };

    const body = {
      repository: { full_name: 'testowner/testrepo' },
      commits: [
        {
          id: 'c123',
          message: 'Sync: Update from gitlab (main)\n\n[sync-id: tx_9999] by GitSync',
        },
      ],
    };

    const result = await webhookService.processGitHubWebhook(headers, body);
    expect(result.status).toBe('SKIPPED');
    expect(result.message).toContain('Self-sync commit ignored');
  });

  it('should handle ping event gracefully', async () => {
    const headers = { 'x-github-event': 'ping' };
    const body = { zen: 'Keep it logically awesome.' };

    const result = await webhookService.processGitHubWebhook(headers, body);
    expect(result.status).toBe('OK');
  });

  it('should skip duplicate webhook deliveries', async () => {
    jest.spyOn(webhookEventRepository, 'findByEventId').mockResolvedValue({ id: 'existing-event' });

    const headers = {
      'x-github-event': 'push',
      'x-github-delivery': 'already_processed_id',
    };

    const result = await webhookService.processGitHubWebhook(headers, {});
    expect(result.status).toBe('SKIPPED');
    expect(result.message).toContain('already processed');
  });
});
