const jwt = require('jsonwebtoken');
const env = require('../config/env');
const userRepository = require('../repositories/user.repository');
const { UnauthorizedError } = require('../utils/response');

/**
 * Authentication Middleware: Protects routes and populates req.user
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authentication token is missing');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedError('Authentication token is missing');
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.jwt.secret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Token has expired');
      }
      throw new UnauthorizedError('Invalid authentication token');
    }

    const user = await userRepository.findById(decoded.id);
    if (!user) {
      throw new UnauthorizedError('User account not found');
    }

    req.user = user;
    req.userId = user.id;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Optional Authentication Middleware
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      if (token) {
        try {
          const decoded = jwt.verify(token, env.jwt.secret);
          const user = await userRepository.findById(decoded.id);
          if (user) {
            req.user = user;
            req.userId = user.id;
          }
        } catch {
          // Ignore token failure for optional auth
        }
      }
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  authenticate,
  optionalAuth,
};
