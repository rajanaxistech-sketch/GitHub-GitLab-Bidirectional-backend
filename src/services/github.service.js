const axios = require('axios');
const env = require('../config/env');
const githubAccountRepository = require('../repositories/github-account.repository');
const providerFactory = require('../providers/provider.factory');
const GitHubProvider = require('../providers/github.provider');
const { encrypt, decrypt, maskToken } = require('../utils/crypto.util');
const { BadRequestError, NotFoundError } = require('../utils/response');
const logger = require('../utils/logger');

class GitHubService {
  /**
   * Get GitHub OAuth Authorization URL
   */
  getOAuthUrl(userId) {
    if (!env.github.clientId) {
      throw new BadRequestError('GitHub OAuth Client ID is not configured in backend environment.');
    }

    const state = Buffer.from(JSON.stringify({ userId, timestamp: Date.now() })).toString('base64');
    const scope = encodeURIComponent('repo,user,admin:repo_hook');
    const redirectUri = encodeURIComponent(env.github.callbackUrl);

    return `https://github.com/login/oauth/authorize?client_id=${env.github.clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
  }

  /**
   * Handle OAuth Callback from GitHub
   */
  async handleCallback(code, state) {
    if (!code) {
      throw new BadRequestError('Authorization code is missing from GitHub callback');
    }

    let userId;
    try {
      const decodedState = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
      userId = decodedState.userId;
    } catch {
      throw new BadRequestError('Invalid or expired OAuth state parameter');
    }

    // 1. Exchange code for access token
    const tokenRes = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: env.github.clientId,
        client_secret: env.github.clientSecret,
        code,
        redirect_uri: env.github.callbackUrl,
      },
      {
        headers: { Accept: 'application/json' },
      }
    );

    const tokenData = tokenRes.data;
    if (tokenData.error || !tokenData.access_token) {
      throw new BadRequestError(`GitHub OAuth exchange failed: ${tokenData.error_description || tokenData.error}`);
    }

    const accessToken = tokenData.access_token;
    const scopes = tokenData.scope || 'repo,user';

    // 2. Fetch authenticated GitHub user details
    const tempProvider = new GitHubProvider(accessToken);
    const gitUser = await tempProvider.getUser();

    // 3. Upsert GitHubAccount in database
    let account = await githubAccountRepository.findByUserId(userId);
    const encryptedToken = encrypt(accessToken);

    if (account) {
      account.githubId = gitUser.id;
      account.username = gitUser.username;
      account.displayName = gitUser.displayName;
      account.avatarUrl = gitUser.avatarUrl;
      account.profileUrl = gitUser.profileUrl;
      account.accessToken = encryptedToken;
      account.scopes = scopes;
      account.repoCount = gitUser.publicRepos;
      account.isConnected = true;
      account.connectedAt = new Date();
    } else {
      account = githubAccountRepository.create({
        userId,
        githubId: gitUser.id,
        username: gitUser.username,
        displayName: gitUser.displayName,
        avatarUrl: gitUser.avatarUrl,
        profileUrl: gitUser.profileUrl,
        accessToken: encryptedToken,
        scopes,
        repoCount: gitUser.publicRepos,
        isConnected: true,
        connectedAt: new Date(),
      });
    }

    await githubAccountRepository.save(account);
    return account;
  }

  /**
   * Connect GitHub account directly using Personal Access Token (PAT)
   */
  async connectWithToken(userId, token) {
    if (!token || !token.trim()) {
      throw new BadRequestError('GitHub Personal Access Token is required');
    }

    const trimmedToken = token.trim();
    const tempProvider = new GitHubProvider(trimmedToken);
    let gitUser;
    try {
      gitUser = await tempProvider.getUser();
    } catch (err) {
      throw new BadRequestError('Invalid GitHub Access Token. Please check token permissions (requires "repo" scope).');
    }

    let account = await githubAccountRepository.findByUserId(userId);
    const encryptedToken = encrypt(trimmedToken);

    if (account) {
      account.githubId = gitUser.id;
      account.username = gitUser.username;
      account.displayName = gitUser.displayName;
      account.avatarUrl = gitUser.avatarUrl;
      account.profileUrl = gitUser.profileUrl;
      account.accessToken = encryptedToken;
      account.scopes = 'repo,user';
      account.repoCount = gitUser.publicRepos;
      account.isConnected = true;
      account.connectedAt = new Date();
    } else {
      account = githubAccountRepository.create({
        userId,
        githubId: gitUser.id,
        username: gitUser.username,
        displayName: gitUser.displayName,
        avatarUrl: gitUser.avatarUrl,
        profileUrl: gitUser.profileUrl,
        accessToken: encryptedToken,
        scopes: 'repo,user',
        repoCount: gitUser.publicRepos,
        isConnected: true,
        connectedAt: new Date(),
      });
    }

    await githubAccountRepository.save(account);

    return {
      connected: true,
      username: account.username,
      displayName: account.displayName,
      avatarUrl: account.avatarUrl,
      repoCount: account.repoCount,
      connectedAt: account.connectedAt,
    };
  }

  /**
   * Disconnect GitHub Account
   */
  async disconnect(userId) {
    const account = await githubAccountRepository.findByUserId(userId);
    if (!account) {
      return { connected: false };
    }

    account.isConnected = false;
    account.accessToken = encrypt('DISCONNECTED');
    await githubAccountRepository.save(account);

    return { connected: false, message: 'GitHub account disconnected successfully' };
  }

  /**
   * Get GitHub Connection Status
   */
  async getStatus(userId) {
    const account = await githubAccountRepository.findByUserId(userId);
    if (!account || !account.isConnected) {
      return {
        connected: false,
        username: null,
        displayName: null,
        avatarUrl: null,
        repoCount: 0,
        connectedAt: null,
      };
    }

    return {
      connected: true,
      id: account.id,
      githubId: account.githubId,
      username: account.username,
      displayName: account.displayName,
      avatarUrl: account.avatarUrl,
      profileUrl: account.profileUrl,
      repoCount: account.repoCount,
      connectedAt: account.connectedAt,
    };
  }

  /**
   * Get list of repositories for connected GitHub user
   */
  async getRepositories(userId, options = {}) {
    const provider = await providerFactory.getGitHubProvider(userId);
    return provider.getRepositories(options);
  }

  /**
   * Get branches of a repository
   */
  async getBranches(userId, owner, repo) {
    const provider = await providerFactory.getGitHubProvider(userId);
    return provider.getBranches(owner, repo);
  }

  /**
   * Get commits of a repository
   */
  async getCommits(userId, owner, repo, branch) {
    const provider = await providerFactory.getGitHubProvider(userId);
    return provider.getCommits(owner, repo, branch);
  }

  /**
   * Create repository
   */
  async createRepository(userId, { name, description, isPrivate }) {
    const provider = await providerFactory.getGitHubProvider(userId);
    return provider.createRepository(name, { description, isPrivate });
  }
}

module.exports = new GitHubService();
