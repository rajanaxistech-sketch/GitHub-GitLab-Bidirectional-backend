const env = require('../config/env');

const formatTime = () => new Date().toISOString();

const logger = {
  info: (message, meta = '') => {
    console.log(`[${formatTime()}] [INFO]: ${message}`, meta ? meta : '');
  },
  warn: (message, meta = '') => {
    console.warn(`[${formatTime()}] [WARN]: ${message}`, meta ? meta : '');
  },
  error: (message, error = '') => {
    if (error && error.stack && !env.isProduction) {
      console.error(`[${formatTime()}] [ERROR]: ${message}\n`, error.stack);
    } else {
      console.error(`[${formatTime()}] [ERROR]: ${message}`, error ? (error.message || error) : '');
    }
  },
  debug: (message, meta = '') => {
    if (env.isDevelopment) {
      console.debug(`[${formatTime()}] [DEBUG]: ${message}`, meta ? meta : '');
    }
  },
};

module.exports = logger;
