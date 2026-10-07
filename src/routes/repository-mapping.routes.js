const { Router } = require('express');
const repositoryMappingController = require('../controllers/repository-mapping.controller');
const asyncHandler = require('../middlewares/async.middleware');
const { authenticate } = require('../middlewares/auth.middleware');

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(repositoryMappingController.getMappings.bind(repositoryMappingController)));
router.post('/', asyncHandler(repositoryMappingController.createMapping.bind(repositoryMappingController)));
router.get('/:id', asyncHandler(repositoryMappingController.getMappingById.bind(repositoryMappingController)));
router.put('/:id', asyncHandler(repositoryMappingController.updateMapping.bind(repositoryMappingController)));
router.delete('/:id', asyncHandler(repositoryMappingController.deleteMapping.bind(repositoryMappingController)));

module.exports = router;
