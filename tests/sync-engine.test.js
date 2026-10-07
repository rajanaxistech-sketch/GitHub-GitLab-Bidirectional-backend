const syncEngineService = require('../src/services/sync-engine.service');

describe('Sync Engine Service Logic', () => {
  it('should detect when repositories are already up to date (Loop Prevention)', async () => {
    const mockSourceProvider = {
      getBranch: jest.fn().mockResolvedValue({ name: 'main', commitSha: 'commit_abc123' }),
    };
    const mockTargetProvider = {};

    const mockMapping = {
      id: 'mapping-1',
      lastSyncedCommitGithub: 'commit_abc123',
      syncStatus: 'SYNCING',
      save: jest.fn(),
    };

    const logFn = jest.fn();

    // Mock repositoryMappingRepository
    const repositoryMappingRepository = require('../src/repositories/repository-mapping.repository');
    jest.spyOn(repositoryMappingRepository, 'save').mockResolvedValue(mockMapping);

    const result = await syncEngineService.syncOneWay({
      sourceProvider: mockSourceProvider,
      targetProvider: mockTargetProvider,
      sourcePlatform: 'github',
      targetPlatform: 'gitlab',
      sourceOwner: 'testowner',
      sourceRepo: 'testrepo',
      targetRepoId: '12345',
      branch: 'main',
      mapping: mockMapping,
      txId: 'tx_test_1',
      logFn,
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.changesCount).toBe(0);
    expect(result.sourceCommit).toBe('commit_abc123');
    expect(logFn).toHaveBeenCalledWith(
      'INFO',
      expect.stringContaining('already up to date')
    );
  });

  it('should compute added, modified, and deleted files diff accurately', async () => {
    const mockSourceProvider = {
      getBranch: jest.fn().mockResolvedValue({ name: 'main', commitSha: 'commit_new_456' }),
      getFileTree: jest.fn().mockResolvedValue([
        { path: 'README.md', sha: 'sha1' },
        { path: 'src/index.js', sha: 'sha2_modified' },
        { path: 'src/new-feature.js', sha: 'sha3_new' },
      ]),
      getFileContent: jest.fn().mockImplementation((owner, repo, path) => {
        return { path, content: `content for ${path}` };
      }),
    };

    const mockTargetProvider = {
      getFileTree: jest.fn().mockResolvedValue([
        { path: 'README.md', sha: 'sha1' },
        { path: 'src/index.js', sha: 'sha2_old' },
        { path: 'old-deprecated.js', sha: 'sha4_old' },
      ]),
      getFileContent: jest.fn().mockImplementation((proj, repo, path) => {
        if (path === 'README.md') return { content: 'content for README.md' };
        if (path === 'src/index.js') return { content: 'old index content' };
        return { content: 'old content' };
      }),
      commitFiles: jest.fn().mockResolvedValue({
        commitSha: 'commit_gitlab_target_789',
      }),
    };

    const mockMapping = {
      id: 'mapping-2',
      lastSyncedCommitGithub: 'commit_old_111',
      lastSyncedCommitGitlab: 'commit_old_222',
      syncStatus: 'SYNCING',
    };

    const logFn = jest.fn();
    const repositoryMappingRepository = require('../src/repositories/repository-mapping.repository');
    jest.spyOn(repositoryMappingRepository, 'save').mockResolvedValue(mockMapping);

    const result = await syncEngineService.syncOneWay({
      sourceProvider: mockSourceProvider,
      targetProvider: mockTargetProvider,
      sourcePlatform: 'github',
      targetPlatform: 'gitlab',
      sourceOwner: 'testowner',
      sourceRepo: 'testrepo',
      targetRepoId: '12345',
      branch: 'main',
      mapping: mockMapping,
      txId: 'tx_test_2',
      logFn,
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.changesCount).toBe(3); // 1 added, 1 modified, 1 deleted
    expect(result.details.added).toBe(1);
    expect(result.details.modified).toBe(1);
    expect(result.details.deleted).toBe(1);
    expect(mockTargetProvider.commitFiles).toHaveBeenCalled();
  });

  it('should detect conflicts in bidirectional mode when both sides have diverged', async () => {
    const mockGithubProvider = {
      getBranch: jest.fn().mockResolvedValue({ name: 'main', commitSha: 'gh_diverged_commit' }),
    };
    const mockGitlabProvider = {
      getBranch: jest.fn().mockResolvedValue({ name: 'main', commitSha: 'gl_diverged_commit' }),
    };

    const mockMapping = {
      id: 'mapping-3',
      githubOwner: 'gh-owner',
      githubRepoName: 'gh-repo',
      gitlabProjectId: '123',
      lastSyncedCommitGithub: 'gh_base_commit',
      lastSyncedCommitGitlab: 'gl_base_commit',
      syncStatus: 'SYNCING',
    };

    const logFn = jest.fn();
    const repositoryMappingRepository = require('../src/repositories/repository-mapping.repository');
    jest.spyOn(repositoryMappingRepository, 'save').mockResolvedValue(mockMapping);

    await expect(
      syncEngineService.handleBidirectionalSync(
        mockMapping,
        mockGithubProvider,
        mockGitlabProvider,
        'main',
        'tx_test_3',
        logFn
      )
    ).rejects.toThrow('Conflict detected');

    expect(mockMapping.syncStatus).toBe('CONFLICT');
  });
});
