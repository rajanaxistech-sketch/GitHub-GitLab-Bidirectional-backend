const repositoryMappingService = require('../services/repository-mapping.service');
const { sendSuccess } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

class RepositoryMappingController {
  async createMapping(req, res) {
    const result = await repositoryMappingService.createMapping(req.user.id, req.body);
    return sendSuccess(res, 'Repository mapping created successfully', result, HTTP_STATUS.CREATED);
  }

  async getMappings(req, res) {
    const mappings = await repositoryMappingService.getMappings(req.user.id);
    return sendSuccess(res, 'Repository mappings retrieved successfully', mappings);
  }

  async getMappingById(req, res) {
    const mapping = await repositoryMappingService.getMappingById(req.user.id, req.params.id);
    return sendSuccess(res, 'Repository mapping retrieved successfully', mapping);
  }

  async updateMapping(req, res) {
    const updated = await repositoryMappingService.updateMapping(req.user.id, req.params.id, req.body);
    return sendSuccess(res, 'Repository mapping updated successfully', updated);
  }

  async deleteMapping(req, res) {
    const result = await repositoryMappingService.deleteMapping(req.user.id, req.params.id);
    return sendSuccess(res, 'Repository mapping deleted successfully', result);
  }
}

module.exports = new RepositoryMappingController();
