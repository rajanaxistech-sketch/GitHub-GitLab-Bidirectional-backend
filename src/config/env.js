const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV === 'development' || !process.env.NODE_ENV,
  port: parseInt(process.env.PORT, 10) || 5000,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'postgres',
    synchronize: process.env.DB_SYNCHRONIZE === 'true' || process.env.NODE_ENV !== 'production',
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'default_dev_secret_key_change_in_production_12345',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  encryptionKey: process.env.ENCRYPTION_KEY || 'default_32_bytes_super_secure_key_1234567890',

  github: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    callbackUrl: process.env.GITHUB_CALLBACK_URL || 'http://localhost:5000/api/v1/github/callback',
    apiBaseUrl: process.env.GITHUB_API_URL || 'https://api.github.com',
  },

  gitlab: {
    clientId: process.env.GITLAB_CLIENT_ID || '',
    clientSecret: process.env.GITLAB_CLIENT_SECRET || '',
    callbackUrl: process.env.GITLAB_CALLBACK_URL || 'http://localhost:5000/api/v1/gitlab/callback',
    apiBaseUrl: process.env.GITLAB_API_URL || 'https://gitlab.com/api/v4',
  },

  webhook: {
    baseUrl: process.env.WEBHOOK_BASE_URL || 'http://localhost:5000/api/v1/webhooks',
    secret: process.env.WEBHOOK_SECRET || 'super_secret_webhook_verification_token',
  },
};

module.exports = env;
