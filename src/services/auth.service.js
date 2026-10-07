const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const userRepository = require('../repositories/user.repository');
const { BadRequestError, UnauthorizedError, ConflictError, NotFoundError } = require('../utils/response');

class AuthService {
  /**
   * Generate JWT Token
   */
  generateToken(user) {
    return jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      env.jwt.secret,
      { expiresIn: env.jwt.expiresIn }
    );
  }

  /**
   * Register a new user
   */
  async register({ name, email, password }) {
    if (!name || !email || !password) {
      throw new BadRequestError('Name, email, and password are required');
    }

    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      throw new ConflictError('User with this email address already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = userRepository.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: 'user',
    });

    const savedUser = await userRepository.save(newUser);
    const token = this.generateToken(savedUser);

    return {
      token,
      user: {
        id: savedUser.id,
        name: savedUser.name,
        email: savedUser.email,
        role: savedUser.role,
        createdAt: savedUser.createdAt,
      },
    };
  }

  /**
   * Log in an existing user
   */
  async login({ email, password }) {
    if (!email || !password) {
      throw new BadRequestError('Email and password are required');
    }

    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const token = this.generateToken(user);

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    };
  }

  /**
   * Get user profile with connection accounts info
   */
  async getProfile(userId) {
    const user = await userRepository.findWithAccounts(userId);
    if (!user) {
      throw new NotFoundError('User profile not found');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      githubConnected: Boolean(user.githubAccount && user.githubAccount.isConnected),
      gitlabConnected: Boolean(user.gitlabAccount && user.gitlabAccount.isConnected),
      githubAccount: user.githubAccount ? {
        username: user.githubAccount.username,
        displayName: user.githubAccount.displayName,
        avatarUrl: user.githubAccount.avatarUrl,
        repoCount: user.githubAccount.repoCount,
        connectedAt: user.githubAccount.connectedAt,
        isConnected: user.githubAccount.isConnected,
      } : null,
      gitlabAccount: user.gitlabAccount ? {
        username: user.gitlabAccount.username,
        displayName: user.gitlabAccount.displayName,
        avatarUrl: user.gitlabAccount.avatarUrl,
        projectCount: user.gitlabAccount.projectCount,
        connectedAt: user.gitlabAccount.connectedAt,
        isConnected: user.gitlabAccount.isConnected,
      } : null,
    };
  }
}

module.exports = new AuthService();
