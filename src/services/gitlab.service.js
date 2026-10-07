const axios = require('axios');
const env = require('../config/env');
const gitlabAccountRepository = require('../repositories/gitlab-account.repository');
const providerFactory = require('../providers/provider.factory');
const GitLabProvider = require('../providers/gitlab.provider');
const { encrypt, decrypt } = require('../utils/crypto.util');
const { BadRequestError, NotFoundError } = require('../utils/response');
const logger = require('../utils/logger');

class GitLabService {
  /**
   * Get GitLab OAuth Authorization URL
   */
  getOAuthUrl(userId) {
    if (!env.gitlab.clientId) {
      throw new BadRequestError('GitLab OAuth Client ID is not configured in backend environment.');
    }

    const state = Buffer.from(JSON.stringify({ userId, timestamp: Date.now() })).toString('base64');
    const scope = encodeURIComponent('api read_user write_repository');
    const redirectUri = encodeURIComponent(env.gitlab.callbackUrl);

    return `https://gitlab.com/oauth/authorize?client_id=${env.gitlab.clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}`;
  }

  /**
   * Handle OAuth Callback from GitLab
   */
  async handleCallback(code, state) {
    if (!code) {
      throw new BadRequestError('Authorization code is missing from GitLab callback');
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
      'https://gitlab.com/oauth/token',
      {
        client_id: env.gitlab.clientId,
        client_secret: env.gitlab.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: env.gitlab.callbackUrl,
      },
      {
        headers: { Accept: 'application/json' },
      }
    );

    const tokenData = tokenRes.data;
    if (tokenData.error || !tokenData.access_token) {
      throw new BadRequestError(`GitLab OAuth exchange failed: ${tokenData.error_description || tokenData.error}`);
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;

    // 2. Fetch authenticated GitLab user details
    const tempProvider = new GitLabProvider(accessToken);
    const gitUser = await tempProvider.getUser();

    // 3. Upsert GitLabAccount in database
    let account = await gitlabAccountRepository.findByUserId(userId);
    const encryptedToken = encrypt(accessToken);
    const encryptedRefresh = refreshToken ? encrypt(refreshToken) : null;

    if (account) {
      account.gitlabId = gitUser.id;
      account.username = gitUser.username;
      account.displayName = gitUser.displayName;
      account.avatarUrl = gitUser.avatarUrl;
      account.profileUrl = gitUser.profileUrl;
      account.accessToken = encryptedToken;
      account.refreshToken = encryptedRefresh;
      account.projectCount = gitUser.publicRepos;
      account.isConnected = true;
      account.connectedAt = new Date();
    } else {
      account = gitlabAccountRepository.create({
        userId,
        gitlabId: gitUser.id,
        username: gitUser.username,
        displayName: gitUser.displayName,
        avatarUrl: gitUser.avatarUrl,
        profileUrl: gitUser.profileUrl,
        accessToken: encryptedToken,
        refreshToken: encryptedRefresh,
        projectCount: gitUser.publicRepos,
        isConnected: true,
        connectedAt: new Date(),
      });
    }

    await gitlabAccountRepository.save(account);
    return account;
  }

  /**
   * Connect GitLab account directly using Personal Access Token (PAT)
   */
  async connectWithToken(userId, token) {
    if (!token || !token.trim()) {
      throw new BadRequestError('GitLab Personal Access Token is required');
    }

    const trimmedToken = token.trim();
    const tempProvider = new GitLabProvider(trimmedToken);
    let gitUser;
    try {
      gitUser = await tempProvider.getUser();
    } catch (err) {
      throw new BadRequestError('Invalid GitLab Access Token. Please check token permissions (requires "api" scope).');
    }

    let account = await gitlabAccountRepository.findByUserId(userId);
    const encryptedToken = encrypt(trimmedToken);

    if (account) {
      account.gitlabId = gitUser.id;
      account.username = gitUser.username;
      account.displayName = gitUser.displayName;
      account.avatarUrl = gitUser.avatarUrl;
      account.profileUrl = gitUser.profileUrl;
      account.accessToken = encryptedToken;
      account.projectCount = gitUser.publicRepos;
      account.isConnected = true;
      account.connectedAt = new Date();
    } else {
      account = gitlabAccountRepository.create({
        userId,
        gitlabId: gitUser.id,
        username: gitUser.username,
        displayName: gitUser.displayName,
        avatarUrl: gitUser.avatarUrl,
        profileUrl: gitUser.profileUrl,
        accessToken: encryptedToken,
        projectCount: gitUser.publicRepos,
        isConnected: true,
        connectedAt: new Date(),
      });
    }

    await gitlabAccountRepository.save(account);

    return {
      connected: true,
      username: account.username,
      displayName: account.displayName,
      avatarUrl: account.avatarUrl,
      projectCount: account.projectCount,
      connectedAt: account.connectedAt,
    };
  }

  /**
   * Disconnect GitLab Account
   */
  async disconnect(userId) {
    const account = await gitlabAccountRepository.findByUserId(userId);
    if (!account) {
      return { connected: false };
    }

    account.isConnected = false;
    account.accessToken = encrypt('DISCONNECTED');
    await gitlabAccountRepository.save(account);

    return { connected: false, message: 'GitLab account disconnected successfully' };
  }

  /**
   * Get GitLab Connection Status
   */
  async getStatus(userId) {
    const account = await gitlabAccountRepository.findByUserId(userId);
    if (!account || !account.isConnected) {
      return {
        connected: false,
        username: null,
        displayName: null,
        avatarUrl: null,
        projectCount: 0,
        connectedAt: null,
      };
    }

    // Auto-correct previously stored quota limits (e.g. 100000) with actual project count
    if (account.projectCount >= 10000) {
      try {
        const provider = await providerFactory.getGitLabProvider(userId);
        const user = await provider.getUser();
        account.projectCount = user.publicRepos;
        await gitlabAccountRepository.save(account);
      } catch (err) {
        logger.warn('Failed to auto-refresh GitLab project count in getStatus:', err.message);
      }
    }

    return {
      connected: true,
      id: account.id,
      gitlabId: account.gitlabId,
      username: account.username,
      displayName: account.displayName,
      avatarUrl: account.avatarUrl,
      profileUrl: account.profileUrl,
      projectCount: account.projectCount,
      connectedAt: account.connectedAt,
    };
  }

  /**
   * Get list of repositories for connected GitLab user
   */
  async getRepositories(userId) {
    const provider = await providerFactory.getGitLabProvider(userId);
    return provider.getRepositories();
  }

  /**
   * Get branches of a project
   */
  async getBranches(userId, projectPathOrId) {
    const provider = await providerFactory.getGitLabProvider(userId);
    return provider.getBranches(projectPathOrId);
  }

  /**
   * Get commits of a project
   */
  async getCommits(userId, projectPathOrId, branch) {
    const provider = await providerFactory.getGitLabProvider(userId);
    return provider.getCommits(projectPathOrId, branch);
  }

  /**
   * Create repository
   */
  async createRepository(userId, { name, description, isPrivate }) {
    const provider = await providerFactory.getGitLabProvider(userId);
    return provider.createRepository(name, { description, isPrivate });
  }
}

module.exports = new GitLabService();
