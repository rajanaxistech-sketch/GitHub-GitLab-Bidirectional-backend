const BaseRepository = require('./base.repository');
const { UserEntity } = require('../entities');

class UserRepository extends BaseRepository {
  constructor() {
    super(UserEntity);
  }

  async findByEmail(email) {
    return this.findOne({ email: email.toLowerCase().trim() });
  }

  async findWithAccounts(userId) {
    return this.getRepository().findOne({
      where: { id: userId },
      relations: ['githubAccount', 'gitlabAccount'],
    });
  }
}

module.exports = new UserRepository();
