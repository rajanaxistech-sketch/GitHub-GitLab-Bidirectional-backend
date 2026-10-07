const { AppDataSource } = require('../config/database');

/**
 * Base Repository providing common database access patterns
 */
class BaseRepository {
  /**
   * @param {any} entityTarget - TypeORM Entity or EntitySchema
   */
  constructor(entityTarget) {
    this.entityTarget = entityTarget;
  }

  /**
   * Get underlying TypeORM Repository instance
   * @returns {import('typeorm').Repository<any>}
   */
  getRepository() {
    return AppDataSource.getRepository(this.entityTarget);
  }

  /**
   * Get TypeORM QueryBuilder instance
   * @param {string} [alias]
   */
  createQueryBuilder(alias = 'entity') {
    return this.getRepository().createQueryBuilder(alias);
  }

  /**
   * Find all records matching criteria
   * @param {object} [options]
   */
  async findAll(options = {}) {
    return this.getRepository().find(options);
  }

  /**
   * Find single record by ID
   * @param {string|number} id
   * @param {object} [options]
   */
  async findById(id, options = {}) {
    return this.getRepository().findOne({
      where: { id },
      ...options,
    });
  }

  /**
   * Find single record matching conditions
   * @param {object} conditions
   * @param {object} [options]
   */
  async findOne(conditions, options = {}) {
    return this.getRepository().findOne({
      where: conditions,
      ...options,
    });
  }

  /**
   * Create a new entity instance (not saved yet)
   * @param {object} data
   */
  create(data) {
    return this.getRepository().create(data);
  }

  /**
   * Save entity to database
   * @param {object} entity
   */
  async save(entity) {
    return this.getRepository().save(entity);
  }

  /**
   * Update records matching criteria
   * @param {string|number|object} criteria
   * @param {object} data
   */
  async update(criteria, data) {
    return this.getRepository().update(criteria, data);
  }

  /**
   * Delete records matching criteria
   * @param {string|number|object} criteria
   */
  async delete(criteria) {
    return this.getRepository().delete(criteria);
  }

  /**
   * Count records matching options
   * @param {object} [options]
   */
  async count(options = {}) {
    return this.getRepository().count(options);
  }
}

module.exports = BaseRepository;
