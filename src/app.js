const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const env = require('./config/env');
const apiRoutes = require('./routes');
const notFoundMiddleware = require('./middlewares/not-found.middleware');
const errorMiddleware = require('./middlewares/error.middleware');

const app = express();

// Security Headers
app.use(helmet());

// Cross-Origin Resource Sharing
app.use(cors());

// Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request Logging
if (!env.isProduction) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Root welcome route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'GitHub-GitLab Bidirectional Sync Backend API is running',
    version: '1.0.0',
    endpoints: {
      health: '/api/v1/health',
      api: '/api/v1',
    },
  });
});

// Mount API Routes under /api/v1 prefix
app.use('/api/v1', apiRoutes);

// 404 Route Not Found Handler
app.use(notFoundMiddleware);

// Centralized Global Error Handler
app.use(errorMiddleware);

module.exports = app;
