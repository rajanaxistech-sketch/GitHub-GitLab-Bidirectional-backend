const { HTTP_STATUS, SUCCESS_MESSAGES, ERROR_MESSAGES } = require('../constants');

/**
 * Standard Success Response Formatter
 * @param {import('express').Response} res
 * @param {string} [message]
 * @param {any} [data]
 * @param {number} [statusCode]
 */
const sendSuccess = (res, message = SUCCESS_MESSAGES.OPERATION_SUCCESS, data = {}, statusCode = HTTP_STATUS.OK) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

/**
 * Standard Error Response Formatter
 * @param {import('express').Response} res
 * @param {string} [message]
 * @param {Array|any} [errors]
 * @param {number} [statusCode]
 */
const sendError = (res, message = ERROR_MESSAGES.INTERNAL_SERVER_ERROR, errors = [], statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR) => {
  const errorArray = Array.isArray(errors) ? errors : [errors].filter(Boolean);
  return res.status(statusCode).json({
    success: false,
    message,
    errors: errorArray,
  });
};

/**
 * Base Application Error
 */
class AppError extends Error {
  constructor(message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, errors = []) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errors = Array.isArray(errors) ? errors : [errors].filter(Boolean);
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad Request', errors = []) {
    super(message, HTTP_STATUS.BAD_REQUEST, errors);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = ERROR_MESSAGES.UNAUTHORIZED, errors = []) {
    super(message, HTTP_STATUS.UNAUTHORIZED, errors);
  }
}

class ForbiddenError extends AppError {
  constructor(message = ERROR_MESSAGES.FORBIDDEN, errors = []) {
    super(message, HTTP_STATUS.FORBIDDEN, errors);
  }
}

class NotFoundError extends AppError {
  constructor(message = ERROR_MESSAGES.NOT_FOUND, errors = []) {
    super(message, HTTP_STATUS.NOT_FOUND, errors);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflict occurred', errors = []) {
    super(message, HTTP_STATUS.CONFLICT, errors);
  }
}

class InternalServerError extends AppError {
  constructor(message = ERROR_MESSAGES.INTERNAL_SERVER_ERROR, errors = []) {
    super(message, HTTP_STATUS.INTERNAL_SERVER_ERROR, errors);
  }
}

module.exports = {
  sendSuccess,
  sendError,
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  InternalServerError,
};
