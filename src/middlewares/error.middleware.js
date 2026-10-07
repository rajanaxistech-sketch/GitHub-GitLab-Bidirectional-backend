const env = require('../config/env');
const logger = require('../utils/logger');
const { HTTP_STATUS, ERROR_MESSAGES } = require('../constants');
const { sendError, AppError } = require('../utils/response');

/**
 * Centralized Global Error Handler Middleware
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const errorMiddleware = (err, req, res, next) => {
  let statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  let message = err.message || ERROR_MESSAGES.INTERNAL_SERVER_ERROR;
  let errors = err.errors || [];

  // Log error details
  logger.error(`[${req.method}] ${req.originalUrl} - ${err.message}`, err);

  // 1. Handle JSON Parsing Syntax Errors (e.g. malformed body)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = HTTP_STATUS.BAD_REQUEST;
    message = 'Invalid JSON payload received';
    errors = [err.message];
  }

  // 2. Handle TypeORM / PostgreSQL Database Errors
  if (err.name === 'QueryFailedError') {
    statusCode = HTTP_STATUS.BAD_REQUEST;

    // PostgreSQL error codes
    switch (err.code) {
      case '23505': // Unique violation
        statusCode = HTTP_STATUS.CONFLICT;
        message = 'A record with duplicate unique field already exists';
        errors = [err.detail || 'Unique constraint violation'];
        break;
      case '23503': // Foreign key violation
        message = 'Foreign key constraint violated';
        errors = [err.detail || 'Referenced record does not exist or is in use'];
        break;
      case '23502': // Not null violation
        message = 'Missing required field';
        errors = [err.column ? `Field '${err.column}' cannot be null` : 'Not null constraint violation'];
        break;
      case '22P02': // Invalid text representation (e.g. invalid UUID / integer)
        message = 'Invalid data format provided for query';
        errors = [err.message];
        break;
      default:
        message = env.isProduction ? ERROR_MESSAGES.DATABASE_ERROR : err.message;
        errors = env.isProduction ? [] : [err.detail || err.message];
    }
  }

  // 3. Handle JWT Authentication Errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = HTTP_STATUS.UNAUTHORIZED;
    message = 'Invalid token provided';
    errors = ['Token verification failed'];
  } else if (err.name === 'TokenExpiredError') {
    statusCode = HTTP_STATUS.UNAUTHORIZED;
    message = 'Token has expired';
    errors = ['Please re-authenticate'];
  }

  // 4. Handle Custom AppError Operational Errors
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors;
  }

  // 5. Hide internal stack/server details in production for unhandled internal errors
  if (env.isProduction && statusCode === HTTP_STATUS.INTERNAL_SERVER_ERROR) {
    message = ERROR_MESSAGES.INTERNAL_SERVER_ERROR;
    errors = [];
  }

  return sendError(res, message, errors, statusCode);
};

module.exports = errorMiddleware;
