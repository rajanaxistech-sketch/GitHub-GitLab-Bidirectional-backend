const { NotFoundError } = require('../utils/response');

/**
 * 404 Route Not Found Middleware
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const notFoundMiddleware = (req, res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
};

module.exports = notFoundMiddleware;
