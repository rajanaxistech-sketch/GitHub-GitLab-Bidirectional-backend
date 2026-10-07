const { Router } = require('express');
const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const githubRoutes = require('./github.routes');
const gitlabRoutes = require('./gitlab.routes');
const repositoryMappingRoutes = require('./repository-mapping.routes');
const syncRoutes = require('./sync.routes');
const webhookRoutes = require('./webhook.routes');

const apiRouter = Router();

// Mount sub-routes
apiRouter.use('/health', healthRoutes);
apiRouter.use('/auth', authRoutes);
apiRouter.use('/github', githubRoutes);
apiRouter.use('/gitlab', gitlabRoutes);
apiRouter.use('/repositories/mappings', repositoryMappingRoutes);
apiRouter.use('/mappings', repositoryMappingRoutes); // alias for convenience
apiRouter.use('/sync', syncRoutes);
apiRouter.use('/webhooks', webhookRoutes);

module.exports = apiRouter;
