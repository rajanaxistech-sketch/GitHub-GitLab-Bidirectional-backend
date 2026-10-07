const BaseRepository = require('./base.repository');
const { WebhookEventEntity } = require('../entities');

class WebhookEventRepository extends BaseRepository {
  constructor() {
    super(WebhookEventEntity);
  }

  async findByEventId(eventId) {
    if (!eventId) return null;
    return this.findOne({ eventId });
  }

  async findUnprocessed() {
    return this.getRepository().find({
      where: { processed: false },
      order: { createdAt: 'ASC' },
      take: 20,
    });
  }
}

module.exports = new WebhookEventRepository();
